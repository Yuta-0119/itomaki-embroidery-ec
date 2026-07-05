/* =============================================================
   いとまき — 起動
   ============================================================= */
(function(){
  'use strict';

  function boot(){
    IT.ui.renderHeader();
    IT.ui.renderFooter();
    IT.router.init();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
