/* =============================================================
   いとまき — ミシンデータ用デジタイザー v2（精密ステッチ生成）

   画面プレビュー用の buildStitches() とは別に、PES/DST 出力専用の
   「納品品質」ステッチ幾何を生成する。実務のデジタイズ（プンチング）と
   同じく、領域を分類して部位ごとに縫い方を変えるのが本質:

     1. ラベルマップ → マーチングスクエア法で輪郭をベクトル化
        （セル格子の階段状ギザギザを角丸め+単純化で除去）
     2. 連結成分ごとに分類
          広い面     → タタミ縫い（走査線充填・サーペンタイン縫い順・
                        4位相レンガ針落ち・引き縮み補正）
          細い線/文字 → サテン縫い（骨格線に沿ったジグザグ。距離変換で
                        局所幅を測り、輪郭がくっきり出る）
          微小領域   → 手差し数針（さらに小さければ省略）
     3. 部位ごとの下打ち
          タタミ: エッジウォーク（輪郭沿い）+ 直交走り縫い
          サテン: センターウォーク + （幅があれば）ジグザグ下打ち
     4. タタミ領域は仕上げに輪郭ランニングで縁取り（エッジ定義）

   出力はパス列（点列）。針落ちの順序まで決定した状態で
   stitchPlan.compileMachine() に渡す。すべて決定的（乱数不使用）。
   座標系: x右・y下・単位mm。
   ============================================================= */
