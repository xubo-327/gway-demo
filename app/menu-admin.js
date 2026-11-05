// 菜单管理页（店长改菜单：分类/菜品/规格/加料/图片/过敏原/爆款/打印菜单）
// ——从 cashier.html 切出，纯搬运、逻辑未改。作为全局 <script> 在内联脚本之后加载。
// 依赖内联脚本已定义的 S / $ / api / toast / amt / esc 等；运行时用到 MenuPrint(menuPrint.js)、Retail(retail.js)，均在事件回调内按名调用。
// 对外暴露：renderMenuAdmin（tab 切换 / 实时同步调用）、compressImage（logo 上传处调用）。

// ================= 菜单管理 =================
async function renderMenuAdmin() {
  setTimeout(() => backfillThumbs().catch(() => {}), 1500); // 以前上传、还没有缩略图的菜品图：在后台慢慢补做
  await allergenList().catch(() => {});
  renderAllergenWarn();
  $("#routeHint").textContent = "每个分类的后厨单打到哪台：在「设置 → 打印 → 打印机」里点打印机的「编辑」勾分类（点下面的打印机名直接过去）。新分类默认打到第一台后厨打印机（不是结账的那台）。";
  const { categories, items } = S.menu;
  $("#catSummary").textContent = `${categories.length} 个分类 · 改名、颜色、排序、供应时间`;
  if (!S.menuUi.catInit) { S.menuUi.catInit = true; $("#catDetails").open = categories.length <= 6; }
  const DAYS_OPTS = [["", "每天"], ["1,2,3,4,5", "周一到周五"], ["0,6", "周六、周日"], ["1,2,3,4,5,6", "周一到周六"]];
  $("#catList").innerHTML = `<table class="list"><thead><tr><th>分类</th><th>颜色</th><th>排序</th><th>出票打印机</th><th title="顾客扫码、平板、网上预订只在这个时间看得到；收银台一直能点">供应时间</th><th class="r">菜品数</th><th></th></tr></thead><tbody>
    ${categories.map((c) => `<tr><td><input type="text" value="${esc(c.name)}" data-cat="${c.id}" data-f="name" maxlength="20"></td>
      <td><div class="color-pick">${Object.entries(CATEGORY_COLORS).map(([k, v]) => `<button type="button" title="${v.name}" aria-label="${v.name}色" style="${catVars(k)}" class="${c.color === k ? "on" : ""}" data-cat-color="${c.id}" data-color="${k}"></button>`).join("")}</div></td>
      <td><span class="cell-h">排序</span><input type="number" value="${c.sort_order}" data-cat="${c.id}" data-f="sort_order" style="width:70px"></td>
      <td><span class="cell-h">出票打印机</span><button type="button" class="btn small" data-goprinters title="去打印机设置里改">${c.printer_id ? esc(printerName(c.printer_id)) : '<span class="muted">不出后厨单</span>'}</button></td>
      <td style="white-space:nowrap"><span class="cell-h">供应时间</span><input type="text" value="${esc(c.avail_hours || "")}" data-cat="${c.id}" data-f="avail_hours" placeholder="全天" style="width:120px" title="如 11:00-14:00；多段用逗号隔开">
        <select data-cat="${c.id}" data-f="avail_days">${DAYS_OPTS.map(([v, l]) => `<option value="${v}" ${(c.avail_days || "") === v ? "selected" : ""}>${l}</option>`).join("")}${c.avail_days && !DAYS_OPTS.some(([v]) => v === c.avail_days) ? `<option value="${esc(c.avail_days)}" selected>自定义</option>` : ""}</select>
        ${c.avail_hours || c.avail_days ? (c.available ? ' <span class="badge ok">供应中</span>' : ' <span class="badge">⏰ 现在不供应</span>') : ""}</td>
      <td class="r"><span class="cell-h">菜品数</span>${items.filter((i) => i.category_id === c.id).length}</td>
      <td class="cat-del"><button class="btn small danger" data-catdel="${c.id}">删除</button></td></tr>`).join("")}</tbody></table>`;
  renderItemList();
  renderHappy();
}

