// 超市 / 百货（收银台里的「收银」「商品」「库存」三页 + 报表「毛利」）
// 「设置 → 日常经营 → 门店信息 → 使用场景」选了超市 / 百货才显示；餐馆模式下这些都隐藏。
// 收银页全键盘操作：扫码枪扫完会自动回车；F1 帮助 F2 改数量 F3 改价 F4 挂单 F5 取单 F6 称重 F7 找商品 F8 打折 F9 刷卡 F12 现金 Del 删行 Esc 清空
(() => {
  const R = {
    cart: [], sel: -1, discount: null, roundOff: false, last: null, holdCount: 0,
    catalog: [], catalogAt: 0, cats: [], scaleCfg: null,
    goods: { q: "", cat: "", filter: "", page: 0, total: 0, items: [], sel: new Set() },
    stock: { tab: "overview", recv: [], count: [], supplier: "", note: "", moveKind: "" },
  };
  window.Retail = R;
  const isRetail = () => Boolean(S.settings?.retail);
  const isStore = () => S.settings?.store_type === "store";
  const UNIT = { pc: "件", kg: "公斤", g: "克", l: "升", m: "米" };
  const UNIT_SHORT = { pc: "", kg: "kg", g: "g", l: "L", m: "m" };
  const fmtQty = (v) => (v == null ? "" : String(Math.round(v * 1000) / 1000));
  const nav = (k) => $(`#nav [data-tab="${k}"]`);
  const modalOpen = () => Boolean(document.querySelector(".modal-overlay"));
  const kbdTag = (k) => `<kbd translate="no">${k}</kbd>`;
  const fnKey = (k) => (noAutoFocus() ? "" : kbdTag(k)); // 平板 / 手机没有实体键盘：按钮上不显示 F 键小标签（B32）
  // 扫码框（收银、进货 / 盘点，B44 / B50）：没有实体键盘的设备上 inputmode=none —— 照旧可以一直回焦，扫码枪（实体键盘输入）照样扫得进，
  // 但不弹系统输入法；店员亲手点扫码框才弹（改成 text），离开、触摸变成滚动没聚焦上、或输完按回车后恢复 none（B52）。返回「恢复 none」函数。
  // refocus（收银扫码框）：没有实体键盘的设备上按回车后先失焦（安卓 WebView 才会收起系统键盘），150 毫秒后再回焦（B68）；
  // 这期间扫码枪打来的字由页面的按键监听送回扫码框，连扫不丢字
  function softScan(i, refocus) {
    const off = () => { if (noAutoFocus()) i.setAttribute("inputmode", "none"); else i.removeAttribute("inputmode"); };
    off();
    i.addEventListener("blur", off);
    i.addEventListener("pointerdown", () => {
      if (!noAutoFocus() || i.getAttribute("inputmode") === "text") return;
      if (document.activeElement === i) i.blur(); // 已经聚焦着：先失焦，这一下点击重新聚焦时才会弹输入法
      i.setAttribute("inputmode", "text");
    });
    i.addEventListener("pointercancel", () => { if (document.activeElement !== i) { off(); if (refocus) setTimeout(refocus, 0); } }); // B69
    // 用输入法输完按回车：恢复 none 并收起输入法（失焦再回焦）
    i.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (refocus && noAutoFocus()) return setTimeout(() => { if (document.activeElement === i) i.blur(); setTimeout(refocus, 150); }, 0);
      if (i.getAttribute("inputmode") === "text") setTimeout(() => { if (!document.contains(i)) return; i.blur(); i.focus({ preventScroll: true }); }, 0);
    });
    return off;
  }

  document.head.insertAdjacentHTML("beforeend", `<style>
  #tab-sell { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; padding: 12px 14px; }
  #tab-sell.hidden { display: none; }
  .sell-main { display: flex; flex-direction: column; min-height: 0; gap: 10px; }
  .sell-scan { display: flex; gap: 8px; align-items: center; }
  .sell-scan input { flex: 1; font-size: 20px; padding: 12px 14px; border: 2px solid var(--accent); border-radius: 12px; }
  .sell-scale { padding: 6px 10px; border-radius: 99px; background: #e3f3e7; color: var(--ok); font-size: 13px; white-space: nowrap; }
  .sell-scale.bad { background: #fde4e1; color: var(--danger); }
  .sell-cart { flex: 1; min-height: 0; overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; }
  .sell-table { width: 100%; font-size: 16px; }
  .sell-table td, .sell-table th { padding: 8px 10px; }
  .sell-table tr.sel td { background: var(--accent-soft); }
  /* 加入商品时这一行闪一下（静音也看得到）：黄色高亮淡入选中底色 */
  @keyframes sellFlash { 0% { background: #ffe066; } 100% { background: var(--accent-soft); } }
  .sell-table tr.just-added td { animation: sellFlash .55s ease-out; }
  @media (prefers-reduced-motion: reduce) { .sell-table tr.just-added td { animation: none; } }
  .sell-table tbody tr { cursor: pointer; }
  .sell-table .r, .goods-table .r { text-align: right; }
  .sell-empty { text-align: center; padding: 60px 20px; }
  .sell-keys { font-size: 12px; color: var(--muted); }
  /* 数字键盘（可收起）：输金额回车 = 直接收这个钱；× = 数量 */
  /* 收银键盘：在左边购物车下面，左边字母（法式 AZERTY，搜商品名 / 拼音首字母），右边数字（金额、数量） */
  .sell-pad { display: grid; grid-template-columns: minmax(0, 1fr) 14px var(--sp-num-w, 260px); gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 10px; flex: none; }
  .sell-pad[hidden] { display: none; }
  .sp-abc { display: grid; gap: 6px; align-content: start; }
  .sp-abc .row { display: flex; gap: 6px; }
  .sp-abc .row:nth-child(2) { padding-left: 3%; }
  .sp-abc .row:nth-child(3) { padding-left: 9%; }
  .sp-abc button { flex: 1 1 0; min-width: 0; }
  .sp-abc .space { flex: 4 1 0; }
  .sp-num { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .sell-pad button { min-height: var(--kh, 50px); font-size: calc(var(--kh, 50px) * .42); font-weight: 700; border: 1px solid var(--line); border-radius: calc(var(--kh, 50px) * .22); background: var(--bg, #fff); color: inherit; cursor: pointer; touch-action: manipulation; transition: transform .08s, background .15s; padding: 0; }
  .sell-pad .fn, .sell-pad .ok { font-size: calc(var(--kh, 50px) * .34); }
  /* 拖动条：上下拖调键盘大小 */
  .sp-grip { grid-column: 1 / -1; height: 16px; margin: -6px 0 -4px; display: flex; align-items: center; justify-content: center; cursor: ns-resize; touch-action: none; user-select: none; }
  .sp-grip::before { content: ""; width: 56px; height: 5px; border-radius: 3px; background: var(--line); transition: background .15s, width .15s; }
  .sp-grip:hover::before, .sell-pad.resizing .sp-grip::before { background: var(--accent); width: 80px; }
  /* 竖直分隔条：左右拖调「字母区 / 数字区」宽度 */
  .sp-split { align-self: stretch; display: flex; align-items: center; justify-content: center; cursor: ew-resize; touch-action: none; user-select: none; }
  .sp-split::before { content: ""; width: 5px; height: 56px; border-radius: 3px; background: var(--line); transition: background .15s, height .15s; }
  .sp-split:hover::before, .sell-pad.resizing .sp-split::before { background: var(--accent); height: 80px; }
  .sell-pad.resizing button { transition: none; }
  .sell-pad button:active { transform: scale(.94); background: var(--accent-soft); }
  .sell-pad .ok { grid-row: span 2; background: var(--accent); color: #fff; border-color: var(--accent); }
  .sell-pad .fn { color: var(--muted); }
  @media (max-width: 1100px) { .sell-pad { grid-template-columns: 1fr; } .sp-split { display: none; } }
  #padToggle { font-size: 20px; padding: 10px 14px; }
  #padToggle.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .sell-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
  .sell-total, .sell-last { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  .sell-last:empty { display: none; }
  .st-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; font-size: 19px; }
  .st-row b, .st-row .num { font-size: 24px; font-weight: 700; }
  .st-row.good { color: var(--ok); }
  .st-total { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; border-top: 1px dashed var(--line); margin-top: 10px; padding-top: 10px; font-size: 20px; font-weight: 700; }
  .st-total b { font-size: 56px; line-height: 1.05; color: var(--accent); letter-spacing: -.02em; margin-left: auto; }
  .sell-total { padding: 16px 18px; }
  .st-change { display: flex; justify-content: space-between; align-items: baseline; color: var(--ok); }
  .st-change b { font-size: 30px; }
  .sell-tender { display: grid; gap: 8px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 10px; }
  .sell-pay { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  .sell-pay .btn.big { font-size: 18px; padding: 16px 8px; }
  .sell-pay .pay-card { background: #2952c8; border-color: #2952c8; }
  .sell-pay .pay-card.armed { background: #c2410c; border-color: #c2410c; animation: tnPulse 1s ease-in-out infinite; white-space: normal; font-size: 15px; line-height: 1.25; } /* 第二步文字长（法语），小一号不把下一行挤掉（B75） */
  @keyframes tnPulse { 50% { filter: brightness(1.15); } }
  .tn-bills { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .tn-bills:empty { display: none; }
  .tn-bills button { padding: 8px 2px; border-radius: 10px; border: 1.5px solid #13804f; background: #e9f7ef; color: #13804f; font-weight: 800; font-size: 14px; cursor: pointer; }
  .tn-bills button:hover { background: #d6f0e1; }
  .tn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 6px; }
  .tn-grid label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
  .tn-grid label[hidden] { display: none; }
  .tn-grid input { font-size: 16px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 9px; width: 100%; min-width: 0; }
  .tn-grid input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
  .tn-status { min-height: 1.3em; font-size: 15px; }
  .tn-status b { font-size: 22px; }
  .tn-go { font-size: 15px; padding: 9px 8px; }
  .tn-go[hidden], .tn-status:empty { display: none; }
  .sell-tender .vtypes[hidden] { display: none; }
  /* v1.42.13（设计梳理 X1）：法语按钮字长（「Mettre en attente F4」），以前 1fr 按最长按钮撑宽、整列超出卡片、快捷键标被切掉；
     现在两列平分（minmax(0,1fr)），字放不下就在单词间折行，快捷键标整块跟着走、不拆开 */
  .sell-tools { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
  .sell-tools .btn { font-size: 13px; padding: 8px 6px; position: relative; white-space: normal; line-height: 1.25; min-width: 0; overflow-wrap: normal; }
  .sell-tools .btn kbd { display: inline-block; white-space: nowrap; }
  .sell-tools .nav-badge { position: absolute; top: -4px; right: -4px; }
  kbd { font: 11px/1 monospace; padding: 2px 4px; border: 1px solid currentColor; border-radius: 4px; opacity: .65; margin-left: 4px; }
  .btn.tiny { padding: 0 8px; min-height: 26px; font-size: 16px; }
  .find-list { display: grid; gap: 4px; margin-top: 10px; max-height: 55vh; overflow: auto; }
  .find-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 12px; align-items: center; text-align: left; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); cursor: pointer; font-size: 15px; }
  .find-row.on, .find-row:hover { border-color: var(--accent); background: var(--accent-soft); }
  .pay-big { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .pay-big b { font-size: 36px; color: var(--accent); }
  .pay-change { font-size: 20px; margin-top: 10px; min-height: 1.4em; }
  .pay-change b { font-size: 30px; color: var(--ok); }
  .weigh-live { font-size: 30px; min-height: 1.3em; margin-bottom: 8px; }
  .good { color: var(--ok); } .bad { color: var(--danger); }
  label.chk { display: flex; gap: 6px; align-items: center; }
  .form-grid label.wide { grid-column: 1 / -1; }
  .rt-grid label { display: grid; gap: 4px; margin-bottom: 8px; align-content: start; }
  .rt-grid label.chk { display: flex; align-self: end; }
  .goods-table tr.off td { opacity: .55; }
  .goods-tools { flex-wrap: wrap; gap: 8px; }
  .warn-box { background: #fff4d6; border: 1px solid #f0d58a; border-radius: 10px; padding: 10px 12px; }
  .imp-list { max-height: 260px; overflow: auto; font-size: 13px; padding-left: 18px; }
  .today-tiles .tt.warn { background: #fff4d6; border-color: #e0a800; }
  .today-tiles .tt small { color: var(--muted); }
  @media (max-width: 900px) { #tab-sell { grid-template-columns: minmax(0, 1fr); } }
  /* 商品页「⋯ 更多」只在手机上出现（B29） */
  #goodsBody .g-more-btn { display: none; }
  #goodsBody .g-more-items { display: inline-flex; gap: 6px; flex-wrap: wrap; }
  /* 手机（≤600）：收银购物车不显示「单价」列（B25）；商品页导出 / 导入 / 分类管理收进「⋯ 更多」，不显示照片、条码列，表头不按字拆行（B29） */
  @media (max-width: 600px) {
    .sell-table .c-up { display: none; }
    .sell-table td, .sell-table th { padding: 8px 6px; }
    #goodsBody .g-more-btn { display: inline-flex; }
    #goodsBody .g-more-items { display: none; }
    #goodsBody .g-more-items.open { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
    #goodsBody .goods-table .g-bc, #goodsBody .goods-table .g-cost, #goodsBody .goods-table .g-mg, #goodsBody .goods-table .g-cat { display: none; } /* 库存要在屏内（B48 / B67；分类上面有下拉框可筛） */
    #goodsBody .goods-table .g-pic-td { width: 40px; padding-left: 4px; padding-right: 4px; }
    #goodsBody .goods-table .g-pic { width: 34px; height: 34px; font-size: 15px; }
    #goodsBody table.list th, #goodsBody table.list td.g-cat { white-space: nowrap; }
    #goodsBody #gQ { flex: 1 1 160px; width: auto !important; min-width: 0; }
  }
  </style>`);

  // ---------- 页面骨架：导航按钮 + 三个页面 ----------
  const before = nav("orders");
  before.insertAdjacentHTML("beforebegin", `
    <button data-tab="sell" data-icon="🛒" class="nav-off">收银<span class="nav-badge hidden" id="holdBadge"></span></button>
    <button data-tab="goods" data-icon="📦" class="nav-off" data-admin>商品</button>
    <button data-tab="stock" data-icon="🏷" class="nav-off" data-admin>库存<span class="nav-badge hidden" id="lowBadge"></span></button>`);
  $("main").insertAdjacentHTML("beforeend", `
    <section class="tab hidden" id="tab-sell">
      <div class="sell-main">
        <div class="sell-scan no-keypad">
          <input type="text" id="sellInput" placeholder="扫条码；输金额回车直接收钱（3 = 3,00 €）；或输商品名 / 拼音首字母。3* 再扫 = 3 件" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn" id="padToggle" title="显示 / 收起键盘">⌨</button>
          <span class="sell-scale hidden" id="sellScale"></span>
        </div>
        <div class="sell-cart" id="sellCart"></div>
        <div class="sell-pad no-keypad" id="sellPad" hidden></div>
        <div class="sell-keys" id="sellKeys"></div>
      </div>
      <aside class="sell-side">
        <div class="sell-total" id="sellTotal"></div>
        <div class="sell-tender no-keypad" id="sellTender">
          <div class="sell-pay">
            <button class="btn primary big" id="payCash">💶 现金 ${fnKey("F12")}</button>
            <button class="btn primary big pay-card" id="payCard">💳 刷卡 ${fnKey("F9")}</button>
          </div>
          <div class="tn-bills" id="tnBills"></div>
          <div class="tn-grid">
            <label><span>💶 现金实收</span><input type="text" id="tnCash" inputmode="decimal" autocomplete="off" placeholder="刚好"></label>
            <label><span>💳 刷卡</span><input type="text" id="tnCard" inputmode="decimal" autocomplete="off" placeholder="0"></label>
            <label class="tn-v" hidden><span>🎫 餐券</span><input type="text" id="tnV" inputmode="decimal" autocomplete="off" placeholder="0"></label>
          </div>
          <div class="vtypes" id="tnVTypes" hidden></div>
          <div class="tn-status" id="tnStatus"></div>
          <button class="btn big tn-go" id="payMixed">✓ 按填的金额收款 <kbd>Enter</kbd></button>
        </div>
        <div class="sell-tools">
          <button class="btn" id="sellFind">🔍 找商品 ${fnKey("F7")}</button>
          <button class="btn" id="sellWeigh">⚖ 称重 ${fnKey("F6")}</button>
          <button class="btn" id="sellDisc">🏷 打折 / 抹零 ${fnKey("F8")}</button>
          <button class="btn" id="sellHold">⏸ 挂单 ${fnKey("F4")}</button>
          <button class="btn" id="sellTake">▶ 取单 ${fnKey("F5")}<span class="nav-badge hidden" id="takeBadge"></span></button>
          <button class="btn" id="sellReturn">↩ 退货</button>
          <button class="btn" id="sellClear">清空 ${fnKey("Esc")}</button>
          <button class="btn" id="sellHelp"${noAutoFocus() ? ' style="display:none"' : ""}>❔ 快捷键 ${fnKey("F1")}</button>
        </div>
        <div class="sell-last" id="sellLast"></div>
      </aside>
    </section>
    <section class="tab hidden" id="tab-goods"><div id="goodsBody"></div></section>
    <section class="tab hidden" id="tab-stock"><div id="stockBody"></div></section>`);
  document.querySelectorAll("#nav [data-admin]").forEach((el) => el.classList.toggle("hidden", Boolean(S.staff) && !isAdmin()));

  // ---------- 接到收银台：切换页面、导航显示、副屏、实时同步 ----------
  const RETAIL_TABS = ["sell", "goods", "stock"];
  const DINING_TABS = ["tables", "takeaway", "menu"];
  // 超市 / 百货开了网上商店（电商版）或网上预订：多一个「网上订单」页（就是餐馆的点单页，处理网上来的单）
  const onlineShop = () => S.settings?.shop_style === "shop" || Boolean(S.settings?.remote_order);
  const _switchTab = switchTab;
  switchTab = function (tab) {
    if (isRetail() && DINING_TABS.includes(tab) && !(tab === "takeaway" && onlineShop())) tab = "sell";
    if (!isRetail() && RETAIL_TABS.includes(tab)) tab = S.settings?.home_tab || "tables";
    return _switchTab(tab);
  };
  const _refreshTab = refreshTab;
  refreshTab = function () {
    if (S.tab === "sell") return renderSell();
    if (S.tab === "goods") return loadGoods().catch((e) => toast(e.message, "error"));
    if (S.tab === "stock") return loadStock().catch((e) => toast(e.message, "error"));
    return _refreshTab();
  };
  const _applyNav = applyNav;
  applyNav = function () {
    const r = isRetail();
    for (const k of RETAIL_TABS) nav(k)?.classList.toggle("nav-off", !r);
    nav("menu")?.classList.toggle("nav-off", r);
    document.body.classList.toggle("retail-mode", r);
    if (r) {
      nav("tables")?.classList.add("nav-off");
      const tb = nav("takeaway");
      tb?.classList.toggle("nav-off", !onlineShop());
      if (tb?.firstChild?.nodeType === 3) tb.firstChild.nodeValue = "网上订单";
      if (tb) tb.dataset.icon = "📦";
      if (DINING_TABS.includes(S.tab) && !(S.tab === "takeaway" && onlineShop()) && !$("#app").classList.contains("hidden")) switchTab("sell");
      loadCatalog().catch(() => {});
      refreshBadges();
    } else {
      _applyNav();
      if (RETAIL_TABS.includes(S.tab) && !$("#app").classList.contains("hidden")) switchTab(S.settings?.home_tab || "tables");
    }
  };
  const _displayCurrent = displayCurrent;
  displayCurrent = function () {
    if (S.tab === "sell") return DisplayOut.push(R.cart.length ? cartForDisplay() : R.last ? { mode: "thanks", total: R.last.total, change: R.last.change } : { mode: "idle" });
    return _displayCurrent();
  };
  const _onLive = onLive;
  onLive = function (msg) {
    _onLive(msg);
    if (!isRetail()) return;
    if (msg.type === "goods") { R.catalogAt = 0; loadCatalog().catch(() => {}); refreshBadges(); if (S.tab === "goods") loadGoods().catch(() => {}); }
    if (msg.type === "holds") refreshBadges();
    if (msg.type === "labels") R.labelTpls = null;
    if (msg.type === "label-job" && msg.job) onLabelJob(msg.job);
  };
  async function refreshBadges() {
    if (!isRetail()) return;
    try {
      const holds = await api("/api/retail/holds");
      R.holdCount = holds.length;
      for (const id of ["#holdBadge", "#takeBadge"]) { $(id).textContent = holds.length; $(id).classList.toggle("hidden", !holds.length); }
      if (isAdmin()) {
        const { count } = await api("/api/retail/stock/low-count");
        $("#lowBadge").textContent = count;
        $("#lowBadge").classList.toggle("hidden", !count);
      }
    } catch {}
  }

  async function loadCatalog(force) {
    if (!force && Date.now() - R.catalogAt < 60000 && R.catalog.length) return R.catalog;
    R.catalog = await api("/api/retail/catalog");
    R.catalogAt = Date.now();
    return R.catalog;
  }
  function searchCatalog(q, limit = 30) {
    const query = String(q || "").trim();
    if (!query) return R.catalog.slice(0, limit);
    const m = makeMatcher(query);
    return R.catalog.filter((g) => m(g) || g.barcode.startsWith(query) || g.code === query).slice(0, limit);
  }

  // ================= 收银 =================
  // 购物车一行：{ item_id, name, unit, weighed, qty, weight, price（单价，称重 = 每公斤）, orig（原价）, barcode（秤贴纸）, label_amount }
  const lineAmount = (l) => (l.weighed ? (l.barcode && l.price === l.orig ? l.label_amount : Math.round(l.price * l.weight)) : l.price * l.qty);
  // 和服务端 computeTotals 一样算
  function totals() {
    const subtotal = R.cart.reduce((s, l) => s + lineAmount(l), 0);
    let discount = 0;
    if (R.discount?.type === "percent") discount = Math.round((subtotal * R.discount.value) / 100);
    else if (R.discount?.type === "amount") discount = Math.min(R.discount.value, subtotal);
    const before = subtotal - discount;
    const roundOff = R.roundOff ? before % 100 : 0;
    return { subtotal, discount, roundOff, total: before - roundOff, count: R.cart.reduce((s, l) => s + (l.weighed ? 1 : l.qty), 0) };
  }
  function cartForDisplay() {
    const t = totals();
    return {
      mode: "order", label: "收银",
      items: R.cart.map((l) => ({ name: l.name, opts: l.weighed ? `${fmtQty(l.weight)} kg × ${money(l.price)}/kg` : "", qty: l.weighed ? 1 : l.qty, amount: lineAmount(l) })),
      subtotal: t.subtotal, discount: t.discount + t.roundOff, charges: [], total: t.total,
    };
  }

  function renderSell() {
    document.documentElement.classList.toggle("retail-mode", isRetail()); // 超市 / 百货：浮动键盘放左下（不挡右边收款、打印小票那一栏）
    if (!isRetail()) return;
    const t = totals();
    $("#sellCart").innerHTML = R.cart.length ? `
      <table class="list sell-table"><thead><tr><th>#</th><th>商品</th><th class="r">数量</th><th class="r c-up">单价</th><th class="r">金额</th><th></th></tr></thead>
      <tbody>${R.cart.map((l, i) => `<tr data-i="${i}" class="${i === R.sel ? "sel" : ""}">
        <td class="muted">${i + 1}</td>
        <td><span translate="no">${esc(l.name)}</span>${l.misc ? ` <span class="badge">直接输入金额</span>` : l.orig != null && l.price !== l.orig ? ` <span class="badge warn">改价 原 ${money(l.orig)}</span>` : ""}${l.barcode ? ` <span class="badge">秤贴纸</span>` : ""}</td>
        <td class="r num">${l.weighed ? `${fmtQty(l.weight)} kg` : `<button class="btn tiny" data-q="-1">−</button> <b>${l.qty}</b> <button class="btn tiny" data-q="1">＋</button>`}</td>
        <td class="r num c-up">${money(l.price)}${l.weighed ? "/kg" : ""}</td>
        <td class="r num"><b>${money(lineAmount(l))}</b></td>
        <td class="r"><button class="icon-btn" data-del title="删除这一行（Del）">×</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="sell-empty"><div style="font-size:54px">🛒</div><p>扫商品条码开始收银</p>
         ${noAutoFocus() ? "" : `<p class="muted">没有条码的商品：按 F7 搜名称；称重商品：放到秤上按 F6，或者直接扫秤打出来的贴纸</p>`}</div>`;
    $("#sellTotal").innerHTML = `
      <div class="st-row"><span>件数</span><b class="num">${t.count}</b></div>
      <div class="st-row"><span>小计</span><span class="num">${money(t.subtotal)}</span></div>
      ${t.discount ? `<div class="st-row good"><span>优惠${R.discount.type === "percent" ? `（${R.discount.value}%）` : ""}</span><span class="num">−${money(t.discount)}</span></div>` : ""}
      ${t.roundOff ? `<div class="st-row good"><span>抹零</span><span class="num">−${money(t.roundOff)}</span></div>` : ""}
      <div class="st-total"><span>应收</span><b class="num">${money(t.total)}</b></div>`;
    for (const id of ["#payCash", "#payCard", "#payMixed", "#sellHold", "#sellDisc", "#sellClear"]) $(id).disabled = !R.cart.length;
    if (!R.cart.length) resetTender();
    renderTender();
    renderLast();
    $("#sellKeys").hidden = noAutoFocus(); // 平板 App / 窄屏没有实体键盘，快捷键提示没用（B17）
    $("#sellKeys").innerHTML = `${fnKey("F2")} 改数量 · ${fnKey("F3")} 改价 · ${fnKey("↑↓")} 选行 · ${fnKey("Del")} 删行 · ${fnKey("+")}/${fnKey("-")} 加减数量`;
    const sel = $("#sellCart tr.sel");
    if (sel) sel.scrollIntoView({ block: "nearest" });
    if (R.flash && sel) { R.flash = false; sel.classList.remove("just-added"); void sel.offsetWidth; sel.classList.add("just-added"); } // 加入行闪一下
    displayCurrent();
    renderScaleChip();
    focusInput();
  }
  function renderLast() {
    const l = R.last;
    $("#sellLast").innerHTML = l ? `
      <div class="muted" style="font-size:12px">上一单 #${l.id} · ${esc(l.method)}</div>
      <div class="st-row"><span>应收</span><span class="num">${money(l.total)}</span></div>
      ${l.received ? `<div class="st-row"><span>实收</span><span class="num">${money(l.received)}</span></div>` : ""}
      ${l.change ? `<div class="st-change"><span>找零</span><b class="num">${money(l.change)}</b></div>` : ""}
      <button class="btn small" id="lastReprint">${l.printed ? "🖨 补打小票" : "🖨 打印小票"}</button>` : "";
    // 设置了「结账后不自动打小票」时，第一次点是打原件，之后才是补打
    if (l) $("#lastReprint").onclick = () => api(`/api/orders/${l.id}/reprint`, { method: "POST" })
      .then((r) => { toast(r.first ? "已打印小票" : "已补打小票", "success"); l.printed = true; renderLast(); }).catch((e) => toast(e.message, "error"));
  }
  let sellOff = () => {};
  function focusInput() {
    if (S.tab === "sell" && !modalOpen() && document.activeElement !== $("#sellInput") && !document.activeElement?.closest?.(".keypad, .sell-tender")) { sellOff(); $("#sellInput").focus({ preventScroll: true }); } // B52：回焦前先恢复 none
  }

  function addLine(item, { qty = 1, weight = null, barcode = null, amount = null } = {}) {
    if (item.weighed) {
      R.cart.push({ item_id: item.id, name: item.full_name || item.name, unit: item.unit, weighed: true, qty: 1, weight, price: item.price_cents, orig: item.price_cents, barcode, label_amount: amount });
      R.sel = R.cart.length - 1;
    } else {
      const i = R.cart.findIndex((l) => l.item_id === item.id && !l.weighed && l.price === l.orig);
      if (i >= 0) { R.cart[i].qty += qty; R.sel = i; }
      else { R.cart.push({ item_id: item.id, name: item.full_name || item.name, unit: item.unit, weighed: false, qty, weight: null, price: item.price_cents, orig: item.price_cents }); R.sel = R.cart.length - 1; }
    }
    R.last = null;
    R.flash = true; // 让新加入的那一行闪一下（静音也看得到，扫进去了一眼确认）
    beep(true);
    if (item.stock != null && item.stock <= 0) toast(`「${item.full_name || item.name}」库存显示是 ${fmtQty(item.stock)}，请记得补货或盘点`, "info");
    renderSell();
  }

  // 提示音：扫到 = 短「嘀」；没找到 = 低音
  let audio;
  function beep(ok) {
    if (typeof canSound === "function" && !canSound()) return; // 顶栏一键静音：这台设备不响
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = ok ? 1800 : 300;
      g.gain.value = 0.08;
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + (ok ? 0.06 : 0.25));
    } catch {}
  }

  // 直接输金额：3 → 3,00 €；3,5 / 3.50 → 3,50 €（不和商品号、条码冲突：先看有没有这个商品号，6 位以上的数字当条码）
  let miscP = null;
  async function addMisc(cents, qty) {
    const item = await (miscP ||= api("/api/retail/misc").catch((e) => { miscP = null; throw e; }));
    R.cart.push({ item_id: item.id, name: item.name, unit: "pc", weighed: false, qty, weight: null, price: cents, orig: 0, misc: true });
    R.sel = R.cart.length - 1; R.last = null;
    beep(true);
    renderSell();
  }
  async function onScanEnter(raw) {
    let text = String(raw || "").trim();
    if (!text) return;
    let qty = 1;
    const m = /^(\d{1,4})\s*[*xX×]\s*(.+)$/.exec(text);
    if (m) { qty = Number(m[1]); text = m[2].trim(); }
    if (!qty) return;
    if (/^\d{1,5}([.,]\d{1,2})?$/.test(text)) {
      await loadCatalog();
      const exact = /^\d+$/.test(text) && R.catalog.find((g) => g.plu === String(Number(text)) || g.code === text);
      if (exact) return exact.weighed ? weighAndAdd(exact) : addLine(exact, { qty });
      const cents = Math.round(Number(text.replace(",", ".")) * 100);
      if (cents > 0) return addMisc(cents, qty);
    }
    const codeLike = /^[0-9A-Za-z\-.]{3,32}$/.test(text);
    if (codeLike) {
      const r = await api(`/api/retail/scan?code=${encodeURIComponent(text)}`);
      if (r.type === "receipt") return openReturn(r.order_id);
      if (r.type === "goods") {
        if (r.label) return addLine(r.item, { weight: r.weight, barcode: r.barcode, amount: r.amount_cents });
        if (r.item.weighed) return weighAndAdd(r.item);
        return addLine(r.item, { qty });
      }
      // 没找到：纯数字当作新条码；字母可能是商品名，接着按名称找
      if (/^\d+$/.test(text)) { beep(false); return unknownBarcode(text, r.message); }
    }
    await loadCatalog();
    const hits = searchCatalog(text, 30);
    if (hits.length === 1) {
      const g = hits[0];
      return g.weighed ? weighAndAdd(g) : addLine(g, { qty });
    }
    openFind(text);
  }

  // ---------- 数字键盘（可收起，记住上次的选择；触摸屏默认打开） ----------
  // 左边字母（AZERTY）+ 空格；右边数字：7 8 9 ⌫ / 4 5 6 C / 1 2 3 确定 / , 0 ×
  const ABC = ["azertyuiop", "qsdfghjklm", "wxcvbn", "éèàçùêâôîœ"]; // 第 4 行：法文重音（和数字区一样 4 排，不增高）
  const NUM = ["7", "8", "9", "back", "4", "5", "6", "clear", "1", "2", "3", "ok", ",", "0", "*"];
  const PAD_LABEL = { back: "⌫", clear: "C", "*": "×", ok: "确定", " ": "空格" };
  const key = (k) => `<button type="button" data-k="${k}" class="${k === "ok" ? "ok" : /^(back|clear|\*)$/.test(k) ? "fn" : k === " " ? "space fn" : ""}">${PAD_LABEL[k] || k.toUpperCase()}</button>`;
  $("#sellPad").innerHTML = `<div class="sp-grip" id="spGrip" title="上下拖动调整键盘大小；拖到底收起；双击恢复"></div><div class="sp-abc">${ABC.map((r, i) => `<div class="row">${[...r].map(key).join("")}${i === 2 ? key(" ") + key("back") : ""}</div>`).join("")}</div>
    <div class="sp-split" id="spSplit" title="左右拖动调整字母区 / 数字区宽度，双击恢复默认"></div>
    <div class="sp-num">${NUM.map(key).join("")}</div>`;
  const padOn = () => { try { const v = localStorage.getItem("retail_pad"); return v == null ? matchMedia("(pointer: coarse)").matches : v === "1"; } catch { return false; } };
  // 收银键盘开着时：收款面板的输入框也用它（不再弹出会挡住收款面板的浮动键盘）；收起时触摸屏照旧用浮动键盘
  const setPad = (on, keep = true) => { $("#sellPad").hidden = !on; $("#padToggle").classList.toggle("on", on); if (keep) try { localStorage.setItem("retail_pad", on ? "1" : "0"); } catch {} };
  // 窄屏（手机 / 8 寸竖屏 ≤820）：页面内键盘默认收起，不然加了商品后「现金 / 刷卡」被挤到首屏外（B18）；点 ⌨ 展开，不记住
  const narrowPad = () => innerWidth <= 820;
  setPad(narrowPad() ? false : padOn(), !narrowPad());
  // 转屏 / 改窗口宽度跨过 820 时重新判断：变窄收起、变宽按记住的设置（B43）
  let wasNarrow = narrowPad();
  addEventListener("resize", () => { const n = narrowPad(); if (n === wasNarrow) return; wasNarrow = n; setPad(n ? false : padOn(), false); });
  // ---- 键盘大小：按键高度 --kh（字号、圆角跟着变）。默认按屏幕高度；拖过就记住 ----
  const KH_MIN = 30, KH_MAX = 96;
  const autoKh = () => Math.round(Math.max(36, Math.min(64, innerHeight * 0.058)));
  const savedKh = () => { try { return Number(localStorage.getItem("retail_pad_kh")) || 0; } catch { return 0; } };
  // 键盘最多占屏幕一半左右，给购物车留地方
  const capKh = (kh) => Math.max(KH_MIN, Math.min(KH_MAX, kh, Math.floor((innerHeight * 0.5) / 4.6)));
  const applyKh = (kh) => { $("#sellPad").style.setProperty("--kh", capKh(kh) + "px"); };
  applyKh(savedKh() || autoKh());
  addEventListener("resize", () => applyKh(savedKh() || autoKh()));
  // ---- 左右拖动调整「字母区 / 数字区」宽度（数字区宽度 --sp-num-w，记在本机；双击分隔条恢复默认）----
  const NUMW_DEF = 260, NUMW_MIN = 160, NUMW_MAX = 460;
  const savedNumW = () => { try { return Number(localStorage.getItem("retail_pad_numw")) || 0; } catch { return 0; } };
  const applyNumW = (w) => { $("#sellPad").style.setProperty("--sp-num-w", Math.max(NUMW_MIN, Math.min(NUMW_MAX, Math.round(w))) + "px"); };
  applyNumW(savedNumW() || NUMW_DEF);
  {
    const sp = $("#spSplit");
    let x0 = 0, w0 = 0, dragging = false, moved = false;
    sp.addEventListener("pointerdown", (e) => { e.preventDefault(); dragging = true; moved = false; x0 = e.clientX; w0 = parseFloat(getComputedStyle($("#sellPad")).getPropertyValue("--sp-num-w")) || NUMW_DEF; sp.setPointerCapture(e.pointerId); $("#sellPad").classList.add("resizing"); });
    sp.addEventListener("pointermove", (e) => { if (!dragging) return; if (Math.abs(e.clientX - x0) > 3) moved = true; if (moved) applyNumW(w0 - (e.clientX - x0)); }); // 向左拖 = 数字区变大
    const end = () => { if (!dragging) return; dragging = false; $("#sellPad").classList.remove("resizing"); if (!moved) return; const w = parseFloat(getComputedStyle($("#sellPad")).getPropertyValue("--sp-num-w")) || NUMW_DEF; try { localStorage.setItem("retail_pad_numw", String(Math.round(w))); } catch {} };
    sp.addEventListener("pointerup", end);
    sp.addEventListener("pointercancel", end);
    sp.addEventListener("dblclick", () => { try { localStorage.removeItem("retail_pad_numw"); } catch {} applyNumW(NUMW_DEF); });
  }
  {
    const grip = $("#spGrip");
    let y0 = 0, kh0 = 0, cur = 0, dragging = false, moved = false, lastTap = 0;
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true; moved = false; y0 = e.clientY; kh0 = parseFloat(getComputedStyle($("#sellPad")).getPropertyValue("--kh")) || autoKh(); cur = kh0;
      grip.setPointerCapture(e.pointerId);
      $("#sellPad").classList.add("resizing");
    });
    grip.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // 往上拖变大、往下拖变小（键盘有 4 排，每排都跟着变）
      if (Math.abs(e.clientY - y0) > 4) moved = true;
      if (!moved) return;
      cur = kh0 - (e.clientY - y0) / 4.4;
      applyKh(cur);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      $("#sellPad").classList.remove("resizing");
      // 没拖动 = 点了一下；两下（触摸屏上也行）= 恢复默认大小
      if (!moved) {
        if (Date.now() - lastTap < 400) { lastTap = 0; try { localStorage.removeItem("retail_pad_kh"); } catch {} applyKh(autoKh()); }
        else lastTap = Date.now();
        return;
      }
      if (cur < KH_MIN - 8) { applyKh(savedKh() || autoKh()); setPad(false); $("#sellInput").focus(); return; } // 拖到底：收起
      const kh = capKh(cur);
      try { localStorage.setItem("retail_pad_kh", String(Math.round(kh))); } catch {}
      applyKh(kh);
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }
  $("#padToggle").onclick = () => { setPad($("#sellPad").hidden, !narrowPad()); $("#sellInput").focus(); };
  // 按键不抢输入框的焦点（扫码枪照样能扫）
  $("#sellPad").addEventListener("pointerdown", (e) => { if (e.target.closest("[data-k]")) e.preventDefault(); });
  // 键盘打到哪：最后点的是收款面板的输入框（现金实收 / 刷卡 / 餐券）就打到那里，否则打到扫码框
  let padTarget = null;
  $("#sellTender").addEventListener("focusin", (e) => {
    if (!e.target.matches(".tn-grid input")) return;
    padTarget = e.target;
    if (document.documentElement.classList.contains("touch") && $("#sellPad").hidden && !narrowPad()) setPad(true, false); // 触摸屏：临时打开收银键盘（不改记住的设置）
  });
  $("#sellInput").addEventListener("focus", () => { padTarget = null; });
  sellOff = softScan($("#sellInput"), focusInput); // B44：没有实体键盘时不弹系统输入法，亲手点才弹
  $("#sellPad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    const k = b.dataset.k;
    if (padTarget && document.body.contains(padTarget)) {
      const t = padTarget;
      if (k === "ok") { collect("cash"); return; }
      if (!/^[0-9,]$/.test(k) && k !== "back" && k !== "clear") return; // 金额框只收数字（字母、重音、空格、× 都挡掉）
      if (k === "back") t.value = t.value.slice(0, -1); else if (k === "clear") t.value = ""; else t.value += k;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.focus();
      return;
    }
    const inp = $("#sellInput");
    if (k === "ok") { const v = inp.value; inp.value = ""; onScanEnter(v).catch((err) => { beep(false); toast(err.message, "error"); }); }
    else if (k === "back") inp.value = inp.value.slice(0, -1);
    else if (k === "clear") inp.value = "";
    else inp.value += k;
    inp.focus();
  });
  $("#sellInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = e.target.value;
    e.target.value = "";
    onScanEnter(v).catch((err) => { beep(false); toast(err.message, "error"); });
  });

  // 扫到没录过的条码
  function unknownBarcode(code, message) {
    if (message) return toast(message, "error");
    const canCreate = isAdmin();
    const m = openModal({
      title: `没有这个商品：${code}`,
      body: `<p class="muted" style="margin-top:0">可以马上新建，建好直接加到这一单。${canCreate ? "" : "收银员新建商品要店长输入 PIN。"}</p>
        <div class="rt-grid form-grid">
          <label>商品名称<input type="text" id="nqName" maxlength="60" autocomplete="off"></label>
          <label>售价<input type="text" id="nqPrice" inputmode="decimal" placeholder="如 2.50"></label>
          <label>分类<select id="nqCat">${R.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
          <label class="chk"><input type="checkbox" id="nqWeighed"> 称重商品（售价是每公斤价格）</label>
          ${canCreate ? "" : `<label>店长 PIN<input type="password" id="nqPin" inputmode="numeric" maxlength="8"></label>`}
        </div>`,
      buttons: [
        { label: "取消" },
        { label: "新建并加入", kind: "primary", onClick: async () => {
          const name = $("#nqName").value.trim();
          const price = toCents($("#nqPrice").value);
          if (!name) throw new Error("请填写商品名称");
          if (!(price >= 0)) throw new Error("请填写正确的售价");
          const g = await api("/api/retail/goods", { method: "POST", body: { name, price_cents: price, category_id: Number($("#nqCat").value), barcodes: [code], weighed: $("#nqWeighed").checked, admin_pin: $("#nqPin")?.value } });
          R.catalogAt = 0;
          setTimeout(() => (g.weighed ? weighAndAdd(g) : addLine(g)), 50);
        } },
      ],
      onClose: () => setTimeout(focusInput, 30),
    });
    loadCats().then(() => { $("#nqCat", m.el).innerHTML = R.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(""); }).catch(() => {});
    setTimeout(() => $("#nqName", m.el)?.focus(), 30);
  }

  // ---------- 称重 ----------
  async function scaleCfg() {
    if (!R.scaleCfg) R.scaleCfg = await api("/api/retail/scale").catch(() => ({ configured: false }));
    return R.scaleCfg;
  }
  function renderScaleChip() {
    const chip = $("#sellScale");
    if (!R.scaleCfg?.configured) return chip.classList.add("hidden");
    chip.classList.remove("hidden");
    chip.textContent = R.scaleCfg.error ? "⚖ 秤没连上" : `⚖ ${R.scaleCfg.port}`;
    chip.classList.toggle("bad", Boolean(R.scaleCfg.error));
    chip.title = R.scaleCfg.error || "电子秤已连接";
  }
  function weighAndAdd(item) {
    let timer = null, live = null;
    const m = openModal({
      title: `称重：${item.full_name || item.name}`,
      body: `<div class="weigh">
        <div class="weigh-live" id="wLive">${R.scaleCfg?.configured ? "正在读秤…" : ""}</div>
        <label>重量（公斤）<input type="text" id="wKg" inputmode="decimal" placeholder="如 0.512" autocomplete="off"></label>
        <div class="muted" id="wCalc">${money(item.price_cents)}/kg</div>
        <p class="muted" style="font-size:12px">${R.scaleCfg?.configured ? "放到秤上，读数稳定后按回车。" : IS_ANDROID() ? "平板暂不支持直接读秤，请手动输入重量。" : "没有连电子秤：看秤上的重量手动输入。连秤在「设置 → 员工与设备 → 设备 → 超市：条码秤、电子秤、改价」。"}</p></div>`,
      buttons: [{ label: "取消" }, { label: IS_ANDROID() ? "加入" : "加入 (Enter)", kind: "primary", onClick: () => confirm() }],
      onClose: () => { clearInterval(timer); setTimeout(focusInput, 30); },
    });
    const input = $("#wKg", m.el);
    const calc = () => {
      const kg = Number(String(input.value).replace(",", "."));
      $("#wCalc", m.el).textContent = kg > 0 ? `${fmtQty(kg)} kg × ${money(item.price_cents)}/kg = ${money(Math.round(kg * item.price_cents))}` : `${money(item.price_cents)}/kg`;
    };
    input.oninput = calc;
    const confirm = () => {
      const kg = Number(String(input.value || (live?.stable ? live.weight : "")).replace(",", "."));
      if (!(kg > 0)) { toast("请放到秤上或输入重量", "error"); return false; }
      addLine(item, { weight: Math.round(kg * 1000) / 1000 });
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (confirm() !== false) m.close(); } });
    setTimeout(() => input.focus(), 30);
    scaleCfg().then((cfg) => {
      if (!cfg.configured) return;
      const poll = async () => {
        try {
          live = await api("/api/retail/scale");
          R.scaleCfg = live;
          const box = $("#wLive", m.el);
          if (!box) return clearInterval(timer);
          if (live.error) box.innerHTML = `<span class="bad">${esc(live.error)}</span>`;
          else if (live.weight != null) {
            box.innerHTML = `<b class="num">${fmtQty(live.weight)} kg</b> ${live.stable ? `<span class="badge ok">稳定</span>` : `<span class="badge warn">晃动中</span>`}`;
            if (live.stable && live.weight > 0 && document.activeElement !== input) input.value = fmtQty(live.weight);
            if (live.stable && live.weight > 0 && !input.dataset.typed) { input.value = fmtQty(live.weight); calc(); }
          }
        } catch {}
      };
      input.addEventListener("input", () => (input.dataset.typed = "1"));
      poll();
      timer = setInterval(poll, 400);
    });
  }

  // ---------- 找商品（没有条码的） ----------
  async function openFind(q = "") {
    await loadCatalog();
    let idx = 0, hits = [];
    const m = openModal({
      title: "找商品",
      wide: true,
      body: `<input type="search" id="fQ" placeholder="商品名、拼音首字母、条码、编号" value="${esc(q)}" autocomplete="off" style="width:100%">
        <div class="find-list" id="fList"></div>`,
      onClose: () => setTimeout(focusInput, 30),
    });
    const draw = () => {
      hits = searchCatalog($("#fQ", m.el).value, 40);
      idx = Math.min(idx, Math.max(0, hits.length - 1));
      $("#fList", m.el).innerHTML = hits.length ? hits.map((g, i) => `<button class="find-row ${i === idx ? "on" : ""}" data-i="${i}">
          <span>${hotBadge(g)}<span translate="no">${esc(g.name)}</span></span><span class="muted num">${esc(g.barcode || g.code || "")}</span>
          <b class="num">${money(g.price_cents)}${g.weighed ? "/kg" : ""}</b>${g.stock != null ? `<span class="muted">库存 ${fmtQty(g.stock)}</span>` : ""}</button>`).join("")
        : `<p class="muted">没有找到。可以在「商品」页新建。</p>`;
    };
    const pick = (i) => { const g = hits[i]; if (!g) return; m.close(); setTimeout(() => (g.weighed ? weighAndAdd(g) : addLine(g)), 30); };
    $("#fQ", m.el).oninput = () => { idx = 0; draw(); };
    $("#fQ", m.el).onkeydown = (e) => {
      if (e.key === "ArrowDown") { idx = Math.min(hits.length - 1, idx + 1); draw(); e.preventDefault(); }
      if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      if (e.key === "Enter") { e.preventDefault(); pick(idx); }
    };
    $("#fList", m.el).onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) pick(Number(b.dataset.i)); };
    draw();
    setTimeout(() => $("#fQ", m.el).focus(), 30);
  }

  // ---------- 改数量 / 改价 / 删除 ----------
  function selLine() { return R.cart[R.sel] || R.cart[R.cart.length - 1]; }
  function askNumber({ title, label, value = "", hint = "", onOk }) {
    const m = openModal({
      title,
      body: `<label style="display:block">${esc(label)}<input type="text" id="anV" inputmode="decimal" value="${esc(String(value))}" autocomplete="off" style="width:100%;font-size:22px"></label>${hint ? `<p class="muted" style="font-size:12px">${hint}</p>` : ""}`,
      buttons: [{ label: "取消" }, { label: "确定", kind: "primary", onClick: () => onOk($("#anV").value) }],
      onClose: () => setTimeout(focusInput, 30),
    });
    const input = $("#anV", m.el);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); try { if (onOk(input.value) !== false) m.close(); } catch (err) { toast(err.message, "error"); } } });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function editQty() {
    const l = selLine();
    if (!l) return;
    if (l.weighed) {
      return askNumber({ title: `改重量：${l.name}`, label: "重量（公斤）", value: fmtQty(l.weight), onOk: (v) => {
        const kg = Number(String(v).replace(",", "."));
        if (!(kg > 0)) throw new Error("重量要大于 0");
        l.weight = Math.round(kg * 1000) / 1000; l.barcode = null; renderSell();
      } });
    }
    askNumber({ title: `改数量：${l.name}`, label: "数量", value: l.qty, onOk: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error("数量要是 0~9999 的整数");
      if (n === 0) R.cart.splice(R.cart.indexOf(l), 1); else l.qty = n;
      renderSell();
    } });
  }
  function editPrice() {
    const l = selLine();
    if (!l) return;
    if (!isAdmin() && S.settings?.retail_price_edit !== "all") return toast("只有店长可以改价（可以在设置里允许收银员改价）", "error");
    askNumber({ title: `改价：${l.name}`, label: l.weighed ? "每公斤单价" : "单价", value: amt(l.price), hint: `原价 ${money(l.orig)}${l.weighed ? "/kg" : ""}。也可以输入「8折」或「-20%」。会记入操作日志。`, onOk: (v) => {
      const s = String(v).trim();
      let cents;
      const zhe = /^(\d+(?:\.\d)?)\s*折$/.exec(s), pct = /^-\s*(\d+(?:\.\d+)?)\s*%$/.exec(s);
      if (zhe) cents = Math.round(l.orig * Number(zhe[1]) / (zhe[1].length === 1 ? 10 : 100));
      else if (pct) cents = Math.round(l.orig * (100 - Number(pct[1])) / 100);
      else cents = toCents(s);
      if (!(cents >= 0)) throw new Error("请输入正确的价格");
      l.price = cents;
      renderSell();
    } });
  }
  function delLine(i = R.sel) {
    if (i < 0 || !R.cart[i]) return;
    R.cart.splice(i, 1);
    R.sel = Math.min(i, R.cart.length - 1);
    renderSell();
  }
  async function clearCart(ask = true) {
    if (!R.cart.length) return;
    if (ask && R.cart.length > 2 && !(await confirmModal("清空这一单？", `${R.cart.length} 行商品都会清掉（没有收钱，不记账）`, "清空", "danger"))) return focusInput();
    R.cart = []; R.sel = -1; R.discount = null; R.roundOff = false;
    renderSell();
  }
  $("#sellCart").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    const i = Number(tr.dataset.i);
    R.sel = i;
    const q = e.target.closest("[data-q]");
    if (q) {
      const l = R.cart[i];
      l.qty += Number(q.dataset.q);
      if (l.qty <= 0) return delLine(i);
    }
    if (e.target.closest("[data-del]")) return delLine(i);
    renderSell();
  });
  $("#sellCart").addEventListener("dblclick", (e) => { if (e.target.closest("tr[data-i]") && !e.target.closest("button")) editQty(); });

  // ---------- 打折 / 抹零 ----------
  function openDiscount() {
    if (!R.cart.length) return;
    const t = totals();
    const m = openModal({
      title: "整单打折 / 抹零",
      body: `<p class="muted" style="margin-top:0">小计 ${money(t.subtotal)}。会记入操作日志。</p>
        <div class="seg" id="dPct">${[5, 10, 15, 20, 30, 50].map((p) => `<button data-p="${p}" class="${R.discount?.type === "percent" && R.discount.value === p ? "on" : ""}">−${p}%</button>`).join("")}</div>
        <div class="rt-grid form-grid" style="margin-top:10px">
          <label>减免金额<input type="text" id="dAmt" inputmode="decimal" placeholder="如 2" value="${R.discount?.type === "amount" ? amt(R.discount.value) : ""}"></label>
          <label>原因<input type="text" id="dWhy" maxlength="30" value="${esc(R.discount?.reason || "")}" placeholder="如 会员、临期"></label>
          <label class="chk"><input type="checkbox" id="dRound" ${R.roundOff ? "checked" : ""}> 抹零（去掉角分）</label>
        </div>`,
      buttons: [
        { label: "取消优惠", onClick: () => { R.discount = null; R.roundOff = false; renderSell(); } },
        { label: "确定", kind: "primary", onClick: () => {
          const a = $("#dAmt").value.trim();
          if (a) { const c = toCents(a); if (!(c > 0)) throw new Error("减免金额不正确"); R.discount = { type: "amount", value: c, reason: $("#dWhy").value.trim() }; }
          R.roundOff = $("#dRound").checked;
          if (R.discount) R.discount.reason = $("#dWhy").value.trim();
          renderSell();
        } },
      ],
      onClose: () => setTimeout(focusInput, 30),
    });
    $("#dPct", m.el).onclick = (e) => {
      const b = e.target.closest("[data-p]");
      if (!b) return;
      R.discount = { type: "percent", value: Number(b.dataset.p), reason: $("#dWhy", m.el).value.trim() };
      $("#dAmt", m.el).value = "";
      m.el.querySelectorAll("#dPct button").forEach((x) => x.classList.toggle("on", x === b));
    };
  }

  // ---------- 收款 ----------
  let paying = false;
  async function submitSale(payments, received, methodLabel) {
    if (paying) return;
    paying = true;
    try {
      const t = totals();
      const lines = R.cart.map((l) => {
        const o = { item_id: l.item_id };
        if (l.weighed) { if (l.barcode) o.barcode = l.barcode; else o.weight = l.weight; } else o.qty = l.qty;
        if (l.price !== l.orig) o.price_cents = l.price;
        return o;
      });
      const order = await api("/api/retail/sale", { method: "POST", body: { lines, discount: R.discount, round_off: R.roundOff, payments, request_id: R.reqId || (R.reqId = requestId()) } });
      if (order.total_cents !== t.total) console.warn("合计不一致", order.total_cents, t.total);
      const change = received ? received - order.total_cents : 0;
      R.last = { id: order.id, total: order.total_cents, received, change: Math.max(0, change), method: methodLabel, printed: S.settings?.receipt_auto !== false };
      R.cart = []; R.sel = -1; R.discount = null; R.roundOff = false; R.reqId = null;
      DisplayOut.push({ mode: "thanks", total: order.total_cents, change: Math.max(0, change) });
      toast(change > 0 ? `收款成功，找零 ${money(change)}` : "收款成功", "success");
      if (change > 0 && typeof flashChange === "function") flashChange(change); // 和餐馆一致：收完款大字「找零 €X」，数钱一眼看到
      renderSell();
      loadCatalog(true).catch(() => {});
      return true;
    } finally {
      paying = false;
    }
  }
  // 右边收款面板：
  //   💶 现金（F12）= 剩下的全收现金（「现金实收」填了就按它算找零，没填 = 刚好）；点面额（10 / 20 / 50 €）= 顾客给这张钱，一下收完
  //   💳 刷卡（F9）= 剩下的全刷卡：连了刷卡机就直接把金额发过去；没连就再按一次确认（刷卡机收好了再按）
  //   分开付：填「刷卡」「餐券」金额，剩下的收现金，按回车或「按填的金额收款」
  var vType = "", cardArmed = 0; // var：renderSell 可能比这里先跑
  const tnVal = (id) => { const v = $(id)?.value.trim(); return v ? toCents(v) : 0; };
  function tender() {
    const t = totals();
    const card = tnVal("#tnCard"), v = R.voucherOn ? tnVal("#tnV") : 0, recv = tnVal("#tnCash");
    const cashPart = t.total - card - v;
    return { t, card, v, recv, cashPart };
  }
  function renderTender() {
    R.voucherOn = Boolean(S.settings?.pay_voucher);
    $(".tn-v").hidden = !R.voucherOn;
    const types = R.voucherOn ? S.settings?.voucher_types || [] : [];
    const vt = $("#tnVTypes");
    vt.hidden = !types.length || !tnVal("#tnV"); // 填了餐券金额才问是哪家的
    vt.innerHTML = types.length ? `<span class="muted">餐券：</span>${types.map((x) => `<button type="button" class="chip ${x === vType ? "on" : ""}" data-vt="${esc(x)}">${esc(x)}</button>`).join("")}` : "";
    const { t, card, v, recv, cashPart } = tender();
    const has = R.cart.length > 0;
    const bills = has ? [...new Set([Math.ceil(t.total / 500) * 500, ...[1000, 2000, 5000, 10000]])].filter((b) => b > t.total).slice(0, 4) : [];
    $("#tnBills").innerHTML = bills.map((b) => `<button type="button" data-bill="${b}" title="顾客给 ${money(b)}，找零 ${money(b - t.total)}">${moneyShort ? moneyShort(b) : money(b)}</button>`).join("");
    let st = "";
    if (has && (card || v || recv)) {
      if (cashPart < 0) st = `<span class="bad">刷卡 + 餐券超过应收了</span>`;
      else if (recv && recv < cashPart) st = `<span class="bad">现金还差 <b class="num">${money(cashPart - recv)}</b></span>`;
      else st = [card ? `刷卡 ${money(card)}` : "", v ? `餐券 ${money(v)}` : "", cashPart ? `现金 ${money(cashPart)}` : ""].filter(Boolean).join(" + ") + (recv > cashPart ? `　<span class="good">找零 <b class="num">${money(recv - cashPart)}</b></span>` : "");
    }
    $("#tnStatus").innerHTML = st;
    $("#payMixed").disabled = !has;
    $("#payMixed").hidden = !(card || v || recv); // 填了金额才显示（平时直接点现金 / 刷卡 / 面额）
    $("#payCard").classList.toggle("armed", Boolean(cardArmed));
    $("#payCard").innerHTML = cardArmed ? `${esc(I18N.t("刷卡机收好了？再按确认"))} ${fnKey("F9")}` : `💳 刷卡 ${fnKey("F9")}`; // B45：整句先翻好再拼键帽（键帽拼进去后自动翻译对不上）
  }
  function resetTender() { for (const id of ["#tnCash", "#tnCard", "#tnV"]) if ($(id)) $(id).value = ""; vType = ""; cardArmed = 0; }
  // 按面板上的金额收款；rest = 剩下的部分算现金还是刷卡
  async function collect(rest, { bill = 0 } = {}) {
    if (!R.cart.length || paying) return;
    let { t, card, v, recv, cashPart } = tender();
    if (bill) recv = bill;
    if (rest === "card") { card = t.total - v; cashPart = 0; recv = 0; }
    if (cashPart < 0 || card < 0 || v < 0) return toast("刷卡 + 餐券超过应收了", "error");
    if (v > t.total) return toast("餐券不能超过应收", "error");
    const cashRecv = cashPart > 0 ? recv || cashPart : 0;
    if (cashRecv < cashPart) return toast(`现金还差 ${money(cashPart - cashRecv)}`, "error");
    const pays = [];
    if (card > 0) {
      // 刷卡：连了刷卡机 → 金额直接发过去；没连 → 第一次按「准备」，再按一次才算（防止还没刷就记账）
      if (!S.settings?.terminal_mode && rest === "card" && !cardArmed) {
        cardArmed = setTimeout(() => { cardArmed = 0; renderTender(); }, 8000);
        DisplayOut.push({ ...cartForDisplay(), mode: "order" });
        renderTender();
        return;
      }
      clearTimeout(cardArmed); cardArmed = 0;
      const c = await chargeCard(card);
      if (!c.ok) { renderTender(); return; }
      pays.push({ method: "card", amount_cents: card, via_terminal: c.via_terminal || undefined });
    }
    if (v > 0) pays.push({ method: "voucher", amount_cents: v, voucher_type: vType || undefined });
    if (cashPart > 0) pays.push({ method: "cash", amount_cents: cashPart, received_cents: cashRecv });
    const label = pays.length > 1 ? "混合付款" : pays[0]?.method === "card" ? "刷卡" : pays[0]?.method === "voucher" ? "餐券" : "现金";
    const okSale = await submitSale(pays, cashPart > 0 ? t.total + (cashRecv - cashPart) : 0, label).catch((err) => { toast(err.message, "error"); return false; });
    if (okSale) resetTender();
    renderTender();
    focusInput();
  }
  function payCash() { collect("cash"); }
  function payCard() { collect("card"); }
  function payMixed() { collect("cash"); }
  $("#sellTender").addEventListener("input", () => { clearTimeout(cardArmed); cardArmed = 0; renderTender(); });
  $("#sellTender").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".tn-grid")) { e.preventDefault(); collect("cash"); } if (e.key === "Escape") { e.preventDefault(); resetTender(); renderTender(); focusInput(); } });
  $("#sellTender").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bill]");
    if (b) return collect("cash", { bill: Number(b.dataset.bill) });
    const vt = e.target.closest("[data-vt]");
    if (vt) { vType = vType === vt.dataset.vt ? "" : vt.dataset.vt; renderTender(); }
  });

  // ---------- 挂单 / 取单 ----------
  async function holdCart(silent) {
    if (!R.cart.length) return;
    await api("/api/retail/holds", { method: "POST", body: { cart: { lines: R.cart, discount: R.discount, round_off: R.roundOff, total_cents: totals().total } } });
    R.cart = []; R.sel = -1; R.discount = null; R.roundOff = false;
    if (!silent) toast(noAutoFocus() ? "已挂单，点「取单」取回" : "已挂单，按 F5 取回", "success"); // B59：没有 F 键提示时说点按钮
    renderSell();
    refreshBadges();
  }
  async function takeHold() {
    const holds = await api("/api/retail/holds");
    if (!holds.length) { toast("没有挂起的单", "info"); return focusInput(); }
    const m = openModal({
      title: `取单（${holds.length}）`,
      body: `<div class="find-list">${holds.map((h, i) => `<button class="find-row" data-i="${i}"><span>${esc(h.created_at.slice(11, 16))} · ${h.line_count} 行</span>
        <span class="muted">${esc(h.staff_name || "")}</span><b class="num">${money(h.total_cents)}</b></button>`).join("")}</div>`,
      onClose: () => setTimeout(focusInput, 30),
    });
    m.el.querySelector(".find-list").onclick = async (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      try {
        if (R.cart.length) await holdCart(true);
        const h = await api(`/api/retail/holds/${holds[Number(b.dataset.i)].id}/take`, { method: "POST" });
        R.cart = h.cart.lines || []; R.discount = h.cart.discount || null; R.roundOff = Boolean(h.cart.round_off); R.sel = R.cart.length - 1;
        m.close();
        renderSell();
        refreshBadges();
      } catch (err) { toast(err.message, "error"); }
    };
  }

  // ---------- 退货 ----------
  function openReturn(orderId) {
    const m = openModal({
      title: "退货",
      wide: true,
      body: `<div class="inline-form"><input type="text" id="rtCode" placeholder="扫小票底部的条码，或输入单号" autocomplete="off" style="flex:1"><button class="btn" id="rtFind">查找</button></div>
        <div id="rtBody" style="margin-top:12px"></div>`,
      onClose: () => setTimeout(focusInput, 30),
    });
    const load = async (raw) => {
      const id = Number(String(raw).trim().replace(/^S/i, ""));
      if (!id) return;
      const o = await api(`/api/retail/returns/${id}`);
      const paid = o.payments.reduce((s, p) => s + p.amount_cents, 0);
      const ratio = o.subtotal_cents ? (o.total_cents - (o.extra_cents || 0)) / o.subtotal_cents : 1;
      const methods = [...new Set(o.payments.map((p) => (p.method === "voucher" ? "cash" : p.method)))];
      const MN = { cash: "现金", card: "刷卡", online: "网上付款", platform: "平台" };
      $("#rtBody", m.el).innerHTML = `
        <p>单号 <b>${o.id}</b> · ${esc(o.closed_at || "")} · 实收 ${money(paid)}${o.refunded_cents ? ` · 已退 ${money(o.refunded_cents)}` : ""}${o.status === "cancelled" ? ` · <span class="bad">已作废</span>` : ""}</p>
        <table class="list"><thead><tr><th></th><th>商品</th><th class="r">买了</th><th class="r">已退</th><th class="r">这次退</th><th class="r">退款</th></tr></thead><tbody>
        ${o.items.map((i) => { const left = i.qty - (i.returned_qty || 0); return `<tr data-id="${i.id}" data-left="${left}" data-unit="${Math.round(i.price_cents * ratio)}">
          <td><input type="checkbox" ${left ? "" : "disabled"}></td><td translate="no">${esc(i.name_at_order)}${i.weight ? ` <span class="muted">${fmtQty(i.weight)} kg</span>` : ""}</td>
          <td class="r num">${i.qty}</td><td class="r num">${i.returned_qty || 0}</td>
          <td class="r"><input type="number" min="1" max="${left}" value="${left}" style="width:64px" ${left && !i.weight ? "" : "disabled"}></td><td class="r num rt-amt"></td></tr>`; }).join("")}
        </tbody></table>
        <div class="rt-grid form-grid" style="margin-top:10px">
          <label>退款方式<select id="rtMethod">${methods.map((k) => `<option value="${k}">${MN[k] || k}</option>`).join("")}${methods.includes("cash") ? "" : `<option value="cash">现金</option>`}</select></label>
          <label>原因<input type="text" id="rtWhy" maxlength="40" value="顾客退货"></label>
          <label>店长 PIN<input type="password" id="rtPin" inputmode="numeric" maxlength="8"></label>
        </div>
        <div class="pay-change" id="rtSum"></div>
        <p class="muted" style="font-size:12px">按原单的实际成交价退（原单打过折就按打折后的价格），退回的商品自动加回库存。</p>
        <button class="btn primary" id="rtGo" disabled>确认退货</button>`;
      const rows = () => [...m.el.querySelectorAll("#rtBody tbody tr")];
      const sum = () => {
        let total = 0;
        for (const tr of rows()) {
          const on = tr.querySelector("input[type=checkbox]").checked;
          const q = Math.min(Number(tr.dataset.left), Math.max(1, Number(tr.querySelector("input[type=number]").value) || 1));
          const a = on ? Number(tr.dataset.unit) * q : 0;
          tr.querySelector(".rt-amt").textContent = on ? money(a) : "";
          total += a;
        }
        total = Math.min(total, paid - o.refunded_cents);
        $("#rtSum", m.el).innerHTML = total ? `退给顾客 <b class="num">${money(total)}</b>` : "";
        $("#rtGo", m.el).disabled = !total;
      };
      $("#rtBody", m.el).addEventListener("input", sum);
      $("#rtBody", m.el).addEventListener("change", sum);
      $("#rtGo", m.el).onclick = async () => {
        const lines = rows().filter((tr) => tr.querySelector("input[type=checkbox]").checked)
          .map((tr) => ({ order_item_id: Number(tr.dataset.id), qty: Math.min(Number(tr.dataset.left), Math.max(1, Number(tr.querySelector("input[type=number]").value) || 1)) }));
        try {
          const r = await api("/api/retail/returns", { method: "POST", body: { order_id: o.id, lines, method: $("#rtMethod", m.el).value, reason: $("#rtWhy", m.el).value, admin_pin: $("#rtPin", m.el).value } });
          toast(`已退货，退给顾客 ${money(r.amount_cents)}`, "success");
          m.close();
          loadCatalog(true).catch(() => {});
        } catch (err) { toast(err.message, "error"); }
      };
      sum();
    };
    const find = () => load($("#rtCode", m.el).value).catch((err) => toast(err.message, "error"));
    $("#rtFind", m.el).onclick = find;
    $("#rtCode", m.el).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); find(); } });
    if (orderId) { $("#rtCode", m.el).value = String(orderId); find(); } else setTimeout(() => $("#rtCode", m.el).focus(), 30);
  }

  function openHelp() {
    openModal({
      title: "收银快捷键",
      body: `<table class="list"><tbody>${[
        ["扫码 / 回车", "加入商品（同一商品自动合并数量）"], ["3* 再扫", "一次加 3 件"], ["F1", "这个帮助"], ["F2", "改选中行的数量（称重商品改重量）"],
        ["F3", "改价（默认只有店长可以）"], ["F4", "挂单"], ["F5", "取单"], ["F6", "称重（选商品后读秤）"], ["F7", "找商品（没有条码的）"],
        ["F8", "整单打折 / 抹零"], ["F9", "刷卡收款"], ["F12", "现金收款"], ["↑ ↓", "选行"], ["+ / -", "选中行数量加减"], ["Del", "删除选中行"], ["Esc", "清空这一单"],
        ["扫小票底部条码", "打开退货"],
      ].map(([k, v]) => `<tr><td>${kbdTag(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table>`,
      onClose: () => setTimeout(focusInput, 30),
    });
  }
  async function weighPick() {
    await loadCatalog();
    const weighed = R.catalog.filter((g) => g.weighed);
    if (!weighed.length) return toast("还没有称重商品：在「商品」里把商品设成「称重」", "info");
    openFind("");
    setTimeout(() => {
      const q = document.querySelector("#fQ");
      if (!q) return;
      q.placeholder = "称重商品：输入名称或秤号";
    }, 40);
  }

  $("#payCash").onclick = payCash;
  $("#payCard").onclick = payCard;
  $("#payMixed").onclick = payMixed;
  $("#sellFind").onclick = () => openFind("");
  $("#sellWeigh").onclick = weighPick;
  $("#sellDisc").onclick = openDiscount;
  $("#sellHold").onclick = () => holdCart().catch((e) => toast(e.message, "error"));
  $("#sellTake").onclick = () => takeHold().catch((e) => toast(e.message, "error"));
  $("#sellReturn").onclick = () => openReturn();
  $("#sellClear").onclick = () => clearCart();
  $("#sellHelp").onclick = openHelp;

  document.addEventListener("keydown", (e) => {
    if (S.tab !== "sell" || !isRetail() || $("#app").classList.contains("hidden")) return;
    if (modalOpen()) return;
    const k = e.key;
    const fn = {
      F1: openHelp, F2: editQty, F3: editPrice, F4: () => holdCart().catch((x) => toast(x.message, "error")),
      F5: () => takeHold().catch((x) => toast(x.message, "error")), F6: weighPick, F7: () => openFind(""), F8: openDiscount, F9: payCard, F12: payCash,
    }[k];
    if (fn) { e.preventDefault(); fn(); return; }
    const inInput = document.activeElement === $("#sellInput");
    const empty = !$("#sellInput").value;
    if (k === "Escape" && empty) { e.preventDefault(); clearCart(); return; }
    if (k === "Delete" && empty) { e.preventDefault(); delLine(); return; }
    if (k === "ArrowDown" && R.cart.length) { e.preventDefault(); R.sel = Math.min(R.cart.length - 1, R.sel + 1); renderSell(); return; }
    if (k === "ArrowUp" && R.cart.length) { e.preventDefault(); R.sel = Math.max(0, R.sel - 1); renderSell(); return; }
    if ((k === "+" || k === "-") && empty && R.cart.length) {
      e.preventDefault();
      const l = selLine();
      if (l.weighed) return;
      l.qty += k === "+" ? 1 : -1;
      if (l.qty <= 0) delLine(R.cart.indexOf(l)); else renderSell();
      return;
    }
    // 焦点不在输入框时（点了别处）：扫码枪打进来的字也送到输入框
    if (!inInput && k.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest?.("input,textarea,select")) {
      $("#sellInput").focus();
    }
  }, true);
  document.addEventListener("click", () => setTimeout(focusInput, 0));

  // ================= 商品 =================
  async function loadCats() {
    R.cats = await api("/api/retail/categories");
    return R.cats;
  }
  async function loadGoods() {
    if (!isRetail()) return;
    await loadCats();
    const g = R.goods;
    const q = new URLSearchParams({ q: g.q, category_id: g.cat, offset: g.page * 100, limit: 100, ...(g.filter === "low" ? { low: 1 } : {}), ...(g.filter === "off" ? { inactive: "1" } : {}) });
    const r = await api(`/api/retail/goods?${q}`);
    g.items = r.items; g.total = r.total;
    renderGoods();
  }
  function renderGoods() {
    const g = R.goods;
    const pages = Math.max(1, Math.ceil(g.total / 100));
    const showCost = isAdmin();
    $("#goodsBody").innerHTML = `
      <div class="toolbar goods-tools">
        <button class="btn primary" id="gNew">+ 新商品</button>
        ${isStore() ? `<button class="btn" id="gVar">+ 多规格（尺码 × 颜色）</button>` : `<button class="btn" id="gVar">+ 多规格</button>`}
        <input type="search" id="gQ" placeholder="名称、拼音首字母、条码、编号" value="${esc(g.q)}" autocomplete="off" style="width:240px">
        <select id="gCat"><option value="">全部分类</option>${R.cats.map((c) => `<option value="${c.id}" ${String(c.id) === String(g.cat) ? "selected" : ""}>${esc(c.name)}（${c.count}）</option>`).join("")}</select>
        <div class="seg" id="gFilter"><button data-f="" class="${!g.filter ? "on" : ""}">全部</button><button data-f="low" class="${g.filter === "low" ? "on" : ""}">库存不足</button><button data-f="off" class="${g.filter === "off" ? "on" : ""}">已下架</button></div>
        <span class="muted">${g.total} 个</span>
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn" id="gLabels" ${g.sel.size ? "" : "disabled"}>🏷 打印价签${g.sel.size ? `（${g.sel.size}）` : ""}</button>
          <button class="btn" id="gLabelPhone" title="手机摄像头扫商品条码，选模板、张数，用手机连的蓝牙打印机直接打">📱 手机扫码打价签</button>
          <button class="btn g-more-btn" id="gMore" aria-expanded="false">⋯ 更多</button>
          <span class="g-more-items"><button class="btn" id="gCats">分类管理</button>
          <button class="btn" id="gExport">📤 导出 Excel</button>
          <button class="btn" id="gImport">📥 从 Excel 导入</button></span><input type="file" id="gFile" accept=".xlsx" hidden>
        </span>
      </div>
      <div class="scroll-x"><table class="list goods-table"><thead><tr>
        <th><input type="checkbox" id="gAll"></th><th class="g-pic-h" title="照片和介绍（网上商店用）">照片</th><th>商品</th><th class="g-bc">条码</th><th class="g-cat">分类</th><th class="r">售价</th>${showCost ? `<th class="r g-cost">进价</th><th class="r g-mg">毛利</th>` : ""}<th class="r">库存</th><th>供应商</th><th></th></tr></thead>
      <tbody>${g.items.map((x) => {
        const margin = x.cost_cents != null && x.price_cents ? Math.round(((x.price_cents - x.cost_cents) / x.price_cents) * 100) : null;
        const low = x.stock != null && x.stock_min != null && x.stock <= x.stock_min;
        return `<tr data-id="${x.id}" class="${x.is_active ? "" : "off"}">
        <td><input type="checkbox" data-sel ${g.sel.has(x.id) ? "checked" : ""}></td>
        <td class="g-pic-td">${picBtn(x)}</td>
        <td>${hotBadge(x)}<b translate="no">${esc(x.name)}</b>${x.variant ? ` <span class="badge" translate="no">${esc(x.variant)}</span>` : ""}${x.weighed ? ` <span class="badge">称重</span>` : ""}${x.is_active ? "" : ` <span class="badge">已下架</span>`}${x.plu ? ` <span class="muted">秤号 ${esc(x.plu)}</span>` : ""}</td>
        <td class="num g-bc" translate="no">${esc(x.barcodes.join(" ") || "")}</td>
        <td class="g-cat">${esc(x.category_name)}</td>
        <td class="r num">${money(x.price_cents)}${x.weighed ? "/kg" : ""}</td>
        ${showCost ? `<td class="r num g-cost">${x.cost_cents == null ? `<span class="muted">—</span>` : money(x.cost_cents)}</td><td class="r num g-mg ${margin != null && margin < 10 ? "bad" : ""}">${margin == null ? "" : margin + "%"}</td>` : ""}
        <td class="r num ${low ? "bad" : ""}">${x.stock == null ? `<span class="muted">不管</span>` : fmtQty(x.stock) + (UNIT_SHORT[x.unit] ? " " + UNIT_SHORT[x.unit] : "")}${low ? " ⚠" : ""}</td>
        <td>${esc(x.supplier)}</td>
        <td class="r"><button class="btn small" data-edit>编辑</button></td></tr>`;
      }).join("") || `<tr><td colspan="11" class="muted" style="text-align:center;padding:30px">还没有商品。点「+ 新商品」，或者用 Excel 批量导入（供应商给的表格也可以）。</td></tr>`}</tbody></table></div>
      ${pages > 1 ? `<div style="text-align:center;margin:12px 0" id="gPager">${g.page > 0 ? `<button class="btn small" data-p="${g.page - 1}">‹ 上一页</button>` : ""} 第 ${g.page + 1} / ${pages} 页 ${g.page + 1 < pages ? `<button class="btn small" data-p="${g.page + 1}">下一页 ›</button>` : ""}</div>` : ""}`;
    let tmr;
    $("#gQ").oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { g.q = e.target.value; g.page = 0; loadGoods().then(() => { const i = $("#gQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }).catch((x) => toast(x.message, "error")); }, 250); };
    $("#gCat").onchange = (e) => { g.cat = e.target.value; g.page = 0; loadGoods().catch((x) => toast(x.message, "error")); };
    $("#gFilter").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { g.filter = b.dataset.f; g.page = 0; loadGoods().catch((x) => toast(x.message, "error")); } };
    $("#gPager")?.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { g.page = Number(b.dataset.p); loadGoods().catch((x) => toast(x.message, "error")); } });
    $("#gNew").onclick = () => editGoods(null);
    $("#gVar").onclick = openVariants;
    $("#gCats").onclick = openCats;
    $("#gMore").onclick = (e) => { const box = $("#goodsBody .g-more-items"); box.classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", String(box.classList.contains("open"))); };
    $("#gExport").onclick = exportGoods;
    $("#gImport").onclick = () => $("#gFile").click();
    $("#gFile").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importGoods(f); };
    $("#gLabels").onclick = () => printLabels(g.items.filter((x) => g.sel.has(x.id)));
    $("#gLabelPhone").onclick = () => openLabelPhone();
    $("#gAll").onchange = (e) => { for (const x of g.items) e.target.checked ? g.sel.add(x.id) : g.sel.delete(x.id); renderGoods(); };
    $("#goodsBody tbody").onclick = (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const id = Number(tr.dataset.id);
      if (e.target.matches("[data-sel]")) { e.target.checked ? g.sel.add(id) : g.sel.delete(id); $("#gLabels").disabled = !g.sel.size; $("#gLabels").textContent = `🏷 打印价签${g.sel.size ? `（${g.sel.size}）` : ""}`; return; }
      if (e.target.closest("[data-edit]")) editGoods(g.items.find((x) => x.id === id));
      if (e.target.closest("[data-photo]")) openGoodsPhotos(g.items.find((x) => x.id === id));
    };
  }

  // ---- 照片和介绍（电商版 v1.38.3）：网上商店的照片、介绍、参数、详情图、单独邮费 ----
  // 多规格（同一个款名）：「整款」那一行（这一款第一个规格）写介绍、参数、详情图，全部规格共用；其他规格只放自己的照片（比如这个颜色的图）
  const isVariantRow = (x) => Boolean(x.style && x.variant && x.style_main_id !== x.id);
  const isStyleMain = (x) => Boolean(x.style && x.variant && x.style_main_id === x.id);
  function picBtn(x) {
    const p = (x.photos || [])[0];
    const tip = isVariantRow(x) ? "这个规格的照片" : isStyleMain(x) ? "整款的照片和介绍" : "照片和介绍";
    return `<button type="button" class="g-pic ${p ? "" : "empty"}" data-photo title="${tip}" aria-label="${tip}">${p ? `<img src="${esc(p.thumb || p.src)}" alt="" loading="lazy">` : "📷"}${isStyleMain(x) ? `<span class="g-pic-tag">款</span>` : ""}</button>`;
  }
  function openGoodsPhotos(x) {
    if (!x) return;
    const v = isVariantRow(x), main = isStyleMain(x);
    window.openPhotoEditor(x, {
      title: v ? `${x.full_name} 的照片` : main ? `照片和介绍：${x.name}（整款）` : `照片和介绍：${x.full_name}`,
      photosOnly: v,
      photoTip: v ? "这个规格单独的照片（比如这个颜色）：顾客在网上选到这个规格时显示。介绍、参数、详情图写在这一款带「款」字的那一行（整款）。"
        : main ? "整款的照片、介绍、参数、详情图：这一款所有规格共用。某个颜色想单独放图，在那个规格的那一行点照片。"
        : "第一张是封面；顾客在网上商店点开商品可以左右滑看全部照片。也可以用菜单页的「📱 手机传照片」直接拍。",
      onChange: () => loadGoods().catch(() => {}),
    });
  }

  function editGoods(x) {
    const isNew = !x;
    x = x || { name: "", variant: "", category_id: R.goods.cat || R.cats[0]?.id, price_cents: "", cost_cents: null, unit: "pc", weighed: false, stock: null, stock_min: null, supplier: "", plu: "", code: "", barcodes: [], is_active: true };
    const m = openModal({
      title: isNew ? "新商品" : `编辑：${x.full_name}`,
      wide: true,
      body: `<div class="rt-grid form-grid goods-form">
        <label>名称<input type="text" id="eName" maxlength="60" value="${esc(x.name)}"></label>
        <label>规格（百货：尺码 / 颜色）<input type="text" id="eVar" maxlength="30" value="${esc(x.variant || "")}" placeholder="如 M / 红，可不填"></label>
        <label>分类<select id="eCat">${R.cats.map((c) => `<option value="${c.id}" ${c.id === Number(x.category_id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label class="wide">条码（可以几个，用空格隔开；光标放这里直接扫）<input type="text" id="eCodes" value="${esc(x.barcodes.join(" "))}" autocomplete="off" placeholder="不填可以自动生成店内条码"></label>
        <label>售价<input type="text" id="ePrice" inputmode="decimal" value="${x.price_cents === "" ? "" : amt(x.price_cents)}"></label>
        <label>进价（算毛利，可不填）<input type="text" id="eCost" inputmode="decimal" value="${x.cost_cents == null ? "" : amt(x.cost_cents)}"></label>
        <label>单位<select id="eUnit">${Object.entries(UNIT).map(([k, v]) => `<option value="${k}" ${x.unit === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" id="eWeighed" ${x.weighed ? "checked" : ""}> 称重商品（售价是每公斤价格）</label>
        <label>秤上的商品号（PLU）<input type="text" id="ePlu" inputmode="numeric" maxlength="6" value="${esc(x.plu || "")}" placeholder="条码秤贴纸用"></label>
        <label>商品编号<input type="text" id="eCode" maxlength="20" value="${esc(x.code || "")}"></label>
        ${isNew ? `<label>现有库存<input type="text" id="eStock" inputmode="decimal" placeholder="不填 = 不管库存"></label>` : `<label>库存<input type="text" value="${x.stock == null ? "不管库存" : fmtQty(x.stock)}" disabled><span class="muted" style="font-size:12px">改库存请用「库存」页的进货 / 盘点 / 调整</span></label>`}
        <label>最低库存（低于这个数提醒补货）<input type="text" id="eMin" inputmode="decimal" value="${x.stock_min == null ? "" : fmtQty(x.stock_min)}"></label>
        <label>供应商<input type="text" id="eSup" maxlength="60" value="${esc(x.supplier || "")}" list="supList"></label>
        <label>保质期（天）<input type="text" id="eShelf" inputmode="numeric" maxlength="4" value="${x.shelf_days || ""}" placeholder="不填 = 价签上不印保质期"></label>
        <label class="chk"><input type="checkbox" id="eActive" ${x.is_active ? "checked" : ""}> 上架（可以卖）</label>
        <label class="chk"><input type="checkbox" id="eHot" ${x.featured ? "checked" : ""}> 爆款（列表和找商品里显示「爆款」小标）</label>
        </div>
        ${isNew ? `<label class="chk" style="margin-top:8px"><input type="checkbox" id="eAuto" checked> 没填条码时自动生成店内条码（200 开头，可以打印价签贴上）</label>` : ""}
        ${!isNew ? `<div style="margin-top:12px"><button class="btn small" id="eMoves">📜 库存记录</button> <button class="btn small" id="eAdj">± 调整库存</button> <button class="btn small" id="eLabel">🏷 打印价签</button></div>` : ""}`,
      buttons: [
        ...(isNew ? [] : [{ label: "删除", kind: "danger", onClick: async () => {
          if (!(await confirmModal("删除商品？", `「${x.full_name}」删除后不能再卖，历史订单和报表不受影响。`, "删除", "danger"))) return false;
          await api(`/api/retail/goods/${x.id}`, { method: "DELETE" });
          toast("已删除", "success");
          loadGoods();
        } }]),
        { label: "取消" },
        { label: "保存", kind: "primary", onClick: async () => {
          const num = (id) => { const v = $(id).value.trim(); return v === "" ? null : Number(v.replace(",", ".")); };
          const body = {
            name: $("#eName").value.trim(), variant: $("#eVar").value.trim() || null, category_id: Number($("#eCat").value),
            barcodes: $("#eCodes").value.trim().split(/[\s,;]+/).filter(Boolean),
            price_cents: toCents($("#ePrice").value), cost_cents: $("#eCost").value.trim() ? toCents($("#eCost").value) : null,
            unit: $("#eUnit").value, weighed: $("#eWeighed").checked, plu: $("#ePlu").value.trim() || null, code: $("#eCode").value.trim() || null,
            stock_min: num("#eMin"), supplier: $("#eSup").value.trim() || null, shelf_days: num("#eShelf"), is_active: $("#eActive").checked, featured: $("#eHot").checked,
          };
          if (body.variant && !x.style) body.style = body.name;
          if (!body.name) throw new Error("请填写名称");
          if (!(body.price_cents >= 0)) throw new Error("请填写正确的售价");
          if (isNew) { body.stock = num("#eStock"); body.auto_barcode = $("#eAuto").checked; }
          await api(isNew ? "/api/retail/goods" : `/api/retail/goods/${x.id}`, { method: isNew ? "POST" : "PATCH", body });
          toast("已保存", "success");
          loadGoods();
        } },
      ],
    });
    // 条码框里扫码：扫码枪的回车不要提交表单，而是加一个空格接着扫下一个
    $("#eCodes", m.el).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.value = e.target.value.trim() + " "; } });
    $("#eWeighed", m.el).onchange = (e) => { if (e.target.checked && $("#eUnit", m.el).value === "pc") $("#eUnit", m.el).value = "kg"; };
    if (!isNew) {
      $("#eMoves", m.el).onclick = () => showMoves(x);
      $("#eAdj", m.el).onclick = () => adjustStock(x);
      $("#eLabel", m.el).onclick = () => printLabels([x]);
    }
    if (!noAutoFocus()) setTimeout(() => $("#eName", m.el).focus(), 30); // B50
  }

  function openVariants() {
    const m = openModal({
      title: "多规格商品（百货：一款衣服 / 鞋有几个尺码和颜色）",
      wide: true,
      body: `<div class="rt-grid form-grid">
        <label>款名<input type="text" id="vName" maxlength="60" placeholder="如 男士 T 恤 2026 夏"></label>
        <label>分类<select id="vCat">${R.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
        <label class="wide">尺码（空格或逗号隔开）<input type="text" id="vSizes" placeholder="S M L XL 或 38 39 40 41 42">
          <select data-vpre="vSizes" class="v-pre hidden"></select></label>
        <label class="wide">颜色（空格或逗号隔开）<input type="text" id="vColors" placeholder="黑 白 蓝">
          <select data-vpre="vColors" class="v-pre hidden"></select></label>
        <label>售价<input type="text" id="vPrice" inputmode="decimal"></label>
        <label>进价<input type="text" id="vCost" inputmode="decimal"></label>
        <label>每个规格的库存<input type="text" id="vStock" inputmode="decimal" placeholder="不填 = 不管库存"></label>
        <label>供应商<input type="text" id="vSup" maxlength="60"></label>
        </div><p class="muted" id="vInfo" style="font-size:13px"></p>
        <p class="muted" style="font-size:12px">每个「颜色 / 尺码」都会建成一个商品，自动生成店内条码；以后可以单独改价、改条码（换成厂家条码）、管库存。</p>`,
      buttons: [{ label: "取消" }, { label: "生成", kind: "primary", onClick: async () => {
        const r = await api("/api/retail/variants", { method: "POST", body: {
          name: $("#vName").value.trim(), category_id: Number($("#vCat").value), sizes: $("#vSizes").value, colors: $("#vColors").value,
          price_cents: toCents($("#vPrice").value || "0"), cost_cents: $("#vCost").value.trim() ? toCents($("#vCost").value) : null,
          stock: $("#vStock").value.trim() || null, supplier: $("#vSup").value.trim() || null,
        } });
        toast(`已生成 ${r.created.length} 个规格`, "success");
        R.goods.q = $("#vName").value.trim();
        loadGoods();
      } }],
    });
    const info = () => {
      const n = (id) => $(id, m.el).value.split(/[,，\s]+/).filter(Boolean).length;
      const total = Math.max(1, n("#vSizes")) * Math.max(1, n("#vColors"));
      $("#vInfo", m.el).textContent = n("#vSizes") || n("#vColors") ? `会生成 ${total} 个规格` : "";
    };
    m.el.addEventListener("input", info);
    // 之前用过的尺码组 / 颜色组：选一个就填进去（生成时自动记住）
    api("/api/retail/variant-presets").then((v) => {
      for (const [id, list] of [["vSizes", v.sizes], ["vColors", v.colors]]) {
        const sel = $(`[data-vpre="${id}"]`, m.el);
        if (!list.length) continue;
        sel.innerHTML = `<option value="">之前用过的…</option>` + list.map((x) => `<option>${esc(x)}</option>`).join("");
        sel.classList.remove("hidden");
        sel.onchange = () => { if (sel.value) { $("#" + id, m.el).value = sel.value; sel.value = ""; info(); } };
      }
    }).catch(() => {});
  }

  function openCats() {
    const draw = () => `<div class="inline-form"><input type="text" id="cNew" placeholder="新分类名称" maxlength="20"><button class="btn" id="cAdd">新增分类</button></div>
      <table class="list" style="margin-top:10px"><tbody>${R.cats.map((c) => `<tr data-id="${c.id}"><td><input type="text" value="${esc(c.name)}" maxlength="20" data-name></td><td class="muted">${c.count} 个商品</td>
        <td class="r"><button class="btn small" data-save>改名</button> <button class="btn small danger" data-del ${c.count ? "disabled" : ""}>删除</button></td></tr>`).join("")}</tbody></table>`;
    const m = openModal({ title: "商品分类", body: draw(), onClose: () => loadGoods().catch(() => {}) });
    const refresh = async () => { await loadCats(); m.el.querySelector(".modal-body").innerHTML = draw(); };
    m.el.addEventListener("click", async (e) => {
      try {
        if (e.target.id === "cAdd") { await api("/api/retail/categories", { method: "POST", body: { name: $("#cNew", m.el).value } }); await refresh(); }
        const tr = e.target.closest("tr[data-id]");
        if (tr && e.target.closest("[data-save]")) { await api(`/api/retail/categories/${tr.dataset.id}`, { method: "PATCH", body: { name: tr.querySelector("[data-name]").value } }); toast("已改名", "success"); await refresh(); }
        if (tr && e.target.closest("[data-del]")) { await api(`/api/retail/categories/${tr.dataset.id}`, { method: "DELETE" }); await refresh(); }
      } catch (err) { toast(err.message, "error"); }
    });
  }

  async function download(url, filename) {
    if (await appSaveUrl(url, filename)) return; // 安卓 App 直接下载保存（B64）
    const res = await fetch(url, { headers: { Authorization: "Bearer " + store.get("pos_token") } });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "导出失败");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function exportGoods() {
    try { await download("/api/retail/goods.xlsx", `商品-${new Date().toISOString().slice(0, 10)}.xlsx`); if (!window.PosBridge) toast("已导出，请在浏览器的下载列表里查看", "success"); } // 安卓 App 里由 App 提示存到了哪里
    catch (e) { toast(e.message, "error"); }
  }
  async function importGoods(file, autoBarcode = true) {
    const send = (apply) => fetch(`/api/retail/goods-xlsx?auto_barcode=${autoBarcode ? 1 : 0}${apply ? "&apply=1" : ""}`, { method: "POST", body: file, headers: { Authorization: "Bearer " + store.get("pos_token") } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "导入失败"); return j; });
    try {
      const p = await send(false);
      const s = p.summary;
      const list = (title, rows, fn) => (rows.length ? `<h4>${title}（${rows.length}）</h4><ul class="imp-list">${rows.slice(0, 50).map(fn).join("")}${rows.length > 50 ? `<li class="muted">……还有 ${rows.length - 50} 个</li>` : ""}</ul>` : "");
      openModal({
        title: p.ok ? "导入预览：确认后才生效" : "表格里有错误",
        wide: true,
        body: p.ok ? `<p>新增 <b>${s.add}</b> 个，修改 <b>${s.update}</b> 个，改库存 <b>${s.stock}</b> 个，删除 <b>${s.remove}</b> 个${s.new_categories ? `，新分类：${esc(p.new_categories.join("、"))}` : ""}</p>
            ${list("新增", p.add, (a) => `<li>第 ${a.row} 行 <span translate="no">${esc(a.name)}</span> ${money(a.price_cents)}</li>`)}
            ${list("修改", p.update, (u) => `<li>第 ${u.row} 行 <span translate="no">${esc(u.name)}</span>：${esc(u.changes.join("，"))}</li>`)}
            ${list("改库存（记一次盘点）", p.stock, (x) => `<li>第 ${x.row} 行 <span translate="no">${esc(x.name)}</span>：${x.before ?? "不管"} → ${x.after}</li>`)}
            ${list("删除", p.remove, (r) => `<li>第 ${r.row} 行 <span translate="no">${esc(r.name)}</span></li>`)}`
          : `<ul class="imp-list">${p.errors.map((e) => `<li class="bad">${esc(e)}</li>`).join("")}</ul>`,
        buttons: p.ok ? [{ label: "取消" }, { label: "确认导入", kind: "primary", onClick: async () => { await send(true); toast("导入完成", "success"); R.catalogAt = 0; loadGoods(); } }] : [{ label: "知道了" }],
      });
    } catch (e) { toast(e.message, "error"); }
  }

  // ---------- 价签（店主 10-25：多个模板、每个商品打几张、先预览；手机扫码打价签） ----------
  // 画法、条码、蓝牙指令在 labels.js（手机打价签页也用）；模板存在服务端（设置 label_templates）
  R.labelTpls = null;
  async function labelTemplates(fresh) {
    if (!R.labelTpls || fresh) R.labelTpls = await api("/api/labels/templates");
    return R.labelTpls;
  }
  // lang：价签语言（店主 10-26：和界面语言分开选，记在这台电脑上）；保质期日期按这个语言的格式印
  const defLabelLang = () => store.get("label_lang") || S.settings?.ui_lang || "fr";
  const lbOpt = (lang = defLabelLang()) => ({ store: S.settings?.store_name || "", money, lang });
  // jobs：[{ item, copies }]；from：手机发来时写是谁发的；lang：手机上选的价签语言
  async function printLabels(items, { copies = null, tplId = null, from = "", lang = null, onClose = null } = {}) {
    if (!items.length) { onClose?.(); return toast("请先勾选商品", "info"); }
    let tpls = await labelTemplates();
    let tpl = tpls.find((t) => t.id === (tplId || store.get("label_tpl"))) || tpls[0];
    const jobs = items.map((item) => ({ item, copies: copies?.[item.id] || 1 }));
    const total = () => jobs.reduce((a, j) => a + j.copies, 0);
    lang = lang || defLabelLang();
    // 商品名按价签语言（服务端翻好）
    const names = new Map(); // 只在这个窗口里记译名
    const shown = () => Labels.localize(jobs, lang, "/api/labels/names", (u) => api(u), names);
    const m = openModal({
      title: from ? `手机发来的价签（${from}）` : `打印价签（${items.length} 个商品）`,
      wide: true,
      body: `<div class="lb-top">
          <label class="field" style="margin:0"><span>模板</span><select id="lbTpl"></select></label>
          <label class="field" style="margin:0"><span>价签语言</span><select id="lbLang" translate="no">${Labels.LABEL_LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          ${isAdmin() ? `<button type="button" class="btn small" id="lbEdit">编辑模板</button>` : ""}
          <button type="button" class="btn small" id="lbStock" title="每个商品打的张数 = 现在的库存数（没管库存的打 1 张）">按库存数</button>
          <button type="button" class="btn small" id="lbOne">都打 1 张</button>
        </div>
        <div class="scroll-x" style="max-height:30vh;margin:10px 0"><table class="list"><thead><tr><th>商品</th><th class="r">价格</th><th class="r">张数</th></tr></thead><tbody id="lbRows"></tbody></table></div>
        <p class="muted" id="lbHint" style="margin:0 0 8px;font-size:13px"></p>
        <div id="lbPrev" style="max-height:38vh;overflow:auto;padding:12px;background:#efe9e1;border-radius:10px"></div>`,
      onClose,
      buttons: [{ label: "取消" }, { label: "🖨 打印", kind: "primary", onClick: async () => {
        if (total() > Labels.MAX_COPIES) { toast(`一次最多打 ${Labels.MAX_COPIES} 张，请分几批打`, "error"); return false; }
        store.set("label_tpl", tpl.id);
        const list = await shown().catch(() => jobs); // 取不到译名就用原名照样打
        if (inAndroidApp()) { hostPrintHtml(Labels.printHtml(list, tpl, lbOpt(lang)), "Etiquettes"); return; } // 安卓平板：交给系统打印（整改 F4）
        const f = document.createElement("iframe");
        f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        document.body.appendChild(f);
        f.contentDocument.open();
        f.contentDocument.write(Labels.printHtml(list, tpl, lbOpt(lang)));
        f.contentDocument.close();
        setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 400);
      } }],
    });
    const el = m.el;
    const fillTpls = () => { $("#lbTpl", el).innerHTML = tpls.map((t) => `<option value="${esc(t.id)}" ${t.id === tpl.id ? "selected" : ""}>${esc(t.name)}</option>`).join(""); };
    const rows = () => {
      $("#lbRows", el).innerHTML = jobs.map((j, i) => `<tr><td translate="no">${esc(j.item.full_name || j.item.name)}</td><td class="r num">${money(j.item.price_cents)}</td>
        <td class="r"><input type="number" min="1" max="999" step="1" value="${j.copies}" data-lbc="${i}" style="width:72px" aria-label="张数"></td></tr>`).join("");
    };
    const preview = async () => {
      Labels.previewInto($("#lbPrev", el), await shown().catch(() => jobs), tpl, lbOpt(lang));
      $("#lbHint", el).textContent = tpl.paper === "a4"
        ? `共 ${total()} 张，A4 纸排满一页再换下一页；打印窗口里选普通打印机，「缩放」选 100%。`
        : `共 ${total()} 张，每张 ${tpl.w}×${tpl.h} 毫米；打印窗口里选标签打印机，纸张选 ${tpl.w}×${tpl.h}（没有就在打印机设置里新建这个尺寸）。`;
    };
    fillTpls(); rows(); preview();
    el.addEventListener("change", (e) => {
      if (e.target.id === "lbTpl") { tpl = tpls.find((t) => t.id === e.target.value) || tpls[0]; preview(); }
      if (e.target.id === "lbLang") { lang = e.target.value; store.set("label_lang", lang); preview(); }
      if (e.target.dataset.lbc) { jobs[Number(e.target.dataset.lbc)].copies = Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))); e.target.value = jobs[Number(e.target.dataset.lbc)].copies; preview(); }
    });
    el.addEventListener("click", (e) => {
      // 称重商品的库存是公斤数，按库存数没有意义：打 1 张
      if (e.target.closest("#lbStock")) { for (const j of jobs) j.copies = !j.item.weighed && j.item.stock > 0 ? Math.min(999, Math.ceil(j.item.stock)) : 1; rows(); preview(); }
      if (e.target.closest("#lbOne")) { for (const j of jobs) j.copies = 1; rows(); preview(); }
      if (e.target.closest("#lbEdit")) editLabelTemplates(tpl.id).then((list) => { if (!list) return; tpls = list; tpl = tpls.find((t) => t.id === tpl.id) || tpls[0]; fillTpls(); preview(); });
    });
  }
  // 编辑模板（店长）：存好返回新的模板列表；取消返回 null
  function editLabelTemplates(sel) {
    return new Promise(async (resolve) => {
      const tpls = await labelTemplates(true);
      let ed = null, done = false;
      const m = openModal({
        title: "价签模板",
        wide: true,
        body: `<p class="muted" style="margin:0 0 10px;font-size:13px">可以建多个模板（最多 12 个），比如货架价签、衣服吊牌、A4 一页排满。手机扫码打价签也用这些模板。</p><div id="lbEd"></div>`,
        buttons: [{ label: "取消" }, { label: "保存", kind: "primary", onClick: async () => {
          try {
            const list = await api("/api/labels/templates", { method: "PUT", body: { templates: ed.get() } });
            R.labelTpls = list; done = true; toast("价签模板已保存", "success"); resolve(list);
          } catch (err) { toast(err.message, "error"); return false; }
        } }],
        onClose: () => { if (!done) resolve(null); },
      });
      ed = Labels.editor($("#lbEd", m.el), tpls, { ...lbOpt(), sel }); // lbOpt 带价签语言：预览里的保质期按这个语言
    });
  }
  // 「📱 手机扫码打价签」：给手机一个链接（二维码）
  async function openLabelPhone(reset) {
    try {
      const r = await api("/api/labels/drop", { method: "POST", body: { reset: reset === true } });
      const m = openModal({
        title: "📱 手机扫码打价签",
        body: `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
          <div style="width:220px;background:#fff;padding:8px;border-radius:12px">${r.qr_svg}</div>
          <div style="flex:1;min-width:220px;font-size:14px;line-height:1.6">
            <p style="margin-top:0">手机扫这个二维码打开打价签页面（固定链接，不过期；打开后可以「添加到主屏幕」，以后在货架、仓库随时打开就能扫）：</p>
            <ol style="padding-left:20px;margin:0 0 10px">
              <li>摄像头对准商品条码，扫到就加进清单（同一个再扫一次 = 多打 1 张）</li>
              <li>选模板、改张数，看预览</li>
              <li>点「蓝牙打印」用手机连着的打印机打，或者「发到电脑」在这台电脑上打</li>
            </ol>
            ${r.https && !r.fixed ? `<p class="muted" style="font-size:13px;margin:0 0 8px">⚠ 现在用的是临时网址：电脑重启后网址会变，手机要重新扫。想一直用同一个二维码，请在「设置 → 网上接单 → 外网 / 固定网址」绑定自己的网址。</p>` : ""}
            ${r.https ? "" : `<p class="muted" style="font-size:13px;margin:0 0 8px">⚠ 还没绑定网址：现在是店内网址（http），手机浏览器不让开摄像头，只能手输条码。先在「设置 → 网上接单 → 外网 / 固定网址」绑定网址，再回来扫二维码。</p>`}
            <p class="muted" style="font-size:12.5px;margin:0;word-break:break-all">${esc(r.url)}</p>
            <p class="muted" style="font-size:12.5px;margin:4px 0 0">能连的打印机：蓝牙标签机（TSPL 指令）、蓝牙小票机装标签纸。拿到这个链接的人都能查价格、打价签：链接外泄了就点「换新链接」。</p>
          </div></div>`,
        buttons: [...(isAdmin() ? [{ label: "换新链接", onClick: async () => {
          if (!(await confirmModal("换新链接", "换了以后，以前扫过的手机要重新扫新的二维码才能用。确定换吗？", "换新链接", "danger"))) return false;
          m.close(); openLabelPhone(true);
        } }] : []),
          // Gway 手机 App 里：不用扫自己屏幕上的二维码，直接在这台手机上打开（平板收银机自己不跳走，收银台要一直开着）
          ...(document.documentElement.classList.contains("in-app") && !IS_POS_HOST && r.https ? [{ label: "在这台手机上打开", onClick: async () => {
            // 先告诉 App 这是本店的打价签网址：App 只给这个网址开摄像头和蓝牙打印
            try { await window.PosApp?.call("labelHost", { host: new URL(r.url).hostname }); } catch {}
            location.href = r.url;
          } }] : []),
          { label: "知道了", kind: "primary" }],
      });
    } catch (e) { toast(e.message, "error"); }
  }
  // 手机「发到电脑」：只在开着的超市 / 百货收银台上弹出（同一店多台电脑都会弹，哪台打都行）
  // 一次只弹一个窗口：前一批关掉了再弹下一批（最多排 5 批）
  R.lbQueue = [];
  R.lbBusy = false;
  function onLabelJob(job) {
    if (!isRetail() || $("#app").classList.contains("hidden")) return;
    if (R.lbQueue.length >= 5) return;
    R.lbQueue.push(job);
    if (!R.lbBusy) nextLabelJob();
  }
  async function nextLabelJob() {
    const job = R.lbQueue.shift();
    if (!job) { R.lbBusy = false; return; }
    R.lbBusy = true;
    try {
      const items = [];
      for (const x of job.items) { const g = await api(`/api/retail/goods/${x.id}`).catch(() => null); if (g) items.push(g); }
      if (!items.length) return nextLabelJob();
      const copies = Object.fromEntries(job.items.map((x) => [x.id, x.copies]));
      await printLabels(items, { copies, tplId: job.tpl_id, lang: job.lang, from: job.from || "手机", onClose: () => setTimeout(nextLabelJob, 300) });
    } catch (e) { toast(e.message, "error"); nextLabelJob(); }
  }

  // 条码图（SVG）：画法挪到 labels.js（手机打价签页也用）
  R.barcodeSvg = (code) => Labels.barcodeSvg(code);

  // ================= 库存 =================
  const MOVE_KINDS = [["", "全部"], ["sale", "卖出"], ["return", "退货"], ["receive", "进货"], ["count", "盘点"], ["adjust", "调整"], ["init", "期初"]];
  async function loadStock() {
    if (!isRetail()) return;
    const st = R.stock;
    const tabs = [["overview", "📊 概况 / 补货"], ["receive", "📥 进货入库"], ["count", "🔢 盘点"], ["moves", "📜 库存记录"], ["receipts", "🧾 入库单"]];
    $("#stockBody").innerHTML = `<div class="toolbar"><div class="seg" id="stTabs">${tabs.map(([k, l]) => `<button data-st="${k}" class="${st.tab === k ? "on" : ""}">${l}</button>`).join("")}</div></div><div id="stBody"><div class="muted">加载中…</div></div>`;
    $("#stTabs").onclick = (e) => { const b = e.target.closest("[data-st]"); if (b) { st.tab = b.dataset.st; loadStock().catch((x) => toast(x.message, "error")); } };
    await loadCatalog();
    if (st.tab === "overview") return stockOverview();
    if (st.tab === "receive") return stockSheet("recv");
    if (st.tab === "count") return stockSheet("count");
    if (st.tab === "moves") return stockMoves();
    if (st.tab === "receipts") return stockReceipts();
  }
  async function stockOverview() {
    const s = await api("/api/retail/stock");
    $("#stBody").innerHTML = `
      <div class="today-tiles" style="margin-bottom:14px">
        <div class="tt"><span>商品</span><b>${s.goods_count}</b><small>${s.tracked_count} 个管库存</small></div>
        <div class="tt"><span>库存总值（按进价）</span><b>${money(s.stock_cost_cents)}</b></div>
        <div class="tt"><span>库存总值（按售价）</span><b>${money(s.stock_retail_cents)}</b></div>
        <div class="tt ${s.low.length ? "warn" : ""}"><span>库存不足</span><b>${s.low.length}</b></div>
      </div>
      <div class="section"><h3>补货清单 <span class="muted" style="font-weight:400;font-size:13px">库存 ≤ 最低库存；建议补到最低库存的 2 倍</span>
        ${s.low.length ? `<button class="btn small" id="lowToRecv" style="margin-left:10px">按清单进货 →</button> <button class="btn small" id="lowPrint">🖨 打印清单</button>` : ""}</h3>
        ${s.low.length ? `<table class="list" id="lowTable"><thead><tr><th>商品</th><th>供应商</th><th class="r">现有</th><th class="r">最低</th><th class="r">建议补</th></tr></thead><tbody>
          ${s.low.map((g) => `<tr><td translate="no">${esc(g.full_name)}</td><td>${esc(g.supplier)}</td><td class="r num bad">${fmtQty(g.stock)}</td><td class="r num">${fmtQty(g.stock_min)}</td><td class="r num"><b>${fmtQty(g.suggest)}</b></td></tr>`).join("")}</tbody></table>`
          : `<p class="muted">没有库存不足的商品。给商品填「最低库存」后，低于这个数就会出现在这里。</p>`}</div>
      <div class="section"><h3>卖不动的商品 <span class="muted" style="font-weight:400;font-size:13px">${s.slow_days} 天没有卖出、还有库存（按占用的进货钱排序）</span></h3>
        ${s.slow.length ? `<table class="list"><thead><tr><th>商品</th><th class="r">库存</th><th class="r">占用（进价）</th><th>上次卖出</th></tr></thead><tbody>
          ${s.slow.map((g) => `<tr><td translate="no">${esc(g.full_name)}</td><td class="r num">${fmtQty(g.stock)}</td><td class="r num">${money(g.stock_cost_cents)}</td><td class="muted">${esc(g.last_sale || "从没卖出")}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted">没有。</p>`}</div>`;
    $("#lowToRecv")?.addEventListener("click", () => {
      R.stock.recv = s.low.map((g) => ({ item_id: g.id, name: g.full_name, qty: g.suggest || 1, cost: g.cost_cents, unit: g.unit }));
      R.stock.tab = "receive";
      loadStock();
    });
    $("#lowPrint")?.addEventListener("click", () => {
      const html = `<!doctype html><meta charset="utf-8"><title>补货清单</title><style>body{font-family:Arial,"Microsoft YaHei";font-size:13px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}</style>
        <h2>补货清单 · ${esc(S.settings?.store_name || "")} · ${new Date().toLocaleDateString()}</h2>${$("#lowTable").outerHTML}`;
      if (inAndroidApp()) return hostPrintHtml(html, "Reassort"); // 安卓平板：交给系统打印（整改 F4）
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;width:0;height:0;border:0";
      document.body.appendChild(f);
      f.contentDocument.write(html);
      f.contentDocument.close();
      setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300);
    });
  }

  // 进货 / 盘点录入单：扫码或搜名称加一行，填数量（进货还可以填进价）
  function stockSheet(kind) {
    const st = R.stock;
    const rows = kind === "recv" ? st.recv : st.count;
    const isRecv = kind === "recv";
    const total = rows.reduce((s, r) => s + (r.cost || 0) * (Number(r.qty) || 0), 0);
    $("#stBody").innerHTML = `
      <p class="muted" style="margin-top:0">${isRecv ? "扫商品条码（同一商品扫几次数量就加几），或输入名称回车。填好数量和进价，点「确认入库」库存就加上了。" : "数一个扫一个：扫一下数量 +1，也可以直接改数量。只盘一部分商品也可以，没录的商品库存不变。确认后系统算出盘盈盘亏。"}</p>
      <div class="inline-form">
        <input type="text" id="shScan" placeholder="扫码 / 条码 / 名称，回车" autocomplete="off" style="flex:1;min-width:240px">
        ${isRecv ? `<input type="text" id="shSup" placeholder="供应商" value="${esc(st.supplier)}" maxlength="60" style="width:180px">` : ""}
        <input type="text" id="shNote" placeholder="备注" value="${esc(st.note)}" maxlength="100" style="width:180px">
      </div>
      <table class="list" style="margin-top:10px"><thead><tr><th>商品</th>${isRecv ? "" : `<th class="r">系统库存</th>`}<th class="r">${isRecv ? "进货数量" : "实际数量"}</th>${isRecv ? `<th class="r">进价</th><th class="r">金额</th>` : `<th class="r">差</th>`}<th></th></tr></thead>
      <tbody>${rows.map((r, i) => {
        const g = R.catalog.find((x) => x.id === r.item_id);
        const sys = g?.stock;
        const diff = sys == null ? null : Math.round(((Number(r.qty) || 0) - sys) * 1000) / 1000;
        return `<tr data-i="${i}"><td translate="no">${esc(r.name)}</td>${isRecv ? "" : `<td class="r num">${sys == null ? `<span class="muted">不管</span>` : fmtQty(sys)}</td>`}
          <td class="r"><input type="text" inputmode="decimal" data-k="qty" value="${esc(String(r.qty))}" style="width:80px;text-align:right"></td>
          ${isRecv ? `<td class="r"><input type="text" inputmode="decimal" data-k="cost" value="${r.cost == null ? "" : amt(r.cost)}" placeholder="不变" style="width:80px;text-align:right"></td><td class="r num">${r.cost == null ? "" : money(Math.round(r.cost * (Number(r.qty) || 0)))}</td>`
            : `<td class="r num ${diff > 0 ? "good" : diff < 0 ? "bad" : ""}">${diff == null ? "" : (diff > 0 ? "+" : "") + fmtQty(diff)}</td>`}
          <td class="r"><button class="icon-btn" data-rm>×</button></td></tr>`;
      }).join("") || `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">还没有录入商品</td></tr>`}</tbody></table>
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
        ${isRecv ? `<span>合计进货金额 <b class="num">${money(total)}</b></span>` : `<span>${rows.length} 种商品</span>`}
        <button class="btn" id="shClear" style="margin-left:auto" ${rows.length ? "" : "disabled"}>清空</button>
        <button class="btn primary" id="shGo" ${rows.length ? "" : "disabled"}>${isRecv ? "确认入库" : "确认盘点"}</button>
      </div>`;
    const scan = $("#shScan");
    softScan(scan); // B50：同收银扫码框
    scan.focus();
    const addRow = (g) => {
      const r = rows.find((x) => x.item_id === g.id);
      if (r) r.qty = Math.round(((Number(r.qty) || 0) + 1) * 1000) / 1000;
      else rows.push({ item_id: g.id, name: g.full_name || g.name, qty: isRecv || !g.weighed ? 1 : "", cost: g.cost_cents ?? null, unit: g.unit });
      beep(true);
      stockSheet(kind);
    };
    scan.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = scan.value.trim();
      scan.value = "";
      if (!v) return;
      try {
        if (/^[0-9A-Za-z\-.]{3,32}$/.test(v)) {
          const r = await api(`/api/retail/scan?code=${encodeURIComponent(v)}`);
          if (r.type === "goods") return addRow(r.item);
        }
        const hits = searchCatalog(v, 5);
        if (hits.length === 1) return addRow(hits[0]);
        beep(false);
        toast(hits.length ? `找到 ${hits.length} 个，请输入更完整的名称或扫条码` : `没有找到「${v}」`, "error");
      } catch (err) { toast(err.message, "error"); }
    });
    $("#shSup")?.addEventListener("input", (e) => (st.supplier = e.target.value));
    $("#shNote").addEventListener("input", (e) => (st.note = e.target.value));
    $("#stBody tbody").addEventListener("change", (e) => {
      const tr = e.target.closest("tr[data-i]");
      if (!tr || !e.target.dataset.k) return;
      const r = rows[Number(tr.dataset.i)];
      if (e.target.dataset.k === "qty") r.qty = e.target.value.replace(",", ".");
      if (e.target.dataset.k === "cost") r.cost = e.target.value.trim() ? toCents(e.target.value) : null;
      stockSheet(kind);
    });
    $("#stBody tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-i]");
      if (tr && e.target.closest("[data-rm]")) { rows.splice(Number(tr.dataset.i), 1); stockSheet(kind); }
    });
    $("#shClear").onclick = async () => { if (await confirmModal("清空录入？", "已经录入的商品都会清掉（还没保存）", "清空", "danger")) { rows.length = 0; stockSheet(kind); } };
    $("#shGo").onclick = async () => {
      try {
        const lines = rows.map((r) => ({ item_id: r.item_id, qty: r.qty, ...(isRecv ? { cost_cents: r.cost } : {}) }));
        if (isRecv) {
          const r = await api("/api/retail/stock/receive", { method: "POST", body: { supplier: st.supplier, note: st.note, lines } });
          toast(`入库单 ${r.no} 已保存：${r.line_count} 种商品，${money(r.total_cost_cents)}`, "success");
        } else {
          const r = await api("/api/retail/stock/count", { method: "POST", body: { note: st.note, lines } });
          const gain = r.lines.filter((x) => x.diff > 0).length, loss = r.lines.filter((x) => x.diff < 0).length;
          toast(`盘点完成：盘盈 ${gain} 种，盘亏 ${loss} 种`, "success");
        }
        rows.length = 0; st.note = "";
        await loadCatalog(true);
        stockSheet(kind);
      } catch (err) { toast(err.message, "error"); }
    };
  }

  async function stockMoves(itemId) {
    const st = R.stock;
    const list = await api(`/api/retail/stock/moves?${new URLSearchParams({ kind: st.moveKind, ...(itemId ? { item_id: itemId } : {}), limit: 300 })}`);
    $("#stBody").innerHTML = `<div class="seg" id="mvKind" style="margin-bottom:10px">${MOVE_KINDS.map(([k, l]) => `<button data-k="${k}" class="${st.moveKind === k ? "on" : ""}">${l}</button>`).join("")}</div>${movesTable(list)}`;
    $("#mvKind").onclick = (e) => { const b = e.target.closest("[data-k]"); if (b) { st.moveKind = b.dataset.k; stockMoves(itemId).catch((x) => toast(x.message, "error")); } };
  }
  const movesTable = (list) => `<table class="list"><thead><tr><th>时间</th><th>商品</th><th>类型</th><th class="r">变化</th><th class="r">之后库存</th><th>单据 / 原因</th><th>经办</th></tr></thead><tbody>
    ${list.map((m) => `<tr><td class="muted num">${esc(m.created_at)}</td><td translate="no">${esc(m.full_name)}</td><td>${esc(m.kind_name)}</td>
      <td class="r num ${m.qty > 0 ? "good" : m.qty < 0 ? "bad" : ""}">${m.qty > 0 ? "+" : ""}${fmtQty(m.qty)}</td><td class="r num">${fmtQty(m.stock_after)}</td>
      <td>${m.order_id ? `收银 ${m.order_id}` : ""}${m.ref ? esc(m.ref) : ""} ${esc(m.note || "")}</td><td>${esc(m.staff_name || "")}</td></tr>`).join("") || `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">没有记录</td></tr>`}</tbody></table>`;
  async function showMoves(g) {
    const list = await api(`/api/retail/stock/moves?item_id=${g.id}&limit=200`);
    openModal({ title: `库存记录：${g.full_name}`, wide: true, body: movesTable(list) });
  }
  function adjustStock(g) {
    const m = openModal({
      title: `调整库存：${g.full_name}`,
      body: `<p class="muted" style="margin-top:0">现在库存 ${g.stock == null ? "不管库存" : fmtQty(g.stock)}。报损、自用、找到了……写正数加、负数减；整批数过一遍请用「盘点」。</p>
        <div class="rt-grid form-grid"><label>数量（+ / -）<input type="text" id="ajQ" inputmode="decimal" placeholder="如 -2"></label><label>原因<input type="text" id="ajWhy" maxlength="50" placeholder="如 过期报损"></label></div>`,
      buttons: [{ label: "取消" }, { label: "确定", kind: "primary", onClick: async () => {
        await api("/api/retail/stock/adjust", { method: "POST", body: { item_id: g.id, qty: $("#ajQ").value, note: $("#ajWhy").value } });
        toast("库存已调整", "success");
        loadGoods().catch(() => {});
      } }],
    });
    setTimeout(() => $("#ajQ", m.el).focus(), 30);
  }
  async function stockReceipts() {
    const list = await api("/api/retail/stock/receipts?limit=100");
    $("#stBody").innerHTML = `<table class="list"><thead><tr><th>单号</th><th>时间</th><th>供应商</th><th class="r">商品</th><th class="r">进货金额</th><th>经办</th><th>备注</th></tr></thead><tbody>
      ${list.map((r, i) => `<tr data-i="${i}" style="cursor:pointer"><td><b>${esc(r.no)}</b></td><td class="muted num">${esc(r.created_at)}</td><td>${esc(r.supplier || "")}</td><td class="r num">${r.line_count}</td><td class="r num">${money(r.total_cost_cents)}</td><td>${esc(r.staff_name || "")}</td><td>${esc(r.note || "")}</td></tr>`).join("") || `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">还没有进货记录</td></tr>`}</tbody></table>`;
    $("#stBody tbody").onclick = (e) => {
      const tr = e.target.closest("tr[data-i]");
      if (!tr) return;
      const r = list[Number(tr.dataset.i)];
      openModal({ title: `入库单 ${r.no}`, wide: true, body: `<p>${esc(r.created_at)} · ${esc(r.supplier || "")} · ${esc(r.staff_name || "")}</p>
        <table class="list"><thead><tr><th>商品</th><th class="r">数量</th><th class="r">进价</th><th class="r">金额</th></tr></thead><tbody>
        ${r.lines.map((l) => `<tr><td translate="no">${esc(l.name)}</td><td class="r num">${fmtQty(l.qty)}</td><td class="r num">${l.cost_cents == null ? "" : money(l.cost_cents)}</td><td class="r num">${l.cost_cents == null ? "" : money(Math.round(l.cost_cents * l.qty))}</td></tr>`).join("")}</tbody></table>
        <p style="text-align:right">合计 <b>${money(r.total_cost_cents)}</b></p>` });
    };
  }

  // ================= 报表：毛利 =================
  R.renderMargin = async function () {
    const r = await api(`/api/retail/margin?${rpQuery()}`);
    const t = r.totals;
    const rate = t.covered_net_cents ? Math.round((t.margin_cents / t.covered_net_cents) * 1000) / 10 : null;
    const pct = (x) => (x == null ? "" : Math.round(x * 1000) / 10 + "%");
    const groupTable = (title, rows) => `<div class="section"><h3>${title}</h3><table class="list"><thead><tr><th></th><th class="r">数量</th><th class="r">销售额</th><th class="r">成本</th><th class="r">毛利</th><th class="r">毛利率</th></tr></thead><tbody>
      ${rows.map((g) => `<tr><td>${esc(g.name)}${g.missing_cost ? ` <span class="muted" style="font-size:12px">（${g.missing_cost} 个没填进价）</span>` : ""}</td><td class="r num">${fmtQty(g.qty)}</td><td class="r num">${money(g.net_cents)}</td>
        <td class="r num">${money(g.cost_cents)}</td><td class="r num"><b>${money(g.margin_cents)}</b></td><td class="r num">${g.covered_net_cents ? pct(g.margin_cents / g.covered_net_cents) : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">没有数据</td></tr>`}</tbody></table></div>`;
    $("#rpBody").innerHTML = `
      <div class="today-tiles" style="margin-bottom:14px">
        <div class="tt"><span>商品销售额（扣优惠、退货）</span><b>${money(t.net_cents)}</b></div>
        <div class="tt"><span>成本（按进价）</span><b>${money(t.cost_cents)}</b></div>
        <div class="tt"><span>毛利</span><b>${money(t.margin_cents)}</b></div>
        <div class="tt"><span>毛利率</span><b>${rate == null ? "—" : rate + "%"}</b></div>
      </div>
      ${t.missing_cost_items ? `<p class="warn-box">有 ${t.missing_cost_items} 个卖出的商品没有填进价，没算进毛利。在「商品」里填上进价，以后的毛利就准了。</p>` : ""}
      ${groupTable("按分类", r.categories)}
      ${groupTable("按供应商", r.suppliers)}
      <div class="section"><h3>按商品</h3><div class="scroll-x"><table class="list"><thead><tr><th>商品</th><th class="r">数量</th><th class="r">销售额</th><th class="r">成本</th><th class="r">毛利</th><th class="r">毛利率</th></tr></thead><tbody>
        ${r.items.map((i) => `<tr><td translate="no">${esc(i.full_name)}</td><td class="r num">${i.weight ? fmtQty(i.weight) + " kg" : fmtQty(i.qty)}</td><td class="r num">${money(i.net_cents)}</td>
          <td class="r num">${i.has_cost ? money(i.cost_cents) : `<span class="muted">没填进价</span>`}</td><td class="r num">${i.margin_cents == null ? "" : `<b>${money(i.margin_cents)}</b>`}</td><td class="r num ${i.margin_rate != null && i.margin_rate < 0.1 ? "bad" : ""}">${pct(i.margin_rate)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">这段时间没有卖出商品</td></tr>`}
      </tbody></table></div></div>`;
  };

  // ================= 设置：条码秤贴纸、电子秤、改价 =================
  const LABEL_FORMATS = [
    ["price5", "2 位前缀 + 5 位商品号 + 5 位金额（最常见）"],
    ["weight5", "2 位前缀 + 5 位商品号 + 5 位重量（克）"],
    ["price4", "2 位前缀 + 4 位商品号 + 1 位校验 + 5 位金额"],
    ["price6", "1 位前缀 + 6 位商品号 + 5 位金额"],
  ];
  R.renderSettings = async function () {
    const wrap = $("#retailWrap");
    if (!wrap) return;
    wrap.hidden = !isRetail();
    if (!isRetail()) return;
    const st = S.settings;
    const custom = !LABEL_FORMATS.some(([k]) => k === st.scale_label_format);
    $("#retailSection").innerHTML = `
      <h4 style="margin:0 0 6px">条码秤贴纸（秤打出来带价格 / 重量的条码）</h4>
      <div class="rt-grid form-grid">
        <label>贴纸格式<select id="rsFmt">${LABEL_FORMATS.map(([k, l]) => `<option value="${k}" ${st.scale_label_format === k ? "selected" : ""}>${l}</option>`).join("")}<option value="custom" ${custom ? "selected" : ""}>自定义……</option></select></label>
        <label ${custom ? "" : "hidden"} id="rsCustomL">自定义格式<input type="text" id="rsCustom" value="${custom ? esc(st.scale_label_format) : ""}" placeholder="如 PPCCCCCMMMMMK" maxlength="14"></label>
        <label>条码开头<input type="text" id="rsPrefix" value="${esc(st.scale_label_prefix)}" placeholder="2 或 21,22"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">看一张秤打出来的贴纸：数字一般 20~29 开头、共 13 位。格式说明：P 前缀、C 商品号（秤上设的 PLU，填到商品资料的「秤上的商品号」）、M 金额（分）、W 重量（克）、K 校验位、X 不用的位。</p>
      <div class="inline-form"><input type="text" id="rsTest" placeholder="扫一张贴纸试试" autocomplete="off" style="flex:1;max-width:280px"><span id="rsTestOut" class="muted"></span></div>
      ${IS_ANDROID() ? `<h4 style="margin:14px 0 6px">收银台电子秤</h4><p class="muted">平板暂不支持直接读秤，请手动输入重量。</p>` : `<h4 style="margin:14px 0 6px">收银台电子秤（连电脑，USB 或串口）</h4>
      ${navigator.platform.startsWith("Mac") ? `<p class="muted">Mac 上暂时不能直接读秤，收银时手动输入重量。</p>` : ""}
      <div class="rt-grid form-grid">
        <label>端口<select id="rsPort"><option value="">不用电子秤（手动输入重量）</option>${st.scale_port ? `<option value="${esc(st.scale_port)}" selected>${esc(st.scale_port)}</option>` : ""}</select></label>
        <label>波特率<select id="rsBaud">${[1200, 2400, 4800, 9600, 19200, 38400].map((b) => `<option ${st.scale_baud === b ? "selected" : ""}>${b}</option>`).join("")}</select></label>
        <label>读数方式<select id="rsCmd"><option value="" ${!st.scale_cmd ? "selected" : ""}>秤自动连续发送（大多数）</option><option value="W" ${st.scale_cmd === "W" ? "selected" : ""}>要先发 W 才回重量</option><option value="ENQ" ${st.scale_cmd === "ENQ" ? "selected" : ""}>要先发 ENQ 才回重量</option></select></label>
      </div>
      <div class="inline-form"><button class="btn small" id="rsRead">⚖ 读一次</button><span id="rsReadOut" class="muted"></span></div>
      <p class="muted" style="font-size:12px;margin:0">秤的说明书里写着波特率（常见 9600）。USB 秤插上后在 Windows「设备管理器 → 端口」里能看到 COM 几。</p>`}
      <h4 style="margin:14px 0 6px">改价</h4>
      <label class="chk"><input type="checkbox" id="rsPrice" ${st.retail_price_edit === "all" ? "checked" : ""}> 收银员也可以改价（不勾 = 只有店长能改；改价都会记操作日志）</label>`;
    const save = async (body, msg = "已保存") => {
      try { S.settings = await api("/api/settings", { method: "PUT", body }); R.scaleCfg = null; toast(msg, "success"); }
      catch (e) { toast(e.message, "error"); }
      R.renderSettings();
    };
    $("#rsFmt").onchange = (e) => { if (e.target.value === "custom") { $("#rsCustomL").hidden = false; $("#rsCustom").focus(); } else save({ scale_label_format: e.target.value }); };
    $("#rsCustom").onchange = (e) => save({ scale_label_format: e.target.value.trim().toUpperCase() });
    $("#rsPrefix").onchange = (e) => save({ scale_label_prefix: e.target.value });
    if ($("#rsPort")) $("#rsPort").onchange = (e) => save({ scale_port: e.target.value }, e.target.value ? `电子秤：${e.target.value}` : "已关闭电子秤");
    if ($("#rsBaud")) $("#rsBaud").onchange = (e) => save({ scale_baud: Number(e.target.value) });
    if ($("#rsCmd")) $("#rsCmd").onchange = (e) => save({ scale_cmd: e.target.value });
    $("#rsPrice").onchange = (e) => save({ retail_price_edit: e.target.checked ? "all" : "admin" });
    $("#rsTest").addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const code = e.target.value.trim();
      e.target.value = "";
      try {
        const r = await api(`/api/retail/scan?code=${encodeURIComponent(code)}`);
        $("#rsTestOut").textContent = r.type === "goods"
          ? (r.label ? `✓ ${r.item.full_name}：${fmtQty(r.weight)} kg，${money(r.amount_cents)}` : `这是普通商品条码：${r.item.full_name}`)
          : r.scale_plu ? `能识别：秤上的商品号 ${r.scale_plu}，但还没有商品填这个号` : `${code}：不是秤贴纸，也不是已有商品（检查格式和条码开头）`;
      } catch (err) { $("#rsTestOut").textContent = err.message; }
    });
    if (IS_ANDROID()) return; // 安卓平板版：没有读秤
    $("#rsRead").onclick = async () => {
      $("#rsReadOut").textContent = "读取中…";
      const r = await api("/api/retail/scale").catch((err) => ({ error: err.message }));
      $("#rsReadOut").innerHTML = !r.configured ? "还没选端口" : r.error ? `<span class="bad">${esc(r.error)}</span>` : r.weight != null ? `<b>${fmtQty(r.weight)} kg</b> ${r.stable ? "（稳定）" : "（晃动中）"}` : `收到：${esc(r.raw || "（没有数据）")}`;
    };
    try {
      const ports = await api("/api/printers/serial-ports");
      const sel = $("#rsPort");
      if (!sel) return;
      for (const p of ports) if (p.port !== st.scale_port) sel.insertAdjacentHTML("beforeend", `<option value="${esc(p.port)}">${esc(p.port)} · ${esc(p.name)}</option>`);
    } catch {}
  };

  // 首次加载：已经登录（刷新页面）时补一次
  if (S.settings) applyNav();
})();
