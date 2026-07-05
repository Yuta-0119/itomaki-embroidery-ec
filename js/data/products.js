/* =============================================================
   いとまき — 商品マスタ + 手描き風SVGイラスト
   すべての商品イラストは viewBox 0 0 400 400。
   zone: 刺繍できる範囲。cx/cy はSVG座標、maxWmm は実寸の最大幅。
   pxPerMm: SVG座標と実寸の対応（実寸プレビューの合成に使用）
   ============================================================= */
window.IT = window.IT || {};

IT.CATEGORIES = [
  { id:'all',   label:'ぜんぶ' },
  { id:'wear',  label:'ウェア' },
  { id:'goods', label:'布こもの' },
  { id:'baby',  label:'ベビー' },
];

IT.PRODUCTS = [
  {
    id:'tshirt', name:'ふんわりコットンTシャツ', category:'wear', price:3200,
    desc:'肉厚すぎず薄すぎない5.6ozの天竺コットン。洗うほどにくったり馴染む、毎日の相棒です。',
    material:'綿100%（5.6oz 天竺）', care:'洗濯ネット使用・裏返し洗いがおすすめ',
    pxPerMm:0.34,
    colors:[
      { id:'kinari',   label:'きなり',     hex:'#F2EBDA' },
      { id:'pink',     label:'くすみピンク', hex:'#EAC8C8' },
      { id:'sage',     label:'セージ',     hex:'#BCCAB2' },
      { id:'charcoal', label:'チャコール', hex:'#57524E' },
    ],
    sizes:['S','M','L','XL'],
    sizeSpec:[
      ['サイズ','S','M','L','XL'],
      ['着丈','66','70','74','78'],
      ['身幅','49','52','55','58'],
      ['肩幅','42','46','50','54'],
    ],
    zones:[
      { id:'chest',  label:'むね中央', cx:200, cy:185, maxWmm:140, defWmm:90 },
      { id:'left',   label:'左むね',   cx:248, cy:150, maxWmm:90,  defWmm:60 },
      { id:'hem',    label:'すそ',     cx:152, cy:288, maxWmm:70,  defWmm:50 },
    ],
  },
  {
    id:'sweat', name:'もこもこ裏毛スウェット', category:'wear', price:4800,
    desc:'ふっくら裏毛のあったかスウェット。ゆったりシルエットでおうち時間もお出かけも。',
    material:'綿80% ポリエステル20%（裏毛10oz）', care:'タンブラー乾燥は避けてください',
    pxPerMm:0.30,
    colors:[
      { id:'gray',   label:'杢グレー',     hex:'#CFCBC4' },
      { id:'kinari', label:'きなり',       hex:'#F2EBDA' },
      { id:'navy',   label:'ネイビー',     hex:'#3C4358' },
      { id:'pink',   label:'くすみピンク', hex:'#E3BFBF' },
    ],
    sizes:['S','M','L','XL'],
    sizeSpec:[
      ['サイズ','S','M','L','XL'],
      ['着丈','63','67','71','75'],
      ['身幅','53','56','60','64'],
      ['肩幅','47','50','54','58'],
    ],
    zones:[
      { id:'chest', label:'むね中央', cx:200, cy:190, maxWmm:150, defWmm:100 },
      { id:'left',  label:'左むね',   cx:246, cy:158, maxWmm:90,  defWmm:60 },
    ],
  },
  {
    id:'tote', name:'まいにちトートバッグ', category:'goods', price:2400,
    desc:'厚手キャンバスのしっかりトート。A4もお弁当もすっぽり。マチ付きで自立します。',
    material:'綿100%（12ozキャンバス）', care:'汚れは固く絞った布で拭き取り',
    pxPerMm:0.40,
    colors:[
      { id:'kinari',  label:'きなり', hex:'#F0E8D5' },
      { id:'mustard', label:'からし', hex:'#D9B25E' },
      { id:'sumi',    label:'すみ',   hex:'#5A554F' },
    ],
    sizes:null,
    sizeSpec:[
      ['本体','約 縦37 × 横36 × マチ11cm'],
      ['持ち手','約 47cm（肩掛けOK）'],
    ],
    zones:[
      { id:'center', label:'まんなか', cx:200, cy:245, maxWmm:160, defWmm:100 },
      { id:'corner', label:'みぎ下',   cx:243, cy:300, maxWmm:80,  defWmm:55 },
    ],
  },
  {
    id:'towel', name:'ふわふわフェイスタオル', category:'goods', price:1800,
    desc:'今治産のふんわりパイル。刺繍を入れると、毎日の「ただいま」がちょっと嬉しくなる。',
    material:'綿100%（今治タオル）', care:'柔軟剤は少なめが長持ちのコツ',
    pxPerMm:0.37,
    colors:[
      { id:'shiro',  label:'しろ',   hex:'#FBFAF4' },
      { id:'sakura', label:'さくら', hex:'#F6D7DB' },
      { id:'mint',   label:'ミント', hex:'#CDE6DA' },
    ],
    sizes:null,
    sizeSpec:[ ['本体','約 34 × 80cm'], ['重さ','約 90g（ふつう厚）'] ],
    zones:[
      { id:'edge',   label:'はし中央', cx:200, cy:268, maxWmm:100, defWmm:70 },
      { id:'corner', label:'かど',     cx:160, cy:268, maxWmm:60,  defWmm:45 },
    ],
  },
  {
    id:'hanky', name:'ガーゼハンカチ', category:'goods', price:1400,
    desc:'ダブルガーゼのやわらかハンカチ。イニシャル刺繍でささやかな贈り物にも。',
    material:'綿100%（ダブルガーゼ）', care:'アイロンは中温で',
    pxPerMm:0.72,
    colors:[
      { id:'kinari', label:'きなり', hex:'#F4EEDF' },
      { id:'sakura', label:'さくら', hex:'#F6D7DB' },
      { id:'sora',   label:'そら',   hex:'#D3E4EF' },
    ],
    sizes:null,
    sizeSpec:[ ['本体','約 25 × 25cm'] ],
    zones:[
      { id:'corner', label:'かど',     cx:246, cy:246, maxWmm:50, defWmm:38 },
      { id:'center', label:'まんなか', cx:200, cy:200, maxWmm:80, defWmm:55 },
    ],
  },
  {
    id:'bib', name:'ベビースタイ（よだれかけ）', category:'baby', price:1900,
    desc:'6重ガーゼのふかふかスタイ。名前やお顔の刺繍で、出産祝いにいちばん人気。',
    material:'綿100%（6重ガーゼ）／スナップボタン', care:'ネット使用・弱水流で',
    pxPerMm:0.85,
    colors:[
      { id:'kinari', label:'きなり',   hex:'#F4EEDF' },
      { id:'sakura', label:'さくら',   hex:'#F6D7DB' },
      { id:'mizu',   label:'みずいろ', hex:'#D6E7F0' },
    ],
    sizes:null,
    sizeSpec:[ ['本体','約 縦25 × 横21cm'], ['首まわり','約 26〜30cm（2段階調整）'] ],
    zones:[
      { id:'center', label:'まんなか', cx:200, cy:238, maxWmm:80, defWmm:60 },
    ],
  },
  {
    id:'cap', name:'コットンキャップ', category:'wear', price:3600,
    desc:'やわらかなウォッシュドコットンのキャップ。フロントにワンポイント刺繍を。',
    material:'綿100%（ウォッシュドツイル）', care:'手洗い・陰干し',
    pxPerMm:1.00,
    colors:[
      { id:'kinari', label:'きなり', hex:'#F0E8D5' },
      { id:'khaki',  label:'カーキ', hex:'#9AA183' },
      { id:'sumi',   label:'すみ',   hex:'#5A554F' },
    ],
    sizes:null,
    sizeSpec:[ ['頭まわり','56〜59cm（アジャスター調整）'], ['つば','約 7cm'] ],
    zones:[
      { id:'front', label:'まえ', cx:196, cy:168, maxWmm:80, defWmm:55 },
    ],
  },
];

