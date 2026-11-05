// 系统颜色和花纹：店里在「设置 → 菜单与外观 → 外观与品牌 → 系统颜色和花纹」里选一次，收银台、手机点餐、平板、副屏、老板手机都跟着变。
// 先用上次记住的颜色（不会先闪一下默认的橙色），再去服务器拿最新的。
(function () {
  var KEY = "pos_theme";
  // 流畅模式（老电脑）：pos_lite = auto | on | off
  try {
    var lite = localStorage.getItem("pos_lite") || "auto";
    var weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    if (lite === "on" || (lite === "auto" && weak)) document.documentElement.classList.add("lite");
    window.POS_WEAK = Boolean(weak);
  } catch (e) {}
  var DEFAULT = { color: "#c2410c", pattern: "none" };

  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // 和白色混合：p = 0~1，越大越接近白色
  function mix(rgb, p) {
    return "rgb(" + rgb.map(function (c) { return Math.round(c + (255 - c) * p); }).join(",") + ")";
  }
  // WCAG 相对亮度和对比度
  function lum(c) {
    var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(x, y) { var a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  function darken(rgb, p) {
    return "rgb(" + rgb.map(function (c) { return Math.round(c * (1 - p)); }).join(",") + ")";
  }

  // 花纹：小块 SVG 平铺，颜色用主色、很淡
  function patternSvg(name, color, opacity) {
    var c = color.replace("#", "%23");
    var o = opacity;
    var s = {
      dots: "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='3' cy='3' r='1.6' fill='" + c + "' opacity='" + o + "'/><circle cx='14' cy='14' r='1.6' fill='" + c + "' opacity='" + o + "'/></svg>",
      grid: "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M24 0H0V24' fill='none' stroke='" + c + "' stroke-width='1' opacity='" + o + "'/></svg>",
      waves: "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='16'><path d='M0 8 Q12 0 24 8 T48 8' fill='none' stroke='" + c + "' stroke-width='1.4' opacity='" + o + "'/></svg>",
      clouds: "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='40'><path d='M10 26c0-5 5-8 9-6 1-5 8-7 12-3 3-3 9-2 10 3 4 0 6 3 5 6M36 12c2-3 7-3 8 1' fill='none' stroke='" + c + "' stroke-width='1.4' stroke-linecap='round' opacity='" + o + "'/></svg>",
      fret: "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><path d='M2 2h20v20H8V8h8v8' fill='none' stroke='" + c + "' stroke-width='1.4' opacity='" + o + "'/></svg>",
    }[name];
    return s ? 'url("data:image/svg+xml,' + s.replace(/#/g, "%23").replace(/"/g, "'") + '")' : "none";
  }

  function apply(t) {
    t = t || DEFAULT;
    var color = hexToRgb(t.color) ? t.color : DEFAULT.color;
    var rgb = hexToRgb(color);
    var root = document.documentElement.style;
    root.setProperty("--accent", color);
    root.setProperty("--accent-soft", mix(rgb, 0.9));
    root.setProperty("--accent-dark", darken(rgb, 0.22));
    root.setProperty("--topbar", darken(rgb, 0.68)); // 收银台顶栏、手机底部导航：主色压暗（深色背景上白字清楚）
    // 对比度（v1.24）：浅色主题色（黄、浅蓝……）上用深色字；主题色当文字时太浅就压暗；
    // 主题色太深（如「黑」#1f2937）时，深色购物车条上的按钮改成白底，不然看不见
    var ON_DARK = "#ffffff", ON_LIGHT = "#1f1d1a";
    var onAccent = contrast(rgb, [255, 255, 255]) >= 4.5 || contrast(rgb, [255, 255, 255]) >= contrast(rgb, [31, 29, 26]) ? ON_DARK : ON_LIGHT;
    root.setProperty("--on-accent", onAccent);
    var txt = rgb, k = 0;
    while (contrast(txt, [255, 255, 255]) < 4.5 && k < 20) { k++; txt = rgb.map(function (c) { return Math.round(c * (1 - 0.05 * k)); }); }
    root.setProperty("--accent-text", "rgb(" + txt.join(",") + ")");
    var onBar = contrast(rgb, [31, 29, 26]) >= 2;
    root.setProperty("--go-bg", onBar ? color : "#ffffff");
    root.setProperty("--go-fg", onBar ? onAccent : ON_LIGHT);
    root.setProperty("--pattern", patternSvg(t.pattern, color, 0.13));
    root.setProperty("--pattern-light", patternSvg(t.pattern, "#ffffff", 0.16));
    var meta = document.querySelector('meta[name="theme-color"][data-accent]');
    if (meta) meta.setAttribute("content", color);
    window.POS_THEME = { color: color, pattern: t.pattern || "none" };
  }

  function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} }
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  apply(cached);

  // 给页面用：服务器返回的新颜色（/api/public/info 的 theme）
  window.applyTheme = function (t) { if (!t) return; apply(t); save(t); };
  // 页面加载后去拿一次最新的（没联网 / 出错就继续用记住的）
  if (window.fetch) {
    fetch("/api/public/info").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.theme) window.applyTheme(j.theme); }).catch(function () {});
  }
})();
