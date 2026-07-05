/* =============================================================
   いとまき — 注文管理（運営用）
   受注一覧・ステータス更新・製作データのダウンロード
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  const STATUSES = ['新規受付', '制作中', '発送済み'];

  IT.pages.admin = function(el){
    const orders = IT.store.getOrders();

    el.innerHTML = `
    <section class="section" style="padding-top:36px;">
      <div class="container">
        <div class="section-head">
          <span class="en-label">for atelier</span>
          <h2>${IT.ui.icon('spool')} 注文管理</h2>
          <p class="lead small">受注の確認・ステータス更新・製作データ（ステッチSVG / 仕様書）の取得ができます。<br>
          本番ではログイン保護されたバックオフィスになります（プロトタイプでは全注文がこの端末のブラウザ保存です）。</p>
        </div>

        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px;">
          ${STATUSES.map(s => {
            const n = orders.filter(o => o.status === s).length;
            return `<div class="stitch-box" style="flex:1; min-width:140px; text-align:center;">
              <div class="small muted">${s}</div>
              <div style="font-size:1.6rem; font-weight:700; color:var(--pink-deep);">${n}<span class="small" style="color:var(--ink-faint);"> 件</span></div>
            </div>`;
          }).join('')}
        </div>

        ${orders.length ? `
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr>
              <th>注文番号</th><th>受注日時</th><th>お客さま</th><th>点数</th><th>金額</th><th>ステータス</th><th></th>
            </tr></thead>
            <tbody id="admin-rows"></tbody>
          </table>
        </div>` : `
        <div class="empty-state">
          ${IT.ui.icon('box')}
          <p>まだ注文はありません。<br>ショップでテスト注文をすると、ここに表示されます。</p>
          <a class="btn btn-primary" href="#/products">ショップを見る</a>
        </div>`}
      </div>
    </section>`;

    const tbody = el.querySelector('#admin-rows');
    if (!tbody) return;

    orders.forEach(order => {
      const d = new Date(order.createdAt);
      const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b class="order-id" style="font-size:.92rem;">${order.id}</b></td>
        <td>${dt}</td>
        <td>${IT.esc(order.customer.name)}</td>
        <td>${order.items.reduce((s, it) => s + it.qty, 0)}点</td>
        <td><b>${IT.money(order.totals.total)}</b></td>
        <td>
          <select class="status-select" data-order="${order.id}">
            ${STATUSES.map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn btn-ghost btn-sm" data-detail="${order.id}">くわしく</button></td>`;
      tbody.appendChild(tr);

      const detailTr = document.createElement('tr');
      detailTr.style.display = 'none';
      detailTr.innerHTML = `<td colspan="7" style="background:var(--cream);"><div class="order-detail" style="display:grid; gap:14px; padding:8px 4px;"></div></td>`;
      tbody.appendChild(detailTr);

      tr.querySelector('[data-detail]').addEventListener('click', () => {
        const show = detailTr.style.display === 'none';
        detailTr.style.display = show ? '' : 'none';
        if (show && !detailTr.dataset.rendered){
          renderDetail(detailTr.querySelector('.order-detail'), order);
          detailTr.dataset.rendered = '1';
        }
      });

      tr.querySelector('.status-select').addEventListener('change', e => {
        IT.store.updateOrderStatus(order.id, e.target.value);
        IT.ui.toast(`${order.id} を「${e.target.value}」にしました`, 'check');
      });
    });

    function renderDetail(box, order){
      box.innerHTML = `
        <div class="stitch-box small">
          <b>${IT.ui.icon('pin')} おとどけ先</b><br>
          〒${IT.esc(order.customer.zip)} ${IT.esc(order.customer.pref)}${IT.esc(order.customer.addr)}<br>
          ${IT.esc(order.customer.name)} さま ／ ${IT.esc(order.customer.tel)} ／ ${IT.esc(order.customer.email)}
          ${order.customer.note ? `<br><b>備考:</b> ${IT.esc(order.customer.note)}` : ''}
          <br><b>支払い:</b> ${IT.esc(order.payment.label)}
        </div>
        <div style="display:grid; gap:12px;">
          ${order.items.map((it, i) => {
            const p = IT.productById[it.productId];
            const color = p && p.colors.find(c => c.id === it.colorId);
            const zone = p && p.zones.find(z => z.id === it.placement.zoneId);
            const threads = it.design.palette.filter(t => t.count > 0)
              .map(t => IT.threadById[t.threadId])
              .map(t => `<span class="tag" style="background:${t.hex}; color:${IT.luminance(t.hex) > 0.62 ? '#5C4B3A' : '#fff'};">${t.code} ${t.name}</span>`)
              .join(' ');
            return `
            <div class="card" style="padding:16px; display:grid; grid-template-columns:96px 1fr; gap:16px; align-items:start;">
              <img src="${it.thumb}" alt="" style="width:96px; border-radius:12px; border:2px dashed var(--line);">
              <div class="small" style="display:grid; gap:6px;">
                <b>${p ? IT.esc(p.name) : ''} ×${it.qty}</b>
                <span>生地: ${color ? color.label : ''}${it.size ? ` / サイズ${it.size}` : ''} ｜
                  ${it.design.params.style === 'cross' ? 'クロスステッチ' : 'タタミぬい'} ｜
                  ${zone ? zone.label : ''}に よこ${(it.design.widthMm/10).toFixed(1)}cm ｜
                  約${(it.design.stitchCount||0).toLocaleString()}針</span>
                <span>つかう糸: ${threads}</span>
                <span style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                  <button class="btn btn-secondary btn-sm" data-dl="svg" data-i="${i}">${IT.ui.icon('download')} ステッチSVG</button>
                  <button class="btn btn-ghost btn-sm" data-dl="png" data-i="${i}">${IT.ui.icon('download')} プレビューPNG</button>
                  <button class="btn btn-ghost btn-sm" data-dl="spec" data-i="${i}">${IT.ui.icon('download')} 仕様書JSON</button>
                </span>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      box.addEventListener('click', e => {
        const btn = e.target.closest('[data-dl]');
        if (!btn) return;
        IT.downloadDesign(order.items[+btn.dataset.i], order, btn.dataset.dl);
      });
    }
  };
})();
