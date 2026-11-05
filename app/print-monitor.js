// 打印机监控台（打印记录页）——从 cashier.html 切出，纯搬运、逻辑未改。
// 作为全局 <script> 加载（在 cashier.html 的内联脚本之后），沿用同一全局作用域：
//   依赖内联脚本已定义的 S / $ / api / toast / today / esc / hhmm / confirmModal 等，
//   以及 dineNo / loadPrinters / pvars / printerTag / renderTicket / JOB_STATUS / KIND / canRetryJob。
// 对外暴露：loadPrint / onPrintEvent / loadPrintFailed / renderPrinterCards（内联脚本按名调用）。

// ================= 打印 =================
// 打印页是「打印机监控台」：紧凑列表只显示摘要，点开才加载票面；失败的置顶提醒；
// 新票和状态变化按条增量更新，不整页重拉。
const PJ_STATUS_FILTERS = [["", "全部"], ["failed", "失败"], ["sent", "已打印"], ["simulated", "模拟"]];

function jobWhere(j) {
  if (j.order_type === "takeaway") return dineNo(j);
  return j.table_no ? `${esc(j.table_no)} 桌` : "—";
}

async function loadPrint() {
  $("#printDate").value ||= today();
  $("#printStatus").innerHTML = PJ_STATUS_FILTERS.map(([k, label]) => `<button data-ps="${k}" class="${S.pj.status === k ? "on" : ""}">${label}</button>`).join("");
  await Promise.all([loadPrinters(), loadPrintFailed()]);
  renderPrinterCards();
  await loadJobs(true);
}

// 打印页顶部：每台打印机的状态卡片 + 按打印机筛选
function renderPrinterCards() {
  const list = S.printers.list;
  $("#printFilter").innerHTML = `<button data-f="" class="${S.pj.printer ? "" : "on"}">全部</button>` +
    list.map((p) => `<button data-f="${p.id}" style="${pvars(p.color)}" class="${S.pj.printer === String(p.id) ? "on" : ""}">${esc(p.name)}</button>`).join("");
  $("#printers").innerHTML = list.map((p) => `<div class="card pcard" style="padding:8px 14px;${pvars(p.color)}"><b>${esc(p.name)}</b>
    ${printerStatusHtml(p)} <span class="muted">${p.type === "console" ? "" : printerAddr(p) + " · "}${p.width === 32 ? "58" : "80"}mm</span>
    ${servesHtml(p)}</div>`).join("");
}
// v1.42.13（设计梳理 D1）：以前「模拟打印」状态标签后面又写一遍「模拟打印 · 58mm」；「打印：热菜后厨单、凉菜后厨单…」拼成一句，
// 法语被切成「Bon de cuisine Impression : Plats chauds, Bon de cuisine…」。现在分两行：收银票据 / 后厨单 + 分类，每项单独一块（分隔点用 CSS 画，不进翻译）
function servesHtml(p) {
  const r = S.printers.routes || {};
  const cats = (r.categories || []).filter((c) => c.printer_id === p.id).map((c) => c.name);
  const row = (k, list) => `<div class="pc-serves"><span class="pc-k">${k}</span>${list.map((x) => `<span class="pc-v">${esc(x)}</span>`).join("")}</div>`;
  return (p.id === r.bill_printer_id ? row("收银票据", ["结账单", "预结单", "退款单", "交班单"]) : "") + (cats.length ? row("后厨单", cats) : "");
}

async function loadJobs(reset) {
  const qs = new URLSearchParams({ date: $("#printDate").value || today(), limit: 50 });
  if (S.pj.printer) qs.set("printer", S.pj.printer);
  if (S.pj.status) qs.set("status", S.pj.status);
  if (S.pj.q) qs.set("q", S.pj.q);
  if (!reset && S.pj.jobs.length) qs.set("before_id", S.pj.jobs[S.pj.jobs.length - 1].id);
  const r = await api("/api/print-jobs?" + qs);
  S.pj.jobs = reset ? r.jobs : [...S.pj.jobs, ...r.jobs];
  S.pj.hasMore = r.has_more;
  renderJobs();
}

// 最近 24 小时打印失败：置顶横条 + 导航红点（任何页面都会更新）
async function loadPrintFailed() {
  S.pj.failed = (await api("/api/print-jobs/failed")).jobs;
  $("#printBadge").textContent = S.pj.failed.length;
  $("#printBadge").classList.toggle("hidden", !S.pj.failed.length);
  renderPrintAlert();
}

