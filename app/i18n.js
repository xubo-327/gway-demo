// 语言切换（收银台、服务员点单、顾客扫码点餐共用）
// 原理：页面照常用中文渲染，这里按词典把中文文字换成目标语言：
//   单语模式：直接替换成译文
//   双语模式：保留中文，在下面加一行小字译文
// 词典来自 /api/public/i18n/<lang>（内置翻译 + 店长修改 + 菜名等菜单翻译），规则和服务端 src/lib/i18n.js 相同。
// 不翻译：输入框内容、小票预览（.ticket）、[translate="no"] 区域。

const I18N = (() => {
  const LANGS = { fr: "Français", en: "English", es: "Español", pt: "Português", zh: "中文" }; // 法语在前，中文最后
  const FLAGS = { fr: "FR", en: "EN", es: "ES", pt: "PT", zh: "中" };
  const HAS_HAN = /[㐀-鿿]/;
  const STORE_KEY = "pos_lang";
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const SKIP = 'script,style,textarea,.ticket,[translate="no"],.i18n-2,.i18n-switch-pop';

  let cfg = { lang: "zh", mode: "single" };
  let tr = () => null;
  let observer = null;
  let active = false;
  let writing = false;
  // 记录自己写进去的值：双语模式下写回的内容仍含中文，不记录会被反复翻译
  const doneText = new WeakMap(); // 文字节点 → 上次写入的内容
  const doneAttr = new WeakMap(); // 元素 → { 属性: 上次写入的值 }

  // ---------- 电商模式的中性用词（店主 10-15：电商版不该再说「点餐、菜品」） ----------
  // shop：顾客打开的网上商店（中文、外文都换）；shop-admin：电商模式下的收银台（只换中文——外文译文本来就是中性的 page de commande）
  // 餐馆模式（vocab 为空）一个字都不换
  let vocab = null;
  const VOCAB_ZH = {
    shop: [["网上点餐", "网上下单"], ["扫码点餐", "扫码下单"], ["点餐页", "下单页"], ["点餐", "下单"], ["点菜", "选购"], ["菜品", "商品"],
      ["取餐号", "取货号"], ["取餐", "取货"], ["餐厅", "商家"], ["上菜", "发货"]],
    "shop-admin": [["网上外卖预订", "网上下单"], ["线上外卖", "网上订单"], ["网上点餐", "网上下单"], ["点餐页", "下单页"], ["后厨就开始做", "就开始备货"], ["取餐", "取货"], ["餐厅", "商家"]],
  };
  const VOCAB_FOREIGN = {
    fr: [[/\bdu plat\b/g, "de l'article"], [/\b([Ll])e plat\b/g, "$1'article"], [/\bce plat\b/g, "cet article"], [/\bplats\b/g, "articles"], [/\bPlats\b/g, "Articles"],
      [/\bplat\b/g, "article"], [/\bPlat\b/g, "Article"], [/\brestaurant\b/g, "commerçant"], [/\bRestaurant\b/g, "Commerçant"]],
    en: [[/\bdishes\b/g, "items"], [/\bDishes\b/g, "Items"], [/\bdish\b/g, "item"], [/\bDish\b/g, "Item"], [/\brestaurant\b/g, "shop"], [/\bRestaurant\b/g, "Shop"]],
    es: [[/\bplatos\b/g, "artículos"], [/\bPlatos\b/g, "Artículos"], [/\bplato\b/g, "artículo"], [/\bPlato\b/g, "Artículo"], [/\brestaurante\b/g, "comercio"], [/\bRestaurante\b/g, "Comercio"]],
    pt: [[/\bpratos\b/g, "artigos"], [/\bPratos\b/g, "Artigos"], [/\bprato\b/g, "artigo"], [/\bPrato\b/g, "Artigo"], [/\brestaurante\b/g, "estabelecimento"], [/\bRestaurante\b/g, "Estabelecimento"]],
  };
  // 店家自己填的名字（店名、商品名、分类名）里就算有「餐厅」「菜品」也不换：先盖住，换完再放回去
  let keepList = [], keepAll = new Set(), keepTr = null; // keepTr：这些名字的外文译名（第一次用到时按当前词典算）
  const swap = (s, list, pairs) => {
    const held = [];
    for (const k of list) if (s.includes(k)) s = s.split(k).join(`\u0000${held.push(k) - 1}\u0000`);
    for (const [a, b] of pairs) s = typeof a === "string" ? s.split(a).join(b) : s.replace(a, b);
    return held.length ? s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]) : s;
  };
  const vz = (s) => (VOCAB_ZH[vocab] && s ? swap(s, keepList, VOCAB_ZH[vocab]) : s);
  const vf = (s) => {
    const pairs = vocab === "shop" && VOCAB_FOREIGN[cfg.lang];
    if (!pairs || !s) return s;
    if (!keepTr) keepTr = [...keepAll].map((k) => tr(k)).filter((v) => v && pairs.some(([re]) => new RegExp(re.source).test(v))).sort((a, b) => b.length - a.length);
    return swap(s, keepTr, pairs);
  };
  // 换过词的文字节点 → 原来的中文（查词典要用原文；页面代码后来改了这段文字就不算）
  const origText = new WeakMap();
  const srcOf = (n) => { const o = origText.get(n); return o != null && vz(o) === n.data ? o : n.data; };

  // ---------- 翻译器 ----------
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SEP_RE = /( \/ |、|，|, |；|：|: | · |（|）|\(|\)|【|】|\s+)/;
  const SEP_OUT = { "、": ", ", "，": ", ", "；": "; ", "：": ": ", "（": " (", "）": ")", "【": "[", "】": "]" };
  const STRONG_RE = /( \/ | · |、|，|；)/;
  const LATIN_SEP = /( \/ |, |; | · )/;
  const LATIN_SEP_ONLY = /^( \/ |, |; | · )$/;

  function makeTranslator(entries) {
    const exact = new Map();
    const tpls = [];
    const latin = new Set(); // 外语原文（商家直接用法语等录的菜名，店主 10-11）：只按整句换
    for (const [k, v] of Object.entries(entries)) {
      if (!v) continue;
      if (!HAS_HAN.test(k)) latin.add(k);
      const parts = k.split(/\{(\d+)\}/);
      if (parts.length === 1) { exact.set(k, v); continue; }
      const order = [];
      let re = "^";
      parts.forEach((p, i) => { if (i % 2) { order.push(Number(p)); re += i > 1 && parts[i - 1] === "" ? "(.*?)" : "(.+?)"; } else re += escapeRe(p); });
      const literal = parts.filter((_, i) => i % 2 === 0).join("");
      if (!HAS_HAN.test(literal)) continue;
      tpls.push({ re: new RegExp(re + "$", "s"), order, out: v, weight: literal.length, compound: STRONG_RE.test(literal) });
    }
    tpls.sort((a, b) => b.weight - a.weight);
    const cache = new Map();
    function t(s) {
      if (!s) return null;
      if (!HAS_HAN.test(s)) return exact.get(s) ?? latinParts(s);
      if (cache.has(s)) return cache.get(s);
      let out = exact.has(s) ? exact.get(s) : null;
      let fallback = null;
      // 模板本身就带「 · 、，」的整句（「结账：{0} 桌 · 单号 #{1}」）：先按整句模板翻，
      // 不然会被切成几段各翻各的，语序乱掉（法语「Table Encaisser: 2 - N° de commande #1」，10-25 录视频发现）
      if (out == null && STRONG_RE.test(s)) out = byTpl(s, true).out;
      if (out == null) {
        const parts = s.split(STRONG_RE);
        if (parts.length > 1) {
          let ok = true;
          const r = parts.map((p) => {
            if (SEP_OUT[p]) return SEP_OUT[p];
            if (!p || !HAS_HAN.test(p)) return p;
            const v = t(p.trim());
            if (v == null || HAS_HAN.test(v)) ok = false;
            return v;
          });
          if (ok) out = r.join("");
        }
      }
      if (out == null) ({ out, fallback } = byTpl(s, false));
      if (out == null) {
        const sp = split(s);
        out = sp != null && !(fallback != null && HAS_HAN.test(sp)) ? sp : fallback;
      }
      cache.set(s, out);
      return out;
    }
    // 按模板翻：whole = 每个空位也都翻得出来；onlyCompound = 只试带分隔符的整句模板
    function byTpl(s, onlyCompound) {
      let fallback = null;
      for (const x of tpls) {
        if (onlyCompound && !x.compound) continue;
        const m = x.re.exec(s);
        if (!m) continue;
        let whole = true;
        const r = x.out.replace(/\{(\d+)\}/g, (all, n) => {
          const idx = x.order.indexOf(Number(n));
          if (idx < 0) return all;
          const v = m[idx + 1];
          if (!HAS_HAN.test(v)) return v;
          const tv = t(v.trim());
          if (tv == null) whole = false;
          return tv ?? v;
        });
        if (whole) return { out: r, fallback };
        if (fallback == null) fallback = r;
      }
      return { out: null, fallback };
    }
    function split(s) {
      const tokens = s.split(SEP_RE);
      if (tokens.length < 2) return null;
      let hit = false;
      const out = tokens.map((tok) => {
        if (!tok) return tok;
        if (SEP_OUT[tok]) return SEP_OUT[tok];
        if (!HAS_HAN.test(tok)) return tok;
        const v = exact.get(tok);
        if (v != null) { hit = true; return v; }
        return tok;
      });
      return hit ? out.join("").replace(/\s{2,}/g, " ").trim() : null;
    }
    // 外语原文拼起来的（规格「Grande / Sans sel」）：每段按整句查，有一段查到就算
    function latinParts(s) {
      const parts = s.split(LATIN_SEP);
      if (parts.length < 2) return null;
      let hit = false;
      const out = parts.map((p) => { const v = LATIN_SEP_ONLY.test(p) ? null : exact.get(p.trim()); if (v != null) hit = true; return v != null ? p.replace(p.trim(), v) : p; });
      return hit ? out.join("") : null;
    }
    t.latin = latin;
    t.hasLatin = (s) => latin.has(s) || (LATIN_SEP.test(s) && s.split(LATIN_SEP).some((p) => latin.has(p.trim())));
    return t;
  }

  // ---------- 应用到页面 ----------
  const skip = (el) => !el || (el.closest && el.closest(SKIP));
  // 属性（提示文字 placeholder 等）：输入框、文本框里的也要翻译，只跳过明确不翻译的区域
  const ATTR_SKIP = '[translate="no"],.i18n-2,.i18n-switch-pop,.ticket';
  const skipAttrs = (el) => !el || (el.closest && el.closest(ATTR_SKIP));

  // trusted：walkTree 里已经确认这一段不在「不翻译」区域里，不用再往上找一遍（v1.25.1，省下每个文字节点一次 closest）
  function translateText(node, trusted) {
    if (doneText.get(node) === node.data) return;
    const han = HAS_HAN.test(node.data);
    // 电商模式换中性词：查词典用原来的中文（词典的键），显示换过的中文
    const raw = han ? srcOf(node) : node.data;
    if (han && VOCAB_ZH[vocab] && (cfg.lang === "zh" || cfg.mode === "dual")) {
      if (!node.parentElement || (!trusted && skip(node.parentElement))) return;
      const z = vz(raw);
      if (z !== node.data) { origText.set(node, raw); writing = true; node.data = z; writing = false; }
      if (cfg.lang === "zh") { doneText.set(node, node.data); return; }
    }
    // 加粗词后面单独剩下的中文标点（「…<b>收款后才会打印到后厨</b>。」）：外文界面换成西文标点
    if (cfg.lang !== "zh" && cfg.mode !== "dual" && /^\s*[。，、：；！？]+\s*$/.test(raw)) {
      node.data = raw.replace(/[。，、：；！？]/g, (c) => ({ "。": ".", "，": ",", "、": ",", "：": ":", "；": ";", "！": "!", "？": "?" })[c]);
      doneText.set(node, node.data);
      return;
    }
    // 外语原文只换词典里有的整句（菜名）；中文界面不翻中文
    if (han ? cfg.lang === "zh" : !tr.hasLatin || !tr.hasLatin(raw.trim())) return;
    const parent = node.parentElement;
    if (!parent || (!trusted && skip(parent))) return;
    const core = raw.trim();
    // 同一个中文词在不同地方要译成不同的外文（导航「订单」= Historique，别处「订单」= Commandes）：
    // 父元素写 data-i18n-key="另一个词典键"，按那个键查译文，中文照常显示（整改 U4）
    const ctxKey = han && parent.getAttribute("data-i18n-key");
    const out = vf(tr(ctxKey || core.replace(/\s+/g, " "))); // 源码里换行写的一段话：换行和缩进当成一个空格再找（词典里的原文就是这样存的）
    if (!out) return han ? missed(core) : null;
    writing = true;
    try {
      // <option>、<title> 里不能放元素：双语用「中文 / 译文」
      const inline = parent.tagName === "OPTION" || parent.tagName === "TITLE";
      if (cfg.mode === "dual" && han) {
        // 带数字的短词（4人、5 桌、38.00 起）和单个字：译文跟在同一行（「4人 4 pers.」），不另起一行把小格子撑高
        const han = (core.match(/[㐀-鿿]/g) || []).length;
        const short = han <= 1 || (/\d/.test(core) && han <= 2);
        if (inline) { node.data = raw.replace(core, `${vz(core)} / ${out}`); doneText.set(node, node.data); return; }
        // 一句话被加粗词切成几段（「顾客扫<b>外带码</b>下单后…」）：
        //   整段只有文字和行内标签、而且够长 → 中文照常，整句译文放在段落末尾单独一行（见 paragraph()）
        //   否则（段落里还夹着按钮等）→ 每段译文跟在同一行
        const host = INLINE_TAG.test(parent.tagName) ? parent : null;
        const scope = host ? host.parentElement : parent;
        const mixed = !parent.closest("button,.btn,label,th,option") && scope && [...scope.childNodes].some((c) => c !== node && c !== host &&
          ((c.nodeType === 1 && !c.classList.contains("i18n-2") && !/^(BR|IMG|INPUT)$/.test(c.tagName)) || (c.nodeType === 3 && c.data.trim())));
        doneText.set(node, node.data);
        if (mixed && paragraphable(scope)) {
          const old = node.nextSibling;
          if (old && old.nodeType === 1 && old.classList.contains("i18n-2") && !old.classList.contains("i18n-para")) old.remove();
          paras.add(scope);
          if (!paraTimer) paraTimer = Promise.resolve().then(flushParas);
          return;
        }
        const cls = "i18n-2" + (short || mixed ? " i18n-in" : out.length > 40 ? " i18n-long" : "");
        const next = node.nextSibling;
        if (next && next.nodeType === 1 && next.classList.contains("i18n-2")) {
          if (next.textContent !== out) next.textContent = out;
          if (next.className !== cls) next.className = cls;
          return;
        }
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = out;
        // 中文和译文在横排的框里（图标 / 勾选框 + 文字）：两段会变成并排的两块，中文被挤成一字一行（店主 10-12 截图）。
        // 把中文和译文包成一块（.i18n-pair），整块一起换行
        if (!parent.classList.contains("i18n-pair") && [...parent.childNodes].some((c) => c !== node && c.nodeType === 1 && !c.classList.contains("i18n-2"))
          && /^(flex|inline-flex|grid|inline-grid)$/.test(getComputedStyle(parent).display)) {
          const pair = document.createElement("span");
          pair.className = "i18n-pair";
          parent.insertBefore(pair, node);
          pair.appendChild(node);
          pair.appendChild(span);
          return;
        }
        parent.insertBefore(span, next);
      } else {
        // 一句中文被加粗词切成几段（「顾客扫<b>外带码</b>下单后…」）：中文段与段之间不用空格，译成外文后要补上（店主 10-15：法文挤在一起「scanneQR」）
        let v = out;
        if (han && /[A-Za-zÀ-ÿ]/.test(out)) {
          const el = INLINE_TAG.test(parent.tagName) && parent.childNodes.length === 1 ? parent : node;
          const txt = (n) => (n && n.nodeName !== "BR" ? n.textContent : "");
          const before = txt(el.previousSibling), after = txt(el.nextSibling);
          if (before && raw[0] === core[0] && !/[\s(«'"]$/.test(before)) v = " " + v;
          if (after && raw.slice(-1) === core.slice(-1) && !/^[\s.,;:!?)»。，、：；！？]/.test(after)) v += " ";
        }
        node.data = raw.replace(core, v);
        doneText.set(node, node.data); // 译文里还带中文（如 Gway 收银系统）时，不要再翻一遍（否则会一直循环、页面卡死）
      }
    } finally {
      writing = false;
    }
  }

  // ---------- 双语：整段译文 ----------
  const INLINE_TAG = /^(B|STRONG|EM|I|A|CODE|SMALL|SPAN)$/;
  const paras = new Set();
  let paraTimer = null;
  // 只含文字和行内标签（加粗、链接……），中文够长（像一句说明）的段落
  function paragraphable(el) {
    let han = 0;
    for (const c of el.childNodes) {
      if (c.nodeType === 3) han += (c.data.match(/[㐀-鿿]/g) || []).length;
      else if (c.nodeType === 1) {
        if (c.classList.contains("i18n-2")) continue;
        if (c.tagName === "BR") continue;
        if (!INLINE_TAG.test(c.tagName) || c.querySelector("button,input,select,textarea,div,p")) return false;
        han += (c.textContent.match(/[㐀-鿿]/g) || []).length;
      }
    }
    return han >= 12;
  }
  // 按顺序把每一段翻译拼起来（和单语模式显示的一样），放在段落末尾
  function paragraph(el) {
    const parts = [];
    const add = (text) => {
      const core = text.trim();
      if (!core) return;
      parts.push(HAS_HAN.test(core) ? vf(tr(core)) || vz(core) : core);
    };
    for (const c of el.childNodes) {
      if (c.nodeType === 3) add(srcOf(c));
      else if (c.nodeType === 1 && !c.classList.contains("i18n-2")) {
        if (c.tagName === "BR") parts.push("\n");
        else if (c.getAttribute("translate") === "no") parts.push(c.textContent.trim());
        else for (const t of c.childNodes) if (t.nodeType === 3) add(srcOf(t));
      }
    }
    const text = parts.join(" ").replace(/[。，：；（）]/g, (p) => ({ "。": ".", "，": ",", "：": ":", "；": ";", "（": "(", "）": ")" })[p]).replace(/ ?\n ?/g, "\n").replace(/ ([,.;:!?，。；：）)])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
    let span = el.querySelector(":scope > .i18n-para");
    if (!span) {
      span = document.createElement("span");
      span.className = "i18n-2 i18n-para";
      el.appendChild(span);
    }
    if (span.textContent !== text) span.textContent = text;
  }
  function flushParas() {
    paraTimer = null;
    writing = true;
    try {
      for (const el of paras) if (el.isConnected) paragraph(el);
    } finally {
      paras.clear();
      writing = false;
    }
  }

  function translateAttrs(el) {
    let skipped = null; // 先看有没有要翻译的属性，有才往上找「不翻译」区域（大多数元素没有这些属性）
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !HAS_HAN.test(v)) continue;
      const done = doneAttr.get(el) || {};
      if (done[a] === v) continue;
      if (skipped == null) skipped = Boolean(skipAttrs(el));
      if (skipped) return;
      if (cfg.lang === "zh") { // 中文界面只会是电商模式换词
        const z = vz(v);
        if (z !== v) { writing = true; el.setAttribute(a, z); writing = false; }
        done[a] = z; doneAttr.set(el, done);
        continue;
      }
      const out = vf(tr(v.trim()));
      if (!out) { missed(v.trim()); continue; }
      // 双语的输入框提示：「中文 / 译文」太长会被截断，长的只显示译文
      const both = `${vz(v)} / ${out}`;
      const nv = cfg.mode !== "dual" ? out : a === "placeholder" && both.length > 30 ? out : both;
      writing = true;
      el.setAttribute(a, nv);
      writing = false;
      done[a] = nv;
      doneAttr.set(el, done);
    }
  }

  function walkTree(root) {
    if (root.nodeType === 3) return translateText(root);
    if (root.nodeType !== 1) return;
    if (skip(root)) { if (root.tagName === "TEXTAREA") translateAttrs(root); return; }
    translateAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1 || !skip(n)) return NodeFilter.FILTER_ACCEPT;
        if (n.tagName === "TEXTAREA") translateAttrs(n); // 文本框内容不翻译，但提示文字要翻译
        return NodeFilter.FILTER_REJECT;
      },
    });
    const texts = [];
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) texts.push(n);
      else translateAttrs(n);
    }
    texts.forEach((t) => translateText(t, true));
  }

  // 只处理这一批里新加的节点（v1.25.1）：已经不在页面上的不管；同一批里父节点也是新加的，只走父节点一遍（以前子节点会再走一遍）
  function observe() {
    observer = new MutationObserver((muts) => {
      if (writing) return;
      const added = new Set();
      for (const m of muts) {
        if (m.type === "childList") { for (const n of m.addedNodes) if (n.isConnected) added.add(n); }
        else if (m.type === "characterData") translateText(m.target);
        else if (m.type === "attributes" && m.target.nodeType === 1) translateAttrs(m.target);
      }
      if (!added.size) return;
      for (const n of added) {
        let p = n.parentNode, dup = false;
        for (; p && p !== document; p = p.parentNode) if (added.has(p)) { dup = true; break; }
        if (!dup) walkTree(n);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ---------- 对外 ----------
  function load() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (v && LANGS[v.lang]) cfg = { lang: v.lang, mode: v.mode === "dual" ? "dual" : "single" }; return Boolean(v); }
    catch { return false; }
  }

  // defaultLang：这台设备还没选过语言时用的默认值（顾客页按手机语言）
  // force：固定用这个语言，不看这台设备选过的语言（顾客副屏和收银台在同一台电脑上，语言要分开）
  // 不传 defaultLang 的员工页面（收银台、后厨、登录页）：这台设备没选过语言时，用店里设置的默认语言（新安装默认法文）
  // subset：顾客扫码页、副屏、厨房屏只拿精简版词典（这些页面要用的词 + 菜单），碰到精简版里没有的词再自动拿整份补上
  // vocab：电商模式换中性词（见上面 VOCAB_ZH），餐馆模式不传
  async function init({ defaultLang, defaultMode = "single", force = null, subset: wantSubset = false, vocab: wantVocab = null } = {}) {
    subset = Boolean(wantSubset);
    vocab = VOCAB_ZH[wantVocab] ? wantVocab : null;
    if (force && LANGS[force]) cfg = { lang: force, mode: defaultMode };
    else if (!load()) {
      if (defaultLang == null) {
        try { const r = await fetch("/api/public/ui-lang", { cache: "no-store" }); if (r.ok) defaultLang = (await r.json()).lang; } catch {}
      }
      if (defaultLang && defaultLang !== "zh" && LANGS[defaultLang]) cfg = { lang: defaultLang, mode: defaultMode };
    }
    document.documentElement.lang = { zh: "zh-CN", fr: "fr", en: "en", es: "es", pt: "pt" }[cfg.lang];
    document.documentElement.classList.toggle("i18n-dual", cfg.lang !== "zh" && cfg.mode === "dual");
    try {
      const entries = await fetchDict(cfg.lang, subset ? "customer" : "");
      if (subset) { subsetEntries = entries; known = new Set(Object.keys(entries)); }
      tr = makeTranslator(entries);
    } catch {
      return; // 拿不到词典就保持中文
    }
    // 中文界面：只有外语录的菜名要换成中文；一个都没有就不用管页面（纯中文菜单的店和以前一样）
    if (cfg.lang === "zh" && !tr.latin.size && !vocab) return;
    active = true;
    walkTree(document.body);
    if (document.title && HAS_HAN.test(document.title)) {
      const out = cfg.lang === "zh" ? null : vf(tr(document.title));
      if (out) document.title = cfg.mode === "dual" ? `${vz(document.title)} · ${out}` : out;
      else document.title = vz(document.title);
    }
    observe();
  }

  // ---------- 词典：带版本号（可以长期缓存）、精简版漏词时补整份（v1.25.1） ----------
  let subset = false, known = null, subsetEntries = null, fullLoading = null;
  // 版本号：服务器在打开网页时放在 cookie 里；对得上的话浏览器直接用缓存，不用再下载
  const dictRev = () => { try { return (/(?:^|;\s*)pos_i18n=([^;]+)/.exec(document.cookie) || [])[1] || ""; } catch { return ""; } };
  async function fetchDict(lang, scope) {
    const q = [scope ? `scope=${scope}` : "", dictRev() ? `v=${encodeURIComponent(dictRev())}` : ""].filter(Boolean).join("&");
    const res = await fetch(`/api/public/i18n/${lang}${q ? "?" + q : ""}`);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }
  // 精简版里没有、整份里可能有的词（服务器提示、漏收的词）：拿一次整份词典，再把页面上没翻的翻一遍
  const isKnown = (s) => known.has(s) || s.split(SEP_RE).every((p) => !HAS_HAN.test(p) || known.has(p.trim()));
  function missed(s) {
    if (!subset || fullLoading || !s || isKnown(s)) return null;
    fullLoading = new Promise((r) => setTimeout(r, 200)).then(() => fetchDict(cfg.lang, "")).then((full) => {
      const mine = Object.fromEntries(Object.entries(subsetEntries || {}).filter(([, v]) => v));
      tr = makeTranslator({ ...full, ...mine });
      keepTr = null;
      subset = false;
      if (active) walkTree(document.body);
      // 文字变了：让页面重新量一下排版（顾客页的分类栏按文字长度排）
      try { window.dispatchEvent(new Event("resize")); } catch {}
    }).catch(() => {});
    return null;
  }

  // 代码里直接要用的文字（如 confirm 弹窗），按当前语言返回
  function t(zh) {
    if (!active) return zh;
    if (cfg.lang === "zh") return vz(zh);
    const out = vf(tr(zh));
    if (!out) { missed(zh); return vz(zh); }
    return cfg.mode === "dual" ? `${vz(zh)}\n${out}` : out;
  }

  let beforeSwitch = null;
  function set(lang, mode) {
    beforeSwitch?.();
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ lang, mode })); } catch {}
    window.__posReloading = true;
    location.reload();
  }

  // 语言切换按钮：地球图标 + 当前语言，点开选语言和单语/双语
  function mountSwitcher(container, { dark = false } = {}) {
    if (!container) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "i18n-switch" + (dark ? " dark" : "");
    btn.setAttribute("translate", "no");
    btn.setAttribute("aria-label", "Language / 语言");
    btn.innerHTML = `<svg class="i18n-globe" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5s1.3-6.9 3.9-9.5z"/></svg> ${FLAGS[cfg.lang]}${cfg.lang !== "zh" && cfg.mode === "dual" ? "+中" : ""}`;
    container.appendChild(btn);
    btn.onclick = (e) => {
      e.stopPropagation();
      document.querySelector(".i18n-switch-pop")?.remove();
      let lang = cfg.lang, mode = cfg.mode;
      const pop = document.createElement("div");
      pop.className = "i18n-switch-pop";
      pop.setAttribute("translate", "no");
      // 点语言立刻切换；「中文对照」是开关，点一下也立刻生效（以前要再点 OK，手机上容易点空白处关掉而没切换）
      const DUAL_LABEL = { fr: "Afficher aussi le chinois", en: "Also show Chinese", es: "Mostrar también en chino", pt: "Mostrar também em chinês" };
      pop.innerHTML = `
        <div class="i18n-langs">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-l="${k}" class="${k === lang ? "on" : ""}">${v}</button>`).join("")}</div>
        ${lang === "zh" ? "" : `<label class="i18n-dual-opt"><input type="checkbox" data-dual ${mode === "dual" ? "checked" : ""}> 中文对照 · ${DUAL_LABEL[lang] || ""}</label>`}`;
      pop.onclick = (ev) => {
        ev.stopPropagation();
        const l = ev.target.closest("[data-l]");
        if (l && l.dataset.l !== cfg.lang) {
          pop.remove();
          set(l.dataset.l, l.dataset.l === "zh" ? "single" : mode);
        } else if (l) {
          pop.remove();
        }
      };
      pop.onchange = (ev) => {
        if (!ev.target.matches("[data-dual]")) return;
        pop.remove();
        set(lang, ev.target.checked ? "dual" : "single");
      };
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.top = `${Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
      pop.style.left = `${Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8))}px`;
      setTimeout(() => document.addEventListener("click", () => pop.remove(), { once: true }), 0);
    };
  }

  // 页面告诉这里哪些是店家自己填的名字（电商模式换词时原样保留）；只留真的含有要换的词的，长的先盖
  function keep(names) {
    const ok = names.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
    for (const s of ok) keepAll.add(s);
    keepTr = null;
    const hit = (s) => Object.values(VOCAB_ZH).some((m) => m.some(([a]) => s.includes(a)));
    keepList = [...new Set([...keepList, ...ok.filter(hit)])].sort((a, b) => b.length - a.length);
  }

  return {
    init, t, set, keep, mountSwitcher, makeTranslator, LANGS,
    get lang() { return cfg.lang; },
    get mode() { return cfg.mode; },
    onBeforeSwitch(fn) { beforeSwitch = fn; },
  };
})();
