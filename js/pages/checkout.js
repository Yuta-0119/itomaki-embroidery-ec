/* =============================================================
   いとまき — チェックアウト & 注文完了
   決済はプロトタイプのため入力検証のみ（課金なし）
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

  const PAY_METHODS = [
    { id:'card',  label:'クレジットカード', desc:'VISA / Master / JCB / AMEX（このデモでは実際の決済は行われません）', icon:'yen' },
    { id:'konbini', label:'コンビニ払い', desc:'ご注文後に発行される番号でお支払い（手数料無料）', icon:'pin' },
    { id:'cod',   label:'代金引換', desc:'お届け時に配達員へお支払い（手数料 +¥330）', icon:'truck' },
  ];

  IT.pages.checkout = function(el){
    const items = IT.store.getCart();
    if (!items.length){ location.hash = '#/cart'; return; }

    let payMethod = 'card';
    // 前回の注文があれば入力を引き継ぐ（ちょっとした親切）
    const last = IT.store.getOrders()[0];
    const pre = last ? last.customer : {};

    function totals(){ return IT.store.cartTotals(items, payMethod); }

    el.innerHTML = `
    <section class="section" style="padding-top:36px;">
      <div class="container">
        <div class="chk-steps">
          <span class="chk-step"><span class="dot">1</span> カート</span>
          <span class="chk-sep"></span>
          <span class="chk-step on"><span class="dot">2</span> おとどけ先・お支払い</span>
          <span class="chk-sep"></span>
          <span class="chk-step"><span class="dot">3</span> かんりょう</span>
        </div>
        <div class="cart-grid checkout-grid">
          <form class="form-grid" id="chk-form" novalidate>
            <div class="card" style="display:grid; gap:16px;">
              <h3>${IT.ui.icon('user')} おとどけ先</h3>
              <div class="form-row">
                <div class="field" data-f="name">
                  <label>おなまえ <span class="req">必須</span></label>
                  <input name="name" type="text" placeholder="糸巻 はな" value="${IT.esc(pre.name || '')}" autocomplete="name">
                  <span class="field-error">おなまえを入力してください</span>
                </div>
                <div class="field" data-f="kana">
                  <label>フリガナ <span class="opt">任意</span></label>
                  <input name="kana" type="text" placeholder="イトマキ ハナ" value="${IT.esc(pre.kana || '')}">
                  <span class="field-error"></span>
                </div>
              </div>
              <div class="form-row">
                <div class="field" data-f="zip">
                  <label>ゆうびん番号 <span class="req">必須</span></label>
                  <input name="zip" type="text" inputmode="numeric" placeholder="123-4567" value="${IT.esc(pre.zip || '')}" autocomplete="postal-code">
                  <span class="field-error">例: 123-4567 の形式で入力してください</span>
                </div>
                <div class="field" data-f="pref">
                  <label>とどうふけん <span class="req">必須</span></label>
                  <select name="pref">
                    <option value="">えらんでください</option>
                    ${PREFS.map(p => `<option ${pre.pref === p ? 'selected' : ''}>${p}</option>`).join('')}
                  </select>
                  <span class="field-error">都道府県をえらんでください</span>
                </div>
              </div>
              <div class="field" data-f="addr">
                <label>じゅうしょ（市区町村・番地・建物名） <span class="req">必須</span></label>
                <input name="addr" type="text" placeholder="ぬいぬい市ちくちく町1-2-3 いとまきハイツ101" value="${IT.esc(pre.addr || '')}" autocomplete="street-address">
                <span class="field-error">住所を入力してください</span>
              </div>
              <div class="form-row">
                <div class="field" data-f="tel">
                  <label>でんわ番号 <span class="req">必須</span></label>
                  <input name="tel" type="tel" inputmode="tel" placeholder="090-1234-5678" value="${IT.esc(pre.tel || '')}" autocomplete="tel">
                  <span class="field-error">電話番号の形式が正しくありません</span>
                </div>
                <div class="field" data-f="email">
                  <label>メールアドレス <span class="req">必須</span></label>
                  <input name="email" type="email" placeholder="hana@example.com" value="${IT.esc(pre.email || '')}" autocomplete="email">
                  <span class="field-error">メールアドレスの形式が正しくありません</span>
                </div>
              </div>
              <div class="field" data-f="note">
                <label>びこう（ラッピング希望など） <span class="opt">任意</span></label>
                <textarea name="note" rows="2" placeholder="プレゼント用にリボンをかけてほしいです、など"></textarea>
              </div>
            </div>

            <div class="card" style="display:grid; gap:14px;">
              <h3>${IT.ui.icon('yen')} お支払いほうほう</h3>
              <div class="pay-options" id="pay-options">
                ${PAY_METHODS.map(m => `
                  <label class="pay-option ${m.id === payMethod ? 'on' : ''}" data-pay="${m.id}">
                    <input type="radio" name="pay" value="${m.id}" ${m.id === payMethod ? 'checked' : ''}>
                    <span>
                      <span class="pay-name">${m.label}</span><br>
                      <span class="pay-desc">${m.desc}</span>
                      ${m.id === 'card' ? `
                      <span class="card-fields ${payMethod === 'card' ? 'show' : ''}" id="card-fields">
                        <span class="field" data-f="cardNum">
                          <label class="small">カード番号</label>
                          <input name="cardNum" inputmode="numeric" placeholder="1234 5678 9012 3456" autocomplete="cc-number">
                          <span class="field-error">カード番号は14〜16桁の数字で入力してください</span>
                        </span>
                        <span class="form-row">
                          <span class="field" data-f="cardExp">
                            <label class="small">ゆうこうきげん (MM/YY)</label>
                            <input name="cardExp" placeholder="12/28" autocomplete="cc-exp">
                            <span class="field-error">MM/YY の形式で入力してください</span>
                          </span>
                          <span class="field" data-f="cardCvc">
                            <label class="small">セキュリティコード</label>
                            <input name="cardCvc" inputmode="numeric" placeholder="123" autocomplete="cc-csc">
                            <span class="field-error">3〜4桁の数字で入力してください</span>
                          </span>
                        </span>
                      </span>` : ''}
                    </span>
                  </label>`).join('')}
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-lg" id="order-btn" style="width:100%;">
              ${IT.ui.icon('heart')} 注文をかくていする
            </button>
            <p class="small muted center">＊これはプロトタイプです。実際の決済・発送は行われません。</p>
          </form>

          <div class="card summary-card">
            <h3 style="margin-bottom:14px;">ご注文内容</h3>
            <div class="order-items" style="margin-bottom:14px;">
              ${items.map(it => {
                const p = IT.productById[it.productId];
                return `
                <div class="order-item-row">
                  <div class="oi-thumb"><img src="${it.thumb}" alt=""></div>
                  <div class="small">
                    <b>${p ? IT.esc(p.name) : ''}</b><br>
                    <span class="muted">×${it.qty}</span>
                  </div>
                  <b class="small">${IT.money(it.price.unit * it.qty)}</b>
                </div>`;
              }).join('')}
            </div>
            <div class="price-rows" id="chk-totals"></div>
          </div>
        </div>
      </div>
    </section>`;

    function renderTotals(){
      const t = totals();
      el.querySelector('#chk-totals').innerHTML = `
        <div class="price-row"><span>しょうけい</span><b>${IT.money(t.subtotal)}</b></div>
        <div class="price-row"><span>そうりょう</span><b>${t.shipping === 0 ? '無料 ✿' : IT.money(t.shipping)}</b></div>
        ${t.codFee ? `<div class="price-row"><span>代引き手数料</span><b>${IT.money(t.codFee)}</b></div>` : ''}
        <div class="price-row total"><span>おしはらい</span><span>${IT.money(t.total)}</span></div>`;
    }
    renderTotals();

    el.querySelector('#pay-options').addEventListener('change', e => {
      payMethod = e.target.value;
      el.querySelectorAll('.pay-option').forEach(o => o.classList.toggle('on', o.dataset.pay === payMethod));
      const cf = el.querySelector('#card-fields');
      if (cf) cf.classList.toggle('show', payMethod === 'card');
      renderTotals();
    });

    // ---- バリデーション ----
    const RULES = {
      name:  v => v.trim().length > 0,
      zip:   v => /^\d{3}-?\d{4}$/.test(v.trim()),
      pref:  v => v !== '',
      addr:  v => v.trim().length > 2,
      tel:   v => /^0\d{1,4}-?\d{1,4}-?\d{3,4}$/.test(v.trim()),
      email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      cardNum: v => /^\d{14,16}$/.test(v.replace(/[\s-]/g, '')),
      cardExp: v => /^(0[1-9]|1[0-2])\/\d{2}$/.test(v.trim()),
      cardCvc: v => /^\d{3,4}$/.test(v.trim()),
    };

    function validate(){
      const form = el.querySelector('#chk-form');
      let ok = true, first = null;
      for (const key of Object.keys(RULES)){
        if (key.startsWith('card') && payMethod !== 'card') continue;
        const input = form.querySelector(`[name=${key}]`);
        const field = form.querySelector(`[data-f=${key}]`);
        if (!input || !field) continue;
        const valid = RULES[key](input.value);
        field.classList.toggle('invalid', !valid);
        if (!valid && !first) first = input;
        ok = ok && valid;
      }
      if (first){ first.focus(); first.scrollIntoView({ block:'center', behavior:'smooth' }); }
      return ok;
    }

    el.querySelector('#chk-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!validate()){
        IT.ui.toast('入力内容をかくにんしてください', 'info');
        return;
      }
      const f = new FormData(e.target);
      const customer = {
        name: f.get('name').trim(), kana: (f.get('kana')||'').trim(),
        zip: f.get('zip').trim(), pref: f.get('pref'), addr: f.get('addr').trim(),
        tel: f.get('tel').trim(), email: f.get('email').trim(),
        note: (f.get('note')||'').trim(),
      };
      const pm = PAY_METHODS.find(m => m.id === payMethod);
      const btn = el.querySelector('#order-btn');
      btn.disabled = true;
      btn.innerHTML = 'ちくちく手配中…';
      setTimeout(() => {
        const order = IT.store.createOrder(customer, { method: payMethod, label: pm.label });
        if (order){
          location.hash = `#/complete/${order.id}`;
        } else {
          btn.disabled = false;
          IT.ui.toast('注文を作成できませんでした', 'close');
        }
      }, 700);
    });
  };

  // =============================================================
  // 注文完了
  // =============================================================
  IT.pages.complete = function(el, params){
    const order = IT.store.getOrder(params.orderId);
    if (!order){ location.hash = '#/'; return; }

    el.innerHTML = `
    <section class="section" style="padding-top:20px;">
      <div class="container">
        <div class="complete-hero">
          <div class="comp-icon">
            <svg viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="48" fill="#FFFDF8" stroke="#E4D6BE" stroke-width="2.5" stroke-dasharray="7 6"/>
              <path d="M55,72 C40,61 30,52 31,42 c.6-6.8 6-11.4 12-11.4 4.4 0 8.2 2.3 10.4 6 2.2-3.7 6-6 10.4-6 6 0 11.4 4.6 12 11.4 1 10-9 19-21.2 30z"
                fill="#F2A9B8" stroke="#D97F8C" stroke-width="3" stroke-dasharray="5 4"/>
              <path d="M76,30 l3,7 7,3 -7,3 -3,7 -3,-7 -7,-3 7,-3 z" fill="#F5CB5C"/>
            </svg>
          </div>
          <span class="en-label" style="justify-content:center;">thank you!</span>
          <h1>ご注文ありがとうございます</h1>
          <p class="muted" style="margin-top:8px;">これから心をこめて、ちくちく縫わせていただきます。</p>
          <div class="order-num">注文番号: ${order.id}</div>
          <p class="small muted" style="margin-top:14px;">
            ${IT.ui.icon('truck')} 発送目安: 約${order.estimateDays}営業日 ／ お支払い: ${IT.esc(order.payment.label)}
          </p>
        </div>

        <div class="card" style="max-width:760px; margin:0 auto;">
          <h3 style="margin-bottom:14px;">${IT.ui.icon('box')} ご注文内容</h3>
          <div class="order-items">
            ${order.items.map((it, i) => {
              const p = IT.productById[it.productId];
              return `
              <div class="order-item-row">
                <div class="oi-thumb"><img src="${it.thumb}" alt=""></div>
                <div class="small">
                  <b>${p ? IT.esc(p.name) : ''}</b> ×${it.qty}<br>
                  <span class="muted">${it.design.params.style === 'cross' ? 'クロスステッチ' : 'タタミぬい'}・${(it.design.widthMm/10).toFixed(1)}cm・約${(it.design.stitchCount||0).toLocaleString()}針</span><br>
                  <span class="dl-row" style="justify-content:flex-start; margin-top:6px;">
                    <button class="btn btn-ghost btn-sm" data-dl="pes" data-i="${i}" title="刺しゅうPRO / 家庭用ブラザーミシン用">${IT.ui.icon('download')} 刺繍データ(PES)</button>
                    <button class="btn btn-ghost btn-sm" data-dl="dst" data-i="${i}">${IT.ui.icon('download')} DST</button>
                    <button class="btn btn-ghost btn-sm" data-dl="svg" data-i="${i}">${IT.ui.icon('download')} SVG</button>
                    <button class="btn btn-ghost btn-sm" data-dl="spec" data-i="${i}">${IT.ui.icon('download')} 仕様書</button>
                  </span>
                </div>
                <b class="small">${IT.money(it.price.unit * it.qty)}</b>
              </div>`;
            }).join('')}
          </div>
          <div class="price-rows" style="margin-top:16px; border-top:2px dotted var(--line); padding-top:12px;">
            <div class="price-row"><span>しょうけい</span><b>${IT.money(order.totals.subtotal)}</b></div>
            <div class="price-row"><span>そうりょう</span><b>${order.totals.shipping === 0 ? '無料' : IT.money(order.totals.shipping)}</b></div>
            ${order.totals.codFee ? `<div class="price-row"><span>代引き手数料</span><b>${IT.money(order.totals.codFee)}</b></div>` : ''}
            <div class="price-row total"><span>おしはらい</span><span>${IT.money(order.totals.total)}</span></div>
          </div>
          <div class="stitch-box small muted" style="margin-top:16px;">
            ${IT.ui.icon('pin')} おとどけ先: 〒${IT.esc(order.customer.zip)} ${IT.esc(order.customer.pref)}${IT.esc(order.customer.addr)} ${IT.esc(order.customer.name)} さま
          </div>
        </div>

        <div class="center" style="margin-top:30px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <a class="btn btn-ghost" href="#/mypage">${IT.ui.icon('user')} 注文履歴を見る</a>
          <a class="btn btn-primary" href="#/products">${IT.ui.icon('needle')} もうひとつ つくる</a>
        </div>
      </div>
    </section>`;

    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-dl]');
      if (!btn) return;
      const item = order.items[+btn.dataset.i];
      IT.downloadDesign(item, order, btn.dataset.dl);
    });
  };

  /** デザインデータのダウンロード（complete / mypage / admin 共通） */
  IT.downloadDesign = function(item, order, kind){
    const base = `itomaki_${order ? order.id : 'design'}_${item.productId}`;
    try{
      if (kind === 'pes'){
        IT.ui.downloadBytes(`${base}.pes`, IT.designIO.pesBytes(item, order));
      } else if (kind === 'dst'){
        IT.ui.downloadBytes(`${base}.dst`, IT.designIO.dstBytes(item, order));
      } else if (kind === 'svg'){
        IT.ui.downloadText(`${base}.svg`, IT.designIO.svgText(item, order), 'image/svg+xml');
      } else if (kind === 'png'){
        IT.ui.downloadDataUrl(`${base}.png`, IT.designIO.pngDataUrl(item));
      } else {
        IT.ui.downloadText(`${base}_spec.json`, IT.designIO.specText(item, order), 'application/json');
      }
      IT.ui.toast('ダウンロードをはじめました', 'download');
    }catch(err){
      console.error(err);
      IT.ui.toast('生成に失敗しました', 'close');
    }
  };
})();
