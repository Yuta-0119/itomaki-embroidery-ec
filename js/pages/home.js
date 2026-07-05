/* =============================================================
   いとまき — トップページ
   ヒーローとギャラリーでは刺繍エンジンが実際に動いてサンプルを描く
   ============================================================= */
window.IT = window.IT || {};
IT.pages = IT.pages || {};

(function(){
  'use strict';

  /** SVG文字列 → canvas（サンプル画像のラスタライズ用） */
  IT.svgToCanvas = function(svgStr, size){
    return new Promise((resolve, reject) => {
      const svg = svgStr.replace('<svg ', `<svg width="${size}" height="${size}" `);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        resolve(c);
      };
      img.onerror = () => reject(new Error('sample rasterize failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };

  const VOICES = [
    { stars:'★★★★★', text:'むすめが描いた「かぞくの絵」をトートにしました。線のガタガタまでそのまま糸になっていて、宝物がふえました。', meta:'ちひろさん / トートバッグ' },
    { stars:'★★★★★', text:'愛犬の写真をクロスステッチ風に。色数を自分でいじれるのが楽しくて、夜ふかししました…。仕上がりも大満足です。', meta:'まさとさん / スウェット' },
    { stars:'★★★★☆', text:'出産祝いにお名前とくまさんのスタイを。プレビューどおりのふっくらした刺繍で、とても喜ばれました。', meta:'ゆきえさん / ベビースタイ' },
  ];

  const FEATURES = [
    { icon:'image',   title:'写真からじどう変換', desc:'アップロードするだけで、その場で刺繍プレビューに。お絵かき・ロゴ・写真なんでも。' },
    { icon:'palette', title:'糸いろは48色', desc:'検出された色は実際の刺繍糸に自動マッピング。1色ずつ好きな糸に差し替えもOK。' },
    { icon:'density', title:'太さも密度もじざい', desc:'糸の太さ3段階 × 密度3段階 × 角度は0〜180°。仕上がりの表情を作り込めます。' },
    { icon:'sparkle', title:'クロスステッチも', desc:'ふつうのタタミ縫いと、レトロかわいい×印のクロスステッチを切り替えられます。' },
    { icon:'ruler',   title:'サイズと位置もじゆう', desc:'実寸cmでサイズ指定。左むね・まんなか…好きな場所にドラッグで配置。' },
    { icon:'truck',   title:'そのままおとどけ', desc:'調整したデータでそのまま職人が刺繍。世界にひとつのアイテムが届きます。' },
  ];

  IT.pages.home = function(el){
    const featured = IT.PRODUCTS.slice(0, 8);
    el.innerHTML = `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-head">
          <span class="en-label">order-made embroidery</span>
          <h1 class="hero-title">あなたの「すき」を、<br><span class="stroke-pink">ちくちく刺繍</span>に。</h1>
        </div>

        <!-- スクラップブック風コラージュ: おえかき → 変換 → 刺繍された商品 -->
        <div class="hero-art">
          <div class="hero-collage" aria-hidden="false">

            <svg class="clg-piece clg-blob" viewBox="0 0 560 570" aria-hidden="true">
              <path d="M300,18 C420,4 528,74 544,190 C560,304 512,420 408,494 C310,562 160,560 82,478 C6,398 -2,270 40,166 C82,64 182,32 300,18 Z"
                fill="rgba(232,160,169,.14)"/>
              <path d="M410,120 C500,140 546,230 528,330 C510,428 420,510 314,516 C220,522 140,470 108,384"
                fill="none" stroke="rgba(166,192,154,.5)" stroke-width="3" stroke-dasharray="9 9" stroke-linecap="round"/>
              <g stroke="rgba(217,127,140,.5)" stroke-width="3.4" stroke-linecap="round">
                <path d="M56,120 l13,13 M69,120 l-13,13"/>
                <path d="M508,392 l12,12 M520,392 l-12,12"/>
                <path d="M258,540 l11,11 M269,540 l-11,11"/>
              </g>
            </svg>

            <div class="clg-piece clg-polaroid" title="もとのおえかき">
              ${IT.SAMPLE_IMAGES[0].svg.replace('<svg ', '<svg class="pol-img" aria-label="もとのおえかき（おはな）" ')}
              <div class="pol-caption">もとの おえかき ✿</div>
              <span class="tape"></span>
            </div>

            <div class="clg-piece clg-arrow" aria-hidden="true">
              <div class="arr-label">じどうで 刺繍データに！</div>
              <svg viewBox="0 0 130 92">
                <path class="arr-line" d="M10,72 C42,86 84,74 108,36"
                  fill="none" stroke="#D97F8C" stroke-width="3.6" stroke-dasharray="8 7" stroke-linecap="round"/>
                <path d="M96,34 L110,33 L104,46" fill="none" stroke="#D97F8C" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M28,52 l2.2,6.6 6.6,2.2 -6.6,2.2 -2.2,6.6 -2.2,-6.6 -6.6,-2.2 6.6,-2.2 z" fill="#F5CB5C"/>
              </svg>
            </div>

            <div class="clg-piece clg-shirt">
              <div class="clg-float">
                <div class="product-stage" id="hero-stage">
                  ${IT.productArt('tshirt', '#F2EBDA')}
                </div>
              </div>
            </div>

            <div class="clg-piece clg-tote">
              <div class="clg-float slow">
                <div class="product-stage" id="hero-tote-stage">
                  ${IT.productArt('tote', '#D9B25E')}
                </div>
              </div>
            </div>

            <div class="clg-piece clg-badge" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="#FFFDF8" stroke="#E8A0A9" stroke-width="3" stroke-dasharray="6.5 5.5"/>
                <text x="50" y="42" text-anchor="middle" font-family="Yomogi, 'Klee One', cursive" font-size="16" fill="#D97F8C">世界に</text>
                <text x="50" y="62" text-anchor="middle" font-family="Yomogi, 'Klee One', cursive" font-size="16" fill="#D97F8C">ひとつ</text>
                <path d="M50,78 C45,74 41,71 41.3,68 c.2-2.2 1.9-3.7 3.9-3.7 1.4 0 2.6.7 3.4 2 .8-1.3 2-2 3.4-2 2 0 3.7 1.5 3.9 3.7 .3 3-2.7 6-6.9 10z" transform="translate(-1,-6)" fill="#F2A9B8"/>
              </svg>
            </div>

            <div class="clg-piece clg-tag" aria-hidden="true">ししゅうに なった！</div>

            <div class="clg-piece clg-d d-spool" aria-hidden="true">
              <svg viewBox="0 0 64 64"><g stroke-width="3" stroke-linecap="round"><rect x="18" y="10" width="28" height="7" rx="3.5" fill="#D7BFA0" stroke="#66523F"/><rect x="18" y="47" width="28" height="7" rx="3.5" fill="#D7BFA0" stroke="#66523F"/><rect x="22" y="17" width="20" height="30" fill="#A6C09A" stroke="#66523F"/><path d="M42 24c10 0 14 8 8 14" fill="none" stroke="#7E9B71" stroke-dasharray="4 4"/></g></svg>
            </div>
            <div class="clg-piece clg-d d-heart" aria-hidden="true">
              <svg viewBox="0 0 44 44"><path d="M22 36C13 29 7 23 7.6 17c.4-4.4 3.8-7.4 7.7-7.4 2.8 0 5.2 1.5 6.7 3.9 1.5-2.4 3.9-3.9 6.7-3.9 3.9 0 7.3 3 7.7 7.4.6 6-5.4 12-14.4 19z" fill="#F2A9B8" stroke="#D97F8C" stroke-width="2.4" stroke-dasharray="4 3.4"/></svg>
            </div>
            <div class="clg-piece clg-d d-star" aria-hidden="true">
              <svg viewBox="0 0 40 40"><path d="M20 4l3.4 10.2L34 15l-8.4 6.6L28.4 32 20 25.8 11.6 32l2.8-10.4L6 15l10.6-.8z" fill="#F5CB5C" stroke="#C9A144" stroke-width="2.2" stroke-linejoin="round"/></svg>
            </div>
            <div class="clg-piece clg-d d-button" aria-hidden="true">
              <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#A7CEDE" stroke="#66523F" stroke-width="2.6"/><circle cx="15" cy="16" r="1.8" fill="#66523F"/><circle cx="25" cy="16" r="1.8" fill="#66523F"/><circle cx="15" cy="25" r="1.8" fill="#66523F"/><circle cx="25" cy="25" r="1.8" fill="#66523F"/><path d="M15,16 L25,25 M25,16 L15,25" stroke="#66523F" stroke-width="1.6"/></svg>
            </div>
            <div class="clg-piece clg-d d-needle" aria-hidden="true">
              <svg viewBox="0 0 90 90"><g stroke="#66523F" stroke-width="3.4" stroke-linecap="round"><path d="M74 16c4 4 4 8 1 11L34 68c-5 5-13 7-16 4-3-3-1-11 4-16L63 15c3-3 7-3 11 1z" fill="#FFFDF8"/><path d="M70 25l-5-5"/><path d="M15 74c7-1 12-4 16-9" fill="none" stroke="#D97F8C" stroke-dasharray="5 5"/></g></svg>
            </div>

          </div>
        </div>

        <div class="hero-actions">
          <p class="hero-lead">
            写真をアップするだけで、その場で刺繍プレビューにへんしん。
            糸のいろも大きさも、じぶんで選べます。
          </p>
          <div class="hero-btns">
            <a class="btn btn-primary btn-lg" href="#/products">${IT.ui.icon('needle')} さっそくつくる</a>
            <a class="btn btn-ghost btn-lg" href="#/guide">つくりかたを見る</a>
          </div>
          <p class="hero-note">＊アップロードした画像はブラウザの中だけで処理されます</p>
        </div>
      </div>
      <div class="marquee" aria-hidden="true"><div class="marquee-inner" id="marquee-inner">
        ちくちく、まいにち。 ✿ 写真が刺繍になる ✿ 糸いろ48色 ✿ 世界にひとつのプレゼント ✿ クロスステッチもできるよ ✿
        ちくちく、まいにち。 ✿ 写真が刺繍になる ✿ 糸いろ48色 ✿ 世界にひとつのプレゼント ✿ クロスステッチもできるよ ✿
      </div></div>
    </section>

    <section class="section" id="howto">
      <div class="container">
        <div class="section-head center">
          <span class="en-label" style="justify-content:center;">how to make</span>
          <h2>つくりかたは、3ステップ</h2>
          <p class="lead">むずかしい操作はありません。5分でオーダー完了。</p>
        </div>
        <div class="steps-grid">
          <div class="card step-card reveal">
            <div class="tape tape-green"></div>
            <div class="step-num">1</div>
            <div class="step-icon">${IT.ui.STEP_ART.choose}</div>
            <h3>商品をえらぶ</h3>
            <p>Tシャツ・タオル・トート…刺繍したいアイテムと生地の色をえらびます。</p>
          </div>
          <div class="card step-card reveal">
            <div class="tape"></div>
            <div class="step-num">2</div>
            <div class="step-icon">${IT.ui.STEP_ART.upload}</div>
            <h3>写真をアップ &amp; 調整</h3>
            <p>自動で刺繍データに変換。糸の色や太さ、大きさ、位置をすきなように。</p>
          </div>
          <div class="card step-card reveal">
            <div class="tape tape-mustard"></div>
            <div class="step-num">3</div>
            <div class="step-icon">${IT.ui.STEP_ART.receive}</div>
            <h3>刺繍されて、とどく</h3>
            <p>職人がそのデータのまま刺繍してお届け。目安は5〜8営業日です。</p>
          </div>
        </div>
      </div>
    </section>

    ${IT.ui.divider()}

    <section class="section">
      <div class="container">
        <div class="section-head">
          <span class="en-label">items</span>
          <h2>刺繍できるアイテム</h2>
          <p class="lead">ぜんぶ、ちくちくの土台になるのを待っています。</p>
        </div>
        <div class="product-grid">
          ${featured.map(p => productCard(p)).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head center">
          <span class="en-label" style="justify-content:center;">features</span>
          <h2>「いとまき」でできること</h2>
        </div>
        <div class="feature-grid">
          ${FEATURES.map(f => `
            <div class="card feature-card reveal">
              <div class="f-icon" style="color:var(--pink-deep);">${IT.ui.icon(f.icon)}</div>
              <h3>${f.title}</h3>
              <p>${f.desc}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>

    ${IT.ui.divider()}

    <section class="section">
      <div class="container">
        <div class="section-head center">
          <span class="en-label" style="justify-content:center;">gallery</span>
          <h2>たとえば、こんな刺繍に</h2>
          <p class="lead">この見本は、いま実際に変換エンジンが縫ったものです。</p>
        </div>
        <div class="gallery-strip" id="gallery-strip">
          ${IT.SAMPLE_IMAGES.map(s => `
            <div class="patch reveal">
              <div class="patch-frame"><canvas data-sample="${s.id}" width="240" height="240"></canvas></div>
              <div class="patch-label">「${s.label}」</div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head center">
          <span class="en-label" style="justify-content:center;">voices</span>
          <h2>お客さまの声</h2>
        </div>
        <div class="voice-grid">
          ${VOICES.map(v => `
            <div class="voice-card reveal">
              <div class="voice-stars">${v.stars}</div>
              <p>${v.text}</p>
              <div class="voice-meta">— ${v.meta}</div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-band reveal">
          <h2>さあ、あなたの「すき」を縫いはじめよう</h2>
          <p>写真いちまいから、世界にひとつの刺繍アイテム。</p>
          <a class="btn btn-lg" href="#/products">${IT.ui.icon('needle')} 商品をえらぶ</a>
        </div>
      </div>
    </section>
    `;

    IT.ui.observeReveals(el);
    renderHeroDemo();
    renderHeroTote();
    renderGallery(el);
  };

  function productCard(p){
    const c0 = p.colors[0];
    return `
    <a class="product-card reveal" href="#/product/${p.id}">
      <div class="product-thumb">${IT.productArt(p.id, c0.hex)}</div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-price"><span class="yen">¥</span>${p.price.toLocaleString()}<span class="from">+ 刺繍代</span></div>
        <div class="product-meta">
          <div class="color-dots">${p.colors.map(c => `<span class="color-dot" style="background:${c.hex}" title="${c.label}"></span>`).join('')}</div>
        </div>
      </div>
    </a>`;
  }

  /** ヒーローのライブ刺繍デモ（共通処理） */
  async function stitchOnto(stageId, productId, zoneIdx, sampleId, params, widthMm, place){
    const stage = document.getElementById(stageId);
    if (!stage) return;
    try{
      const sample = IT.SAMPLE_IMAGES.find(s => s.id === sampleId);
      const src = await IT.svgToCanvas(sample.svg, 480);
      const result = IT.emb.analyze(src, { colors: params.colors || 6, removeBg: false });
      if (!result.palette.length) return;
      const sd = IT.emb.buildStitches(result, params, widthMm);
      const canvas = document.createElement('canvas');
      canvas.className = 'emb-overlay';
      canvas.style.pointerEvents = 'none';
      IT.emb.drawStitches(canvas, sd, result, { pxPerMm: 3.2, padMm: 1.5, cssSize: false });
      stage.appendChild(canvas);
      const product = IT.productById[productId];
      IT.placeOverlay(stage, canvas, product, product.zones[zoneIdx], place, sd, 1.5);
    }catch(e){
      console.warn('hero demo failed', stageId, e);
    }
  }

  /** おはな → Tシャツのむね */
  function renderHeroDemo(){
    return stitchOnto('hero-stage', 'tshirt', 0, 'flower',
      { style:'tatami', weight:'normal', density:'normal', angle:32, colors:6 }, 118, { dx:0, dy:4, rot:0 });
  }

  /** さくらんぼ → トートのまんなか */
  function renderHeroTote(){
    return stitchOnto('hero-tote-stage', 'tote', 0, 'cherry',
      { style:'tatami', weight:'normal', density:'normal', angle:58, colors:6 }, 96, { dx:0, dy:6, rot:0 });
  }

  /** ギャラリー: サンプル4種を小さく実変換 */
  async function renderGallery(root){
    const canvases = root.querySelectorAll('[data-sample]');
    const styles = {
      flower:  { params:{ style:'tatami', weight:'normal', density:'normal', angle:32 },  colors:6 },
      bear:    { params:{ style:'tatami', weight:'thick', density:'normal', angle:0 },    colors:5 },
      cherry:  { params:{ style:'tatami', weight:'normal', density:'fine', angle:60 },    colors:6 },
      rainbow: { params:{ style:'cross',  weight:'normal', density:'normal', angle:0 },   colors:7 },
    };
    for (const cv of canvases){
      const s = IT.SAMPLE_IMAGES.find(x => x.id === cv.dataset.sample);
      if (!s) continue;
      try{
        const conf = styles[s.id] || styles.flower;
        const src = await IT.svgToCanvas(s.svg, 420);
        const result = IT.emb.analyze(src, { colors: conf.colors, removeBg: false });
        if (!result.palette.length) continue;
        const sd = IT.emb.buildStitches(result, conf.params, 46);
        IT.emb.drawStitches(cv, sd, result, { pxPerMm: 240 / Math.max(sd.wMm, sd.hMm) / 2, padMm: 1, dpr: 2, cssSize: false });
        cv.style.width = '120px';
        cv.style.height = 'auto';
      }catch(e){
        console.warn('gallery render failed', s.id, e);
      }
    }
  }
})();