(function(root){
  'use strict';
  const IT = root.IT = root.IT || {};

  // -------------------------------------------------------------
  // パラメータ導出（ユーザー設定 → 機械用パラメータ）
  // -------------------------------------------------------------
  function machineParams(params){
    const WT = (IT.emb && IT.emb.WEIGHTS) || {};
    const DN = (IT.emb && IT.emb.DENSITIES) || {};
    const wt = WT[params.weight] || WT.normal || { lineMm: 0.6, stitchMm: 3.0 };
    const dn = DN[params.density] || DN.normal || { f: 1.3 };
    return {
      rowPitch: wt.lineMm * dn.f,                    // タタミ列間隔
      stitchLen: wt.stitchMm,                        // タタミ針目長
      pullComp: 0.18,                                // 引き縮み補正（縫い方向）
      minSpanMm: 0.5,                                // これ未満の走査スパンは捨てる
      // サテン: 送りは糸幅×密度から（同一側の周期が糸幅の約1.4倍 → 十分な重なり）
      satinPitch: Math.min(0.55, Math.max(0.30, wt.lineMm * dn.f * 0.52)),
      satinPull: 0.12,                               // サテンの張り出し補正
      satinMaxW: 4.0,                                // これ以下の幅ならサテン化
      satinMinLen: 2.0,                              // 骨格がこれ未満なら手差し扱い
      // 下打ち
      underPitch: 3.0, underLen: 3.8, underInset: 0.55,
      edgeWalkStep: 2.6, edgeWalkInset: 0.38, edgeWalkMinArea: 6,
      centerWalkStep: 1.8,
      // 縁取り（エッジ定義）
      borderStep: 1.5, borderInset: 0.10, borderMinArea: 2.0,
      // 微小領域
      minRegionArea: 0.9,                            // これ未満 → 手差し
      dropArea: 0.30,                                // これ未満 → 省略
      maxStitch: 7.0,                                // 1針の最大長（超えたら分割）
    };
  }

  const PHASE = [0, 0.5, 0.25, 0.75];   // タタミ針落ちの4位相レンガパターン

  // =============================================================
  // 幾何ユーティリティ
  // =============================================================

  function polyLength(pts, closed){
    let L = 0;
    for (let i = 2; i < pts.length; i += 2){
      L += Math.hypot(pts[i] - pts[i-2], pts[i+1] - pts[i-1]);
    }
    if (closed && pts.length >= 4){
      L += Math.hypot(pts[0] - pts[pts.length-2], pts[1] - pts[pts.length-1]);
    }
    return L;
  }

  /** 閉ループの符号付き面積（x右・y下座標系） */
  function signedArea(pts){
    let a = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++){
      const j = (i + 1) % n;
      a += pts[i*2] * pts[j*2+1] - pts[j*2] * pts[i*2+1];
    }
    return a / 2;
  }

  function reversePts(pts){
    const out = new Array(pts.length);
    const n = pts.length / 2;
    for (let i = 0; i < n; i++){
      out[i*2] = pts[(n-1-i)*2];
      out[i*2+1] = pts[(n-1-i)*2+1];
    }
    return out;
  }

  /**
   * 角を保護した Chaikin 平滑化（閉ループ用）。
   * 通常の Chaikin は長辺の角を大きく削ってしまうため、
   * 切り取り量を cap で制限する。階段状の短い辺（±0.5セル）は
   * ほぼ完全に丸まり、長い直線の角は cap 分だけ小さく面取りされる。
   */
  function chaikinCapped(pts, cap, iters){
    let cur = pts;
    for (let it = 0; it < iters; it++){
      const n = cur.length / 2;
      if (n < 3) return cur;
      const out = [];
      for (let i = 0; i < n; i++){
        const p0x = cur[((i+n-1)%n)*2], p0y = cur[((i+n-1)%n)*2+1];
        const px = cur[i*2], py = cur[i*2+1];
        const p1x = cur[((i+1)%n)*2], p1y = cur[((i+1)%n)*2+1];
        const lp = Math.hypot(px-p0x, py-p0y), ln = Math.hypot(p1x-px, p1y-py);
        if (lp < 1e-9 || ln < 1e-9) continue;
        const cp = Math.min(lp * 0.25, cap), cn = Math.min(ln * 0.25, cap);
        out.push(px - (px-p0x)/lp*cp, py - (py-p0y)/lp*cp);
        out.push(px + (p1x-px)/ln*cn, py + (p1y-py)/ln*cn);
      }
      cur = out;
      cap /= 2;
    }
    return cur;
  }

  /** Douglas–Peucker（開いた点列） */
  function dpOpen(pts, i0, i1, tol2, keep){
    if (i1 <= i0 + 1) return;
    const ax = pts[i0*2], ay = pts[i0*2+1], bx = pts[i1*2], by = pts[i1*2+1];
    const dx = bx-ax, dy = by-ay;
    const len2 = dx*dx + dy*dy;
    let worst = -1, wd = -1;
    for (let i = i0+1; i < i1; i++){
      const px = pts[i*2]-ax, py = pts[i*2+1]-ay;
      let d;
      if (len2 < 1e-12){ d = px*px + py*py; }
      else {
        const t = Math.max(0, Math.min(1, (px*dx + py*dy) / len2));
        const ex = px - t*dx, ey = py - t*dy;
        d = ex*ex + ey*ey;
      }
      if (d > wd){ wd = d; worst = i; }
    }
    if (wd > tol2){
      keep[worst] = 1;
      dpOpen(pts, i0, worst, tol2, keep);
      dpOpen(pts, worst, i1, tol2, keep);
    }
  }

  /** 閉ループの単純化（最遠点2つをアンカーに分割してDP） */
  function simplifyLoop(pts, tol){
    const n = pts.length / 2;
    if (n <= 4) return pts;
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++){
      const d = (pts[i*2]-pts[0])**2 + (pts[i*2+1]-pts[1])**2;
      if (d > fd){ fd = d; far = i; }
    }
    // 0..far..end..0 の2チェーンでDP
    const keep = new Uint8Array(n);
    keep[0] = keep[far] = 1;
    const tol2 = tol * tol;
    dpOpen(pts, 0, far, tol2, keep);
    // far..n-1..(0) チェーン: 巻き戻し用に一時配列
    const tail = [];
    for (let i = far; i < n; i++) tail.push(pts[i*2], pts[i*2+1]);
    tail.push(pts[0], pts[1]);
    const keepT = new Uint8Array(tail.length/2);
    keepT[0] = keepT[keepT.length-1] = 1;
    dpOpen(tail, 0, tail.length/2 - 1, tol2, keepT);
    for (let i = 1; i < keepT.length - 1; i++) if (keepT[i]) keep[far + i] = 1;
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i*2], pts[i*2+1]);
    return out.length >= 6 ? out : pts;
  }

  /**
   * 閉ループを一定間隔で再サンプリング。
   * inset > 0 なら塗り内側方向（外周A>0/穴A<0の正規化前提で (-dy,dx) 方向）へ
   * オフセットする。startNear が与えられればその点に最も近い頂点から始める。
   */
  function resampleLoop(pts, step, inset, startNear){
    const n = pts.length / 2;
    const L = polyLength(pts, true);
    if (L < step * 1.5 || n < 3) return null;
    const count = Math.max(4, Math.round(L / step));
    // 弧長テーブル（cum[i] = 頂点iまでの累積長、cum[n] = 全周L）
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++){
      const j = (i + 1) % n;
      cum[i+1] = cum[i] + Math.hypot(pts[j*2] - pts[i*2], pts[j*2+1] - pts[i*2+1]);
    }
    const out = [];
    let seg = 0;
    for (let k = 0; k < count; k++){
      const t = cum[n] * k / count;
      while (seg < n - 1 && cum[seg+1] < t) seg++;
      const i0 = seg, i1 = (seg + 1) % n;
      const d = cum[seg+1] - cum[seg];
      const f = d > 1e-9 ? (t - cum[seg]) / d : 0;
      out.push(pts[i0*2] + (pts[i1*2] - pts[i0*2]) * f,
               pts[i0*2+1] + (pts[i1*2+1] - pts[i0*2+1]) * f);
    }
    if (out.length < 6) return null;
    // 内側オフセット
    let res = out;
    if (inset){
      const m = out.length / 2;
      res = new Array(out.length);
      for (let k = 0; k < m; k++){
        const px = out[((k+m-1)%m)*2], py = out[((k+m-1)%m)*2+1];
        const nx2 = out[((k+1)%m)*2], ny2 = out[((k+1)%m)*2+1];
        let dx = nx2 - px, dy = ny2 - py;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        res[k*2] = out[k*2] + (-dy) * inset;
        res[k*2+1] = out[k*2+1] + dx * inset;
      }
    }
    // 開始点の回転
    if (startNear){
      const m = res.length / 2;
      let bi = 0, bd = Infinity;
      for (let k = 0; k < m; k++){
        const d = (res[k*2]-startNear[0])**2 + (res[k*2+1]-startNear[1])**2;
        if (d < bd){ bd = d; bi = k; }
      }
      if (bi > 0){
        const rot = [];
        for (let k = 0; k < m; k++){
          const s = (bi + k) % m;
          rot.push(res[s*2], res[s*2+1]);
        }
        res = rot;
      }
    }
    // ループを閉じる（始点に戻る）
    res.push(res[0], res[1]);
    return res;
  }

  // =============================================================
  // 1. 連結成分（8近傍）
  // =============================================================

  function components(labels, W, H, cluster){
    const seen = new Uint8Array(W * H);
    const comps = [];
    const stack = [];
    for (let start = 0; start < W * H; start++){
      if (seen[start] || labels[start] !== cluster) continue;
      const cells = [];
      let minX = W, minY = H, maxX = 0, maxY = 0;
      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length){
        const i = stack.pop();
        cells.push(i);
        const x = i % W, y = (i / W) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++){
          for (let dx = -1; dx <= 1; dx++){
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (!seen[j] && labels[j] === cluster){ seen[j] = 1; stack.push(j); }
          }
        }
      }
      comps.push({ cells, minX, minY, maxX, maxY });
    }
    return comps;
  }

  // =============================================================
  // 2. 輪郭抽出（マーチングスクエア → 平滑化 → 単純化）
  //    セル中心をサンプル点とみなし、輪郭はセル境界上を通る。
  //    サドル（対角接続）は前景连結を優先して解決（8近傍と整合）。
  // =============================================================

  function traceLoops(comp, W){
    const { minX, minY, maxX, maxY } = comp;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const mask = new Uint8Array(bw * bh);
    for (const i of comp.cells){
      mask[((i / W | 0) - minY) * bw + (i % W - minX)] = 1;
    }
    const inside = (lx, ly) => (lx >= 0 && ly >= 0 && lx < bw && ly < bh) ? mask[ly * bw + lx] : 0;

    // セグメント収集（端点は×2して整数化 → ハッシュ可能に）
    const segs = [];                 // [x1,y1,x2,y2] （×2 座標）
    const byEnd = new Map();         // "x,y" → seg index list
    const addSeg = (x1, y1, x2, y2) => {
      const idx = segs.length;
      segs.push([x1, y1, x2, y2]);
      for (const k of [x1 + ',' + y1, x2 + ',' + y2]){
        let a = byEnd.get(k);
        if (!a){ a = []; byEnd.set(k, a); }
        a.push(idx);
      }
    };

    for (let ly = -1; ly < bh; ly++){
      for (let lx = -1; lx < bw; lx++){
        const A = inside(lx, ly), B = inside(lx+1, ly), C = inside(lx+1, ly+1), D = inside(lx, ly+1);
        const code = (A<<3) | (B<<2) | (C<<1) | D;
        if (code === 0 || code === 15) continue;
        // 辺中点（×2座標）: t=(2lx+1,2ly), r=(2lx+2,2ly+1), b=(2lx+1,2ly+2), l=(2lx,2ly+1)
        const tx = 2*lx+1, ty = 2*ly, rx = 2*lx+2, ry = 2*ly+1;
        const bx = 2*lx+1, by = 2*ly+2, lx2 = 2*lx, ly2 = 2*ly+1;
        switch (code){
          case 1:  addSeg(lx2, ly2, bx, by); break;             // D
          case 2:  addSeg(bx, by, rx, ry); break;               // C
          case 3:  addSeg(lx2, ly2, rx, ry); break;             // D C
          case 4:  addSeg(tx, ty, rx, ry); break;               // B
          case 5:  addSeg(tx, ty, lx2, ly2); addSeg(bx, by, rx, ry); break; // B D 対角: 前景連結
          case 6:  addSeg(tx, ty, bx, by); break;               // B C
          case 7:  addSeg(tx, ty, lx2, ly2); break;             // B C D
          case 8:  addSeg(tx, ty, lx2, ly2); break;             // A
          case 9:  addSeg(tx, ty, bx, by); break;               // A D
          case 10: addSeg(tx, ty, rx, ry); addSeg(lx2, ly2, bx, by); break; // A C 対角: 前景連結
          case 11: addSeg(tx, ty, rx, ry); break;               // A C D
          case 12: addSeg(lx2, ly2, rx, ry); break;             // A B
          case 13: addSeg(bx, by, rx, ry); break;               // A B D
          case 14: addSeg(lx2, ly2, bx, by); break;             // A B C
        }
      }
    }

    // 端点でつないで閉ループ化
    const used = new Uint8Array(segs.length);
    const loops = [];
    for (let s0 = 0; s0 < segs.length; s0++){
      if (used[s0]) continue;
      used[s0] = 1;
      const loop = [segs[s0][0], segs[s0][1], segs[s0][2], segs[s0][3]];
      let cx = segs[s0][2], cy = segs[s0][3];
      const startX = segs[s0][0], startY = segs[s0][1];
      let guard = segs.length + 2;
      while ((cx !== startX || cy !== startY) && guard-- > 0){
        const cand = byEnd.get(cx + ',' + cy) || [];
        let next = -1;
        for (const si of cand){ if (!used[si]){ next = si; break; } }
        if (next < 0) break;
        used[next] = 1;
        const sg = segs[next];
        if (sg[0] === cx && sg[1] === cy){ cx = sg[2]; cy = sg[3]; }
        else { cx = sg[0]; cy = sg[1]; }
        loop.push(cx, cy);
      }
      // 末尾＝先頭なら閉じている（末尾の重複点は除去）
      if (loop.length >= 8 &&
          loop[loop.length-2] === startX && loop[loop.length-1] === startY){
        loop.length -= 2;
        loops.push(loop);
      }
    }

    // ×2座標 → グローバルセル座標（セル中心 = 整数+0.5）
    // ×2座標の点 p は「サンプル格子座標×2」。サンプル(0,0)はセル(minX,minY)中心。
    return loops.map(lp => {
      const out = new Array(lp.length);
      for (let i = 0; i < lp.length; i += 2){
        out[i]   = lp[i] / 2 + minX + 0.5;
        out[i+1] = lp[i+1] / 2 + minY + 0.5;
      }
      return out;
    });
  }

  /** 輪郭を平滑化 + 単純化 + mm変換 + 正規化（外周A>0/穴A<0） */
  function shapeLoops(rawLoops, cellMm){
    if (!rawLoops.length) return [];
    let loops = rawLoops.map(lp => {
      let p = chaikinCapped(lp, 0.75, 2);
      p = simplifyLoop(p, 0.30);
      const out = new Array(p.length);
      for (let i = 0; i < p.length; i++) out[i] = p[i] * cellMm;
      return out;
    }).filter(p => p.length >= 6);
    if (!loops.length) return [];
    // 最大|面積| = 外周
    let oi = 0, oa = -1;
    const areas = loops.map(p => signedArea(p));
    for (let i = 0; i < loops.length; i++){
      if (Math.abs(areas[i]) > oa){ oa = Math.abs(areas[i]); oi = i; }
    }
    return loops.map((p, i) => {
      const isOuter = i === oi;
      let a = areas[i];
      if (isOuter && a < 0){ p = reversePts(p); a = -a; }
      if (!isOuter && a > 0){ p = reversePts(p); a = -a; }
      return { pts: p, areaMm2: a, outer: isOuter };
    });
  }

  // =============================================================
  // 3. 距離変換（チャンファー 1 / √2 の2パス近似）
  // =============================================================

  function distanceTransform(mask, w, h){
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
    const SQ2 = Math.SQRT2;
    // 前進
    for (let y = 0; y < h; y++){
      for (let x = 0; x < w; x++){
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x > 0 && d[i-1] + 1 < v) v = d[i-1] + 1;
        if (y > 0){
          if (d[i-w] + 1 < v) v = d[i-w] + 1;
          if (x > 0 && d[i-w-1] + SQ2 < v) v = d[i-w-1] + SQ2;
          if (x < w-1 && d[i-w+1] + SQ2 < v) v = d[i-w+1] + SQ2;
        }
        d[i] = Math.min(v, x + 1, y + 1);   // 配列の外は背景扱い
      }
    }
    // 後退
    for (let y = h - 1; y >= 0; y--){
      for (let x = w - 1; x >= 0; x--){
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x < w-1 && d[i+1] + 1 < v) v = d[i+1] + 1;
        if (y < h-1){
          if (d[i+w] + 1 < v) v = d[i+w] + 1;
          if (x < w-1 && d[i+w+1] + SQ2 < v) v = d[i+w+1] + SQ2;
          if (x > 0 && d[i+w-1] + SQ2 < v) v = d[i+w-1] + SQ2;
        }
        d[i] = Math.min(v, Math.min(w - x, h - y));     // 右下境界も背景扱い
      }
    }
    return d;
  }

  // =============================================================
  // 4. サテン用スケルトン（Zhang–Suen細線化 → 枝抽出）
  //    ×3アップサンプルしたマスク上で行い、サブセル精度の中心線を得る。
  // =============================================================

  const SUB = 3;        // サブサンプル倍率
  const PAD = 3;        // 上下左右の余白（サブセル）

  function upsampleMask(comp, W){
    const { minX, minY, maxX, maxY } = comp;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const w3 = bw * SUB + PAD * 2, h3 = bh * SUB + PAD * 2;
    const m = new Uint8Array(w3 * h3);
    for (const i of comp.cells){
      const cx = (i % W) - minX, cy = ((i / W) | 0) - minY;
      for (let sy = 0; sy < SUB; sy++){
        const row = (cy * SUB + sy + PAD) * w3 + cx * SUB + PAD;
        for (let sx = 0; sx < SUB; sx++) m[row + sx] = 1;
      }
    }
    return { m, w3, h3, toCellX: sx => minX + (sx - PAD + 0.5) / SUB,
                        toCellY: sy => minY + (sy - PAD + 0.5) / SUB };
  }

  function thinZhangSuen(m, w, h){
    const sk = new Uint8Array(m);
    const idx = (x, y) => y * w + x;
    let changed = true;
    const toDel = [];
    let guard = Math.max(w, h);
    while (changed && guard-- > 0){
      changed = false;
      for (let pass = 0; pass < 2; pass++){
        toDel.length = 0;
        for (let y = 1; y < h - 1; y++){
          for (let x = 1; x < w - 1; x++){
            const i = idx(x, y);
            if (!sk[i]) continue;
            const p2 = sk[i-w], p3 = sk[i-w+1], p4 = sk[i+1], p5 = sk[i+w+1];
            const p6 = sk[i+w], p7 = sk[i+w-1], p8 = sk[i-1], p9 = sk[i-w-1];
            const B = p2+p3+p4+p5+p6+p7+p8+p9;
            if (B < 2 || B > 6) continue;
            let A = 0;
            const seq = [p2,p3,p4,p5,p6,p7,p8,p9,p2];
            for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k+1] === 1) A++;
            if (A !== 1) continue;
            if (pass === 0){
              if (p2*p4*p6 !== 0 || p4*p6*p8 !== 0) continue;
            } else {
              if (p2*p4*p8 !== 0 || p2*p6*p8 !== 0) continue;
            }
            toDel.push(i);
          }
        }
        if (toDel.length){ changed = true; for (const i of toDel) sk[i] = 0; }
      }
    }
    return sk;
  }

  /** スケルトン画素 → 枝ポリライン列（分岐で区切り、余枝を剪定） */
  function skeletonPaths(sk, w, h, pruneSub){
    const deg = new Int8Array(w * h);
    const px = [];
    for (let y = 1; y < h - 1; y++){
      for (let x = 1; x < w - 1; x++){
        const i = y * w + x;
        if (!sk[i]) continue;
        px.push(i);
        let d = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
          if (!dx && !dy) continue;
          if (sk[i + dy*w + dx]) d++;
        }
        deg[i] = d;
      }
    }
    if (!px.length) return [];

    const nbOf = i => {
      const out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        if (!dx && !dy) continue;
        const j = i + dy*w + dx;
        if (sk[j]) out.push(j);
      }
      return out;
    };
    const isNode = i => deg[i] !== 2;

    // 有向エッジの使用管理で、同じ枝を両側から二重に拾わない
    const usedDir = new Set();
    const dirKey = (a, b) => a * (w * h) + b;
    const paths = [];   // { pix:[i...], closed?, endJ:[bool,bool] }

    let hasNode = false;
    for (const i of px){
      if (!isNode(i)) continue;
      hasNode = true;
      for (const first of nbOf(i)){
        if (usedDir.has(dirKey(i, first))) continue;
        const pix = [i];
        let prev = i, cur = first;
        usedDir.add(dirKey(i, first));
        let guard = px.length + 2;
        while (guard-- > 0){
          pix.push(cur);
          if (isNode(cur)) break;
          const nbs = nbOf(cur);
          let nxt = -1;
          for (const nb of nbs){ if (nb !== prev){ nxt = nb; break; } }
          if (nxt < 0) break;
          usedDir.add(dirKey(cur, nxt));
          prev = cur; cur = nxt;
        }
        // 逆方向のエッジも使用済みへ
        for (let k = pix.length - 1; k > 0; k--) usedDir.add(dirKey(pix[k], pix[k-1]));
        if (pix.length >= 2){
          paths.push({ pix, endJ: [deg[pix[0]] >= 3, deg[pix[pix.length-1]] >= 3] });
        }
      }
    }

    // 純粋なループ（全画素 deg2 — 「O」のような形）
    if (!hasNode){
      const start = px[0];
      const pix = [start];
      let prev = -1, cur = start;
      let guard = px.length + 2;
      while (guard-- > 0){
        const nbs = nbOf(cur);
        let nxt = -1;
        for (const nb of nbs){ if (nb !== prev){ nxt = nb; break; } }
        if (nxt < 0 || nxt === start) break;
        pix.push(nxt);
        prev = cur; cur = nxt;
      }
      if (pix.length >= 6) paths.push({ pix, closed: true, endJ: [false, false] });
      return paths;
    }

    // 葉枝（少なくとも一端が端点）で短いものは剪定（ヒゲ除去）
    const pruned = paths.filter(p => {
      const isLeaf = !p.closed && (!p.endJ[0] || !p.endJ[1]);
      return !(isLeaf && p.pix.length < pruneSub && paths.length > 1);
    });
    return pruned.length ? pruned : paths;
  }

  // =============================================================
  // 5. スキャンライン充填（偶奇規則 → セクション分解 → サーペンタイン）
  // =============================================================

  /**
   * loops(mm) を角度 theta の走査線で充填し、行スパン列を返す。
   * 返値: rows[k] = { v, spans:[[u0,u1],...] } （グローバル行番号 k）
   */
  function scanSpans(loops, theta, pitch){
    const cos = Math.cos(theta), sin = Math.sin(theta);
    // (x,y) → (u,v)
    const edges = [];   // [u0,v0,u1,v1]
    let vMin = Infinity, vMax = -Infinity;
    for (const lp of loops){
      const p = lp.pts;
      const n = p.length / 2;
      for (let i = 0; i < n; i++){
        const j = (i + 1) % n;
        const u0 = p[i*2]*cos + p[i*2+1]*sin, v0 = -p[i*2]*sin + p[i*2+1]*cos;
        const u1 = p[j*2]*cos + p[j*2+1]*sin, v1 = -p[j*2]*sin + p[j*2+1]*cos;
        edges.push(u0, v0, u1, v1);
        if (v0 < vMin) vMin = v0; if (v0 > vMax) vMax = v0;
        if (v1 < vMin) vMin = v1; if (v1 > vMax) vMax = v1;
      }
    }
    if (vMin === Infinity) return { rows: [], cos, sin };
    const k0 = Math.ceil((vMin) / pitch - 0.463);
    const k1 = Math.floor((vMax) / pitch - 0.463);
    const rows = [];
    for (let k = k0; k <= k1; k++){
      const v = (k + 0.463) * pitch;    // 頂点と一致しにくい無理数風の位相
      const xs = [];
      for (let e = 0; e < edges.length; e += 4){
        const v0 = edges[e+1], v1 = edges[e+3];
        if ((v0 > v) === (v1 > v)) continue;
        const f = (v - v0) / (v1 - v0);
        xs.push(edges[e] + f * (edges[e+2] - edges[e]));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const spans = [];
      for (let s = 0; s + 1 < xs.length; s += 2){
        if (xs[s+1] - xs[s] > 1e-4) spans.push([xs[s], xs[s+1]]);
      }
      if (spans.length) rows.push({ k, v, spans });
    }
    return { rows, cos, sin };
  }

  /**
   * 行スパン列 → セクション（上下に連続するスパンの束）へ分解。
   * 凹形状・穴あき形状でも各セクション内は1行1スパンになり、
   * サーペンタイン（蛇行）で途切れなく縫える。
   */
  function buildSections(rows){
    const sections = [];
    let active = [];    // { rows:[{k,v,u0,u1}], last:[u0,u1], lastK }
    for (const row of rows){
      const spans = row.spans;
      const matched = new Array(active.length).fill(null);
      const spanTo = new Array(spans.length).fill(null);
      // 各アクティブセクション×スパンの重なりを数える
      for (let a = 0; a < active.length; a++){
        if (active[a].lastK !== row.k - 1) continue;
        for (let s = 0; s < spans.length; s++){
          const ov = Math.min(active[a].last[1], spans[s][1]) - Math.max(active[a].last[0], spans[s][0]);
          if (ov > 1e-6){
            matched[a] = matched[a] === null ? s : -2;      // -2 = 分岐（複数スパン）
            spanTo[s] = spanTo[s] === null ? a : -2;        // -2 = 合流（複数セクション）
          }
        }
      }
      const nextActive = [];
      const usedSpan = new Array(spans.length).fill(false);
      for (let a = 0; a < active.length; a++){
        const s = matched[a];
        if (s !== null && s >= 0 && spanTo[s] === a){
          // 1対1 → 継続
          active[a].rows.push({ k: row.k, v: row.v, u0: spans[s][0], u1: spans[s][1] });
          active[a].last = spans[s];
          active[a].lastK = row.k;
          nextActive.push(active[a]);
          usedSpan[s] = true;
        } else {
          sections.push(active[a]);   // 分岐/合流/断絶 → 閉じる
        }
      }
      for (let s = 0; s < spans.length; s++){
        if (usedSpan[s]) continue;
        nextActive.push({
          rows: [{ k: row.k, v: row.v, u0: spans[s][0], u1: spans[s][1] }],
          last: spans[s], lastK: row.k,
        });
      }
      active = nextActive;
    }
    for (const a of active) sections.push(a);
    return sections;
  }

  /**
   * セクション → サーペンタインの1本パス（mm点列）。
   * 針落ちは4位相レンガパターンのグローバル格子に揃える。
   */
  function serpentinePath(section, mp, cos, sin, opts){
    const pts = [];
    const comp = opts.comp || 0;
    const sLen = opts.stitchLen;
    const brick = opts.brick;
    const toXY = (u, v) => { pts.push(u*cos - v*sin, u*sin + v*cos); };
    let dir = 1;
    let firstRow = true;
    for (const r of section.rows){
      let u0 = r.u0 - comp, u1 = r.u1 + comp;
      if (u1 - u0 < (opts.minSpan != null ? opts.minSpan : 0.15)){
        // 短すぎる行: 中央1点だけ打って続ける（穴を空けない）
        if (u1 > u0){ toXY((u0+u1)/2, r.v); dir = -dir; firstRow = false; }
        continue;
      }
      const from = dir > 0 ? u0 : u1;
      const to   = dir > 0 ? u1 : u0;
      toXY(from, r.v);
      // 針落ち位置（グローバル位相）
      if (sLen > 0){
        const phase = brick ? PHASE[((r.k % 4) + 4) % 4] * sLen : 0;
        let m = dir > 0 ? Math.ceil((from + sLen*0.3 - phase) / sLen)
                        : Math.floor((from - sLen*0.3 - phase) / sLen);
        while (true){
          const u = m * sLen + phase;
          if (dir > 0){ if (u >= to - sLen*0.3) break; }
          else        { if (u <= to + sLen*0.3) break; }
          toXY(u, r.v);
          m += dir;
        }
      }
      toXY(to, r.v);
      dir = -dir;
      firstRow = false;
    }
    return pts;
  }

  // =============================================================
  // 6. 部位生成: タタミ / サテン / 手差し
  // =============================================================

  function buildTatami(loops, mp, theta, pen, paths){
    // --- 下打ち1: エッジウォーク（輪郭沿いの走り縫い） ---
    for (const lp of loops){
      if (Math.abs(lp.areaMm2) < mp.edgeWalkMinArea) continue;
      const walk = resampleLoop(lp.pts, mp.edgeWalkStep, mp.edgeWalkInset, pen);
      if (walk){ paths.push({ pts: walk, under: true, kind: 'edgewalk' }); pen = [walk[walk.length-2], walk[walk.length-1]]; }
    }
    // --- 下打ち2: 本縫いと直交の走り縫い ---
    const su = scanSpans(loops, theta + Math.PI/2, mp.underPitch);
    for (const sec of buildSections(su.rows)){
      const p = serpentinePath(sec, mp, su.cos, su.sin,
        { comp: -mp.underInset, stitchLen: mp.underLen, brick: false, minSpan: 1.0 });
      if (p.length >= 4){ paths.push({ pts: p, under: true, kind: 'underlay' }); pen = [p[p.length-2], p[p.length-1]]; }
    }
    // --- 本縫い: タタミ（サーペンタイン + 4位相レンガ + 引き縮み補正） ---
    const sf = scanSpans(loops, theta, mp.rowPitch);
    const sections = buildSections(sf.rows);
    // 近い順にセクションを縫う
    const done = new Array(sections.length).fill(false);
    for (let n = 0; n < sections.length; n++){
      let bi = -1, bd = Infinity;
      for (let i = 0; i < sections.length; i++){
        if (done[i]) continue;
        const r0 = sections[i].rows[0], r1 = sections[i].rows[sections[i].rows.length-1];
        for (const r of [r0, r1]){
          for (const uu of [r.u0, r.u1]){
            const x = uu*sf.cos - r.v*sf.sin, y = uu*sf.sin + r.v*sf.cos;
            const d = pen ? (x-pen[0])**2 + (y-pen[1])**2 : 0;
            if (d < bd){ bd = d; bi = i; }
          }
        }
        if (!pen) { bi = i; break; }
      }
      if (bi < 0) break;
      done[bi] = true;
      const p = serpentinePath(sections[bi], mp, sf.cos, sf.sin,
        { comp: mp.pullComp, stitchLen: mp.stitchLen, brick: true, minSpan: mp.minSpanMm });
      if (p.length >= 4){ paths.push({ pts: p, kind: 'fill' }); pen = [p[p.length-2], p[p.length-1]]; }
    }
    // --- 仕上げ: 輪郭ランニングで縁取り（エッジ定義） ---
    for (const lp of loops){
      if (Math.abs(lp.areaMm2) < mp.borderMinArea) continue;
      const border = resampleLoop(lp.pts, mp.borderStep, mp.borderInset, pen);
      if (border){ paths.push({ pts: border, kind: 'border', noflip: true }); pen = [border[border.length-2], border[border.length-1]]; }
    }
    return pen;
  }

  function buildSatin(comp, W, cellMm, mp, pen, paths){
    const up = upsampleMask(comp, W);
    const dt = distanceTransform(up.m, up.w3, up.h3);
    const sk = thinZhangSuen(up.m, up.w3, up.h3);
    const subMm = cellMm / SUB;
    const pruneSub = Math.max(3, Math.round(Math.max(0.9, comp.maxW * 0.9) / subMm));
    const branches = skeletonPaths(sk, up.w3, up.h3, pruneSub);
    if (!branches.length) return { pen, ok: false };

    // 枝 → mm ポリライン（平滑化）+ 局所幅
    const polys = [];
    for (const br of branches){
      let xs = [], ys = [], ws = [];
      for (const i of br.pix){
        const sx = i % up.w3, sy = (i / up.w3) | 0;
        xs.push(up.toCellX(sx) * cellMm);
        ys.push(up.toCellY(sy) * cellMm);
        ws.push(Math.max(0.15, dt[i] * subMm));
      }
      // 移動平均で平滑化（2回）
      for (let it = 0; it < 2; it++){
        const nx = xs.slice(), ny = ys.slice();
        for (let i = 1; i < xs.length - 1; i++){
          nx[i] = (xs[i-1] + xs[i]*2 + xs[i+1]) / 4;
          ny[i] = (ys[i-1] + ys[i]*2 + ys[i+1]) / 4;
        }
        xs = nx; ys = ny;
      }
      polys.push({ xs, ys, ws, closed: !!br.closed, endJ: br.endJ });
    }

    // 近い順に枝を縫う
    const done = new Array(polys.length).fill(false);
    let sewn = 0;
    for (let n = 0; n < polys.length; n++){
      let bi = -1, bflip = false, bd = Infinity;
      for (let i = 0; i < polys.length; i++){
        if (done[i]) continue;
        const p = polys[i];
        const d0 = pen ? (p.xs[0]-pen[0])**2 + (p.ys[0]-pen[1])**2 : 0;
        const d1 = pen ? (p.xs[p.xs.length-1]-pen[0])**2 + (p.ys[p.ys.length-1]-pen[1])**2 : 0;
        if (d0 < bd){ bd = d0; bi = i; bflip = false; }
        if (d1 < bd){ bd = d1; bi = i; bflip = true; }
      }
      if (bi < 0) break;
      done[bi] = true;
      const p = polys[bi];
      let xs = p.xs, ys = p.ys, ws = p.ws, endJ = p.endJ || [false, false];
      if (bflip){
        xs = xs.slice().reverse(); ys = ys.slice().reverse(); ws = ws.slice().reverse();
        endJ = [endJ[1], endJ[0]];
      }
      // 弧長で再サンプル
      const rs = resamplePolyline(xs, ys, ws, mp.satinPitch, p.closed);
      if (!rs || rs.xs.length < 2) continue;
      const m = rs.xs.length;
      const lenMm = polyLength(flatXY(rs.xs, rs.ys), p.closed);
      if (lenMm < mp.satinMinLen && polys.length === 1) return { pen, ok: false };

      // 法線と幅
      const nx = [], ny = [], wArr = [];
      for (let i = 0; i < m; i++){
        const i0 = Math.max(0, i-1), i1 = Math.min(m-1, i+1);
        let dx = rs.xs[i1] - rs.xs[i0], dy = rs.ys[i1] - rs.ys[i0];
        const l = Math.hypot(dx, dy) || 1;
        nx.push(-dy/l); ny.push(dx/l);
        let w = Math.min(rs.ws[i] + mp.satinPull, mp.satinMaxW/2 + 0.3);
        if (!p.closed){
          // 端のテーパー（分岐端は逆に少し延長して隙間を埋める）
          if (i === 0 || i === m-1){
            const atJ = i === 0 ? endJ[0] : endJ[1];
            w = atJ ? w : Math.max(0.2, w * 0.55);
          } else if (i === 1 || i === m-2){
            w = Math.max(0.2, w * 0.85);
          }
        }
        wArr.push(Math.max(0.15, w));
      }

      // --- 下打ち: センターウォーク（+幅があればジグザグ） ---
      const cw = [];
      const cwStep = Math.max(1, Math.round(mp.centerWalkStep / mp.satinPitch));
      for (let i = 0; i < m; i += cwStep) cw.push(rs.xs[i], rs.ys[i]);
      if ((m-1) % cwStep) cw.push(rs.xs[m-1], rs.ys[m-1]);
      if (cw.length >= 4) paths.push({ pts: cw, under: true, kind: 'centerwalk' });
      const meanW = wArr.reduce((s, v) => s + v, 0) / m;
      if (meanW > 1.1){
        const zz = [];
        const zzStep = Math.max(1, Math.round(1.5 / mp.satinPitch));
        let side = 1;
        for (let i = 0; i < m; i += zzStep){
          const w = Math.max(0.15, wArr[i] - 0.28);
          zz.push(rs.xs[i] + nx[i]*w*side, rs.ys[i] + ny[i]*w*side);
          side = -side;
        }
        if (zz.length >= 4) paths.push({ pts: zz, under: true, kind: 'zigzagunder' });
      }

      // --- 本縫い: サテン（ジグザグ） ---
      const zig = [rs.xs[0], rs.ys[0]];
      let side = 1;
      for (let i = 0; i < m; i++){
        zig.push(rs.xs[i] + nx[i]*wArr[i]*side, rs.ys[i] + ny[i]*wArr[i]*side);
        side = -side;
      }
      zig.push(rs.xs[m-1], rs.ys[m-1]);
      paths.push({ pts: zig, kind: 'satin', noflip: true });
      pen = [zig[zig.length-2], zig[zig.length-1]];
      sewn++;
    }
    return { pen, ok: sewn > 0 };
  }

  function flatXY(xs, ys){
    const out = new Array(xs.length * 2);
    for (let i = 0; i < xs.length; i++){ out[i*2] = xs[i]; out[i*2+1] = ys[i]; }
    return out;
  }

  function resamplePolyline(xs, ys, ws, step, closed){
    const n = xs.length;
    if (n < 2) return null;
    let L = 0;
    const cum = [0];
    for (let i = 1; i < n; i++){
      L += Math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]);
      cum.push(L);
    }
    if (closed){ L += Math.hypot(xs[0]-xs[n-1], ys[0]-ys[n-1]); cum.push(L); }
    if (L < 1e-6) return null;
    const count = Math.max(2, Math.round(L / step) + 1);
    const oxs = [], oys = [], ows = [];
    let seg = 0;
    for (let k = 0; k < count; k++){
      const t = (closed ? L * k / count : L * k / (count - 1));
      while (seg < cum.length - 2 && cum[seg+1] < t) seg++;
      const i0 = seg % n, i1 = (seg + 1) % n;
      const d = cum[seg+1] - cum[seg];
      const f = d > 1e-9 ? (t - cum[seg]) / d : 0;
      oxs.push(xs[i0] + (xs[i1]-xs[i0]) * f);
      oys.push(ys[i0] + (ys[i1]-ys[i0]) * f);
      ows.push(ws[i0] + (ws[i1]-ws[i0]) * f);
    }
    return { xs: oxs, ys: oys, ws: ows };
  }

  function buildManual(comp, W, cellMm, pen, paths){
    // 微小領域: 重心に小さな十字（3針）を打つ
    let sx = 0, sy = 0;
    for (const i of comp.cells){ sx += (i % W) + 0.5; sy += ((i / W) | 0) + 0.5; }
    const cx = sx / comp.cells.length * cellMm, cy = sy / comp.cells.length * cellMm;
    const r = Math.min(0.6, Math.max(0.3, (comp.maxW || 0.8) * 0.35));
    const pts = [cx - r, cy, cx + r, cy, cx, cy - r, cx, cy + r];
    paths.push({ pts, kind: 'manual' });
    return [cx, cy + r];
  }

  // =============================================================
  // 7. メイン: build()
  // =============================================================

  /**
   * 前処理: 微小領域（< minRegionArea）のうち、特定の隣接色に大きく
   * 接しているものはその色へ吸収（リラベリング）する。
   * 減色・背景除去の境界に出るにじみ粒が「浮いた点々」として縫われず、
   * 大きい面の充填に自然に取り込まれる。吸収できない粒はそのまま残し、
   * 後段で手差し/省略の判定を受ける。
   */
  function absorbSpecks(labels, W, H, K, maxCells){
    const out = new Int16Array(labels);
    for (let c = 0; c < K; c++){
      for (const comp of components(labels, W, H, c)){
        if (comp.cells.length > maxCells) continue;
        // 4近傍の隣接ラベルを集計（自色以外）
        const votes = new Map();   // label → count（-1=背景も数える）
        let total = 0;
        for (const i of comp.cells){
          const x = i % W, y = (i / W) | 0;
          for (const j of [x > 0 ? i-1 : -1, x < W-1 ? i+1 : -1,
                           y > 0 ? i-W : -1, y < H-1 ? i+W : -1]){
            if (j < 0) continue;
            const l = labels[j];
            if (l === c) continue;
            votes.set(l, (votes.get(l) || 0) + 1);
            total++;
          }
        }
        if (!total) continue;
        let bestL = null, bestN = 0;
        for (const [l, n] of votes){
          if (l >= 0 && n > bestN){ bestN = n; bestL = l; }
        }
        // 隣接の40%以上が同一色 → 吸収
        if (bestL != null && bestN >= total * 0.40){
          for (const i of comp.cells) out[i] = bestL;
        }
      }
    }
    return out;
  }

  /**
   * @param {object} result  analyze() の結果（W,H,labels,palette）
   * @param {object} params  { style, weight, density, angle }
   * @param {number} widthMm 仕上がり幅
   * @returns {object} msd { machine:true, wMm,hMm, style, groups:[{cluster,paths:[...]}], stats }
   */
  function build(result, params, widthMm){
    // クロスステッチは格子幾何そのもので v2 の恩恵（輪郭・サテン）が無く、
    // 実績のある v1（buildStitches + plan.compile の最近傍チェーン）の方が
    // トリム数が大幅に少ない。呼び出し側で v1 経路を使うこと。
    if (params.style === 'cross'){
      throw new Error('cross スタイルは v1 パイプライン（IT.plan.compile）を使用してください');
    }
    const mp = machineParams(params);

    const { W, H } = result;
    const cellMm = widthMm / W;
    const wMm = widthMm, hMm = cellMm * H;
    const theta = (params.angle || 0) * Math.PI / 180;
    const stats = { fills: 0, satins: 0, borders: 0, manuals: 0, absorbed: 0, dropped: 0, droppedAreaMm2: 0 };

    // 境界ノイズ粒の吸収（minRegionArea 未満のセル数を上限に）
    const maxSpeckCells = Math.max(1, Math.floor(mp.minRegionArea / (cellMm * cellMm)));
    const labels = absorbSpecks(result.labels, W, H, result.palette.length, maxSpeckCells);
    for (let i = 0; i < labels.length; i++) if (labels[i] !== result.labels[i]) stats.absorbed++;

    const groups = [];
    for (let c = 0; c < result.palette.length; c++){
      const entry = result.palette[c];
      const paths = [];
      if (entry && entry.threadId){
        const comps = components(labels, W, H, c);
        // 成分を近い順に処理（左上から greedy）
        let pen = null;
        const remaining = comps.map(cp => {
          let sx = 0, sy = 0;
          for (const i of cp.cells){ sx += i % W; sy += (i / W) | 0; }
          cp.cx = (sx / cp.cells.length + 0.5) * cellMm;
          cp.cy = (sy / cp.cells.length + 0.5) * cellMm;
          return cp;
        });
        const done = new Array(remaining.length).fill(false);
        for (let n = 0; n < remaining.length; n++){
          let bi = -1, bd = Infinity;
          for (let i = 0; i < remaining.length; i++){
            if (done[i]) continue;
            const d = pen ? (remaining[i].cx-pen[0])**2 + (remaining[i].cy-pen[1])**2
                          : remaining[i].cx**2 + remaining[i].cy**2;
            if (d < bd){ bd = d; bi = i; }
          }
          if (bi < 0) break;
          done[bi] = true;
          const comp = remaining[bi];
          const areaMm2 = comp.cells.length * cellMm * cellMm;
          if (areaMm2 < mp.dropArea){ stats.dropped++; stats.droppedAreaMm2 += areaMm2; continue; }

          // セル解像度の距離変換で最大幅を見積もる
          const bw = comp.maxX - comp.minX + 1, bh = comp.maxY - comp.minY + 1;
          const cm = new Uint8Array(bw * bh);
          for (const i of comp.cells) cm[((i / W | 0) - comp.minY) * bw + (i % W - comp.minX)] = 1;
          const cdt = distanceTransform(cm, bw, bh);
          let maxD = 0;
          for (let i = 0; i < cdt.length; i++) if (cm[i] && cdt[i] > maxD) maxD = cdt[i];
          comp.maxW = maxD * 2 * cellMm;

          // --- 分類 ---
          if (areaMm2 < mp.minRegionArea){
            // 1セル幅で細長い微小領域は、減色・背景除去の縁に出る
            // アンチエイリアス由来のスライバー（糸幅より細く縫えない）→ 省略。
            // コンパクトな点（目・ほっぺ等）は手差しで残す。
            const thin = Math.min(bw, bh) <= 1 && Math.max(bw, bh) >= 3;
            if (thin){
              stats.dropped++;
              stats.droppedAreaMm2 += areaMm2;
              continue;
            }
            pen = buildManual(comp, W, cellMm, pen, paths);
            stats.manuals++;
            continue;
          }
          if (comp.maxW <= mp.satinMaxW * 1.25){
            const res = buildSatin(comp, W, cellMm, mp, pen, paths);
            if (res.ok){ pen = res.pen; stats.satins++; continue; }
          }
          // --- タタミ ---
          const rawLoops = traceLoops(comp, W);
          const loops = shapeLoops(rawLoops, cellMm);
          if (!loops.length){
            pen = buildManual(comp, W, cellMm, pen, paths);
            stats.manuals++;
            continue;
          }
          pen = buildTatami(loops, mp, theta, pen, paths) || pen;
          stats.fills++;
          stats.borders += loops.filter(lp => Math.abs(lp.areaMm2) >= mp.borderMinArea).length;
        }
      }
      groups.push({ cluster: c, paths });
    }

    return { machine: true, wMm, hMm, style: 'tatami', groups, stats,
             params: { rowPitch: mp.rowPitch, stitchLen: mp.stitchLen,
                       pullComp: mp.pullComp, satinPull: mp.satinPull } };
  }

  // =============================================================
  // 公開API
  // =============================================================
  IT.digitize = { build, machineParams };
})(typeof window !== 'undefined' ? window : globalThis);
