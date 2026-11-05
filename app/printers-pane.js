// 打印机管理面板(设置页「打印机」分栏:打印机列表 / 出票规则 / 新增编辑 / 扫描局域网)——从 cashier.html 切出，纯搬运、逻辑未改。
// 作为全局 <script> 加载（在 cashier.html 内联脚本之后、stickers.js 之前），沿用同一全局作用域：
//   依赖内联脚本已定义的 S / $ / api / toast / esc / loadPrinters / pvars / printerTag / confirmModal / modal 等全局。
// 对外暴露：renderPrintersPane（设置页 tab 分发 + onLive 实时刷新，均在用户操作后触发，非启动期）。
//   copiesBadge / openPrinterForm / openScan 仅本面板内部使用。

// ---------- 打印机管理 ----------
function renderPrintersPane() {
  const { list, routes } = S.printers;
  const opts = (sel) => list.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}${p.enabled ? "" : "（已停用）"}</option>`).join("");
  $("#printersPane").innerHTML = `
    <div class="toolbar"><h3 style="margin-right:auto">打印机</h3>
      <button class="btn" id="pScan">扫描局域网</button><button class="btn primary" id="pAdd">+ 添加打印机</button></div>
    <div class="printer-grid">${list.map((p) => `
      <div class="card pcard2" style="${pvars(p.color)}">
        <div class="ph"><b>${esc(p.name)}</b>${printerStatusHtml(p)}</div>
        <div class="muted">${printerAddr(p)} · ${p.width === 32 ? "58mm" : "80mm"}</div>
        ${p.last_print_error ? `<div class="pfail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 22 20H2z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg><span><b>上次打印失败</b> · ${esc(new Date(p.last_print_error.at).toLocaleString())} · ${esc(p.last_print_error.error)}</span></div>` : ""}
        ${p.charset === "latin" ? `<div class="pnote"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg><span>字库「只有西文」：中文和双语对这台无效，会自动改打法语。要打中文请改成「中文」或「图片打中文」。</span></div>` : ""}
        <div class="chips" style="margin:6px 0">
          ${copiesBadge(p)}${p.full_order ? `<span class="badge accent">打整单</span>` : ""}${p.cut ? `<span class="badge">切纸</span>` : ""}${p.beep ? `<span class="badge">蜂鸣</span>` : ""}
          ${p.split_items ? `<span class="badge">一菜一单</span>` : ""}${p.drawer ? `<span class="badge">钱箱</span>` : ""}${p.backup_printer_id ? `<span class="badge accent">备用：${esc(printerName(p.backup_printer_id))}</span>` : ""}
        </div>
        <div class="pact"><button class="btn small" data-pcheck="${p.id}">测试连接</button><button class="btn small" data-ptest="${p.id}">打印测试页</button>
          <button class="btn small" data-pedit="${p.id}">编辑</button><button class="btn small danger" data-pdel="${p.id}">删除</button></div>
      </div>`).join("") || `<div class="card empty">还没有打印机，点「添加打印机」或「扫描局域网」</div>`}</div>

    <div class="card" style="margin-top:14px">
      <h3 style="margin-bottom:8px">出票规则</h3>
      <div class="route-row"><span>结账单 / 预结单 / 退款单 / 交班单</span><select id="rBill">${opts(routes.bill_printer_id)}</select></div>
      <p class="muted" style="font-size:12px;margin:2px 0 8px">每个分类的后厨单打到哪台：点上面打印机的「编辑」，勾它出哪些分类。哪台都没勾的分类不出后厨单（如冰柜饮料）。${(() => { const none = routes.categories.filter((c) => !c.printer_id); return none.length ? `<br>现在不出后厨单的分类：${none.map((c) => catTag(c.name, c.color)).join(" ")}` : ""; })()}</p>
      <label class="route-row"><span>结账后自动打小票</span><input type="checkbox" id="rReceiptAuto" ${S.settings?.receipt_auto !== false ? "checked" : ""}></label>
      <p class="muted" style="font-size:12px;margin:0">不勾：结账时默认不打小票，客人要的话在结账页勾「打印小票」，或者之后在「订单」里点「打印结账单」。网上付款、外卖平台的单也按这个来。法国规定：消费满 25 € 必须给客人单据（不满 25 € 客人要就要给），随时可以补打。</p>
      <button class="btn primary" id="rSave" style="margin-top:10px">保存出票规则</button>
      <p class="muted" style="font-size:12px;margin:8px 0 0">后厨单打到结账打印机时（比如没有独立吧台，饮品打到前台），标题会用分类名，如「饮品单」，免得和结账单混淆。</p>
    </div>
    <div class="card" style="margin-top:14px">
      <h3 style="margin-bottom:8px">A4 发票打印机</h3>
      <p class="muted" style="font-size:13px;margin:0 0 8px">客人需要正式发票时：在「订单」里打开这一单 →「开发票」，生成法国格式的 A4 发票（Facture），弹出打印预览后选这台打印机打印（选过一次之后会记住）。发票信息在「设置 → 日常经营 → 发票」里填写。</p>
      <div class="inline-form"><select id="invPrinter" style="min-width:220px"><option value="">${esc(S.settings?.invoice_printer || "（未设置）")}</option></select>
        <button class="btn small" id="invPrinterLoad">读取本机打印机</button><button class="btn small primary" id="invPrinterSave">保存</button></div>
    </div>`;
}

$("#printersPane").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.closest("#invPrinterLoad")) {
    const b = t.closest("#invPrinterLoad");
    b.disabled = true; b.textContent = "正在读取…";
    try {
      const list = await api("/api/printers/windows");
      const cur = S.settings?.invoice_printer || "";
      $("#invPrinter").innerHTML = `<option value="">（未设置）</option>` + list.map((p) => `<option value="${esc(p.name)}" ${p.name === cur ? "selected" : ""}>${esc(p.name)}${p.usb ? "（USB）" : ""}</option>`).join("");
      if (!list.length) toast(IS_MAC() ? "没有读到打印机，请先在「系统设置 → 打印机与扫描仪」里添加" : "没有读到打印机，请先在 Windows 里安装打印机驱动", "error");
    } catch (err) { toast(err.message, "error"); }
    b.disabled = false; b.textContent = "读取本机打印机";
    return;
  }
  if (t.closest("#invPrinterSave")) {
    try {
      S.settings = await api("/api/settings", { method: "PUT", body: { invoice_printer: $("#invPrinter").value } });
      toast("已保存发票打印机", "success");
    } catch (err) { toast(err.message, "error"); }
    return;
  }
  try {
    if (t.closest("#pAdd")) return openPrinterForm();
    if (t.closest("#pScan")) return openScan();
    const chk = t.closest("[data-pcheck]");
    if (chk) {
      chk.disabled = true; chk.textContent = "连接中…";
      const r = await api(`/api/printers/${chk.dataset.pcheck}/check`, { method: "POST", body: { deep: true } });
      toast(r.online ? `连接正常${r.latency_ms != null ? `，响应 ${r.latency_ms}ms` : ""}` : `连不上：${r.error || "未知原因"}`, r.online ? "success" : "error");
      await loadPrinters(); renderPrintersPane();
    }
    const tp = t.closest("[data-ptest]");
    if (tp) {
      const old = tp.textContent;
      tp.disabled = true; tp.textContent = "发送中…";
      try { await api(`/api/printers/${tp.dataset.ptest}/test-page`, { method: "POST" }); toast("已发送测试页，结果可在「打印」页查看", "success"); }
      finally { tp.disabled = false; tp.textContent = old; } // 不整面板重渲染：会把卡片换掉、刚点的按钮变游离；状态更新靠 broadcast 实时刷新
    }
    const ed = t.closest("[data-pedit]");
    if (ed) openPrinterForm(printerById(Number(ed.dataset.pedit)));
    const del = t.closest("[data-pdel]");
    if (del) {
      const p = printerById(Number(del.dataset.pdel));
      if (!(await confirmModal("删除打印机", `确定删除「${p.name}」？历史打印记录会保留。`, "删除", "danger"))) return;
      await api(`/api/printers/${p.id}`, { method: "DELETE" });
      toast("已删除", "success");
      await loadPrinters(); renderPrintersPane();
    }
    if (t.closest("#rSave")) {
      await api("/api/printers/routes", { method: "PUT", body: { bill_printer_id: Number($("#rBill").value), categories: [] } });
      const receiptAuto = $("#rReceiptAuto").checked;
      if (receiptAuto !== (S.settings?.receipt_auto !== false)) S.settings = await api("/api/settings", { method: "PUT", body: { receipt_auto: receiptAuto } });
      toast("出票规则已保存", "success");
      await Promise.all([loadPrinters(), loadMenu()]); renderPrintersPane();
    }
  } catch (err) { toast(err.message, "error"); }
});