IT.productById = {};
IT.PRODUCTS.forEach(p => IT.productById[p.id] = p);

/* =============================================================
   手描き風SVGビルダー
   ============================================================= */

// 生地の明るさに応じてディテール線の色を決める
function detailColor(hex){
  return IT.luminance(hex) < 0.5 ? 'rgba(255,255,255,.45)' : 'rgba(92,75,58,.38)';
}
function shadeColor(hex){
  return IT.luminance(hex) < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(92,75,58,.07)';
}

const INK = '#66523F';
const shadowAt = (cy, rx = 120) => `<ellipse cx="200" cy="${cy}" rx="${rx}" ry="12" fill="rgba(122,96,66,.10)"/>`;

// 商品ごとの表示クロップ（イラストが枠いっぱいに見えるように）
const VIEWBOX = {
  tshirt: { x:52,  y:68, w:300, h:300 },
  sweat:  { x:40,  y:62, w:322, h:322 },
  tote:   { x:78,  y:62, w:246, h:308 },
  towel:  { x:92,  y:44, w:218, h:330 },
  hanky:  { x:82,  y:80, w:240, h:250 },
  bib:    { x:82,  y:72, w:238, h:290 },
  cap:    { x:66,  y:64, w:270, h:220 },
};

const ART = {

  tshirt(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(338)}
    <path d="M170,102
      C158,105 132,111 119,120
      C102,133 84,155 71,171
      C67,177 68,186 74,192
      C77,197 84,203 88,203
      C104,196 122,186 133,178
      C130,220 131,270 130,312
      C131,317 135,320 140,320
      C180,325 222,325 261,320
      C266,320 270,316 270,311
      C269,269 270,219 267,178
      C278,186 296,196 312,203
      C316,203 323,197 326,192
      C332,186 333,177 329,171
      C316,155 298,133 281,120
      C268,111 242,105 230,102
      C222,124 178,124 170,102 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M170,102 C178,124 222,124 230,102 C224,131 176,131 170,102 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M174,101 C186,94 214,94 226,101" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M138,306 C180,312 222,312 262,306" fill="none" stroke="${d}" stroke-width="2.4"
      stroke-dasharray="6 6" stroke-linecap="round"/>
    <path d="M84,190 C92,184 100,178 106,172" fill="none" stroke="${d}" stroke-width="2.2"
      stroke-dasharray="5 6" stroke-linecap="round"/>
    <path d="M294,172 C302,178 310,184 317,190" fill="none" stroke="${d}" stroke-width="2.2"
      stroke-dasharray="5 6" stroke-linecap="round"/>
    <path d="M137,186 q7,12 4,26 M263,186 q-7,12 -4,26" fill="none" stroke="${s}" stroke-width="5" stroke-linecap="round"/>
    <rect x="195" y="128" width="11" height="13" rx="2" fill="none" stroke="${d}" stroke-width="2"/>
    `;
  },

  sweat(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(334, 142)}
    <path d="M168,98
      C150,102 124,110 112,120
      C94,136 76,178 64,228
      C58,254 55,278 56,290
      C57,297 63,302 70,303
      C80,304 92,302 98,298
      C102,295 106,288 108,278
      C112,256 118,224 124,204
      C122,240 121,268 122,292
      C122,300 128,306 136,307
      C178,313 222,313 264,307
      C272,306 278,300 278,292
      C279,268 278,240 276,204
      C282,224 288,256 292,278
      C294,288 298,295 302,298
      C308,302 320,304 330,303
      C337,302 343,297 344,290
      C345,278 342,254 336,228
      C324,178 306,136 288,120
      C276,110 250,102 232,98
      C226,120 174,120 168,98 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M168,98 C174,120 226,120 232,98 C228,126 172,126 168,98 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M173,97 C186,89 214,89 227,97" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M124,286 C180,292 222,292 276,286" fill="none" stroke="${INK}" stroke-width="2.6"/>
    <path d="M132,291 l-1,12 M148,293 l-1,13 M164,295 l-1,13 M180,296 l0,13 M196,297 l0,13 M212,297 l0,13 M228,296 l0,13 M244,295 l1,13 M260,293 l1,13"
      stroke="${d}" stroke-width="2" stroke-linecap="round"/>
    <path d="M99,272 C104,273 108,274 111,273 M62,284 C74,288 92,288 106,284" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M301,272 C296,273 292,274 289,273 M338,284 C326,288 308,288 294,284" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M126,196 q8,14 5,30 M274,196 q-8,14 -5,30" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
    `;
  },

  tote(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(352, 86)}
    <path d="M158,150 C155,92 245,92 242,150" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <path d="M146,152 C140,74 260,74 254,152" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>
    <path d="M146,152 C140,74 260,74 254,152" fill="none" stroke="${hex}" stroke-width="8" stroke-linecap="round"/>
    <path d="M130,152
      C128,196 130,290 136,326
      C137,334 143,339 150,340
      C186,346 214,346 250,340
      C257,339 263,334 264,326
      C270,290 272,196 270,152
      C268,147 264,144 258,144
      C220,140 180,140 142,144
      C136,144 131,147 130,152 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M134,166 C180,171 220,171 266,166" fill="none" stroke="${d}" stroke-width="2.4"
      stroke-dasharray="6 6" stroke-linecap="round"/>
    <path d="M140,318 C185,324 215,324 260,318" fill="none" stroke="${d}" stroke-width="2.2"
      stroke-dasharray="5 7" stroke-linecap="round"/>
    <path d="M142,152 l9,11 M151,152 l-9,11 M249,152 l9,11 M258,152 l-9,11"
      stroke="${d}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M137,200 q-3,60 2,110" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
    `;
  },

  towel(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(360, 86)}
    <path d="M136,72
      C132,140 132,270 136,338
      C137,344 141,348 147,348
      C182,353 218,353 253,348
      C259,348 263,344 264,338
      C268,270 268,140 264,72
      C263,66 259,62 253,62
      C218,57 182,57 147,62
      C141,62 137,66 136,72 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M139,104 C185,109 215,109 261,104 M139,122 C185,127 215,127 261,122"
      fill="none" stroke="${d}" stroke-width="2.6"/>
    <path d="M139,296 C185,301 215,301 261,296 M139,314 C185,319 215,319 261,314"
      fill="none" stroke="${d}" stroke-width="2.6"/>
    <path d="M143,113 h8 M157,114 h8 M171,114 h8 M185,115 h8 M199,115 h8 M213,115 h8 M227,114 h8 M241,114 h8 M251,113 h6
             M143,305 h8 M157,306 h8 M171,306 h8 M185,307 h8 M199,307 h8 M213,307 h8 M227,306 h8 M241,306 h8 M251,305 h6"
      stroke="${d}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <circle cx="150" cy="76" r="7" fill="none" stroke="${d}" stroke-width="2.4"/>
    <path d="M144,180 q4,40 0,70" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
    <path d="M256,160 q-4,50 0,90" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
    `;
  },

  hanky(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    // 折り目つきの正方形ハンカチ
    return `
    ${shadowAt(314, 96)}
    <path d="M112,118
      C108,170 108,246 113,290
      C113,296 117,300 123,300
      C174,305 228,305 279,300
      C285,300 289,296 289,290
      C293,240 293,168 289,116
      C289,110 285,106 279,106
      C228,101 172,101 121,107
      C115,108 112,112 112,118 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M126,122 C170,118 232,118 276,121 M126,286 C172,290 230,290 276,285
             M126,122 C122,176 122,236 126,286 M276,121 C280,174 280,234 276,285"
      fill="none" stroke="${d}" stroke-width="2.2" stroke-dasharray="5 6" stroke-linecap="round"/>
    <path d="M289,116 C258,120 236,138 232,168 C260,164 282,146 289,116 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3" stroke-linejoin="round" opacity=".97"/>
    <path d="M240,160 C246,146 258,132 274,124" fill="none" stroke="${s}" stroke-width="5" stroke-linecap="round"/>
    `;
  },

  bib(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(348, 96)}
    <path fill-rule="evenodd" d="M200,96
      C232,96 262,110 278,140
      C294,170 296,224 284,262
      C270,306 240,332 200,332
      C160,332 130,306 116,262
      C104,224 106,170 122,140
      C138,110 168,96 200,96 Z
      M200,118 C178,118 163,132 163,150 C163,168 178,182 200,182 C222,182 237,168 237,150 C237,132 222,118 200,118 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M163,150 C163,132 178,118 200,118 C222,118 237,132 237,150"
      fill="none" stroke="${INK}" stroke-width="3"/>
    <circle cx="172" cy="112" r="6" fill="none" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="172" cy="112" r="1.8" fill="${INK}"/>
    <path d="M128,158 C120,196 120,240 132,270 M272,158 C280,196 280,240 268,270"
      fill="none" stroke="${d}" stroke-width="2.2" stroke-dasharray="5 7" stroke-linecap="round"/>
    <path d="M156,300 C184,314 216,314 244,300" fill="none" stroke="${d}" stroke-width="2.2"
      stroke-dasharray="5 7" stroke-linecap="round"/>
    <path d="M148,270 q20,26 52,30" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
    `;
  },

  cap(hex){
    const d = detailColor(hex), s = shadeColor(hex);
    return `
    ${shadowAt(266, 112)}
    <path d="M100,212
      C96,150 134,98 196,96
      C258,94 300,146 298,210
      C298,216 294,220 288,221
      C230,229 168,229 110,222
      C104,221 100,218 100,212 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M196,96 C176,128 166,180 168,222 M196,96 C222,126 232,180 229,224"
      fill="none" stroke="${d}" stroke-width="2.4"/>
    <path d="M96,214
      C120,254 236,268 296,240
      C310,233 312,222 298,212
      C296,224 288,228 272,232
      C214,244 130,238 96,214 Z"
      fill="${hex}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M108,224 C150,246 240,250 286,232" fill="none" stroke="${d}" stroke-width="2.2"
      stroke-dasharray="6 6" stroke-linecap="round"/>
    <ellipse cx="196" cy="93" rx="9" ry="6" fill="${hex}" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="146" cy="150" r="3.4" fill="none" stroke="${d}" stroke-width="2"/>
    <circle cx="248" cy="150" r="3.4" fill="none" stroke="${d}" stroke-width="2"/>
    `;
  },
};

/**
 * 商品SVGを生成
 * @param {string} productId
 * @param {string} colorHex 生地色
 * @param {object} opts { class, width }
 */
IT.productArt = function(productId, colorHex, opts = {}){
  const body = (ART[productId] || ART.tshirt)(colorHex);
  const cls = opts.class || 'product-art';
  const vb = VIEWBOX[productId] || { x:0, y:0, w:400, h:400 };
  const w = opts.width || 400;                     // 固有サイズを必ず持たせる（0×0潰れ防止）
  const h = Math.round(w * vb.h / vb.w);
  return `<svg class="${cls}" width="${w}" height="${h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="商品イラスト">${body}</svg>`;
};

