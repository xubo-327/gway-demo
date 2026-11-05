// 点餐页 / 网上商城主题（店主 10-26：把一体版网站的 10 套店面主题搬到扫码点餐页）。
// 10 套主题和网站 gway-site-builder src/lib/store-theme.ts、一体版 cashier-yitiban public/site-theme.js 一样；
// 选的存在设置 site_theme（"" = 默认，就是以前的样子），/api/public/info 带给 order.html。
// 这个文件只管两件事（不依赖别的脚本，order.html 和收银设置页 cashier.html 都加载）：
//   1. 颜色：按系统颜色算出这套主题要的一族颜色（照搬网站 src/lib/store-colors.ts，按这套主题的底色压对比度；夜幕暗底文字对比度 ≥ 4.5）；
//   2. order.html 上把主题挂到根节点 <html data-store-theme="键">，样子全在 store-theme.css 里（字体也在那里，只有选了那套主题才会下载）。
(function () {
  // [键, 中文名, 法文名, 适合的店 + 特点, 是否渐变系, 底色们, 暗底（只有夜幕）]
  var THEMES = [
    ["chaleur", "暖意", "Chaleur", "综合百货、社区小店。主色顶栏，圆润亲切。", false, ["#f4f2ee", "#ffffff", "#ebe7df"]],
    ["galerie", "画廊", "Galerie", "精品、服饰、香氛。大留白、细线、衬线标题。", false, ["#ffffff", "#f2f2ef"]],
    ["pop", "潮玩", "Pop", "潮牌、玩具、文创。粗描边、大圆角、贴纸。", false, ["#ffffff"]],
    ["atelier", "工坊", "Atelier", "手作、有机、家居。大地色、拱形图、缝线边。", false, ["#e8e6db", "#f6f5ef", "#dcd9cb"]],
    ["module", "模块", "Module", "数码、配件、工具。紧凑网格、等宽字细节。", false, ["#eceef1", "#ffffff", "#e1e4e9"]],
    ["marche", "市集", "Marché", "超市、折扣、批发。大价签、促销板、高密度。", false, ["#f1f1ef", "#ffffff", "#e6e6e2"]],
    ["aurore", "极光", "Aurore", "美妆、个护、生活方式。浅底弥散光斑、渐变大字。", true, ["#f6f6fa", "#ffffff", "#eeeef5"]],
    ["nuit", "夜幕", "Nuit", "电子、潮玩、夜间品牌。暗底霓虹、渐变描边。", true, ["#0f1016", "#181a23", "#13141c"], "#181a23"],
    ["verre", "玻璃", "Verre", "饰品、礼品、新潮小店。彩色底、毛玻璃、柔光球。", true, ["#eef0f6", "#ffffff", "#e4e6ee"]],
    ["affiche", "海报", "Affiche", "服饰、球鞋、独立品牌。颗粒渐变海报、超宽大字。", true, ["#f3f3f1", "#ffffff", "#e8e8e5"]],
  ];
  var KEYS = THEMES.map(function (t) { return t[0]; });
  var byKey = function (k) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === k) return THEMES[i]; return null; };

  // ---- 系统颜色 → 主题的一族颜色（照搬 store-colors.ts 的 storeColors / storeColorVars）----
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) { return "#" + c.map(function (v) { return ("0" + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(""); }
  function mixW(h, t) { return hex(rgb(h).map(function (v) { return v * t + 255 * (1 - t); })); }
  function mix(a, b, t) { var y = rgb(b); return hex(rgb(a).map(function (v, i) { return v * t + y[i] * (1 - t); })); }
  function darken(h, k) { return hex(rgb(h).map(function (v) { return v * (1 - k); })); }
  function lum(h) { var a = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function minC(c, on) { return Math.min.apply(null, on.map(function (b) { return contrast(c, b); })); }
  // 一直调到对 on 里每个底色的对比度都 ≥ ratio：dir < 0 压暗，> 0 提亮
  function reach(h, on, ratio, dir) {
    var list = Array.isArray(on) ? on : [on], c = h;
    for (var i = 0; i < 80 && minC(c, list) < ratio; i++) c = dir < 0 ? darken(c, 0.05) : mixW(c, 0.93);
    return c;
  }
  function hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; }
    return [h, s, l];
  }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var a = s * Math.min(l, 1 - l), f = function (n) { var k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return hex([f(0), f(8), f(4)].map(function (v) { return v * 255; }));
  }
  function shift(h, d) { var x = hsl(rgb(h)); return hsl2hex(x[0] + d, x[1], x[2]); }
  function amber(c) { var x = hsl(rgb(c)); return x[0] > 40 && x[0] < 85 ? hsl2hex(30, x[1], x[2]) : c; } // 黄色压暗会发绿，先转成琥珀
  function deep(c) { return reach(amber(c), "#ffffff", 4.6, -1); }
  function darkText(c, on) { return minC(c, on) >= 4.6 ? c : reach(amber(c), on, 4.6, -1); }

  // accent2 = 渐变第二色（收银这边没有，按色相转 35° 自动配）
  function vars(accent, accent2, key) {
    var HEX = /^#[0-9a-f]{6}$/i, t = byKey(key) || THEMES[0], surface = t[5], tintBase = t[6];
    var p = HEX.test(accent || "") ? accent.toLowerCase() : "#c2410c", q = HEX.test(accent2 || "") ? accent2.toLowerCase() : null;
    var dark = Boolean(tintBase), pLight = mixW(p, 0.1), pDark = darken(p, 0.22);
    var onP = contrast(p, "#ffffff") >= contrast(p, "#1f1d1a") ? "#ffffff" : "#1f1d1a";
    var art = reach(p, "#ffffff", 1.6, -1);
    var tint = dark ? mix(p, tintBase, 0.26) : pLight, on = surface.concat([tint]);
    var accentText = dark ? reach(reach(p, tintBase, 6, 1), on, 4.6, 1) : darkText(p, on);
    var g2 = q || shift(p, 35), g3 = q ? mix(p, q, 0.5) : shift(p, -35);
    return {
      "--p": p, "--p-light": pLight, "--p-dark": pDark, "--on-p": onP, "--ph-1": mixW(art, 0.16), "--ph-2": mixW(art, 0.38), "--ph-c": art, "--ph-d": darken(art, 0.22),
      "--p-ring": "rgba(" + rgb(p).join(",") + ",.35)", "--p-edge": minC(p, surface) < 1.35 ? "rgba(0,0,0,.22)" : "transparent", "--p-tint": tint,
      "--sf-accent": accentText, "--sf-accent-ink": dark ? accentText : darkText(pDark, on), "--g1": p, "--g2": g2, "--g3": g3, "--g1d": deep(p), "--g2d": deep(g2), "--g3d": deep(g3),
    };
  }

  // ---- order.html：把主题挂到根节点 ----
  var NAMES = Object.keys(vars("#c2410c", null, "chaleur"));
  var cur = "";
  function paint() {
    var root = document.documentElement;
    if (!cur) { root.removeAttribute("data-store-theme"); NAMES.forEach(function (n) { root.style.removeProperty(n); }); return; }
    var v = vars((window.POS_THEME && window.POS_THEME.color) || "#c2410c", null, cur);
    NAMES.forEach(function (n) { root.style.setProperty(n, v[n]); });
    root.setAttribute("data-store-theme", cur);
  }
  // 设主题（"" / 不认识的 = 默认）。不记在手机上：店里换了主题，顾客打开就是新的，不会先闪一下旧主题、多下载旧主题的字体
  // （order.html 先拿到店铺信息再画页面，不会先看到默认样子）
  function set(key) {
    cur = KEYS.indexOf(key) >= 0 ? key : "";
    paint();
  }
  // order.html 顾客页调用一次：系统颜色变了（theme.js 的 applyTheme）主题的颜色跟着重算
  function mount() {
    var orig = window.applyTheme;
    if (orig && !orig.storeTheme) {
      window.applyTheme = function (t) { orig(t); paint(); };
      window.applyTheme.storeTheme = true;
    }
  }
  window.StoreTheme = { THEMES: THEMES, KEYS: KEYS, vars: vars, set: set, mount: mount, current: function () { return cur; } };
})();
