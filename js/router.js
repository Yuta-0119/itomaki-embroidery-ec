/* =============================================================
   いとまき — ハッシュルーター
   file:// でも動くよう #/path?query 方式
   ============================================================= */
window.IT = window.IT || {};

(function(){
  'use strict';

  const ROUTES = [
    { re: /^\/?$/,                     page: 'home' },
    { re: /^\/products$/,              page: 'products' },
    { re: /^\/product\/([\w-]+)$/,     page: 'productDetail', args: ['id'] },
    { re: /^\/editor\/([\w-]+)$/,      page: 'editor',        args: ['productId'] },
    { re: /^\/cart$/,                  page: 'cart' },
    { re: /^\/checkout$/,              page: 'checkout' },
    { re: /^\/complete\/([\w-]+)$/,    page: 'complete',      args: ['orderId'] },
    { re: /^\/mypage$/,                page: 'mypage' },
    { re: /^\/guide$/,                 page: 'guide' },
    { re: /^\/faq$/,                   page: 'faq' },
    { re: /^\/about$/,                 page: 'about' },
    { re: /^\/law$/,                   page: 'law' },
    { re: /^\/privacy$/,               page: 'privacy' },
    { re: /^\/admin$/,                 page: 'admin' },
  ];

  function parseHash(){
    const raw = (location.hash || '#/').replace(/^#/, '');
    const [path, queryStr] = raw.split('?');
    const query = {};
    if (queryStr){
      for (const pair of queryStr.split('&')){
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }
    return { path: path || '/', query };
  }

  function render(){
    const { path, query } = parseHash();
    const app = document.getElementById('app');

    for (const route of ROUTES){
      const m = path.match(route.re);
      if (!m) continue;
      const params = { query };
      (route.args || []).forEach((name, i) => { params[name] = m[i + 1]; });
      const fn = IT.pages[route.page];
      if (typeof fn !== 'function') break;
      app.innerHTML = '';
      try{
        fn(app, params);
      }catch(err){
        console.error('page render error', route.page, err);
        app.innerHTML = `
          <section class="section"><div class="container">
            <div class="empty-state">
              ${IT.ui.icon('info')}
              <p>ページの表示でエラーがおきました。<br><span class="small muted">${IT.esc(err.message)}</span></p>
              <a class="btn btn-primary" href="#/">トップへもどる</a>
            </div>
          </div></section>`;
      }
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      IT.ui.updateActiveNav();
      IT.ui.updateCartBadge();
      return;
    }

    // 未知のルート → トップへ
    location.hash = '#/';
  }

  IT.router = {
    init(){
      window.addEventListener('hashchange', render);
      render();
    },
  };
})();
