// 小票模板编辑器（设置页「小票模板」分栏）——从 cashier.html 切出，纯搬运、逻辑未改。
// 作为全局 <script> 加载（在 cashier.html 内联脚本之后、stickers.js 之前），沿用同一全局作用域：
//   依赖内联脚本已定义的 S / $ / api / toast / store / esc / t / lang 等全局。
// 对外暴露（内联脚本按名调用，均在用户操作后触发，非启动期）：
//   loadTemplatesPane（设置页 tab 分发）、renderTemplatesPane / markDirty / refreshPreview（小票模板 change 事件回调）、
//   renderGwayTicketSection（renderDevSections 内）。

// ================= 小票模板 =================
S.tpl = { meta: null, kind: "receipt", blocks: [], width: 32, dirty: false, sample: "" };
const ALIGN_LABEL = { left: "左", center: "中", right: "右" };
const SIZE_LABEL = { normal: "标准", tall: "加高", big: "大", huge: "特大" };
const blockSize = (b) => b.size || (b.big ? "big" : "normal");
const clone = (x) => JSON.parse(JSON.stringify(x));

async function loadTemplatesPane() {
  S.tpl.meta = await api("/api/print-templates");
  if (!S.printers.list.length) await loadPrinters();
  S.tpl.blocks = clone(S.tpl.meta.templates[S.tpl.kind]);
  S.tpl.dirty = false;
  renderTemplatesPane();
}

