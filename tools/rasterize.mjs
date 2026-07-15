/* =============================================================
   ステッチプラン → PNG ラスタライザ（検証画像の生成）

   ブラウザなしで縫い軌跡を目視確認するための最小限レンダラ。
   plan.sequence（0.1mm・中心原点）をブロック色で描画する。
   使い方は verify-machine.mjs から import。
   ============================================================= */
import zlib from 'node:zlib';

// ---- 最小PNGエンコーダ（truecolor 8bit） ----
function crc32(buf){
  let c, table = crc32.table;
  if (!table){
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++){
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}
function chunk(type, data){
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
export function encodePng(rgb, w, h){
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y * (w * 3 + 1)] = 0;   // filter: none
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CMD = { STITCH: 0, JUMP: 1, TRIM: 2, END: 4, COLOR_CHANGE: 5 };

/**
 * plan → PNGバッファ。
 * @param {object} plan  stitchPlan の出力
 * @param {object} opts  { pxPerMm=8, margin=3, underAlpha=false }
 */
export function renderPlanPng(plan, opts = {}){
  const s = opts.pxPerMm || 8;
  const mgn = (opts.margin != null ? opts.margin : 3) * s;
  const w = Math.max(8, Math.ceil(plan.size.wMm * s + mgn * 2));
  const h = Math.max(8, Math.ceil(plan.size.hMm * s + mgn * 2));
  const rgb = Buffer.alloc(w * h * 3, 0xFA);   // 生成り風の白
  for (let i = 0; i < w * h; i++){ rgb[i*3] = 0xFB; rgb[i*3+1] = 0xF8; rgb[i*3+2] = 0xF0; }

  const put = (x, y, r, g, b) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    const p = (yi * w + xi) * 3;
    rgb[p] = r; rgb[p+1] = g; rgb[p+2] = b;
  };
  const line = (x0, y0, x1, y1, r, g, b, th) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k <= steps; k++){
      const px = x0 + (x1 - x0) * k / steps, py = y0 + (y1 - y0) * k / steps;
      for (let dy = -th; dy <= th; dy++){
        for (let dx = -th; dx <= th; dx++){
          if (dx*dx + dy*dy > th*th + 0.5) continue;
          put(px + dx, py + dy, r, g, b);
        }
      }
    }
  };

  const toX = v => v / 10 * s + plan.size.wMm / 2 * s + mgn;
  const toY = v => v / 10 * s + plan.size.hMm / 2 * s + mgn;

  let bi = 0, prev = null, penDown = false;
  for (const [x, y, cmd] of plan.sequence){
    const bl = plan.blocks[Math.min(bi, plan.blocks.length - 1)] || { r: 40, g: 40, b: 40 };
    if (cmd === CMD.STITCH){
      if (penDown && prev) line(toX(prev[0]), toY(prev[1]), toX(x), toY(y), bl.r, bl.g, bl.b, Math.max(1, Math.round(s*0.10)));
      prev = [x, y];
      penDown = true;
    } else if (cmd === CMD.JUMP || cmd === CMD.TRIM){
      prev = (cmd === CMD.JUMP) ? [x, y] : prev;
      penDown = false;
    } else if (cmd === CMD.COLOR_CHANGE){
      bi++;
      penDown = false;
    } else if (cmd === CMD.END) break;
  }
  return encodePng(rgb, w, h);
}
