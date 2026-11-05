// 设置页「数据管理」分栏（云端备份 / 更新 / 导出导入 / 清空营业数据）——从 cashier.html 切出，纯搬运、逻辑未改。
// 作为全局 <script> 加载（在 cashier.html 内联脚本之后、stickers.js 之前），沿用同一全局作用域：
//   依赖内联脚本已定义的 S / $ / api / toast / store / licenseSync / renderRenewBanner 等全局。
// 对外暴露（内联脚本按名调用，均在用户操作后触发，非启动期）：
//   loadDataSection（设置页 tab 分发 + onLive 实时刷新）、
//   downloadExport / openImportMenu（供 menu-admin.js 的事件处理器调用）。

// ================= 设置：数据管理（备份 / 清空营业数据） =================
// ---------- 云端备份 ----------
async function renderCloudCard() {
  const c = await api("/api/admin/cloud-backup");
  const when = (t) => (t ? new Date(t).toLocaleString("zh-CN", { hour12: false }) : "");
  $("#cloudCard").innerHTML = `<div class="card" style="margin-bottom:12px"><b>☁️ 云端备份</b>
    ${!c.server ? `<p class="muted" style="font-size:13px;margin:6px 0 0">${IS_ANDROID() ? "这台平板" : "这台电脑"}的激活码里没有带授权服务器地址，不能用云端备份。请联系软件供应商换一个带联网核对的激活码。</p>` : `
    <p class="muted" style="font-size:13px;margin:6px 0 8px">每天自动把全部数据（订单、菜单、图片、发票）加密后传到软件供应商的服务器，只留最近几天的。${IS_ANDROID() ? "平板坏了、被偷了、换平板时，在新平板上装好、激活后，" : `电脑坏了、被偷了、换电脑时，
      在新电脑上装好、激活后，`}用下面的<b>恢复码</b>就能全部找回来。数据是用恢复码加密的，供应商也看不到内容。</p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cbOn" ${c.enabled ? "checked" : ""}> 开启云端备份（每天一次）</label>
    <p style="font-size:14px;margin:8px 0">${c.last_ok ? `<span class="badge ok">正常</span> 最近一次上传 ${esc(when(c.last_ok))}（${(c.last_size / 1048576).toFixed(1)} MB）` : '<span class="badge">还没有上传过</span>'}
      ${c.last_error ? ` · <span class="bad">最近一次失败：${esc(c.last_error)}</span>` : ""}
      ${c.last_note && !c.last_error ? ` · <span class="bad">${esc(c.last_note)}</span>` : ""}
      <button class="btn small" id="cbRun" ${c.running ? "disabled" : ""} style="margin-left:6px">${c.running ? "正在上传…" : "立即上传"}</button></p>
    <div class="cb-code ${c.acknowledged ? "" : "todo"}">
      ${c.acknowledged ? `恢复码已经记下。<button class="btn small" id="cbShow">查看恢复码</button>`
        : `<b>⚠ 请把恢复码抄下来（或打印出来）保存好</b>，${IS_ANDROID() ? "换平板恢复数据时要用，" : "换电脑恢复数据时要用，"}丢了谁都恢复不了：
          <div class="cb-code-v num" translate="no">${esc(c.code || "")}</div>
          <button class="btn small" id="cbPrint">打印恢复码</button> <button class="btn small primary" id="cbAck">我已经记下了</button>`}
      <span id="cbShown"></span>
    </div>
    <p style="margin:10px 0 0"><button class="btn" id="cbRestore">从云端恢复数据…</button> <span class="muted" style="font-size:12px">${IS_ANDROID() ? "（换了新平板时用）" : "（换了新电脑时用）"}</span></p>`}
  </div>`;
}
function printRecoveryCode(code) {
  const html = `<meta charset="utf-8"><title>恢复码</title><body style="font-family:sans-serif;padding:24px"><h2>Gway 收银系统 · 云端备份恢复码</h2>
    <p>${esc(S.settings?.store_name || "")}　${today()}</p><p style="font-size:26px;font-weight:bold;letter-spacing:2px;font-family:monospace">${esc(code)}</p>
    <p>${IS_ANDROID() ? "换平板、重装 App 后" : "换电脑、重装系统后"}，在「设置 → 数据与系统 → 数据管理 → 云端备份 → 从云端恢复数据」里输入这个恢复码。请妥善保管，不要给别人看。</p></body>`;
  if (inAndroidApp()) return hostPrintHtml(html, "Code"); // 安卓 App（平板 / 手机）：交给系统打印
  const w = window.open("", "_blank", "width=480,height=360");
  if (!w) return toast("浏览器挡住了打印窗口，请手动抄下恢复码", "error");
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
$("#dataSection").addEventListener("change", async (e) => {
  if (e.target.id !== "cbOn") return;
  try { await api("/api/settings", { method: "PUT", body: { cloud_backup: e.target.checked } }); toast(e.target.checked ? "已开启云端备份" : "已关闭云端备份", "success"); renderCloudCard(); }
  catch (err) { toast(err.message, "error"); }
});
$("#dataSection").addEventListener("click", async (e) => {
  const id = e.target.id;
  try {
    if (id === "cbRun") {
      e.target.disabled = true; e.target.textContent = "正在上传…";
      await api("/api/admin/cloud-backup/run", { method: "POST" }).then(() => toast("云端备份已上传", "success")).catch((err) => toast(err.message, "error"));
      renderCloudCard();
    }
    if (id === "cbAck") { await api("/api/admin/cloud-backup/ack", { method: "POST" }); toast("好的，请把恢复码放在安全的地方", "success"); renderCloudCard(); }
    if (id === "cbPrint") printRecoveryCode((await api("/api/admin/cloud-backup")).code);
    if (id === "cbShow") { const c = await api("/api/admin/cloud-backup"); $("#cbShown").innerHTML = ` <b class="num" translate="no" style="user-select:all">${esc(c.code)}</b> <button class="btn small" id="cbPrint">打印</button>`; }
    if (id === "cbRestore") openCloudRestore();
    if (id === "updCheck") { e.target.disabled = true; e.target.textContent = "正在检查…"; await api("/api/admin/update/check", { method: "POST" }); renderUpdateCard(); renderUpdateBanner(); }
    if (id === "updGo") { S.update = await api("/api/license/update"); startUpdate(); }
  } catch (err) { toast(err.message, "error"); }
});
function openCloudRestore() {
  let list = null;
  const m = openModal({
    title: "从云端恢复数据",
    wide: true,
    body: `<p class="muted" style="font-size:13px;margin-top:0">${IS_ANDROID() ? "输入原来那台收银机的<b>恢复码</b>，找到云端的备份后选一份恢复。<b>恢复会用备份替换这台平板上现在的全部数据</b>" : "输入原来那台电脑的<b>恢复码</b>，找到云端的备份后选一份恢复。<b>恢复会用备份替换这台电脑上现在的全部数据</b>"}（替换前会自动备份一份），完成后收银系统自动重启。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="crCode" placeholder="恢复码，如 ABCDE-FGHJK-LMNPQ-RSTUV" style="flex:1;min-width:240px;font-family:monospace" autocomplete="off" spellcheck="false">
        <button class="btn" id="crFind">查找备份</button></div>
      <div id="crList" style="margin-top:10px"></div>`,
    buttons: [{ label: "取消" }],
  });
  m.el.addEventListener("click", async (e) => {
    if (e.target.id === "crFind") {
      try {
        list = await api("/api/admin/cloud-backup/list", { method: "POST", body: { code: $("#crCode", m.el).value } });
        const when = (f) => f.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2}).*$/, "$1 $2:$3");
        $("#crList", m.el).innerHTML = `<p>找到「<b>${esc(list.store || "")}</b>」的 ${list.files.length} 份备份（UTC 时间）：</p>
          ${list.files.map((f, i) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="radio" name="crf" value="${esc(f.file)}" ${i ? "" : "checked"}> ${esc(when(f.file))} · ${(f.size / 1048576).toFixed(1)} MB${i ? "" : "（最新）"}</label>`).join("")}
          <label class="field" style="margin-top:8px"><span>再输一次店长 PIN 确认</span><input type="password" id="crPin" inputmode="numeric" maxlength="6" style="max-width:160px"></label>
          <button class="btn danger" id="crGo">用这份备份替换现在的数据</button>`;
      } catch (err) { toast(err.message, "error"); }
    }
    if (e.target.id === "crGo") {
      const file = m.el.querySelector("input[name=crf]:checked")?.value;
      if (!file) return;
      e.target.disabled = true; e.target.textContent = "正在下载并恢复…";
      try {
        const r = await api("/api/admin/cloud-backup/restore", { method: "POST", body: { code: $("#crCode", m.el).value, file }, headers: { "X-Admin-Pin": $("#crPin", m.el).value } });
        m.close?.();
        document.querySelectorAll(".modal-overlay").forEach((x) => x.remove());
        toast(r.restart === "auto" ? "数据已恢复，正在重启，稍等几秒" : "数据已恢复，请重新启动收银系统", "success");
        if (r.restart === "auto") reloadWhenServerBack();
      } catch (err) { toast(err.message, "error"); e.target.disabled = false; e.target.textContent = "用这份备份替换现在的数据"; }
    }
  });
}

// ---------- 软件升级 ----------
// 「上次检查」时间：数字格式（2026-10-28 14:05），哪种语言都不夹中文（B73）
function lastCheckText(t) {
  const d = new Date(t), p = (n) => String(n).padStart(2, "0");
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function renderUpdateCard() {
  const u = await api("/api/admin/update");
  $("#updateCard").innerHTML = `<div class="card" style="margin-bottom:12px"><b>⬆️ 软件升级</b>
    <p style="font-size:14px;margin:6px 0 0">当前版本 <b class="num">v${esc(u.current)}</b>
      ${!u.enabled ? '<span class="muted">· 激活码里没有带授权服务器地址，不能自动升级（请找供应商拿新安装包）</span>'
        : u.latest ? ` · 新版本 <b class="num">v${esc(u.latest.version)}</b> ${u.ready ? '<span class="badge ok">已下载好</span>' : u.progress != null ? `正在下载 ${u.progress}%` : ""}`
        : ' · <span class="badge ok">已是最新</span>'}
      ${u.enabled ? `<button class="btn small" id="updCheck" style="margin-left:6px">检查更新</button>` : ""}
      ${!u.ready ? "" : IS_ANDROID() && !IS_POS_HOST ? '<span class="muted">（请在收银平板上点升级）</span>' : `<button class="btn small primary" id="updGo">现在升级</button>`}</p>
    ${u.latest?.notes ? `<div class="upd-notes" style="margin-top:6px">${esc(u.latest.notes)}</div>` : ""}
    ${u.enabled ? `<p class="muted" style="font-size:12px;margin:6px 0 0">每 6 小时自动检查一次，有新版本会在后台下载，下载好后收银台顶部提示「现在升级」。${u.last_check ? `<span>上次检查 ${esc(lastCheckText(u.last_check))}</span>` : ""}${u.error ? ` · <span class="bad">${esc(u.error)}</span>` : ""}</p>` : ""}
  </div>`;
}

async function loadDataSection() {
  const b = await api("/api/admin/backups");
  const kb = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const reason = (f) => ({ auto: "自动", shift: "交班", manual: "手动", "before-clear": "清空前" })[f.match(/-(auto|shift|manual|before-clear)\.db$/)?.[1]] || "";
  const lic = await api("/api/license/status").catch(() => null);
  if (lic) S.license = lic;
  setTimeout(() => {
    $("#renewBtn")?.addEventListener("click", openRenew);
    $("#licSyncBtn")?.addEventListener("click", (e) => licenseSync(e.target).then(() => { renderRenewBanner(); loadDataSection().catch(() => {}); }));
  }, 0);
  setTimeout(() => { renderCloudCard().catch((err) => toast(err.message, "error")); renderUpdateCard().catch(() => {}); }, 0);
  $("#dataSection").innerHTML = `
    ${lic ? `<div class="card" style="margin-bottom:12px"><b>软件授权</b>
      <p style="margin:6px 0 0;font-size:14px">${!lic.required ? '<span class="muted">开发版，不需要激活</span>'
        : lic.activated ? `<span class="badge ok">已激活</span> ${esc(lic.name || "")} · ${lic.expires ? `有效期到 ${esc(lic.expires)}` : "永久授权"}`
        : '<span class="badge err">未激活</span>'}
        <span class="muted" style="margin-left:8px">机器码 <b class="num" translate="no">${esc(lic.machine_code)}</b></span>
        ${lic.required ? ` <button class="btn small" id="renewBtn" style="margin-left:8px">输入续费激活码</button>` : ""}</p>
        ${lic.contact ? `<p class="muted" style="font-size:12px;margin:4px 0 0">续费请联系：<span translate="no">${esc(lic.contact)}</span></p>` : ""}
        ${lic.online ? `<p class="muted" style="font-size:12px;margin:4px 0 0">联网验证：${lic.online.last_ok ? `上次成功 ${esc(new Date(lic.online.last_ok).toLocaleString())}` : "还没有成功过"}${lic.online.last_error ? ` · <span class="bad">${esc(lic.online.last_error)}</span>` : ""}
          <button class="btn small" id="licSyncBtn" style="margin-left:6px">立即联网验证</button></p>` : ""}</div>` : ""}
    <div id="cloudCard"></div>
    <div id="updateCard"></div>
    <div class="card" style="margin-bottom:12px">
      <b>一键导出 / 导入</b>
      <p class="muted" style="font-size:13px;margin:6px 0 10px">
        <b>全部数据</b>：菜单、桌台、员工、订单、报表、设置、菜品图片、发票存档打成一个文件。${IS_ANDROID() ? "换平板、重装 App 时，在新平板上「导入全部数据」就恢复原样（激活码和平板绑定，不在里面）。" : "换电脑、重装系统、从 Windows 换到 Mac 时，在新电脑上「导入全部数据」就恢复原样（激活码和电脑绑定，不在里面）。"}<br>
        菜单单独导出 / 导入（Excel 批量改、整店复制含图片）在「菜单」页最上面。</p>
      <div class="toolbar" style="flex-wrap:wrap;gap:8px">
        <button class="btn primary" id="expAll">⬇ 导出全部数据</button>
        <span style="flex:1"></span>
        <button class="btn danger" id="impAll">⬆ 导入全部数据…</button>
        <input type="file" id="impFile" accept=".zip,application/zip" hidden>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="toolbar" style="margin-bottom:8px"><b style="margin-right:auto">自动备份</b><button class="btn small primary" id="backupNow">立即备份</button></div>
      <p class="muted" style="font-size:13px;margin:0 0 8px">每次交班、清空数据前自动备份，距上次备份超过 20 小时也会自动备份；保留最近 ${b.keep} 份。<br>
        备份位置：<code>${esc(b.dir)}</code>${IS_ANDROID() ? "（平板用 USB 线连电脑能看到这个文件夹；另外建议每周点上面的「导出全部数据」，存到 U 盘或电脑上）" : "（建议在 .env 里用 BACKUP_DIR 改到另一块硬盘或 U 盘）"}<br>
        ${IS_ANDROID() ? "恢复方法：在新平板（或重装后）点「导入全部数据」，选导出的数据包。" : "恢复方法：关闭收银系统 → 把备份文件复制为 <code>data/pos.db</code> → 重新启动。"}</p>
      ${b.backups.length ? `<div class="scroll-x"><table class="list bk-table"><thead><tr><th>文件</th><th>类型</th><th class="r">大小</th><th>时间</th></tr></thead><tbody>
        ${b.backups.slice(0, 10).map((x) => `<tr><td><code>${esc(x.file)}</code></td><td>${reason(x.file)}</td><td class="r">${kb(x.size)}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join("")}
      </tbody></table></div>${b.backups.length > 10 ? `<p class="muted" style="font-size:12px">只显示最近 10 份，共 ${b.backups.length} 份</p>` : ""}` : `<p class="muted">还没有备份</p>`}
    </div>
    <div class="card danger-zone">
      <b>清空营业数据</b>
      <p class="muted" style="font-size:13px;margin:6px 0 10px">用于正式营业前清掉测试数据：删除所有订单、支付、退款、打印记录和班次，单号从 1 重新开始。<b>菜单、桌台、员工、操作日志保留</b>；清空前会自动备份。<br><b>按法国收银软件规定，第一次日结之后就不能再清空</b>；以后练习、测试请用「合规声明 → 培训模式」。</p>
      <button class="btn danger" id="clearData">清空营业数据…</button>
    </div>`;
}

