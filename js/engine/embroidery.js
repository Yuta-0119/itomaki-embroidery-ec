/* =============================================================
   いとまき — 刺繍変換エンジン
   画像 → 減色 → 糸マッピング → ステッチ幾何生成 → Canvas/SVG描画

   パイプライン:
     loadSource()   画像ファイル/DataURL → 作業用キャンバス
     analyze()      減色 + 背景除去 + ノイズ除去 → ラベルマップ
     buildStitches() ラベルマップ → ステッチ線分（mm座標）
     drawStitches() ステッチ → Canvas（プレビュー）
     toSVG()        ステッチ → 製作用SVG（糸情報つき）

   同じ画像・同じ設定なら常に同じ結果になる（乱数は固定シード）。
   ============================================================= */
window.IT = window.IT || {};

(function(){
  'use strict';

  const CELLS_MAX = 120;       // ラベルマップの最大セル数（長辺）
  const KMEANS_ITERS = 8;

  // ---- 固定シード乱数（決定性の要）----
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =============================================================
  // 1. 画像読み込み
  // =============================================================

  /** File / Blob / DataURL → {canvas, w, h}（長辺1000pxまで縮小） */
  async function loadSource(src){
    const url = (src instanceof Blob) ? URL.createObjectURL(src) : src;
    try{
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('画像を読み込めませんでした'));
        im.src = url;
      });
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('画像サイズを取得できませんでした');
      const MAX = 1000;
      const sc = Math.min(1, MAX / Math.max(w, h));
      w = Math.max(1, Math.round(w * sc));
      h = Math.max(1, Math.round(h * sc));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      return { canvas: cv, w, h };
    } finally {
      if (src instanceof Blob) URL.revokeObjectURL(url);
    }
  }

  /** 高品質縮小（2段階ハーフリング） */
  function downscale(srcCanvas, tw, th){
    let cur = srcCanvas;
    while (cur.width > tw * 2 && cur.height > th * 2){
      const c = document.createElement('canvas');
      c.width = Math.max(tw, Math.round(cur.width / 2));
      c.height = Math.max(th, Math.round(cur.height / 2));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
    }
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, tw, th);
    return out;
  }

  // =============================================================
  // 2. 解析（背景除去 → 減色 → 糸マッピング → ノイズ除去）
  // =============================================================

  /**
   * @param {HTMLCanvasElement} srcCanvas loadSource() の結果
   * @param {object} opts { colors:2-10, removeBg:bool, bgTol:0-100 }
   * @returns {object} result {
   *   W,H, labels:Int16Array(-1=背景),
   *   palette:[{threadId,count}], coverage, srcAspect
   * }
   */
  function analyze(srcCanvas, opts){
    const K = Math.max(2, Math.min(10, opts.colors || 6));
    const aspect = srcCanvas.height / srcCanvas.width;
    let W, H;
    if (aspect >= 1){ H = CELLS_MAX; W = Math.max(8, Math.round(CELLS_MAX / aspect)); }
    else            { W = CELLS_MAX; H = Math.max(8, Math.round(CELLS_MAX * aspect)); }

    const small = downscale(srcCanvas, W, H);
    const data = small.getContext('2d').getImageData(0, 0, W, H).data;
    const N = W * H;

    // ピクセル配列（半透明は白の上に合成した色として扱う）
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    const bg = new Uint8Array(N);   // 1 = 背景
    let hasAlpha = false;
    for (let i = 0; i < N; i++){
      const a = data[i*4+3] / 255;
      if (a < 0.95) hasAlpha = true;
      R[i] = data[i*4]   * a + 255 * (1 - a);
      G[i] = data[i*4+1] * a + 255 * (1 - a);
      B[i] = data[i*4+2] * a + 255 * (1 - a);
      if (a < 0.5) bg[i] = 1;      // PNG等の透過はそのまま背景
    }

    // --- 背景除去（外周からの領域拡張）---
    if (opts.removeBg && !hasAlpha){
      floodBackground(R, G, B, bg, W, H, opts.bgTol == null ? 40 : opts.bgTol);
    }

    // --- 減色対象ピクセル収集 ---
    const idxs = [];
    for (let i = 0; i < N; i++) if (!bg[i]) idxs.push(i);
    if (idxs.length < 12){
      return { W, H, labels: new Int16Array(N).fill(-1), palette: [], coverage: 0, srcAspect: aspect };
    }

    // --- メディアンカットで初期中心 → k-means ---
    let cents = medianCutSeeds(R, G, B, idxs, K);
    cents = kmeans(R, G, B, idxs, cents);

    // --- ラベル割当 ---
    const labels = new Int16Array(N).fill(-1);
    for (const i of idxs){
      let best = 0, bd = Infinity;
      for (let c = 0; c < cents.length; c++){
        const dr = R[i]-cents[c][0], dg = G[i]-cents[c][1], db = B[i]-cents[c][2];
        const d = dr*dr*2 + dg*dg*4 + db*db*3;
        if (d < bd){ bd = d; best = c; }
      }
      labels[i] = best;
    }

    // --- ノイズ除去（3×3多数決 ×2 + ピンホール埋め）---
    majorityFilter(labels, W, H, 2);

    // --- クラスタ → 糸マッピング（重複回避）---
    const counts = new Array(cents.length).fill(0);
    for (let i = 0; i < N; i++) if (labels[i] >= 0) counts[labels[i]]++;

    const order = cents.map((_, c) => c).sort((a, b) => counts[b] - counts[a]);
    const used = new Set();
    const threadOf = new Array(cents.length).fill(null);
    for (const c of order){
      if (counts[c] === 0) continue;
      const t = IT.nearestThread(cents[c][0], cents[c][1], cents[c][2], used) ||
                IT.nearestThread(cents[c][0], cents[c][1], cents[c][2], null);
      threadOf[c] = t.id;
      used.add(t.id);
    }

    const palette = cents.map((_, c) => ({ threadId: threadOf[c], count: counts[c] }));
    const covered = counts.reduce((s, v) => s + v, 0);

    return { W, H, labels, palette, coverage: covered / N, srcAspect: aspect };
  }

  /** 外周シードの領域拡張で背景を推定 */
  function floodBackground(R, G, B, bg, W, H, tol){
    // 四隅 8×8 の平均色をシード色に
    const corners = [[0,0],[W-8,0],[0,H-8],[W-8,H-8]].map(([sx,sy]) => {
      let r=0,g=0,b=0,n=0;
      for (let y=sy; y<Math.min(H,sy+8); y++)
        for (let x=sx; x<Math.min(W,sx+8); x++){
          const i=y*W+x; r+=R[i]; g+=G[i]; b+=B[i]; n++;
        }
      return [r/n, g/n, b/n];
    });
    const t2 = Math.pow(30 + tol * 2.2, 2);  // tol 0-100 → 距離しきい値
    const near = (i, c) => {
      const dr=R[i]-c[0], dg=G[i]-c[1], db=B[i]-c[2];
      return (dr*dr*2 + dg*dg*4 + db*db*3) / 9 < t2;
    };
    const queue = [];
    const seen = new Uint8Array(W*H);
    // 外周すべてをシード候補に
    for (let x=0; x<W; x++){
      for (const y of [0, H-1]){
        const i = y*W+x;
        for (const c of corners) if (near(i,c)){ queue.push([i,c]); seen[i]=1; break; }
      }
    }
    for (let y=0; y<H; y++){
      for (const x of [0, W-1]){
        const i = y*W+x;
        if (!seen[i]) for (const c of corners) if (near(i,c)){ queue.push([i,c]); seen[i]=1; break; }
      }
    }
    while (queue.length){
      const [i, c] = queue.pop();
      bg[i] = 1;
      const x = i % W, y = (i / W) | 0;
      const nb = [];
      if (x>0) nb.push(i-1);
      if (x<W-1) nb.push(i+1);
      if (y>0) nb.push(i-W);
      if (y<H-1) nb.push(i+W);
      for (const j of nb){
        if (!seen[j] && near(j, c)){ seen[j] = 1; queue.push([j, c]); }
      }
    }
  }

  /** メディアンカット: 初期クラスタ中心を安定的に決める */
  function medianCutSeeds(R, G, B, idxs, K){
    let boxes = [idxs.slice()];
    while (boxes.length < K){
      // いちばん分散の大きい箱を選ぶ
      let bi = -1, bRange = -1, bCh = 0;
      for (let i = 0; i < boxes.length; i++){
        const box = boxes[i];
        if (box.length < 2) continue;
        const mins = [255,255,255], maxs = [0,0,0];
        for (const p of box){
          if (R[p]<mins[0])mins[0]=R[p]; if (R[p]>maxs[0])maxs[0]=R[p];
          if (G[p]<mins[1])mins[1]=G[p]; if (G[p]>maxs[1])maxs[1]=G[p];
          if (B[p]<mins[2])mins[2]=B[p]; if (B[p]>maxs[2])maxs[2]=B[p];
        }
        for (let ch = 0; ch < 3; ch++){
          const r = maxs[ch]-mins[ch];
          if (r > bRange){ bRange = r; bi = i; bCh = ch; }
        }
      }
      if (bi < 0 || bRange < 4) break;   // これ以上分けられない
      const box = boxes[bi];
      const chan = bCh === 0 ? R : bCh === 1 ? G : B;
      box.sort((a, b) => chan[a] - chan[b]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => {
      let r=0,g=0,b=0;
      for (const p of box){ r+=R[p]; g+=G[p]; b+=B[p]; }
      return [r/box.length, g/box.length, b/box.length];
    });
  }

  function kmeans(R, G, B, idxs, cents){
    const K = cents.length;
    const asg = new Int16Array(idxs.length);
    for (let it = 0; it < KMEANS_ITERS; it++){
      // 割当
      for (let n = 0; n < idxs.length; n++){
        const i = idxs[n];
        let best=0, bd=Infinity;
        for (let c = 0; c < K; c++){
          const dr=R[i]-cents[c][0], dg=G[i]-cents[c][1], db=B[i]-cents[c][2];
          const d = dr*dr*2 + dg*dg*4 + db*db*3;
          if (d < bd){ bd = d; best = c; }
        }
        asg[n] = best;
      }
      // 更新
      const sum = Array.from({length:K}, () => [0,0,0,0]);
      for (let n = 0; n < idxs.length; n++){
        const i = idxs[n], s = sum[asg[n]];
        s[0]+=R[i]; s[1]+=G[i]; s[2]+=B[i]; s[3]++;
      }
      for (let c = 0; c < K; c++){
        if (sum[c][3] > 0){
          cents[c] = [sum[c][0]/sum[c][3], sum[c][1]/sum[c][3], sum[c][2]/sum[c][3]];
        }
      }
    }
    return cents;
  }

  /** 3×3多数決フィルタ + 背景ピンホール埋め */
  function majorityFilter(labels, W, H, passes){
    const tmp = new Int16Array(labels.length);
    for (let p = 0; p < passes; p++){
      tmp.set(labels);
      for (let y = 0; y < H; y++){
        for (let x = 0; x < W; x++){
          const i = y*W + x;
          const votes = {};
          let nonBg = 0, total = 0;
          for (let dy = -1; dy <= 1; dy++){
            for (let dx = -1; dx <= 1; dx++){
              const nx = x+dx, ny = y+dy;
              if (nx<0||ny<0||nx>=W||ny>=H) continue;
              total++;
              const l = tmp[ny*W+nx];
              if (l >= 0){ nonBg++; votes[l] = (votes[l]||0) + 1; }
            }
          }
          if (tmp[i] >= 0){
            // 非背景セル: 多数派に寄せる（自分票+1で安定化）
            votes[tmp[i]] = (votes[tmp[i]]||0) + 1;
            let bestL = tmp[i], bestV = -1;
            for (const k in votes){ if (votes[k] > bestV){ bestV = votes[k]; bestL = +k; } }
            // 周囲がほぼ背景なら孤立点として消す
            labels[i] = (nonBg <= 2) ? -1 : bestL;
          } else {
            // 背景セル: 周囲がほぼ同色ならピンホールとして埋める
            if (nonBg >= total - 1 && nonBg > 0){
              let bestL = -1, bestV = 0;
              for (const k in votes){ if (votes[k] > bestV){ bestV = votes[k]; bestL = +k; } }
              if (bestV >= total - 2) labels[i] = bestL;
            }
          }
        }
      }
    }
  }

  // =============================================================
  // 3. ステッチ幾何生成
  // =============================================================

  const WEIGHTS = {
    thin:   { lineMm: 0.45, stitchMm: 2.6, label:'細め' },
    normal: { lineMm: 0.60, stitchMm: 3.0, label:'ふつう' },
    thick:  { lineMm: 0.80, stitchMm: 3.4, label:'太め' },
  };
  const DENSITIES = {
    coarse: { f: 1.75, label:'あらめ' },
    normal: { f: 1.30, label:'ふつう' },
    fine:   { f: 1.00, label:'ぎっしり' },
  };

  /**
   * ラベルマップ → ステッチ線分（実寸mm座標）
   * @param {object} result analyze()の結果
   * @param {object} params { style:'tatami'|'cross', weight, density, angle(deg) }
   * @param {number} widthMm 仕上がり幅
   * @returns {object} { wMm, hMm, lineMm, groups:[{cluster, segs:number[]}], stitchCount }
   */
  function buildStitches(result, params, widthMm){
    const { W, H, labels } = result;
    const rnd = mulberry32(0xC0FFEE);
    const cellMm = widthMm / W;
    const wMm = widthMm, hMm = cellMm * H;
    const wt = WEIGHTS[params.weight] || WEIGHTS.normal;
    const dn = DENSITIES[params.density] || DENSITIES.normal;
    const theta = (params.angle || 0) * Math.PI / 180;
    const cos = Math.cos(theta), sin = Math.sin(theta);

    const K = result.palette.length;
    const groups = Array.from({length: K}, (_, c) => ({ cluster: c, segs: [] }));

    const labelAt = (xMm, yMm) => {
      const ix = Math.floor(xMm / cellMm), iy = Math.floor(yMm / cellMm);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return -1;
      return labels[iy * W + ix];
    };

    // 回転座標系の範囲（4隅を射影）
    const corners = [[0,0],[wMm,0],[0,hMm],[wMm,hMm]];
    let uMin=Infinity, uMax=-Infinity, vMin=Infinity, vMax=-Infinity;
    for (const [x,y] of corners){
      const u = x*cos + y*sin, v = -x*sin + y*cos;
      if (u<uMin)uMin=u; if (u>uMax)uMax=u;
      if (v<vMin)vMin=v; if (v>vMax)vMax=v;
    }
    const toXY = (u, v) => [u*cos - v*sin, u*sin + v*cos];

    let stitchCount = 0;

    if (params.style === 'cross'){
      // ---- クロスステッチ ----
      const gs = Math.max(1.5, wt.lineMm * 3.0) * dn.f;   // グリッド間隔
      const arm = gs * 0.46;
      const d1 = [Math.cos(theta + Math.PI/4), Math.sin(theta + Math.PI/4)];
      const d2 = [Math.cos(theta - Math.PI/4), Math.sin(theta - Math.PI/4)];
      for (let v = vMin + gs/2; v <= vMax; v += gs){
        for (let u = uMin + gs/2; u <= uMax; u += gs){
          const [x, y] = toXY(u, v);
          const c = labelAt(x, y);
          if (c < 0) continue;
          const a = arm * (0.9 + rnd() * 0.2);
          const jx = (rnd()-0.5) * gs * 0.12, jy = (rnd()-0.5) * gs * 0.12;
          const cx = x + jx, cy = y + jy;
          groups[c].segs.push(cx - d1[0]*a, cy - d1[1]*a, cx + d1[0]*a, cy + d1[1]*a);
          groups[c].segs.push(cx - d2[0]*a, cy - d2[1]*a, cx + d2[0]*a, cy + d2[1]*a);
          stitchCount += 2;
        }
      }
    } else {
      // ---- タタミ縫い（平行ステッチ + レンガ状オフセット）----
      const rowGap = wt.lineMm * dn.f;
      const su = Math.min(cellMm * 0.5, 0.4);   // スキャン刻み
      const sLen = wt.stitchMm;
      let rowIdx = 0;
      for (let v = vMin + rowGap/2; v <= vMax; v += rowGap, rowIdx++){
        const phase = (rowIdx % 2) * sLen / 2;
        let runC = -1, runStart = 0;
        const flush = (uEnd) => {
          if (runC < 0) return;
          const runLen = uEnd - runStart;
          if (runLen < 0.5){ runC = -1; return; }
          // ステッチ境界（レンガ配置: uMin基準の絶対位相）
          let pos = runStart;
          const segs = groups[runC].segs;
          while (pos < uEnd - 0.01){
            let next = pos + (sLen - ((pos - uMin + phase) % sLen));
            if (next - pos < sLen * 0.3) next += sLen;           // 極端な短針を避ける
            next = Math.min(next, uEnd);
            const jv = (rnd() - 0.5) * 0.14;
            const [x1, y1] = toXY(pos,  v + jv);
            const [x2, y2] = toXY(next, v + jv);
            segs.push(x1, y1, x2, y2);
            stitchCount++;
            pos = next;
          }
          runC = -1;
        };
        for (let u = uMin; u <= uMax + su; u += su){
          const [x, y] = toXY(u, v);
          const c = u > uMax ? -1 : labelAt(x, y);
          if (c !== runC){
            flush(u);
            if (c >= 0){ runC = c; runStart = u; }
          }
        }
        flush(uMax);
      }
    }

    return { wMm, hMm, lineMm: wt.lineMm, style: params.style, groups, stitchCount };
  }

  // =============================================================
  // 4. Canvas描画（糸の艶・立体感つき）
  // =============================================================

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} sd buildStitches()の結果
   * @param {object} result analyze()の結果（糸色参照用）
   * @param {object} opts { pxPerMm, bg:null|'#hex', padMm, threadOverride:{cluster:threadId} }
   */
  function drawStitches(canvas, sd, result, opts){
    const s = opts.pxPerMm;
    const pad = (opts.padMm != null ? opts.padMm : 2) * s;
    const w = Math.max(2, Math.ceil(sd.wMm * s + pad * 2));
    const h = Math.max(2, Math.ceil(sd.hMm * s + pad * 2));
    const dpr = opts.dpr || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    if (opts.cssSize !== false){
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (opts.bg){
      g.fillStyle = opts.bg;
      g.fillRect(0, 0, w, h);
    }
    g.translate(pad, pad);
    g.lineCap = 'round';

    const rnd = mulberry32(0x5EED);
    const lw = Math.max(0.7, sd.lineMm * s);

    // 大きい面から描く（細部が上に載る）
    const order = sd.groups.map((_, i) => i)
      .sort((a, b) => sd.groups[b].segs.length - sd.groups[a].segs.length);

    for (const gi of order){
      const grp = sd.groups[gi];
      if (!grp.segs.length) continue;
      const entry = result.palette[grp.cluster];
      if (!entry) continue;
      const tid = (opts.threadOverride && opts.threadOverride[grp.cluster]) || entry.threadId;
      const t = IT.threadById[tid];
      if (!t) continue;

      const segs = grp.segs;
      // 影（下側にわずかな落ち影 → 立体感）
      g.strokeStyle = 'rgba(60,40,20,.13)';
      g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i < segs.length; i += 4){
        g.moveTo(segs[i]*s + 0.7, segs[i+1]*s + 0.9);
        g.lineTo(segs[i+2]*s + 0.7, segs[i+3]*s + 0.9);
      }
      g.stroke();

      // 本体（1本ごとに明度を揺らす → 糸らしさ）
      const shades = [
        shade(t, -14), shade(t, -6), `rgb(${t.r},${t.g},${t.b})`, shade(t, 7), shade(t, 14),
      ];
      const buckets = shades.map(() => []);
      for (let i = 0; i < segs.length; i += 4){
        buckets[(rnd() * shades.length) | 0].push(i);
      }
      for (let b = 0; b < shades.length; b++){
        if (!buckets[b].length) continue;
        g.strokeStyle = shades[b];
        g.lineWidth = lw;
        g.beginPath();
        for (const i of buckets[b]){
          g.moveTo(segs[i]*s, segs[i+1]*s);
          g.lineTo(segs[i+2]*s, segs[i+3]*s);
        }
        g.stroke();
      }

      // ハイライト（中央の細い光沢線）
      g.strokeStyle = 'rgba(255,255,255,.30)';
      g.lineWidth = Math.max(0.5, lw * 0.32);
      g.beginPath();
      for (let i = 0; i < segs.length; i += 4){
        const x1 = segs[i], y1 = segs[i+1], x2 = segs[i+2], y2 = segs[i+3];
        g.moveTo((x1 + (x2-x1)*0.18)*s, (y1 + (y2-y1)*0.18)*s);
        g.lineTo((x1 + (x2-x1)*0.82)*s, (y1 + (y2-y1)*0.82)*s);
      }
      g.stroke();
    }
    return { w, h, padPx: pad };
  }

  function shade(t, amt){
    const c = v => Math.max(0, Math.min(255, Math.round(v + amt)));
    return `rgb(${c(t.r)},${c(t.g)},${c(t.b)})`;
  }

  // =============================================================
  // 5. SVG書き出し（製作用データ）
  // =============================================================

  function toSVG(sd, result, meta){
    const r2 = v => Math.round(v * 100) / 100;
    const threads = [];
    const paths = [];
    for (const grp of sd.groups){
      if (!grp.segs.length) continue;
      const entry = result.palette[grp.cluster];
      const t = IT.threadById[(meta.threadOverride && meta.threadOverride[grp.cluster]) || entry.threadId];
      let d = '';
      for (let i = 0; i < grp.segs.length; i += 4){
        d += `M${r2(grp.segs[i])} ${r2(grp.segs[i+1])}L${r2(grp.segs[i+2])} ${r2(grp.segs[i+3])}`;
      }
      threads.push({ code: t.code, name: t.name, hex: t.hex, stitches: grp.segs.length / 4 });
      paths.push(
        `<g inkscape:label="${t.code} ${t.name}" data-thread="${t.code}" data-name="${t.name}" fill="none" stroke="${t.hex}" stroke-width="${sd.lineMm}" stroke-linecap="round"><path d="${d}"/></g>`
      );
    }
    const metaJson = JSON.stringify({
      generator: 'itomaki embroidery engine v1',
      sizeMm: { w: r2(sd.wMm), h: r2(sd.hMm) },
      style: sd.style, stitchCount: sd.stitchCount,
      threads, params: meta.params || null, product: meta.product || null,
    }, null, 1).replace(/--/g, '\\u002d\\u002d');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  width="${r2(sd.wMm)}mm" height="${r2(sd.hMm)}mm" viewBox="0 0 ${r2(sd.wMm)} ${r2(sd.hMm)}">
<title>いとまき 刺繍データ（1単位 = 1mm）</title>
<desc>ステッチ座標はmm。各グループが1色の糸に対応します。</desc>
<metadata><![CDATA[${metaJson}]]></metadata>
${paths.join('\n')}
</svg>`;
  }

  // =============================================================
  // 6. ラベルマップのRLE圧縮（カート/注文保存用）
  // =============================================================

  function rleEncode(labels){
    const bytes = [];
    let i = 0;
    while (i < labels.length){
      const v = labels[i];
      let run = 1;
      while (i + run < labels.length && labels[i + run] === v && run < 255) run++;
      bytes.push(run, v + 1);   // -1 → 0
      i += run;
    }
    let bin = '';
    const u8 = new Uint8Array(bytes);
    for (let j = 0; j < u8.length; j += 8192){
      bin += String.fromCharCode.apply(null, u8.subarray(j, j + 8192));
    }
    return btoa(bin);
  }

  function rleDecode(b64, length){
    const bin = atob(b64);
    const out = new Int16Array(length);
    let p = 0;
    for (let i = 0; i + 1 < bin.length; i += 2){
      const run = bin.charCodeAt(i), v = bin.charCodeAt(i + 1) - 1;
      for (let r = 0; r < run && p < length; r++) out[p++] = v;
    }
    return out;
  }

  // =============================================================
  // 7. おまかせ調整（画像を見てパラメータを提案）
  // =============================================================

  function autoParams(srcCanvas){
    const S = 48;
    const small = downscale(srcCanvas, S, S);
    const d = small.getContext('2d').getImageData(0, 0, S, S).data;
    const hist = {};
    let total = 0, alphaCnt = 0;
    for (let i = 0; i < S*S; i++){
      const a = d[i*4+3];
      if (a < 128){ alphaCnt++; continue; }
      const key = ((d[i*4] >> 5) << 6) | ((d[i*4+1] >> 5) << 3) | (d[i*4+2] >> 5);
      hist[key] = (hist[key] || 0) + 1;
      total++;
    }
    const sorted = Object.values(hist).sort((a, b) => b - a);
    let cum = 0, n = 0;
    for (const v of sorted){ cum += v; n++; if (cum >= total * 0.93) break; }
    const colors = Math.max(2, Math.min(9, n));

    // 四隅が似た色なら背景除去を提案（透過画像なら不要）
    let removeBg = false;
    if (alphaCnt < S*S*0.02){
      const corner = (sx, sy) => {
        let r=0,g=0,b=0,c=0;
        for (let y=sy; y<sy+6; y++) for (let x=sx; x<sx+6; x++){
          const i=(y*S+x)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; c++;
        }
        return [r/c,g/c,b/c];
      };
      const cs = [corner(0,0), corner(S-6,0), corner(0,S-6), corner(S-6,S-6)];
      let maxD = 0;
      for (let i = 0; i < 4; i++) for (let j = i+1; j < 4; j++){
        const dd = Math.abs(cs[i][0]-cs[j][0]) + Math.abs(cs[i][1]-cs[j][1]) + Math.abs(cs[i][2]-cs[j][2]);
        maxD = Math.max(maxD, dd);
      }
      removeBg = maxD < 90;   // 四隅がほぼ同色 → 単色背景と判断
    }
    return { colors, removeBg };
  }

  // =============================================================
  // 公開API
  // =============================================================
  IT.emb = {
    loadSource, analyze, buildStitches, drawStitches, toSVG,
    rleEncode, rleDecode, autoParams,
    WEIGHTS, DENSITIES,
    /** 保存済みデザイン（labels RLE）から再解析なしでプレビュー描画 */
    renderSaved(canvas, design, pxPx){
      const result = {
        W: design.labels.w, H: design.labels.h,
        labels: rleDecode(design.labels.rle, design.labels.w * design.labels.h),
        palette: design.palette.map(p => ({ threadId: p.threadId, count: p.count })),
      };
      const sd = buildStitches(result, design.params, design.widthMm);
      const pxPerMm = pxPx / Math.max(sd.wMm, sd.hMm);
      drawStitches(canvas, sd, result, { pxPerMm, bg: null, padMm: 1.5 });
      return { sd, result };
    },
  };
})();
