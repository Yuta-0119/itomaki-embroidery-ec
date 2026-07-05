/* =============================================================
   いとまき — 状態管理（カート・注文・価格計算）
   プロトタイプは localStorage 永続化。本番はここをAPI呼び出しに
   差し替えるだけで済むよう、読み書きをこのファイルに集約する。
   ============================================================= */
window.IT = window.IT || {};

(function(){
  'use strict';

  const CART_KEY = 'itomaki_cart_v1';
  const ORDER_KEY = 'itomaki_orders_v1';

  function load(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      console.warn('storage load failed', key, e);
      return fallback;
    }
  }
  function save(key, val){
    try{
      localStorage.setItem(key, JSON.stringify(val));
    }catch(e){
      console.warn('storage save failed', key, e);
      IT.ui && IT.ui.toast('保存領域がいっぱいです。カートを整理してください', 'close');
    }
  }

  // =============================================
  // 価格計算
  // =============================================

  /** 刺繍代: 基本料 + 面積課金 + 色数加算（10円未満切り上げ） */
  function embroideryFee(design){
    const wCm = design.widthMm / 10;
    const hCm = design.heightMm / 10;
    const areaCm2 = wCm * hCm * (design.coverage || 1);
    const rate = design.params.style === 'cross' ? 7 : 9;
    const usedColors = design.palette.filter(p => p.count > 0).length;
    const colorFee = Math.max(0, usedColors - 3) * 120;
    const raw = 600 + areaCm2 * rate + colorFee;
    return Math.ceil(raw / 10) * 10;
  }

  /** カート小計・送料・合計 */
  function cartTotals(items, paymentMethod){
    const subtotal = items.reduce((s, it) => s + it.price.unit * it.qty, 0);
    const shipping = items.length === 0 ? 0 : (subtotal >= 6000 ? 0 : 520);
    const codFee = paymentMethod === 'cod' ? 330 : 0;
    return { subtotal, shipping, codFee, total: subtotal + shipping + codFee };
  }

  /** 納期目安（営業日） */
  function estimateDays(items){
    const stitches = items.reduce((s, it) => s + (it.design.stitchCount || 0) * it.qty, 0);
    return 5 + Math.floor(stitches / 10000);
  }

  // =============================================
  // カート
  // =============================================

  function getCart(){ return load(CART_KEY, []); }

  function addToCart(item){
    const cart = getCart();
    item.id = 'c' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
    cart.push(item);
    save(CART_KEY, cart);
    IT.ui && IT.ui.updateCartBadge();
    return item.id;
  }

  function updateQty(id, qty){
    const cart = getCart();
    const it = cart.find(x => x.id === id);
    if (it){
      it.qty = Math.max(1, Math.min(20, qty));
      save(CART_KEY, cart);
    }
    IT.ui && IT.ui.updateCartBadge();
  }

  function removeItem(id){
    const cart = getCart().filter(x => x.id !== id);
    save(CART_KEY, cart);
    IT.ui && IT.ui.updateCartBadge();
  }

  function clearCart(){
    save(CART_KEY, []);
    IT.ui && IT.ui.updateCartBadge();
  }

  function cartCount(){
    return getCart().reduce((s, it) => s + it.qty, 0);
  }

  // =============================================
  // 注文
  // =============================================

  function getOrders(){ return load(ORDER_KEY, []); }

  function createOrder(customer, payment){
    const items = getCart();
    if (!items.length) return null;
    const totals = cartTotals(items, payment.method);
    const orders = getOrders();
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const seq = String(orders.length + 1).padStart(3, '0');
    const order = {
      id: `IT-${ymd}-${seq}`,
      items,
      customer,
      payment: { method: payment.method, label: payment.label },
      totals,
      estimateDays: estimateDays(items),
      status: '新規受付',
      createdAt: d.toISOString(),
    };
    orders.unshift(order);
    save(ORDER_KEY, orders);
    clearCart();
    return order;
  }

  function getOrder(id){
    return getOrders().find(o => o.id === id) || null;
  }

  function updateOrderStatus(id, status){
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (o){ o.status = status; save(ORDER_KEY, orders); }
  }

  // =============================================
  // 公開API
  // =============================================
  IT.store = {
    getCart, addToCart, updateQty, removeItem, clearCart, cartCount,
    getOrders, createOrder, getOrder, updateOrderStatus,
    embroideryFee, cartTotals, estimateDays,
  };

  IT.money = n => '¥' + Math.round(n).toLocaleString('ja-JP');
  IT.esc = s => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
})();