function renderPrintAlert() {
  const failed = S.pj.failed;
  if (!failed.length) { $("#printAlert").innerHTML = ""; return; }
  const byPrinter = {};
  for (const j of failed) (byPrinter[j.device_name || j.printer_name || "打印机"] ||= []).push(j);
  $("#printAlert").innerHTML = `
    <div class="palert">
      <b>⚠ ${failed.length} 张打印失败</b>
      <span class="palert-detail">${Object.entries(byPrinter).map(([name, list]) => `${printerTag(name + " " + list.length + " 张", list[0].device_color || list[0].printer_color)} ${esc(list[0].error || "未知原因")}`).join("　")}</span>
      <span class="palert-actions"><button class="btn small" data-pa="show">只看失败</button><button class="btn small primary" data-pa="retry">全部重打</button></span>
    </div>`;
}

function jobRow(j) {
  const open = S.pj.expanded.has(j.id);
  const [label, cls] = JOB_STATUS[j.status] || [j.status, ""];
  return `
    <div class="jrow st-${j.status} ${open ? "open" : ""}" style="${pvars(j.printer_color)}" data-job="${j.id}">
      <div class="jmain" data-toggle-job="${j.id}">
        <span class="jt num">${hhmm(j.created_at)}</span>
        <span class="jk">${KIND[j.kind] || j.kind}</span>
        <span class="jw">${jobWhere(j)}</span>
        <span class="jp">${printerTag(j.printer_name, j.printer_color)}${j.device_id && j.device_id !== j.printer_id ? `<span class="jdev">→${esc(j.device_name || "")}</span>` : ""}</span>
        <span class="js"><span class="badge ${cls}">${label}</span>${j.attempts > 1 ? ` <span class="muted">第 ${j.attempts} 次</span>` : ""}</span>
        <span class="ja">${j.status === "failed" ? `<button class="btn small" data-dismiss="${j.id}">忽略</button>` : ""}${canRetryJob(j) ? `<button class="btn small" data-rp="${j.id}">重打</button>` : ""}</span>
        <span class="chev">${open ? "▾" : "▸"}</span>
      </div>
      ${j.status === "failed" && j.error ? `<div class="jerr">${esc(j.error)}</div>` : ""}
      ${j.note ? `<div class="jnote">⚠ ${esc(j.note)}</div>` : ""}
      ${open ? `<div class="jprev">${S.pj.previews.has(j.id) ? renderTicket(S.pj.previews.get(j.id)) : '<span class="muted">加载中…</span>'}</div>` : ""}
    </div>`;
}

function renderJobs() {
  $("#printFilter").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.f === (S.pj.printer || "")));
  $("#printStatus").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.ps === S.pj.status));
  $("#jobs").innerHTML = S.pj.jobs.length
    ? S.pj.jobs.map(jobRow).join("")
    : `<div class="empty">${S.pj.q || S.pj.status || S.pj.target ? "没有符合条件的打印记录" : "这一天还没有打印记录"}</div>`;
  $("#jobsMore").innerHTML = S.pj.hasMore ? `<button class="btn" data-more>加载更早的 50 条</button>` : "";
}

function replaceJobRow(job) {
  const el = $(`#jobs [data-job="${job.id}"]`);
  if (el) el.outerHTML = jobRow(job);
}

// 新票是否符合当前筛选条件（和后端的筛选规则一致）
function jobMatchesFilters(j) {
  if (j.created_at.slice(0, 10) !== ($("#printDate").value || today())) return false;
  if (S.pj.printer && String(j.printer_id) !== S.pj.printer && String(j.device_id) !== S.pj.printer) return false;
  if (S.pj.status && j.status !== S.pj.status) return false;
  if (S.pj.q) {
    if (S.pj.q.startsWith("#")) return j.order_type === "takeaway" && j.pickup_no === Number(S.pj.q.slice(1));
    return j.order_type === "dine_in" && j.table_no === S.pj.q;
  }
  return true;
}

// 实时：同一批事件合并处理，每张票只取它自己
const pendingPrintIds = new Set();
let printEventTimer = null;
function onPrintEvent(jobId) {
  if (jobId) pendingPrintIds.add(jobId);
  clearTimeout(printEventTimer);
  printEventTimer = setTimeout(flushPrintEvents, 200);
}

