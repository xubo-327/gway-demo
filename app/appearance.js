// 外观设置(系统颜色和花纹 / 商城外观 / 门头与广告图 Banner)——从 cashier.html 切出，纯搬运、逻辑未改。
// 作为全局 <script> 加载（在 cashier.html 内联脚本之后、stickers.js 之前，且在 menu-admin.js 之后），沿用同一全局作用域：
//   依赖内联脚本已定义的 S / $ / api / toast / store / esc / confirmModal / loadSettingsInfo 等全局，
//   以及 menu-admin.js 的 compressImage（广告图上传时调用，调用期已加载）。
// 对外暴露（均在用户操作后触发，非启动期）：
//   renderThemeSection / renderBannerSection（renderStoreSection 内调用）、renderMallLook（renderDevSections 内调用）。
//   saveTheme / themePatternCss / cropImage / THEME_COLORS / THEME_PATTERNS / ML_KIND 仅本模块内部使用。

// ---------- 系统颜色和花纹 ----------
const THEME_COLORS = [["#0f6b4b", "Gway 绿"], ["#c8102e", "中国红"], ["#c2410c", "橙"], ["#a16207", "金"], ["#15803d", "绿"], ["#0f766e", "青"], ["#1d4ed8", "蓝"], ["#7e22ce", "紫"], ["#be185d", "玫红"], ["#7c4a2d", "咖啡"], ["#1f2937", "黑"]];
const THEME_PATTERNS = [["none", "无"], ["dots", "圆点"], ["grid", "方格"], ["waves", "波浪"], ["clouds", "祥云"], ["fret", "回纹"]];
function renderThemeSection() {
  const st = S.settings;
  const cur = (st.theme_color || "#c2410c").toLowerCase(), pat = st.theme_pattern || "none";
  $("#themeSection").innerHTML = `
    <p class="muted" style="font-size:13px;margin:0 0 8px">改了以后，这台收银台马上换颜色；其他收银台、顾客手机、平板、副屏、老板手机下次打开（或刷新）时也会换成同样的颜色。</p>
    <div class="theme-swatches">${THEME_COLORS.map(([c, n]) => `<button class="sw ${c === cur ? "on" : ""}" data-tc="${c}" title="${n}" style="--c:${c}"><i></i><span>${n}</span></button>`).join("")}
      <label class="sw custom" title="自己挑颜色"><input type="color" id="themeCustom" value="${cur}"><span>自选</span></label></div>
    <div class="field" style="margin-top:10px"><span>花纹（很淡，铺在背景上）</span>
      <div class="theme-patterns" data-anchor="patterns">${THEME_PATTERNS.map(([p, n]) => `<button class="pt ${p === pat ? "on" : ""}" data-tp="${p}"><i style="background-color:#fff;background-image:${p === "none" ? "none" : esc(themePatternCss(p, cur))}"></i>${n}</button>`).join("")}</div></div>
    <div class="field" style="margin-top:12px"><span>订单颜色（点单页、订单列表按来源区分）</span>
      <div class="order-colors">${[["dine", "🍽 堂食"], ["togo", "🥡 外带"], ["gway", "🛒 Gway 商城"], ["platform", "🛵 外卖平台"]].map(([k, n]) =>
        `<label>${n}<input type="color" data-oc="${k}" value="${esc((st.order_colors || {})[k] || "#888888")}"></label>`).join("")}
        <button class="btn small" id="ocReset">恢复默认</button></div></div>`;
  window.renderSiteThemeSection?.(); // 点餐页主题的小样跟着系统颜色（site-theme.js）
}
// 订单颜色：选好就保存（店主 10-11）
$("#themeSection").addEventListener("change", async (e) => {
  const k = e.target.dataset?.oc;
  if (!k) return;
  const colors = { ...(S.settings?.order_colors || {}), [k]: e.target.value };
  try { S.settings = await api("/api/settings", { method: "PUT", body: { order_colors: colors } }); toast("订单颜色已保存", "success"); if (S.tab === "takeaway") renderTakeaway(); }
  catch (err) { toast(err.message, "error"); }
});
$("#themeSection").addEventListener("click", async (e) => {
  if (e.target.id !== "ocReset") return;
  try { S.settings = await api("/api/settings", { method: "PUT", body: { order_colors: {} } }); toast("订单颜色已恢复默认", "success"); renderThemeSection(); }
  catch (err) { toast(err.message, "error"); }
});
// 预览用：和 theme.js 生成的一样
function themePatternCss(p, color) {
  const keep = window.POS_THEME;
  window.applyTheme?.({ color, pattern: p });
  const css = getComputedStyle(document.documentElement).getPropertyValue("--pattern").trim();
  if (keep) window.applyTheme?.(keep);
  return css || "none";
}
async function saveTheme(body) {
  try {
    const c = body.theme_color;
    if (c) {
      const n = parseInt(c.slice(1), 16), lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      if (lum > 0.72) return toast("这个颜色太浅了，按钮上的白字会看不清，请选深一点的颜色", "error");
    }
    S.settings = await api("/api/settings", { method: "PUT", body });
    window.applyTheme?.({ color: S.settings.theme_color, pattern: S.settings.theme_pattern });
    renderThemeSection();
    toast("已换颜色", "success");
  } catch (err) { toast(err.message, "error"); }
}
$("#themeSection").addEventListener("click", (e) => {
  const c = e.target.closest("[data-tc]"), p = e.target.closest("[data-tp]");
  if (c) saveTheme({ theme_color: c.dataset.tc });
  if (p) saveTheme({ theme_pattern: p.dataset.tp });
});
$("#themeSection").addEventListener("change", (e) => { if (e.target.id === "themeCustom") saveTheme({ theme_color: e.target.value }); });

// ---------- 点餐页广告图 ----------
// ---------- 🛒 Gway 商城展示：封面图、圆形 logo、横条 logo，左边是商城首页卡片的样子 ----------
async function renderMallLook() {
  const box = $("#mallLookSection"); if (!box) return;
  const st = S.settings || {};
  // 没设封面时商城自动用的图：第一张点餐页广告图 → 招牌菜 → 第一道有图的菜
  let auto = null, autoWhy = "";
  if ((st.banners || []).length) { auto = st.banners[0].src; autoWhy = "第一张「点餐页广告图」"; }
  else {
    const items = await api("/api/menu/items").catch(() => []);
    const live = (items || []).filter((i) => i.image && i.is_active !== 0 && i.active !== 0);
    const it = live.find((i) => i.featured || i.is_featured) || live[0];
    if (it) { auto = it.image; autoWhy = `菜品「${it.name}」的图片`; }
  }
  const cover = st.mall_cover || auto;
  const name = st.store_name || "";
  box.innerHTML = (st.gway_enabled ? "" : `<p class="remote-box" style="background:#fff4e5;color:#7c3d00;margin:0 0 10px">商城接口已关闭：这里的修改要重新接入商城后才会同步。</p>`) + `
    <div class="ml-wrap">
      <div class="ml-side">
        <div class="ml-card" aria-label="商城首页卡片预览">
          <div class="ml-cover">${cover ? `<img src="${esc(cover)}" alt="">` : `<span class="ml-ph">${esc(name.slice(0, 1) || "G")}</span>`}
            ${st.mall_logo ? `<span class="ml-avatar"><img src="${esc(st.mall_logo)}" alt=""></span>` : st.store_logo ? `<span class="ml-strip"><img src="${esc(st.store_logo)}" alt=""></span>` : ""}
            <span class="ml-open">● 营业中</span></div>
          <div class="ml-body"><b>${esc(name)}</b><span class="muted">Cayenne</span></div>
        </div>
        <p class="muted" style="font-size:12px;margin:6px 2px 0;text-align:center">↑ Gway 商城首页上你的店铺卡片（所有店的卡片一样大）</p>
      </div>
      <div class="ml-rows">
        <div class="ml-row">
          <div class="ml-thumb wide">${st.mall_cover ? `<img src="${esc(st.mall_cover)}" alt="">` : auto ? `<img src="${esc(auto)}" alt="" style="opacity:.55">` : ""}</div>
          <div class="ml-txt"><b>① 封面图</b><span class="muted">卡片上的大图，宽:高 = 16:10（如 1200 × 750）。上传后可以拖动、放大，选好要显示的部分。</span>
            <span class="ml-state ${st.mall_cover ? "ok" : ""}">${st.mall_cover ? "✓ 用的是你上传的封面" : auto ? `现在自动用：${esc(autoWhy)}` : "还没有图片：卡片上显示店名第一个字"}</span>
            <span class="ml-btns"><button class="btn small primary" data-ml="cover">${st.mall_cover ? "换封面" : "上传封面"}</button>${st.mall_cover ? `<button class="btn small" data-mldel="cover">删除（改回自动）</button>` : ""}</span></div>
        </div>
        <div class="ml-row">
          <div class="ml-thumb round">${st.mall_logo ? `<img src="${esc(st.mall_logo)}" alt="">` : ""}</div>
          <div class="ml-txt"><b>② 圆形 logo</b><span class="muted">卡片左下角和本店页面店名旁边，显示成圆形。用方形图（如 512 × 512），主体放中间。</span>
            <span class="ml-state ${st.mall_logo ? "ok" : ""}">${st.mall_logo ? "✓ 已设置" : st.store_logo ? "没设：卡片下面显示 ③ 横条 logo" : "没设"}</span>
            <span class="ml-btns"><button class="btn small primary" data-ml="logo">${st.mall_logo ? "换 logo" : "上传圆形 logo"}</button>${st.mall_logo ? `<button class="btn small" data-mldel="logo">删除</button>` : ""}</span></div>
        </div>
        <div class="ml-row">
          <div class="ml-thumb strip">${st.store_logo ? `<img src="${esc(st.store_logo)}" alt="">` : ""}</div>
          <div class="ml-txt"><b>③ 横条 logo</b><span class="muted">本店页面最上面一条（宽是高的 6 倍左右，如 1200 × 200，透明背景 PNG 最好）。没有圆形 logo 时，首页卡片下面也显示它。</span>
            <span class="ml-state ${st.store_logo ? "ok" : ""}">${st.store_logo ? "✓ 已设置" : "没设"}</span>
            <span class="ml-btns"><button class="btn small primary" data-ml="strip">${st.store_logo ? "换横条 logo" : "上传横条 logo"}</button>${st.store_logo ? `<button class="btn small" data-mldel="strip">删除</button>` : ""}</span></div>
        </div>
        <p class="muted" style="font-size:12px;margin:4px 0 0">保存后几秒，Gway 商城上自动更新（要接入 Gway 商城，商城 0.15.1 以上才显示自己设的封面）。</p>
      </div>
    </div>
    <input type="file" id="mlFile" accept="image/png,image/jpeg,image/webp" hidden>`;
}
const ML_KIND = {
  cover: { url: "/api/settings/mall-cover", aspect: 16 / 10, w: 1200, h: 750, mime: "image/jpeg", title: "选封面要显示的部分", ok: "封面已保存" },
  logo: { url: "/api/settings/mall-logo", aspect: 1, w: 512, h: 512, mime: "image/png", round: true, title: "选圆形 logo 要显示的部分", ok: "圆形 logo 已保存" },
  strip: { url: "/api/settings/logo", aspect: 6, w: 1200, h: 200, mime: "image/png", title: "选横条 logo 要显示的部分", ok: "横条 logo 已保存", fit: true },
};
$("#mallLookSection").addEventListener("click", async (e) => {
  const up = e.target.closest("[data-ml]"), del = e.target.closest("[data-mldel]");
  if (up) { const f = $("#mlFile"); f.value = ""; f.dataset.kind = up.dataset.ml; return f.click(); }
  if (del) {
    const k = del.dataset.mldel, url = ML_KIND[k].url;
    try { await api(url, { method: "DELETE" }); toast(k === "cover" ? "已删除封面，改回自动" : "已删除", "success"); await loadSettingsInfo(); renderMallLook(); } catch (err) { toast(err.message, "error"); }
  }
});
$("#mallLookSection").addEventListener("change", async (e) => {
  if (e.target.id !== "mlFile" || !e.target.files[0]) return;
  const k = ML_KIND[e.target.dataset.kind];
  try {
    const blob = await cropImage(e.target.files[0], k);
    if (!blob) return;
    const res = await fetch(k.url, { method: "POST", headers: { "Content-Type": blob.type, Authorization: "Bearer " + store.get("pos_token") }, body: blob });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "上传失败");
    toast(k.ok + "，Gway 商城上几秒后更新", "success");
    await loadSettingsInfo(); renderMallLook();
  } catch (err) { toast(err.message, "error"); }
});
// 裁剪：拖动选位置、滑杆放大；fit = 可以缩小到整张图都放进去（横条 logo 留透明边）
function cropImage(file, { aspect, w, h, mime, round, title, fit }) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片打不开，请换一张 JPG / PNG")); };
    img.onload = () => {
      let done = false;
      const m = openModal({
        title, wide: true,
        body: `<div class="cr-frame${round ? " round" : ""}" style="aspect-ratio:${aspect}"><img src="${url}" alt="" draggable="false"></div>
          <div class="cr-tools"><span>🔍</span><input type="range" id="crZoom" min="${fit ? 0.2 : 1}" max="4" step="0.01" value="1" aria-label="放大缩小"><span class="muted" style="font-size:12.5px">拖动图片选要显示的部分</span></div>`,
        buttons: [{ label: "取消" }, { label: "用这个", kind: "primary", onClick: async () => {
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const g = cv.getContext("2d");
          if (mime === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
          const k = w / st.W;
          g.drawImage(img, st.x * k, st.y * k, img.naturalWidth * st.s * k, img.naturalHeight * st.s * k);
          done = true;
          resolve(await new Promise((ok) => cv.toBlob(ok, mime, 0.9)));
        } }],
        onClose: () => { URL.revokeObjectURL(url); if (!done) resolve(null); },
      });
      const frame = $(".cr-frame", m.el), pic = $(".cr-frame img", m.el);
      const st = { W: 0, H: 0, base: 1, z: 1, s: 1, x: 0, y: 0 };
      const clamp = () => {
        const dw = img.naturalWidth * st.s, dh = img.naturalHeight * st.s;
        st.x = dw >= st.W ? Math.min(0, Math.max(st.W - dw, st.x)) : (st.W - dw) / 2;
        st.y = dh >= st.H ? Math.min(0, Math.max(st.H - dh, st.y)) : (st.H - dh) / 2;
        pic.style.width = dw + "px"; pic.style.height = dh + "px"; pic.style.transform = `translate(${st.x}px, ${st.y}px)`;
      };
      const zoomTo = (z) => {
        const cx = st.W / 2, cy = st.H / 2, ix = (cx - st.x) / st.s, iy = (cy - st.y) / st.s;
        st.z = z; st.s = st.base * z; st.x = cx - ix * st.s; st.y = cy - iy * st.s; clamp();
      };
      requestAnimationFrame(() => {
        st.W = frame.clientWidth; st.H = frame.clientHeight;
        st.base = Math.max(st.W / img.naturalWidth, st.H / img.naturalHeight); // 刚好铺满
        st.s = st.base; st.x = (st.W - img.naturalWidth * st.s) / 2; st.y = (st.H - img.naturalHeight * st.s) / 2; clamp();
      });
      let drag = null;
      frame.addEventListener("pointerdown", (ev) => { drag = { px: ev.clientX, py: ev.clientY, x: st.x, y: st.y }; frame.setPointerCapture(ev.pointerId); });
      frame.addEventListener("pointermove", (ev) => { if (!drag) return; st.x = drag.x + ev.clientX - drag.px; st.y = drag.y + ev.clientY - drag.py; clamp(); });
      frame.addEventListener("pointerup", () => (drag = null));
      frame.addEventListener("wheel", (ev) => { ev.preventDefault(); const z = Math.min(4, Math.max(fit ? 0.2 : 1, st.z * (ev.deltaY < 0 ? 1.08 : 1 / 1.08))); $("#crZoom", m.el).value = z; zoomTo(z); }, { passive: false });
      $("#crZoom", m.el).addEventListener("input", (ev) => zoomTo(Number(ev.target.value)));
    };
    img.src = url;
  });
}

function renderBannerSection() {
  const list = S.settings.banners || [];
  $("#bannerSection").innerHTML = `
    <p class="muted" style="font-size:13px;margin:0 0 8px">顾客扫码点餐、平板自助点餐、网上预订的页面最上面显示一排广告图，每 4 秒自动换一张（顾客也可以用手指滑）。
      可以放新品、套餐优惠、节日活动。网上预订暂停接单时，打烊页上也显示这些图。最多 8 张，建议横图，宽:高 = 3:1（如 1200×400）。</p>
    <div class="bn-admin">${list.map((b, i) => `<div class="bn-item"><img src="${esc(b.src)}" alt="">
      <div class="bn-ops"><button class="btn small" data-bnmove="${i}" data-dir="-1" ${i ? "" : "disabled"} aria-label="往前">‹</button>
        <button class="btn small danger" data-bndel="${i}">删除</button>
        <button class="btn small" data-bnmove="${i}" data-dir="1" ${i < list.length - 1 ? "" : "disabled"} aria-label="往后">›</button></div></div>`).join("")}
      ${list.length < 8 ? `<button class="bn-add" id="bnAdd">＋ 添加广告图</button>` : ""}</div>
    <input type="file" id="bnFile" accept="image/*" hidden multiple>`;
}
$("#bannerSection").addEventListener("click", async (e) => {
  if (e.target.closest("#bnAdd")) { $("#bnFile").value = ""; return $("#bnFile").click(); }
  const del = e.target.closest("[data-bndel]"), mv = e.target.closest("[data-bnmove]");
  try {
    if (del) {
      if (!(await confirmModal("删除广告图", "删除后顾客点餐页不再显示这张图。确定删除吗？", "删除", "danger"))) return;
      await api(`/api/settings/banners/${del.dataset.bndel}`, { method: "DELETE" });
    } else if (mv) await api(`/api/settings/banners/${mv.dataset.bnmove}/move`, { method: "POST", body: { dir: Number(mv.dataset.dir) } });
    else return;
    await loadSettingsInfo();
    renderBannerSection();
  } catch (err) { toast(err.message, "error"); }
});
$("#bannerSection").addEventListener("change", async (e) => {
  if (e.target.id !== "bnFile" || !e.target.files.length) return;
  try {
    for (const file of [...e.target.files].slice(0, 8)) {
      const blob = await compressImage(file, 1600);
      const res = await fetch("/api/settings/banners", { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") }, body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "上传失败");
    }
    toast("广告图已添加，顾客点餐页马上就能看到", "success");
  } catch (err) { toast(err.message, "error"); }
  await loadSettingsInfo();
  renderBannerSection();
});