// 小票模板：字号下拉、打印语言（选了马上保存，实际就按它打印）、预览用哪台打印机
document.addEventListener("change", async (e) => {
  if (!S.tpl) return;
  const t = e.target;
  if (t.dataset?.bsize != null) { const b = S.tpl.blocks[Number(t.dataset.bsize)]; b.size = t.value; delete b.big; markDirty(); renderTemplatesPane(); }
  try {
    if (t.id === "tplLang") await saveTplLang(t.value, tplLangNow().dual);
    if (t.id === "tplDual") await saveTplLang(tplLangNow().lang, t.checked);
  } catch (err) { toast(err.message, "error"); renderTemplatesPane(); }
  if (t.id === "tplPrinter") { S.tpl.printer = Number(t.value); refreshPreview(); }
});

// 份数徽标：三种都一样时只写一个数；都是 1 张不显示
function copiesBadge(p) {
  const k = p.kitchen_copies ?? p.copies, r = p.receipt_copies ?? p.copies;
  if (k === r && r === p.copies) return p.copies > 1 ? `<span class="badge">${p.copies} 份</span>` : "";
  return `<span class="badge">点菜单 ${k} · 结账单 ${r} · 其他 ${p.copies}</span>`;
}

// 添加 / 编辑打印机
function openPrinterForm(p = null, prefill = {}) {
  const v = { name: "", color: "", type: "tcp", address: "", port: 9100, width: 48, copies: 1, kitchen_copies: null, receipt_copies: null, full_order: 0, cut: 1, beep: 0, split_items: 0, drawer: 0, backup_printer_id: null, enabled: 1, ...p, ...prefill };
  const copySel = (id, n) => `<select id="${id}">${[1, 2, 3, 4, 5].map((x) => `<option ${x === n ? "selected" : ""}>${x}</option>`).join("")}</select>`;
  let type = v.type, color = v.color || Object.keys(CATEGORY_COLORS).find((c) => !S.printers.list.some((x) => x.color === c)) || "gray";
  const others = S.printers.list.filter((x) => !p || x.id !== p.id);
  const m = openModal({
    title: p ? `编辑打印机：${p.name}` : "添加打印机",
    body: `
      <label class="field"><span>名称</span><input type="text" id="pfName" maxlength="12" value="${esc(v.name)}" placeholder="如：厨房、前台收银、热菜档口"></label>
      <div class="field"><span>颜色</span><div class="color-pick" id="pfColor"></div></div>
      <div class="field"><span>连接方式</span><div class="seg" id="pfType">
        ${type === "agent" ? `<button data-t="agent" class="on">📱 手机蓝牙（App）</button>` : IS_ANDROID() ? `<button data-t="tcp">网口 / WiFi</button><button data-t="console">模拟（不接打印机）</button>` : `<button data-t="tcp">网口（后厨常用）</button><button data-t="share">USB（前台常用）</button><button data-t="serial">蓝牙</button><button data-t="console">模拟（不接打印机）</button>`}</div>
        ${type === "agent" && IS_ANDROID() && p && p.local ? `<p class="muted" style="font-size:12px;margin:4px 0 0">这台是这台平板（收银机）连着的蓝牙 / USB 打印机（连上后自动添加）。可以设一台备用打印机，这台打印机出问题时自动转打。</p>` : type === "agent" ? `<p class="muted" style="font-size:12px;margin:4px 0 0">${IS_ANDROID() ? "这台是手机 / 平板 App 连着的蓝牙打印机（App 连上后自动添加）。打印时 App 要开着、和收银平板在同一个 WiFi；可以设一台备用打印机，手机不在时自动转打。" : "这台是手机 / 平板 App 连着的蓝牙打印机（App 连上后自动添加）。打印时 App 要开着、和收银电脑在同一个 WiFi；可以设一台备用打印机，手机不在时自动转打。"}</p>` : IS_ANDROID() ? `<p class="muted" style="font-size:12px;margin:4px 0 0">这台平板上的蓝牙 / USB 打印机（包括商米、iMin 自带的打印机）：在「设置 → 打印机」上面的「本机打印机」里连上，会自动出现在打印机列表里。</p>` : `<p class="muted" style="font-size:12px;margin:4px 0 0">手机 / 平板上的蓝牙打印机：在「Gway 点单」App 里连上后会自动出现在这里。</p>`}</div>
      <div id="pfSerial">
        <label class="field"><span>蓝牙打印机（串口）</span><select id="pfCom"><option value="">正在读取…</option></select></label>
        <p class="muted" style="font-size:12px;margin:-6px 0 8px">${IS_MAC() ? "先打开打印机，在「系统设置 → 蓝牙」里配对（配对码一般是 0000 或 1234），然后点「重新读取」选中它。" : "先打开打印机，在 Windows「设置 → 蓝牙和其他设备 → 添加设备」里配对（配对码一般是 0000 或 1234）。配对后系统会给它一个串口（COM3、COM5…），在上面选中即可；有两个 COM 口的选「传出」那个。"}
          <button type="button" class="btn small" id="pfComReload">重新读取</button></p>
      </div>
      <div id="pfTcp" class="form-grid">
        <label class="field"><span>IP 地址</span><input type="text" id="pfIp" value="${type === "tcp" ? esc(v.address || "") : ""}" placeholder="192.168.1.201"></label>
        <label class="field"><span>端口</span><input type="number" id="pfPort" value="${v.port || 9100}"></label>
      </div>
      <div id="pfShare">
        <label class="field"><span>这台电脑上的打印机</span><select id="pfWin"><option value="">正在读取…</option></select></label>
        ${IS_MAC() ? `<label class="field"><span>打印机名称（队列名）</span><input type="text" id="pfPath" value="${type === "share" ? esc(v.address || "") : ""}" placeholder="XP_58"></label>
        <p class="muted" style="font-size:12px;margin:-6px 0 8px">USB 小票机先插到这台 Mac 上，在「系统设置 → 打印机与扫描仪」里添加（驱动选「通用」或厂家驱动都可以），然后在上面选中它。</p>` : `<label class="field"><span>共享路径</span><input type="text" id="pfPath" value="${type === "share" ? esc(v.address || "") : ""}" placeholder="\\\\localhost\\XP58"></label>
        <p class="muted" style="font-size:12px;margin:-6px 0 8px">USB 打印机需要先在 Windows 里共享：控制面板 → 设备和打印机 → 右键打印机 →「打印机属性」→「共享」，勾选共享并填一个英文共享名（如 XP58）。</p>`}
      </div>
      <div class="field"><span>纸宽</span><div class="seg" id="pfWidth"><button data-w="32">58mm</button><button data-w="48">80mm</button></div></div>
      <div class="field"><span>字库</span><div class="seg" id="pfCharset"><button data-cs="gbk" class="${v.charset !== "latin" && v.charset !== "image" ? "on" : ""}">能打中文</button><button data-cs="latin" class="${v.charset === "latin" ? "on" : ""}">只有西文</button><button data-cs="image" class="${v.charset === "image" ? "on" : ""}">图片打中文</button></div>
        <p class="muted" style="font-size:12px;margin:4px 0 0">不知道的话先「打印测试页」：中文是乱码就选「只有西文」（欧洲买的小票机常见），票据自动改用外语、没翻译的中文打成拼音。想在没有中文字库的机器上打出真正的中文 → 选「图片打中文」：整单画成图片再打，任何小票机都能打，稍慢一点、字略粗。</p></div>
      <div class="field"><span>每次打几张</span>
        <div class="form-grid three">
          <label class="field"><span>点菜单（后厨单）</span>${copySel("pfCopiesK", v.kitchen_copies ?? v.copies)}</label>
          <label class="field"><span>结账单</span>${copySel("pfCopiesR", v.receipt_copies ?? v.copies)}</label>
          <label class="field"><span>其他单据</span>${copySel("pfCopies", v.copies)}</label>
        </div>
        <p class="muted" style="font-size:12px;margin:-6px 0 0">其他单据：预结单、退菜、催菜、转台、退款、交班单等。</p></div>
      <div class="form-grid">
        <label class="field"><span>备用打印机（连不上时自动转打）</span><select id="pfBackup"><option value="">不设置</option>${others.map((x) => `<option value="${x.id}" ${x.id === v.backup_printer_id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      </div>
      <div class="chips checks">
        <label><input type="checkbox" id="pfCut" ${v.cut ? "checked" : ""}> 自动切纸</label>
        <label><input type="checkbox" id="pfBeep" ${v.beep ? "checked" : ""}> 打完蜂鸣提醒</label>
        <label><input type="checkbox" id="pfSplit" ${v.split_items ? "checked" : ""}> 后厨单一菜一单</label>
        <label><input type="checkbox" id="pfFull" ${v.full_order ? "checked" : ""}> 打整单（所有档口的菜都打在这台，标题「总单」）</label>
        <label><input type="checkbox" id="pfDrawer" ${v.drawer ? "checked" : ""}> 钱箱接在这台（现金收款/退款自动弹开）</label>
        <label><input type="checkbox" id="pfEnabled" ${v.enabled ? "checked" : ""}> 启用</label>
      </div>
      <div class="field"><span>出哪些分类的后厨单</span><div class="pf-cats" id="pfCats"></div>
        <p class="muted" style="font-size:12px;margin:4px 0 0">点一下勾上 / 取消。一个分类只归一台：勾到这台会从别的打印机移过来；哪台都不勾的分类不出后厨单。整单要打两张（厨房、吧台各一张），两台都勾上面的「打整单」就行。</p></div>`,
    buttons: [{ label: "取消" }, {
      label: "保存", kind: "primary",
      onClick: async () => {
        const body = {
          name: $("#pfName", m.el).value, color, type,
          address: type === "tcp" ? $("#pfIp", m.el).value : type === "share" ? $("#pfPath", m.el).value : type === "agent" ? v.address : type === "serial" ? $("#pfCom", m.el).value : null,
          port: Number($("#pfPort", m.el).value) || 9100, width: Number($("#pfWidth .on", m.el).dataset.w),
          copies: Number($("#pfCopies", m.el).value), kitchen_copies: Number($("#pfCopiesK", m.el).value), receipt_copies: Number($("#pfCopiesR", m.el).value),
          full_order: $("#pfFull", m.el).checked, backup_printer_id: $("#pfBackup", m.el).value ? Number($("#pfBackup", m.el).value) : null,
          charset: $("#pfCharset .on", m.el)?.dataset.cs || "gbk",
          cut: $("#pfCut", m.el).checked, beep: $("#pfBeep", m.el).checked, split_items: $("#pfSplit", m.el).checked, drawer: $("#pfDrawer", m.el).checked, enabled: $("#pfEnabled", m.el).checked,
        };
        const saved = p ? await api(`/api/printers/${p.id}`, { method: "PATCH", body }) : await api("/api/printers", { method: "POST", body });
        // 分类勾选变了：勾上的归这台，取消的变成「不出后厨单」
        const changed = cats.filter((c) => mine.has(c.id) !== (c.printer_id === (p?.id ?? -1))).map((c) => ({ id: c.id, printer_id: mine.has(c.id) ? saved.id : 0 }));
        if (changed.length) await api("/api/printers/routes", { method: "PUT", body: { categories: changed } });
        toast(p ? "已保存" : "已添加打印机，可以点「打印测试页」试一下", "success");
        await loadPrinters(); renderPrintersPane();
      },
    }],
  });
  // 分类勾选（店主 10-11：出票规则按打印机勾分类，卡片上不列，点开才看到）
  const cats = S.printers.routes?.categories || [];
  const mine = new Set(cats.filter((c) => p && c.printer_id === p.id).map((c) => c.id));
  const drawCats = () => {
    $("#pfCats", m.el).innerHTML = cats.map((c) => {
      const on = mine.has(c.id);
      const elsewhere = !on && c.printer_id && (!p || c.printer_id !== p.id) ? printerName(c.printer_id) : "";
      return `<button type="button" class="pf-cat ${on ? "on" : ""}" data-pfc="${c.id}" style="${catVars(c.color)}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(c.name)}${elsewhere ? `<small>${esc(elsewhere)}</small>` : !on && !c.printer_id ? "<small>不出单</small>" : ""}</button>`;
    }).join("") || `<span class="muted">还没有分类</span>`;
  };
  drawCats();
  m.el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pfc]");
    if (!b) return;
    const id = Number(b.dataset.pfc);
    mine.has(id) ? mine.delete(id) : mine.add(id);
    drawCats();
  });
  const render = () => {
    $("#pfColor", m.el).innerHTML = Object.entries(CATEGORY_COLORS).map(([k, c]) => `<button type="button" title="${c.name}" aria-label="${c.name}色" style="${catVars(k)}" class="${k === color ? "on" : ""}" data-pc="${k}"></button>`).join("");
    m.el.querySelectorAll("#pfType [data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === type));
    $("#pfTcp", m.el).classList.toggle("hidden", type !== "tcp");
    $("#pfShare", m.el).classList.toggle("hidden", type !== "share");
    $("#pfSerial", m.el).classList.toggle("hidden", type !== "serial");
  };
  m.el.querySelectorAll("#pfWidth [data-w]").forEach((b) => b.classList.toggle("on", Number(b.dataset.w) === v.width));
  m.el.addEventListener("click", (e) => {
    const c = e.target.closest("[data-pc]"); if (c) { color = c.dataset.pc; render(); }
    const tb = e.target.closest("#pfType [data-t]"); if (tb) { type = tb.dataset.t; render(); if (type === "share") loadWin(); if (type === "share" && !p) $("#pfWidth [data-w='32']", m.el).click(); if (type === "serial") { loadCom(); if (!p) $("#pfWidth [data-w='32']", m.el).click(); } }
    if (e.target.closest("#pfComReload")) loadCom(true);
    const w = e.target.closest("#pfWidth [data-w]"); if (w) m.el.querySelectorAll("#pfWidth [data-w]").forEach((b) => b.classList.toggle("on", b === w));
    const cs = e.target.closest("#pfCharset [data-cs]"); if (cs) m.el.querySelectorAll("#pfCharset [data-cs]").forEach((b) => b.classList.toggle("on", b === cs));
  });
  // Windows 已安装的打印机：选中已共享的自动填共享路径
  let winLoaded = false;
  const loadWin = async () => {
    if (winLoaded) return;
    winLoaded = true;
    const list = await api("/api/printers/windows").catch(() => []);
    $("#pfWin", m.el).innerHTML = `<option value="">${list.length ? "选择打印机…" : IS_MAC() ? "没有读到打印机（请先在「打印机与扫描仪」里添加）" : "没有读到打印机（可直接填共享路径）"}</option>` +
      list.map((w) => `<option value="${esc(w.path || "")}" ${w.path ? "" : "disabled"}>${esc(w.name)}${w.usb ? "（USB）" : ""}${w.path ? " → " + esc(w.path) : "（未共享）"}</option>`).join("");
  };
  // 电脑上的串口（配对好的蓝牙打印机）
  const loadCom = async (again) => {
    const sel = $("#pfCom", m.el);
    const cur = sel.value || (type === "serial" ? v.address : "");
    sel.innerHTML = `<option value="">正在读取…</option>`;
    const list = await api("/api/printers/serial-ports").catch(() => []);
    if (cur && !list.some((c) => c.port === cur)) list.unshift({ port: cur, name: "（现在找不到）", bluetooth: true });
    sel.innerHTML = `<option value="">${list.length ? "选择蓝牙打印机…" : "没有找到（请先在系统蓝牙里配对打印机）"}</option>` +
      list.map((c) => `<option value="${esc(c.port)}" ${c.port === cur ? "selected" : ""}>${esc(c.port.replace("/dev/cu.", ""))} · ${esc(c.name)}${c.bluetooth ? " 🔵" : ""}</option>`).join("");
    if (again) toast(list.length ? `找到 ${list.length} 个串口` : "没有找到串口", list.length ? "success" : "error");
  };
  $("#pfWin", m.el).onchange = (e) => { if (e.target.value) $("#pfPath", m.el).value = e.target.value; };
  render();
  if (type === "share") loadWin();
  if (type === "serial") loadCom();
  $("#pfName", m.el).focus();
}