// ---------- 一键导出 / 导入 ----------
async function downloadExport(type, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "正在打包…";
  try {
    // 安卓 App：App 直接下载保存（B64）；文件名和服务端一样
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    if (await appSaveUrl(`/api/admin/export?type=${type}`, `Gway收银系统-${type === "menu" ? "菜单" : "全部数据"}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`)) return;
    const res = await fetch(`/api/admin/export?type=${type}`, { headers: { Authorization: "Bearer " + store.get("pos_token") } });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `导出失败（${res.status}）`);
    const cd = res.headers.get("content-disposition") || "";
    const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || `pos-${type}.zip`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    // 安卓 App 里：保存由 App 做，App 会自己提示存到了哪里，这里不再弹一次（整改 F12）
    if (!window.PosBridge) toast(`已导出：${name}（保存在「下载」文件夹）`, "success");
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = label; }
}
// 选好文件后上传：expect = full / menu
function pickImportFile(onFile) {
  // 菜单页（整店复制）也用：数据管理页没打开过时没有 #impFile，临时建一个（放进页面里，安卓平板才弹得出选文件）
  let input = $("#impFile");
  if (!input) { input = Object.assign(document.createElement("input"), { type: "file", accept: ".zip,application/zip", id: "impFile", hidden: true }); document.body.appendChild(input); }
  input.value = "";
  input.onchange = () => { if (input.files[0]) onFile(input.files[0]); };
  input.click();
}
async function uploadImport(file, { expect, mode, pin }) {
  const headers = { Authorization: "Bearer " + store.get("pos_token"), "Content-Type": "application/zip" };
  if (pin) headers["X-Admin-Pin"] = pin;
  const res = await fetch(`/api/admin/import?expect=${expect}&mode=${mode || "merge"}`, { method: "POST", headers, body: file });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `导入失败（${res.status}）`);
  return data;
}
function openImportMenu() {
  pickImportFile((file) => {
    const m = openModal({
      title: "导入菜单",
      body: `<p>文件：<b>${esc(file.name)}</b>（${(file.size / 1024).toFixed(0)} KB）</p>
        <label style="display:flex;gap:8px;margin:8px 0"><input type="radio" name="impMode" value="merge" checked><span><b>合并</b>：同分类同名的菜更新价格、规格、图片；新菜添加；这里原有、文件里没有的菜保留</span></label>
        <label style="display:flex;gap:8px;margin:8px 0"><input type="radio" name="impMode" value="replace"><span><b>替换</b>：菜单变成和文件完全一样，文件里没有的菜和分类会被删除（历史订单、报表不受影响）</span></label>`,
      buttons: [{ label: "取消" }, {
        label: "导入", kind: "primary",
        onClick: async () => {
          const mode = $('input[name="impMode"]:checked', m.el).value;
          const r = await uploadImport(file, { expect: "menu", mode });
          toast(`菜单已导入：新增 ${r.items_added} 道、更新 ${r.items_updated} 道${r.items_removed ? `、删除 ${r.items_removed} 道` : ""}`, "success");
          await loadMenu().catch(() => {});
        },
      }],
    });
  });
}
function openImportAll() {
  pickImportFile((file) => {
    adminPinModal({
      title: "导入全部数据（恢复）",
      confirmLabel: "确认导入并重启",
      kind: "danger",
      body: `<p>文件：<b>${esc(file.name)}</b>（${(file.size / 1024 / 1024).toFixed(1)} MB）</p>
        <p>${IS_ANDROID() ? "这台平板上" : "这台电脑上"}现在的<b>所有数据会被文件里的数据替换</b>（菜单、订单、报表、设置、员工……）。</p>
        <p class="muted" style="font-size:13px">导入前会自动备份现在的数据；导入后收银系统会自动重启，所有收银窗口和手机需要重新登录。</p>`,
      onConfirm: async (root, pin) => {
        const r = await uploadImport(file, { expect: "full", pin });
        if (r.restart === "auto") {
          toast("数据已导入，正在重启，稍等几秒", "success");
          reloadWhenServerBack();
        } else {
          openModal({ title: "数据已导入", body: `<p>请关闭收银系统，再重新打开，导入的数据就会生效。</p><p class="muted" style="font-size:13px">导入前的数据已备份：${esc(r.backup)}</p>`, buttons: [{ label: "知道了", kind: "primary" }] });
        }
      },
    });
  });
}

