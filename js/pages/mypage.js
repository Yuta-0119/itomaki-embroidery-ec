/* =============================================================
   いとまき — マイページ（注文履歴）
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  IT.pages.mypage = function(el){
    const orders = IT.store.getOrders();

    el.innerHTML = `
    <section class="section" style="padding-top:36px;">
      <div class="container">
        <div class="section-head">
          <span class="en-label">my page</span>
          <h2>ご注文りれき</h2>
          <p class="lead small">この端末のブラウザに保存されている注文が表示されます。</p>
        </div>
        <div id="order-list" style="display:grid; gap:20px; max-width:820px;">
          ${orders.length ? '' : `
            <div class="empty-state">
              ${IT.ui.icon('box')}
              <p>まだ注文がありません。<br>はじめての一針、お待ちしています。</p>
              <a class="btn btn-primary" href="#/products">${IT.ui.icon('needle')} つくってみる</a>
            </div>`}
        </div>
      </div>
    </section>`;

    const list = el.querySelector('#order-list');
    orders.forEach(order => {
      const div = document.createElement('div');
      div.className = 'card order-card';
      const d = new Date(order.createdAt);
      const date = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
      div.innerHTML = `
        <div class="order-head">
          <div>
            <span class="order-id">${order.id}</span>
            <span class="small muted" style="margin-left:10px;">${date} ・ ${IT.esc(order.payment.label)}</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <span class="status-pill status-${order.status}">${order.status}</span>
            <b>${IT.money(order.totals.total)}</b>
          </div>
        </div>
        <div class="order-items">
          ${order.items.map((it, i) => {
            const p = IT.productById[it.productId];
            return `
            <div class="order-item-row">
              <div class="oi-thumb"><img src="${it.thumb}" alt=""></div>
              <div class="small">
                <b>${p ? IT.esc(p.name) : ''}</b> ×${it.qty}<br>
                <span class="muted">${(it.design.widthMm/10).toFixed(1)}cm ・ 糸${it.design.palette.filter(t=>t.count>0).length}色</span>
              </div>
              <span class="dl-row" style="margin:0;">
                <button class="btn btn-ghost btn-sm" data-dl="pes" data-i="${i}" title="刺しゅうPRO用PES">${IT.ui.icon('download')} PES</button>
                <button class="btn btn-ghost btn-sm" data-dl="svg" data-i="${i}" title="刺繍データSVG">${IT.ui.icon('download')} SVG</button>
                <button class="btn btn-ghost btn-sm" data-dl="spec" data-i="${i}" title="仕様書JSON">${IT.ui.icon('download')} 仕様</button>
              </span>
            </div>`;
          }).join('')}
        </div>
        <p class="small muted">${IT.ui.icon('truck')} 発送目安: ご注文から約${order.estimateDays}営業日</p>`;
      div.addEventListener('click', e => {
        const btn = e.target.closest('[data-dl]');
        if (!btn) return;
        IT.downloadDesign(order.items[+btn.dataset.i], order, btn.dataset.dl);
      });
      list.appendChild(div);
    });
  };
})();
