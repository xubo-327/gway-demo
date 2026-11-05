// 报表（营业概况 / 菜品销售 / 交班记录 + 日期范围 + 导出 Excel）：收银台「报表」页和老板手机页（boss.html）共用这一份。
// 以后改报表只改这里，两边一起变。依赖 common.js 里的 esc / money / yuan / catTag / catVars / catColor / toast。
// 全部按「营业日」统计（营业日由班次决定）。实收 = 收款 - 退款；作废订单不计入。
//
// 用法：const rv = ReportsView.create({
//   els: { tabs, quick, from, to, exp, body },       // 元素或选择器
//   state,                                            // { tab, from, to, itemType, itemView, itemSort, expanded:Set }
//   base: "/api/reports",                             // 老板页用 "/api/boss/reports"
//   get: (url) => Promise<json>,                      // 带登录凭证的 GET
//   headers: () => ({ Authorization: "..." }),        // 导出 Excel 下载用
//   settings: () => ({ retail, pay_voucher }),
//   businessDate: () => "YYYY-MM-DD",                 // 「今天」按营业日算
//   tabs: (shared) => [[key, label]...],              // 可选：加自己的页签（收银台加毛利、操作日志）
//   extra: { key: () => Promise },                    // 自己页签的渲染函数
//   noExport: ["audit"],                              // 这些页签不显示导出按钮
//   shiftPrint: (id) => Promise,                      // 有才显示「补打交班单」（老板页没有）
// });  rv.load() 渲染当前页签。
(function () {
  const RP_QUICK = [["today", "今天"], ["yesterday", "昨天"], ["week", "本周"], ["month", "本月"], ["lastmonth", "上月"]];
  // 菜品销售三种视图：按分类（分组 + 小计）/ 排行（不分组，菜名后带分类标签）/ 每日走势（菜品 × 日期）
  const ITEM_VIEWS = [["category", "按分类"], ["rank", "排行"], ["daily", "每日走势"]];

  const dateStr = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const hhmm = (ts) => (ts ? ts.slice(11, 16) : "");
  const kpi = (l, v, sub = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num">${v}</div>${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ""}</div>`;
  const pctBar = (share, color) => `<div class="pct"><div class="bar" style="width:${(share * 100).toFixed(1)}%;${color ? `background:${catColor(color).text}` : ""}"></div><span class="num">${(share * 100).toFixed(1)}%</span></div>`;

  // 按小时的柱状图（只画有营业的那几个小时，前后各留一个空小时）
  function hourChart(hours) {
    const used = hours.filter((h) => h.order_count);
    if (!used.length) return `<div class="muted">暂无数据</div>`;
    const lo = Math.max(0, used[0].hour - 1), hi = Math.min(23, used[used.length - 1].hour + 1);
    const shown = hours.slice(lo, hi + 1);
    const mx = Math.max(1, ...shown.map((h) => h.total_cents));
    const peak = shown.reduce((a, b) => (b.total_cents > a.total_cents ? b : a));
    return `<div class="hour-chart">${shown.map((h) => `<div class="hc-col ${h === peak ? "peak" : ""}" title="${h.hour}:00 – ${h.hour + 1}:00 · ${h.order_count} 单 · ${money(h.total_cents)}">
      <span class="hc-v num">${h.total_cents ? yuan(h.total_cents) : ""}</span><i style="height:${(h.total_cents / mx) * 100}%"></i><span class="hc-h">${h.hour}</span></div>`).join("")}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">最忙：${peak.hour}:00–${peak.hour + 1}:00，${peak.order_count} 单，${money(peak.total_cents)}</p>`;
  }

  function create(o) {
    const el = (k) => (typeof o.els[k] === "string" ? document.querySelector(o.els[k]) : o.els[k]);
    const S = o.state;
    const st = () => (o.settings && o.settings()) || {};
    const fail = (err) => toast(err.message, "error");
    const body = () => el("body");

    function quickRange(key) {
      const bd = o.businessDate && o.businessDate();
      const base = bd ? new Date(bd + "T12:00:00") : new Date();
      const d = new Date(base);
      if (key === "yesterday") { d.setDate(d.getDate() - 1); return [dateStr(d), dateStr(d)]; }
      if (key === "week") { const w = new Date(base); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return [dateStr(w), dateStr(base)]; }
      if (key === "month") return [dateStr(new Date(base.getFullYear(), base.getMonth(), 1)), dateStr(base)];
      if (key === "lastmonth") return [dateStr(new Date(base.getFullYear(), base.getMonth() - 1, 1)), dateStr(new Date(base.getFullYear(), base.getMonth(), 0))];
      return [dateStr(base), dateStr(base)];
    }
    const query = (extra = {}) => new URLSearchParams({ from: S.from, to: S.to, ...extra }).toString();
    const rangeLabel = () => (S.from === S.to ? S.from : `${S.from} 至 ${S.to}`);
    const sharedTabs = () => [["overview", "营业概况"], ["items", st().retail ? "商品销售" : "菜品销售"], ["shifts", "交班记录"]];

    async function load() {
      if (!S.from) [S.from, S.to] = quickRange("today");
      const tabs = o.tabs ? o.tabs(sharedTabs()) : sharedTabs();
      if (!tabs.some(([k]) => k === S.tab)) S.tab = "overview";
      el("tabs").innerHTML = tabs.map(([k, l]) => `<button data-rt="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("");
      el("quick").innerHTML = RP_QUICK.map(([k, l]) => {
        const [f, t] = quickRange(k);
        return `<button data-q="${k}" class="${S.from === f && S.to === t ? "on" : ""}">${l}</button>`;
      }).join("");
      el("from").value = S.from;
      el("to").value = S.to;
      el("exp").classList.toggle("hidden", (o.noExport || []).includes(S.tab));
      const run = { overview: renderOverview, items: renderItemsReport, shifts: renderShiftsReport, ...(o.extra || {}) }[S.tab];
      body().innerHTML = `<div class="muted">加载中…</div>`;
      await run();
    }

    // ---------- 营业概况 ----------
    async function renderOverview() {
      const d = await o.get(`${o.base}/summary?${query()}`);
      const t = d.totals;
      const retail = st().retail, voucherOn = st().pay_voucher;
      const multi = d.days.length > 1;
      const max = Math.max(1, ...d.days.map((x) => x.revenue_cents));
      const tbl = (head, rows) => rows.length
        ? `<table class="list"><thead><tr>${head.map((h, i) => `<th class="${i ? "r" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "r num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : `<div class="card muted">暂无数据</div>`;
      body().innerHTML = `
    <div class="kpis">
      ${kpi("实收（收款 - 退款）", money(t.revenue_cents), rangeLabel())}
      ${kpi("结账单数", t.order_count, retail ? "" : `堂食 ${t.dine_in_count} · 外带 ${t.takeaway_count}`)}
      ${kpi("客单价", t.order_count ? money(Math.round(t.revenue_cents / t.order_count)) : "—")}
      ${kpi("优惠 + 抹零", money(t.discount_cents), t.gross_cents ? `原价合计 ${money(t.gross_cents)}` : "")}
      ${kpi("退款金额", money(t.refund_cents))}
      ${t.extra_cents ? kpi("加收费用", money(t.extra_cents), "打包费、服务费等") : ""}
      ${/* v1.42.13（设计梳理 R1）：标题统一用名词（法语以前是动词「Rembourser / Annuler un plat」），大字只放数字（以前「0 commandes」折成两行） */ ""}
      ${kpi("已作废订单", d.voided.count, d.voided.count ? money(d.voided.amount_cents) + " 不计入" : "")}
      ${kpi("已退菜品", d.cancelled_items.count, d.cancelled_items.count ? money(d.cancelled_items.amount_cents) : "")}
    </div>
    ${multi ? `<div class="scroll-x" style="margin-bottom:16px"><table class="list"><thead><tr><th>营业日</th><th class="r">单数</th><th class="r">实收</th><th class="r">现金</th><th class="r">刷卡</th><th class="r">退款</th><th style="width:30%"></th></tr></thead><tbody>
      ${d.days.map((x) => `<tr style="${x.order_count ? "" : "color:var(--muted)"}"><td>${x.date} <span class="muted">${"日一二三四五六"[new Date(x.date + "T12:00:00").getDay()]}</span></td><td class="r num">${x.order_count}</td><td class="r num">${yuan(x.revenue_cents)}</td>
        <td class="r num">${yuan(x.cash_cents)}</td><td class="r num">${yuan(x.card_cents)}</td><td class="r num">${x.refund_cents ? "-" + yuan(x.refund_cents) : ""}</td>
        <td><div class="bar" style="width:${Math.max(0, x.revenue_cents / max) * 100}%"></div></td></tr>`).join("")}
      </tbody></table></div>` : ""}
    ${t.order_count ? `<div class="grid2 rp-charts">
      <div class="card"><h3>哪个时段最忙（按结账时间）</h3>${hourChart(d.by_hour)}</div>
      <div class="card"><h3>热销前 10</h3>${d.top_items.length ? `<ol class="top-list">${(() => { const mx = Math.max(1, ...d.top_items.map((i) => i.qty)); return d.top_items.map((i) => `<li><span class="nm">${esc(i.name)}</span><span class="bar-wrap"><i style="width:${(i.qty / mx) * 100}%"></i></span><b class="num">${i.qty}</b><span class="muted num">${yuan(i.amount_cents)}</span></li>`).join(""); })()}</ol>` : `<div class="muted">暂无数据</div>`}</div>
    </div>` : ""}
    <div class="grid2">
      <div><h3>支付方式（扣除退款）</h3>${tbl(["方式", "金额"], [["现金", yuan(t.cash_cents)], ["刷卡", yuan(t.card_cents)], ...(t.voucher_cents || voucherOn ? [["🎫 餐券", yuan(t.voucher_cents)]] : []), ...(t.online_cents ? [["网上付款", yuan(t.online_cents)]] : []), ...(t.platform_cents ? [["外卖平台代收", yuan(t.platform_cents)]] : [])])}${t.tip_cents ? `<p class="muted" style="font-size:13px;margin:6px 0 0">另收小费 <b class="num">${money(t.tip_cents)}</b>（不计入实收）</p>` : ""}</div>
      ${d.vouchers?.length || voucherOn ? `<div><h3>🎫 餐券统计（对账用）</h3>${d.vouchers?.length ? tbl(["餐券", "笔数", "金额"], [...d.vouchers.map((v) => [esc(v.type), v.count, yuan(v.amount_cents)]), ["<b>合计</b>", `<b>${d.vouchers.reduce((s, v) => s + v.count, 0)}</b>`, `<b>${yuan(d.vouchers.reduce((s, v) => s + v.amount_cents, 0))}</b>`]]) : `<p class="muted" style="margin:4px 0">这段时间没有收餐券。</p>`}<p class="muted" style="font-size:12px;margin:6px 0 0">收餐券时点选是哪家的（Ticket Restaurant、Swile…），这里按家统计，寄给发券公司报销时核对。</p></div>` : ""}
      <div ${retail ? "hidden" : ""}><h3>堂食 / 外带</h3>${tbl(["类型", "单数", "实收"], [["堂食", t.dine_in_count, yuan(t.dine_in_cents)], ["外带", t.takeaway_count, yuan(t.takeaway_cents)]])}</div>
      ${d.by_platform?.length ? `<div><h3>外卖平台</h3>${tbl(["平台", "单数", "金额", "佣金", "到手"], d.by_platform.map((p) => [esc(p.name), p.order_count, yuan(p.amount_cents), p.commission_cents ? `${yuan(p.commission_cents)} <span class="muted">(${p.amount_cents ? Math.round((p.commission_cents / p.amount_cents) * 1000) / 10 : p.commission_bp / 100}%)</span>` : "", yuan(p.net_cents)]))}</div>` : ""}
      <div><h3>收银员</h3>${t.tip_cents ? tbl(["员工", "单数", "实收", "小费"], d.by_staff.map((s) => [esc(s.staff_name), s.order_count, yuan(s.amount_cents), s.tip_cents ? yuan(s.tip_cents) : ""])) : tbl(["员工", "单数", "实收"], d.by_staff.map((s) => [esc(s.staff_name), s.order_count, yuan(s.amount_cents)]))}</div>
    </div>
    <p class="muted" style="font-size:12px">口径：按营业日统计（营业日由班次决定，跨零点的班次算在开班那天）；实收 = 收款 - 退款；作废的订单不计入。</p>`;
    }

    // ---------- 菜品销售 ----------
    async function renderItemsReport() {
      const type = S.itemType ? `&type=${S.itemType}` : "";
      const controls = `
    <div class="toolbar">
      <div class="seg" id="itView">${ITEM_VIEWS.map(([k, l]) => `<button data-iv="${k}" class="${S.itemView === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="seg" id="itType" ${st().retail ? "hidden" : ""}>${[["", "全部"], ["dine_in", "堂食"], ["takeaway", "外带"]].map(([k, l]) => `<button data-it="${k}" class="${S.itemType === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${S.itemView !== "daily" ? `<div class="seg" id="itSort">${[["qty", "按份数"], ["amount", "按金额"]].map(([k, l]) => `<button data-is="${k}" class="${S.itemSort === k ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}
    </div>`;

      if (S.itemView === "daily") {
        const d = await o.get(`${o.base}/items/daily?${query()}${type}`);
        const max = Math.max(1, ...d.rows.flatMap((r) => Object.values(r.by_date)));
        body().innerHTML = controls + (d.rows.length ? `
      <div class="scroll-x"><table class="list matrix"><thead><tr><th>菜品</th><th>分类</th>${d.dates.map((x) => `<th class="r">${x.slice(5)}</th>`).join("")}<th class="r">合计</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${catTag(r.category, r.color)}</td>
        ${d.dates.map((x) => { const q = r.by_date[x] || 0; return `<td class="r num" style="${q ? `background:rgba(194,65,12,${(0.08 + (q / max) * 0.5).toFixed(2)})` : "color:#ccc"}">${q || "·"}</td>`; }).join("")}
        <td class="r num"><b>${r.total}</b></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="card empty">这段时间没有菜品销售</div>`);
        return;
      }

      const d = await o.get(`${o.base}/items?${query()}${type}`);
      const key = S.itemSort === "amount" ? "amount_cents" : "qty";
      const byKey = (a, b) => b[key] - a[key] || b.qty - a.qty;

      // 一行菜品（有规格/加料的可展开）
      const itemRow = (i, { rank, showTag, indent }) => {
        const open = S.expanded.has(i.menu_item_id);
        const arrow = i.options.length ? (open ? "▾ " : "▸ ") : "";
        return `<tr class="${i.options.length ? "clickable" : ""}" data-exp="${i.options.length ? i.menu_item_id : ""}">
        ${rank != null ? `<td class="r num rank">${rank}</td>` : ""}
        <td style="${indent ? "padding-left:24px" : ""}">${arrow}${esc(i.name)}${showTag ? " " + catTag(i.category, i.color) : ""}</td>
        <td class="r num">${i.qty}</td><td class="r num">${yuan(i.amount_cents)}</td>
        <td>${pctBar(i.share, i.color)}</td><td class="r num">${i.cancelled_qty ? `<span style="color:var(--danger)">${i.cancelled_qty}</span>` : ""}</td></tr>` +
          (open ? i.options.map((x) => `<tr class="opt-row">${rank != null ? "<td></td>" : ""}<td style="padding-left:${indent ? 48 : 28}px">${esc(x.text)}</td><td class="r num">${x.qty}</td><td class="r num">${yuan(x.amount_cents)}</td><td></td><td></td></tr>`).join("") : "");
      };

      let head, rows;
      if (S.itemView === "rank") {
        const list = d.categories.flatMap((c) => c.items).sort(byKey);
        head = `<tr><th class="r" style="width:48px">排名</th><th>菜品 / 分类</th><th class="r">份数</th><th class="r">原价金额</th><th style="width:26%">金额占比</th><th class="r">退菜</th></tr>`;
        rows = list.map((i, idx) => itemRow(i, { rank: idx + 1, showTag: true })).join("");
      } else {
        head = `<tr><th>分类 / 菜品</th><th class="r">份数</th><th class="r">原价金额</th><th style="width:26%">金额占比</th><th class="r">退菜</th></tr>`;
        rows = [...d.categories].sort((a, b) => (S.itemSort === "amount" ? b.amount_cents - a.amount_cents : a.sort - b.sort)).map((c) =>
          `<tr class="cat-row" style="${catVars(c.color)}"><td>${catTag(c.name, c.color)} <span class="muted" style="font-weight:400;font-size:12px">${c.items.length} 道菜</span></td>
        <td class="r num">${c.qty}</td><td class="r num">${yuan(c.amount_cents)}</td><td>${pctBar(c.share, c.color)}</td><td></td></tr>` +
          [...c.items].sort(byKey).map((i) => itemRow(i, { indent: true })).join("")
        ).join("");
      }
      const cols = S.itemView === "rank" ? 6 : 5;
      const foot = (label, qty, amount, cls = "") => `<tr class="${cls}">${cols === 6 ? "<td></td>" : ""}<td>${label}</td><td class="r num">${qty ?? ""}</td><td class="r num">${amount}</td><td></td><td></td></tr>`;
      const t = d.totals;
      body().innerHTML = controls + (d.categories.length ? `
    <div class="kpis">${kpi("菜品数", t.item_count)}${kpi("总份数", t.qty)}${kpi("菜品原价合计", money(t.item_gross_cents))}${kpi("这些订单实收", money(t.net_cents), `${t.order_count} 单`)}</div>
    ${S.itemView === "category" ? `<div class="cat-legend">${d.categories.map((c) => catTag(c.name, c.color)).join("")}</div>` : ""}
    <div class="scroll-x"><table class="list items-report"><thead>${head}</thead>
      <tbody id="itRows">${rows}</tbody>
      <tfoot>
        ${foot("菜品原价合计", t.qty, yuan(t.item_gross_cents))}
        ${foot("优惠 + 抹零", null, "-" + yuan(t.discount_cents))}
        ${foot("部分退款", null, "-" + yuan(t.partial_refund_cents))}
        ${foot("这些订单的实收", null, yuan(t.net_cents), "grand-row")}
      </tfoot></table></div>
    <p class="muted" style="font-size:12px">菜品按原价统计（整单优惠不分摊到菜品）；有规格/加料的菜点击可展开明细；分类颜色可在「菜单」页修改。${t.fully_refunded_orders ? `另有 ${t.fully_refunded_orders} 单全额退款，不计入菜品销量。` : ""}</p>`
        : `<div class="card empty">这段时间没有菜品销售</div>`);
    }

    // ---------- 交班记录 ----------
    async function renderShiftsReport() {
      const list = await o.get(`${o.base}/shifts?${query()}`);
      body().innerHTML = list.length ? `
    <div class="scroll-x"><table class="list"><thead><tr><th>营业日</th><th>班次</th><th>开班</th><th>交班</th><th class="r">单数</th><th class="r">本班实收</th>
      <th class="r">备用金</th><th class="r">应有现金</th><th class="r">实点现金</th><th class="r">长短款</th><th>备注</th>${o.shiftPrint ? "<th></th>" : ""}</tr></thead><tbody>
    ${list.map((s) => `<tr>
      <td>${s.business_date}</td><td>#${s.id}</td>
      <td>${hhmm(s.opened_at)} ${esc(s.opened_by_name || "")}${s.auto_opened ? ' <span class="badge">自动</span>' : ""}</td>
      <td>${s.closed_at ? `${s.closed_at.slice(5, 16)} ${esc(s.closed_by_name || "系统")}` : '<span class="badge warn">进行中</span>'}</td>
      <td class="r num">${s.order_count}</td><td class="r num">${yuan(s.net_cents)}</td><td class="r num">${yuan(s.opening_cash_cents)}</td>
      <td class="r num">${yuan(s.expected_cash_cents)}</td><td class="r num">${s.counted_cash_cents == null ? "—" : yuan(s.counted_cash_cents)}</td>
      <td class="r num">${s.diff_cents == null ? "—" : s.diff_cents === 0 ? '<span style="color:var(--ok)">0.00</span>' : `<b style="color:var(--danger)">${s.diff_cents > 0 ? "+" : ""}${yuan(s.diff_cents)}</b>`}</td>
      <td>${esc(s.note || "")}</td>
      ${o.shiftPrint ? `<td>${s.closed_at && !s.auto_closed ? `<button class="btn small" data-shift-print="${s.id}">补打交班单</button>` : ""}</td>` : ""}</tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="font-size:12px">应有现金 = 备用金 + 现金收款 + 现金小费 - 现金退款；长短款 = 实点现金 - 应有现金（正数长款、负数短款）。</p>`
        : `<div class="card empty">这段时间没有班次记录</div>`;
    }

    // 导出 Excel：带登录凭证下载
    async function exportExcel() {
      const btn = el("exp");
      btn.disabled = true;
      btn.textContent = "正在生成…";
      try {
        // 文件名按界面语言（B61）；双语模式 I18N.t 返回两行，取最后一行（B72）
        const fname = typeof I18N !== "undefined" ? String(I18N.t(`销售报表_${S.from}_${S.to}.xlsx`)).split(/\n/).pop() : `销售报表_${S.from}_${S.to}.xlsx`;
        if (typeof appSaveUrl === "function" && (await appSaveUrl(`${o.base}/export?${query()}`, fname, (o.headers && o.headers()) || {}))) return; // 安卓 App 直接下载保存（B64）
        const res = await fetch(`${o.base}/export?${query()}`, { headers: (o.headers && o.headers()) || {} });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "导出失败");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        if (!window.PosBridge) toast("已导出，请在浏览器的下载列表里查看", "success"); // 安卓 App 里由 App 提示存到了哪里
      } catch (err) {
        fail(err);
      } finally {
        btn.disabled = false;
        btn.textContent = "导出 Excel";
      }
    }

    // ---------- 事件（只绑一次） ----------
    const reload = () => load().catch(fail);
    el("tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rt]");
      if (b) { S.tab = b.dataset.rt; reload(); }
    });
    el("quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]");
      if (b) { [S.from, S.to] = quickRange(b.dataset.q); reload(); }
    });
    el("from").onchange = el("to").onchange = () => {
      S.from = el("from").value;
      S.to = el("to").value;
      if (!S.from || !S.to) return;
      if (S.from > S.to) [S.from, S.to] = [S.to, S.from];
      reload();
    };
    el("exp").onclick = exportExcel;
    body().addEventListener("click", (e) => {
      const it = e.target.closest("[data-it]"), iv = e.target.closest("[data-iv]"), is = e.target.closest("[data-is]");
      if (it) S.itemType = it.dataset.it;
      if (iv) S.itemView = iv.dataset.iv;
      if (is) S.itemSort = is.dataset.is;
      const exp = e.target.closest("[data-exp]");
      if (exp && exp.dataset.exp) {
        const id = Number(exp.dataset.exp);
        S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id);
      }
      if (it || iv || is || (exp && exp.dataset.exp)) renderItemsReport().catch(fail);
      const sp = o.shiftPrint && e.target.closest("[data-shift-print]");
      if (sp) o.shiftPrint(sp.dataset.shiftPrint).then(() => toast("已补打交班单", "success"), fail);
    });

    return { load, query, quickRange, rangeLabel, renderOverview, renderItemsReport, renderShiftsReport };
  }

  window.ReportsView = { create, RP_QUICK, ITEM_VIEWS };
})();