// ---------- 欢乐时段：如每天 17:00-19:00 饮品 8 折（下单时自动按折后价） ----------
function renderHappy() {
  const box = $("#happyBox");
  if (!box) return;
  const rules = (S.settings?.happy_rules || []).map((r) => ({ ...r }));
  const cats = S.menu.categories;
  const DAYS_OPTS = [["", "每天"], ["1,2,3,4,5", "周一到周五"], ["0,6", "周六、周日"], ["1,2,3,4,5,6", "周一到周六"]];
  const draw = () => {
    box.innerHTML = (rules.map((r, i) => `<div class="happy-row" data-i="${i}">
        <label class="chk"><input type="checkbox" data-k="on" ${r.on !== false ? "checked" : ""}> 启用</label>
        <input type="text" data-k="name" value="${esc(r.name || "")}" placeholder="名称，如 欢乐时光" maxlength="20" style="width:130px">
        <input type="text" data-k="hours" value="${esc(r.hours || "")}" placeholder="17:00-19:00" style="width:120px">
        <select data-k="days">${DAYS_OPTS.map(([v, l]) => `<option value="${v}" ${(r.days || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <span>打</span><input type="number" data-k="pct" value="${r.pct || 20}" min="1" max="99" style="width:64px"><span>% 折扣</span>
        <select data-k="cat"><option value="">全部菜</option>${cats.map((c) => `<option value="${c.id}" ${r.category_ids?.length === 1 && r.category_ids[0] === c.id ? "selected" : ""}>只限：${esc(c.name)}</option>`).join("")}</select>
        <button class="icon-btn" data-del aria-label="删除">×</button></div>`).join("") || '<p class="muted" style="margin:0">还没有欢乐时段。</p>') +
      `<div style="margin-top:8px;display:flex;gap:8px"><button class="btn small" id="happyAdd">+ 添加欢乐时段</button><button class="btn small primary" id="happySave">保存</button></div>`;
  };
  draw();
  box.oninput = box.onchange = (e) => {
    const row = e.target.closest("[data-i]");
    if (!row || !e.target.dataset.k) return;
    const r = rules[Number(row.dataset.i)], k = e.target.dataset.k;
    if (k === "on") r.on = e.target.checked;
    else if (k === "cat") r.category_ids = e.target.value ? [Number(e.target.value)] : [];
    else if (k === "pct") r.pct = Number(e.target.value);
    else r[k] = e.target.value;
  };
  box.onclick = async (e) => {
    if (e.target.id === "happyAdd") { rules.push({ name: "欢乐时光", hours: "17:00-19:00", days: "", pct: 20, category_ids: [], on: true }); return draw(); }
    const del = e.target.closest("[data-del]");
    if (del) { rules.splice(Number(del.closest("[data-i]").dataset.i), 1); return draw(); }
    if (e.target.id === "happySave") {
      try { S.settings = await api("/api/settings", { method: "PUT", body: { happy_rules: rules } }); await loadMenu(); renderMenuAdmin(); toast("欢乐时段已保存", "success"); }
      catch (err) { toast(err.message, "error"); }
    }
  };
}

// ---------- 菜单 Excel ----------
$("#mxExport").onclick = async () => {
  const b = $("#mxExport");
  b.disabled = true;
  try {
    if (await appSaveUrl("/api/admin/menu.xlsx", `菜单-${today()}.xlsx`)) { b.disabled = false; return; } // 安卓 App 直接下载保存（B64）
    const res = await fetch("/api/admin/menu.xlsx", { headers: { Authorization: "Bearer " + store.get("pos_token") } });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "导出失败");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `菜单-${today()}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("已导出：改好后点「从 Excel 导入」", "success");
  } catch (err) { toast(err.message, "error"); }
  b.disabled = false;
};
$("#mxImport").onclick = () => { $("#mxFile").value = ""; $("#mxFile").click(); };
$("#mxFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  const post = async (q) => {
    const res = await fetch("/api/admin/menu-xlsx" + q, { method: "POST", headers: { Authorization: "Bearer " + store.get("pos_token"), "Content-Type": "application/octet-stream" }, body: buf });
    const data = await res.json().catch(() => null);
    if (!res.ok && !data?.errors) throw new Error(data?.error || "导入失败");
    return data;
  };
  let hide = false;
  let pv;
  try { pv = await post(""); } catch (err) { return toast(err.message, "error"); }
  const body = () => {
    const s = pv.summary;
    const list = (title, arr, fmt, cls = "") => arr.length ? `<details ${arr.length <= 8 ? "open" : ""}><summary class="${cls}"><b>${title}（${arr.length}）</b></summary><ul class="mx-list">${arr.slice(0, 200).map((x) => `<li>${fmt(x)}</li>`).join("")}</ul></details>` : "";
    return `<p style="margin-top:0">文件：<b>${esc(file.name)}</b></p>
      ${pv.errors.length ? `<div class="mx-err">⚠ 表格里有 <b>${pv.errors.length}</b> 处要改，改好后再导入：<ul class="mx-list">${pv.errors.map((x) => `<li>${x.sheet !== "菜品" ? esc(x.sheet) + " 表 " : ""}第 <b>${x.row}</b> 行：${esc(x.message)}</li>`).join("")}</ul></div>` : ""}
      <div class="mx-sum"><span>新增 <b>${s.add}</b></span><span>修改 <b>${s.update}</b></span><span>删除 <b>${s.remove}</b></span><span>下架 <b>${s.hide}</b></span><span class="muted">没变 ${s.unchanged}</span>${s.new_categories ? `<span>新分类 <b>${s.new_categories}</b></span>` : ""}</div>
      ${list("新增的菜", pv.add, (x) => `${esc(x.name)} <span class="muted">· ${esc(x.category)} · ${money(x.price_cents)}</span>`)}
      ${list("修改的菜", pv.update, (x) => `${esc(x.name)}：<span class="muted">${x.changes.map(esc).join("；")}</span>`)}
      ${list("删除的菜", pv.remove, (x) => esc(x.name), "bad")}
      ${list("会下架的菜（表格里没有）", pv.hide, (x) => esc(x))}
      ${pv.new_categories.length ? `<p style="font-size:13px">新建分类：${pv.new_categories.map(esc).join("、")}</p>` : ""}
      <label class="chips checks" style="margin-top:8px"><label><input type="checkbox" id="mxHide" ${hide ? "checked" : ""}> 下架表格里没有的菜（${s.missing} 道；不删除，以后可以再上架）</label></label>`;
  };
  const m = openModal({
    title: "从 Excel 导入菜单 · 预览", wide: true, body: body(),
    buttons: [{ label: "取消" }, {
      label: "确认导入", kind: "primary",
      onClick: async () => {
        if (!pv.ok) { toast("表格里还有错误，请改好后重新选择文件", "error"); return false; }
        if (!pv.summary.add && !pv.summary.update && !pv.summary.remove && !pv.summary.hide) { toast("没有需要修改的地方"); return; }
        const r = await post(`?apply=1${hide ? "&hide_missing=1" : ""}`);
        if (!r.applied) throw new Error("导入失败");
        toast(`导入完成：新增 ${r.summary.add}，修改 ${r.summary.update}，删除 ${r.summary.remove}，下架 ${r.summary.hide}`, "success");
        await loadMenu(); renderMenuAdmin();
      },
    }],
  });
  const refresh = () => {
    $(".modal-body", m.el).innerHTML = body();
    const btn = m.el.querySelector(".modal-foot .btn.primary");
    if (btn) btn.disabled = !pv.ok;
  };
  m.el.addEventListener("change", async (ev) => {
    if (ev.target.id !== "mxHide") return;
    hide = ev.target.checked;
    try { pv = await post(hide ? "?hide_missing=1" : ""); } catch (err) { toast(err.message, "error"); }
    refresh();
  });
  refresh();
};

// 菜品列表：左边分类栏，右边这个分类的菜（500 道菜也不用一直往下翻）；
// 搜索时不分组，按拼音首字母排；勾选多道菜可以批量换分类、上架、沽清、调价、删除
function renderItemList() {
  const { categories, items } = S.menu;
  const ui = S.menuUi;
  ui.sel ||= new Set();
  for (const id of ui.sel) if (!items.some((i) => i.id === id)) ui.sel.delete(id);
  if (ui.cat == null || (ui.cat !== "" && !categories.some((c) => c.id === ui.cat))) ui.cat = categories[0]?.id ?? "";
  // 在售 = 上架而且今天没沽清；今日沽清 = 份数 0、过了换日时间自动恢复；已下架 = 长期不卖（店主 10-11：沽清并进份数）
  const statusOk = (i) => !ui.status || (ui.status === "on" ? i.is_active && !i.soldout_day && i.left !== 0 : ui.status === "soldout" ? i.is_active && (i.soldout_day || i.left === 0) : !i.is_active);
  const found = searchDishes(items, ui.q);

  $("#menuSide").innerHTML = `<button data-side="" class="${ui.cat === "" && !found ? "on" : ""}"><span class="nm">全部菜品</span><span class="ct">${items.length}</span></button>` +
    categories.map((c) => {
      const all = items.filter((i) => i.category_id === c.id);
      const off = all.filter((i) => !i.is_active).length;
      return `<button data-side="${c.id}" style="${catVars(c.color)}" class="${c.id === ui.cat && !found ? "on" : ""}"><span class="dot"></span><span class="nm">${esc(c.name)}</span><span class="ct">${all.length}${off ? ` <b title="沽清">-${off}</b>` : ""}</span></button>`;
    }).join("");

  const list = (found || (ui.cat === "" ? items : items.filter((i) => i.category_id === ui.cat))).filter(statusOk);
  const allSel = list.length > 0 && list.every((i) => ui.sel.has(i.id));
  const head = `<thead><tr><th class="ck"><label><input type="checkbox" id="selAll" ${allSel ? "checked" : ""} aria-label="全选"><span class="cell-h">全选</span></label></th><th>图片</th><th>菜号 / 菜名</th><th>分类</th><th>基础价</th><th>规格 / 加料</th><th>状态 / 操作</th></tr></thead>`;
  const rows = (arr) => arr.map((i) => itemRowHtml(i, categories)).join("");
  let body;
  if (!list.length) body = `<div class="card empty">${ui.q ? `没有找到「${esc(ui.q)}」相关的菜品` : ui.status ? "这里没有符合条件的菜品" : "这个分类还没有菜品，点上面「+ 新增菜品」添加"}</div>`;
  else if (!found && ui.cat === "") {
    // 全部：按分类分段
    body = `<div class="scroll-x"><table class="list mtable">${head}<tbody>${categories.map((c) => {
      const arr = list.filter((i) => i.category_id === c.id);
      return arr.length ? `<tr class="mgroup" style="${catVars(c.color)}"><td colspan="7"><span class="ctag">${esc(c.name)}</span> <span class="muted">${arr.length} 道</span></td></tr>${rows(arr)}` : "";
    }).join("")}</tbody></table></div>`;
  } else body = `<div class="scroll-x"><table class="list mtable">${head}<tbody>${rows(list)}</tbody></table></div>`;

  const total = items.length, off = items.filter((i) => !i.is_active).length, sold = items.filter((i) => i.is_active && (i.soldout_day || i.left === 0)).length;
  // 每段单独一个文字节点再翻译（整改 U3：整句模板「在售 {1}{2}」两个占位挨着，法语会拆错成「en vente9」）
  $("#itemCount").innerHTML = found || ui.status ? `找到 ${list.length} 道菜` : `<span>共 ${total} 道</span> · <span>在售 ${total - off - sold}</span>${sold ? ` · <span style="color:var(--danger)">今日沽清 ${sold}</span>` : ""}${off ? ` · <span class="muted">已下架 ${off}</span>` : ""}`;
  $("#itemStatus").querySelectorAll("button").forEach((btn) => btn.classList.toggle("on", btn.dataset.st === ui.status));
  $("#itemList").innerHTML = body;
  renderBulkBar();
}

function renderBulkBar() {
  const ui = S.menuUi, bar = $("#bulkBar");
  bar.hidden = !ui.sel.size;
  if (!ui.sel.size) return;
  bar.innerHTML = `<span>已选 <b>${ui.sel.size}</b> 道菜</span>
    <select id="bulkMove"><option value="">移到分类…</option>${S.menu.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
    <button class="btn small" data-bulk="soldout">今日沽清</button><button class="btn small" data-bulk="unsoldout">恢复</button>
    <button class="btn small" data-bulk="on">上架</button><button class="btn small" data-bulk="off">下架</button>
    <button class="btn small" data-bulk="price">调价 %</button><button class="btn small danger" data-bulk="delete">删除</button>
    <button class="btn small" data-bulk="clear" style="margin-left:auto">取消选择</button>`;
}

async function runBulk(action, extra = {}) {
  const ids = [...S.menuUi.sel];
  try {
    const r = await api("/api/menu/items/bulk", { method: "POST", body: { ids, action, ...extra } });
    if (action === "delete") S.menuUi.sel.clear();
    toast(`已处理 ${r.count} 道菜`, "success");
  } catch (e) { toast(e.message, "error"); }
  await loadMenu();
  renderMenuAdmin();
}

$("#menuSide").addEventListener("click", (e) => {
  const b = e.target.closest("[data-side]");
  if (!b) return;
  S.menuUi.cat = b.dataset.side === "" ? "" : Number(b.dataset.side);
  if (S.menuUi.q) { S.menuUi.q = ""; $("#itemSearch").value = ""; }
  renderItemList();
});
$("#itemList").addEventListener("change", (e) => {
  const ui = S.menuUi;
  if (e.target.id === "selAll") {
    const boxes = [...$("#itemList").querySelectorAll("[data-sel]")];
    for (const x of boxes) { x.checked = e.target.checked; e.target.checked ? ui.sel.add(Number(x.dataset.sel)) : ui.sel.delete(Number(x.dataset.sel)); }
    return renderBulkBar();
  }
  const s = e.target.closest("[data-sel]");
  if (s) { s.checked ? ui.sel.add(Number(s.dataset.sel)) : ui.sel.delete(Number(s.dataset.sel)); renderBulkBar(); }
});
$("#bulkBar").addEventListener("change", (e) => {
  if (e.target.id !== "bulkMove" || !e.target.value) return;
  runBulk("move", { category_id: Number(e.target.value) });
});
$("#bulkBar").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]");
  if (!b) return;
  const n = S.menuUi.sel.size, act = b.dataset.bulk;
  if (act === "clear") { S.menuUi.sel.clear(); return renderItemList(); }
  if (["on", "off", "soldout", "unsoldout"].includes(act)) return runBulk(act);
  if (act === "delete") {
    const ok = await confirmModal(`删除 ${n} 道菜`, "删除后菜单、点餐和扫码页都不再显示这些菜；历史订单和报表里照常保留。确定删除吗？", "删除", "danger");
    if (ok) runBulk("delete");
    return;
  }
  if (act === "price") {
    const m = openModal({
      title: `给 ${n} 道菜调价`,
      body: `<label class="field"><span>涨价写正数，降价写负数（%）</span><input type="number" id="bulkPct" step="0.5" placeholder="如 5 = 涨 5%，-10 = 降 10%"></label>
        <label class="chips checks"><label><input type="checkbox" id="bulkRound" checked> 调完凑整到 0.10（如 12.37 → 12.40）</label></label>
        <div class="muted" id="bulkPrev" style="font-size:13px;margin-top:8px"></div>`,
      buttons: [{ label: "取消" }, { label: "调价", kind: "primary", onClick: () => {
        const pct = Number($("#bulkPct").value);
        if (!pct) { toast("请填调价百分比", "error"); return false; }
        runBulk("price", { percent: pct, round: $("#bulkRound").checked ? 1 : 0 });
      } }],
    });
    const sample = S.menu.items.filter((i) => S.menuUi.sel.has(i.id)).slice(0, 3);
    const prev = () => {
      const pct = Number($("#bulkPct").value) || 0, r = $("#bulkRound").checked ? 10 : 1;
      $("#bulkPrev").innerHTML = pct ? "例：" + sample.map((i) => `${esc(i.name)} ${money(i.price_cents)} → <b>${money(Math.max(0, Math.round((i.price_cents * (100 + pct)) / 100 / r) * r))}</b>`).join("；") : "";
    };
    m.el.addEventListener("input", prev);
    m.el.addEventListener("change", prev);
    setTimeout(() => $("#bulkPct")?.focus(), 50);
  }
});