// 扫描局域网
async function openScan() {
  const m = openModal({ title: "扫描局域网打印机", wide: true, body: `<p class="muted">正在扫描本机所在网段的 9100 端口（约 5~15 秒）…</p>` });
  try {
    const r = await api("/api/printers/scan");
    $(".modal-body", m.el).innerHTML = `
      <p class="muted" style="font-size:13px">已扫描 ${r.subnets.map(esc).join("、")}。扫描只建立连接、不发送任何内容，不会让打印机打出东西。<br>
        找到的可能是<b>小票打印机</b>（可以添加为出票打印机），也可能是<b>办公打印机</b>（打 A4 纸，用于从税务平台打印正式发票，请在 Windows 里安装驱动使用，不要添加为小票打印机）。</p>
      ${r.found.length ? `<table class="list"><thead><tr><th>IP 地址</th><th>端口</th><th class="r">响应</th><th></th></tr></thead><tbody>
        ${r.found.map((f) => `<tr><td class="num">${f.ip}</td><td>${f.port}</td><td class="r num">${f.latency_ms}ms</td>
          <td>${f.added_as ? `<span class="badge ok">已添加：${esc(f.added_as)}</span>` : `<button class="btn small primary" data-scanadd="${f.ip}">添加为小票打印机</button>`}</td></tr>`).join("")}
      </tbody></table>` : `<div class="card empty">没有找到开着 9100 端口的设备。请确认打印机已开机、网线已连到同一个路由器；也可以按打印机自检页上的 IP 手动添加。</div>`}`;
    m.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-scanadd]");
      if (b) { m.close(); openPrinterForm(null, { type: "tcp", address: b.dataset.scanadd, name: "" }); }
    });
  } catch (err) {
    $(".modal-body", m.el).innerHTML = `<p style="color:var(--danger)">${esc(err.message)}</p>`;
  }
}
