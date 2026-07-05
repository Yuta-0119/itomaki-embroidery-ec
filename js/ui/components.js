/* =============================================================
   いとまき — UI部品
   手描きアイコン / ヘッダー / フッター / モーダル / トースト
   ============================================================= */
window.IT = window.IT || {};

(function(){
  'use strict';

  // =============================================
  // 手描き風アイコン（stroke: currentColor）
  // =============================================
  const I = (body, vb = '0 0 24 24') =>
    `<svg class="ic" viewBox="${vb}" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ICONS = {
    menu:  I('<path d="M4 7c5-.6 11-.6 16 0M4 12c5 .6 11 .6 16 0M4 17c5-.5 11-.5 16 .2"/>'),
    close: I('<path d="M6 6c4 4.2 8 8 12 12M18 6.4C14 10.2 10 14 6.2 18"/>'),
    cart:  I('<path d="M4 6h2.4l1.8 10.4c.1.6.6 1 1.2 1h8.4c.6 0 1.1-.4 1.2-1L20.6 9H7.2"/><circle cx="10" cy="20.4" r="1.4"/><circle cx="17" cy="20.4" r="1.4"/>'),
    heart: I('<path d="M12 20.2C7 16.4 3.6 13 3.9 9.3 4.1 6.8 6 5 8.3 5c1.6 0 3 .9 3.7 2.2C12.8 5.9 14.1 5 15.7 5 18 5 20 6.8 20.1 9.3c.3 3.7-3.2 7.1-8.1 10.9z"/>'),
    needle:I('<path d="M19.5 4.5c1.2 1.2 1.2 2.6.2 3.6L8.6 19.2c-1.6 1.6-3.9 1.9-4.8 1 -.9-.9-.6-3.2 1-4.8L15.9 4.3c1-1 2.4-1 3.6.2z"/><path d="M18.2 7.4l-1.6-1.6"/><path d="M4.5 19.5c2-.4 3.4-1.4 4.6-2.9"/>'),
    spool: I('<path d="M6 4.5h12M6 19.5h12M7.5 4.5v15M16.5 4.5v15"/><path d="M7.5 8h9M7.5 11h9M7.5 14h9M7.5 17h9" stroke-dasharray="1.5 2.5"/>'),
    upload:I('<path d="M12 16V5.5M8.5 8.6C9.7 7.4 10.8 6.2 12 5.2c1.2 1 2.3 2.2 3.5 3.4"/><path d="M5 15.5v3c0 1.1.9 2 2 2h10a2 2 0 0 0 2-2v-3"/>'),
    image: I('<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9.2" cy="10" r="1.6"/><path d="M5.5 17.5c2.2-2.6 3.8-4.2 5.2-3 1.2 1 2.2 1.6 3.4.4 1.6-1.7 3-2 4.4.6"/>'),
    wand:  I('<path d="M5 19L15.5 8.5"/><path d="M17.5 3.5l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6z"/><path d="M9 4.8l.4 1.3 1.3.4-1.3.4-.4 1.3-.4-1.3-1.3-.4 1.3-.4z"/><path d="M19.5 12.6l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4z"/>'),
    palette:I('<path d="M12 3.8c-4.8 0-8.5 3.6-8.5 8s3.9 8.4 8.2 8.4c1.4 0 2.2-.9 2-2-.2-1.2-.2-2 .8-2.4 2.4-1 5.9.3 6-4.2.1-4.3-3.7-7.8-8.5-7.8z"/><circle cx="8" cy="9.5" r="1.1"/><circle cx="12.5" cy="7.5" r="1.1"/><circle cx="16.5" cy="10.3" r="1.1"/><circle cx="7.8" cy="14" r="1.1"/>'),
    ruler: I('<rect x="3" y="9.5" width="18" height="6" rx="1.5" transform="rotate(-8 12 12)"/><path d="M7.5 10.4l.5 2.4M11 9.8l.5 2.4M14.5 9.3l.5 2.4M18 8.8l.5 2.4" transform="rotate(-8 12 12)"/>'),
    rotate:I('<path d="M5 9.5A8 8 0 0 1 19.3 12"/><path d="M19.5 7.5l-.2 4.6-4.4-1.6"/><path d="M19 14.5A8 8 0 0 1 4.7 12"/><path d="M4.5 16.5l.2-4.6 4.4 1.6"/>'),
    density:I('<path d="M4 6.5h16M4 10.3h16M4 14.1h16M4 17.9h16" stroke-dasharray="3.5 2.5"/>'),
    download:I('<path d="M12 4.5v10.6M8.5 11.8c1.2 1.2 2.3 2.4 3.5 3.4 1.2-1 2.3-2.2 3.5-3.4"/><path d="M5 16.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>'),
    trash: I('<path d="M5.5 7h13M9 7l.4-1.8c.1-.5.6-.9 1.1-.9h3c.5 0 1 .4 1.1.9L15 7M7 7l.8 12c0 .8.7 1.5 1.5 1.5h5.4c.8 0 1.4-.7 1.5-1.5L17 7"/><path d="M10.2 10.5l.2 6M13.8 10.5l-.2 6"/>'),
    plus:  I('<path d="M12 5.5v13M5.5 12h13"/>'),
    minus: I('<path d="M5.5 12h13"/>'),
    check: I('<path d="M5 12.8c1.8 1.6 3.2 3.1 4.4 4.8 2.4-4.4 5.6-8 9.6-11.4"/>'),
    chevD: I('<path d="M6 9.5c2.1 1.9 4.1 3.8 6 6 1.9-2.2 3.9-4.1 6-6"/>'),
    arrowR:I('<path d="M4.5 12h14M13.5 6.5c1.8 1.9 3.5 3.7 5 5.5-1.5 1.8-3.2 3.6-5 5.5"/>'),
    sparkle:I('<path d="M12 4l1.2 4.6L18 10l-4.8 1.4L12 16l-1.2-4.6L6 10l4.8-1.4z"/><path d="M18.5 15.5l.6 2.1 2.1.6-2.1.6-.6 2.1-.6-2.1-2.1-.6 2.1-.6z"/>'),
    truck: I('<path d="M3.5 6.5h10.8v10H3.5z"/><path d="M14.3 9.5h3.4l2.6 3.2v3.8h-6z"/><circle cx="7.4" cy="17.6" r="1.7"/><circle cx="16.8" cy="17.6" r="1.7"/>'),
    gift:  I('<rect x="4.5" y="9" width="15" height="11" rx="1.5"/><path d="M4 9h16M12 9v11"/><path d="M12 8.8C9.5 9 7.4 7.9 7.5 6.2 7.6 4.9 9 4.1 10.2 4.8c1.2.7 1.7 2.4 1.8 4zM12 8.8c2.5.2 4.6-.9 4.5-2.6-.1-1.3-1.5-2.1-2.7-1.4-1.2.7-1.7 2.4-1.8 4z"/>'),
    box:   I('<path d="M4.5 8L12 4.5 19.5 8v8L12 19.5 4.5 16z"/><path d="M4.5 8L12 11.5 19.5 8M12 11.5v8"/>'),
    user:  I('<circle cx="12" cy="8.4" r="3.6"/><path d="M5.5 19.5c.8-3.6 3.4-5.4 6.5-5.4s5.7 1.8 6.5 5.4"/>'),
    pin:   I('<path d="M12 20.5c-3.6-3.9-6-7-6-10A6 6 0 0 1 18 10.5c0 3-2.4 6.1-6 10z"/><circle cx="12" cy="10.3" r="2"/>'),
    info:  I('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.4"/>'),
    yen:   I('<path d="M7.5 4.5L12 11l4.5-6.5M12 11v8M8.5 13.5h7M8.5 16.5h7"/>'),
  };

  function icon(name, cls){
    const svg = ICONS[name] || ICONS.sparkle;
    return cls ? svg.replace('<svg ', `<svg class="${cls}" `) : svg;
  }

  // =============================================
  // ロゴ
  // =============================================
  const LOGO_SVG = `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g stroke="#66523F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="14" y="8"  width="34" height="9" rx="4.5" fill="#D7BFA0"/>
      <rect x="14" y="47" width="34" height="9" rx="4.5" fill="#D7BFA0"/>
      <rect x="19" y="16" width="24" height="32" fill="#E8A0A9" stroke="none"/>
      <path d="M19 16.5v31M43 16.5v31"/>
      <path d="M19 22h24M19 28h24M19 34h24M19 40h24" stroke="#D97F8C" stroke-width="2.2" stroke-dasharray="0.1 5.5"/>
      <path d="M43 30c8-2 12 2 10 8s-9 7-9 7" fill="none" stroke="#D97F8C" stroke-width="2.4" stroke-dasharray="4 4"/>
    </g>
  </svg>`;

  // ステッチ波の区切り線
  function divider(color = '#E4D6BE'){
    return `<div class="stitch-divider" aria-hidden="true"><svg viewBox="0 0 1120 26" preserveAspectRatio="none">
      <path d="M0,13 C40,4 80,22 120,13 C160,4 200,22 240,13 C280,4 320,22 360,13 C400,4 440,22 480,13 C520,4 560,22 600,13 C640,4 680,22 720,13 C760,4 800,22 840,13 C880,4 920,22 960,13 C1000,4 1040,22 1080,13 C1100,8 1110,10 1120,13"
      fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round"/></svg></div>`;
  }

  // つくりかたステップの挿絵
  const STEP_ART = {
    choose: `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#66523F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M40,26 C36,27 29,29 25,32 C20,36 15,42 12,46 C11,48 11,50 13,52 C14,53 16,55 18,55 C22,53 26,50 29,48 C28,58 28,72 28,80 C28,82 30,84 32,84 C44,86 56,86 68,84 C70,84 72,82 72,80 C72,72 72,58 71,48 C74,50 78,53 82,55 C84,55 86,53 87,52 C89,50 89,48 88,46 C85,42 80,36 75,32 C71,29 64,27 60,26 C58,32 42,32 40,26 Z" fill="#F6D7DB"/>
      <path d="M40,26 C42,32 58,32 60,26 C58,34 42,34 40,26 Z" fill="#F6D7DB"/>
      <path d="M50,52 C46,47 40,48 39,53 C38,57 43,61 50,65 C57,61 62,57 61,53 C60,48 54,47 50,52 Z" fill="#E8A0A9" stroke="#D97F8C" stroke-width="2.2" stroke-dasharray="3 3"/>
    </g></svg>`,
    upload: `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#66523F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="14" y="18" width="46" height="42" rx="5" fill="#FFFDF8"/>
      <circle cx="27" cy="31" r="4" fill="#F5CB5C" stroke="none"/>
      <path d="M17 52 C24 42 30 38 36 44 C40 47 44 49 48 45 C52 41 56 42 58 47" fill="none" stroke="#8FBC70"/>
      <path d="M62 36 C72 38 80 46 82 56" fill="none" stroke="#D97F8C" stroke-width="2.8" stroke-dasharray="5 4"/>
      <path d="M84,58 c3,-6 1,-9 -3,-10 l-11,9 c1,4 5,6 9,4 z" fill="#E8A0A9" stroke="#D97F8C"/>
      <path d="M30,72 q8,-6 16,0 q8,6 16,0" fill="none" stroke="#D97F8C" stroke-width="2.4" stroke-dasharray="4 4"/>
    </g></svg>`,
    receive: `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#66523F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="20" y="40" width="60" height="40" rx="4" fill="#F0E8D5"/>
      <path d="M20 52 h60 M50 40 v40"/>
      <path d="M50,38 C42,39 35,35 36,29 36,25 41,22 45,25 48,27 50,33 50,38 Z M50,38 C58,39 65,35 64,29 64,25 59,22 55,25 52,27 50,33 50,38 Z" fill="#E8A0A9" stroke="#D97F8C"/>
      <path d="M33,62 c-2,-3 -6,-2 -6,1 0,3 3,5 8,8 5,-3 8,-5 8,-8 0,-3 -4,-4 -6,-1 -1,1 -3,1 -4,0 Z" fill="#E8A0A9" stroke="#D97F8C" stroke-width="2" stroke-dasharray="2.5 2.5"/>
      <path d="M62,60 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 z" fill="#F5CB5C" stroke="none"/>
    </g></svg>`,
  };

  // =============================================
  // ヘッダー / フッター
  // =============================================
  const NAV_ITEMS = [
    { href: '#/products', label: '商品をえらぶ' },
    { href: '#/guide',    label: 'ご利用ガイド' },
    { href: '#/faq',      label: 'よくある質問' },
    { href: '#/about',    label: 'いとまきについて' },
    { href: '#/mypage',   label: 'マイページ' },
  ];

  function renderHeader(){
    const el = document.getElementById('app-header');
    el.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="logo" href="#/" aria-label="いとまき トップへ">
          ${LOGO_SVG}
          <span>
            <span class="logo-text">いとまき</span>
            <span class="logo-sub">ORDER-MADE EMBROIDERY</span>
          </span>
        </a>
        <nav class="main-nav" id="main-nav" aria-label="メインメニュー">
          ${NAV_ITEMS.map(n => `<a class="nav-link" data-nav href="${n.href}">${n.label}</a>`).join('')}
          <a class="btn btn-primary btn-sm nav-cta" href="#/products">${icon('needle')} つくってみる</a>
        </nav>
        <a class="cart-btn" href="#/cart" aria-label="カートを見る">
          ${icon('cart')}
          <span class="cart-count" id="cart-count">0</span>
        </a>
        <button class="menu-toggle" id="menu-toggle" aria-label="メニューを開く" aria-expanded="false">${icon('menu')}</button>
      </div>
    </header>`;

    const nav = el.querySelector('#main-nav');
    const toggle = el.querySelector('#menu-toggle');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = icon(open ? 'close' : 'menu');
    });
    nav.addEventListener('click', e => {
      if (e.target.closest('a')){
        nav.classList.remove('open');
        toggle.innerHTML = icon('menu');
      }
    });
    updateCartBadge();
  }

  function updateActiveNav(){
    const hash = location.hash || '#/';
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('active', hash.startsWith(a.getAttribute('href')));
    });
  }

  function updateCartBadge(){
    const el = document.getElementById('cart-count');
    if (!el) return;
    const n = IT.store.cartCount();
    el.textContent = n;
    el.classList.toggle('show', n > 0);
  }

  function renderFooter(){
    const el = document.getElementById('app-footer');
    el.innerHTML = `
    ${divider()}
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="logo" href="#/">${LOGO_SVG}<span><span class="logo-text">いとまき</span></span></a>
            <p>あなたの「すき」を、ちくちく刺繍に。<br>
            写真から世界にひとつの刺繍アイテムをつくる、小さなアトリエです。</p>
          </div>
          <div>
            <div class="foot-title">おかいもの</div>
            <ul class="foot-links">
              <li><a href="#/products">商品いちらん</a></li>
              <li><a href="#/cart">カート</a></li>
              <li><a href="#/mypage">マイページ（注文履歴）</a></li>
            </ul>
          </div>
          <div>
            <div class="foot-title">ごあんない</div>
            <ul class="foot-links">
              <li><a href="#/guide">ご利用ガイド</a></li>
              <li><a href="#/faq">よくある質問</a></li>
              <li><a href="#/about">いとまきについて</a></li>
            </ul>
          </div>
          <div>
            <div class="foot-title">きまりごと</div>
            <ul class="foot-links">
              <li><a href="#/law">特定商取引法に基づく表記</a></li>
              <li><a href="#/privacy">プライバシーポリシー</a></li>
              <li><a href="#/admin">注文管理（運営用）</a></li>
            </ul>
          </div>
        </div>
        <div class="copyright">
          <span>© 2026 itomaki — ちくちく、まいにち。</span>
          <span>handmade with ♥ &amp; thread</span>
        </div>
      </div>
    </footer>`;
  }

  // =============================================
  // トースト / モーダル
  // =============================================
  function toast(msg, iconName = 'check'){
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon(iconName)}<span>${msg}</span>`;
    root.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, 2600);
  }

  function modal(html, opts = {}){
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" ${opts.title ? `aria-label="${IT.esc(opts.title)}"` : ''}>
        <button class="modal-close" aria-label="閉じる">${icon('close')}</button>
        ${opts.title ? `<div class="modal-title">${opts.title}</div>` : ''}
        <div class="modal-body">${html}</div>
      </div>`;
    root.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close(){
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e){ if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return { el: overlay.querySelector('.modal-body'), close };
  }

  function confirmModal(msg, okLabel = 'はい', cancelLabel = 'やめておく'){
    return new Promise(resolve => {
      const m = modal(`
        <p style="margin-bottom:22px;">${msg}</p>
        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button class="btn btn-ghost" data-act="no">${cancelLabel}</button>
          <button class="btn btn-primary" data-act="yes">${okLabel}</button>
        </div>`, { onClose: () => resolve(false) });
      m.el.querySelector('[data-act=yes]').addEventListener('click', () => { resolve(true); m.close(); });
      m.el.querySelector('[data-act=no]').addEventListener('click', () => { resolve(false); m.close(); });
    });
  }

  // =============================================
  // その他ヘルパー
  // =============================================
  function observeReveals(root = document){
    const els = root.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)){
      els.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting){
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
  }

  function downloadText(filename, text, mime = 'text/plain'){
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadDataUrl(filename, dataUrl){
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const loadingHtml = (msg = '刺繍に変換中…') => `
    <div class="stitch-loading">
      <div class="needle-run">
        <div class="track"></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="#D97F8C" stroke-width="2" stroke-linecap="round"><path d="M19.5 4.5c1.2 1.2 1.2 2.6.2 3.6L8.6 19.2c-1.6 1.6-3.9 1.9-4.8 1-.9-.9-.6-3.2 1-4.8L15.9 4.3c1-1 2.4-1 3.6.2z"/></svg>
      </div>
      <div class="msg">${msg}</div>
    </div>`;

  IT.ui = {
    icon, LOGO_SVG, divider, STEP_ART,
    renderHeader, renderFooter, updateActiveNav, updateCartBadge,
    toast, modal, confirmModal,
    observeReveals, downloadText, downloadDataUrl, loadingHtml,
  };
})();
