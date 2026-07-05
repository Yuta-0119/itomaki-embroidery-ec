/* =============================================================
   いとまき — カート
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  function itemSpecs(it){
    const p = IT.productById[it.productId];
    const color = p && p.colors.find(c => c.id === it.colorId);
    const zone = p && p.zones.find(z => z.id === it.placement.zoneId);
    const style = it.design.params.style === 'cross' ? 'クロスステッチ' : 'タタミぬい';
    const colors = it.design.palette.filter(t => t.count > 0).length;
    return [
      `${color ? color.label : ''}${it.size ? ` / ${it.size}` : ''}`,
      `${style}・糸${colors}色・約${(it.design.stitchCount || 0).toLocaleString()}針`,
      `${zone ? zone.label : ''}に ${(it.design.widthMm/10).toFixed(1)}cm`,
    ];
  }

  IT.pages.cart = function(el){
    const items = IT.store.getCart();

    if (!items.length){
      el.innerHTML = `
      <section class="section">
        <div class="container">
          <div class="empty-state">
            ${IT.ui.icon('cart')}
            <p>カートはまだ からっぽです。<br>すきな画像で、刺繍をつくってみませんか？</p>
            <a class="btn btn-primary btn-lg" href="#/products">${IT.ui.icon('needle')} 商品をえらぶ</a>
          </div>
        </div>
      </section>`;
      return;
    }

    const totals = IT.store.cartTotals(items);
    const days = IT.store.estimateDays(items);

    el.innerHTML = `
    <section class="section" style="padding-top:36px;">
      <div class="container">
        <div class="section-head">
          <span class="en-label">cart</span>
          <h2>カートの中身</h2>
        </div>
        <div class="cart-grid">
          <div class="cart-list" id="cart-list">
            ${items.map(it => {
              const p = IT.productById[it.productId];
              return `
              <div class="card cart-item" data-id="${it.id}">
                <div class="cart-thumb"><img src="${it.thumb}" alt="デザインプレビュー"></div>
                <div>
                  <div class="cart-item-name">${p ? IT.esc(p.name) : ''}</div>
                  <div class="cart-item-specs">${itemSpecs(it).map(s => `<span>${IT.esc(s)}</span>`).join('')}</div>
                </div>
                <div class="cart-item-end">
                  <div class="cart-item-price">${IT.money(it.price.unit * it.qty)}</div>
                  <span class="qty-ctrl">
                    <button class="qty-btn" data-act="minus" aria-label="へらす">${IT.ui.icon('minus')}</button>
                    <span class="qty-num">${it.qty}</span>
                    <button class="qty-btn" data-act="plus" aria-label="ふやす">${IT.ui.icon('plus')}</button>
                  </span>
                  <button class="btn btn-danger-ghost btn-sm" data-act="remove">${IT.ui.icon('trash')} けす</button>
                </div>
              </div>`;
            }).join('')}
          </div>
          <div class="card summary-card">
            <h3 style="margin-bottom:14px;">ごうけい</h3>
            <div class="price-rows">
              <div class="price-row"><span>しょうけい</span><b>${IT.money(totals.subtotal)}</b></div>
              <div class="price-row"><span>そうりょう</span><b>${totals.shipping === 0 ? '無料 ✿' : IT.money(totals.shipping)}</b></div>
              <div class="price-row total"><span>おしはらい</span><span>${IT.money(totals.total)}</span></div>
            </div>
            ${totals.shipping > 0
              ? `<div class="free-ship-note">あと ${IT.money(6000 - totals.subtotal)} で送料無料！</div>`
              : `<div class="free-ship-note">送料無料でおとどけします ✿</div>`}
            <p class="small muted" style="margin:12px 0;">${IT.ui.icon('truck')} 制作目安: 約${days}営業日</p>
            <a class="btn btn-primary btn-lg" href="#/checkout" style="width:100%;">${IT.ui.icon('heart')} ご注文にすすむ</a>
            <a class="btn btn-ghost" href="#/products" style="width:100%; margin-top:10px;">つくりつづける</a>
          </div>
        </div>
      </div>
    </section>`;

    el.querySelector('#cart-list').addEventListener('click', async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('[data-id]');
      const id = row.dataset.id;
      const item = IT.store.getCart().find(x => x.id === id);
      if (!item) return;
      const act = btn.dataset.act;
      if (act === 'minus') IT.store.updateQty(id, item.qty - 1);
      if (act === 'plus')  IT.store.updateQty(id, item.qty + 1);
      if (act === 'remove'){
        const ok = await IT.ui.confirmModal('このデザインをカートからけしますか？<br><span class="small muted">（けすと元にもどせません）</span>', 'けす');
        if (!ok) return;
        IT.store.removeItem(id);
        IT.ui.toast('カートからけしました', 'trash');
      }
      IT.pages.cart(el);   // 再描画
    });
  };
})();