function blockOptions(b, i) {
  const k = S.tpl.kind;
  const bill = k === "receipt" || k === "prebill";
  const cb = (key, label) => `<label><input type="checkbox" data-bk="${i}" data-key="${key}" ${b[key] ? "checked" : ""}> ${label}</label>`;
  switch (b.type) {
    case "text": return `<textarea data-bk="${i}" data-key="text" rows="2" maxlength="200" placeholder="如：WiFi：XXX  密码：XXX">${esc(b.text || "")}</textarea>`;
    case "title": return `<input type="text" data-bk="${i}" data-key="text" maxlength="30" value="${esc(b.text || "")}" placeholder="自定义标题，留空用默认">`;
    case "divider": return `<select data-bk="${i}" data-key="char">${["-", "=", "*", "."].map((c) => `<option ${b.char === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    case "blank": return `<label>行数 <input type="number" min="1" max="5" data-bk="${i}" data-key="n" value="${b.n || 1}" style="width:60px"></label>`;
    case "qr": return `<input type="text" data-bk="${i}" data-key="data" maxlength="300" value="${esc(b.data || "")}" placeholder="二维码内容：网址、公众号链接、WiFi 信息等">
      <input type="text" data-bk="${i}" data-key="caption" maxlength="30" value="${esc(b.caption || "")}" placeholder="二维码上方的说明文字">
      <label>大小 <select data-bk="${i}" data-key="size">${[3, 4, 5, 6, 7, 8].map((n) => `<option ${Number(b.size) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    case "order_meta": return cb("show_id", "单号") + cb("show_time", "时间") + cb("show_staff", bill ? "收银员" : "点单人");
    case "items": return (bill ? cb("show_price", "单价金额") : "") + cb("show_options", "规格加料") + cb("show_notes", "口味备注");
    case "payments": return cb("show_change", "实收找零");
    case "store_info": return cb("show_phone", "电话") + cb("show_address", "地址");
    case "logo": return S.tpl.meta.logo ? "" : `<span class="muted" style="font-size:12px">还没上传 LOGO（见上方）</span>`;
    default: return "";
  }
}

function renderTemplatesPane() {
  const { meta, kind, blocks } = S.tpl;
  const def = meta.kinds[kind];
  const types = meta.block_types;
  const present = new Set(blocks.map((b) => b.type));
  const addable = def.blocks.filter((t) => types[t].repeatable || !present.has(t));
  const logo = meta.logo;
  const gs = S.settings || {};
  $("#templatesPane").innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="toolbar" style="margin:0"><b style="margin-right:auto">LOGO</b>
        ${logo ? `<img src="${esc(logo.src)}" alt="LOGO" class="logo-thumb"><span class="muted" style="font-size:12px">${logo.width}×${logo.height} 点</span>` : `<span class="muted" style="font-size:13px">还没有 LOGO</span>`}
        <label class="muted" style="font-size:13px">宽度 <select id="logoW">${[128, 192, 256, 320, 384].map((w) => `<option value="${w}" ${w === 256 ? "selected" : ""}>${w} 点</option>`).join("")}</select></label>
        <button class="btn small primary" id="logoUp">${logo ? "更换" : "上传"} LOGO</button>
        ${logo ? `<button class="btn small danger" id="logoDel">删除</button>` : ""}
        <input type="file" id="logoFile" accept="image/*" hidden>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">小票机只能打黑白，图片会自动转成黑白点阵。建议用白底、对比明显的 LOGO；58mm 纸最宽 384 点，256 点大约占纸宽的三分之二。</p>
    </div>
    <div class="toolbar"><div class="seg" id="tplKind">${Object.entries(meta.kinds).map(([k, v]) => `<button data-tk="${k}" class="${k === kind ? "on" : ""}">${v.label}</button>`).join("")}</div></div>
    <div class="tpl-layout">
      <div class="tpl-blocks">
        ${blocks.map((b, i) => `
          <div class="tblock ${b.on ? "" : "off"}">
            <div class="tb-head">
              <label class="tb-name"><input type="checkbox" data-bk="${i}" data-key="on" ${b.on ? "checked" : ""} ${types[b.type].required ? "disabled" : ""}> ${types[b.type].label}</label>
              ${b.type === "divider" || b.type === "blank" || b.type === "logo" ? "" : `<div class="seg mini">${Object.entries(ALIGN_LABEL).map(([a, l]) => `<button data-bal="${i}" data-a="${a}" class="${b.align === a ? "on" : ""}">${l}</button>`).join("")}</div>
                <select class="tb-size" data-bsize="${i}" title="字号：加高 = 每行字数不变、字变高；大 = 倍宽倍高；特大 = 三倍">${Object.entries(SIZE_LABEL).map(([k, l]) => `<option value="${k}" ${blockSize(b) === k ? "selected" : ""}>${l}</option>`).join("")}</select><button class="tb-toggle ${b.bold ? "on" : ""}" data-bflag="${i}" data-key="bold">加粗</button><button class="tb-toggle ${b.invert ? "on" : ""}" data-bflag="${i}" data-key="invert" title="黑底白字，特别显示（菜品区块是口味备注反白）">反白</button>`}
              <span class="tb-move"><button data-bmv="${i}" data-d="-1" aria-label="上移" ${i === 0 ? "disabled" : ""}>↑</button><button data-bmv="${i}" data-d="1" aria-label="下移" ${i === blocks.length - 1 ? "disabled" : ""}>↓</button>${types[b.type].repeatable ? `<button data-bdel="${i}" aria-label="删除">✕</button>` : ""}</span>
            </div>
            ${blockOptions(b, i) ? `<div class="tb-opts">${blockOptions(b, i)}</div>` : ""}
          </div>`).join("")}
        <div class="toolbar" style="margin-top:8px">
          <select id="tplAdd"><option value="">+ 添加区块…</option>${addable.map((t) => `<option value="${t}">${types[t].label}</option>`).join("")}</select>
          <button class="btn small" id="tplReset" style="margin-left:auto">恢复默认</button>
        </div>
      </div>
      <div class="tpl-preview">
        <div class="toolbar" style="flex-wrap:wrap;gap:6px"><b style="margin-right:auto">预览</b>
          ${S.dev?.unlocked ? `<div class="seg mini" id="tplSample"><button data-smp="" class="${S.tpl.sample ? "" : "on"}">普通订单</button><button data-smp="gway" class="${S.tpl.sample === "gway" ? "on" : ""}">🛒 商城订单</button></div>` : ""}
          <select id="tplLang" title="${tplGroup() === "customer" ? "顾客票据（结账单、预结单、退款单）打印用这个语言" : "店内票据（后厨单、退菜单、催菜单、转台通知、交班单）打印用这个语言"}">
            ${Object.entries(I18N.LANGS).map(([k, v]) => `<option value="${k}" ${tplLangNow().lang === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
          <label style="font-size:12px"><input type="checkbox" id="tplDual" ${tplLangNow().dual ? "checked" : ""} ${tplLangNow().lang === "zh" ? "disabled" : ""}> 中文对照</label>
          <div class="seg mini" id="tplWidth"><button data-pw="32" class="${S.tpl.width === 32 ? "on" : ""}">58mm</button><button data-pw="48" class="${S.tpl.width === 48 ? "on" : ""}">80mm</button></div></div>
        <p id="tplLangNote" class="muted" style="font-size:12px;margin:0 0 6px"></p>
        <div id="tplPreview"><span class="muted">加载中…</span></div>
        <div class="toolbar" style="margin-top:12px">
          <select id="tplPrinter">${S.printers.list.map((p) => `<option value="${p.id}" ${S.tpl.printer === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <button class="btn" id="tplTest">打印测试</button>
          <button class="btn primary" id="tplSave" style="margin-left:auto">保存模板${S.tpl.dirty ? " *" : ""}</button>
        </div>
      </div>
    </div>`;
  refreshPreview();
}

// 「开发者 → Gway 商城订单小票」（易用性整改第 11 条：从小票模板页挪到开发者里）：改了马上保存
function renderGwayTicketSection() {
  const gs = S.settings || {};
  const box = $("#gwayTicketSection");
  if (box) box.innerHTML = `
      <div class="toolbar" style="margin:0;flex-wrap:wrap;gap:10px"><span style="margin-right:auto"></span>
        <label style="font-size:13px">大字印 <select id="gwNo"><option value="mall" ${gs.gway_ticket_no !== "store" ? "selected" : ""}>商城号码（G013，和顾客手机上一样）</option><option value="store" ${gs.gway_ticket_no === "store" ? "selected" : ""}>店内取餐号（#012）</option></select></label>
        <label style="font-size:13px">字号 <select id="gwSize"><option value="huge" ${gs.gway_ticket_size !== "big" ? "selected" : ""}>特大</option><option value="big" ${gs.gway_ticket_size === "big" ? "selected" : ""}>大</option></select></label>
        <label style="font-size:13px"><input type="checkbox" id="gwNote" ${gs.gway_ticket_note !== false ? "checked" : ""}> 下面印「Gwayguyane 商城订单」</label>
      </div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">商城来的单：结账单、后厨单、退菜单上的号码都按这里印；「外带」列表里也显示同样的号码，叫号时和顾客手机上的一致。</p>`;
}
document.addEventListener("change", async (e) => {
  if (!["gwNo", "gwSize", "gwNote"].includes(e.target.id)) return;
  try {
    S.settings = await api("/api/settings", { method: "PUT", body: { gway_ticket_no: $("#gwNo").value, gway_ticket_size: $("#gwSize").value, gway_ticket_note: $("#gwNote").checked } });
    toast("已保存", "success");
    if (S.tpl?.sample === "gway") refreshPreview();
  } catch (err) { toast(err.message, "error"); }
});
// 小票语言：顾客票据、店内票据各一个，和「语言与翻译」里是同一个设置——这里选哪种，实际就打哪种
const tplGroup = () => (["receipt", "prebill", "refund"].includes(S.tpl.kind) ? "customer" : "kitchen");
const tplLangNow = () => {
  const gs = S.settings || {};
  return { lang: gs[`ticket_lang_${tplGroup()}`] || "zh", dual: Boolean(gs[`ticket_dual_${tplGroup()}`]) };
};
async function saveTplLang(lang, dual) {
  const g = tplGroup();
  S.settings = await api("/api/settings", { method: "PUT", body: { [`ticket_lang_${g}`]: lang, [`ticket_dual_${g}`]: lang === "zh" ? false : dual } });
  toast(g === "customer" ? "已保存：顾客票据按这个语言打印" : "已保存：店内票据按这个语言打印", "success");
  renderTemplatesPane();
}
let previewTimer = null;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const printerId = Number($("#tplPrinter")?.value) || undefined;
      const p = await api(`/api/print-templates/${S.tpl.kind}/preview`, { method: "POST", body: { sample: S.tpl.sample || undefined, blocks: S.tpl.blocks, width: S.tpl.width, printer_id: printerId } });
      // 选的语言这台打印机打不出来（只有西文字库打不了中文）：说明改打哪种
      const want = tplLangNow(), note = $("#tplLangNote");
      if (note) {
        const sub = p.print_lang && p.print_lang !== want.lang ? I18N.LANGS[p.print_lang] || p.print_lang : "";
        note.innerHTML = sub ? `<span style="color:var(--danger)">这台打印机只有西文字库，打不了中文：改打 ${esc(sub)}，没翻译的菜名转拼音。要打中文，到「打印」把它的字库改成「图片打中文」</span>`
          : want.dual && !p.print_dual ? `<span style="color:var(--danger)">这台打印机只有西文字库，不能中文对照</span>` : "";
      }
      $("#tplPreview").innerHTML = renderTicket(p);
    } catch (err) {
      $("#tplPreview").innerHTML = `<p style="color:var(--danger)">${esc(err.message)}</p>`;
    }
  }, 200);
}

function markDirty() {
  S.tpl.dirty = true;
  const b = $("#tplSave");
  if (b) b.textContent = "保存模板 *";
  refreshPreview();
}

$("#templatesPane").addEventListener("click", async (e) => {
  const t = e.target, bl = S.tpl.blocks;
  try {
    const tk = t.closest("[data-tk]");
    if (tk && tk.dataset.tk !== S.tpl.kind) {
      if (S.tpl.dirty && !(await confirmModal("放弃修改", "当前模板还没保存，切换后修改会丢失。", "放弃修改", "danger"))) return;
      S.tpl.kind = tk.dataset.tk; S.tpl.blocks = clone(S.tpl.meta.templates[S.tpl.kind]); S.tpl.dirty = false;
      return renderTemplatesPane();
    }
    const al = t.closest("[data-bal]"); if (al) { bl[al.dataset.bal].align = al.dataset.a; markDirty(); return renderTemplatesPane(); }
    const fl = t.closest("[data-bflag]"); if (fl) { const b = bl[fl.dataset.bflag]; b[fl.dataset.key] = !b[fl.dataset.key]; markDirty(); return renderTemplatesPane(); }
    const mv = t.closest("[data-bmv]");
    if (mv) { const i = Number(mv.dataset.bmv), j = i + Number(mv.dataset.d); [bl[i], bl[j]] = [bl[j], bl[i]]; markDirty(); return renderTemplatesPane(); }
    const del = t.closest("[data-bdel]"); if (del) { bl.splice(Number(del.dataset.bdel), 1); markDirty(); return renderTemplatesPane(); }
    const pw = t.closest("[data-pw]"); if (pw) { S.tpl.width = Number(pw.dataset.pw); renderTemplatesPane(); return; }
    if (t.closest("#tplReset")) {
      if (!(await confirmModal("恢复默认", `把「${S.tpl.meta.kinds[S.tpl.kind].label}」恢复成默认模板？`, "恢复默认"))) return;
      S.tpl.blocks = await api(`/api/print-templates/${S.tpl.kind}/reset`, { method: "POST" });
      S.tpl.meta.templates[S.tpl.kind] = clone(S.tpl.blocks); S.tpl.dirty = false;
      toast("已恢复默认模板", "success"); return renderTemplatesPane();
    }
    if (t.closest("#tplSave")) {
      S.tpl.blocks = await api(`/api/print-templates/${S.tpl.kind}`, { method: "PUT", body: { blocks: bl } });
      S.tpl.meta.templates[S.tpl.kind] = clone(S.tpl.blocks); S.tpl.dirty = false;
      toast("模板已保存，之后打印都用新模板", "success"); return renderTemplatesPane();
    }
    const smp = t.closest("[data-smp]");
    if (smp) { S.tpl.sample = smp.dataset.smp; renderTemplatesPane(); return; }
    if (t.closest("#gwPreview")) { S.tpl.sample = "gway"; if (!["receipt", "kitchen"].includes(S.tpl.kind)) { S.tpl.kind = "kitchen"; await loadTemplatesPane(); } else renderTemplatesPane(); return; }
    if (t.closest("#tplTest")) {
      await api(`/api/print-templates/${S.tpl.kind}/test`, { method: "POST", body: { printer_id: Number($("#tplPrinter").value), blocks: bl, sample: S.tpl.sample || undefined } });
      return toast("已用示例订单打印测试（按当前编辑的模板）", "success");
    }
    if (t.closest("#logoUp")) { $("#logoFile").value = ""; return $("#logoFile").click(); }
    if (t.closest("#logoDel")) {
      if (!(await confirmModal("删除 LOGO", "删除后小票上不再打印 LOGO。", "删除", "danger"))) return;
      await api("/api/print-templates/logo", { method: "DELETE" });
      S.tpl.meta.logo = null; toast("已删除 LOGO", "success"); return renderTemplatesPane();
    }
  } catch (err) { toast(err.message, "error"); }
});

$("#templatesPane").addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.bk == null) return;
  const b = S.tpl.blocks[el.dataset.bk];
  const key = el.dataset.key;
  if (el.type === "checkbox") {
    b[key] = el.checked;
    if (key === "on") el.closest(".tblock").classList.toggle("off", !el.checked);
  } else b[key] = el.type === "number" || key === "size" ? Number(el.value) : el.value;
  markDirty();
});
$("#templatesPane").addEventListener("change", (e) => {
  if (e.target.id === "tplAdd" && e.target.value) {
    const type = e.target.value;
    const base = { type, on: true, align: type === "qr" || type === "logo" ? "center" : "left", big: false, bold: false };
    if (type === "qr") Object.assign(base, { data: "", caption: "", size: 5 });
    if (type === "text") base.text = "";
    if (type === "order_meta") Object.assign(base, { show_id: true, show_time: true, show_staff: true });
    if (type === "items") Object.assign(base, { show_price: true, show_options: true, show_notes: true });
    if (type === "store_info") Object.assign(base, { show_phone: true, show_address: true });
    if (type === "payments") base.show_change = true;
    S.tpl.blocks.push(base);
    markDirty();
    renderTemplatesPane();
  }
  if (e.target.id === "logoFile" && e.target.files[0]) uploadLogo(e.target.files[0], Number($("#logoW").value)).catch((err) => toast(err.message, "error"));
});

