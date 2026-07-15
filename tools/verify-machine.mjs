/* =============================================================
   ミシンデータ生成（digitize v2 → stitchPlan → PES/DST）の検証ハーネス

   使い方:  node tools/verify-machine.mjs [出力ディレクトリ]
     - 合成ラベルマップ（リング/細線/文字風/微小領域/クロス）で
       デジタイザーを走らせ、幾何の忠実度と機械制約を検査する
     - PES/DST を出力ディレクトリに書き出す
       （tools/readback.py で pyembroidery 読み戻し検証ができる）

   検査項目:
     C1 カバレッジ: マスク領域の何%がステッチで覆われたか（>= 96%）
     C2 はみ出し:   許容帯（引き縮み補正+0.45mm）を超えた針落ち（<= 0.5%）
     C3 針目長:     1針の最大長 <= 7.2mm（DST限界12.1mmに大幅マージン）
     C4 構造:       色替え数 = ブロック数-1 / END存在 / 止め縫い数 > 0
     C5 決定性:     2回生成してバイト一致
   ============================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPlanPng } from './rasterize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '.verify-out'));
fs.mkdirSync(OUT, { recursive: true });

// ---- ブラウザ用スクリプトをそのまま読み込む ----
globalThis.window = globalThis;
for (const f of [
  'js/data/threads.js',
  'js/engine/embroidery.js',      // WEIGHTS/DENSITIES/buildStitches（DOM関数は呼ばない）
  'js/engine/digitize.js',
  'js/engine/stitchPlan.js',
  'js/engine/machineFormats.js',
]){
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  (0, eval)(code);
}
const IT = globalThis.IT;

// =============================================================
// 合成ラベルマップ（決定的）
// =============================================================

function makeMap(W, H){
  return { W, H, labels: new Int16Array(W * H).fill(-1) };
}
function fillCircle(m, cx, cy, r, c){
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++){
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx*dx + dy*dy <= r*r) m.labels[y*m.W + x] = c;
  }
}
function clearCircle(m, cx, cy, r){
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++){
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx*dx + dy*dy <= r*r) m.labels[y*m.W + x] = -1;
  }
}
function fillRect(m, x0, y0, x1, y1, c){
  for (let y = Math.max(0, y0); y <= Math.min(m.H-1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(m.W-1, x1); x++)
      m.labels[y*m.W + x] = c;
}
function fillStroke(m, x0, y0, x1, y1, halfW, c){
  // 線分の周囲 halfW セルを塗る
  const len2 = (x1-x0)**2 + (y1-y0)**2;
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++){
    const px = x + 0.5 - x0, py = y + 0.5 - y0;
    let t = len2 > 0 ? (px*(x1-x0) + py*(y1-y0)) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = px - t*(x1-x0), dy = py - t*(y1-y0);
    if (dx*dx + dy*dy <= halfW*halfW) m.labels[y*m.W + x] = c;
  }
}
function fillArc(m, cx, cy, r, a0, a1, halfW, c){
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++){
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - r) > halfW) continue;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    if (a0 <= a1 ? (a >= a0 && a <= a1) : (a >= a0 || a <= a1)){
      m.labels[y*m.W + x] = c;
    }
  }
}

function paletteFor(map, threadIds){
  const counts = {};
  for (const v of map.labels) if (v >= 0) counts[v] = (counts[v] || 0) + 1;
  return threadIds.map((tid, i) => ({ threadId: tid, count: counts[i] || 0 }));
}

const CASES = [];

// --- 1) リング + 中心ドット（穴・曲線輪郭・タタミ・縁取り） ---
{
  const m = makeMap(160, 160);
  fillCircle(m, 80, 80, 70, 0);
  clearCircle(m, 80, 80, 38);
  fillCircle(m, 80, 80, 20, 1);
  CASES.push({
    name: 'ring',
    widthMm: 90,
    map: m,
    palette: paletteFor(m, ['t20', 't42']),
    params: { style: 'tatami', colors: 2, weight: 'normal', density: 'normal', angle: 45 },
    expect: { minSatin: 0, minFill: 2 },
  });
}

// --- 2) 細線群（サテン化の検証: 斜めバー/横バー/円弧/十字） ---
{
  const m = makeMap(160, 160);
  fillStroke(m, 20, 20, 140, 60, 2.0, 0);        // 斜めバー 幅≈4セル
  fillStroke(m, 20, 90, 100, 90, 1.5, 0);        // 横バー 幅3セル
  fillArc(m, 110, 110, 34, Math.PI * 0.1, Math.PI * 1.2, 2.0, 0);  // 円弧
  fillStroke(m, 30, 120, 70, 120, 1.5, 1);       // 十字（横）
  fillStroke(m, 50, 100, 50, 140, 1.5, 1);       // 十字（縦）
  CASES.push({
    name: 'strokes',
    widthMm: 60,
    map: m,
    palette: paletteFor(m, ['t14', 't33']),
    params: { style: 'tatami', colors: 2, weight: 'normal', density: 'normal', angle: 0 },
    expect: { minSatin: 3 },
  });
}

// --- 3) 文字風（太い部分と細い部分の混在 + 穴） ---
{
  const m = makeMap(160, 120);
  fillRect(m, 30, 20, 130, 100, 0);              // 太い本体
  clearCircle(m, 80, 60, 26);                    // 穴
  fillStroke(m, 130, 30, 155, 30, 1.5, 0);       // 細いしっぽ（本体と連結）
  fillRect(m, 8, 40, 14, 90, 1);                 // 別色の細い縦棒 幅7セル
  CASES.push({
    name: 'glyph',
    widthMm: 70,
    map: m,
    palette: paletteFor(m, ['t44', 't27']),
    params: { style: 'tatami', colors: 2, weight: 'normal', density: 'fine', angle: 30 },
    expect: { minFill: 1 },
  });
}

// --- 4) 微小領域（手差し/省略の判定） ---
{
  const m = makeMap(120, 120);
  fillCircle(m, 40, 40, 26, 0);                  // 普通の面
  fillRect(m, 90, 30, 91, 31, 0);                // 2×2セル（cell=0.5mm → 1.0mm²）
  fillRect(m, 100, 60, 100, 61, 0);              // 1×2セル（0.5mm² → 手差し）
  fillRect(m, 110, 90, 110, 90, 0);              // 1×1セル（0.25mm² → 省略）
  CASES.push({
    name: 'specks',
    widthMm: 60,
    map: m,
    palette: paletteFor(m, ['t23']),
    params: { style: 'tatami', colors: 1, weight: 'normal', density: 'normal', angle: 45 },
    expect: { minManual: 1, minDropped: 1 },
  });
}

// --- 5) クロスステッチ（機械用サーペンタイン） ---
{
  const m = makeMap(140, 140);
  fillCircle(m, 70, 70, 55, 0);
  clearCircle(m, 70, 70, 25);
  CASES.push({
    name: 'cross',
    widthMm: 70,
    map: m,
    palette: paletteFor(m, ['t38']),
    params: { style: 'cross', colors: 1, weight: 'normal', density: 'normal', angle: 0 },
    expect: {},
  });
}

// =============================================================
// 検査
// =============================================================

const CMD = { STITCH: 0, JUMP: 1, TRIM: 2, END: 4, COLOR_CHANGE: 5 };
let failures = 0;
const summary = [];

function check(name, cond, detail){
  const mark = cond ? 'ok' : 'NG';
  if (!cond) failures++;
  console.log(`   [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
  return cond;
}

for (const tc of CASES){
  console.log(`\n=== ${tc.name} (${tc.widthMm}mm, ${tc.params.style}) ===`);
  const result = { W: tc.map.W, H: tc.map.H, labels: tc.map.labels, palette: tc.palette };

  // --- 生成（2回 → 決定性）。エディタと同じ分岐: クロスは v1 経路 ---
  const gen = () => {
    if (tc.params.style === 'cross'){
      const sd = IT.emb.buildStitches(result, tc.params, tc.widthMm);
      return { msd: null, plan: IT.plan.compile(sd, result, { name: tc.name }) };
    }
    const m = IT.digitize.build(result, tc.params, tc.widthMm);
    return { msd: m, plan: IT.plan.compileMachine(m, result, { name: tc.name }) };
  };
  const t0 = Date.now();
  const { msd, plan } = gen();
  const ms = Date.now() - t0;
  const { plan: plan2 } = gen();

  const pes = IT.machine.writePes(plan);
  const dst = IT.machine.writeDst(plan);
  const pes2 = IT.machine.writePes(plan2);
  fs.writeFileSync(path.join(OUT, tc.name + '.pes'), pes);
  fs.writeFileSync(path.join(OUT, tc.name + '.dst'), dst);
  fs.writeFileSync(path.join(OUT, tc.name + '.plan.json'), JSON.stringify({
    stats: plan.stats, size: plan.size, blocks: plan.blocks.map(b => ({ code: b.code, stitches: b.stitches })),
    regions: plan.regions,
  }, null, 1));
  // 縫い順SVG + PNG（目視確認用）
  fs.writeFileSync(path.join(OUT, tc.name + '.svg'), IT.plan.toSVG(plan, {}));
  fs.writeFileSync(path.join(OUT, tc.name + '.png'), renderPlanPng(plan, { pxPerMm: 10 }));

  console.log(`   生成 ${ms}ms / 針数 ${plan.stats.stitches} / トリム ${plan.stats.trims} / ` +
    `色替え ${plan.stats.colorChanges} / サイズ ${plan.size.wMm}×${plan.size.hMm}mm / ` +
    `部位 ${JSON.stringify(plan.regions)}`);

  // --- C5 決定性 ---
  check('C5 決定性（PESバイト一致）', Buffer.compare(Buffer.from(pes), Buffer.from(pes2)) === 0);

  // --- C3 針目長・C4 構造 ---
  {
    let maxLen = 0, prev = null, over = 0;
    let endSeen = false;
    for (const [x, y, cmd] of plan.sequence){
      if (cmd === CMD.STITCH){
        if (prev){
          const L = Math.hypot(x - prev[0], y - prev[1]) / 10;
          if (L > maxLen) maxLen = L;
          if (L > 7.2) over++;
        }
        prev = [x, y];
      } else if (cmd === CMD.JUMP){
        prev = [x, y];
      } else if (cmd === CMD.END){ endSeen = true; break; }
    }
    check('C3 最大針目長 <= 7.2mm', over === 0, `max=${maxLen.toFixed(2)}mm`);
    check('C4 END / 色替え / 止め縫い', endSeen &&
      plan.stats.colorChanges === plan.blocks.length - 1 && plan.stats.ties >= plan.blocks.length,
      `cc=${plan.stats.colorChanges} blocks=${plan.blocks.length} ties=${plan.stats.ties}`);
  }

  // --- C6 寸法一致（マスクの実寸 ± 1.0mm。省略された微小領域は除外） ---
  {
    const cellMm = tc.widthMm / tc.map.W;
    const drop = tc.name === 'specks' ? 1 : 0;   // specksは1×1セルを意図的に省略
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (let y = 0; y < tc.map.H; y++) for (let x = 0; x < tc.map.W; x++){
      if (tc.map.labels[y*tc.map.W+x] < 0) continue;
      if (drop && x >= 110 && y >= 90) continue;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    const mw = (mxx - mnx + 1) * cellMm, mh = (mxy - mny + 1) * cellMm;
    // クロスは腕がセル中心から張り出す意匠のため許容を広げる
    const tol = tc.params.style === 'cross' ? 2.5 : 1.0;
    const okW = Math.abs(plan.size.wMm - mw) <= tol;
    const okH = Math.abs(plan.size.hMm - mh) <= tol;
    check(`C6 寸法一致 ±${tol}mm`, okW && okH,
      `plan ${plan.size.wMm}×${plan.size.hMm} / mask ${mw.toFixed(1)}×${mh.toFixed(1)}`);
  }

  // --- C1 カバレッジ / C2 はみ出し（クラスタごと・mm空間ラスタ） ---
  if (msd){
    const cellMm = tc.widthMm / tc.map.W;
    const S = 3;                                   // セルあたりの検査解像度
    const gw = tc.map.W * S, gh = tc.map.H * S;
    const covered = new Uint8Array(gw * gh);
    const brushMm = Math.max(0.55, (IT.emb.WEIGHTS[tc.params.weight] || {lineMm:0.6}).lineMm *
                    ((IT.emb.DENSITIES[tc.params.density] || {f:1.3}).f) * 0.75);
    const brushPx = Math.max(1, Math.round(brushMm / cellMm * S));

    // クラスタ→マスク＆許容帯（引き縮み+0.45mm膨張）
    const tolCells = Math.ceil(0.65 / cellMm);
    const allow = [];
    for (let c = 0; c < tc.palette.length; c++){
      const a = new Uint8Array(tc.map.W * tc.map.H);
      for (let i = 0; i < a.length; i++) a[i] = tc.map.labels[i] === c ? 1 : 0;
      // BFS膨張
      let cur = a.slice();
      for (let d = 0; d < tolCells; d++){
        const nxt = cur.slice();
        for (let y = 0; y < tc.map.H; y++) for (let x = 0; x < tc.map.W; x++){
          if (cur[y*tc.map.W+x]) continue;
          if ((x>0 && cur[y*tc.map.W+x-1]) || (x<tc.map.W-1 && cur[y*tc.map.W+x+1]) ||
              (y>0 && cur[(y-1)*tc.map.W+x]) || (y<tc.map.H-1 && cur[(y+1)*tc.map.W+x]))
            nxt[y*tc.map.W+x] = 1;
        }
        cur = nxt;
      }
      allow.push(cur);
    }

    let outPts = 0, totPts = 0;
    for (const g of msd.groups){
      for (const p of g.paths){
        if (p.under) continue;
        const pts = p.pts;
        for (let i = 0; i < pts.length; i += 2){
          totPts++;
          const cx = Math.floor(pts[i] / cellMm), cy = Math.floor(pts[i+1] / cellMm);
          if (cx < 0 || cy < 0 || cx >= tc.map.W || cy >= tc.map.H ||
              !allow[g.cluster][cy*tc.map.W + cx]) outPts++;
        }
        // カバレッジ用スタンプ（線分に沿って 0.5px 刻み）
        for (let i = 2; i < pts.length; i += 2){
          const x0 = pts[i-2] / cellMm * S, y0 = pts[i-1] / cellMm * S;
          const x1 = pts[i] / cellMm * S, y1 = pts[i+1] / cellMm * S;
          const L = Math.hypot(x1-x0, y1-y0);
          const steps = Math.max(1, Math.ceil(L / 0.5));
          for (let s = 0; s <= steps; s++){
            const px = x0 + (x1-x0)*s/steps, py = y0 + (y1-y0)*s/steps;
            for (let dy = -brushPx; dy <= brushPx; dy++){
              for (let dx = -brushPx; dx <= brushPx; dx++){
                if (dx*dx + dy*dy > brushPx*brushPx) continue;
                const gx = Math.round(px+dx), gy = Math.round(py+dy);
                if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) covered[gy*gw+gx] = 1;
              }
            }
          }
        }
      }
    }
    // マスクセル中心の被覆率（全クラスタ合算）
    let maskN = 0, covN = 0;
    for (let y = 0; y < tc.map.H; y++) for (let x = 0; x < tc.map.W; x++){
      if (tc.map.labels[y*tc.map.W+x] < 0) continue;
      maskN++;
      const gx = x*S + (S>>1), gy = y*S + (S>>1);
      if (covered[gy*gw+gx]) covN++;
    }
    const cov = covN / maskN * 100;
    const outPct = outPts / Math.max(1, totPts) * 100;
    check('C1 カバレッジ >= 96%', cov >= 96, cov.toFixed(2) + '%');
    check('C2 はみ出し針落ち <= 0.5%', outPct <= 0.5, outPct.toFixed(3) + '% (' + outPts + '/' + totPts + ')');
  }

  // --- 期待される部位分類 ---
  const st = (msd && msd.stats) || {};
  if (tc.expect.minSatin) check(`分類: サテン >= ${tc.expect.minSatin}`, (st.satins||0) >= tc.expect.minSatin, `satins=${st.satins}`);
  if (tc.expect.minFill) check(`分類: タタミ面 >= ${tc.expect.minFill}`, (st.fills||0) >= tc.expect.minFill, `fills=${st.fills}`);
  if (tc.expect.minManual) check(`分類: 手差し >= ${tc.expect.minManual}`, (st.manuals||0) >= tc.expect.minManual, `manuals=${st.manuals}`);
  if (tc.expect.minDropped) check(`分類: 省略 >= ${tc.expect.minDropped}`, (st.dropped||0) >= tc.expect.minDropped, `dropped=${st.dropped}`);

  summary.push({ name: tc.name, stitches: plan.stats.stitches, trims: plan.stats.trims,
                 size: plan.size, regions: plan.regions });
}

// =============================================================
// C7 パラメータ掃引（例外なし・針目長・被覆の粗チェック）
// =============================================================
console.log('\n=== C7 パラメータ掃引 ===');
{
  // 形状: 全面べた + 斜線 + 縁接触矩形（マップ端に接する）
  const W = 140, H = 140;
  const m = makeMap(W, H);
  fillRect(m, 0, 0, 60, 60, 0);                  // 左上: マップ端に接する矩形
  fillCircle(m, 100, 45, 30, 1);
  fillStroke(m, 10, 100, 130, 120, 2, 1);        // 細線
  const palette = paletteFor(m, ['t14', 't42']);
  let swept = 0, sweepNg = 0;
  for (const weight of ['thin', 'normal', 'thick']){
    for (const density of ['coarse', 'normal', 'fine']){
      for (const angle of [0, 45, 90, 135]){
        for (const widthMm of [40, 160]){
          swept++;
          try{
            const result = { W, H, labels: m.labels, palette };
            const msd = IT.digitize.build(result, { style: 'tatami', weight, density, angle }, widthMm);
            const plan = IT.plan.compileMachine(msd, result, { name: 'sweep' });
            let prev = null, bad = 0;
            for (const [x, y, cmd] of plan.sequence){
              if (cmd === CMD.STITCH){
                if (prev && Math.hypot(x - prev[0], y - prev[1]) / 10 > 7.2) bad++;
                prev = [x, y];
              } else if (cmd === CMD.JUMP) prev = [x, y];
            }
            if (bad > 0 || plan.stats.stitches < 100){
              sweepNg++;
              console.log(`   [NG] ${weight}/${density}/${angle}°/${widthMm}mm — 長針${bad} 針数${plan.stats.stitches}`);
            }
          }catch(err){
            sweepNg++;
            console.log(`   [NG] ${weight}/${density}/${angle}°/${widthMm}mm — 例外: ${err.message}`);
          }
        }
      }
    }
  }
  if (sweepNg) failures += sweepNg;
  console.log(`   [${sweepNg ? 'NG' : 'ok'}] C7 掃引 ${swept} 通り（例外/長針/極端な針数なし）`);
}

console.log('\n=== まとめ ===');
for (const s of summary){
  console.log(` ${s.name.padEnd(8)} 針数 ${String(s.stitches).padStart(6)}  トリム ${String(s.trims).padStart(3)}  ` +
    `${s.size.wMm}×${s.size.hMm}mm  ${JSON.stringify(s.regions)}`);
}
console.log(failures === 0 ? '\nすべての検査に合格しました。' : `\n検査失敗: ${failures} 件`);
console.log(`出力: ${OUT}（readback: py -X utf8 tools/readback.py "${OUT}"）`);
process.exit(failures === 0 ? 0 : 1);
