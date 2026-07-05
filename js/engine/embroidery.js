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

  const CELLS_MAX = 168;       // ラベルマップの最大セル数（長辺）
  const SS = 3;                // 1セルあたり3×3サブピクセルで解析（細い線の検出用）
  const KMEANS_ITERS = 10;

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
   * @param {object} opts { colors:2-12, removeBg:bool, bgTol:0-100, lineBoost:bool }
   * @returns {object} result {
   *   W,H, labels:Int16Array(-1=背景),
   *   palette:[{threadId,count}], coverage, srcAspect
   * }
   *
   * 余白の大きい画像（写真の中央に小さくロゴ、など）は
   * 1回目の解析で被写体の範囲を特定 → 切り抜いて再解析する2パス方式。
   * 解析グリッド168セルを被写体だけに使えるため、文字や細部の
   * 実効解像度が大きく上がり、サイズ指定もモチーフ実寸に一致する。
   */
  function analyze(srcCanvas, opts){
    const first = analyzeOnce(srcCanvas, opts);
    if (opts.noCrop || !first.palette.length) return first;

    // 被写体のバウンディングボックス（セル座標）
    const { W, H, labels } = first;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++){
      for (let x = 0; x < W; x++){
        if (labels[y*W + x] >= 0){
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return first;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    // 余白が少なければそのまま（両軸とも82%以上を使えている場合）
    if ((bw >= W * 0.82 && bh >= H * 0.82) || bw < 8 || bh < 8) return first;

    // セル座標 → 元画像ピクセルへ（3セルぶんの余裕をつけて切り抜き）
    const sx = srcCanvas.width / W, sy = srcCanvas.height / H;
    const pad = 3;
    const cx0 = Math.max(0, Math.floor((minX - pad) * sx));
    const cy0 = Math.max(0, Math.floor((minY - pad) * sy));
    const cx1 = Math.min(srcCanvas.width,  Math.ceil((maxX + 1 + pad) * sx));
    const cy1 = Math.min(srcCanvas.height, Math.ceil((maxY + 1 + pad) * sy));
    if (cx1 - cx0 < 16 || cy1 - cy0 < 16) return first;

    const cropped = document.createElement('canvas');
    cropped.width = cx1 - cx0;
    cropped.height = cy1 - cy0;
    cropped.getContext('2d').drawImage(srcCanvas,
      cx0, cy0, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);

    // 切り抜き後にフル解像度で再解析
    return analyzeOnce(cropped, opts);
  }

  function analyzeOnce(srcCanvas, opts){
    const K = Math.max(2, Math.min(12, opts.colors || 6));
    const lineBoost = opts.lineBoost !== false;   // 省略時ON（イラスト向け既定）
    const aspect = srcCanvas.height / srcCanvas.width;
    let W, H;
    if (aspect >= 1){ H = CELLS_MAX; W = Math.max(8, Math.round(CELLS_MAX / aspect)); }
    else            { W = CELLS_MAX; H = Math.max(8, Math.round(CELLS_MAX * aspect)); }

    // 3×3サブピクセルで統計を取る（平均だけだと細い線・小さな目が消える）
    const SW = W * SS, SH = H * SS;
    const small = downscale(srcCanvas, SW, SH);
    const data = small.getContext('2d').getImageData(0, 0, SW, SH).data;
    const N = W * H;

    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    const bg = new Uint8Array(N);                 // 1 = 背景
    const dR = new Float32Array(N), dG = new Float32Array(N), dB = new Float32Array(N); // セル内最暗色
    const darkFrac = new Float32Array(N);         // 暗いサブピクセルの割合
    const darkDelta = new Float32Array(N);        // 平均輝度 − 最暗輝度
    let hasAlpha = false;

    const lumas = new Float32Array(SS * SS);
    for (let cy = 0; cy < H; cy++){
      for (let cx = 0; cx < W; cx++){
        const ci = cy * W + cx;
        let sr = 0, sg = 0, sb = 0, aSum = 0, n = 0;
        let minL = 1e9, mr = 255, mg = 255, mb = 255;
        for (let sy = 0; sy < SS; sy++){
          const rowBase = ((cy * SS + sy) * SW + cx * SS) * 4;
          for (let sx = 0; sx < SS; sx++){
            const p = rowBase + sx * 4;
            const a = data[p + 3] / 255;
            if (a < 0.95) hasAlpha = true;
            // 半透明は白の上に合成した色として扱う
            const r = data[p]     * a + 255 * (1 - a);
            const g = data[p + 1] * a + 255 * (1 - a);
            const b = data[p + 2] * a + 255 * (1 - a);
            const L = 0.299 * r + 0.587 * g + 0.114 * b;
            lumas[n] = L;
            sr += r; sg += g; sb += b; aSum += a; n++;
            if (L < minL){ minL = L; mr = r; mg = g; mb = b; }
          }
        }
        R[ci] = sr / n; G[ci] = sg / n; B[ci] = sb / n;
        dR[ci] = mr; dG[ci] = mg; dB[ci] = mb;
        const meanL = 0.299 * R[ci] + 0.587 * G[ci] + 0.114 * B[ci];
        let dc = 0;
        for (let k = 0; k < n; k++) if (lumas[k] < meanL - 46) dc++;
        darkFrac[ci] = dc / n;
        darkDelta[ci] = meanL - minL;
        if (aSum / n < 0.5) bg[ci] = 1;           // PNG等の透過はそのまま背景
      }
    }

    // --- OKLab配列（背景判定・減色・糸マッピングをすべて知覚色差で行う） ---
    const OK = new Float32Array(N * 3);
    const setOk = i => {
      const o = IT.color.srgbToOklab(R[i], G[i], B[i]);
      OK[i*3] = o[0]; OK[i*3+1] = o[1]; OK[i*3+2] = o[2];
    };
    for (let i = 0; i < N; i++) setOk(i);

    // --- 背景除去（境界リングモデル + 領域拡張 + 白フチ浸食） ---
    if (opts.removeBg && !hasAlpha){
      floodBackground(OK, bg, W, H, opts.bgTol == null ? 40 : opts.bgTol);
    }

    // --- 線画強調: 暗い線が通るセルは暗色側に寄せて、輪郭・目・文字を保持 ---
    if (lineBoost){
      for (let i = 0; i < N; i++){
        if (bg[i]) continue;
        if (darkDelta[i] > 48 && darkFrac[i] >= 0.08){
          const w = Math.min(0.7, darkFrac[i] * 2.2) * Math.min(1, (darkDelta[i] - 48) / 80);
          R[i] = R[i] * (1 - w) + dR[i] * w;
          G[i] = G[i] * (1 - w) + dG[i] * w;
          B[i] = B[i] * (1 - w) + dB[i] * w;
          setOk(i);
        }
      }
    }

    // --- 減色対象ピクセル収集 ---
    const idxs = [];
    for (let i = 0; i < N; i++) if (!bg[i]) idxs.push(i);
    if (idxs.length < 12){
      return { W, H, labels: new Int16Array(N).fill(-1), palette: [], coverage: 0, srcAspect: aspect };
    }

    // --- オーバークラスタリング(K+6) → 知覚的マージで K 色へ ---
    // 面積の小さい部分（目・口・ワンポイント）も、色が際立っていれば
    // 独立クラスタとして生き残れる
    const K2 = Math.min(16, K + 6);
    let cents = medianCutSeeds(OK, idxs, K2);
    cents = kmeans(OK, idxs, cents);
    let clusters = buildClusters(OK, R, G, B, idxs, cents).filter(c => c.count > 0);

    while (clusters.length > K){
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < clusters.length; i++){
        for (let j = i + 1; j < clusters.length; j++){
          const d = IT.color.dist2(clusters[i].ok, clusters[j].ok);
          if (d < bd){ bd = d; bi = i; bj = j; }
        }
      }
      const a = clusters[bi], b = clusters[bj];
      const total = a.count + b.count;
      for (let ch = 0; ch < 3; ch++){
        a.ok[ch] = (a.ok[ch] * a.count + b.ok[ch] * b.count) / total;
      }
      a.r = (a.r * a.count + b.r * b.count) / total;
      a.g = (a.g * a.count + b.g * b.count) / total;
      a.b = (a.b * a.count + b.b * b.count) / total;
      a.count = total;
      clusters.splice(bj, 1);
    }

    // --- ラベル割当（統合後の重心で再割当） ---
    const labels = new Int16Array(N).fill(-1);
    for (const i of idxs){
      const o0 = OK[i*3], o1 = OK[i*3+1], o2 = OK[i*3+2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < clusters.length; c++){
        const ok = clusters[c].ok;
        const d0 = o0-ok[0], d1 = o1-ok[1], d2 = o2-ok[2];
        const d = d0*d0 + d1*d1 + d2*d2;
        if (d < bd){ bd = d; best = c; }
      }
      labels[i] = best;
    }

    // --- ノイズ除去（コントラスト保護つき多数決 + ピンホール埋め） ---
    majorityFilter(labels, W, H, clusters, 2);

    // --- クラスタ → 糸マッピング（重複回避・OKLab色差） ---
    const counts = new Array(clusters.length).fill(0);
    for (let i = 0; i < N; i++) if (labels[i] >= 0) counts[labels[i]]++;

    const order = clusters.map((_, c) => c).sort((a, b) => counts[b] - counts[a]);
    const used = new Set();
    const threadOf = new Array(clusters.length).fill(null);
    for (const c of order){
      if (counts[c] === 0) continue;
      const t = IT.nearestThread(clusters[c].r, clusters[c].g, clusters[c].b, used) ||
                IT.nearestThread(clusters[c].r, clusters[c].g, clusters[c].b, null);
      threadOf[c] = t.id;
      used.add(t.id);
    }

    const palette = clusters.map((_, c) => ({ threadId: threadOf[c], count: counts[c] }));
    const covered = counts.reduce((s, v) => s + v, 0);

    return { W, H, labels, palette, coverage: covered / N, srcAspect: aspect };
  }

  /** クラスタ統計（OKLab重心・sRGB重心・件数）を作る */
  function buildClusters(OK, R, G, B, idxs, cents){
    const K = cents.length;
    const sum = Array.from({ length: K }, () => [0,0,0, 0,0,0, 0]);
    for (const i of idxs){
      const o0 = OK[i*3], o1 = OK[i*3+1], o2 = OK[i*3+2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < K; c++){
        const d0 = o0-cents[c][0], d1 = o1-cents[c][1], d2 = o2-cents[c][2];
        const d = d0*d0 + d1*d1 + d2*d2;
        if (d < bd){ bd = d; best = c; }
      }
      const s = sum[best];
      s[0] += o0; s[1] += o1; s[2] += o2;
      s[3] += R[i]; s[4] += G[i]; s[5] += B[i];
      s[6]++;
    }
    return sum.map(s => ({
      ok: s[6] ? [s[0]/s[6], s[1]/s[6], s[2]/s[6]] : [0,0,0],
      r: s[6] ? s[3]/s[6] : 0,
      g: s[6] ? s[4]/s[6] : 0,
      b: s[6] ? s[5]/s[6] : 0,
      count: s[6],
    }));
  }

  /**
   * 背景除去（白抜き）:
   *  1. 画像の外周リングから背景色モデルを最大3つ推定（グラデ・角ごとの色違いに対応）
   *  2. 外周から領域拡張。モデル一致 or「なだらかに連続 + ゆるいモデル一致」で伸ばす
   *  3. 被写体のふちに残るにじみ（アンチエイリアスの白フチ）を浸食して除去
   * 内側に閉じた白（目の白目など）は外周とつながらないため残る。
   */
  function floodBackground(OK, bg, W, H, tol){
    const N = W * H;
    // --- 1) 背景色モデル ---
    const models = [];
    const addSample = i => {
      if (bg[i]) return;
      const o0 = OK[i*3], o1 = OK[i*3+1], o2 = OK[i*3+2];
      for (const m of models){
        const d0 = o0-m.ok[0], d1 = o1-m.ok[1], d2 = o2-m.ok[2];
        if (d0*d0 + d1*d1 + d2*d2 < 0.0049){   // ≈ΔE 0.07 以内は同一モデル
          m.n++;
          m.ok[0] += (o0 - m.ok[0]) / m.n;
          m.ok[1] += (o1 - m.ok[1]) / m.n;
          m.ok[2] += (o2 - m.ok[2]) / m.n;
          return;
        }
      }
      if (models.length < 6) models.push({ ok: [o0, o1, o2], n: 1 });
    };
    for (let x = 0; x < W; x++){ addSample(x); addSample((H-1)*W + x); }
    for (let y = 1; y < H-1; y++){ addSample(y*W); addSample(y*W + W-1); }
    models.sort((a, b) => b.n - a.n);
    models.length = Math.min(models.length, 3);
    if (!models.length) return;

    const T = 0.05 + tol / 100 * 0.30;   // tol 0-100 → OKLab ΔE しきい値
    const T2 = T * T;
    const modelD2 = i => {
      const o0 = OK[i*3], o1 = OK[i*3+1], o2 = OK[i*3+2];
      let best = Infinity;
      for (const m of models){
        const d0 = o0-m.ok[0], d1 = o1-m.ok[1], d2 = o2-m.ok[2];
        const d = d0*d0 + d1*d1 + d2*d2;
        if (d < best) best = d;
      }
      return best;
    };
    const pxD2 = (i, j) => {
      const d0 = OK[i*3]-OK[j*3], d1 = OK[i*3+1]-OK[j*3+1], d2 = OK[i*3+2]-OK[j*3+2];
      return d0*d0 + d1*d1 + d2*d2;
    };

    // --- 2) 外周から領域拡張 ---
    const seen = new Uint8Array(N);
    const queue = [];
    const trySeed = i => {
      if (!seen[i] && modelD2(i) < T2){ seen[i] = 1; queue.push(i); }
    };
    for (let x = 0; x < W; x++){ trySeed(x); trySeed((H-1)*W + x); }
    for (let y = 0; y < H; y++){ trySeed(y*W); trySeed(y*W + W-1); }
    const localT2 = T2 * 0.25;   // となりと色がほぼ連続なら…
    const looseT2 = T2 * 3.6;    // …モデルからΔE 1.9倍まで背景として許容（影・グラデ対応）
    while (queue.length){
      const i = queue.pop();
      bg[i] = 1;
      const x = i % W, y = (i / W) | 0;
      const nbs = [];
      if (x > 0) nbs.push(i-1);
      if (x < W-1) nbs.push(i+1);
      if (y > 0) nbs.push(i-W);
      if (y < H-1) nbs.push(i+W);
      for (const j of nbs){
        if (seen[j]) continue;
        if (modelD2(j) < T2 || (pxD2(i, j) < localT2 && modelD2(j) < looseT2)){
          seen[j] = 1;
          queue.push(j);
        }
      }
    }

    // --- 3) 白フチ（にじみ）の浸食除去 ---
    const haloT2 = T2 * 1.55;
    for (let pass = 0; pass < 2; pass++){
      const kill = [];
      for (let i = 0; i < N; i++){
        if (bg[i]) continue;
        const x = i % W, y = (i / W) | 0;
        const nearBg =
          (x > 0 && bg[i-1]) || (x < W-1 && bg[i+1]) ||
          (y > 0 && bg[i-W]) || (y < H-1 && bg[i+W]);
        if (nearBg && modelD2(i) < haloT2) kill.push(i);
      }
      if (!kill.length) break;
      for (const i of kill) bg[i] = 1;
    }

    // --- 4) 囲まれた背景色の除去（文字の輪っかの中など） ---
    // 「あ」「ひ」のループ内側のように、外周とつながっていなくても
    // 背景とほぼ同色（ごく厳しめのしきい値）のセルは布地を見せる。
    // 少しでも色みが違う部分（クリーム色の吸盤・淡い模様）は残る。
    const tight = Math.min(T * 0.5, 0.05);
    const tight2 = tight * tight;
    for (let i = 0; i < N; i++){
      if (!bg[i] && modelD2(i) < tight2) bg[i] = 1;
    }
  }

  /** メディアンカット（OKLab）: 初期クラスタ中心を安定的に決める */
  function medianCutSeeds(OK, idxs, K){
    let boxes = [idxs.slice()];
    while (boxes.length < K){
      // いちばん色の広がりが大きい箱を選ぶ
      let bi = -1, bRange = -1, bCh = 0;
      for (let i = 0; i < boxes.length; i++){
        const box = boxes[i];
        if (box.length < 2) continue;
        for (let ch = 0; ch < 3; ch++){
          let mn = Infinity, mx = -Infinity;
          for (const p of box){
            const v = OK[p*3+ch];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          // a/b チャンネルはレンジが狭いので少し重みづけ
          const range = (mx - mn) * (ch === 0 ? 1 : 1.4);
          if (range > bRange){ bRange = range; bi = i; bCh = ch; }
        }
      }
      if (bi < 0 || bRange < 0.02) break;   // これ以上分けられない
      const box = boxes[bi];
      const ch = bCh;
      box.sort((a, b) => OK[a*3+ch] - OK[b*3+ch]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => {
      let l = 0, a = 0, b = 0;
      const n = box.length || 1;
      for (const p of box){ l += OK[p*3]; a += OK[p*3+1]; b += OK[p*3+2]; }
      return [l/n, a/n, b/n];
    });
  }

  function kmeans(OK, idxs, cents){
    const K = cents.length;
    const asg = new Int16Array(idxs.length);
    for (let it = 0; it < KMEANS_ITERS; it++){
      // 割当
      for (let n = 0; n < idxs.length; n++){
        const i = idxs[n];
        const o0 = OK[i*3], o1 = OK[i*3+1], o2 = OK[i*3+2];
        let best = 0, bd = Infinity;
        for (let c = 0; c < K; c++){
          const d0 = o0-cents[c][0], d1 = o1-cents[c][1], d2 = o2-cents[c][2];
          const d = d0*d0 + d1*d1 + d2*d2;
          if (d < bd){ bd = d; best = c; }
        }
        asg[n] = best;
      }
      // 更新
      const sum = Array.from({length: K}, () => [0,0,0,0]);
      for (let n = 0; n < idxs.length; n++){
        const i = idxs[n], s = sum[asg[n]];
        s[0] += OK[i*3]; s[1] += OK[i*3+1]; s[2] += OK[i*3+2]; s[3]++;
      }
      for (let c = 0; c < K; c++){
        if (sum[c][3] > 0){
          cents[c] = [sum[c][0]/sum[c][3], sum[c][1]/sum[c][3], sum[c][2]/sum[c][3]];
        }
      }
    }
    return cents;
  }

  /**
   * 3×3多数決フィルタ（コントラスト保護つき）+ 背景ピンホール埋め
   * JPEGノイズやにじみは均す一方で、まわりと色が大きく違う細部
   * （目・口・輪郭線）は多数派に飲み込まれないよう保護する。
   */
  function majorityFilter(labels, W, H, clusters, passes){
    const PROTECT2 = 0.085 * 0.085;   // ΔEがこれ以上離れた細部は残す
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
            if (nonBg <= 2){
              labels[i] = -1;   // 背景に浮いた孤立点は消す
            } else if (bestL !== tmp[i] &&
                       IT.color.dist2(clusters[tmp[i]].ok, clusters[bestL].ok) >= PROTECT2){
              labels[i] = tmp[i];   // 色が大きく違う細部 → 保護
            } else {
              labels[i] = bestL;
            }
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
    const groups = Array.from({length: K}, (_, c) => ({ cluster: c, segs: [], under: [] }));

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
      // scanHatch: 角度・間隔を変えて走査するヘルパー
      //   本縫い（表に見えるステッチ）と、下打ち（アンダーレイ:
      //   生地を安定させ本縫いの沈み込みを防ぐ、まばらな下地縫い）で共用
      const scanHatch = (thetaScan, rowGap, sLen, conf) => {
        const cosS = Math.cos(thetaScan), sinS = Math.sin(thetaScan);
        let uMinS = Infinity, uMaxS = -Infinity, vMinS = Infinity, vMaxS = -Infinity;
        for (const [x, y] of corners){
          const u = x*cosS + y*sinS, v = -x*sinS + y*cosS;
          if (u < uMinS) uMinS = u; if (u > uMaxS) uMaxS = u;
          if (v < vMinS) vMinS = v; if (v > vMaxS) vMaxS = v;
        }
        const toXYS = (u, v) => [u*cosS - v*sinS, u*sinS + v*cosS];
        const su = Math.min(cellMm * 0.5, 0.4);
        let rowIdx = 0;
        for (let v = vMinS + rowGap/2; v <= vMaxS; v += rowGap, rowIdx++){
          const phase = conf.brick ? (rowIdx % 2) * sLen / 2 : 0;
          let runC = -1, runStart = 0;
          const flush = (uEnd) => {
            if (runC < 0) return;
            // 下打ちは端を内側へ / 本縫いは引き縮み補正で端をわずかに外へ
            let s0 = runStart - conf.comp + conf.inset;
            let s1 = uEnd + conf.comp - conf.inset;
            if (s1 - s0 < conf.minRun){ runC = -1; return; }
            let pos = s0;
            const segs = groups[runC][conf.target];
            while (pos < s1 - 0.01){
              let next = pos + (sLen - ((pos - uMinS + phase) % sLen));
              if (next - pos < sLen * 0.3) next += sLen;   // 極端な短針を避ける
              next = Math.min(next, s1);
              const jv = conf.jitter ? (rnd() - 0.5) * 0.14 : 0;
              const [x1, y1] = toXYS(pos,  v + jv);
              const [x2, y2] = toXYS(next, v + jv);
              segs.push(x1, y1, x2, y2);
              if (conf.count) stitchCount++;
              pos = next;
            }
            runC = -1;
          };
          for (let u = uMinS; u <= uMaxS + su; u += su){
            const [x, y] = toXYS(u, v);
            const c = u > uMaxS ? -1 : labelAt(x, y);
            if (c !== runC){
              flush(u);
              if (c >= 0){ runC = c; runStart = u; }
            }
          }
          flush(uMaxS);
        }
      };

      // 本縫い: ユーザー指定の角度・密度。引き縮み補正 0.18mm
      scanHatch(theta, wt.lineMm * dn.f, wt.stitchMm, {
        target: 'segs', brick: true, jitter: true,
        comp: 0.18, inset: 0, minRun: 0.5, count: true,
      });
      // 下打ち: 本縫いと直交・3mm間隔のまばらな走り縫い。ふちの内側 0.5mm
      scanHatch(theta + Math.PI / 2, 3.0, 3.8, {
        target: 'under', brick: false, jitter: false,
        comp: 0, inset: 0.5, minRun: 1.5, count: false,
      });
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
    const S = 64;
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

    // 色数が少ない = イラスト/ロゴ/キャラ、多い = 写真 とざっくり判定
    const isIllust = n <= 26;
    // 色数は「面積の大半を占める色の数」ではなく「有意に存在する色の数」で決める。
    // ほっぺ・吸盤のような面積1%未満のワンポイント色も1色として数える。
    const nSig = sorted.filter(v => v >= total * 0.004).length;
    const colors = isIllust
      ? Math.max(5, Math.min(10, nSig))
      : 10;                              // 写真は多色で階調を出す（上限はスライダーで12まで）

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
      removeBg = maxD < 110;   // 四隅がほぼ同色 → 単色背景と判断
    }
    return { colors, removeBg, lineBoost: isIllust };
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