// LOGO：浏览器里缩放 → 灰度 → Floyd–Steinberg 抖动成黑白点阵 → 打包成每行 width/8 字节上传
async function uploadLogo(file, targetW) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("无法读取这张图片")); im.src = url; });
    const w = targetW;
    const h = Math.min(400, Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * w)));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * px.data[i * 4] + 0.587 * px.data[i * 4 + 1] + 0.114 * px.data[i * 4 + 2];
    const bits = new Uint8Array((w / 8) * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, old = gray[i], nv = old < 128 ? 0 : 255, err = old - nv;
        gray[i] = nv;
        if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) gray[i + w - 1] += (err * 3) / 16;
          gray[i + w] += (err * 5) / 16;
          if (x + 1 < w) gray[i + w + 1] += err / 16;
        }
        if (nv === 0) bits[y * (w / 8) + (x >> 3)] |= 0x80 >> (x & 7);
        const o = i * 4; px.data[o] = px.data[o + 1] = px.data[o + 2] = nv; px.data[o + 3] = 255;
      }
    }
    ctx.putImageData(px, 0, 0);
    let bin = "";
    for (const b of bits) bin += String.fromCharCode(b);
    S.tpl.meta.logo = await api("/api/print-templates/logo", { method: "POST", body: { width: w, height: h, bits: btoa(bin), png: cv.toDataURL("image/png") } });
    // 上传后自动打开结账单的 LOGO 区块（还没保存，让店长确认后保存）
    const lb = S.tpl.blocks.find((b) => b.type === "logo");
    if (lb && !lb.on) { lb.on = true; S.tpl.dirty = true; }
    toast("LOGO 已上传（已转成黑白点阵），记得保存模板", "success");
    renderTemplatesPane();
  } finally {
    URL.revokeObjectURL(url);
  }
}
