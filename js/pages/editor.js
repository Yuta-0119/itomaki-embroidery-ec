/* =============================================================
   いとまき — 刺繍エディタ（コア機能）
   画像アップロード → 変換 → 調整 → 商品へ配置 → カートへ
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  // -------------------------------------------------------------
  // 共有ヘルパー: 商品SVG(viewBox 400×400)上へのオーバーレイ配置
  // -------------------------------------------------------------
  IT.placeOverlay = function(stage, elem, product, zone, placement, sizeMm, padMm){
    const ppm = product.pxPerMm;
    const vb = IT.productViewBox(product.id);
    const wU = (sizeMm.wMm + padMm * 2) * ppm;
    const hU = (sizeMm.hMm + padMm * 2) * ppm;
    const cxU = zone.cx + (placement.dx || 0) * ppm;
    const cyU = zone.cy + (placement.dy || 0) * ppm;
    elem.style.position = 'absolute';
    elem.style.left = ((cxU - wU / 2 - vb.x) / vb.w * 100) + '%';
    elem.style.top  = ((cyU - hU / 2 - vb.y) / vb.h * 100) + '%';
    elem.style.width = (wU / vb.w * 100) + '%';
    elem.style.height = 'auto';
    elem.style.transform = `rotate(${placement.rot || 0}deg)`;
  };

  // -------------------------------------------------------------
  // 共有ヘルパー: 保存済みデザイン → 製作データ生成
  // -------------------------------------------------------------
  IT.designIO = {
    reconstruct(design){
      const N = design.labels.w * design.labels.h;
      const result = {
        W: design.labels.w, H: design.labels.h,
        labels: IT.emb.rleDecode(design.labels.rle, N),
        palette: design.palette,
      };
      const sd = IT.emb.buildStitches(result, design.params, design.widthMm);
      return { result, sd };
    },
    svgText(item){
      const { result, sd } = this.reconstruct(item.design);
      const p = IT.productById[item.productId];
      return IT.emb.toSVG(sd, result, {
        params: item.design.params,
        product: { id: item.productId, name: p ? p.name : item.productId,
          color: item.colorId, size: item.size || null, placement: item.placement },
      });
    },
    /** ミシン用シーケンス（縫い順・止め縫い・下打ちを含む納品プラン） */
    buildPlan(item, order){
      const { result, sd } = this.reconstruct(item.design);
      const name = order ? order.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : 'itomaki';
      return IT.plan.compile(sd, result, { name });
    },
    /** 刺しゅうPRO / PE-Design 用 PESファイル */
    pesBytes(item, order){
      return IT.machine.writePes(this.buildPlan(item, order));
    },
    /** タジマDSTファイル（業務用ミシン・外注入稿用） */
    dstBytes(item, order){
      return IT.machine.writeDst(this.buildPlan(item, order));
    },
    pngDataUrl(item, px = 900){
      const { result, sd } = this.reconstruct(item.design);
      const cv = document.createElement('canvas');
      IT.emb.drawStitches(cv, sd, result, {
        pxPerMm: px / Math.max(sd.wMm, sd.hMm), padMm: 2, bg: '#FFFFFF', cssSize: false,
      });
      return cv.toDataURL('image/png');
    },
    specText(item, order){
      const p = IT.productById[item.productId];
      const color = p && p.colors.find(c => c.id === item.colorId);
      // 実際のステッチから糸ごとの針数を算出（SVG・PES・DSTと必ず一致させる）
      const plan = this.buildPlan(item, order);
      const pec = IT.machine.pecColors(plan.blocks);
      const threads = plan.blocks.map((bl, i) => ({
        code: bl.code, name: bl.name, hex: bl.hex,
        stitches: bl.stitches,
        brother: { index: pec[i].index, name: pec[i].name },  // 刺しゅうPRO上の糸番号
      }));
      const machine = {
        formats: ['PES(刺しゅうPRO/PE-Design)', 'DST(タジマ)', 'SVG(実寸)'],
        totalStitches: plan.stats.stitches,      // 下打ち・止め縫い込みの実針数
        colorChanges: plan.stats.colorChanges,
        trims: plan.stats.trims,
        underlay: 'あり（本縫いと直交・3mm間隔）',
        pullCompensationMm: 0.18,
        sizeMm: plan.size,
      };
      return JSON.stringify({
        order: order ? { id: order.id, createdAt: order.createdAt } : null,
        product: { id: item.productId, name: p ? p.name : '', color: color ? color.label : item.colorId, size: item.size || null },
        qty: item.qty,
        embroidery: {
          style: item.design.params.style === 'cross' ? 'クロスステッチ' : 'タタミ縫い',
          widthMm: item.design.widthMm,
          heightMm: Math.round(item.design.heightMm * 10) / 10,
          stitchCount: item.design.stitchCount,
          weight: item.design.params.weight,
          density: item.design.params.density,
          angle: item.design.params.angle,
          threads,
        },
        machine,
        placement: item.placement,
        price: item.price,
      }, null, 2);
    },
  };

  // =============================================================
  // エディタ本体
  // =============================================================
  IT.pages.editor = function(el, params){
    const product = IT.productById[params.productId] || IT.PRODUCTS[0];
    const q = params.query || {};

    // ---- 状態 ----
    const E = {
      product,
      colorId: product.colors.some(c => c.id === q.color) ? q.color : product.colors[0].id,
      size: product.sizes ? (product.sizes.includes(q.size) ? q.size : 'M') : null,
      srcCanvas: null, srcName: '', srcThumb: '',
      params: { style:'tatami', colors:6, weight:'normal', density:'normal', angle:45, removeBg:false, bgTol:40, lineBoost:true },
      place: { zoneId: product.zones[0].id, dx:0, dy:0, widthMm: product.zones[0].defWmm, rot:0 },
      qty: 1,
      result: null, sd: null,
      analyzing: false,
      token: 0,
    };

    const color = () => E.product.colors.find(c => c.id === E.colorId) || E.product.colors[0];
    const zone = () => E.product.zones.find(z => z.id === E.place.zoneId) || E.product.zones[0];
    const aspect = () => E.result ? E.result.H / E.result.W : 1;
    const effMaxW = () => {
      const z = zone();
      return Math.floor(Math.min(z.maxWmm, z.maxWmm / aspect()));
    };
    const heightMm = () => E.place.widthMm * aspect();

    // ---- 骨組み ----
    el.innerHTML = `
    <div class="editor-page container">
      <div class="editor-head">
        <div>
          <p class="small" style="margin-bottom:2px;"><a class="muted" href="#/product/${product.id}">← ${IT.esc(product.name)} にもどる</a></p>
          <h1>${IT.ui.icon('needle')} ${IT.esc(product.name)} に刺繍する</h1>
        </div>
        <span class="tag tag-pink">${IT.ui.icon('sparkle')} 画像はブラウザ内だけで処理されます</span>
      </div>

      <div class="editor-grid">
        <!-- ステージ（モバイルではタブで切替） -->
        <div class="editor-stage-col">
          <div class="seg stage-tabs" id="stage-tabs" role="tablist" aria-label="プレビュー切替">
            <button class="seg-btn on" data-stab="fit" role="tab" aria-selected="true">しあがり全体</button>
            <button class="seg-btn" data-stab="close" role="tab" aria-selected="false">ぬいめアップ</button>
          </div>
          <div class="stage-frame" id="frame-fit">
            <span class="stage-title">しあがりプレビュー</span>
            <div class="product-stage" id="stage">
              ${IT.productArt(product.id, color().hex)}
              <div class="zone-outline" id="zone-outline"><span class="zone-name" id="zone-name"></span></div>
              <canvas class="emb-overlay" id="overlay" style="display:none;" aria-label="刺繍の配置。ドラッグで移動"></canvas>
            </div>
            <p class="stage-hint">刺繍をドラッグすると位置を動かせます</p>
          </div>
          <div class="stage-frame closeup-frame mhide" id="frame-close">
            <span class="stage-title">刺繍のアップ</span>
            <div class="closeup-canvas-wrap" id="closeup-wrap">
              <div class="closeup-empty" id="closeup-empty">
                ${IT.ui.icon('image')}
                <div>画像をえらぶと、ここに刺繍プレビューが出ます</div>
              </div>
              <canvas id="closeup" style="display:none;"></canvas>
            </div>
          </div>
        </div>

        <!-- パネル（スマホでは 画像→プレビュー→調整→配置→金額 の順） -->
        <div class="panel-card ep-source">
          <div class="panel-title"><span class="p-num">1</span> デザインのもとになる画像</div>
          <div id="panel-source"></div>
          <input type="file" id="file-input" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
        </div>

        <div class="panel-card ep-adjust" id="panel-adjust">
          <div class="panel-title"><span class="p-num">2</span> 刺繍のちょうせい
            <button class="btn btn-sm btn-secondary p-opt" id="auto-btn" title="画像に合わせて自動調整">${IT.ui.icon('wand')} おまかせ</button>
          </div>
          <div id="adjust-body"></div>
        </div>

        <div class="panel-card ep-place" id="panel-place">
          <div class="panel-title"><span class="p-num">3</span> ばしょと大きさ</div>
          <div id="place-body"></div>
        </div>

        <div class="price-panel ep-price" id="price-panel"></div>
      </div>

      <!-- モバイル用: 固定の合計バー -->
      <div class="sticky-bar for-editor" id="editor-bar">
        <div class="sb-info">
          <span class="sb-label">ごうけい（数量ぶん・税込）</span>
          <span class="sb-price" id="bar-price">画像をえらんでね</span>
        </div>
        <button class="btn btn-primary" id="bar-add" disabled>${IT.ui.icon('cart')} カートへ</button>
      </div>
    </div>`;

    const $ = sel => el.querySelector(sel);
    const stage = $('#stage');
    const overlay = $('#overlay');
    const zoneOutline = $('#zone-outline');
    const closeup = $('#closeup');
    const fileInput = $('#file-input');

    // =============================================
    // パネル1: 画像ソース
    // =============================================
    function renderSourcePanel(){
      const box = $('#panel-source');
      if (!E.srcCanvas){
        box.innerHTML = `
          <div class="drop-zone" id="drop-zone" role="button" tabindex="0" aria-label="画像をアップロード">
            ${IT.ui.icon('upload')}
            <p><b>ここに画像をドロップ</b> または クリックしてえらぶ</p>
            <p class="dz-sub">JPG / PNG / GIF / WebP ・ イラストやロゴがいちばんきれいです</p>
          </div>
          <p class="small muted" style="margin:12px 0 6px;">またはサンプルでためす:</p>
          <div class="sample-row">${sampleChips()}</div>`;
        const dz = $('#drop-zone');
        dz.addEventListener('click', () => fileInput.click());
        dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
        wireDrop(dz);
      } else {
        box.innerHTML = `
          <div class="src-preview">
            <img src="${E.srcThumb}" alt="アップロード画像">
            <div style="flex:1;">
              <div class="src-name">${IT.esc(E.srcName)}</div>
              <button class="btn btn-ghost btn-sm" id="change-src" style="margin-top:6px;">${IT.ui.icon('image')} 画像をかえる</button>
            </div>
          </div>
          <div class="sample-row" style="justify-content:flex-start; margin-top:12px;">${sampleChips()}</div>`;
        $('#change-src').addEventListener('click', () => fileInput.click());
        wireDrop(box);
      }
      box.querySelectorAll('[data-sample]').forEach(chip => {
        chip.addEventListener('click', () => loadSample(chip.dataset.sample));
      });
    }

    function sampleChips(){
      return IT.SAMPLE_IMAGES.map(s =>
        `<button class="sample-chip" data-sample="${s.id}" title="サンプル「${s.label}」">${IT.sampleThumb(s)}</button>`).join('');
    }

    function wireDrop(target){
      ['dragover','dragenter'].forEach(ev => target.addEventListener(ev, e => {
        e.preventDefault(); target.classList.add('dragover');
      }));
      ['dragleave','drop'].forEach(ev => target.addEventListener(ev, e => {
        e.preventDefault(); target.classList.remove('dragover');
      }));
      target.addEventListener('drop', e => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = '';
    });

    async function handleFile(file){
      if (!/^image\//.test(file.type)){
        IT.ui.toast('画像ファイルをえらんでください', 'close'); return;
      }
      if (file.size > 20 * 1024 * 1024){
        IT.ui.toast('20MB以下の画像にしてください', 'close'); return;
      }
      try{
        const { canvas } = await IT.emb.loadSource(file);
        setSource(canvas, file.name);
      }catch(err){
        console.warn(err);
        IT.ui.toast('画像を読み込めませんでした', 'close');
      }
    }

    async function loadSample(id){
      const s = IT.SAMPLE_IMAGES.find(x => x.id === id);
      if (!s) return;
      const cv = await IT.svgToCanvas(s.svg, 480);
      setSource(cv, `サンプル「${s.label}」`);
    }

    function setSource(canvas, name){
      E.srcCanvas = canvas;
      E.srcName = name;
      // サムネイル（96px）
      const t = document.createElement('canvas');
      const sc = 96 / Math.max(canvas.width, canvas.height);
      t.width = Math.max(1, Math.round(canvas.width * sc));
      t.height = Math.max(1, Math.round(canvas.height * sc));
      const g = t.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height);
      g.drawImage(canvas, 0, 0, t.width, t.height);
      E.srcThumb = t.toDataURL('image/jpeg', 0.85);
      // おまかせ初期調整
      const auto = IT.emb.autoParams(canvas);
      E.params.colors = auto.colors;
      E.params.removeBg = auto.removeBg;
      E.params.lineBoost = auto.lineBoost;
      renderSourcePanel();
      renderAdjustPanel();
      runAnalyze();
    }

    // =============================================
    // パネル2: 刺繍の調整
    // =============================================
    function renderAdjustPanel(){
      const P = E.params;
      const body = $('#adjust-body');
      const dis = E.srcCanvas ? '' : 'style="opacity:.45; pointer-events:none;"';
      body.innerHTML = `
      <div ${dis}>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('needle')} ぬいかた</div>
          <div class="seg" data-seg="style">
            <button class="seg-btn ${P.style==='tatami'?'on':''}" data-val="tatami">タタミぬい</button>
            <button class="seg-btn ${P.style==='cross'?'on':''}" data-val="cross">クロスステッチ</button>
          </div>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('palette')} 糸のいろかず <span class="val" id="colors-val">${P.colors}色</span></div>
          <input type="range" id="colors-range" min="2" max="12" step="1" value="${P.colors}">
        </div>
        <div class="ctrl">
          <label class="toggle">
            <input type="checkbox" id="lineboost-toggle" ${P.lineBoost?'checked':''}>
            <span class="tgl-track"></span>
            <span style="font-weight:700; font-size:.9rem;">線をくっきり残す
              <span class="small" style="color:var(--ink-faint); font-weight:500;">（イラスト・顔・文字むけ）</span></span>
          </label>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('density')} 糸のふとさ</div>
          <div class="seg" data-seg="weight">
            <button class="seg-btn ${P.weight==='thin'?'on':''}" data-val="thin">細め</button>
            <button class="seg-btn ${P.weight==='normal'?'on':''}" data-val="normal">ふつう</button>
            <button class="seg-btn ${P.weight==='thick'?'on':''}" data-val="thick">太め</button>
          </div>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('density')} ステッチのみっしり感</div>
          <div class="seg" data-seg="density">
            <button class="seg-btn ${P.density==='coarse'?'on':''}" data-val="coarse">あらめ</button>
            <button class="seg-btn ${P.density==='normal'?'on':''}" data-val="normal">ふつう</button>
            <button class="seg-btn ${P.density==='fine'?'on':''}" data-val="fine">ぎっしり</button>
          </div>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('rotate')} ステッチのかたむき <span class="val" id="angle-val">${P.angle}°</span></div>
          <input type="range" id="angle-range" min="0" max="180" step="5" value="${P.angle}">
        </div>
        <div class="ctrl">
          <label class="toggle">
            <input type="checkbox" id="removebg-toggle" ${P.removeBg?'checked':''}>
            <span class="tgl-track"></span>
            <span style="font-weight:700; font-size:.9rem;">まわりの背景をけす</span>
          </label>
          <div id="bgtol-wrap" style="${P.removeBg?'':'display:none;'}">
            <div class="ctrl-label small" style="font-weight:500;">けす強さ <span class="val" id="bgtol-val">${P.bgTol}</span></div>
            <input type="range" id="bgtol-range" min="5" max="95" step="5" value="${P.bgTol}">
          </div>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('spool')} つかう糸 <span class="val small" id="thread-count"></span></div>
          <div class="thread-list" id="thread-list"><p class="small muted">画像をえらぶと糸が決まります</p></div>
        </div>
      </div>`;

      body.querySelectorAll('[data-seg]').forEach(seg => {
        seg.addEventListener('click', e => {
          const btn = e.target.closest('[data-val]');
          if (!btn) return;
          const key = seg.dataset.seg;
          E.params[key] = btn.dataset.val;
          seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b === btn));
          scheduleRender(0);
        });
      });
      wireRange('#colors-range', v => {
        $('#colors-val').textContent = v + '色';
        E.params.colors = +v;
        scheduleAnalyze();
      });
      wireRange('#angle-range', v => {
        $('#angle-val').textContent = v + '°';
        E.params.angle = +v;
        scheduleRender(80);
      });
      $('#lineboost-toggle').addEventListener('change', e => {
        E.params.lineBoost = e.target.checked;
        runAnalyze();
      });
      $('#removebg-toggle').addEventListener('change', e => {
        E.params.removeBg = e.target.checked;
        $('#bgtol-wrap').style.display = e.target.checked ? '' : 'none';
        runAnalyze();
      });
      wireRange('#bgtol-range', v => {
        $('#bgtol-val').textContent = v;
        E.params.bgTol = +v;
        scheduleAnalyze();
      });
    }

    function wireRange(sel, onInput){
      const r = $(sel);
      if (!r) return;
      const paint = () => {
        const pct = (r.value - r.min) / (r.max - r.min) * 100;
        r.style.setProperty('--fill', pct + '%');
      };
      paint();
      r.addEventListener('input', () => { paint(); onInput(r.value); });
    }

    $('#auto-btn').addEventListener('click', () => {
      if (!E.srcCanvas){ IT.ui.toast('さきに画像をえらんでね', 'image'); return; }
      const auto = IT.emb.autoParams(E.srcCanvas);
      E.params.colors = auto.colors;
      E.params.removeBg = auto.removeBg;
      E.params.lineBoost = auto.lineBoost;
      renderAdjustPanel();
      runAnalyze();
      IT.ui.toast('画像に合わせて調整しました', 'wand');
    });

    function renderThreadList(){
      const list = $('#thread-list');
      const cnt = $('#thread-count');
      if (!E.result || !E.result.palette.length){
        list.innerHTML = '<p class="small muted">画像をえらぶと糸が決まります</p>';
        if (cnt) cnt.textContent = '';
        return;
      }
      const total = E.result.palette.reduce((s, p) => s + p.count, 0) || 1;
      const rows = E.result.palette
        .map((p, ci) => ({ p, ci }))
        .filter(x => x.p.count > 0)
        .sort((a, b) => b.p.count - a.p.count);
      if (cnt) cnt.textContent = `${rows.length}色`;
      list.innerHTML = rows.map(({ p, ci }) => {
        const t = IT.threadById[p.threadId];
        return `
        <button class="thread-item" data-cluster="${ci}" title="クリックで糸をかえる">
          <span class="thread-spool" style="background-color:${t.hex}"></span>
          <span class="thread-info">
            <span class="thread-name">${t.name} <span class="thread-code">${t.code}</span></span>
            <span class="thread-share">この糸が ${Math.round(p.count / total * 100)}%</span>
          </span>
          <span class="swap-hint">かえる ▸</span>
        </button>`;
      }).join('');
      list.querySelectorAll('[data-cluster]').forEach(btn => {
        btn.addEventListener('click', () => openThreadPicker(+btn.dataset.cluster));
      });
    }

    function openThreadPicker(cluster){
      const cur = E.result.palette[cluster];
      const curThread = IT.threadById[cur.threadId];
      const m = IT.ui.modal(`
        <p class="small muted" style="margin-bottom:12px;">
          いまの糸: <b style="color:${curThread.hex === '#FBFAF4' ? 'var(--ink)' : curThread.hex};">● ${curThread.name}（${curThread.code}）</b>
          — すきな糸にかえられます
        </p>
        <div class="palette-grid">
          ${IT.THREADS.map(t => `
            <button class="palette-cell ${t.id === cur.threadId ? 'on' : ''}" data-tid="${t.id}">
              <span class="pc-dot" style="background:${t.hex}"></span>
              <span class="pc-name">${t.name}<br><span class="muted">${t.code}</span></span>
            </button>`).join('')}
        </div>`, { title: `${IT.ui.icon('spool')} 糸をえらぶ` });
      m.el.querySelectorAll('[data-tid]').forEach(cell => {
        cell.addEventListener('click', () => {
          E.result.palette[cluster].threadId = cell.dataset.tid;
          m.close();
          renderThreadList();
          scheduleRender(0);
          IT.ui.toast(`「${IT.threadById[cell.dataset.tid].name}」にかえました`, 'spool');
        });
      });
    }

    // =============================================
    // パネル3: 配置
    // =============================================
    function renderPlacePanel(){
      const body = $('#place-body');
      const z = zone();
      const maxW = E.result ? effMaxW() : z.maxWmm;
      const val = Math.min(E.place.widthMm, maxW);
      const dis = E.srcCanvas ? '' : 'style="opacity:.45; pointer-events:none;"';
      body.innerHTML = `
      <div ${dis}>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('pin')} 刺繍するばしょ</div>
          <div class="seg" data-seg-zone>
            ${E.product.zones.map(zz => `
              <button class="seg-btn ${zz.id === E.place.zoneId ? 'on' : ''}" data-zone="${zz.id}">${zz.label}</button>`).join('')}
          </div>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('ruler')} 大きさ <span class="val" id="size-val">${(val/10).toFixed(1)}cm</span></div>
          <input type="range" id="size-range" min="20" max="${maxW}" step="1" value="${val}">
          <p class="small muted">この場所には よこ最大 ${(z.maxWmm/10).toFixed(0)}cm まで入ります</p>
        </div>
        <div class="ctrl">
          <div class="ctrl-label">${IT.ui.icon('rotate')} かたむき <span class="val" id="rot-val">${E.place.rot}°</span></div>
          <input type="range" id="rot-range" min="-30" max="30" step="1" value="${E.place.rot}">
        </div>
        <div class="ctrl">
          <div class="ctrl-label">生地のいろ <span class="val small">${color().label}</span></div>
          <div class="swatch-row">
            ${E.product.colors.map(c => `
              <button class="swatch ${c.id === E.colorId ? 'on' : ''}" data-color="${c.id}"
                style="background:${c.hex}; width:34px; height:34px;" title="${c.label}" aria-label="${c.label}"></button>`).join('')}
          </div>
        </div>
        ${E.product.sizes ? `
        <div class="ctrl">
          <div class="ctrl-label">サイズ</div>
          <div class="size-row">
            ${E.product.sizes.map(s => `<button class="size-chip ${s === E.size ? 'on' : ''}" data-asize="${s}" style="min-width:44px; padding:.3em .7em;">${s}</button>`).join('')}
          </div>
        </div>` : ''}
        <div class="ctrl" style="border-bottom:none;">
          <button class="btn btn-ghost btn-sm" id="reset-place">${IT.ui.icon('rotate')} まんなかにもどす</button>
        </div>
      </div>`;

      body.querySelector('[data-seg-zone]').addEventListener('click', e => {
        const btn = e.target.closest('[data-zone]');
        if (!btn) return;
        E.place.zoneId = btn.dataset.zone;
        E.place.dx = 0; E.place.dy = 0;
        E.place.widthMm = Math.min(zone().defWmm, E.result ? effMaxW() : zone().maxWmm);
        renderPlacePanel();
        scheduleRender(0);
        flashZone();
      });
      wireRange('#size-range', v => {
        $('#size-val').textContent = (v/10).toFixed(1) + 'cm';
        E.place.widthMm = +v;
        clampOffsets();
        scheduleRender(90);
      });
      wireRange('#rot-range', v => {
        $('#rot-val').textContent = v + '°';
        E.place.rot = +v;
        positionOverlay();
      });
      body.querySelectorAll('[data-color]').forEach(sw => {
        sw.addEventListener('click', () => {
          E.colorId = sw.dataset.color;
          stage.querySelector('svg.product-art').outerHTML = IT.productArt(E.product.id, color().hex);
          renderPlacePanel();
        });
      });
      body.querySelectorAll('[data-asize]').forEach(chip => {
        chip.addEventListener('click', () => {
          E.size = chip.dataset.asize;
          body.querySelectorAll('[data-asize]').forEach(c => c.classList.toggle('on', c.dataset.asize === E.size));
        });
      });
      const rp = body.querySelector('#reset-place');
      if (rp) rp.addEventListener('click', () => {
        E.place.dx = 0; E.place.dy = 0; E.place.rot = 0;
        renderPlacePanel();
        positionOverlay();
      });
    }

    // =============================================
    // 変換・描画
    // =============================================
    let analyzeTimer = null, renderTimer = null;

    function scheduleAnalyze(){
      clearTimeout(analyzeTimer);
      analyzeTimer = setTimeout(runAnalyze, 160);
    }

    function runAnalyze(){
      if (!E.srcCanvas) return;
      const token = ++E.token;
      showLoading(true);
      setTimeout(() => {
        if (token !== E.token) return;
        try{
          E.result = IT.emb.analyze(E.srcCanvas, {
            colors: E.params.colors,
            removeBg: E.params.removeBg,
            bgTol: E.params.bgTol,
          });
        }catch(err){
          console.error('analyze failed', err);
          IT.ui.toast('変換に失敗しました。別の画像で試してください', 'close');
          showLoading(false);
          return;
        }
        if (token !== E.token) return;
        if (!E.result.palette.some(p => p.count > 0)){
          E.result = null;
          showLoading(false);
          $('#closeup-empty').innerHTML = `${IT.ui.icon('info')}<div>ぜんぶ背景として消えてしまいました。<br>「けす強さ」を弱くしてみてください</div>`;
          $('#closeup-empty').style.display = '';
          closeup.style.display = 'none';
          overlay.style.display = 'none';
          updatePricePanel();
          renderThreadList();
          return;
        }
        // サイズ上限をアスペクト比に合わせてクランプ
        E.place.widthMm = Math.min(E.place.widthMm, effMaxW());
        showLoading(false);
        renderPlacePanel();
        renderThreadList();
        renderDesign();
      }, 30);
    }

    function showLoading(on){
      const wrap = $('#closeup-wrap');
      let ld = wrap.querySelector('.stitch-loading');
      if (on){
        $('#closeup-empty').style.display = 'none';
        if (!ld){
          const div = document.createElement('div');
          div.innerHTML = IT.ui.loadingHtml('ちくちく変換中…');
          wrap.appendChild(div.firstElementChild);
        }
      } else if (ld){
        ld.remove();
      }
    }

    function scheduleRender(delay){
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderDesign, delay);
    }

    function renderDesign(){
      if (!E.result){ updatePricePanel(); return; }
      E.sd = IT.emb.buildStitches(E.result, E.params, E.place.widthMm);

      // アップ（closeup）— タブで非表示中は clientWidth が 0 になるためガード
      const cw = $('#closeup-wrap').clientWidth;
      const wrapW = Math.min(cw > 80 ? cw - 28 : 420, 460);
      const pxPerMm = Math.max(2, wrapW / Math.max(E.sd.wMm, E.sd.hMm));
      IT.emb.drawStitches(closeup, E.sd, E.result, {
        pxPerMm: Math.min(pxPerMm, 9), padMm: 2, dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      closeup.style.display = '';
      $('#closeup-empty').style.display = 'none';

      // 商品上のオーバーレイ
      const q = Math.max(2.4, 300 / Math.max(E.sd.wMm, E.sd.hMm));
      IT.emb.drawStitches(overlay, E.sd, E.result, {
        pxPerMm: q, padMm: 1.5, cssSize: false,
      });
      overlay.style.display = '';
      positionOverlay();
      updatePricePanel();
    }

    function positionOverlay(){
      if (!E.sd) return;
      clampOffsets();
      IT.placeOverlay(stage, overlay, E.product, zone(), E.place,
        { wMm: E.sd.wMm, hMm: E.sd.hMm }, 1.5);
      positionZoneOutline();
    }

    function positionZoneOutline(){
      const z = zone();
      IT.placeOverlay(stage, zoneOutline, E.product, z, { dx:0, dy:0, rot:0 },
        { wMm: z.maxWmm, hMm: z.maxWmm }, 0);
      $('#zone-name').textContent = z.label;
    }

    function clampOffsets(){
      if (!E.result) return;
      const z = zone();
      const w = E.place.widthMm, h = heightMm();
      const hx = Math.max(0, (z.maxWmm - w) / 2);
      const hy = Math.max(0, (z.maxWmm - h) / 2);
      E.place.dx = Math.max(-hx, Math.min(hx, E.place.dx));
      E.place.dy = Math.max(-hy, Math.min(hy, E.place.dy));
    }

    function flashZone(){
      zoneOutline.classList.add('show');
      clearTimeout(flashZone._t);
      flashZone._t = setTimeout(() => {
        if (!drag) zoneOutline.classList.remove('show');
      }, 1400);
    }

    // ---- ドラッグ ----
    let drag = null;
    overlay.addEventListener('pointerdown', e => {
      if (!E.sd) return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, dx0: E.place.dx, dy0: E.place.dy };
      overlay.setPointerCapture(e.pointerId);
      overlay.classList.add('dragging');
      zoneOutline.classList.add('show');
    });
    overlay.addEventListener('pointermove', e => {
      if (!drag) return;
      const stagePx = stage.clientWidth || 1;
      const mmPerPx = 400 / stagePx / E.product.pxPerMm;
      E.place.dx = drag.dx0 + (e.clientX - drag.x) * mmPerPx;
      E.place.dy = drag.dy0 + (e.clientY - drag.y) * mmPerPx;
      clampOffsets();
      IT.placeOverlay(stage, overlay, E.product, zone(), E.place,
        { wMm: E.sd.wMm, hMm: E.sd.hMm }, 1.5);
    });
    const endDrag = e => {
      if (!drag) return;
      drag = null;
      overlay.classList.remove('dragging');
      setTimeout(() => { if (!drag) zoneOutline.classList.remove('show'); }, 600);
    };
    overlay.addEventListener('pointerup', endDrag);
    overlay.addEventListener('pointercancel', endDrag);

    // =============================================
    // 価格パネル
    // =============================================
    function designSnapshot(){
      return {
        params: { ...E.params },
        palette: E.result.palette.map(p => ({ threadId: p.threadId, count: p.count })),
        widthMm: E.place.widthMm,
        heightMm: heightMm(),
        coverage: E.result.coverage,
        stitchCount: E.sd ? E.sd.stitchCount : 0,
      };
    }

    function updatePricePanel(){
      const panel = $('#price-panel');
      const ready = !!(E.result && E.sd);
      let fee = 0, unit = E.product.price;
      if (ready){
        fee = IT.store.embroideryFee(designSnapshot());
        unit = E.product.price + fee;
      }
      const usedColors = ready ? E.result.palette.filter(p => p.count > 0).length : 0;
      panel.innerHTML = `
        <div class="price-rows">
          <div class="price-row"><span>${IT.esc(E.product.name)}${E.size ? `（${E.size}）` : ''}</span><b>${IT.money(E.product.price)}</b></div>
          <div class="price-row"><span>刺繍代${ready ? `（${(E.place.widthMm/10).toFixed(1)}cm・${usedColors}色）` : ''}</span><b>${ready ? IT.money(fee) : '—'}</b></div>
          <div class="price-row"><span>すうりょう</span>
            <span class="qty-ctrl">
              <button class="qty-btn" id="qty-minus" aria-label="へらす">${IT.ui.icon('minus')}</button>
              <span class="qty-num">${E.qty}</span>
              <button class="qty-btn" id="qty-plus" aria-label="ふやす">${IT.ui.icon('plus')}</button>
            </span>
          </div>
          <div class="price-row total"><span>ごうけい</span><span>${ready ? IT.money(unit * E.qty) : '—'}</span></div>
        </div>
        <div class="price-facts">
          ${ready ? `
            <span class="tag tag-pink">${IT.ui.icon('needle')} 約${E.sd.stitchCount.toLocaleString()}針</span>
            <span class="tag tag-green">${IT.ui.icon('spool')} 糸${usedColors}色</span>
            <span class="tag tag-mustard">${IT.ui.icon('truck')} 目安${5 + Math.floor(E.sd.stitchCount * E.qty / 10000)}営業日</span>
          ` : `<span class="tag">画像をえらぶと見積もりが出ます</span>`}
        </div>
        <button class="btn btn-primary btn-lg" id="add-cart-btn" style="width:100%; margin-top:16px;" ${ready ? '' : 'disabled'}>
          ${IT.ui.icon('cart')} カートにいれる
        </button>
        <p class="small muted center" style="margin-top:10px;">¥6,000以上で送料無料（通常¥520）</p>`;

      $('#qty-minus').addEventListener('click', () => { E.qty = Math.max(1, E.qty - 1); updatePricePanel(); });
      $('#qty-plus').addEventListener('click', () => { E.qty = Math.min(20, E.qty + 1); updatePricePanel(); });
      $('#add-cart-btn').addEventListener('click', addToCart);

      // モバイル固定バーも同期
      const barPrice = $('#bar-price'), barAdd = $('#bar-add');
      if (barPrice){
        barPrice.textContent = ready ? IT.money(unit * E.qty) : '画像をえらんでね';
        barPrice.style.fontSize = ready ? '' : '.9rem';
        barAdd.disabled = !ready;
      }
    }

    // =============================================
    // カート追加（完成イメージのサムネイル合成つき）
    // =============================================
    async function addToCart(){
      if (!E.result || !E.sd) return;
      const btns = [$('#add-cart-btn'), $('#bar-add')].filter(Boolean);
      btns.forEach(b => b.disabled = true);
      try{
        const thumb = await makeThumb();
        const design = designSnapshot();
        design.labels = {
          w: E.result.W, h: E.result.H,
          rle: IT.emb.rleEncode(E.result.labels),
        };
        design.srcThumb = E.srcThumb;
        const fee = IT.store.embroideryFee(design);
        IT.store.addToCart({
          productId: E.product.id,
          colorId: E.colorId,
          size: E.size,
          qty: E.qty,
          thumb,
          design,
          placement: { ...E.place },
          price: { base: E.product.price, embroidery: fee, unit: E.product.price + fee },
        });
        const m = IT.ui.modal(`
          <div class="center">
            <img src="${thumb}" alt="カートに追加したデザイン" style="width:190px; border-radius:16px; border:2px dashed var(--line); margin:0 auto 14px;">
            <p style="font-weight:700; margin-bottom:18px;">カートにいれました！</p>
            <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-ghost" data-act="continue">つづけてつくる</button>
              <a class="btn btn-primary" href="#/cart" data-act="cart">${IT.ui.icon('cart')} カートを見る</a>
            </div>
          </div>`, { title: `${IT.ui.icon('heart')} できあがり！` });
        m.el.querySelector('[data-act=continue]').addEventListener('click', m.close);
        m.el.querySelector('[data-act=cart]').addEventListener('click', m.close);
      }catch(err){
        console.error(err);
        IT.ui.toast('カートに追加できませんでした', 'close');
      }finally{
        btns.forEach(b => b.disabled = false);
      }
    }

    /** 商品イラスト + 刺繍を1枚のサムネイルに合成 */
    function makeThumb(){
      return new Promise((resolve, reject) => {
        const SIZE = 360;
        const vb = IT.productViewBox(E.product.id);
        const svgStr = IT.productArt(E.product.id, color().hex, { width: 600 });
        const img = new Image();
        img.onload = () => {
          try{
            const cv = document.createElement('canvas');
            cv.width = SIZE; cv.height = SIZE;
            const g = cv.getContext('2d');
            g.fillStyle = '#FAF5EB';
            g.fillRect(0, 0, SIZE, SIZE);
            // 商品イラストを正方形に contain 配置
            const aspect = vb.h / vb.w;
            const drawW = aspect >= 1 ? SIZE / aspect : SIZE;
            const drawH = aspect >= 1 ? SIZE : SIZE * aspect;
            const ox = (SIZE - drawW) / 2, oy = (SIZE - drawH) / 2;
            g.drawImage(img, ox, oy, drawW, drawH);
            // オーバーレイを同じ配置で合成
            const ppm = E.product.pxPerMm;
            const pad = 1.5;
            const z = zone();
            const scale = drawW / vb.w;
            const wU = (E.sd.wMm + pad*2) * ppm * scale;
            const hU = (E.sd.hMm + pad*2) * ppm * scale;
            const cx = ox + (z.cx + E.place.dx * ppm - vb.x) * scale;
            const cy = oy + (z.cy + E.place.dy * ppm - vb.y) * scale;
            g.translate(cx, cy);
            g.rotate((E.place.rot || 0) * Math.PI / 180);
            g.drawImage(overlay, -wU/2, -hU/2, wU, hU);
            resolve(cv.toDataURL('image/jpeg', 0.86));
          }catch(err){ reject(err); }
        };
        img.onerror = () => reject(new Error('thumb compose failed'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      });
    }

    // =============================================
    // 初期描画
    // =============================================
    renderSourcePanel();
    renderAdjustPanel();
    renderPlacePanel();
    updatePricePanel();
    positionZoneOutline();
    flashZone();

    // モバイル: しあがり全体 ⇔ ぬいめアップ のタブ切替
    const tabsEl = $('#stage-tabs');
    tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-stab]');
      if (!btn) return;
      tabsEl.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      const showClose = btn.dataset.stab === 'close';
      $('#frame-fit').classList.toggle('mhide', showClose);
      $('#frame-close').classList.toggle('mhide', !showClose);
      // 非表示中はキャンバス幅が測れないので、表示された側を描き直す
      if (showClose){ if (E.result) renderDesign(); }
      else positionOverlay();
    });

    // モバイル固定バーの「カートへ」
    const barAddBtn = $('#bar-add');
    if (barAddBtn) barAddBtn.addEventListener('click', addToCart);

    // ページを離れたら resize リスナーを掃除
    const onResize = () => positionOverlay();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('hashchange', () => {
      window.removeEventListener('resize', onResize);
    }, { once: true });
  };
})();
