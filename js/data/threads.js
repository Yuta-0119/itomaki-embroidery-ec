/* =============================================================
   いとまき — 刺繍糸パレット（全48色）
   減色結果は必ずこのパレットにマッピングされる。
   「実際に調達できる糸で縫える」ことを保証するための台帳。
   ============================================================= */
window.IT = window.IT || {};

IT.THREADS = [
  // しろ・きなり・ベージュ・茶
  { id:'t01', code:'IT-01', name:'しろ',        hex:'#FBFAF4' },
  { id:'t02', code:'IT-02', name:'きなり',      hex:'#F3ECDC' },
  { id:'t03', code:'IT-03', name:'すな',        hex:'#E2D4B8' },
  { id:'t04', code:'IT-04', name:'ミルクティー', hex:'#D7BFA0' },
  { id:'t05', code:'IT-05', name:'キャメル',    hex:'#C09A6A' },
  { id:'t06', code:'IT-06', name:'くるみ',      hex:'#9C7A4E' },
  { id:'t07', code:'IT-07', name:'ちゃいろ',    hex:'#7A5A36' },
  { id:'t08', code:'IT-08', name:'こげちゃ',    hex:'#57402A' },
  { id:'t09', code:'IT-09', name:'ココア',      hex:'#7C5F55' },
  // グレー・くろ
  { id:'t10', code:'IT-10', name:'はいざくら',  hex:'#E7D9D5' },
  { id:'t11', code:'IT-11', name:'うすはい',    hex:'#CFCAC1' },
  { id:'t12', code:'IT-12', name:'はいいろ',    hex:'#9C968C' },
  { id:'t13', code:'IT-13', name:'すみ',        hex:'#57534E' },
  { id:'t14', code:'IT-14', name:'くろ',        hex:'#2B2723' },
  // はだ・オレンジ寄り
  { id:'t15', code:'IT-15', name:'うすべに',    hex:'#F4D7C4' },
  { id:'t16', code:'IT-16', name:'あんず',      hex:'#EFB998' },
  { id:'t17', code:'IT-17', name:'サーモン',    hex:'#EC9E85' },
  { id:'t18', code:'IT-18', name:'テラコッタ',  hex:'#C56F4F' },
  { id:'t19', code:'IT-19', name:'れんが',      hex:'#A24E38' },
  // あか・ピンク
  { id:'t20', code:'IT-20', name:'あか',        hex:'#C13A3E' },
  { id:'t21', code:'IT-21', name:'あかね',      hex:'#A02A38' },
  { id:'t22', code:'IT-22', name:'いちご',      hex:'#D94A5C' },
  { id:'t23', code:'IT-23', name:'つつじ',      hex:'#E0618F' },
  { id:'t24', code:'IT-24', name:'ももいろ',    hex:'#EFA1B4' },
  { id:'t25', code:'IT-25', name:'さくら',      hex:'#F5C6CE' },
  // オレンジ・きいろ
  { id:'t26', code:'IT-26', name:'だいだい',    hex:'#E88A3E' },
  { id:'t27', code:'IT-27', name:'やまぶき',    hex:'#E8A93A' },
  { id:'t28', code:'IT-28', name:'たんぽぽ',    hex:'#F0C846' },
  { id:'t29', code:'IT-29', name:'レモン',      hex:'#F2E07D' },
  { id:'t30', code:'IT-30', name:'からし',      hex:'#C7A03E' },
  // みどり
  { id:'t31', code:'IT-31', name:'うぐいす',    hex:'#9A9B55' },
  { id:'t32', code:'IT-32', name:'わかば',      hex:'#BCD59A' },
  { id:'t33', code:'IT-33', name:'みどり',      hex:'#67A05B' },
  { id:'t34', code:'IT-34', name:'よもぎ',      hex:'#93A878' },
  { id:'t35', code:'IT-35', name:'まつば',      hex:'#4E7A50' },
  { id:'t36', code:'IT-36', name:'ふかみどり',  hex:'#35573F' },
  // みず・あお
  { id:'t37', code:'IT-37', name:'ミント',      hex:'#A9D6C3' },
  { id:'t38', code:'IT-38', name:'ターコイズ',  hex:'#5BA8A0' },
  { id:'t39', code:'IT-39', name:'あさぎ',      hex:'#4E93A8' },
  { id:'t40', code:'IT-40', name:'みずいろ',    hex:'#A7CEDE' },
  { id:'t41', code:'IT-41', name:'そら',        hex:'#7EB2D8' },
  { id:'t42', code:'IT-42', name:'るり',        hex:'#3A6EA8' },
  { id:'t43', code:'IT-43', name:'あい',        hex:'#2E4A78' },
  { id:'t44', code:'IT-44', name:'こん',        hex:'#283754' },
  // むらさき
  { id:'t45', code:'IT-45', name:'ふじ',        hex:'#B4A3D0' },
  { id:'t46', code:'IT-46', name:'すみれ',      hex:'#7D639E' },
  { id:'t47', code:'IT-47', name:'ぶどう',      hex:'#5A3F6E' },
  { id:'t48', code:'IT-48', name:'ラベンダー',  hex:'#D9CBE8' },
];

// ---- ユーティリティ ----
IT.threadById = {};
IT.THREADS.forEach(t => {
  const h = t.hex;
  t.r = parseInt(h.slice(1,3),16);
  t.g = parseInt(h.slice(3,5),16);
  t.b = parseInt(h.slice(5,7),16);
  IT.threadById[t.id] = t;
});

/**
 * RGB → いちばん近い糸を返す（redmean 近似色差）
 * excludeIds: すでに使われた糸を避けたいときに指定
 */
IT.nearestThread = function(r, g, b, excludeIds){
  let best = null, bestD = Infinity;
  for (const t of IT.THREADS){
    if (excludeIds && excludeIds.has(t.id)) continue;
    const rm = (r + t.r) / 2;
    const dr = r - t.r, dg = g - t.g, db = b - t.b;
    const d = (2 + rm/256) * dr*dr + 4 * dg*dg + (2 + (255-rm)/256) * db*db;
    if (d < bestD){ bestD = d; best = t; }
  }
  return best;
};

/** hex → {r,g,b} */
IT.hexRgb = function(hex){
  return {
    r: parseInt(hex.slice(1,3),16),
    g: parseInt(hex.slice(3,5),16),
    b: parseInt(hex.slice(5,7),16),
  };
};

/** 相対輝度 0〜1（生地色の明暗判定に使用） */
IT.luminance = function(hex){
  const {r,g,b} = IT.hexRgb(hex);
  return (0.299*r + 0.587*g + 0.114*b) / 255;
};