/** 商品の表示viewBox（配置計算・サムネイル合成で使用） */
IT.productViewBox = function(productId){
  return VIEWBOX[productId] || { x:0, y:0, w:400, h:400 };
};

/* =============================================================
   サンプル画像（お試し用・刺繍向きのはっきりした配色）
   透過背景なので「背景除去」なしでもきれいに変換できる
   ============================================================= */
IT.SAMPLE_IMAGES = [
  {
    id:'flower', label:'おはな',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">
      <g stroke="#5C4B3A" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
        <path d="M240,255 C238,320 240,370 244,420" fill="none" stroke="#67A05B" stroke-width="16"/>
        <path d="M242,330 C210,318 188,322 168,342 C192,356 222,352 242,330 Z" fill="#8FBC70" stroke="#67A05B" stroke-width="10"/>
        <path d="M246,376 C278,364 300,368 320,388 C296,402 266,398 246,376 Z" fill="#8FBC70" stroke="#67A05B" stroke-width="10"/>
        <ellipse cx="240" cy="120" rx="52" ry="58" fill="#F2A9B8"/>
        <ellipse cx="150" cy="185" rx="52" ry="58" fill="#F2A9B8" transform="rotate(-72 150 185)"/>
        <ellipse cx="185" cy="290" rx="52" ry="58" fill="#F2A9B8" transform="rotate(-144 185 290)"/>
        <ellipse cx="295" cy="290" rx="52" ry="58" fill="#F2A9B8" transform="rotate(144 295 290)"/>
        <ellipse cx="330" cy="185" rx="52" ry="58" fill="#F2A9B8" transform="rotate(72 330 185)"/>
        <circle cx="240" cy="205" r="55" fill="#F5CB5C"/>
        <circle cx="222" cy="196" r="7" fill="#5C4B3A" stroke="none"/>
        <circle cx="258" cy="196" r="7" fill="#5C4B3A" stroke="none"/>
        <path d="M225,222 Q240,234 255,222" fill="none" stroke="#5C4B3A" stroke-width="8"/>
      </g>
    </svg>`,
  },
  {
    id:'bear', label:'くまさん',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">
      <g stroke="#4A3423" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
        <circle cx="140" cy="130" r="58" fill="#B98A5E"/>
        <circle cx="340" cy="130" r="58" fill="#B98A5E"/>
        <circle cx="140" cy="132" r="26" fill="#E8C39E" stroke="none"/>
        <circle cx="340" cy="132" r="26" fill="#E8C39E" stroke="none"/>
        <ellipse cx="240" cy="250" rx="150" ry="140" fill="#B98A5E"/>
        <ellipse cx="240" cy="300" rx="72" ry="56" fill="#E8C39E" stroke="none"/>
        <ellipse cx="240" cy="282" rx="20" ry="15" fill="#4A3423" stroke="none"/>
        <path d="M240,298 C240,316 240,318 240,320 M240,320 Q222,336 206,324 M240,320 Q258,336 274,324"
          fill="none" stroke-width="9"/>
        <circle cx="176" cy="232" r="11" fill="#4A3423" stroke="none"/>
        <circle cx="304" cy="232" r="11" fill="#4A3423" stroke="none"/>
        <circle cx="146" cy="286" r="18" fill="#EFA1B4" stroke="none" opacity=".9"/>
        <circle cx="334" cy="286" r="18" fill="#EFA1B4" stroke="none" opacity=".9"/>
      </g>
    </svg>`,
  },
  {
    id:'cherry', label:'さくらんぼ',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">
      <g stroke="#5C4B3A" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
        <path d="M180,270 C190,180 230,110 300,70 M310,255 C300,170 300,120 300,70"
          fill="none" stroke="#67A05B" stroke-width="14"/>
        <path d="M300,70 C330,52 368,52 396,74 C376,102 336,108 300,70 Z" fill="#8FBC70" stroke="#67A05B"/>
        <circle cx="168" cy="330" r="72" fill="#D94A5C"/>
        <circle cx="316" cy="318" r="66" fill="#C13A3E"/>
        <ellipse cx="146" cy="308" rx="20" ry="12" fill="#F2A9B8" stroke="none" transform="rotate(-30 146 308)"/>
        <ellipse cx="296" cy="298" rx="17" ry="10" fill="#EC9E85" stroke="none" transform="rotate(-30 296 298)"/>
      </g>
    </svg>`,
  },
  {
    id:'rainbow', label:'にじ',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">
      <g fill="none" stroke-linecap="round">
        <path d="M100,320 A140,140 0 0 1 380,320" stroke="#D94A5C" stroke-width="28"/>
        <path d="M128,320 A112,112 0 0 1 352,320" stroke="#E8A93A" stroke-width="28"/>
        <path d="M156,320 A84,84 0 0 1 324,320" stroke="#F0C846" stroke-width="28"/>
        <path d="M184,320 A56,56 0 0 1 296,320" stroke="#67A05B" stroke-width="28"/>
        <path d="M212,320 A28,28 0 0 1 268,320" stroke="#7EB2D8" stroke-width="28"/>
      </g>
      <g stroke="#8FA5B5" stroke-width="9" stroke-linejoin="round">
        <path d="M60,330 C42,330 30,318 34,302 C22,300 16,286 24,274 C30,262 46,258 58,264 C66,250 88,248 98,260 C112,254 128,262 130,276 C142,280 146,296 138,306 C132,316 118,318 110,314 C104,326 82,332 60,330 Z" fill="#FBFAF4"/>
        <path d="M330,368 C316,368 306,358 309,346 C300,344 296,333 302,324 C307,315 319,312 328,317 C334,306 351,304 359,313 C370,309 382,315 384,326 C393,329 396,341 390,349 C385,357 374,358 368,355 C363,364 346,370 330,368 Z" fill="#FBFAF4"/>
      </g>
    </svg>`,
  },
];

/** サンプルSVG → 48pxチップ用HTML */
IT.sampleThumb = function(sample){
  return sample.svg.replace('<svg ', '<svg width="46" height="46" ');
};
