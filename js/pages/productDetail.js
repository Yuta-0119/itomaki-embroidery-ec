/* =============================================================
   いとまき — 商品詳細
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  IT.pages.productDetail = function(el, params){
    const p = IT.productById[params.id];
    if (!p){ location.hash = '#/products'; return; }

    let colorId = (params.query && params.query.color) || p.colors[0].id;
    if (!p.colors.some(c => c.id === colorId)) colorId = p.colors[0].id;
    let size = p.sizes ? (p.sizes.includes(params.query && params.query.size) ? params.query.size : 'M') : null;

    el.innerHTML = `
    <section class="section detail-section" style="padding-top:34px;">
      <div class="container">
        <p class="small" style="margin-bottom:18px;">
          <a href="#/products" class="muted">← 商品いちらんへもどる</a>
        </p>
        <div class="detail-grid">
          <div class="detail-stage" id="detail-stage">
            ${IT.productArt(p.id, colorOf().hex)}
          </div>
          <div class="detail-info">
            <span class="en-label">${p.category === 'wear' ? 'wear' : p.category === 'baby' ? 'baby' : 'goods'}</span>
            <h1>${p.name}</h1>
            <div class="detail-price">${IT.money(p.price)} <span class="tax">（税込・刺繍代べつ）</span></div>
            <p class="detail-desc">${p.desc}</p>

            <div class="opt-block">
              <div class="opt-label">生地のいろ <span class="picked" id="color-label">${colorOf().label}</span></div>
              <div class="swatch-row" id="swatches">
                ${p.colors.map(c => `
                  <button class="swatch ${c.id === colorId ? 'on' : ''}" data-color="${c.id}"
                    style="background:${c.hex}" aria-label="${c.label}" title="${c.label}"></button>`).join('')}
              </div>
            </div>

            ${p.sizes ? `
            <div class="opt-block">
              <div class="opt-label">サイズ</div>
              <div class="size-row" id="sizes">
                ${p.sizes.map(s => `<button class="size-chip ${s === size ? 'on' : ''}" data-size="${s}">${s}</button>`).join('')}
              </div>
            </div>` : ''}

            <div class="opt-block">
              <div class="opt-label">刺繍できる場所</div>
              <div class="zone-list">
                ${p.zones.map(z => `
                  <div class="zone-row"><span>✿ ${z.label}</span><b>最大 ${z.maxWmm / 10}cm</b></div>`).join('')}
              </div>
            </div>

            <div class="opt-block" style="display:flex; gap:12px; flex-wrap:wrap;">
              <button class="btn btn-primary btn-lg" id="go-editor" style="flex:1; min-width:230px;">
                ${IT.ui.icon('needle')} この商品でつくる
              </button>
            </div>
            <p class="small muted">＊刺繍代はサイズと色数で変わります（¥600〜目安）。次の画面でリアルタイムに計算されます。</p>

            <div class="stitch-box" style="margin-top:26px;">
              <table class="spec-table">
                <tr><th>素材</th><td>${p.material}</td></tr>
                ${p.sizeSpec.map(row => `<tr><th>${row[0]}</th><td>${row.slice(1).join(' / ')}</td></tr>`).join('')}
                <tr><th>お手入れ</th><td>${p.care}</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- モバイル用: 固定CTAバー -->
      <div class="sticky-bar for-detail">
        <div class="sb-info">
          <span class="sb-label">${IT.esc(p.name)}</span>
          <span class="sb-price">${IT.money(p.price)}<span style="font-size:.72rem; font-weight:500; color:var(--ink-soft);"> +刺繍代</span></span>
        </div>
        <button class="btn btn-primary" id="go-editor-bar">${IT.ui.icon('needle')} つくる</button>
      </div>
    </section>`;

    function colorOf(){ return p.colors.find(c => c.id === colorId) || p.colors[0]; }

    el.querySelector('#swatches').addEventListener('click', e => {
      const btn = e.target.closest('[data-color]');
      if (!btn) return;
      colorId = btn.dataset.color;
      el.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.color === colorId));
      el.querySelector('#color-label').textContent = colorOf().label;
      el.querySelector('#detail-stage').innerHTML = IT.productArt(p.id, colorOf().hex);
    });

    const sizesEl = el.querySelector('#sizes');
    if (sizesEl){
      sizesEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-size]');
        if (!btn) return;
        size = btn.dataset.size;
        el.querySelectorAll('.size-chip').forEach(s => s.classList.toggle('on', s.dataset.size === size));
      });
    }

    function goEditor(){
      const q = [`color=${colorId}`];
      if (size) q.push(`size=${size}`);
      location.hash = `#/editor/${p.id}?${q.join('&')}`;
    }
    el.querySelector('#go-editor').addEventListener('click', goEditor);
    el.querySelector('#go-editor-bar').addEventListener('click', goEditor);
  };
})();
