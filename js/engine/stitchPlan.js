/* =============================================================
   いとまき — ステッチプラン・コンパイラ（納品品質の縫い順生成）

   画面表示用のステッチ線分（sd.groups[].segs / .under）を、
   刺繍ミシンが実際に縫える「1本のシーケンス」へ変換する。

   納品品質のための処理:
     - 近い順チェーン（最近傍法 + 空間グリッド）で走行距離を最小化
     - 色ブロックの開始/終了と長い移動の前後に止め縫い（タイイン/タイオフ）
     - 2.4mm を超える移動はトリム + ジャンプ（渡り糸を残さない）
     - ジャンプは11.5mm以下に分割（DSTの±12.1mm制限に対応）
     - アンダーレイ（下打ち）→ 本縫いの順で同色ブロックにまとめる
     - デザイン中心を原点に配置（ミシンのフープ中央基準）

   出力単位: 0.1mm（刺繍フォーマットの標準単位）、Y軸下向き
   コマンド: pyembroidery 互換（STITCH=0, JUMP=1, TRIM=2, END=4, COLOR_CHANGE=5）
   ============================================================= */
(function(root){
  'use strict';
  const IT = root.IT = root.IT || {};

  const CMD = { STITCH: 0, JUMP: 1, TRIM: 2, END: 4, COLOR_CHANGE: 5 };

  const WALK_MAX = 2.4;        // 本縫い: これ以下の移動はそのまま1針で渡る (mm)
  const WALK_MAX_UNDER = 3.6;  // 下打ち: 上から縫い潰されるため広めに渡ってよい
  const TIE = 0.6;          // 止め縫いの振り幅 (mm)
  const JUMP_SPLIT = 11.5;  // ジャンプの分割長 (mm)

  // -------------------------------------------------------------
  // 線分群を「近い順」に並べ替える（空間グリッド + 最近傍法）
  // 各要素: { x1,y1,x2,y2 } — 入る側の端点が (x1,y1) になるよう向きも決める
  // -------------------------------------------------------------
  function chainSegments(flat, startPos){
    const n = flat.length >> 2;
    if (!n) return [];
    const CELL = 2.5;
    const grid = new Map();
    const key = (gx, gy) => gx + ',' + gy;
    const put = (i, end, x, y) => {
      const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
      let arr = grid.get(k);
      if (!arr){ arr = []; grid.set(k, arr); }
      arr.push([i, end, x, y]);
    };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++){
      const x1 = flat[i*4], y1 = flat[i*4+1], x2 = flat[i*4+2], y2 = flat[i*4+3];
      put(i, 0, x1, y1);
      put(i, 1, x2, y2);
      if (x1 < minX) minX = x1; if (x1 > maxX) maxX = x1;
      if (y1 < minY) minY = y1; if (y1 > maxY) maxY = y1;
      if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2;
      if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
    }
    const maxRing = Math.ceil(Math.max(maxX - minX, maxY - minY) / CELL) + 2;
    const used = new Uint8Array(n);

    // 開始点: 前ブロックの終点、なければ最も左上の端点
    let cur;
    if (startPos){
      cur = [startPos[0], startPos[1]];
    } else {
      cur = [flat[0], flat[1]];
      for (let i = 0; i < n; i++){
        for (const [x, y] of [[flat[i*4], flat[i*4+1]], [flat[i*4+2], flat[i*4+3]]]){
          if (y < cur[1] || (y === cur[1] && x < cur[0])) cur = [x, y];
        }
      }
    }

    const out = [];
    for (let count = 0; count < n; count++){
      const cgx = Math.floor(cur[0] / CELL), cgy = Math.floor(cur[1] / CELL);
      let bi = -1, be = 0, bd = Infinity, bx = 0, by = 0;
      for (let r = 0; r <= maxRing; r++){
        // チェビシェフ距離 r のセルリングを走査
        for (let gy = cgy - r; gy <= cgy + r; gy++){
          const onYEdge = (gy === cgy - r || gy === cgy + r);
          for (let gx = cgx - r; gx <= cgx + r; gx += onYEdge ? 1 : 2 * r || 1){
            const arr = grid.get(key(gx, gy));
            if (!arr) continue;
            for (const [i, end, x, y] of arr){
              if (used[i]) continue;
              const dx = x - cur[0], dy = y - cur[1];
              const d = dx*dx + dy*dy;
              if (d < bd){ bd = d; bi = i; be = end; bx = x; by = y; }
            }
          }
        }
        // リング r 内で見つかり、それがリング境界より内側なら確定
        if (bi >= 0 && bd <= (r * CELL) * (r * CELL)) break;
      }
      if (bi < 0){
        // フォールバック（理論上到達しない）: 線形走査
        for (let i = 0; i < n; i++){
          if (used[i]) continue;
          const dx = flat[i*4] - cur[0], dy = flat[i*4+1] - cur[1];
          const d = dx*dx + dy*dy;
          if (d < bd){ bd = d; bi = i; be = 0; }
        }
        if (bi < 0) break;
      }
      used[bi] = 1;
      const x1 = flat[bi*4], y1 = flat[bi*4+1], x2 = flat[bi*4+2], y2 = flat[bi*4+3];
      const seg = be === 0
        ? { x1, y1, x2, y2 }
        : { x1: x2, y1: y2, x2: x1, y2: y1 };
      out.push(seg);
      cur = [seg.x2, seg.y2];
    }
    return out;
  }

  // -------------------------------------------------------------
  // コンパイル本体
  // -------------------------------------------------------------
  /**
   * @param {object} sd     buildStitches() の結果
   * @param {object} result analyze() の結果（palette参照）
   * @param {object} opts   { name }
   * @returns {object} plan {
   *   name, blocks:[{threadId,hex,name,code,r,g,b,stitches}],
   *   sequence:[[x,y,cmd], ...]  (0.1mm整数・中心原点),
   *   stats:{stitches,jumps,trims,ties,colorChanges}, size:{wMm,hMm}
   * }
   */
  IT.plan = IT.plan || {};
  IT.plan.CMD = CMD;
  IT.plan.compile = function(sd, result, opts){
    opts = opts || {};
    const seq = [];        // [xMm, yMm, cmd]
    const stats = { stitches: 0, jumps: 0, trims: 0, ties: 0, colorChanges: 0 };
    let cur = null;
    let stitchedSinceTie = false;

    const emit = (x, y, cmd) => {
      seq.push([x, y, cmd]);
      if (cmd === CMD.STITCH) stats.stitches++;
      else if (cmd === CMD.JUMP) stats.jumps++;
      else if (cmd === CMD.TRIM) stats.trims++;
      else if (cmd === CMD.COLOR_CHANGE) stats.colorChanges++;
    };
    const stitchTo = (x, y) => { emit(x, y, CMD.STITCH); cur = [x, y]; stitchedSinceTie = true; };
    const tieAt = (x, y) => {
      // 小さな返し縫い（0.6mm を3針）— ほどけ防止
      emit(x, y, CMD.STITCH);
      emit(x + TIE, y, CMD.STITCH);
      emit(x, y, CMD.STITCH);
      stats.ties++;
      cur = [x, y];
    };
    const jumpTo = (x, y) => {
      const dx = x - cur[0], dy = y - cur[1];
      const dist = Math.hypot(dx, dy);
      const parts = Math.max(1, Math.ceil(dist / JUMP_SPLIT));
      for (let k = 1; k <= parts; k++){
        emit(cur[0] + dx * k / parts, cur[1] + dy * k / parts, CMD.JUMP);
      }
      cur = [x, y];
    };

    // ブロック順: 針数の大きい色から（細部の色が上に載る＝画面表示と同じ層順）
    const order = sd.groups
      .map((g, i) => i)
      .filter(i => sd.groups[i].segs.length > 0 || (sd.groups[i].under || []).length > 0)
      .sort((a, b) => sd.groups[b].segs.length - sd.groups[a].segs.length);

    const blocks = [];
    order.forEach((gi, bi) => {
      const g = sd.groups[gi];
      const entry = result.palette[g.cluster];
      const th = IT.threadById[entry.threadId];
      const blockStitchStart = stats.stitches;   // tieAt の3針は emit 経由で計上済み
      let entryNeeded = true;

      // アンダーレイ（下打ち）→ 本縫い の順に同色でまとめて縫う
      for (const [flat, walkMax] of [[g.under || [], WALK_MAX_UNDER], [g.segs, WALK_MAX]]){
        if (!flat.length) continue;
        const ordered = chainSegments(flat, cur);
        for (const s of ordered){
          const gap = cur ? Math.hypot(s.x1 - cur[0], s.y1 - cur[1]) : Infinity;
          if (entryNeeded || gap > walkMax){
            if (cur && stitchedSinceTie){
              tieAt(cur[0], cur[1]);       // タイオフ
              emit(cur[0], cur[1], CMD.TRIM);
              stitchedSinceTie = false;
            }
            if (!cur) cur = [0, 0];        // デザイン原点から開始
            jumpTo(s.x1, s.y1);
            tieAt(s.x1, s.y1);             // タイイン
            entryNeeded = false;
          } else if (gap > 0.05){
            stitchTo(s.x1, s.y1);          // 歩き縫いで渡る
          }
          stitchTo(s.x2, s.y2);
        }
      }

      // ブロック終端: タイオフ + トリム + （次があれば）色替え
      if (cur && stitchedSinceTie){
        tieAt(cur[0], cur[1]);
        emit(cur[0], cur[1], CMD.TRIM);
        stitchedSinceTie = false;
      }
      if (bi < order.length - 1){
        emit(cur[0], cur[1], CMD.COLOR_CHANGE);
      }

      blocks.push({
        threadId: th.id, hex: th.hex, name: th.name, code: th.code,
        r: th.r, g: th.g, b: th.b,
        stitches: stats.stitches - blockStitchStart,
      });
    });

    if (cur) emit(cur[0], cur[1], CMD.END);

    // 中心を原点へ移動 → 0.1mm 整数化
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y, cmd] of seq){
      if (cmd !== CMD.STITCH && cmd !== CMD.JUMP) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (minX === Infinity){ minX = minY = maxX = maxY = 0; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const sequence = seq.map(([x, y, cmd]) =>
      [Math.round((x - cx) * 10), Math.round((y - cy) * 10), cmd]);

    return {
      name: (opts.name || 'itomaki').replace(/[^\x20-\x7E]/g, '').slice(0, 16) || 'itomaki',
      blocks, sequence, stats,
      size: { wMm: Math.round((maxX - minX) * 10) / 10, hMm: Math.round((maxY - minY) * 10) / 10 },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
