// 收银「设置 → 外观与品牌 → 点餐页 / 网上商城主题」（店主 10-26：一体版网站的 10 套店面主题搬到扫码点餐页）。
// 照搬一体版 cashier-yitiban public/site-theme.js 的 10 张缩略小样（样式在 site-theme.css），第一张是「默认（现在的样子）」；
// 点一张就存进设置 site_theme，顾客下次打开（或刷新）点餐页就换。颜色按上面的系统颜色算（public/store-theme.js 的 StoreTheme.vars）。
// 依赖 cashier.html 的 S / $ / api / toast / esc 和 store-theme.js；renderSiteThemeSection 由 appearance.js 的 renderThemeSection 调用。

const SITE_MINI = `<span class="tp-fx"><i></i><i></i></span><span class="tp-hdr"><span class="tp-mark"></span><span class="tp-name"></span><span class="tp-cart"></span></span>
  <span class="tp-hero"><span class="tp-img"></span><span class="tp-card"><span class="tp-h1"></span><span class="tp-h1 short"></span><span class="tp-btn"></span></span></span>
  <span class="tp-grid">${'<span class="tp-p"><span class="tp-pimg"></span><span class="tp-pname"></span><span class="tp-price"></span></span>'.repeat(2)}</span>`;

function renderSiteThemeSection() {
  const box = $("#siteThemeSection"), st = S.settings || {};
  if (!box || !window.StoreTheme) return;
  const cur = st.site_theme || "";
  const zhUi = !window.I18N || I18N.lang === "zh"; // 中文界面在中文名后面再写法文名；外语界面主题名本身就翻成法文名
  // 第一张「默认」：就是以前的点餐页（白底、主色顶栏）
  const list = [["", "默认", "", "现在的样子：白底、主色顶栏、一行一道菜。", false], ...StoreTheme.THEMES];
  box.innerHTML = `
    <p class="muted" style="font-size:13px;margin:0 0 10px">顾客扫码点餐、网上商城（点餐版和电商版都算）、平板点餐机看到的样子。点一张卡片就换，顾客下次打开或刷新就是新样子；颜色跟上面的系统颜色。</p>
    <div class="stt-list">${list.map(([k, zh, fr, fit, grad]) => {
      const vars = Object.entries(StoreTheme.vars(st.theme_color, null, k || "chaleur")).map(([n, v]) => `${n}:${v}`).join(";");
      return `<button type="button" class="stt-card ${k === cur ? "on" : ""}" data-stt="${k}" aria-pressed="${k === cur}">
        <span class="tp-mini" data-k="${k || "default"}" style="${vars}" aria-hidden="true">${SITE_MINI}</span>
        <span class="stt-txt"><span class="stt-name"><b>${zh}</b>${fr && zhUi ? `<span class="muted" translate="no">${fr}</span>` : ""}${grad ? `<span class="stt-tag">渐变</span>` : ""}${k === cur ? `<span class="stt-on">✓ 正在用</span>` : ""}</span>
          <span class="muted stt-fit">${fit}</span></span></button>`;
    }).join("")}</div>`;
}
$("#siteThemeSection").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-stt]");
  if (!c || c.classList.contains("on")) return;
  try {
    S.settings = await api("/api/settings", { method: "PUT", body: { site_theme: c.dataset.stt } });
    renderSiteThemeSection();
    toast("点餐页主题已换，顾客下次打开就是新样子", "success");
  } catch (err) { toast(err.message, "error"); }
});
