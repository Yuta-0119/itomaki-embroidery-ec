/* =============================================================
   いとまき — 刺繍ミシン用フォーマット書き出し
     - PES v1（ブラザー 刺しゅうPRO / PE-Design で開いて編集できる形式。
       CEmbOne + CSewSeg のオブジェクトブロック + PECステッチブロックを含む）
     - DST（タジマ形式。業務用ミシン・刺繍業者への入稿で最も汎用）

   バイナリ仕様は pyembroidery (MIT License, EmbroidePy) の
   PesWriter / PecWriter / DstWriter を忠実に移植したもの。
   入力は stitchPlan.js の compile() が生成する plan オブジェクト。
   座標単位 0.1mm・Y軸下向き・デザイン中心が原点。
   ============================================================= */
(function(root){
  'use strict';
  const IT = root.IT = root.IT || {};

  const CMD = { STITCH: 0, JUMP: 1, TRIM: 2, END: 4, COLOR_CHANGE: 5 };

  // -------------------------------------------------------------
  // 可変長バイトライタ
  // -------------------------------------------------------------
  function Writer(){
    this.buf = [];
  }
  Writer.prototype = {
    tell(){ return this.buf.length; },
    u8(v){ this.buf.push(v & 0xFF); },
    bytes(arr){ for (const v of arr) this.buf.push(v & 0xFF); },
    u16le(v){ this.buf.push(v & 0xFF, (v >> 8) & 0xFF); },
    i16le(v){ this.u16le(v < 0 ? v + 0x10000 : v); },
    u24le(v){ this.buf.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF); },
    u32le(v){ this.buf.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF); },
    f32le(v){
      const dv = new DataView(new ArrayBuffer(4));
      dv.setFloat32(0, v, true);
      this.buf.push(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    },
    str(s){ for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i) & 0xFF); },
    patchU32le(pos, v){
      this.buf[pos] = v & 0xFF; this.buf[pos+1] = (v >> 8) & 0xFF;
      this.buf[pos+2] = (v >> 16) & 0xFF; this.buf[pos+3] = (v >>> 24) & 0xFF;
    },
    patchU24le(pos, v){
      this.buf[pos] = v & 0xFF; this.buf[pos+1] = (v >> 8) & 0xFF; this.buf[pos+2] = (v >> 16) & 0xFF;
    },
    patchU16le(pos, v){
      this.buf[pos] = v & 0xFF; this.buf[pos+1] = (v >> 8) & 0xFF;
    },
    toBytes(){ return new Uint8Array(this.buf); },
  };

  const pad = (n, width) => String(n).padStart(width, ' ');

  // -------------------------------------------------------------
  // ブラザー(PEC) 64色パレット — pyembroidery EmbThreadPec.py より
  // index 0 は欠番（未使用）
  // -------------------------------------------------------------
  const BROTHER = [
    null,
    [14,31,124,'Prussian Blue'],[10,85,163,'Blue'],[0,135,119,'Teal Green'],
    [75,107,175,'Cornflower Blue'],[237,23,31,'Red'],[209,92,0,'Reddish Brown'],
    [145,54,151,'Magenta'],[228,154,203,'Light Lilac'],[145,95,172,'Lilac'],
    [158,214,125,'Mint Green'],[232,169,0,'Deep Gold'],[254,186,53,'Orange'],
    [255,255,0,'Yellow'],[112,188,31,'Lime Green'],[186,152,0,'Brass'],
    [168,168,168,'Silver'],[125,111,0,'Russet Brown'],[255,255,179,'Cream Brown'],
    [79,85,86,'Pewter'],[0,0,0,'Black'],[11,61,145,'Ultramarine'],
    [119,1,118,'Royal Purple'],[41,49,51,'Dark Gray'],[42,19,1,'Dark Brown'],
    [246,74,138,'Deep Rose'],[178,118,36,'Light Brown'],[252,187,197,'Salmon Pink'],
    [254,55,15,'Vermilion'],[240,240,240,'White'],[106,28,138,'Violet'],
    [168,221,196,'Seacrest'],[37,132,187,'Sky Blue'],[254,179,67,'Pumpkin'],
    [255,243,107,'Cream Yellow'],[208,166,96,'Khaki'],[209,84,0,'Clay Brown'],
    [102,186,73,'Leaf Green'],[19,74,70,'Peacock Blue'],[135,135,135,'Gray'],
    [216,204,198,'Warm Gray'],[67,86,7,'Dark Olive'],[253,217,222,'Flesh Pink'],
    [249,147,188,'Pink'],[0,56,34,'Deep Green'],[178,175,212,'Lavender'],
    [104,106,176,'Wisteria Violet'],[239,227,185,'Beige'],[247,56,102,'Carmine'],
    [181,75,100,'Amber Red'],[19,43,26,'Olive Green'],[199,1,86,'Dark Fuchsia'],
    [254,158,50,'Tangerine'],[168,222,235,'Light Blue'],[0,103,62,'Emerald Green'],
    [78,41,144,'Purple'],[47,126,32,'Moss Green'],[255,204,204,'Flesh Pink'],
    [255,217,17,'Harvest Gold'],[9,91,166,'Electric Blue'],[240,249,112,'Lemon Yellow'],
    [227,243,91,'Fresh Green'],[255,153,0,'Orange'],[255,240,141,'Cream Yellow'],
    [255,200,200,'Applique'],
  ];

  // redmean 色距離（pyembroidery と同一の整数演算）
  function redmean(r1, g1, b1, r2, g2, b2){
    const rm = Math.round((r1 + r2) / 2);
    const r = r1 - r2, g = g1 - g2, b = b1 - b2;
    return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * b * b) >> 8);
  }

  function nearestIn(palette, r, g, b){
    let idx = null, best = Infinity;
    for (let i = 0; i < palette.length; i++){
      const t = palette[i];
      if (!t) continue;
      const d = redmean(r, g, b, t[0], t[1], t[2]);
      if (d <= best){ best = d; idx = i; }
    }
    return idx;
  }

  /**
   * build_unique_palette の移植:
   * 使う糸ごとにブラザーパレットの近似色を「重複なし」で割当て、
   * 各ブロックのパレット番号リストを返す
   */
  function buildUniquePalette(blocks){
    const palette = BROTHER.map(t => t ? t.slice() : null);
    const chart = new Array(BROTHER.length).fill(null);
    const seen = new Set();
    for (const bl of blocks){
      const k = bl.hex;
      if (seen.has(k)) continue;
      seen.add(k);
      const idx = nearestIn(palette, bl.r, bl.g, bl.b);
      if (idx === null) break;
      chart[idx] = [bl.r, bl.g, bl.b, BROTHER[idx][3]];
      palette[idx] = null;   // 同じ番号は再利用しない
    }
    return blocks.map(bl => nearestIn(chart, bl.r, bl.g, bl.b));
  }

  /** ブロックごとのブラザー糸番号・色名（仕様書表示用にも公開） */
  function pecColors(blocks){
    const idxList = buildUniquePalette(blocks);
    return idxList.map(i => ({ index: i, name: BROTHER[i] ? BROTHER[i][3] : '?', rgb: BROTHER[i] }));
  }

  function bounds(sequence){
    let minX = 0, minY = 0, maxX = 0, maxY = 0, first = true;
    for (const [x, y, cmd] of sequence){
      if (cmd !== CMD.STITCH && cmd !== CMD.JUMP) continue;
      if (first){ minX = maxX = x; minY = maxY = y; first = false; continue; }
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  }

  // =============================================================
  // PEC ステッチブロック（PESの中身 / ミシンが読む部分）
  // =============================================================

  const MASK7 = 0x7F, JUMP_CODE = 0x10, TRIM_CODE = 0x20;

  function pecWriteValue(w, value, isLong, flag){
    if (!isLong && value > -64 && value < 63){
      w.u8(value & MASK7);
    } else {
      let v = value & 0x0FFF;
      v |= 0x8000;
      v |= flag << 8;
      w.u8((v >> 8) & 0xFF);
      w.u8(v & 0xFF);
    }
  }
  const pecStitch = (w, dx, dy) => { pecWriteValue(w, dx, false, 0); pecWriteValue(w, dy, false, 0); };
  const pecJump   = (w, dx, dy) => { pecWriteValue(w, dx, true, JUMP_CODE); pecWriteValue(w, dy, true, JUMP_CODE); };
  const pecTrimJump = (w, dx, dy) => { pecWriteValue(w, dx, true, TRIM_CODE); pecWriteValue(w, dy, true, TRIM_CODE); };

  function pecEncode(w, sequence){
    let colorTwo = true, jumping = true, init = true;
    let xx = 0, yy = 0;
    for (const [x, y, cmd] of sequence){
      const dx = Math.round(x - xx), dy = Math.round(y - yy);
      xx += dx; yy += dy;
      if (cmd === CMD.STITCH){
        if (jumping){
          if (dx !== 0 && dy !== 0) pecStitch(w, 0, 0);
          jumping = false;
        }
        pecStitch(w, dx, dy);
      } else if (cmd === CMD.JUMP){
        jumping = true;
        if (init) pecJump(w, dx, dy);
        else pecTrimJump(w, dx, dy);
      } else if (cmd === CMD.COLOR_CHANGE){
        if (jumping){ pecStitch(w, 0, 0); jumping = false; }
        w.u8(0xFE); w.u8(0xB0);
        w.u8(colorTwo ? 0x02 : 0x01);
        colorTwo = !colorTwo;
      } else if (cmd === CMD.TRIM){
        // PEC ではジャンプの TRIM フラグで表現されるため何も書かない
      } else if (cmd === CMD.END){
        w.u8(0xFF);
        break;
      }
      init = false;
    }
  }

  // ---- サムネイル（48×38 1bit・枠つき） ----
  function blankGraphic(){
    const g = new Uint8Array(6 * 38);
    const setRow = (row, bytes) => { for (let i = 0; i < 6; i++) g[row * 6 + i] = bytes[i]; };
    const frameH = [0xF0, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F];
    setRow(1, frameH);
    setRow(2, [0x08, 0, 0, 0, 0, 0x10]);
    setRow(3, [0x04, 0, 0, 0, 0, 0x20]);
    for (let r = 4; r <= 33; r++) setRow(r, [0x02, 0, 0, 0, 0, 0x40]);
    setRow(34, [0x04, 0, 0, 0, 0, 0x20]);
    setRow(35, [0x08, 0, 0, 0, 0, 0x10]);
    setRow(36, frameH);
    return g;
  }

  function markBit(g, x, y){
    if (x < 0 || y < 0 || x >= 48 || y >= 38) return;
    g[y * 6 + (x >> 3)] |= 1 << (x % 8);
  }

  function drawScaled(ext, points, g, buffer){
    const dw = Math.max(1, ext[2] - ext[0]);
    const dh = Math.max(1, ext[3] - ext[1]);
    const scale = Math.min((48 - buffer) / dw, (38 - buffer) / dh);
    const cx = (ext[2] + ext[0]) / 2, cy = (ext[3] + ext[1]) / 2;
    const tx = -cx * scale + 24, ty = -cy * scale + 19;
    for (const [x, y] of points){
      markBit(g, Math.floor(x * scale + tx), Math.floor(y * scale + ty));
    }
  }

  // ---- PEC 全体 ----
  function writePecInner(w, plan){
    const ext = bounds(plan.sequence);
    writePecHeader(w, plan);
    writePecBlock(w, plan, ext);
    writePecGraphics(w, plan, ext);
  }

  function writePecHeader(w, plan){
    const name = (plan.name || 'itomaki').slice(0, 8);
    w.str('LA:' + name.padEnd(16, ' ') + '\r');
    w.bytes(new Array(12).fill(0x20));
    w.u8(0xFF); w.u8(0x00);
    w.u8(6);    // サムネイル幅(バイト)
    w.u8(38);   // サムネイル高さ
    const colorIndexList = buildUniquePalette(plan.blocks);
    const count = colorIndexList.length;
    w.bytes(new Array(12).fill(0x20));
    w.u8(count - 1);
    w.bytes(colorIndexList);
    for (let i = count; i < 463; i++) w.u8(0x20);
  }

  function writePecBlock(w, plan, ext){
    const width = ext[2] - ext[0], height = ext[3] - ext[1];
    const start = w.tell();
    w.u8(0); w.u8(0);
    w.u24le(0);                       // 長さのプレースホルダ
    w.u8(0x31); w.u8(0xFF); w.u8(0xF0);
    w.u16le(Math.round(width));
    w.u16le(Math.round(height));
    w.u16le(0x1E0);
    w.u16le(0x1B0);
    pecEncode(w, plan.sequence);
    w.patchU24le(start + 2, w.tell() - start);
  }

  function writePecGraphics(w, plan, ext){
    // 全体サムネイル
    const overall = blankGraphic();
    const allPts = plan.sequence.filter(s => s[2] === CMD.STITCH);
    drawScaled(ext, allPts, overall, 4);
    w.bytes(overall);
    // 色ブロックごとのサムネイル
    let block = [];
    const flush = () => {
      const g = blankGraphic();
      drawScaled(ext, block, g, 5);
      w.bytes(g);
      block = [];
    };
    for (const s of plan.sequence){
      if (s[2] === CMD.STITCH) block.push(s);
      else if (s[2] === CMD.COLOR_CHANGE) flush();
      else if (s[2] === CMD.END) break;
    }
    flush();   // 最終ブロック
  }

  // =============================================================
  // PES v1（刺しゅうPRO / PE-Design 用・CSewSegオブジェクト付き）
  // =============================================================

  function writePesString16(w, s){
    w.u16le(s.length);
    w.str(s);
  }

  function writePes(plan){
    const w = new Writer();
    w.str('#PES0001');

    const ext = bounds(plan.sequence);
    const cx = (ext[2] + ext[0]) / 2, cy = (ext[3] + ext[1]) / 2;
    const left = ext[0] - cx, top = ext[1] - cy;
    const right = ext[2] - cx, bottom = ext[3] - cy;

    const pecPlaceholder = w.tell();
    w.u32le(0);

    // PESヘッダ v1
    w.u16le(0x01);   // scale to fit
    w.u16le(0x01);   // hoop 130x180
    w.u16le(0x01);   // distinct blocks
    w.u16le(0xFFFF);
    w.u16le(0x0000);

    writePesBlocks(w, plan, left, top, right, bottom, cx, cy);

    w.patchU32le(pecPlaceholder, w.tell());
    writePecInner(w, plan);
    return w.toBytes();
  }

  function writePesBlocks(w, plan, left, top, right, bottom, cx, cy){
    writePesString16(w, 'CEmbOne');
    const sectionPlaceholder = writeSewSegHeader(w, left, top, right, bottom);
    w.u16le(0xFFFF);
    w.u16le(0x0000);
    writePesString16(w, 'CSewSeg');
    const sections = writeSewSegments(w, plan, left, bottom, cx, cy);
    w.patchU16le(sectionPlaceholder, sections);
    w.u16le(0x0000);
    w.u16le(0x0000);
  }

  function writeSewSegHeader(w, left, top, right, bottom){
    const width = right - left, height = bottom - top;
    for (let i = 0; i < 8; i++) w.u16le(0);
    let transX = 350 + 1300 / 2 - width / 2;
    let transY = 100 + height + 1800 / 2 - height / 2;
    w.f32le(1); w.f32le(0); w.f32le(0); w.f32le(1);
    w.f32le(transX); w.f32le(transY);
    w.u16le(1); w.u16le(0); w.u16le(0);
    w.u16le(Math.round(width)); w.u16le(Math.round(height));
    for (let i = 0; i < 8; i++) w.u8(0);
    const placeholder = w.tell();
    w.u16le(0);   // セクション数（あとで書き戻し）
    return placeholder;
  }

  /** シーケンスを CSewSeg のセクション列に変換して書く */
  function writeSewSegments(w, plan, left, bottom, cx, cy){
    const adjX = left + cx, adjY = bottom + cy;   // = 絶対座標の left / bottom
    // ブロック色 → フル64色パレットでの最近色（pyembroidery write_version_1 と同じ）
    const colorCodes = plan.blocks.map(bl => nearestIn(BROTHER, bl.r, bl.g, bl.b));

    // コマンド連続ブロックへ分割
    const runs = [];
    let curRun = null;
    for (const s of plan.sequence){
      const cmd = s[2];
      if (curRun && curRun.cmd === cmd){ curRun.pts.push(s); continue; }
      curRun = { cmd, pts: [s] };
      runs.push(curRun);
    }

    let section = 0;
    const colorlog = [];
    let colorIdx = 0;
    let colorCode = colorCodes[0] != null ? colorCodes[0] : 0x14;
    let prevColorCode = -1;
    let stX = 0, stY = 0;    // 最後に縫った位置
    let started = false;

    for (const run of runs){
      let pts, flag;
      if (run.cmd === CMD.JUMP){
        const last = run.pts[run.pts.length - 1];
        pts = [[stX - adjX, stY - adjY], [last[0] - adjX, last[1] - adjY]];
        flag = 1;
      } else if (run.cmd === CMD.COLOR_CHANGE){
        colorIdx++;
        if (colorIdx < colorCodes.length) colorCode = colorCodes[colorIdx];
        continue;
      } else if (run.cmd === CMD.STITCH){
        pts = run.pts.map(s => { stX = s[0]; stY = s[1]; return [s[0] - adjX, s[1] - adjY]; });
        flag = 0;
      } else {
        continue;   // TRIM / END
      }
      if (started) w.u16le(0x8003);   // セクション区切り
      started = true;
      if (prevColorCode !== colorCode){
        colorlog.push([section, colorCode]);
        prevColorCode = colorCode;
      }
      w.u16le(flag);
      w.u16le(colorCode);
      w.u16le(pts.length);
      for (const [px, py] of pts){
        w.i16le(Math.round(px));
        w.i16le(Math.round(py));
      }
      section++;
    }

    w.u16le(colorlog.length);
    for (const [sec, code] of colorlog){
      w.u16le(sec);
      w.u16le(code);
    }
    return section;
  }

  // =============================================================
  // DST（タジマ）
  // =============================================================

  function dstRecord(x, y, flags){
    y = -y;   // DSTはY軸上向き
    let b0 = 0, b1 = 0, b2 = 0;
    const bit = b => 1 << b;
    if (flags === CMD.JUMP) b2 += bit(7);
    if (flags === CMD.STITCH || flags === CMD.JUMP){
      b2 += bit(0) + bit(1);
      if (x > 40){ b2 += bit(2); x -= 81; }
      if (x < -40){ b2 += bit(3); x += 81; }
      if (x > 13){ b1 += bit(2); x -= 27; }
      if (x < -13){ b1 += bit(3); x += 27; }
      if (x > 4){ b0 += bit(2); x -= 9; }
      if (x < -4){ b0 += bit(3); x += 9; }
      if (x > 1){ b1 += bit(0); x -= 3; }
      if (x < -1){ b1 += bit(1); x += 3; }
      if (x > 0){ b0 += bit(0); x -= 1; }
      if (x < 0){ b0 += bit(1); x += 1; }
      if (y > 40){ b2 += bit(5); y -= 81; }
      if (y < -40){ b2 += bit(4); y += 81; }
      if (y > 13){ b1 += bit(5); y -= 27; }
      if (y < -13){ b1 += bit(4); y += 27; }
      if (y > 4){ b0 += bit(5); y -= 9; }
      if (y < -4){ b0 += bit(4); y += 9; }
      if (y > 1){ b1 += bit(7); y -= 3; }
      if (y < -1){ b1 += bit(6); y += 3; }
      if (y > 0){ b0 += bit(7); y -= 1; }
      if (y < 0){ b0 += bit(6); y += 1; }
    } else if (flags === CMD.COLOR_CHANGE){
      b2 = 0xC3;
    } else if (flags === CMD.END){
      b2 = 0xF3;
    }
    return [b0, b1, b2];
  }

  function writeDst(plan){
    // レコード生成（±121 を超える移動は分割）
    const records = [];
    let xx = 0, yy = 0;
    let stitchCount = 0, colorChanges = 0;
    for (const [x, y, cmd] of plan.sequence){
      if (cmd === CMD.TRIM){
        // トリム: その場での小さなジャンプ3連（業界慣習の合図）
        records.push(dstRecord(2, 2, CMD.JUMP));
        records.push(dstRecord(-4, -4, CMD.JUMP));
        records.push(dstRecord(2, 2, CMD.JUMP));
        stitchCount += 3;
        continue;
      }
      if (cmd === CMD.COLOR_CHANGE){
        records.push(dstRecord(0, 0, CMD.COLOR_CHANGE));
        colorChanges++;
        continue;
      }
      if (cmd === CMD.END){
        records.push(dstRecord(0, 0, CMD.END));
        continue;
      }
      let dx = Math.round(x - xx), dy = Math.round(y - yy);
      xx += dx; yy += dy;
      // 分割
      while (Math.abs(dx) > 121 || Math.abs(dy) > 121){
        const sx = Math.max(-121, Math.min(121, dx));
        const sy = Math.max(-121, Math.min(121, dy));
        records.push(dstRecord(sx, sy, cmd === CMD.STITCH ? CMD.JUMP : cmd));
        stitchCount++;
        dx -= sx; dy -= sy;
      }
      records.push(dstRecord(dx, dy, cmd));
      stitchCount++;
    }

    const ext = bounds(plan.sequence);
    const last = plan.sequence[plan.sequence.length - 1] || [0, 0, 0];

    const w = new Writer();
    const name = (plan.name || 'itomaki').slice(0, 16);
    w.str('LA:' + name.padEnd(16, ' ') + '\r');
    w.str('ST:' + pad(stitchCount, 7) + '\r');
    w.str('CO:' + pad(colorChanges, 3) + '\r');
    w.str('+X:' + pad(Math.abs(ext[2]), 5) + '\r');
    w.str('-X:' + pad(Math.abs(ext[0]), 5) + '\r');
    w.str('+Y:' + pad(Math.abs(ext[3]), 5) + '\r');
    w.str('-Y:' + pad(Math.abs(ext[1]), 5) + '\r');
    const ax = Math.round(last[0]), ay = -Math.round(last[1]);
    w.str((ax >= 0 ? 'AX:+' : 'AX:-') + pad(Math.abs(ax), 5) + '\r');
    w.str((ay >= 0 ? 'AY:+' : 'AY:-') + pad(Math.abs(ay), 5) + '\r');
    w.str('MX:+' + pad(0, 5) + '\r');
    w.str('MY:+' + pad(0, 5) + '\r');
    w.str('PD:******\r');
    w.u8(0x1A);
    while (w.tell() < 512) w.u8(0x20);
    for (const rec of records) w.bytes(rec);
    return w.toBytes();
  }

  // =============================================================
  // 公開API
  // =============================================================
  IT.machine = {
    writePes, writeDst, pecColors,
    BROTHER_PALETTE: BROTHER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