function itemRowHtml(i, categories, hit) {
  // 店主 10-11：一道菜一行，越简单越好 —— 照片（点一下换，右上角 × 删照片）、菜号菜名、分类、价格、规格 / 过敏原、状态、份数、爆款、⏸ 下架、🗑 删除
  // 规格的具体内容不在这里列（点「规格」看和改）；按钮说明在鼠标提示里。宽屏按钮上写字（.t），窄一点只显示符号（.i），手机上整张表左右滑
  // 双语时这一行只显示中文（译文在提示里），不把每个按钮撑成两行
  const nOpt = (i.options || []).length;
  const two = (t, ic) => `<span class="t">${t}</span><span class="i">${ic}</span>`;
  const alg = i.allergens == null ? `<span class="alg-miss">⚠</span>` : i.allergens.length ? allergenIcons(i) : "✓";
  const state = !i.is_active ? `<button class="btn small sale-btn sold-out" data-toggle="${i.id}" title="已下架 · 点击上架">${two("已下架", "⏸")}</button>`
    : !i.soldout_day && i.left === 0 ? `<button class="btn small sale-btn sold-out" data-stock="${i.id}" title="已售完 · 点击补份数">${two("已售完", "0")}</button>`
    : `<button class="btn small sale-btn ${i.soldout_day ? "sold-out" : "on-sale"}" data-soldout="${i.id}" title="${i.soldout_day ? "今日沽清 · 点击恢复" : "在售 · 点击沽清"}">${i.soldout_day ? two("今日沽清", "✕") : two("● 在售", "●")}</button>`;
  const left = i.left == null ? two("不限量", "∞") : i.sold_out ? two("已售罄", "0") : two(`剩 ${i.left} 份`, String(i.left));
  // 10-25 店主定：一行太挤 —— 限量了才在行里显示「剩 N 份」；设限量、招牌、下架、删除收进行尾「⋯」
  const stock = (label) => `<button class="btn small stock-cell" data-stock="${i.id}" title="剩余份数（限量）${i.daily_limit != null ? ` · 每天 ${i.daily_limit}` : ""}">${label || left}</button>`;
  return `<tr class="${i.is_active && !i.soldout_day ? "" : "sold-out"} ${hit ? "hit" : ""}" data-row="${i.id}">
      <td class="ck"><input type="checkbox" data-sel="${i.id}" ${S.menuUi.sel?.has(i.id) ? "checked" : ""} aria-label="选择"></td>
      <td class="mimg"><span class="mi-picw"><button type="button" class="mi-pic" data-img="${i.id}" title="${esc(I18N.t("照片和介绍") + ((i.photos || []).length ? " " + I18N.t(`· ${i.photos.length} 张照片`) : "") + (i.description ? " " + I18N.t("· 有介绍") : ""))}">${i.image ? thumbHtml(i, "mi-img") : `<span class="mi-img mi-noimg">📷</span>`}${(i.photos || []).length > 1 ? `<span class="mi-nph">${i.photos.length}</span>` : ""}</button>${i.image ? `<button type="button" class="mi-imgdel" data-imgdel="${i.id}" title="删除照片" aria-label="删除照片">×</button>` : ""}</span></td>
      <td class="mname"><div class="mi-name">${i.featured ? `<span class="mi-star" title="招牌菜">★</span>` : ""}<input type="text" class="mi-code" value="${esc(i.code || "")}" data-item="${i.id}" data-f="code" maxlength="8" placeholder="菜号" title="菜号：餐厅菜单上的号码，如 105、A12。收银台点菜时输入菜号按回车直接加菜"><input type="text" value="${esc(i.name)}" data-item="${i.id}" data-f="name" maxlength="40" aria-label="菜名"></div></td>
      <td class="mcat"><select data-item="${i.id}" data-f="category_id" aria-label="分类">${categories.map((c) => `<option value="${c.id}" ${c.id === i.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></td>
      <td class="mprice"><input type="number" value="${amt(i.price_cents)}" step="0.01" min="0" data-item="${i.id}" data-f="price" aria-label="基础价"></td>
      <td class="mopts"><button class="btn small ${nOpt ? "has" : ""}" data-opts="${i.id}" title="规格 / 加料${nOpt ? `（${nOpt} 组）` : ""}">${two(`规格${nOpt ? ` · ${nOpt}` : ""}`, `⚙${nOpt || ""}`)}</button><button class="btn small alg-btn ${i.allergens == null ? "miss" : ""}" data-alg="${i.id}" title="${i.allergens == null ? "未填过敏原" : "过敏原"}">${alg}</button></td>
      <td class="macts">${state}${i.left != null ? stock() : ""}<span class="imore"><button type="button" class="btn small ico-btn" data-imore="${i.id}" title="更多：限量份数、设为招牌、下架、删除" aria-label="更多" aria-expanded="false">⋯</button><div class="imore-pop" hidden>${i.left == null ? stock("∞ 限量份数") : ""}<button class="btn small hot-btn ${i.featured ? "on" : ""}" data-hot="${i.id}" title="${i.featured ? "爆款中（点一下取消）" : "设为爆款：收银台显示「爆款」小标，顾客点餐页和平板显示「招牌」小标，并排在热销最前面"}">${i.featured ? "★ 取消招牌" : "☆ 设为招牌"}</button>${i.is_active ? `<button class="btn small" data-toggle="${i.id}" title="下架：长期不卖，所有渠道都看不到，要手动上架">⏸ 下架</button>` : ""}<button class="btn small danger" data-itemdel="${i.id}" title="删除菜品">🗑 删除</button></div></span></td></tr>`;
}
// 过敏原图标（菜单列表里只显示图标，名字在提示里）
function allergenIcons(i) {
  const map = new Map((ALLERGENS || []).map((a) => [a.code, a]));
  return i.allergens.map((c) => `<span title="${esc(map.get(c)?.name || c)}">${map.get(c)?.icon || "•"}</span>`).join("");
}


// 搜索：即时过滤；Esc 清空
$("#itemSearch").addEventListener("input", (e) => { S.menuUi.q = e.target.value; renderItemList(); });
$("#itemSearch").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.target.value = ""; S.menuUi.q = ""; renderItemList(); }
});
$("#itemStatus").onclick = (e) => {
  const b = e.target.closest("[data-st]");
  if (!b) return;
  S.menuUi.status = b.dataset.st;
  renderItemList();
};

async function saveMenu(fn) {
  try { await fn(); await loadMenu(); renderMenuAdmin(); toast("已保存", "success"); }
  catch (e) { toast(e.message, "error"); await loadMenu(); renderMenuAdmin(); }
}

$("#tab-menu").addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.cat) {
    const v = el.dataset.f === "sort_order" ? Number(el.value) : el.value;
    saveMenu(() => api(`/api/menu/categories/${el.dataset.cat}`, { method: "PATCH", body: { [el.dataset.f]: v } }));
  } else if (el.dataset.item) {
    const f = el.dataset.f;
    const body = f === "price" ? { price_cents: toCents(el.value) } : f === "category_id" ? { category_id: Number(el.value) } : { [f]: el.value };
    saveMenu(() => api(`/api/menu/items/${el.dataset.item}`, { method: "PATCH", body }));
  }
});
// 每道菜行尾的「⋯」：点开 / 点别处收起（点了里面的按钮照常执行，再收起）；跟着按钮浮在上面，不被表格裁掉
function closeItemMore(except) {
  document.querySelectorAll("#tab-menu .imore-pop:not([hidden])").forEach((p) => {
    if (p === except) return;
    p.hidden = true;
    p.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}
function toggleItemMore(btn) {
  const pop = btn.nextElementSibling;
  closeItemMore(pop);
  pop.hidden = !pop.hidden;
  btn.setAttribute("aria-expanded", String(!pop.hidden));
  if (pop.hidden) return;
  const r = btn.getBoundingClientRect(), h = pop.offsetHeight;
  pop.style.left = Math.max(8, r.right - pop.offsetWidth) + "px";
  pop.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + "px";
}
document.addEventListener("scroll", () => closeItemMore(), true); // 菜单区或整页滚动：弹层是 fixed 的，会和那一行错开，收起
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeItemMore(); });
document.addEventListener("click", (e) => { if (!e.target.closest("#tab-menu")) closeItemMore(); });
$("#tab-menu").addEventListener("click", (e) => {
  const im = e.target.closest("[data-imore]");
  if (im) return toggleItemMore(im);
  closeItemMore();
  if (e.target.closest("[data-goprinters]")) { switchTab("settings"); switchSettings("printers"); return; }
  // 菜单导入 / 导出只在这里（店主 10-11：以前数据管理里还有一套）
  if (e.target.closest("#expMenu")) return downloadExport("menu", e.target.closest("#expMenu"));
  if (e.target.closest("#impMenu")) return openImportMenu();
  const find = (id) => S.menu.items.find((i) => i.id === Number(id));
  const cc = e.target.closest("[data-cat-color]");
  if (cc) saveMenu(() => api(`/api/menu/categories/${cc.dataset.catColor}`, { method: "PATCH", body: { color: cc.dataset.color } }));
  const hb = e.target.closest("[data-hot]");
  if (hb) {
    const item = find(hb.dataset.hot);
    hb.disabled = true;
    api(`/api/menu/items/${item.id}`, { method: "PATCH", body: { featured: !item.featured } })
      .then(async () => { toast(`「${item.name}」${item.featured ? "已取消爆款" : "已设为爆款"}`, "success"); await loadMenu(); renderMenuAdmin(); })
      .catch((err) => { toast(err.message, "error"); hb.disabled = false; });
  }
  // 今日沽清 / 恢复（份数 0，过了换日时间自动恢复）
  const so = e.target.closest("[data-soldout]");
  if (so) {
    const item = find(so.dataset.soldout);
    so.disabled = true;
    api(`/api/menu/items/${item.id}/stock`, { method: "POST", body: item.soldout_day ? { unsoldout: true } : { soldout_today: true } })
      .then(async () => { toast(`「${item.name}」${item.soldout_day ? "已恢复在售" : "今日沽清（明天开门自动恢复）"}`, "success"); await loadMenu(); renderMenuAdmin(); })
      .catch((err) => { toast(err.message, "error"); so.disabled = false; });
  }
  const b = e.target.closest("[data-toggle]");
  if (b) {
    const item = find(b.dataset.toggle);
    const next = !item.is_active;
    b.disabled = true;
    api(`/api/menu/items/${item.id}`, { method: "PATCH", body: { is_active: next } })
      .then(async () => {
        toast(`「${item.name}」${next ? "已上架" : "已下架"}`, "success");
        await loadMenu();
        renderMenuAdmin();
      })
      .catch((err) => { toast(err.message, "error"); b.disabled = false; });
  }
  const img = e.target.closest("[data-img]");
  if (img) openPhotoEditor(find(img.dataset.img));
  const del = e.target.closest("[data-imgdel]");
  // 删照片前先确认（触屏上手指容易碰到角上的 ×）
  if (del) confirmModal("删除照片", `删除「${find(del.dataset.imgdel)?.name || ""}」的照片？`, "删除", "danger")
    .then((ok) => { if (ok) saveMenu(() => api(`/api/menu/items/${del.dataset.imgdel}/image`, { method: "DELETE" })); });
  const opts = e.target.closest("[data-opts]");
  if (opts) openOptionsEditor(find(opts.dataset.opts));
  const stk = e.target.closest("[data-stock]");
  if (stk) openStockEditor(find(stk.dataset.stock), () => renderMenuAdmin());
  const alg = e.target.closest("[data-alg]");
  if (alg) openAllergenEditor(find(alg.dataset.alg));
  if (e.target.closest("#algFillFirst")) {
    const first = S.menu.items.find((i) => i.allergens == null);
    if (first) openAllergenEditor(first);
  }
});

// ---------- 过敏原（欧盟 14 类） ----------
let ALLERGENS = null;
async function allergenList() { return (ALLERGENS ||= await api("/api/menu/allergens")); }
function renderAllergenWarn() {
  const miss = S.menu.items.filter((i) => i.allergens == null && i.is_active);
  $("#allergenWarn").innerHTML = miss.length ? `<div class="alg-warn">⚠ 还有 <b>${miss.length}</b> 道在售的菜没有填过敏原。
    欧盟法规（1169/2011）要求餐厅在顾客点餐前告知 14 类过敏原，网上点餐、外卖也一样。
    <button class="btn small" id="algFillFirst">从第一道开始填</button>
    <span class="muted">也可以用上面的 Excel 批量填「过敏原」那一列。</span></div>` : "";
}
async function openAllergenEditor(item) {
  const list = await allergenList();
  let sel = new Set(item.allergens || []);
  let none = Array.isArray(item.allergens) && !item.allergens.length;
  const body = () => `<p class="muted" style="margin-top:0;font-size:13px">勾选「${esc(item.name)}」含有的过敏原（包括酱料、配菜里的）。顾客点餐页、网上预订会显示这些图标。</p>
    <div class="alg-grid">${list.map((a) => `<button type="button" class="alg-opt ${sel.has(a.code) ? "on" : ""}" data-ac="${a.code}"><span class="ai">${a.icon}</span>${esc(a.name)}</button>`).join("")}</div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="algNone" ${none && !sel.size ? "checked" : ""}> 确认不含以上任何过敏原</label>`;
  const m = openModal({
    title: `过敏原：${item.name}`, wide: true, body: body(),
    buttons: [{ label: "取消" }, {
      label: "保存", kind: "primary",
      onClick: async () => {
        if (!sel.size && !$("#algNone", m.el).checked) { toast("请勾选含有的过敏原，或者勾「确认不含以上任何过敏原」", "error"); return false; }
        await api(`/api/menu/items/${item.id}`, { method: "PATCH", body: { allergens: [...sel] } });
        toast("已保存过敏原", "success");
        await loadMenu(); renderMenuAdmin();
        // 连续填：自动打开下一道还没填的菜
        const next = S.menu.items.find((i) => i.allergens == null && i.is_active);
        if (next && e_next) setTimeout(() => openAllergenEditor(next), 200);
      },
    }],
  });
  let e_next = !(item.allergens != null);
  m.el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ac]");
    if (!b) return;
    sel.has(b.dataset.ac) ? sel.delete(b.dataset.ac) : sel.add(b.dataset.ac);
    b.classList.toggle("on", sel.has(b.dataset.ac));
    if (sel.size) $("#algNone", m.el).checked = false;
  });
  m.el.addEventListener("change", (e) => { if (e.target.id === "algNone" && e.target.checked) { sel.clear(); m.el.querySelectorAll("[data-ac]").forEach((b) => b.classList.remove("on")); } });
}

// 删除菜品 / 分类（需确认；点过的菜只是从菜单里消失，历史订单和报表保留）
$("#tab-menu").addEventListener("click", async (e) => {
  const di = e.target.closest("[data-itemdel]");
  if (di) {
    const item = S.menu.items.find((i) => i.id === Number(di.dataset.itemdel));
    if (!item) return;
    const ok = await confirmModal(`删除菜品「${item.name}」`, "删除后菜单、点餐和扫码页都不再显示这道菜；历史订单和报表里照常保留。确定删除吗？", "删除", "danger");
    if (ok) saveMenu(() => api(`/api/menu/items/${item.id}`, { method: "DELETE" }));
    return;
  }
  const dc = e.target.closest("[data-catdel]");
  if (dc) {
    const cat = S.menu.categories.find((c) => c.id === Number(dc.dataset.catdel));
    if (!cat) return;
    const n = S.menu.items.filter((i) => i.category_id === cat.id).length;
    if (n) return toast(`分类「${cat.name}」里还有 ${n} 道菜，请先删除或换到别的分类`, "error");
    if (await confirmModal(`删除分类「${cat.name}」`, "确定删除这个分类吗？", "删除", "danger")) saveMenu(() => api(`/api/menu/categories/${cat.id}`, { method: "DELETE" }));
  }
});

// ---------- 菜品图片：浏览器里先缩小到 800px、转 JPG 再上传，手机拍的大图也很快 ----------
async function compressImage(file, maxSize = 1080, quality = 0.85) { // 顾客点图片可以看大图，1080 像素手机上看得清
  const url = URL.createObjectURL(file);
  try {
    return await scaleImage(url, maxSize, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function scaleImage(url, maxSize, quality) {
  {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("无法读取这张图片，请换 JPG/PNG 格式"));
      im.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // 透明 PNG 转 JPG 时用白底
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
}

// ---------- 缩略图（v1.25.1）：菜单卡片上的小图用 400 px 的缩略图（二三十 KB），点开看大图才用原图 ----------
// 服务器上没有安全的缩图工具，所以在这里（浏览器）缩好再上传。以前上传的图：店长打开「菜单」页时自动补做。
const THUMB_PX = 400;
async function uploadThumb(itemId, imageUrl, src) {
  const own = typeof src !== "string";
  const url = own ? URL.createObjectURL(src) : src;
  try {
    const blob = await scaleImage(url, THUMB_PX, 0.8);
    if (!blob) return;
    const res = await fetch(`/api/menu/items/${itemId}/image/thumb?of=${encodeURIComponent(imageUrl)}`, { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") }, body: blob });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).thumb;
  } finally { if (own) URL.revokeObjectURL(url); }
}
const thumbTried = new Set();
let thumbBusy = false;
async function backfillThumbs() {
  if (thumbBusy || !isAdmin()) return;
  const todo = (S.menu?.items || []).filter((i) => i.image && !i.thumb && /^\/uploads\/.+\.(jpe?g|png|webp)$/i.test(i.image) && !thumbTried.has(i.image));
  if (!todo.length) return;
  thumbBusy = true;
  try {
    for (const i of todo) {
      thumbTried.add(i.image);
      if (document.hidden) break;
      try { i.thumb = await uploadThumb(i.id, i.image, i.image); } catch {}
      await new Promise((r) => setTimeout(r, 150)); // 慢慢做，不卡收银
    }
  } finally { thumbBusy = false; }
}

$("#imageInput").onchange = async (e) => {
  const file = e.target.files[0];
  const itemId = e.target.dataset.target;
  if (!file || !itemId) return;
  saveMenu(async () => {
    const blob = await compressImage(file);
    const res = await fetch(`/api/menu/items/${itemId}/image`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") },
      body: blob,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "上传失败");
    const { image } = await res.json().catch(() => ({}));
    if (image) await uploadThumb(itemId, image, blob).catch(() => {}); // 缩略图失败不影响：卡片上用原图
  });
};

// ---------- 照片和介绍（v1.38 电商版）：最多 6 张照片（第一张是封面）、详细介绍、参数表 ----------
// 照片的增删、调顺序马上生效；介绍和参数点「保存」才存
const MAX_PHOTOS = 6;
// 详情图：统一 1080 像素宽（高度按原图比例，长图最高 4000 像素），和主图（最长边 1080）不一样
const MAX_DETAILS = 10;
async function uploadDetail(itemId, file) {
  const url = URL.createObjectURL(file);
  let blob;
  try {
    const img = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error("无法读取这张图片，请换 JPG/PNG 格式")); im.src = url; });
    const s = Math.min(1, 1080 / img.naturalWidth, 4000 / img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
  const res = await fetch(`/api/menu/items/${itemId}/details`, { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") }, body: blob });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "上传失败");
  await uploadThumb(itemId, j.image, blob).catch(() => {});
  return j;
}
async function uploadPhoto(itemId, file) {
  const blob = await compressImage(file);
  const res = await fetch(`/api/menu/items/${itemId}/photos`, { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") }, body: blob });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "上传失败");
  await uploadThumb(itemId, j.image, blob).catch(() => {}); // 缩略图失败不影响：用原图
  return j;
}
// opts（超市 / 百货的商品用，v1.38.3）：title 标题；photoTip 照片说明；photosOnly 只管照片（多规格的某个规格：颜色图）；onChange 改完怎么刷新
function openPhotoEditor(item, opts = {}) {
  if (!item) return;
  const reload = opts.onChange || (async () => { await loadMenu(); renderMenuAdmin(); });
  let photos = (item.photos || []).slice();
  let details = (item.details || []).slice();
  let specs = (item.specs || []).map((r) => ({ ...r }));
  if (!specs.length) specs.push({ k: "", v: "" });
  let busy = false;
  const photosHtml = () => `<div class="ph-grid">${photos.map((p, n) => `<div class="ph-tile">
      <img src="${esc(p.thumb || p.src)}" alt="">${n === 0 ? `<span class="ph-cover">封面</span>` : ""}
      <div class="ph-acts">${n > 0 ? `<button type="button" data-pmove="${n}" data-d="-1" title="往前挪" aria-label="往前挪">◀</button>` : "<i></i>"}${n > 0 ? `<button type="button" data-pcover="${n}" title="设为封面" aria-label="设为封面">★</button>` : ""}${n < photos.length - 1 ? `<button type="button" data-pmove="${n}" data-d="1" title="往后挪" aria-label="往后挪">▶</button>` : "<i></i>"}<button type="button" class="del" data-pdel="${n}" title="删除这张" aria-label="删除这张">×</button></div></div>`).join("")}
      ${photos.length < MAX_PHOTOS ? `<label class="ph-tile ph-add">${busy ? "…" : "＋"}<span>${busy ? "正在上传" : "加照片"}</span><input type="file" accept="image/*" multiple hidden id="phAdd"></label>` : ""}</div>`;
  const detailsHtml = () => `<div class="ph-grid dt-grid">${details.map((p, n) => `<div class="ph-tile dt-tile"><img src="${esc(p.thumb || p.src)}" alt=""><span class="ph-cover dt-no">${n + 1}</span>
      <div class="ph-acts">${n > 0 ? `<button type="button" data-dmove="${n}" data-d="-1" title="往前挪" aria-label="往前挪">◀</button>` : "<i></i>"}${n < details.length - 1 ? `<button type="button" data-dmove="${n}" data-d="1" title="往后挪" aria-label="往后挪">▶</button>` : "<i></i>"}<button type="button" class="del" data-ddel="${n}" title="删除这张" aria-label="删除这张">×</button></div></div>`).join("")}
      ${details.length < MAX_DETAILS ? `<label class="ph-tile ph-add dt-tile">${busy ? "…" : "＋"}<span>${busy ? "正在上传" : "加详情图"}</span><input type="file" accept="image/*" multiple hidden id="dtAdd"></label>` : ""}</div>`;
  const specsHtml = () => specs.map((r, n) => `<div class="spec-row"><input type="text" maxlength="30" placeholder="名称，如 容量" value="${esc(r.k)}" data-sk="${n}" aria-label="参数名称"><input type="text" maxlength="120" placeholder="内容，如 500 ml" value="${esc(r.v)}" data-sv="${n}" aria-label="参数内容"><button type="button" class="btn small ico-btn" data-sdel="${n}" title="删除这一行" aria-label="删除这一行">×</button></div>`).join("");
  const m = openModal({
    title: opts.title || `照片和介绍：${item.name}`, wide: true,
    body: `<h4 class="ph-h">照片 <span class="muted" id="phN">${photos.length} / ${MAX_PHOTOS}</span></h4>
      <p class="muted ph-tip">${opts.photoTip || "第一张是封面（菜单、小票、打印菜单都用它）；顾客在网上点餐页点开产品，可以左右滑看全部照片。也可以用「📱 手机传照片」直接拍。"}</p>
      <div id="phBox">${photosHtml()}</div>
      <div ${opts.photosOnly ? "hidden" : ""}>
      <h4 class="ph-h">介绍</h4>
      <textarea id="phDesc" rows="5" maxlength="1000" placeholder="顾客点开产品时看到的详细介绍（建议用法语写），例如做法、口味、分量">${esc(item.description || "")}</textarea>
      <div class="muted ph-cnt"><span id="phDescN">${(item.description || "").length}</span> / 1000</div>
      <h4 class="ph-h">参数 <span class="muted">（显示在介绍下面）</span></h4>
      <div id="specBox">${specsHtml()}</div>
      <button type="button" class="btn small" id="specAdd">＋ 加一行</button>
      <h4 class="ph-h">详情图 <span class="muted" id="dtN">${details.length} / ${MAX_DETAILS}</span></h4>
      <p class="muted ph-tip">显示在详情页介绍和参数下面，从上到下排（细节、尺寸、用法、包装等），和上面的主图分开。上传时统一缩成 1080 像素宽，长图也可以。</p>
      <div id="dtBox">${detailsHtml()}</div>
      <h4 class="ph-h">单独邮费 <span class="muted">（可不填）</span></h4>
      <label class="ph-ship"><input type="number" id="phShip" min="0" step="0.5" placeholder="0" value="${item.ship_fee_cents ? amt(item.ship_fee_cents) : ""}" aria-label="单独邮费"><span class="muted">顾客选「快递邮寄」时，这件产品每件另加的邮费（大件、重的东西用）；满额免邮不免这部分</span></label></div>`,
    buttons: opts.photosOnly ? [{ label: "关闭" }] : [{ label: "取消" }, {
      label: "保存", kind: "primary",
      onClick: async () => {
        const sf = $("#phShip", m.el).value.trim();
        await api(`/api/menu/items/${item.id}`, { method: "PATCH", body: { description: $("#phDesc", m.el).value, specs, ship_fee_cents: sf ? toCents(sf) : null } });
        toast("已保存", "success");
        await reload();
      },
    }],
  });
  const redraw = () => { $("#phBox", m.el).innerHTML = photosHtml(); $("#phN", m.el).textContent = `${photos.length} / ${MAX_PHOTOS}`; $("#dtBox", m.el).innerHTML = detailsHtml(); $("#dtN", m.el).textContent = `${details.length} / ${MAX_DETAILS}`; };
  const refresh = async (r) => { if (r?.photos) photos = r.photos; if (r?.details) details = r.details; redraw(); await reload(); };
  const act = async (fn) => {
    if (busy) return;
    busy = true; redraw();
    try { await refresh(await fn()); } catch (err) { toast(err.message, "error"); busy = false; redraw(); } finally { busy = false; redraw(); }
  };
  const reorder = (order) => act(() => api(`/api/menu/items/${item.id}/photos`, { method: "PUT", body: { order: order.map((p) => p.src) } }));
  m.el.addEventListener("click", (e) => {
    const dm = e.target.closest("[data-dmove]");
    if (dm) { const n = Number(dm.dataset.dmove), d = Number(dm.dataset.d), o = details.slice(); [o[n], o[n + d]] = [o[n + d], o[n]]; return act(() => api(`/api/menu/items/${item.id}/details`, { method: "PUT", body: { order: o.map((p) => p.src) } })); }
    const dd = e.target.closest("[data-ddel]");
    if (dd) {
      const p = details[Number(dd.dataset.ddel)];
      return confirmModal("删除这张详情图", "确定删除这张照片吗？", "删除", "danger").then((ok) => ok && act(() => api(`/api/menu/items/${item.id}/details`, { method: "DELETE", body: { src: p.src } })));
    }
    const mv = e.target.closest("[data-pmove]");
    if (mv) { const n = Number(mv.dataset.pmove), d = Number(mv.dataset.d), o = photos.slice(); [o[n], o[n + d]] = [o[n + d], o[n]]; return reorder(o); }
    const cv = e.target.closest("[data-pcover]");
    if (cv) { const n = Number(cv.dataset.pcover), o = photos.slice(); o.unshift(...o.splice(n, 1)); return reorder(o); }
    const dl = e.target.closest("[data-pdel]");
    if (dl) {
      const p = photos[Number(dl.dataset.pdel)];
      return confirmModal("删除这张照片", Number(dl.dataset.pdel) === 0 && photos.length > 1 ? "删除封面后，下一张变成封面。确定删除吗？" : "确定删除这张照片吗？", "删除", "danger")
        .then((ok) => ok && act(() => api(`/api/menu/items/${item.id}/photos`, { method: "DELETE", body: { src: p.src } })));
    }
    if (e.target.closest("#specAdd")) {
      if (specs.length >= 20) return toast("参数最多 20 行", "error");
      specs.push({ k: "", v: "" }); $("#specBox", m.el).innerHTML = specsHtml();
      m.el.querySelector(`[data-sk="${specs.length - 1}"]`)?.focus();
    }
    const sd = e.target.closest("[data-sdel]");
    if (sd) { specs.splice(Number(sd.dataset.sdel), 1); if (!specs.length) specs.push({ k: "", v: "" }); $("#specBox", m.el).innerHTML = specsHtml(); }
  });
  m.el.addEventListener("input", (e) => {
    if (e.target.id === "phDesc") $("#phDescN", m.el).textContent = e.target.value.length;
    if (e.target.dataset.sk != null) specs[Number(e.target.dataset.sk)].k = e.target.value;
    if (e.target.dataset.sv != null) specs[Number(e.target.dataset.sv)].v = e.target.value;
  });
  m.el.addEventListener("change", (e) => {
    if (e.target.id === "dtAdd") {
      const files = [...e.target.files].slice(0, MAX_DETAILS - details.length);
      if (e.target.files.length > files.length) toast(`详情图最多 ${MAX_DETAILS} 张，多出来的没有传`, "error");
      return act(async () => { let r; for (const f of files) r = await uploadDetail(item.id, f); return r; });
    }
    if (e.target.id !== "phAdd") return;
    const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.length);
    if (e.target.files.length > files.length) toast(`一道菜最多 ${MAX_PHOTOS} 张照片，多出来的没有传`, "error");
    act(async () => { let r; for (const f of files) r = await uploadPhoto(item.id, f); return r; });
  });
}

// ---------- 规格 / 加料编辑 ----------
const OPTION_TEMPLATES = {
  size: () => ({ name: "规格", type: "single", required: true, choices: [["小", 0], ["中", 3], ["大", 6]] }),
  addon: () => ({ name: "加料", type: "multi", required: false, choices: [["加蛋", 2], ["加肉", 5]] }),
  spicy: () => ({ name: "辣度", type: "single", required: true, choices: [["不辣", 0], ["微辣", 0], ["中辣", 0], ["特辣", 0]] }),
  blank: () => ({ name: "", type: "single", required: false, choices: [["", 0]] }),
};

// 记住的规格 / 加料（保存菜的规格时服务器自动记下）：下拉框里显示「规格：小 / 中 +3 / 大 +6」
const presetLabel = (g) => `${g.name}（${g.type === "multi" ? "多选" : g.required ? "单选·必选" : "单选"}）：${g.choices.map((c) => c.name + (c.price_cents ? ` ${c.price_cents > 0 ? "+" : ""}${amt(c.price_cents)}` : "")).join(" / ")}`;

function openOptionsEditor(item) {
  let presets = [], templates = [];
  // 编辑时价格用「元」的字符串，保存时再转成分
  let groups = item.options.map((g) => ({ ...g, choices: g.choices.map((c) => ({ name: c.name, price: c.price_cents ? amt(c.price_cents) : "", item_id: c.item_id || null })) }));
  const fromTemplate = (t) => { const g = OPTION_TEMPLATES[t](); return { ...g, choices: g.choices.map(([name, p]) => ({ name, price: p ? String(p) : "" })) }; };

  const m = openModal({
    title: `规格 / 加料：${item.name}（基础价 ${money(item.price_cents)}）`,
    wide: true,
    body: `<div class="og-add"><span class="muted">添加：</span>
        <button class="btn small" data-tpl="size">大中小规格</button><button class="btn small" data-tpl="addon">加料</button>
        <button class="btn small" data-tpl="spicy">辣度</button><button class="btn small" data-tpl="blank">空白选项组</button>
        <button class="btn small primary" data-combo>🍱 套餐步骤（从菜单选菜）</button></div>
      <div class="og-add og-presets"><span class="muted">模板 / 最近用过：</span><select id="ogPreset"><option value="">正在读取…</option></select>
        <button class="btn small" data-tpl-save title="把这道菜现在的整套规格起个名字存起来，以后给别的菜一次套上">💾 存为模板</button>
        <button class="btn small" data-presets-manage>管理</button></div>
      <div class="og-list"></div>
      <p class="muted" style="font-size:12px">单选：只能选一个（如大/中/小），勾选「必选」后顾客必须选；多选：可以选多个或都不选（如加料）。加价填 0 或留空表示不加价，可以填负数（如小份减 5 元）。</p>
      <p class="muted" style="font-size:12px">🍱 套餐：把这道菜的价格设成套餐价，再加几个「套餐步骤」（如「主菜任选一」「饮料任选一」），每一步从菜单里选几道菜。点套餐时按步骤选；后厨单按选中的菜分别打到它们的出票打印机（主菜去厨房、饮料去吧台）。</p>`,
    buttons: [
      { label: "取消" },
      {
        label: "保存", kind: "primary",
        onClick: async () => {
          const options = groups.map((g) => ({
            name: g.name.trim(), type: g.type, required: g.type === "single" && g.required,
            choices: g.choices.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), price_cents: c.price === "" ? 0 : toCents(c.price), ...(c.item_id ? { item_id: c.item_id } : {}) })),
          }));
          if (options.some((g) => g.choices.some((c) => Number.isNaN(c.price_cents)))) { toast("加价请填写数字", "error"); return false; }
          await api(`/api/menu/items/${item.id}`, { method: "PATCH", body: { options } });
          await loadMenu();
          renderMenuAdmin();
          toast("规格 / 加料已保存", "success");
        },
      },
    ],
  });
  const list = $(".og-list", m.el);

  function render() {
    list.innerHTML = groups.map((g, gi) => `
      <div class="og">
        <div class="og-head">
          <input type="text" placeholder="选项组名称，如：规格" value="${esc(g.name)}" data-gi="${gi}" data-gf="name" maxlength="16">
          <select data-gi="${gi}" data-gf="type"><option value="single" ${g.type === "single" ? "selected" : ""}>单选</option><option value="multi" ${g.type === "multi" ? "selected" : ""}>多选</option></select>
          ${g.type === "single" ? `<label><input type="checkbox" data-gi="${gi}" data-gf="required" ${g.required ? "checked" : ""}> 必选</label>` : ""}
          <span class="og-acts"><button class="icon-btn" data-mvg="${gi}:-1" title="整组上移" aria-label="整组上移"${gi === 0 ? " disabled" : ""}>▲</button>
          <button class="icon-btn" data-mvg="${gi}:1" title="整组下移" aria-label="整组下移"${gi === groups.length - 1 ? " disabled" : ""}>▼</button>
          <button class="btn small danger" data-delg="${gi}">删除该组</button></span>
        </div>
        ${g.choices.map((c, ci) => `
          <div class="og-row">
            <input type="text" placeholder="选项名，如：大" value="${esc(c.name)}" data-gi="${gi}" data-ci="${ci}" data-cf="name" maxlength="${c.item_id ? 40 : 20}">
            <span class="muted">加价</span><input type="number" step="0.5" placeholder="0" value="${esc(c.price)}" data-gi="${gi}" data-ci="${ci}" data-cf="price" style="width:6em"><span class="muted" translate="no">${esc(CURRENCY)}</span>
            ${c.item_id ? `<span class="linked" title="套餐里的菜：后厨单按这道菜的出票打印机出">🔗 ${esc(S.menu.items.find((x) => x.id === c.item_id)?.name || "已删除的菜")}</span>` : ""}
            <button class="icon-btn" data-mvc="${gi}:${ci}:-1" title="上移" aria-label="上移"${ci === 0 ? " disabled" : ""}>▲</button>
            <button class="icon-btn" data-mvc="${gi}:${ci}:1" title="下移" aria-label="下移"${ci === g.choices.length - 1 ? " disabled" : ""}>▼</button>
            <button class="icon-btn" data-delc="${gi}:${ci}" aria-label="删除选项">×</button>
          </div>`).join("")}
        <button class="btn small" data-addc="${gi}">+ 添加选项</button> <button class="btn small" data-pick="${gi}">🍱 从菜单选菜</button>
      </div>`).join("") || `<div class="card muted" style="text-align:center">这道菜没有规格 / 加料，点上面的按钮添加</div>`;
  }

  m.el.addEventListener("input", (e) => {
    const el = e.target, g = groups[el.dataset.gi];
    if (!g) return;
    if (el.dataset.cf) g.choices[el.dataset.ci][el.dataset.cf] = el.value;
    else if (el.dataset.gf === "name") g.name = el.value;
  });
  m.el.addEventListener("change", (e) => {
    const el = e.target, g = groups[el.dataset.gi];
    if (!g) return;
    if (el.dataset.gf === "type") { g.type = el.value; render(); }
    if (el.dataset.gf === "required") g.required = el.checked;
  });
  m.el.addEventListener("click", (e) => {
    const tpl = e.target.closest("[data-tpl]");
    if (tpl) groups.push(fromTemplate(tpl.dataset.tpl));
    const delg = e.target.closest("[data-delg]");
    if (delg) groups.splice(Number(delg.dataset.delg), 1);
    const addc = e.target.closest("[data-addc]");
    if (addc) groups[addc.dataset.addc].choices.push({ name: "", price: "" });
    const delc = e.target.closest("[data-delc]");
    if (delc) { const [gi, ci] = delc.dataset.delc.split(":").map(Number); groups[gi].choices.splice(ci, 1); }
    const mvc = e.target.closest("[data-mvc]");
    if (mvc) { const [gi, ci, dir] = mvc.dataset.mvc.split(":").map(Number); const arr = groups[gi].choices, nj = ci + dir; if (nj >= 0 && nj < arr.length) [arr[ci], arr[nj]] = [arr[nj], arr[ci]]; }
    const mvg = e.target.closest("[data-mvg]");
    if (mvg) { const [gi, dir] = mvg.dataset.mvg.split(":").map(Number); const nj = gi + dir; if (nj >= 0 && nj < groups.length) [groups[gi], groups[nj]] = [groups[nj], groups[gi]]; }
    if (e.target.closest("[data-combo]")) {
      groups.push({ name: `第 ${groups.length + 1} 步`, type: "single", required: true, choices: [] });
      render();
      return pickDishes(groups.length - 1);
    }
    const pk = e.target.closest("[data-pick]");
    if (pk) return pickDishes(Number(pk.dataset.pick));
    if (tpl || delg || addc || delc || mvc || mvg) render();
  });
  render();

  // 下拉框：上面「我的模板」（整套，选了一次加上全部组），下面「最近用过的」（单组，保存菜的规格时自动记）
  // 同名的组已经有了就换成选的这条
  const presetSel = $("#ogPreset", m.el);
  const tplLabel = (t) => `${t.name}：${t.groups.map((g) => g.name).join(" + ")}`;
  const fillPresets = () => {
    presetSel.innerHTML = `<option value="">${presets.length || templates.length ? "选一个，直接加到这道菜" : "还没有（存为模板、保存过的规格都会在这里）"}</option>` +
      (templates.length ? `<optgroup label="我的模板（整套）">${templates.map((t, i) => `<option value="t${i}">📋 ${esc(tplLabel(t))}</option>`).join("")}</optgroup>` : "") +
      (presets.length ? `<optgroup label="最近用过的（单组）">${presets.map((g, i) => `<option value="g${i}">${esc(presetLabel(g))}</option>`).join("")}</optgroup>` : "");
  };
  Promise.all([api("/api/menu/option-presets").catch(() => []), api("/api/menu/option-templates").catch(() => [])])
    .then(([l, t]) => { presets = l; templates = t; fillPresets(); });
  const put = (g) => {
    const copy = { name: g.name, type: g.type, required: g.required, choices: g.choices.map((c) => ({ name: c.name, price: c.price_cents ? amt(c.price_cents) : "" })) };
    const at = groups.findIndex((x) => x.name.trim() === g.name);
    if (at >= 0) groups[at] = copy; else groups.push(copy);
  };
  presetSel.addEventListener("change", () => {
    const v = presetSel.value;
    presetSel.value = "";
    if (v[0] === "t") {
      const t = templates[Number(v.slice(1))];
      if (!t) return;
      t.groups.forEach(put);
      render();
      toast(`已套用模板「${t.name}」，记得点「保存」`, "success");
      api("/api/menu/option-templates/use", { method: "POST", body: { name: t.name } }).then((l) => { templates = l; fillPresets(); }).catch(() => {});
      return;
    }
    const g = presets[Number(v.slice(1))];
    if (!g) return;
    put(g);
    render();
  });
  // 💾 存为模板：用这道菜现在编辑框里的规格（还没点「保存」也行）；同名的模板会被换掉
  $("[data-tpl-save]", m.el).addEventListener("click", () => {
    const cur = groups.filter((g) => g.name.trim() && !g.choices.some((c) => c.item_id)).map((g) => ({
      name: g.name.trim(), type: g.type, required: g.type === "single" && g.required,
      choices: g.choices.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), price_cents: c.price === "" ? 0 : toCents(c.price) })),
    })).filter((g) => g.choices.length);
    if (!cur.length) return toast("先加好规格再存（套餐步骤不能存成模板）", "error");
    if (cur.some((g) => g.choices.some((c) => Number.isNaN(c.price_cents)))) return toast("加价请填写数字", "error");
    const sm = openModal({
      title: "💾 存为规格模板",
      body: `<label style="display:grid;gap:6px">模板名字<input type="text" id="tplName" maxlength="30" value="${esc(item.name)}"></label>
        <p class="muted" style="font-size:13px">会存下：${esc(cur.map((g) => g.name).join(" + "))}。以后在别的菜的「规格」里，从下拉框「我的模板」选它，一次全部加上。同名的模板会被换掉。</p>`,
      buttons: [{ label: "取消" }, { label: "存", kind: "primary", onClick: async () => {
        const name = $("#tplName", sm.el).value.trim();
        if (!name) { toast("请填模板名字", "error"); return false; }
        try { templates = await api("/api/menu/option-templates", { method: "POST", body: { name, groups: cur } }); fillPresets(); toast(`已存为模板「${name}」`, "success"); }
        catch (err) { toast(err.message, "error"); return false; }
      } }],
    });
    setTimeout(() => $("#tplName", sm.el)?.select(), 50);
  });
  $("[data-presets-manage]", m.el).addEventListener("click", () => {
    const mm = openModal({ title: "规格模板 / 最近用过的", body: `<b>我的模板（整套）</b><div class="tpl-list"></div><b style="display:block;margin-top:12px">最近用过的（单组）</b><div class="preset-list"></div><p class="muted" style="font-size:12px">「最近用过的」是保存菜的规格时自动记的，最多 40 条，最近用过的在前。删掉的只是这个列表里的记录，已经设好的菜不受影响。</p>`, buttons: [{ label: "关闭" }] });
    const draw = () => {
      $(".tpl-list", mm.el).innerHTML = templates.map((t, i) => `<div class="og-row"><span style="flex:1">📋 ${esc(tplLabel(t))}</span><button class="icon-btn" data-tdel="${i}" aria-label="删除">×</button></div>`).join("") || `<div class="muted" style="padding:6px 0">还没有。在规格编辑里点「💾 存为模板」。</div>`;
      $(".preset-list", mm.el).innerHTML = presets.map((g, i) => `<div class="og-row"><span style="flex:1">${esc(presetLabel(g))}</span><button class="icon-btn" data-psdel="${i}" aria-label="删除">×</button></div>`).join("") || `<div class="muted" style="padding:6px 0">还没有</div>`;
    };
    draw();
    mm.el.addEventListener("click", async (e) => {
      const d = e.target.closest("[data-psdel]"), td = e.target.closest("[data-tdel]");
      try {
        if (d) presets = await api("/api/menu/option-presets", { method: "DELETE", body: { key: presets[Number(d.dataset.psdel)].key } });
        else if (td) templates = await api("/api/menu/option-templates", { method: "DELETE", body: { name: templates[Number(td.dataset.tdel)].name } });
        else return;
        draw(); fillPresets();
      } catch (err) { toast(err.message, "error"); }
    });
  });

  // 从菜单里勾选几道菜，加成这一步的选项（套餐）
  function pickDishes(gi) {
    const g = groups[gi];
    const have = new Set(g.choices.map((c) => c.item_id).filter(Boolean));
    const list = S.menu.items.filter((x) => x.id !== item.id && !hasOptions(x));
    const pm = openModal({
      title: `「${g.name}」从菜单选菜`,
      wide: true,
      body: `<input type="search" id="pdQ" placeholder="搜菜名" style="width:100%;margin-bottom:8px">
        <div id="pdList" style="max-height:50vh;overflow:auto">${S.menu.categories.map((c) => {
          const its = list.filter((x) => x.category_id === c.id);
          return its.length ? `<div class="pd-cat"><b>${esc(c.name)}</b><div class="chips checks">${its.map((x) => `<label data-n="${esc(x.name)}"><input type="checkbox" value="${x.id}" ${have.has(x.id) ? "checked" : ""}> ${esc(x.name)} <span class="muted">${money(x.price_cents)}</span></label>`).join("")}</div></div>` : "";
        }).join("")}</div>
        <p class="muted" style="font-size:12px">选中的菜加到这一步里，加价默认 0（套餐价已经包含）；想让某个菜贵一点（如换成大虾 +3），回到上一个窗口填加价。有规格的菜不能放进套餐。</p>`,
      buttons: [{ label: "取消" }, { label: "确定", kind: "primary", onClick: () => {
        const ids = [...pm.el.querySelectorAll("#pdList input:checked")].map((x) => Number(x.value));
        g.choices = g.choices.filter((c) => !c.item_id || ids.includes(c.item_id));
        for (const id of ids) if (!g.choices.some((c) => c.item_id === id)) g.choices.push({ name: S.menu.items.find((x) => x.id === id).name, price: "", item_id: id });
        render();
      } }],
    });
    $("#pdQ", pm.el).oninput = (e) => { const q = e.target.value.trim(); pm.el.querySelectorAll("[data-n]").forEach((l) => (l.hidden = q && !l.dataset.n.includes(q))); };
  }
}
$("#addCat").onclick = () => saveMenu(async () => {
  await api("/api/menu/categories", { method: "POST", body: { name: $("#newCatName").value, sort_order: S.menu.categories.length + 1 } });
  $("#newCatName").value = "";
});
// 新增菜品弹窗：菜名、分类、价格、图片；「保存并继续添加」适合一次录很多道菜
$("#addItem").onclick = () => openAddItem();
$("#menuPrint").onclick = () => MenuPrint.open();
// 「📱 手机传照片」（店主 10-11）：手机扫码给菜拍照 / 选图，传上来直接换照片；菜单页会自动刷新（服务器发「menu」事件）
$("#photoDrop").onclick = async () => {
  try {
    const lang = ({ "zh-CN": "zh", fr: "fr", en: "en", es: "es", pt: "pt" })[document.documentElement.lang] || "zh";
    const r = await api("/api/photo-drop", { method: "POST", body: { lang } });
    openModal({
      title: "📱 手机传照片",
      body: `<div style="text-align:center">
        <div style="width:240px;margin:0 auto">${r.qr_svg}</div>
        <p>用手机扫这个码（手机要连店里的 WiFi）。</p>
        <p class="muted" style="font-size:13px">手机上会列出所有菜：点一道菜的「📷 拍照 / 选图」，拍一张或从相册选一张，就换成这道菜的照片，这里马上能看到。链接 ${r.expires_minutes} 分钟内有效。</p>
        <p class="muted" style="font-size:12px" translate="no">${esc(r.url)}</p></div>`,
      buttons: [{ label: "完成", kind: "primary" }],
    });
  } catch (e) { toast(e.message, "error"); }
};
function openAddItem() {
  const cats = S.menu.categories;
  if (!cats.length) return toast("请先新增分类", "error");
  const lastCat = Number(store.get("add_item_cat"));
  const catId = cats.some((c) => c.id === lastCat) ? lastCat : cats[0].id;
  let file = null;
  let added = 0;
  const m = openModal({
    title: "新增菜品",
    body: `
      <label class="field"><span>菜名 *</span><input type="text" id="aiName" maxlength="40" placeholder="如：宫保鸡丁"></label>
      <div class="form-grid">
        <label class="field"><span>分类</span><select id="aiCat">${cats.map((c) => `<option value="${c.id}" ${c.id === catId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label class="field"><span>价格 *</span><input type="number" id="aiPrice" min="0" step="0.01" placeholder="0.00" inputmode="decimal"></label>
      </div>
      <div class="field"><span>图片（可选）</span>
        <div class="ai-img"><div class="ai-preview" id="aiPreview">无</div>
          <button type="button" class="btn small" id="aiPick">选择图片</button><button type="button" class="btn small hidden" id="aiClear">去掉</button></div></div>
      <p class="muted" style="font-size:12px;margin:4px 0 0">规格、加料保存后在列表里点「设置」添加。</p>
      <div class="muted" id="aiAdded" style="font-size:13px"></div>`,
    buttons: [
      { label: "关闭" },
      { label: "保存并继续添加", onClick: () => save(true) },
      { label: "保存", kind: "primary", onClick: () => save(false) },
    ],
    onClose: () => { if (added) { loadMenu().then(renderMenuAdmin); } },
  });
  const el = m.el;
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/jpeg,image/png,image/webp,image/gif";
  picker.onchange = () => {
    file = picker.files[0] || null;
    const pv = $("#aiPreview", el);
    if (file) { pv.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; $("#aiClear", el).classList.remove("hidden"); }
  };
  $("#aiPick", el).onclick = () => { picker.value = ""; picker.click(); };
  $("#aiClear", el).onclick = () => { file = null; $("#aiPreview", el).textContent = "无"; $("#aiClear", el).classList.add("hidden"); };
  if (!noAutoFocus()) $("#aiName", el).focus(); // 触屏没键盘：不自动聚焦，免得系统键盘挡住按钮（B27）

  async function save(again) {
    const name = $("#aiName", el).value.trim();
    const price = toCents($("#aiPrice", el).value);
    if (!name) { toast("请填写菜名", "error"); return false; }
    if (!(price >= 0)) { toast("请填写价格", "error"); return false; }
    const category_id = Number($("#aiCat", el).value);
    try {
      const { id } = await api("/api/menu/items", { method: "POST", body: { name, category_id, price_cents: price } });
      if (file) {
        const blob = await compressImage(file);
        const res = await fetch(`/api/menu/items/${id}/image`, { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + store.get("pos_token") }, body: blob });
        if (!res.ok) toast(`菜品已添加，但图片上传失败：${(await res.json().catch(() => null))?.error || res.status}`, "error");
        else { const { image } = await res.json().catch(() => ({})); if (image) await uploadThumb(id, image, blob).catch(() => {}); }
      }
      store.set("add_item_cat", String(category_id));
      added++;
      toast(`已添加：${name}`, "success");
    } catch (err) { toast(err.message, "error"); return false; }
    if (!again) { await loadMenu(); renderMenuAdmin(); return; }
    // 继续添加：清空菜名、价格、图片，分类保留
    $("#aiName", el).value = $("#aiPrice", el).value = "";
    $("#aiClear", el).click();
    $("#aiAdded", el).textContent = `本次已添加 ${added} 道`;
    if (!noAutoFocus()) $("#aiName", el).focus();
    return false;
  }
}
