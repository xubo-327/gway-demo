// 一键生成好看的桌贴（设置 → 日常经营 → 扫码点餐 → 🎨 生成桌贴）：选款式、每张纸几个、提示语，先预览再打印。
// 也给「其他二维码」（网上预订、平板、老板手机、WiFi）用：Stickers.open([{ title, sub, src }])
(() => {
  const STYLES = [
    ["classic", "经典（顶部色条）"],
    ["vivid", "醒目（彩色底）"],
    ["minimal", "简约（白底细框）"],
    ["tent", "桌牌（对折立在桌上）"],
  ];
  const PER_PAGE = [[1, "一张 A4 一个（大）"], [2, "一张 A4 两个"], [4, "一张 A4 四个"], [6, "一张 A4 六个（小）"]];
  // ---------- 桌牌语言（v1.25.1）：印出来的字按这里选的语言，和收银台界面是什么语言无关 ----------
  // 这些是印在纸上给顾客看的固定文字，每种语言单独写好（不走界面翻译）。
  // 桌贴、店内外带码：顾客在店里点、到前台付款（店内码不走网上付款）；网上预订码：网上下单、到店自取
  const T = {
    fr: { scan: "Scannez pour commander", sub: "Sans application · Commandez puis payez au comptoir", subOnline: "Sans application · Commandez en ligne, retrait au restaurant",
      table: "Table", takeaway: "À emporter", preorder: "Commande en ligne", wifi: "WiFi", pass: "Mot de passe", wifiSub: "Scannez pour vous connecter", kitchen: "Écran cuisine", boss: "Espace gérant" },
    en: { scan: "Scan to order", sub: "No app needed · Order, then pay at the counter", subOnline: "No app needed · Order online, pick up at the restaurant",
      table: "Table", takeaway: "Takeaway", preorder: "Order online", wifi: "WiFi", pass: "Password", wifiSub: "Scan to connect", kitchen: "Kitchen screen", boss: "Manager" },
    es: { scan: "Escanee para pedir", sub: "Sin aplicación · Pida y pague en el mostrador", subOnline: "Sin aplicación · Pida en línea y recoja en el restaurante",
      table: "Mesa", takeaway: "Para llevar", preorder: "Pedido en línea", wifi: "WiFi", pass: "Contraseña", wifiSub: "Escanee para conectarse", kitchen: "Pantalla de cocina", boss: "Gerente" },
    pt: { scan: "Leia para pedir", sub: "Sem aplicação · Peça e pague no balcão", subOnline: "Sem aplicação · Peça online e levante no restaurante",
      table: "Mesa", takeaway: "Para levar", preorder: "Pedido online", wifi: "Wi-Fi", pass: "Senha", wifiSub: "Leia para se ligar", kitchen: "Ecrã da cozinha", boss: "Gerente" },
    zh: { scan: "扫码点餐", sub: "不用下载 App · 下单后到前台付款", subOnline: "不用下载 App · 网上下单，到店自取",
      table: "桌", takeaway: "外带", preorder: "网上预订", wifi: "WiFi", pass: "密码", wifiSub: "扫码连 WiFi", kitchen: "厨房显示屏", boss: "老板查看" },
  };
  const ALL = ["fr", "en", "es", "pt", "zh"];
  const PRESETS = [["fr", "全法语 Français"], ["en", "English"], ["es", "Español"], ["pt", "Português"], ["zh", "中文"], ["dual", "双语：法语 + 第二种语言"], ["multi", "多语：法 / 英 / 西 / 葡 / 中"], ["custom", "自定义（自己写提示语）"]];
  const SECONDS = [["en", "English"], ["es", "Español"], ["pt", "Português"], ["zh", "中文"]];
  const langsOf = (o) => (o.preset === "dual" ? ["fr", o.second || "en"] : o.preset === "multi" ? ALL : ALL.includes(o.preset) ? [o.preset] : o.base || ["fr"]);
  const uniq = (a) => [...new Set(a)];
  // 选好的语言 → 提示语（一行一种语言，第一行最大）、小字说明（多语时只印法语和英语，不然太长）
  const presetLines = (langs) => uniq(langs.map((l) => T[l].scan)).join("\n");
  const presetSub = (langs, online) => uniq((langs.length > 2 ? langs.slice(0, 2) : langs).map((l) => T[l][online ? "subOnline" : "sub"])).join("\n");
  // 以前（1.25.0 及更早）的默认提示语：存的是这个就当作没改过，用新的默认语言
  const OLD_LINES = ["Scannez pour commander", "Scan to order", T.zh.scan].join("\n");
  const OLD_SUB = "Sans application · Commandez et payez au comptoir · 下单后到前台付款";
  const KEY = "sticker_opts";
  // 默认：顾客页的默认语言（法国 / 圭亚那的店一般是法语 → 全法语）
  function defaultPreset() {
    const l = (S.settings || {}).customer_lang || "fr";
    return ALL.includes(l) ? l : "fr";
  }

  function load() {
    // store 存的是字符串：以前直接存对象（变成 "[object Object]"），选项其实没记住；v1.25.1 起存 JSON
    let o = {};
    try { o = JSON.parse(store.get(KEY) || "{}") || {}; } catch {}
    if (typeof o !== "object") o = {};
    let preset = o.preset;
    if (!preset) preset = o.lines && (o.lines !== OLD_LINES || (o.sub != null && o.sub !== OLD_SUB)) ? "custom" : defaultPreset();
    const out = { style: o.style || "classic", per: o.per || 4, preset, second: o.second || "en", base: o.base || ["fr", "zh"], wifi: o.wifi ?? true, logo: o.logo === false ? "none" : o.logo === true || o.logo == null ? "auto" : o.logo };
    if (preset === "custom") { out.lines = o.lines || OLD_LINES; out.sub = o.sub ?? OLD_SUB; }
    else { out.lines = presetLines(langsOf(out)); out.sub = presetSub(langsOf(out)); }
    return out;
  }
  // 每张的大字、小字：按 kind（table / takeaway / preorder / wifi / kitchen / boss）用选好的语言；没有 kind 的照原样
  function labelsFor(it, langs) {
    const t = langs.map((l) => T[l]);
    const rest = (k) => uniq(t.slice(1).map((x) => x[k])).filter((x) => x !== t[0][k]).join(" · ");
    switch (it.kind) {
      case "table": return { title: it.title, sub: uniq(t.map((x) => x.table)).join(" · ") };
      case "takeaway": return { title: t[0].takeaway, sub: rest("takeaway") };
      case "preorder": return { title: t[0].preorder, sub: rest("preorder"), online: true };
      case "wifi": return { title: t[0].wifi, sub: it.ssid || "", lines: uniq(t.map((x) => x.wifiSub)), noSub: true };
      case "kitchen": return { title: t[0].kitchen, sub: rest("kitchen"), lines: [], noSub: true };
      case "boss": return { title: t[0].boss, sub: rest("boss"), lines: [], noSub: true };
      default: return { title: it.title, sub: it.sub || "" };
    }
  }

  function css(o, color) {
    // 店主 10-09：手机打印网页时不完整 → 整套桌贴改成直接生成 PDF（sheetPdf）；尺寸也留出余量（A4 / Letter 都放得下）
    const sizes = { 1: ["190mm", "270mm", "90mm", "64px"], 2: ["190mm", "132mm", "62mm", "44px"], 4: ["93mm", "132mm", "56mm", "38px"], 6: ["93mm", "86mm", "40mm", "28px"] }[o.style === "tent" ? 2 : o.per];
    const [w, h, qr, big] = sizes;
    return `
      @page { size: A4; margin: 8mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Segoe UI", Arial, "Microsoft YaHei", sans-serif; color: #1f1d1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { display: flex; flex-wrap: wrap; gap: 4mm; justify-content: center; }
      .st { width: ${w}; height: ${h}; border-radius: 6mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; page-break-inside: avoid; position: relative; }
      .st .qr { width: ${qr}; height: ${qr}; background: #fff; padding: 2.5mm; border-radius: 4mm; }
      .st .qr img { width: 100%; height: 100%; display: block; object-fit: contain; }
      /* 字多（五种语言 + WiFi）放不下时：二维码稍微缩小，不让下面的字被截掉 */
      .st .qr { flex: 0 1 auto; min-height: calc(${qr} * .7); }
      @supports (aspect-ratio: 1) { .st .qr { width: auto; aspect-ratio: 1; } }
      .st .no { font-size: ${big}; font-weight: 800; line-height: 1; letter-spacing: .5px; }
      .st .no small { display: block; font-size: 30%; font-weight: 600; letter-spacing: 2px; opacity: .75; margin-top: 1mm; text-transform: uppercase; }
      .st .lines { line-height: 1.25; }
      .st .lines div:first-child { font-size: calc(${big} * .42); font-weight: 800; }
      .st .lines div { font-size: calc(${big} * .3); font-weight: 600; }
      .st .sub { font-size: calc(${big} * .22); opacity: .8; padding: 0 4mm; }
      .st .sub .sub2 { font-size: 85%; opacity: .85; }
      .st .store { font-weight: 700; font-size: calc(${big} * .32); display: flex; align-items: center; gap: 2mm; justify-content: center; }
      .st .store img { height: calc(${big} * .6); max-width: 30mm; object-fit: contain; }
      .st .store img.round { width: calc(${big} * .9); height: calc(${big} * .9); max-width: none; border-radius: 50%; object-fit: cover; background: #fff; box-shadow: 0 0 0 .6mm #fff; }
      .st .store img.strip { height: calc(${big} * .7); max-width: 60mm; }
      .st .store.only-logo span { display: none; }
      .st .wifi { font-size: calc(${big} * .22); padding: 1mm 3mm; border-radius: 99px; }
      .st .spacer { flex: 1; }
      /* 经典：顶部主色条 */
      .classic { border: .4mm solid ${color}; background: #fff; }
      .classic .head { width: 100%; background: ${color}; color: #fff; padding: 3mm 2mm; }
      .classic .no { color: ${color}; margin-top: 3mm; }
      .classic .qr { margin: 3mm 0; border: .5mm solid ${color}; }
      .classic .wifi { background: #f4f2ee; margin-bottom: 3mm; }
      /* 醒目：彩色渐变底，白色二维码卡 */
      .vivid { background: linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 55%, #000)); color: #fff; padding-top: 3mm; }
      .vivid .qr { margin: 3mm 0; box-shadow: 0 2mm 5mm rgba(0,0,0,.25); }
      .vivid .wifi { background: rgba(255,255,255,.18); margin-bottom: 3mm; }
      .vivid .lines div:first-child::before { content: "📱 "; }
      /* 简约：白底细框 */
      .minimal { border: .3mm solid #bbb; background: #fff; padding-top: 3mm; }
      .minimal .no { margin: 1mm 0; }
      .minimal .qr { margin: 2mm 0; }
      .minimal .wifi { border: .3mm dashed #aaa; margin-bottom: 3mm; }
      /* 桌牌：上下两面，上面倒过来，对折后两边都能看 */
      .tent { width: 190mm; height: 270mm; flex-direction: column; border: .3mm dashed #999; border-radius: 0; }
      .tent .half { width: 100%; height: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; background: #fff; }
      .tent .half.top { transform: rotate(180deg); border-bottom: .3mm dashed #999; }
      .tent .bar { width: 100%; background: ${color}; color: #fff; padding: 2mm; }
      .tent .no { color: ${color}; }
      @media screen { body { background: #e9e6e1; padding: 6mm; } .sheet { gap: 6mm; } }`;
  }

  function oneSticker(it0, o, info) {
    const langs = langsOf(o);
    const lb = labelsFor(it0, langs);
    const it = { ...it0, title: lb.title, sub: lb.sub };
    // 自定义：提示语、小字说明照店长写的；选了语言：按语言（网上预订的码用「网上下单、到店自取」）
    const custom = o.preset === "custom";
    const lines = lb.lines && !custom ? lb.lines : o.lines.split("\n").map((s) => s.trim()).filter(Boolean);
    const subText = lb.noSub && !custom ? "" : custom ? o.sub : presetSub(langs, lb.online);
    const t = langs.map((l) => T[l]);
    const passLabel = uniq(t.slice(0, 2).map((x) => x.pass)).join(" / ");
    const lg = info.logos[o.logo === "auto" ? info.auto : o.logo];
    const logo = lg ? `<img src="${esc(lg.src)}" class="${lg.cls}" alt="">` : "";
    // 横条 logo 本身一般就带店名：不再重复印店名
    const store_ = `<div class="store${lg && lg.cls === "strip" ? " only-logo" : ""}">${logo}<span>${esc(info.name)}</span></div>`;
    const wifi = o.wifi && info.wifi && it0.kind !== "wifi" ? `<div class="wifi">📶 ${esc(t[0].wifi)} : <b>${esc(info.wifi.ssid)}</b>${info.wifi.pass ? ` · ${esc(passLabel)} : ${esc(info.wifi.pass)}` : ""}</div>` : "";
    const body = `<div class="no">${esc(it.title)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</div>
      <div class="qr"><img src="${esc(it.src)}" alt=""></div>
      <div class="lines">${lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      ${subText ? `<div class="sub">${subText.split("\n").map((s) => s.trim()).filter(Boolean).map((s, i) => `<div class="${i ? "sub2" : ""}">${esc(s)}</div>`).join("")}</div>` : ""}`;
    if (o.style === "tent") {
      const half = (cls) => `<div class="half ${cls}"><div class="bar">${store_}</div>${body}${wifi}</div>`;
      return `<div class="st tent">${half("top")}${half("")}</div>`;
    }
    if (o.style === "classic") return `<div class="st classic"><div class="head">${store_}</div>${body}<div class="spacer"></div>${wifi}</div>`;
    return `<div class="st ${o.style}">${store_}${body}<div class="spacer"></div>${wifi}</div>`;
  }

  function pageHtml(items, o) {
    const st = S.settings || {};
    const info = {
      name: st.store_name || "",
      // 三种 logo：圆形（商城展示 → 圆形 logo）、横条（商城展示 → 横条 logo）、小票 LOGO（小票模板里的黑白 LOGO）
      logos: {
        round: st.mall_logo ? { src: location.origin + st.mall_logo, cls: "round" } : null,
        strip: st.store_logo ? { src: location.origin + st.store_logo, cls: "strip" } : null,
        ticket: st.logo?.src ? { src: location.origin + st.logo.src, cls: "" } : null,
      },
      auto: st.mall_logo ? "round" : st.store_logo ? "strip" : st.logo?.src ? "ticket" : null,
      wifi: st.wifi_ssid ? { ssid: st.wifi_ssid, pass: st.wifi_password } : null,
    };
    const color = window.POS_THEME?.color || "#c2410c";
    return `<!doctype html><html lang="${langsOf(o)[0]}"><head><meta charset="utf-8"><title>QR</title><style>${css(o, color)}</style></head>
      <body><div class="sheet">${items.map((it) => oneSticker(it, o, info)).join("")}</div></body></html>`;
  }

  // ---------- 打印 / 存 PDF / 发到手机（店主 10-09：安卓收银机不能快速把桌贴二维码传出去） ----------
  // 页面里的图片（二维码、logo）都换成内嵌的 data:，这样发到手机、交给安卓系统打印都不用再联网取图
  const toDataUrl = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });
  // logo 这类大图（同一张会在每张桌贴上重复）先缩到 360 像素以内，整套桌贴才不会太大（复查 1.28 第 1 条）
  async function shrink(blob) {
    if (blob.type === "image/svg+xml" || blob.size < 60 * 1024) return toDataUrl(blob);
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const small = blob.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.85) : c.toDataURL("image/png");
      const orig = await toDataUrl(blob);
      return small.length < orig.length ? small : orig; // 缩了反而更大（本来就小）→ 用原图
    } catch {
      return toDataUrl(blob); // 浏览器解不开这张图：照原样放进去
    } finally { URL.revokeObjectURL(url); }
  }
  // 返回 { html, failed }：取不到的图片去掉地址（地址里带临时凭证，不能留在发到手机的页面里），failed 是取不到的张数
  async function inlineImages(html, { dedupe = true } = {}) {
    const srcs = [...new Set([...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:")))];
    const map = new Map();
    let failed = 0;
    for (const raw of srcs) {
      const u = raw.replace(/&amp;/g, "&");
      try { const r = await fetch(u); if (r.ok) map.set(raw, await shrink(await r.blob())); else failed++; } catch { failed++; }
    }
    let out = html.replace(/src="([^"]+)"/g, (m, u) => (u.startsWith("data:") ? m : `src="${map.get(u) || ""}"`));
    // 同一张图（logo）在每张桌贴上都有：只在页面里放一份，各处用 CSS 引用它，整套桌贴的大小不随桌数变大
    const seen = new Map();
    for (const m of out.matchAll(/src="(data:[^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    const shared = [...seen].filter(([d, n]) => n > 1 && d.length > 2000).map(([d]) => d);
    if (dedupe && shared.length && /<\/head>/i.test(out)) {
      const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      const css = shared.map((d, i) => `img[data-dimg="${i}"]{content:url("${d}")}`).join("");
      shared.forEach((d, i) => { out = out.split(`src="${d}"`).join(`src="${BLANK}" data-dimg="${i}"`); });
      out = out.replace(/<\/head>/i, `<style>${css}</style></head>`);
    }
    return { html: out, failed };
  }
  // 每个二维码单独一张 PNG（手机上长按存相册、发给打印店）：SVG 画到画布上，下面印桌号（存进相册后也认得出是哪一桌）
  async function qrPng(src, title) {
    const svg = await (await fetch(src.replace(/&amp;/g, "&"))).text();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const c = document.createElement("canvas");
      c.width = 720; c.height = title ? 820 : 720;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 24, 24, 672, 672);
      if (title) {
        g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = "bold 64px system-ui, sans-serif";
        g.fillText(String(title).slice(0, 24), 360, 760, 680);
      }
      return c.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- 整套桌贴直接生成 PDF（店主 10-09：手机浏览器打印网页时下半截、右边被截掉）----------
  // 手机浏览器打印不按网页指定的 A4 和边距走，所以不让手机打印网页：在收银台这边按「每张纸几个」逐页排好，
  // 每页画成一张 A4 图片（SVG foreignObject → 画布 → JPEG），拼成 PDF。手机、电脑打开都是完整的 A4 页面
  const A4 = { w: 794, h: 1123 }; // 210×297mm，96dpi 下的 CSS 像素
  const PDF_SCALE = 1.6; // 约 150dpi：打印够清楚，文件不会太大
  async function pageImage(pageHtmlStr) {
    const doc = new DOMParser().parseFromString(pageHtmlStr, "text/html");
    // 屏幕预览用的样式（灰底、间距）和 @page 去掉，按打印排版
    // SVG 里没有 body：body 上的字体、颜色改到外面这层 div（.pg）上
    const css = [...doc.querySelectorAll("style")].map((x) => x.textContent).join("\n")
      .replace(/@media screen\s*\{[\s\S]*$/, "").replace(/@page\s*\{[^}]*\}/g, "").replace(/(^|\})\s*body\s*\{/g, "$1 .pg {");
    const body = new XMLSerializer().serializeToString(doc.body).replace(/^<body[^>]*>|<\/body>$/g, "");
    const c = document.createElement("canvas");
    c.width = Math.round(A4.w * PDF_SCALE); c.height = Math.round(A4.h * PDF_SCALE);
    // SVG 直接按画布大小画（viewBox 缩放），文字、二维码边缘是清楚的，不是 96dpi 放大
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${A4.w} ${A4.h}"><foreignObject width="${A4.w}" height="${A4.h}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" class="pg"><style>${css} .pg { width: 210mm; height: 297mm; padding: 8mm; box-sizing: border-box; background: #fff; overflow: hidden; }</style>${body}</div></foreignObject></svg>`;
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("page_render_failed")); i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const jpg = c.toDataURL("image/jpeg", 0.88);
    return { w: c.width, h: c.height, bytes: Uint8Array.from(atob(jpg.split(",")[1]), (ch) => ch.charCodeAt(0)) };
  }
  // 最简单的 PDF：每页一张 A4 大小的 JPEG
  function buildPdf(pages) {
    const enc = new TextEncoder();
    const parts = []; const offs = []; let len = 0;
    const add = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); body(); add("\nendobj\n"); };
    add("%PDF-1.4\n");
    const n = pages.length;
    obj(1, () => add("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => add(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`));
    pages.forEach((pg, i) => {
      const P = 3 + i * 3, I = P + 1, C = P + 2;
      const W = pg.pw || 595.28, H = pg.ph || 841.89; // 页面大小（点）：桌贴都是 A4；打印菜单还有 A3、横版
      obj(P, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${I} 0 R >> >> /Contents ${C} 0 R >>`));
      obj(I, () => { add(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`); add(pg.bytes); add("\nendstream"); });
      const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(C, () => add(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    });
    const total = 3 + n * 3;
    const xref = len;
    add(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let k = 1; k < total; k++) add(`${String(offs[k]).padStart(10, "0")} 00000 n \n`);
    add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let p = 0;
    for (const b of parts) { out.set(b, p); p += b.length; }
    return out;
  }
  // 整套桌贴 PDF：按「每张纸几个」分页（桌牌一页一个）；失败（很旧的浏览器）→ null，调用的地方退回网页
  async function sheetPdf(items, o) {
    try {
      const per = o.style === "tent" ? 1 : o.per;
      const pages = []; let failed = 0;
      for (let i = 0; i < items.length; i += per) {
        const inl = await inlineImages(pageHtml(items.slice(i, i + per), o), { dedupe: false });
        failed = Math.max(failed, inl.failed);
        pages.push(await pageImage(inl.html));
      }
      if (!pages.length) return null;
      const pdf = buildPdf(pages);
      pdf.failed = failed; // logo 等没取到的张数（每页都一样，取最多的）
      return pdf;
    } catch (e) { console.warn("[sticker pdf]", e); return null; }
  }
  const uiLang = () => ({ "zh-CN": "zh", fr: "fr", en: "en", es: "es", pt: "pt" })[document.documentElement.lang] || "zh";

  // 安卓收银机：交给安卓系统打印（系统打印窗口里可以「另存为 PDF」，或者选 WiFi 打印机）；电脑：浏览器打印（也能另存为 PDF）
  // 生成 PDF 要几秒（桌子多、收银机慢时更久）：这期间再点按钮不重复生成
  let busy = false;
  const once = (fn) => async (...a) => {
    if (busy) return toast("正在准备…");
    busy = true;
    try { return await fn(...a); } finally { busy = false; }
  };
  async function printSheet(m, html, items, o) {
    if (inAndroidApp()) { // 平板收银机 / 服务员手机 App 都交给系统打印
      const t0 = toast("正在准备…");
      try {
        // 先把排好版的 PDF 交给安卓系统打印（安卓不再自己排网页，不会截掉）；旧版 App 没有 printPdf → 退回网页打印
        const pdf = await sheetPdf(items, o);
        if (pdf) {
          if (pdf.failed) toast(`有 ${pdf.failed} 张图片没取到（logo 等）`, "error");
          try { await window.PosApp.call("printPdf", { data: b64(pdf), name: "QR" }); return; }
          catch (e) { if (!/不支持/.test(e.message)) throw e; }
        }
        const inl = await inlineImages(html);
        if (inl.failed) toast(`有 ${inl.failed} 张图片没取到，先打印其余的`, "error");
        await window.PosApp.call("printHtml", { html: inl.html, name: "QR" });
        return;
      } catch (e) {
        if (!/不支持/.test(e.message)) return toast("打印没有打开：" + e.message, "error");
        // 旧版 App 没有系统打印：网页打印在安卓里没有反应，提示更新或者发到手机
        return toast(IS_POS_HOST ? "这个版本的 App 还不能打印桌贴：请更新收银系统，或者点「📱 发到手机」" : "这个版本的手机 App 还不能打印：请更新 App", "error", 8000);
      } finally { t0?.remove?.(); }
    }
    setTimeout(() => $("#stkFrame", m.el)?.contentWindow.print(), 400);
  }

  // ---------- 💾 保存到本地（店主 10-09）：每桌一张二维码图片（下面印桌号）+ 整套桌贴网页（浏览器打开就是排好版的，可以打印 / 存 PDF） ----------
  // 电脑（Edge）：选一个文件夹，在里面建「桌贴-日期」；安卓收银机：存进「下载/餐馆收银」；都不行（平板浏览器、旧 App）：浏览器下载
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const safeName = (t) => String(t || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 40) || "QR";
  async function saveLocal(items, html, o) {
    // 电脑：一点按钮就先选文件夹（浏览器只在点按钮后几秒内允许打开选文件夹窗口），选好再生成文件
    let dir = null;
    if (!window.PosApp?.info?.host && window.showDirectoryPicker && window.isSecureContext) {
      try { dir = await window.showDirectoryPicker({ mode: "readwrite", id: "pos-stickers", startIn: "downloads" }); } catch (e) { if (e.name === "AbortError") return; }
    }
    const t0 = toast("正在准备…");
    try {
      const now = new Date(); // 本地日期（晚上不会变成第二天）
      const day = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
      // 文件名跟着收银台界面的语言（法语店是 Stickers de table-1009），不用中文给外国店员
      const W = safeName(window.I18N?.t ? window.I18N.t("桌贴") : "桌贴");
      // 整套桌贴存成排好版的 A4 PDF；很旧的浏览器生成不了 PDF 就存网页
      const pdf = await sheetPdf(items, o);
      const inl = pdf ? { failed: pdf.failed } : await inlineImages(html);
      const files = [pdf ? { name: `${W}.pdf`, bytes: pdf } : { name: `${W}.html`, bytes: new TextEncoder().encode(inl.html) }];
      const used = new Set();
      for (const it of items) {
        try {
          const png = await qrPng(it.src, it.title);
          let n = `QR-${safeName(it.title)}`;
          for (let k = 2; used.has(n); k++) n = `QR-${safeName(it.title)}-${k}`;
          used.add(n);
          files.push({ name: `${n}.png`, bytes: Uint8Array.from(atob(png.split(",")[1]), (c) => c.charCodeAt(0)) });
        } catch {}
      }
      const folder = `${W}-${day}`;
      // 安卓收银机 App：直接存进「下载/餐馆收银」（文件名前面加「桌贴1009_」放在一起）
      if (window.PosApp?.info?.host) {
        try {
          let where = "";
          for (const f of files) where = await window.PosApp.call("saveFile", { name: `${W}${day}_${f.name}`, data: b64(f.bytes) });
          toast(`已保存 ${files.length} 个文件到「${String(where).replace(/\/[^/]*$/, "")}」`, "success", 8000);
          if (inl.failed) toast(`有 ${inl.failed} 张图片没取到（logo 等）`, "error");
          return;
        } catch (e) { if (!/不支持/.test(e.message)) return toast("保存失败：" + e.message, "error"); }
      }
      // 电脑：选好的文件夹里建「桌贴-1009」
      if (dir) {
        const sub = await dir.getDirectoryHandle(folder, { create: true });
        for (const f of files) {
          const w = await (await sub.getFileHandle(f.name, { create: true })).createWritable();
          await w.write(f.bytes); await w.close();
        }
        toast(`已保存 ${files.length} 个文件到「${dir.name}/${folder}」`, "success", 8000);
        if (inl.failed) toast(`有 ${inl.failed} 张图片没取到（logo 等）`, "error");
        return;
      }
      // 其他：浏览器下载（浏览器可能会问一次「允许下载多个文件」）
      for (const f of files) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([f.bytes], { type: f.name.endsWith(".png") ? "image/png" : f.name.endsWith(".pdf") ? "application/pdf" : "text/html" }));
        a.download = `${folder}_${f.name}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        await new Promise((r) => setTimeout(r, 150));
      }
      toast(`已下载 ${files.length} 个文件（浏览器的「下载」文件夹）`, "success", 8000);
      if (inl.failed) toast(`有 ${inl.failed} 张图片没取到（logo 等）`, "error");
    } catch (e) { toast("保存失败：" + e.message, "error"); }
    finally { t0?.remove?.(); }
  }

  async function sendToPhone(items, html, o) {
    const t = toast("正在准备…");
    try {
      const qrs = [];
      for (const it of items) { try { qrs.push({ title: it.title, png: await qrPng(it.src, it.title) }); } catch {} }
      // 整套桌贴发排好版的 A4 PDF（手机打印网页会截掉下半截、右边）；生成不了 PDF 才发网页
      const pdf = await sheetPdf(items, o);
      let inl = pdf ? { html: "", failed: pdf.failed } : await inlineImages(html);
      const send = (sheet) => api("/api/stickers/share", { method: "POST", body: { ...sheet, qrs, lang: uiLang() } });
      let r;
      try { r = await send(pdf ? { pdf: b64(pdf) } : { html: inl.html }); } catch (e) {
        if (!pdf || (e.status !== 413 && e.status !== 400)) throw e; // 只有太大 / 被拒才退回；没登录、断网等直接报错
        // PDF 太大（桌子很多）等发不出去：退回发网页版
        inl = await inlineImages(html);
        r = await send({ html: inl.html });
      }
      if (inl.failed) toast(`有 ${inl.failed} 张图片没取到（logo 等），其余的已经发到手机`, "error");
      t?.remove?.();
      openModal({
        title: "📱 发到手机",
        body: `<div style="text-align:center">
          <div style="width:240px;margin:0 auto">${r.qr_svg}</div>
          <p>用手机扫这个码（手机要连店里的 WiFi）。</p>
          <p class="muted" style="font-size:13px">手机上长按二维码图片 →「保存图片」存到相册；「整套桌贴」是排好版的 A4 PDF，点开就能保存或打印。链接 ${r.expires_minutes} 分钟内有效。</p>
          <p class="muted" style="font-size:12px" translate="no">${esc(r.url)}</p></div>`,
        buttons: [{ label: "关闭", kind: "primary" }],
      });
    } catch (e) { t?.remove?.(); toast(e.message, "error"); }
  }

  function open(items, { title = "🎨 生成桌贴" } = {}) {
    if (!items.length) return toast("没有可以打印的二维码", "error");
    const o = load();
    let selected = new Set(items.map((_, i) => i));
    const m = openModal({
      title,
      wide: true,
      body: `<div class="stk-layout">
        <div class="stk-opts">
          <label>款式<div class="seg" id="stkStyle" style="flex-wrap:wrap">${STYLES.map(([k, l]) => `<button data-v="${k}" class="${o.style === k ? "on" : ""}">${l}</button>`).join("")}</div></label>
          <label id="stkPerL">大小<select id="stkPer">${PER_PAGE.map(([k, l]) => `<option value="${k}" ${o.per === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>桌牌语言<select id="stkLang">${PRESETS.map(([k, l]) => `<option value="${k}" ${o.preset === k ? "selected" : ""}>${l}</option>`).join("")}</select>
            <select id="stkSecond" ${o.preset === "dual" ? "" : "hidden"}>${SECONDS.map(([k, l]) => `<option value="${k}" ${o.second === k ? "selected" : ""}>+ ${l}</option>`).join("")}</select>
            <span class="muted" style="font-size:12px">印在纸上的字都用这里选的语言（提示语、说明、桌号、外带、WiFi），和收银台界面用什么语言无关。自己改了提示语就变成「自定义」。</span></label>
          <label>提示语（一行一种语言，第一行最大）<textarea id="stkLines" rows="4">${esc(o.lines)}</textarea>
            <span class="muted" style="font-size:12px">常用：${ALL.map((l) => T[l].scan).map((l) => `<a href="#" translate="no" data-addline="${esc(l)}">${esc(l)}</a>`).join(" · ")}</span></label>
          <label>小字说明<textarea id="stkSub" rows="2" maxlength="240">${esc(o.sub)}</textarea></label>
          <label class="chk"><input type="checkbox" id="stkWifi" ${o.wifi ? "checked" : ""}> 印上店里 WiFi 名称和密码${S.settings?.wifi_ssid ? "" : "（还没填 WiFi）"}</label>
          <label>印哪个 logo<select id="stkLogo">
            ${[["auto", "自动（有圆形用圆形，没有用横条）"], ["round", "圆形 logo" + (S.settings?.mall_logo ? "" : "（还没上传）")], ["strip", "横条 logo" + (S.settings?.store_logo ? "" : "（还没上传）")], ["ticket", "小票 LOGO（黑白）" + (S.settings?.logo ? "" : "（还没上传）")], ["none", "不印 logo"]]
              .map(([k, l]) => `<option value="${k}" ${o.logo === k ? "selected" : ""}>${l}</option>`).join("")}</select>
            <span class="muted" style="font-size:12px">圆形和横条 logo 在「设置 → 开发者 → Gway 商城展示」里上传。</span></label>
          ${items.length > 1 ? `<div><b>打印哪些</b> <a href="#" id="stkAll">全选</a> · <a href="#" id="stkNone">全不选</a>
            <div class="stk-pick">${items.map((it, i) => `<label class="chk"><input type="checkbox" data-i="${i}" checked> ${esc(it.title)}</label>`).join("")}</div></div>` : ""}
        </div>
        <div class="stk-preview"><iframe id="stkFrame" title="预览"></iframe></div>
      </div>`,
      buttons: [
        { label: "恢复默认提示语", onClick: () => { $("#stkLang", m.el).value = defaultPreset(); applyPreset(); draw(); return false; } },
        { label: "取消" },
        { label: "💾 保存到本地", onClick: () => { draw(); const sel = items.filter((_, i) => selected.has(i)); if (!sel.length) { toast("请先选要打印的二维码", "error"); return false; } once(saveLocal)(sel, pageHtml(sel, o), o); return false; } },
        { label: "📱 发到手机", onClick: () => { draw(); const sel = items.filter((_, i) => selected.has(i)); if (!sel.length) { toast("请先选要打印的二维码", "error"); return false; } once(sendToPhone)(sel, pageHtml(sel, o), o); return false; } },
        { label: "🖨 打印", kind: "primary", onClick: () => { draw(); const sel = items.filter((_, i) => selected.has(i)); if (!sel.length) { toast("请先选要打印的二维码", "error"); return false; } once(printSheet)(m, pageHtml(sel, o), sel, o); return false; } },
      ],
    });
    // 选了语言：提示语、小字说明换成这种语言的；自己改提示语 → 自定义（记住上一次选的语言，桌号等标签继续用它）
    const applyPreset = () => {
      const p = $("#stkLang", m.el).value;
      $("#stkSecond", m.el).hidden = p !== "dual";
      if (p === "custom") return;
      o.preset = p; o.second = $("#stkSecond", m.el).value;
      $("#stkLines", m.el).value = presetLines(langsOf(o));
      $("#stkSub", m.el).value = presetSub(langsOf(o));
    };
    const read = () => {
      o.preset = $("#stkLang", m.el).value;
      o.second = $("#stkSecond", m.el).value;
      if (o.preset !== "custom") o.base = langsOf(o);
      o.style = $("#stkStyle .on", m.el)?.dataset.v || "classic";
      o.per = Number($("#stkPer", m.el).value);
      o.lines = $("#stkLines", m.el).value;
      o.sub = $("#stkSub", m.el).value;
      o.wifi = $("#stkWifi", m.el).checked;
      o.logo = $("#stkLogo", m.el).value;
      store.set(KEY, JSON.stringify(o));
      $("#stkPerL", m.el).hidden = o.style === "tent";
    };
    const draw = () => {
      read();
      const f = $("#stkFrame", m.el);
      const doc = f.contentDocument;
      doc.open();
      doc.write(pageHtml(items.filter((_, i) => selected.has(i)), o));
      doc.close();
    };
    $("#stkStyle", m.el).onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; m.el.querySelectorAll("#stkStyle button").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
    m.el.addEventListener("input", (e) => {
      if (!e.target.closest(".stk-opts")) return;
      if (e.target.id === "stkLines" || e.target.id === "stkSub") $("#stkLang", m.el).value = "custom";
      draw();
    });
    m.el.addEventListener("change", (e) => {
      if (e.target.id === "stkLang" || e.target.id === "stkSecond") applyPreset();
      const c = e.target.closest("[data-i]");
      if (c) { c.checked ? selected.add(Number(c.dataset.i)) : selected.delete(Number(c.dataset.i)); }
      draw();
    });
    m.el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-addline]");
      if (a) { e.preventDefault(); const t = $("#stkLines", m.el); if (!t.value.split("\n").includes(a.dataset.addline)) { t.value = (t.value.trim() + "\n" + a.dataset.addline).trim(); $("#stkLang", m.el).value = "custom"; } draw(); }
      if (e.target.id === "stkAll" || e.target.id === "stkNone") {
        e.preventDefault();
        const on = e.target.id === "stkAll";
        selected = new Set(on ? items.map((_, i) => i) : []);
        m.el.querySelectorAll(".stk-pick input").forEach((x) => (x.checked = on));
        draw();
      }
    });
    draw();
  }

  document.head.insertAdjacentHTML("beforeend", `<style>
    .stk-layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 14px; }
    .stk-opts { display: grid; gap: 10px; align-content: start; max-height: 70vh; overflow: auto; }
    .stk-opts > label { display: grid; gap: 4px; }
    .stk-opts textarea { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
    .stk-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 2px 8px; margin-top: 6px; max-height: 160px; overflow: auto; }
    .stk-preview iframe { width: 100%; height: 70vh; border: 1px solid var(--line); border-radius: 10px; background: #e9e6e1; }
    @media (max-width: 800px) { .stk-layout { grid-template-columns: 1fr; } .stk-preview iframe { height: 50vh; } }
  </style>`);

  window.Stickers = { open, pageHtml, sheetPdf, inlineImages, buildPdf, TEXTS: T }; // inlineImages：打印菜单（menuPrint.js）在安卓上也用
})();