$("#tab-settings").addEventListener("click", async (e) => {
  if (e.target.closest("#expAll")) return downloadExport("full", e.target.closest("#expAll"));
  if (e.target.closest("#impAll")) return openImportAll();
  if (e.target.closest("#backupNow")) {
    try { const r = await api("/api/admin/backups", { method: "POST" }); toast(`已备份：${r.file}`, "success"); await loadDataSection(); }
    catch (err) { toast(err.message, "error"); }
  }
  if (e.target.closest("#clearData")) {
    adminPinModal({
      title: "清空营业数据",
      confirmLabel: "确认清空",
      kind: "danger",
      body: `<p>将删除<b>所有订单、支付、退款、打印记录和班次</b>，只适合正式营业前清测试数据。</p>
        <p class="muted" style="font-size:13px">清空前会自动备份；菜单、桌台、员工和操作日志不受影响。</p>
        <label class="field"><span>请输入「确认清空」四个字</span><input type="text" id="clearText" autocomplete="off"></label>`,
      onConfirm: async (root, pin) => {
        if ($("#clearText", root).value.trim() !== "确认清空") { toast("请输入「确认清空」四个字", "error"); return false; }
        const r = await api("/api/admin/clear-data", { method: "POST", body: { admin_pin: pin, confirm_text: "确认清空" } });
        toast(`已清空 ${r.counts.orders} 张订单，清空前备份：${r.backup}`, "success");
        await Promise.all([loadTables(), loadTakeaway(), loadShift(), loadPrintFailed(), loadDataSection()]);
      },
    });
  }
});
