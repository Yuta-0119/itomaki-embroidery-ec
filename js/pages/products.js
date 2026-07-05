/* =============================================================
   いとまき — 商品一覧
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  IT.pages.products = function(el, params){
    let cat = (params && params.query && params.query.cat) || 'all';

    el.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="page-hero" style="padding-top:20px;">
          <span class="en-label" style="justify-content:center;">items</span>
          <h1>商品をえらぶ</h1>
          <p class="lead">どの子に刺繍する？ ぜんぶ刺繍代込みで ¥2,000〜¥6,000 くらいが目安です。</p>
        </div>
        <div class="cat-tabs" id="cat-tabs" role="tablist">
          ${IT.CATEGORIES.map(c => `
            <button class="cat-tab ${c.id === cat ? 'on' : ''}" role="tab" data-cat="${c.id}"
              aria-selected="${c.id === cat}">${c.label}</button>`).join('')}
        </div>
        <div class="product-grid" id="prod-grid"></div>
      </div>
    </section>`;

    const grid = el.querySelector('#prod-grid');

    function renderGrid(){
      const list = IT.PRODUCTS.filter(p => cat === 'all' || p.category === cat);
      // カード全体タップ = 商品詳細へ。「つくる」ボタンはエディタ直行
      grid.innerHTML = list.map(p => {
        const c0 = p.colors[0];
        const zoneMax = Math.max(...p.zones.map(z => z.maxWmm)) / 10;
        return `
        <a class="product-card reveal in" href="#/product/${p.id}" aria-label="${p.name}の詳細を見る">
          <div class="product-thumb">${IT.productArt(p.id, c0.hex)}</div>
          <div class="product-body">
            <div class="product-name">${p.name}</div>
            <div class="product-price"><span class="yen">¥</span>${p.price.toLocaleString()}<span class="from">+ 刺繍代</span></div>
            <div class="product-meta">
              <div class="color-dots">${p.colors.map(c => `<span class="color-dot" style="background:${c.hex}" title="${c.label}"></span>`).join('')}</div>
              <span class="tag tag-green">刺繍 最大${zoneMax}cm</span>
            </div>
            <div class="product-cta">
              <button class="btn btn-primary btn-sm" data-make="${p.id}" style="flex:1;">${IT.ui.icon('needle')} この子でつくる</button>
            </div>
          </div>
        </a>`;
      }).join('');
    }

    // 「つくる」はカードのリンクより優先してエディタへ
    grid.addEventListener('click', e => {
      const mk = e.target.closest('[data-make]');
      if (mk){
        e.preventDefault();
        location.hash = '#/editor/' + mk.dataset.make;
      }
    });

    el.querySelector('#cat-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      cat = btn.dataset.cat;
      el.querySelectorAll('.cat-tab').forEach(b => {
        b.classList.toggle('on', b.dataset.cat === cat);
        b.setAttribute('aria-selected', String(b.dataset.cat === cat));
      });
      renderGrid();
    });

    renderGrid();
  };
})();
