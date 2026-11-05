// 一键打印菜单（菜单 →「🖨 打印菜单」，店主 10-11）：把现在在售的菜排成菜单，先预览再打印（打印窗口里可以「另存为 PDF」），
// 也可以「📱 发到手机」（排好版的 PDF，手机上保存、转发、发给打印店）。
// 可选：5 套模板、A4 / A3、竖版 / 横版、语言（法语 / 法语 + 中文 / 法语 + 英文）、照片、网上点餐二维码、印哪些分类。
// 分页由这里自己排（量每道菜的高度，按栏、按页往下放，分类标题不会落在栏底），预览和打印、PDF 的分页完全一样。
// 菜名、分类名、规格名按菜单翻译词典翻（和顾客点餐页同一套）；「爆款」的菜印「⭐ 招牌」；过敏原印小图标，最后一页底部印图例。
// 不印活动价、不印今日沽清（印出来的菜单要用很久）。
(() => {
  // 印在纸上给顾客看的固定文字：每种语言单独写好（不走界面翻译）
  const T = {
    fr: { star: "Spécialité", allergens: "Allergènes", ask: "Allergènes : renseignez-vous auprès de notre personnel.", net: "Prix nets, service compris.", order: "Commandez en ligne", tel: "Tél.", menu: "Menu" },
    en: { star: "Signature dish", allergens: "Allergens", ask: "Allergens: please ask our staff.", net: "Prices include service.", order: "Order online", tel: "Tel.", menu: "Menu" },
    zh: { star: "招牌", allergens: "过敏原", ask: "过敏原信息请询问店员。", net: "价格已含服务费。", order: "网上点餐", tel: "电话", menu: "菜单" },
  };
  const PRESETS = [["fr", "法语"], ["fr+zh", "法语 + 中文"], ["fr+en", "法语 + 英文"]];
  // 模板：[键, 名字, 预览色块（底色, 强调色；null = 收银系统的主题色）]
  const TEMPLATES = [
    ["classic", "简约", "#ffffff", "#1f1d1a"],
    ["brand", "品牌色", "#ffffff", null],
    ["noir", "黑金", "#16130f", "#c8a25a"],
    ["photo", "大图", "#f7f4ef", null],
    ["list", "价目表", "#ffffff", null],
  ];
  const SIZE = { A4: [210, 297], A3: [297, 420] };
  const PAD = 12; // 页边距 mm
  const GAP = 8; // 栏间距 mm
  const MM = 96 / 25.4;
  const KEY = "menu_print_opts";
  const dicts = {}; // 语言 → 翻译函数（菜名、分类名、过敏原名）

  function load() {
    let o = {};
    try { o = JSON.parse(store.get(KEY) || "{}") || {}; } catch {}
    return {
      tpl: TEMPLATES.some(([k]) => k === o.tpl) ? o.tpl : "classic",
      lang: PRESETS.some(([k]) => k === o.lang) ? o.lang : "fr",
      paper: o.paper === "A3" ? "A3" : "A4", land: o.land === true,
      photos: o.photos !== false, qr: o.qr !== false, skip: Array.isArray(o.skip) ? o.skip : [],
    };
  }
  async function translator(lang) {
    if (lang === "zh") return (s) => s; // 菜单本来就是中文录的；外语录的菜照原样印
    if (!dicts[lang]) {
      const res = await fetch(`/api/public/i18n/${lang}`);
      const entries = res.ok ? await res.json() : {};
      const tr = I18N.makeTranslator(entries);
      dicts[lang] = (s) => (s ? tr(String(s)) || String(s) : "");
    }
    return dicts[lang];
  }
  const accent = () => (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "").trim() || "#c2410c";
  // 纸张大小（mm）和栏数：A4 竖 2 栏、A4 横 / A3 竖 3 栏、A3 横 4 栏；价目表字小，多一栏
  function geometry(o) {
    let [w, h] = SIZE[o.paper];
    if (o.land) [w, h] = [h, w];
    let cols = Math.max(2, Math.round((w - 2 * PAD + GAP) / 92));
    if (o.tpl === "list") cols += 1;
    return { w, h, cols };
  }

  // 双语：主语言大字，第二语言小字（两种一样时不重复，比如法语录的菜在「法语 + 英文」里没有英文译文）
  const two = (a, b) => (b && b !== a ? `${esc(a)}<small class="l2">${esc(b)}</small>` : esc(a));

  function optionLines(i, tr, tr2) {
    const out = [];
    for (const g of i.options || []) {
      const ch = (g.choices || []).filter((c) => c && c.name);
      if (!ch.length) continue;
      const name = (s) => { const a = tr(s), b = tr2 ? tr2(s) : ""; return b && b !== a ? `${a} / ${b}` : a; };
      const priced = ch.some((c) => c.price_cents);
      const list = ch.map((c) => (g.type === "multi" ? `${name(c.name)}${c.price_cents ? ` +${money(c.price_cents)}` : ""}` : `${name(c.name)}${priced ? ` ${money(i.price_cents + (c.price_cents || 0))}` : ""}`));
      out.push(`<div class="opt">${esc(name(g.name))} : ${esc(list.join(" · "))}</div>`);
    }
    return out.join("");
  }

  // 一套模板的样式。所有样式都挂在 .page 上（发到手机时每页单独画成图片，没有 body）
  function css(o, g) {
    const ac = accent();
    const base = `
      @page { size: ${g.w}mm ${g.h}mm; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; }
      @media screen { html { background: #e9e6e1; } body { padding: 1px 0; } .page { margin: 14px auto; box-shadow: 0 2px 12px rgba(0,0,0,.18); } }
      @media print { html { zoom: 1 !important; } .page { break-after: page; } .page:last-child { break-after: auto; } }
      .page { --ac: ${ac}; --bg: #fff; --ink: #1f1d1a; --mute: #6b665e; --rule: #d9d4cb; --pr: var(--ink);
        width: ${g.w}mm; height: ${g.h}mm; padding: ${PAD}mm; overflow: hidden; display: flex; flex-direction: column;
        font: 10.5pt/1.35 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
        background: var(--bg); color: var(--ink); }
      .cols { flex: 1; display: flex; gap: ${GAP}mm; min-height: 0; }
      .col { flex: 1; min-width: 0; }
      .blk { padding-bottom: 2.6mm; }
      .cat-h { padding: 1mm 0 2.4mm; }
      .cat-h h2 { margin: 0; }
      .l2 { display: block; font-weight: 400; font-size: .78em; color: var(--mute); letter-spacing: 0; text-transform: none; }
      header.top { text-align: center; padding-bottom: 6mm; margin-bottom: 6mm; }
      header.top img { max-height: 20mm; max-width: 60mm; display: block; margin: 0 auto 3mm; }
      header.top h1 { margin: 0; font-size: 26pt; line-height: 1.1; }
      header.top .info { color: var(--mute); font-size: 9pt; margin-top: 2mm; }
      .item .in { display: flex; gap: 3mm; }
      .item .ph { width: 16mm; height: 16mm; flex: none; border-radius: 2mm; object-fit: cover; display: block; }
      .txt { flex: 1; min-width: 0; }
      .row { display: flex; align-items: baseline; gap: 1.5mm; }
      .nm { font-weight: 600; overflow-wrap: anywhere; }
      .dots { flex: 1; border-bottom: 1pt dotted var(--rule); min-width: 4mm; transform: translateY(-1mm); }
      .pr { font-weight: 700; white-space: nowrap; color: var(--pr); }
      .star { font-size: 7.5pt; font-weight: 700; color: var(--ac); letter-spacing: .03em; text-transform: uppercase; }
      .opt { font-size: 8.3pt; color: var(--mute); margin-top: .4mm; overflow-wrap: anywhere; }
      .alg { font-size: 8.3pt; margin-top: .4mm; letter-spacing: .5mm; }
      .code { font: 600 8pt ui-monospace, Consolas, monospace; color: var(--mute); margin-right: 1.5mm; }
      footer.bot { margin-top: 4mm; padding-top: 3mm; border-top: .6pt solid var(--rule); font-size: 8.3pt; color: var(--mute); display: flex; gap: 6mm; align-items: flex-end; }
      .legend { flex: 1; display: flex; flex-wrap: wrap; gap: 1mm 4mm; }
      .legend b { width: 100%; color: var(--ink); }
      .qr { text-align: center; flex: none; color: var(--ink); }
      .qr .qi { width: 24mm; height: 24mm; margin: 0 auto 1mm; display: block; background: #fff; border-radius: 1.5mm; }
      .qr b { font-size: 8.5pt; }`;
    const serif = `Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", serif`;
    const t = {
      // 简约：白底、衬线标题、点线连到价格
      classic: `
        .t-classic header.top { border-bottom: 1.5pt solid var(--ink); }
        .t-classic header.top h1, .t-classic .cat-h h2 { font-family: ${serif}; }
        .t-classic .cat-h h2 { font-size: 14pt; padding-bottom: 1.5mm; border-bottom: .6pt solid var(--rule); }`,
      // 品牌色：顶部主题色色带、分类标题胶囊、价格主题色（和收银系统一样的观感）
      brand: `
        .t-brand { --pr: var(--ac); --rule: #e6e0d6; }
        .t-brand header.top { background: var(--ac); color: #fff; margin: -${PAD}mm -${PAD}mm 6mm; padding: 9mm ${PAD}mm 7mm; border-radius: 0 0 6mm 6mm; }
        .t-brand header.top h1 { font-weight: 800; letter-spacing: -.01em; }
        .t-brand header.top .info { color: rgba(255,255,255,.88); }
        .t-brand header.top img { background: #fff; border-radius: 3mm; padding: 1.5mm; }
        .t-brand .cat-h h2 { display: inline-block; font-size: 12pt; font-weight: 800; color: #fff; background: var(--ac); border-radius: 99px; padding: 1.2mm 4.5mm; }
        .t-brand .cat-h .l2 { color: rgba(255,255,255,.88); display: inline; margin-left: 2mm; }
        .t-brand .item .in { background: #faf8f5; border-radius: 3mm; padding: 2mm 2.5mm; }
        .t-brand .dots { border: 0; }
        .t-brand .item .ph { border-radius: 2.5mm; }`,
      // 黑金：深色底、金色细线、衬线大写标题
      noir: `
        .t-noir { --bg: #16130f; --ink: #f1eadc; --mute: #b3a891; --rule: #6b5a37; --pr: #d8b46a; --ac: #c8a25a; }
        .t-noir header.top h1, .t-noir .cat-h h2 { font-family: ${serif}; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; }
        .t-noir header.top { border-bottom: .8pt solid var(--ac); }
        .t-noir header.top h1 { color: var(--ac); }
        .t-noir .cat-h { text-align: center; }
        .t-noir .cat-h h2 { font-size: 13pt; color: var(--ac); display: flex; align-items: center; gap: 3mm; flex-wrap: wrap; justify-content: center; }
        .t-noir .cat-h h2::before, .t-noir .cat-h h2::after { content: ""; flex: 1; min-width: 6mm; border-top: .6pt solid var(--rule); }
        .t-noir .cat-h .l2 { width: 100%; order: 3; color: var(--mute); }
        .t-noir .nm { font-weight: 500; letter-spacing: .02em; }
        .t-noir .qr .qi { border: 1.5mm solid #fff; }`,
      // 大图：咖啡馆风格的卡片，照片占满一栏宽
      photo: `
        .t-photo { --bg: #f7f4ef; --pr: var(--ac); }
        .t-photo header.top h1 { font-weight: 800; letter-spacing: -.02em; }
        .t-photo header.top { padding-bottom: 2mm; }
        .t-photo .cat-h h2 { font-size: 15pt; font-weight: 800; letter-spacing: -.01em; border-left: 1.6mm solid var(--ac); padding-left: 2.5mm; }
        .t-photo .item .in { display: block; background: #fff; border-radius: 3.5mm; overflow: hidden; box-shadow: 0 .3mm 1.2mm rgba(0,0,0,.08); }
        .t-photo .item .ph { width: 100%; height: ${o.paper === "A3" ? 38 : 30}mm; border-radius: 0; }
        .t-photo .item .txt { padding: 2mm 2.8mm 2.4mm; }
        .t-photo .dots { border: 0; }
        .t-photo .nm { font-size: 11pt; }`,
      // 价目表：字小、行紧、隔行线，最多的菜放进一页；有菜号印菜号
      list: `
        .t-list { font-size: 9.2pt; }
        .t-list header.top { text-align: left; display: flex; align-items: center; gap: 4mm; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1.2pt solid var(--ac); }
        .t-list header.top img { margin: 0; max-height: 14mm; }
        .t-list header.top h1 { font-size: 18pt; font-weight: 800; flex: 1; }
        .t-list header.top .info { margin: 0; text-align: right; }
        .t-list .cat-h h2 { font-size: 10pt; font-weight: 800; color: #fff; background: var(--ac); padding: 1mm 2.5mm; border-radius: 1.2mm; letter-spacing: .03em; text-transform: uppercase; }
        .t-list .cat-h .l2 { color: rgba(255,255,255,.88); display: inline; margin-left: 2mm; }
        .t-list .blk.item { padding-bottom: 0; }
        .t-list .item .in { padding: 1.1mm 1.5mm; border-bottom: .4pt solid var(--rule); }
        .t-list .opt { font-size: 7.6pt; }`,
    };
    return base + t[o.tpl];
  }

  // 每一块（分类标题 / 一道菜）的 HTML
  function blocks(data, o, tr, tr2) {
    const [l1, l2] = o.lang.split("+");
    const t = T[l1], t2 = l2 ? T[l2] : null;
    const amap = new Map(data.allergens.map((a) => [a.code, a]));
    const photos = o.photos && o.tpl !== "list";
    const out = [];
    for (const c of data.categories) {
      if (o.skip.includes(c.id)) continue;
      const items = data.items.filter((i) => i.category_id === c.id);
      if (!items.length) continue;
      out.push({ cat: true, html: `<div class="blk cat-h"><h2>${two(tr(c.name), tr2 && tr2(c.name))}</h2></div>` });
      for (const i of items) {
        const icons = (i.allergens || []).map((a) => amap.get(a)?.icon || "").join("");
        const n1 = tr(i.name), n2 = tr2 ? tr2(i.name) : "";
        const img = photos && i.image ? `<img class="ph" src="${esc(location.origin + i.image)}" alt="">` : "";
        out.push({ html: `<div class="blk item"><div class="in">${img}<div class="txt">${i.featured ? `<div class="star">⭐ ${esc(t.star)}${t2 ? ` · ${esc(t2.star)}` : ""}</div>` : ""}<div class="row"><span class="nm">${o.tpl === "list" && i.code ? `<span class="code">${esc(i.code)}</span>` : ""}${two(n1, n2)}</span><span class="dots"></span><span class="pr">${esc(money(i.price_cents))}</span></div>${optionLines(i, tr, tr2)}${icons ? `<div class="alg">${icons}</div>` : ""}</div></div></div>` });
      }
    }
    return out;
  }
  function headerHtml(lang) {
    const st = S.settings || {};
    const t = T[lang];
    const logo = st.mall_logo || st.store_logo || "";
    const info = [st.store_address, st.store_phone ? `${t.tel} ${st.store_phone}` : ""].filter(Boolean).map(esc).join(" · ");
    return `<header class="top">${logo ? `<img src="${esc(location.origin + logo)}" alt="">` : ""}<h1>${esc(st.store_name || t.menu)}</h1>${info ? `<div class="info">${info}</div>` : ""}</header>`;
  }
  function footerHtml(data, o, tr, tr2) {
    const [l1, l2] = o.lang.split("+");
    const t = T[l1], t2 = l2 ? T[l2] : null;
    const cats = new Set(data.categories.filter((c) => !o.skip.includes(c.id)).map((c) => c.id));
    const shown = data.items.filter((i) => cats.has(i.category_id));
    const used = new Set(shown.flatMap((i) => i.allergens || []));
    const missing = shown.some((i) => i.allergens == null);
    const legend = data.allergens.filter((a) => used.has(a.code)).map((a) => `<span>${a.icon} ${esc(tr(a.name))}${tr2 ? ` / ${esc(tr2(a.name))}` : ""}</span>`).join("");
    const qr = o.qr && data.orderUrl ? `<div class="qr"><img class="qi" src="${esc(location.origin)}/api/print-templates/qr.svg?${mediaQ()}&amp;data=${encodeURIComponent(data.orderUrl)}" alt=""><b>${esc(t.order)}${t2 ? `<small class="l2">${esc(t2.order)}</small>` : ""}</b></div>` : "";
    return `<footer class="bot"><div class="legend">${legend ? `<b>${esc(t.allergens)}${t2 ? ` · ${esc(t2.allergens)}` : ""}</b>${legend}` : ""}<span style="width:100%">${missing ? esc(t.ask) + " " : ""}${esc(t.net)}</span></div>${qr}</footer>`;
  }

  // 排版：在预览框里量每一块的高度，按栏、按页往下放
  //   分类标题和它后面的第一道菜放在同一栏；第一页上面是店名，最后一页下面是过敏原图例和二维码
  function paginate(doc, o, g, blks, head, foot) {
    const colW = ((g.w - 2 * PAD - (g.cols - 1) * GAP) / g.cols) * MM;
    const inner = (g.h - 2 * PAD) * MM;
    const box = doc.createElement("div");
    box.className = `page t-${o.tpl}`;
    box.style.cssText = "position:absolute;left:-99999px;top:0;height:auto;visibility:hidden";
    box.innerHTML = `${head}<div class="mcol" style="width:${colW}px">${blks.map((b) => b.html).join("")}</div>${foot}`;
    doc.body.appendChild(box);
    const outer = (el, side) => el.getBoundingClientRect().height + parseFloat(doc.defaultView.getComputedStyle(el)[side] || 0);
    const hH = outer(box.querySelector("header.top"), "marginBottom");
    const fH = outer(box.querySelector("footer.bot"), "marginTop");
    const hs = [...box.querySelector(".mcol").children].map((x) => x.getBoundingClientRect().height);
    box.remove();
    // 往一页里放：colH = 每栏能放的高度；返回 { cols: [栏][块下标], next }
    // 每栏底下留一点余量：预览缩小显示、打印时字的量法都会让每行差零点几像素，十几行加起来就会超出
    const fill = (from, avail) => {
      const colH = avail * 0.985 - 4;
      const cols = [];
      let k = from;
      for (let c = 0; c < g.cols && k < blks.length; c++) {
        const col = [];
        let used = 0;
        while (k < blks.length) {
          const need = hs[k] + (blks[k].cat && k + 1 < blks.length ? hs[k + 1] : 0); // 分类标题要带着下一道菜
          if (col.length && used + need > colH) break;
          col.push(k); used += hs[k]; k++;
        }
        cols.push(col);
      }
      return { cols, next: k };
    };
    const pages = [];
    let i = 0;
    for (let guard = 0; guard < 200; guard++) {
      const first = !pages.length;
      const colH = inner - (first ? hH : 0);
      // 先按最后一页算（留出底部图例）；都放下了就是最后一页，否则按不留底部的放满这一页
      const withFoot = fill(i, colH - fH);
      if (withFoot.next >= blks.length) {
        // 最后一页：各栏一样高（找能放下全部的最矮栏高），不会一栏满、一栏空
        let lo = 0, hi = colH - fH;
        for (let n = 0; n < 24 && hi - lo > 2; n++) { const mid = (lo + hi) / 2; if (fill(i, mid).next >= blks.length) hi = mid; else lo = mid; }
        pages.push({ first, last: true, cols: fill(i, hi).cols });
        break;
      }
      let r = fill(i, colH);
      if (r.next >= blks.length) r = withFoot.next > i ? withFoot : r; // 放得下菜、放不下底部：底部去下一页
      if (r.next === i) r = { cols: [[i]], next: i + 1 }; // 一块比整栏还高：硬放
      pages.push({ first, last: false, cols: r.cols });
      i = r.next;
    }
    return pages.map((p) => `<div class="page t-${o.tpl}">${p.first ? head : ""}<div class="cols">${Array.from({ length: g.cols }, (_, c) => `<div class="col">${(p.cols[c] || []).map((k) => blks[k].html).join("")}</div>`).join("")}</div>${p.last ? foot : ""}</div>`).join("");
  }

  // 把排好的页画成图片（发到手机用的 PDF）：每页一张 JPEG
  async function pageImages(html, g) {
    const inl = await Stickers.inlineImages(html);
    const doc = new DOMParser().parseFromString(inl.html, "text/html");
    const style = [...doc.querySelectorAll("style")].map((x) => x.textContent).join("\n").replace(/@page\s*\{[^}]*\}/g, "").replace(/@media screen \{[^\n]*\n/, "\n");
    const W = Math.round(g.w * MM), H = Math.round(g.h * MM);
    const scale = g.w > 250 || g.h > 350 ? 1.3 : 1.7; // 约 130–160 dpi：清楚，文件不太大
    const out = [];
    for (const pg of doc.querySelectorAll(".page")) {
      const body = new XMLSerializer().serializeToString(pg);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}"><foreignObject width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${style}</style>${body}</div></foreignObject></svg>`;
      const img = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error("菜单页画不出来")); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      const c = document.createElement("canvas");
      c.width = Math.round(W * scale); c.height = Math.round(H * scale);
      const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      const jpg = c.toDataURL("image/jpeg", 0.86);
      out.push({ w: c.width, h: c.height, pw: g.w * 72 / 25.4, ph: g.h * 72 / 25.4, bytes: Uint8Array.from(atob(jpg.split(",")[1]), (ch) => ch.charCodeAt(0)) });
    }
    return { pages: out, failed: inl.failed };
  }
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  let busy = false;
  async function sendToPhone(html, g) {
    if (busy) return toast("正在准备…");
    busy = true;
    toast("正在准备…");
    const t0 = document.querySelector("#toasts")?.lastElementChild;
    try {
      const { pages, failed } = await pageImages(html, g);
      const pdf = Stickers.buildPdf(pages);
      const lang = ({ "zh-CN": "zh", fr: "fr", en: "en", es: "es", pt: "pt" })[document.documentElement.lang] || "zh";
      const r = await api("/api/stickers/share", { method: "POST", body: { pdf: b64(pdf), qrs: [], lang, kind: "menu" } });
      if (failed) toast(`有 ${failed} 张图片没取到，其余的已经发到手机`, "error");
      openModal({
        title: "📱 发到手机",
        body: `<div style="text-align:center">
          <div style="width:240px;margin:0 auto">${r.qr_svg}</div>
          <p>用手机扫这个码（手机要连店里的 WiFi）。</p>
          <p class="muted" style="font-size:13px">手机上打开的是排好版的菜单 PDF，可以保存、转发，或者发给打印店。链接 ${r.expires_minutes} 分钟内有效。</p>
          <p class="muted" style="font-size:12px" translate="no">${esc(r.url)}</p></div>`,
        buttons: [{ label: "关闭", kind: "primary" }],
      });
    } catch (e) { toast(e.message, "error"); } finally { t0?.remove?.(); busy = false; }
  }

  // 安卓收银机：网页打印没有反应，交给安卓系统打印（系统打印窗口里也能「另存为 PDF」）；电脑：浏览器打印
  async function print(m, html) {
    if (inAndroidApp()) { // 平板收银机 / 服务员手机 App 都交给系统打印
      try {
        const inl = await Stickers.inlineImages(html);
        if (inl.failed) toast(`有 ${inl.failed} 张图片没取到，先打印其余的`, "error");
        await window.PosApp.call("printHtml", { html: inl.html, name: "Menu" });
      } catch (e) {
        toast(/不支持/.test(e.message) ? (IS_POS_HOST ? "这个版本的 App 还不能打印菜单：请更新收银系统" : "这个版本的手机 App 还不能打印：请更新 App") : "打印没有打开：" + e.message, "error", 8000);
      }
      return;
    }
    $("#mpFrame", m.el)?.contentWindow.print();
  }

  async function open() {
    const o = load();
    toast("正在准备菜单…");
    const t0 = document.querySelector("#toasts")?.lastElementChild; // 准备好了马上去掉这条提示
    let data;
    try {
      await ensureMediaTicket();
      const [categories, items, allergens, tunnel] = await Promise.all([
        api("/api/menu/categories"), api("/api/menu/items"), api("/api/menu/allergens"), api("/api/tunnel").catch(() => null),
      ]);
      data = { categories, items, allergens, orderUrl: tunnel?.order_url || "" };
    } catch (e) { return toast(e.message, "error"); } finally { t0?.remove?.(); }
    if (!data.items.length) return toast("菜单里还没有在售的菜", "error");
    const cats = data.categories.filter((c) => data.items.some((i) => i.category_id === c.id));
    const missing = data.items.filter((i) => i.allergens == null).length;
    const ac = accent();
    const m = openModal({
      title: "🖨 打印菜单",
      wide: true,
      body: `<div class="stk-layout">
        <div class="stk-opts">
          <div><b>模板</b><div class="mp-tpls" id="mpTpl">${TEMPLATES.map(([k, l, bg, fg]) => `<button type="button" data-tpl="${k}" class="${o.tpl === k ? "on" : ""}"><i style="background:${bg};border-color:${fg || ac}"><s style="background:${fg || ac}"></s></i>${l}</button>`).join("")}</div></div>
          <div class="mp-two">
            <label>纸张<select id="mpPaper"><option value="A4" ${o.paper === "A4" ? "selected" : ""}>A4</option><option value="A3" ${o.paper === "A3" ? "selected" : ""}>A3（大张）</option></select></label>
            <label>方向<select id="mpLand"><option value="0" ${o.land ? "" : "selected"}>竖版</option><option value="1" ${o.land ? "selected" : ""}>横版</option></select></label>
          </div>
          <label>语言<select id="mpLang">${PRESETS.map(([k, l]) => `<option value="${k}" ${o.lang === k ? "selected" : ""}>${l}</option>`).join("")}</select>
            <span class="muted" style="font-size:12px">菜名按菜单翻译印；没有译文的菜印原来的名字（在「设置 → 语言与翻译」里可以改）。</span></label>
          <label class="chk"><input type="checkbox" id="mpPhotos" ${o.photos ? "checked" : ""}> 有照片的菜印照片（价目表不印）</label>
          ${data.orderUrl ? `<label class="chk"><input type="checkbox" id="mpQr" ${o.qr ? "checked" : ""}> 印网上点餐二维码</label>` : ""}
          ${missing ? `<div class="alg-warn" style="margin:0">有 ${missing} 道菜还没填过敏原：菜单下面会印「过敏原请询问店员」。在「菜单」里给菜填好过敏原会印成小图标。</div>` : ""}
          <div><b>印哪些分类</b>
            <div class="stk-pick">${cats.map((c) => `<label class="chk"><input type="checkbox" data-mpcat="${c.id}" ${o.skip.includes(c.id) ? "" : "checked"}> ${esc(c.name)}</label>`).join("")}</div></div>
          <span class="muted" style="font-size:12px">「爆款」的菜会印「⭐ 招牌」。不印今日沽清和活动价。打印窗口里可以选「另存为 PDF」。</span>
          <b id="mpPages" style="font-size:13px"></b>
        </div>
        <div class="stk-preview"><iframe id="mpFrame" title="预览"></iframe></div>
      </div>`,
      buttons: [
        { label: "取消" },
        { label: "📱 发到手机", onClick: () => { sendToPhone(html, geo); return false; } },
        { label: "🖨 打印", kind: "primary", onClick: () => { print(m, html); return false; } },
      ],
    });
    let html = "", geo = geometry(o);
    const read = () => {
      o.tpl = $("#mpTpl .on", m.el)?.dataset.tpl || "classic";
      o.paper = $("#mpPaper", m.el).value;
      o.land = $("#mpLand", m.el).value === "1";
      o.lang = $("#mpLang", m.el).value;
      o.photos = $("#mpPhotos", m.el).checked;
      o.qr = $("#mpQr", m.el) ? $("#mpQr", m.el).checked : o.qr;
      o.skip = [...m.el.querySelectorAll("[data-mpcat]")].filter((x) => !x.checked).map((x) => Number(x.dataset.mpcat));
      try { store.set(KEY, JSON.stringify(o)); } catch {}
    };
    let seq = 0;
    const draw = async () => {
      read();
      const n = ++seq;
      const [l1, l2] = o.lang.split("+");
      const [tr, tr2] = await Promise.all([translator(l1), l2 ? translator(l2) : null]);
      if (n !== seq) return;
      const g = geometry(o);
      const style = css(o, g);
      const f = $("#mpFrame", m.el);
      let doc = f.contentDocument;
      // 先写只有样式的空页，在里面量高度、分页，再写最终的页
      doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body></body></html>`); doc.close();
      const pages = paginate(doc, o, g, blocks(data, o, tr, tr2), headerHtml(l1), footerHtml(data, o, tr, tr2));
      html = `<!doctype html><html><head><meta charset="utf-8"><title>Menu</title><style>${style}</style></head><body>${pages}</body></html>`;
      geo = g;
      doc = f.contentDocument;
      doc.open(); doc.write(html); doc.close();
      // 预览：整张纸缩小到预览框的宽度（打印时不缩）
      doc.documentElement.style.zoom = String(Math.min(1, (f.clientWidth - 8) / (g.w * MM + 28)));
      const np = doc.querySelectorAll(".page").length;
      $("#mpPages", m.el).textContent = `共 ${np} 页（${o.paper} ${o.land ? "横版" : "竖版"}）`;
    };
    $("#mpTpl", m.el).onclick = (e) => { const b = e.target.closest("[data-tpl]"); if (!b) return; m.el.querySelectorAll("#mpTpl button").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
    m.el.addEventListener("change", (e) => { if (e.target.closest(".stk-opts")) draw(); });
    draw().catch((e) => toast(e.message, "error"));
  }

  document.head.insertAdjacentHTML("beforeend", `<style>
    .mp-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; margin-top: 6px; }
    .mp-tpls button { display: grid; justify-items: center; gap: 4px; padding: 6px 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); cursor: pointer; font: inherit; font-size: 13px; color: var(--text); }
    .mp-tpls button.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); font-weight: 600; }
    .mp-tpls i { display: block; width: 34px; height: 44px; border: 1.5px solid; border-radius: 4px; position: relative; overflow: hidden; }
    .mp-tpls s { position: absolute; left: 5px; right: 5px; top: 6px; height: 5px; border-radius: 2px; }
    .mp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .mp-two label { display: grid; gap: 4px; }
  </style>`);

  window.MenuPrint = { open, T, TEMPLATES };
})();