async function flushPrintEvents() {
  const ids = [...pendingPrintIds].sort((a, b) => a - b);
  pendingPrintIds.clear();
  await loadPrintFailed().catch(() => {});
  if (S.tab !== "print") return;
  let changedList = false;
  for (const id of ids) {
    let job;
    try { job = await api(`/api/print-jobs/${id}`); } catch { continue; }
    const { payload, ...summary } = job;
    S.pj.previews.set(id, payload);
    const idx = S.pj.jobs.findIndex((j) => j.id === id);
    if (idx >= 0) {
      if (jobMatchesFilters(summary) || !S.pj.status) { S.pj.jobs[idx] = summary; replaceJobRow(summary); }
      else { S.pj.jobs.splice(idx, 1); changedList = true; } // 比如「只看失败」时这张重打成功了
    } else if (jobMatchesFilters(summary) && (!S.pj.jobs.length || id > S.pj.jobs[0].id)) {
      S.pj.jobs.unshift(summary);
      changedList = true;
    }
  }
  if (changedList) renderJobs();
}

// ---------- 交互 ----------
$("#printFilter").onclick = (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  S.pj.printer = b.dataset.f;
  loadJobs(true).catch((err) => toast(err.message, "error"));
};
$("#printStatus").onclick = (e) => {
  const b = e.target.closest("[data-ps]");
  if (!b) return;
  S.pj.status = b.dataset.ps;
  loadJobs(true).catch((err) => toast(err.message, "error"));
};
$("#printDate").onchange = () => loadJobs(true).catch((err) => toast(err.message, "error"));
let printSearchTimer = null;
$("#printSearch").oninput = (e) => {
  clearTimeout(printSearchTimer);
  printSearchTimer = setTimeout(() => {
    S.pj.q = e.target.value.trim();
    loadJobs(true).catch((err) => toast(err.message, "error"));
  }, 300);
};
$("#jobsMore").onclick = (e) => {
  if (e.target.closest("[data-more]")) loadJobs(false).catch((err) => toast(err.message, "error"));
};

$("#printAlert").onclick = async (e) => {
  const act = e.target.closest("[data-pa]")?.dataset.pa;
  if (act === "show") {
    S.pj.status = "failed";
    S.pj.printer = "";
    $("#printDate").value = today();
    await loadJobs(true);
  }
  if (act === "retry") {
    const n = S.pj.failed.length;
    const earliest = hhmm(S.pj.failed[S.pj.failed.length - 1].created_at);
    if (!(await confirmModal("全部重打", `将重新打印 ${n} 张失败的票（最早一张是 ${earliest}）。请先确认打印机已恢复，并和后厨确认这些菜还需要做。`, "全部重打"))) return;
    try {
      const r = await api("/api/print-jobs/retry-failed", { method: "POST" });
      toast(`已重新发送 ${r.retried} 张`, "success");
    } catch (err) { toast(err.message, "error"); }
  }
};

$("#jobs").onclick = async (e) => {
  const rp = e.target.closest("[data-rp]");
  const dismiss = e.target.closest("[data-dismiss]");
  try {
    if (rp) {
      await api(`/api/print-jobs/${rp.dataset.rp}/retry`, { method: "POST" });
      toast("已重新发送打印", "success");
      return;
    }
    if (dismiss) {
      await api(`/api/print-jobs/${dismiss.dataset.dismiss}/dismiss`, { method: "POST" });
      toast("已忽略这张失败的票");
      return;
    }
  } catch (err) {
    return toast(err.message, "error");
  }
  // 点击行：展开 / 收起票面预览（首次展开才去取票面）
  const row = e.target.closest("[data-toggle-job]");
  if (!row) return;
  const id = Number(row.dataset.toggleJob);
  const job = S.pj.jobs.find((j) => j.id === id);
  if (S.pj.expanded.has(id)) { S.pj.expanded.delete(id); return replaceJobRow(job); }
  S.pj.expanded.add(id);
  replaceJobRow(job);
  if (!S.pj.previews.has(id)) {
    try {
      S.pj.previews.set(id, (await api(`/api/print-jobs/${id}`)).payload);
    } catch (err) {
      S.pj.expanded.delete(id);
      toast(err.message, "error");
    }
    replaceJobRow(S.pj.jobs.find((j) => j.id === id) || job);
  }
};
