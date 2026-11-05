// 收银台 / 点餐页共用的小工具（纯原生 JS，不依赖外网 CDN，断网也能用）

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {}
  },
};

// 安卓平板收银机（Gway 收银平板版 App 里打开的收银台，浏览器标识带 RestaurantPOSHost）：
// 没有浏览器打印 / 下载 / 新窗口 / USB 串口，界面上按平板的说法显示（整改 F3–F12）
const IS_POS_HOST = (() => { try { return /RestaurantPOSHost/.test(navigator.userAgent || ""); } catch { return false; } })();
if (IS_POS_HOST) document.documentElement.classList.add("pos-host");

let onUnauthorized = null;
let onUnlicensed = null;

async function api(path, { method = "GET", body, auth = true, headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = store.get("pos_token");
  if (auth && token) headers.Authorization = "Bearer " + token;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("连接不上收银主机，请检查 WiFi 或主机是否开机");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    // 授权到期（营业中过了到期日）：收银台刷新后会显示激活页
    if (data?.code === "UNLICENSED" && typeof onUnlicensed === "function") onUnlicensed();
    // 店长在用供应商给的临时 PIN：服务器只允许修改 PIN，弹出修改窗口（默认 / 简单 PIN 店主 10-11 起不强制改）
    if (data?.code === "PIN_CHANGE_REQUIRED" && auth && store.get("pos_token")) openPinChange();
    const err = new Error(friendlyError(res.status, data?.error) || `请求失败（${res.status}）`);
    err.status = res.status;
    err.data = data; // 如 { code: "STOCK_SHORT", item_id, left }（限量的菜不够了）
    throw err;
  }
  return data;
}

// 易用性整改第 7 条：PIN 锁定 / 忙的提示统一成两句（服务端各层的原文略有不同，比如全店锁定带「全店」），不改返回码
function friendlyError(status, msg) {
  if (status !== 429 || typeof msg !== "string") return msg;
  const m = /错误次数过多|输错次数太多/.test(msg) && /(\d+)\s*秒后再试/.exec(msg);
  if (m) return `输错次数太多，请 ${m[1]} 秒后再试`;
  if (/错误次数过多|正在验证|系统正忙/.test(msg)) return "请稍等几秒再试";
  return msg;
}

// 货币符号和金额格式来自「设置 → 语言与翻译」（页面启动时从 /api/public/info 读取）
// money_format：prefix_dot = ¥12.50；prefix_comma = €12,50；suffix_dot = 12.50 €；suffix_comma = 12,50 €
let CURRENCY = "€"; // 和服务端默认一致（src/lib/settings.js：€ + suffix_comma，打印组 2026-10-05）
let MONEY_FMT = "suffix_comma";
function setMoneyFormat(info) {
  if (info?.currency) CURRENCY = info.currency;
  if (info?.money_format) MONEY_FMT = info.money_format;
}
// 显示用的数字部分（按设置用小数点或逗号）
const yuan = (cents) => {
  const t = (cents / 100).toFixed(2);
  return MONEY_FMT.endsWith("comma") ? t.replace(".", ",") : t;
};
// 输入框里的值（数字输入框只认小数点）
const amt = (cents) => (cents / 100).toFixed(2);
const money = (cents) => {
  if (cents < 0) return "-" + money(-cents);
  return MONEY_FMT.startsWith("suffix") ? `${yuan(cents)} ${CURRENCY}` : CURRENCY + yuan(cents);
};
// 整数金额去掉 .00 / ,00（如「现金 €50」）
const moneyShort = (cents) => money(cents).replace(/[.,]00(?!\d)/, "");
const toCents = (value) => Math.round(parseFloat(String(value).replace(",", ".")) * 100);

// ---------- 菜品搜索 ----------
// 输入字母：按拼音首字母找（gbjd → 宫保鸡丁；不再匹配全拼，打一个字母不会冒出一大堆不相干的菜）
// 输入中文 / 西文：菜名里包含；输入数字或字母数字：菜号（105、A12）；外语界面时也匹配译名（poulet）
// 菜品和分类的 py 字段由服务端生成（「首字母 全拼」），这里只用首字母
// 合字也拆开：Bœuf → boeuf、Ægir → aegir（法语菜名常见，顾客多半打 oe）
const foldText = (s) => String(s || "").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/æ/g, "ae").replace(/Æ/g, "AE").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pyInitials = (obj) => String(obj?.py || "").split(" ")[0];
// 返回打分函数：0 = 不匹配；1 = 最相关（菜号相同、首字母开头就对上）；2 = 包含
function makeMatcher(query) {
  const q = foldText(query).trim();
  if (!q) return null;
  const qLatin = q.replace(/\s+/g, "");
  const isLatin = /^[a-z0-9]+$/.test(qLatin);
  const foreign = typeof I18N !== "undefined" && I18N.lang !== "zh";
  return (obj) => {
    if (!obj) return 0;
    if (isLatin && obj.code) {
      const code = String(obj.code).toLowerCase();
      if (code === qLatin) return 1;
      if (code.startsWith(qLatin)) return 2;
    }
    if (isLatin) {
      const ini = pyInitials(obj);
      // 拼音首字母只做一级匹配：从第一个字开始对（gb → 宫保鸡丁），不匹配中间（jd 不会出宫保鸡丁）
      if (ini.startsWith(qLatin)) return 1;
    }
    const name = foldText(obj.name);
    if (name.includes(q)) return name.startsWith(q) ? 1 : 2;
    if (foreign) {
      const tr = foldText(I18N.t(String(obj.name || "")));
      if (tr !== name && tr.includes(q)) return tr.startsWith(q) ? 1 : 2;
    }
    return 0;
  };
}
// 搜菜：不分组，最相关的在前，同一档按拼音首字母排（a → z）
function searchDishes(items, query) {
  const match = makeMatcher(query);
  if (!match) return null;
  return items.map((i) => [i, match(i)]).filter(([, s]) => s)
    .sort(([a, sa], [b, sb]) => sa - sb || pyInitials(a).localeCompare(pyInitials(b)) || String(a.name).localeCompare(String(b.name), "zh"))
    .map(([i]) => i);
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// crypto.randomUUID 在 http 局域网地址下不可用，自己拼一个
const requestId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);

const $ = (sel, root = document) => root.querySelector(sel);

function toast(message, type = "info", ms) {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms || (type === "error" ? 5000 : 2500));
}

// 实时同步：断线自动重连，重连后触发一次全量刷新
// 返回 { send(obj), connected() }：顾客点餐页用它订阅自己这桌的共享购物车频道（v1.26）
function connectLive(onMessage, onStatus) {
  let retry = 1000;
  let ws = null;
  const handle = {
    send: (obj) => { try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } } catch {} return false; },
    connected: () => Boolean(ws && ws.readyState === 1),
  };
  const open = () => {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    ws.onopen = () => {
      retry = 1000;
      onStatus?.(true);
      onMessage({ type: "reconnected" });
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      // 收银系统升级了（服务重启后版本号变了）：整页刷新，换成新版界面
      if (msg.type === "server_version") {
        if (window.__posVersion && msg.version && msg.version !== window.__posVersion) { window.__posReloading = true; return location.reload(); }
        window.__posVersion = msg.version;
        return;
      }
      try { onMessage(msg); } catch {}
    };
    ws.onclose = () => {
      onStatus?.(false);
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 10000);
    };
  };
  open();
  return handle;
}

// 通用弹窗：返回 { el, close }，按钮 onClick 返回 false 可阻止关闭
function openModal({ title, body = "", buttons = [], wide = false, onClose }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay" + (wide ? " full" : ""); // 大弹窗：手机上铺满整屏（app.css）
  overlay.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="关闭">×</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"></div>
    </div>`;
  const foot = $(".modal-foot", overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && [...document.querySelectorAll(".modal-overlay")].pop() === overlay && close();
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.className = "btn " + (b.kind || "");
    btn.textContent = b.label;
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if ((await b.onClick?.()) !== false) close();
      } catch (e) {
        toast(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
    foot.appendChild(btn);
  }
  if (!buttons.length) foot.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return { el: overlay, close };
}

function confirmModal(title, message, confirmLabel = "确定", kind = "primary") {
  return new Promise((resolve) => {
    let ok = false;
    openModal({
      title,
      body: `<p>${esc(message)}</p>`,
      buttons: [
        { label: "取消" },
        { label: confirmLabel, kind, onClick: () => (ok = true) },
      ],
      onClose: () => resolve(ok),
    });
  });
}

// ---------- 短期下载票据（明文暴露 b）----------
// <img src>、新窗口打开发票这类没法带 Authorization 头的地址，不再把登录令牌放进地址（会留在浏览器历史里），
// 改用 POST /api/auth/media-ticket 换来的 10 分钟只读票据：mediaQ() 返回 "t=票据"。登录后每 4 分钟换一张新的。
let MEDIA_T = "", MEDIA_AT = 0;
async function refreshMediaTicket() {
  if (!store.get("pos_token")) return "";
  try { const r = await api("/api/auth/media-ticket", { method: "POST" }); MEDIA_T = r.ticket; MEDIA_AT = Date.now(); } catch {}
  return MEDIA_T;
}
// 用之前确保有一张够新的票据（异步场景用）
async function ensureMediaTicket() { if (!MEDIA_T || Date.now() - MEDIA_AT > 4 * 60 * 1000) await refreshMediaTicket(); return MEDIA_T; }
const mediaQ = () => { if (!MEDIA_T || Date.now() - MEDIA_AT > 4 * 60 * 1000) refreshMediaTicket(); return "t=" + encodeURIComponent(MEDIA_T); };
setInterval(() => { if (store.get("pos_token") && MEDIA_T) refreshMediaTicket(); }, 4 * 60 * 1000);

// 把票据排版 JSON 渲染成「小票纸」预览（文字、二维码、LOGO、空行）
// 58mm 纸 = 32 字符 = 384 点，80mm = 48 字符 = 576 点，每个字符约 12 点宽
function renderTicket(payload) {
  const dotsWide = payload.width * 12;
  const pct = (dots) => Math.min(100, (dots / dotsWide) * 100).toFixed(1) + "%";
  const lines = payload.lines.map((l) => {
    const align = "a-" + (l.align || "left");
    if (l.type === "qr") {
      return `<div class="tl ${align}"><img class="tqr" alt="二维码" style="width:${pct((l.size || 5) * 29)}" src="/api/print-templates/qr.svg?data=${encodeURIComponent(l.data)}&${mediaQ()}"></div>`;
    }
    if (l.type === "barcode") return `<div class="tl ${align}"><span class="tbar" translate="no">${"▌▍▌▌▍▍▌▍▌".repeat(3)}</span><br><span translate="no">${esc(l.data)}</span></div>`;
    if (l.type === "image") return l.src ? `<div class="tl ${align}"><img class="timg" alt="LOGO" style="width:${pct(l.dots || 256)}" src="${esc(l.src)}"></div>` : "";
    if (l.type === "feed") return '<div class="tl">&nbsp;</div>'.repeat(l.n || 1);
    // 字号：w = 字宽倍数，h = 字高倍数（老数据里的 big 等于 2×2）
    const w = l.w || (l.big ? 2 : 1), h = l.h || (l.big ? 2 : 1);
    const cls = w >= 3 ? "huge" : w === 2 ? "big" : h === 2 ? "tall" : "";
    return `<div class="tl ${cls} ${l.bold ? "bold" : ""} ${align}"><span class="${l.invert ? "inv" : ""}">${esc(l.text) || "&nbsp;"}</span></div>`;
  }).join("");
  return `<div class="ticket" style="--cols:${payload.width}">${lines}</div>`;
}

// 登录：先选员工，再输 PIN（收银台、服务员点餐、厨房屏共用）。
// 服务端只校验选中的那个账号，所以 PIN 不必全店唯一；按账号单独限流。
function mountPinLogin(root, onSuccess) {
  let pin = "", chosen = null, staff = [];
  const onKey = (e) => {
    if (root.offsetParent === null || !chosen) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("back");
    else if (e.key === "Enter") { e.preventDefault(); press("ok"); } // 焦点在数字键上时，回车不再顺便按一下那个数字
  };
  document.addEventListener("keydown", onKey);

  async function showStaffPicker() {
    chosen = null; pin = "";
    try { staff = await api("/api/auth/staff-list", { auth: false }); } catch { staff = []; }
    if (!staff.length) {
      // 名单拿不到（旧服务端 / 网络）：退回「只输 PIN」的老界面，仍能登录
      return showPad(null);
    }
    root.innerHTML = `<div class="staff-pick">
      <p class="muted" style="text-align:center;margin:.2em 0 .6em">请选择你的名字</p>
      <div class="staff-grid">${staff.map((s) => `<button type="button" class="staff-btn" data-sid="${s.id}">
        <span class="av" aria-hidden="true" translate="no">${esc((s.name || "?").trim().slice(0, 1))}</span>
        <span class="nm">${esc(s.name)}</span><span class="rl muted">${s.role === "admin" ? "店长" : "员工"}</span></button>`).join("")}</div></div>`;
    root.querySelector(".staff-grid").onclick = (e) => {
      const b = e.target.closest("[data-sid]");
      if (b) showPad(Number(b.dataset.sid));
    };
  }
  function showPad(sid) {
    chosen = sid;
    pin = "";
    const who = staff.find((s) => s.id === sid);
    root.innerHTML = `
      ${who ? `<button type="button" class="btn small" data-k="who" style="margin-bottom:6px">← ${esc(who.name)}</button>` : ""}
      <div class="pin-dots"></div>
      <div class="pin-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join("")}
        <button type="button" data-k="clear" style="font-size:15px">清空</button>
        <button type="button" data-k="0">0</button>
        <button type="button" data-k="ok" style="font-size:15px;background:var(--accent);color:var(--on-accent, #fff);border-color:var(--accent)">登录</button>
      </div>`;
    render();
    root.onclick = (e) => {
      const k = e.target.closest("[data-k]")?.dataset.k;
      if (k) press(k);
    };
  }
  const render = () => {
    const dots = $(".pin-dots", root);
    if (dots) dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? "on" : ""}"></i>`).join("");
  };
  // 请求没回来之前再点「登录」/ 按回车都不理（易用性整改第 7 条：不再出现「正在验证上一个 PIN」）
  let busy = false;
  const submit = async () => {
    if (busy) return;
    if (pin.length < 4) return toast("PIN 至少 4 位", "error");
    busy = true;
    const typed = pin; // 请求期间再按的键不算数
    try {
      const r = await api("/api/auth/login", { method: "POST", body: { staff_id: chosen, pin: typed }, auth: false });
      store.set("pos_token", r.token);
      document.removeEventListener("keydown", onKey);
      // 店长用临时 PIN 登录：只能先改 PIN（刚输入的就是原 PIN，不用再输一次）
      if (r.must_change_pin) return openPinChange({ oldPin: typed, role: r.staff?.role });
      onSuccess(r.staff);
    } catch (e) {
      toast(e.message, "error");
      pin = "";
      render();
    } finally { busy = false; }
  };
  const press = (k) => {
    if (busy) return; // 登录请求没回来之前，按键都不理
    if (k === "who") return showStaffPicker();
    if (k === "ok") return submit();
    if (k === "clear") pin = "";
    else if (k === "back") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += k;
    render();
  };
  showStaffPicker();
}

// ---------- 修改 PIN（D-01 / D-07 安全整改） ----------
// forced：店长账号还在用默认或过于简单的 PIN（0000、1234、1111……），改好之前不能做别的操作；关掉窗口 = 退出登录。
// 改好后服务器让这个员工所有设备上的旧登录失效（包括这台），同时给这台设备发一个新登录：存下来直接进系统（易用性整改第 2 条）。
// 服务器没给新登录（老版本服务端）时才退回登录页。
let pinChangeOpen = false;
function credentialsUpdated(r) {
  store.set("pos_token", r?.token || null);
  toast(r?.token ? "PIN 已改好" : "请重新登录", "success");
  setTimeout(reloadPage, r?.token ? 600 : 1500);
}
function openPinChange({ oldPin = "", forced = true, role } = {}) {
  if (pinChangeOpen) return;
  pinChangeOpen = true;
  let done = false;
  const pinInput = (id) => `<input type="password" id="${id}" maxlength="6" inputmode="numeric" autocomplete="off" style="width:100%">`;
  // 规则不提前讲：输得不合格时由服务器提示（易用性整改第 6 条）。强制修改只有店长（供应商给的临时 PIN），role 不知道时按店长
  const m = openModal({
    title: role === "staff" ? "请设置新的 PIN" : "请设置新的店长 PIN",
    body: `${oldPin ? "" : `<label class="field"><span>原 PIN</span>${pinInput("cpOld")}</label>`}
      <label class="field"><span>新 PIN</span>${pinInput("cpNew")}</label>
      <label class="field"><span>再输一次新 PIN</span>${pinInput("cpNew2")}</label>`,
    buttons: [
      { label: forced ? "退出登录" : "取消" },
      { label: "保存新 PIN", kind: "primary", onClick: async () => {
        const nw = $("#cpNew", m.el).value.trim();
        if (!/^\d{4,6}$/.test(nw)) { toast("新 PIN 必须是 4~6 位数字", "error"); return false; }
        if (nw !== $("#cpNew2", m.el).value.trim()) { toast("两次输入的新 PIN 不一样", "error"); return false; }
        const old = oldPin || $("#cpOld", m.el).value.trim();
        let r;
        try {
          r = await api("/api/auth/change-pin", { method: "POST", body: { old_pin: old, new_pin: nw } });
        } catch (e) {
          // 两台设备同时改同一个人的 PIN，另一台先改成了：这台的登录已失效，提示后回到登录页（第三轮审查 6）
          if (e.data?.code !== "PIN_CHANGED_ELSEWHERE") throw e;
          done = true;
          store.set("pos_token", null);
          toast("这个账号的 PIN 刚在别的设备上改过了，这次修改没有保存。请用新的 PIN 重新登录", "error");
          setTimeout(reloadPage, 2500);
          return;
        }
        done = true;
        credentialsUpdated(r);
      } },
    ],
    onClose: () => {
      pinChangeOpen = false;
      if (forced && !done) {
        api("/api/auth/logout", { method: "POST" }).catch(() => {}).finally(() => { store.set("pos_token", null); reloadPage(); });
      }
    },
  });
  setTimeout(() => $(oldPin ? "#cpNew" : "#cpOld", m.el)?.focus(), 50);
}

// ---------- 规格 / 加料（收银台和手机点餐共用） ----------
// item.options = [{ name, type: 'single'|'multi', required, choices: [{ name, price_cents }] }]
// 已选 selected = [{ group, choice }]

const hasOptions = (item) => Array.isArray(item.options) && item.options.length > 0;

function choiceOf(item, sel) {
  return item.options.find((g) => g.name === sel.group)?.choices.find((c) => c.name === sel.choice);
}

// 欢乐时段：服务端在菜品上带 happy_pct（现在打几折），算价和服务端一样（整个单价含规格加价打折，四舍五入到分）
function unitPrice(item, selected = []) {
  const full = item.price_cents + selected.reduce((s, sel) => s + (choiceOf(item, sel)?.price_cents || 0), 0);
  return item.happy_pct ? Math.round((full * (100 - item.happy_pct)) / 100) : full;
}
// 价格显示：欢乐时段时原价划掉、显示折后价
function priceHtml(item, suffix = "") {
  if (!item.happy_pct) return `${money(item.price_cents)}${suffix}`;
  return `<s class="muted" style="font-weight:400">${money(item.price_cents)}</s> <span class="happy">${money(Math.round((item.price_cents * (100 - item.happy_pct)) / 100))}${suffix}</span> <span class="happy-tag">🎉 -${item.happy_pct}%</span>`;
}

// 按配置顺序排序，保证同样的选择得到同样的 key/文字（和服务端小票上的一致）
function sortSelection(item, selected) {
  const order = [];
  for (const g of item.options || []) for (const c of g.choices) order.push(g.name + "\u0000" + c.name);
  return [...selected].sort((a, b) => order.indexOf(a.group + "\u0000" + a.choice) - order.indexOf(b.group + "\u0000" + b.choice));
}

function optionsText(item, selected = []) {
  return (item.options || [])
    .map((g) => selected.filter((s) => s.group === g.name).map((s) => s.choice))
    .filter((list) => list.length)
    .map((list) => list.join("、"))
    .join(" / ");
}

const cartKey = (itemId, selected = []) => itemId + "|" + selected.map((s) => s.group + ":" + s.choice).join(",");

const priceTag = (cents) => (cents ? `${cents > 0 ? "+" : "-"}${moneyShort(Math.abs(cents))}` : "");

// 爆款小标（店长在菜单 / 商品里开启）
// v1.24：表情 🔥 换成小星星线条图标（各种屏幕显示一样）
const HOT_STAR = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/></svg>';
const hotBadge = (item) => (item?.featured ? `<span class="hot-badge">${HOT_STAR}<span>爆款</span></span>` : "");

function thumbHtml(item, cls = "thumb") {
  return item.image
    ? `<img class="${cls}" src="${esc(item.thumb || item.image)}" alt="" loading="lazy" decoding="async">` // 有缩略图用缩略图（v1.25.1）
    : `<div class="${cls} ph">${esc(item.name.slice(0, 1))}</div>`;
}

// 套餐里卖完 / 沽清的菜（服务端标 sold_out）：灰色、不能选（样式只加一次，收银台、点餐页共用）
function optStyle() {
  if (document.getElementById("optSoldStyle")) return;
  const st = document.createElement("style");
  st.id = "optSoldStyle";
  st.textContent = ".opt.so { opacity: .55; cursor: not-allowed; background: var(--surface-2, #f3f2ef); text-decoration: line-through; }" +
    ".opt.so .so-tag { text-decoration: none; display: inline-block; margin-left: 6px; font-size: 12px; color: var(--muted); }" +
    ".opt-qty button:disabled { opacity: .35; cursor: not-allowed; }";
  document.head.appendChild(st);
}

// 弹出选规格面板：手机上是底部弹层，电脑上是居中弹窗。onAdd(selected, qty)
// opts.maxQty(selected)：按现在选的规格最多还能加几份（限量的菜；不传 = 99）
function openOptionPicker(item, onAdd, opts = {}) {
  optStyle();
  const soldOut = (c) => Boolean(c && c.sold_out);
  // 必选单选项默认选第一个还能选的（卖完的跳过）
  let selected = item.options.filter((g) => g.required).map((g) => ({ group: g.name, choice: (g.choices.find((c) => !soldOut(c)) || g.choices[0]).name }));
  let qty = 1;
  const cap = () => Math.min(99, opts.maxQty ? opts.maxQty(sortSelection(item, selected)) : 99);
  // 收银端传 opts.note = { presets, maxLen }：规格面板里直接写备注，选完规格一步加入，不用加进购物车后再点「+ 备注」。顾客点餐页不传，照旧不显示。
  const noteCfg = opts.note || null;
  const noteChosen = new Set();
  let noteText = "";

  const overlay = document.createElement("div");
  overlay.className = "opt-overlay";
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  function render() {
    const unit = unitPrice(item, selected);
    overlay.innerHTML = `
      <div class="opt-panel" role="dialog" aria-modal="true">
        <button class="icon-btn opt-close" data-close aria-label="关闭">×</button>
        <div class="opt-head">
          ${thumbHtml(item, "opt-img")}
          <div><div class="opt-name">${esc(item.name)}</div><div class="opt-base num">${money(item.price_cents)} 起</div></div>
        </div>
        <div class="opt-body">
          ${item.options.map((g) => `
            <div class="opt-group">
              <div class="opt-title">${esc(g.name)} <span>${g.type === "multi" ? "可多选" : g.required ? "必选" : "可选"}</span></div>
              <div class="opt-chips">${g.choices.map((c) => {
                const on = selected.some((s) => s.group === g.name && s.choice === c.name);
                if (soldOut(c)) return `<button type="button" class="opt so" disabled aria-disabled="true">${esc(c.name)}<span class="so-tag">已售完</span></button>`;
                return `<button type="button" class="opt ${on ? "on" : ""}" data-g="${esc(g.name)}" data-c="${esc(c.name)}">${esc(c.name)}${c.price_cents ? ` <small>${priceTag(c.price_cents)}</small>` : ""}</button>`;
              }).join("")}</div>
            </div>`).join("")}
          ${noteCfg ? `<div class="opt-group opt-note">
              <div class="opt-title">备注 <span>可选</span></div>
              ${(noteCfg.presets || []).length ? `<div class="opt-chips">${noteCfg.presets.map((p) => `<button type="button" class="opt ${noteChosen.has(p) ? "on" : ""}" data-np="${esc(p)}">${esc(p)}</button>`).join("")}</div>` : ""}
              <input type="text" class="opt-noteinput" maxlength="${noteCfg.maxLen || 30}" placeholder="手写备注" value="${esc(noteText)}">
            </div>` : ""}
        </div>
        <div class="opt-foot">
          <div class="opt-sum"><b class="num">${money(unit * qty)}</b><div class="muted">${esc(optionsText(item, selected)) || "未选规格"}</div></div>
          <span class="opt-qty"><button type="button" data-q="-1" aria-label="减少">−</button><b class="num">${qty}</b><button type="button" data-q="1" aria-label="加一份" ${qty >= cap() ? "disabled" : ""}>+</button></span>
          <button type="button" class="btn primary" data-add>加入</button>
        </div>
      </div>`;
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) return close();
    if (noteCfg) { const ni = overlay.querySelector(".opt-noteinput"); if (ni) noteText = ni.value; } // 重渲染前存住已输入的备注
    const np = e.target.closest("[data-np]"); // 备注预设（和规格 chip 同样式，但带 data-np）：先处理，避免走到下面的规格分支
    if (np) { noteChosen.has(np.dataset.np) ? noteChosen.delete(np.dataset.np) : noteChosen.add(np.dataset.np); return render(); }
    const opt = e.target.closest(".opt");
    if (opt && opt.classList.contains("so")) return;
    if (opt) {
      const g = item.options.find((x) => x.name === opt.dataset.g);
      const name = opt.dataset.c;
      const on = selected.some((s) => s.group === g.name && s.choice === name);
      if (g.type === "multi") {
        selected = on ? selected.filter((s) => !(s.group === g.name && s.choice === name)) : [...selected, { group: g.name, choice: name }];
      } else if (on && !g.required) {
        selected = selected.filter((s) => s.group !== g.name); // 可选单选再点一次取消
      } else {
        selected = [...selected.filter((s) => s.group !== g.name), { group: g.name, choice: name }];
      }
      qty = Math.max(1, Math.min(qty, cap()));
      return render();
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      const max = cap();
      if (Number(q.dataset.q) > 0 && qty >= max) return toast(typeof I18N !== "undefined" ? I18N.t(max > 0 ? `只剩 ${max} 份` : "已售完") : max > 0 ? `只剩 ${max} 份` : "已售完", "error");
      qty = Math.min(99, Math.max(1, qty + Number(q.dataset.q))); return render();
    }
    if (e.target.closest("[data-add]")) {
      const missing = item.options.find((g) => g.required && !selected.some((s) => s.group === g.name));
      if (missing) return toast(`请选择${missing.name}`, "error");
      // 选的套餐菜卖完了（必选的一步全部卖完）
      const bad = selected.find((s) => soldOut(item.options.find((g) => g.name === s.group)?.choices.find((c) => c.name === s.choice)));
      if (bad) return toast(typeof I18N !== "undefined" ? I18N.t("已售完") : "已售完", "error");
      const max = cap();
      if (max <= 0) return toast(typeof I18N !== "undefined" ? I18N.t("已售完") : "已售完", "error");
      if (qty > max) { qty = max; render(); return toast(typeof I18N !== "undefined" ? I18N.t(`只剩 ${max} 份`) : `只剩 ${max} 份`, "error"); }
      const note = noteCfg ? NoteText.compose({ sys: [], presets: noteCfg.presets || [], chosen: noteChosen, text: (overlay.querySelector(".opt-noteinput")?.value || "").trim(), order: false, maxLen: noteCfg.maxLen || 30 }) : undefined;
      onAdd(sortSelection(item, selected), qty, note);
      close();
    }
  });
  render();
}

// ---------- 分类颜色（报表、菜单管理共用；和后端 routes/menu.js 的 COLORS 对应） ----------
// text 用于文字（对比度 ≥ 4.5:1），bg 用于浅底色
const CATEGORY_COLORS = {
  orange: { name: "橙", text: "#c2410c", bg: "#fff0e6" },
  blue: { name: "蓝", text: "#1864ab", bg: "#e7f1fb" },
  green: { name: "绿", text: "#2b8a3e", bg: "#ebfbee" },
  purple: { name: "紫", text: "#6741d9", bg: "#f3f0ff" },
  teal: { name: "青", text: "#0b7285", bg: "#e3fafc" },
  pink: { name: "粉", text: "#a61e4d", bg: "#fff0f6" },
  brown: { name: "棕", text: "#8a5a2b", bg: "#f8f0e5" },
  indigo: { name: "靛", text: "#364fc7", bg: "#edf2ff" },
  olive: { name: "橄榄", text: "#5c7a0a", bg: "#f4fce3" },
  gray: { name: "灰", text: "#495057", bg: "#f1f3f5" },
};
const catColor = (key) => CATEGORY_COLORS[key] || CATEGORY_COLORS.gray;
const catVars = (key) => `--cc:${catColor(key).text};--cb:${catColor(key).bg}`;
const catTag = (name, key) => `<span class="ctag" style="${catVars(key)}">${esc(name)}</span>`;

// ---------- 触摸屏 ----------
// 触摸模式：auto（检测到触摸屏自动开启）/ on / off，每台设备单独保存。
// 开启后按钮、输入框加大，金额/数量输入框点击时弹出屏幕数字键盘（没有实体键盘的收银一体机也能输入）。
const TOUCH_KEY = "touch_mode";
function touchMode() {
  try { return localStorage.getItem(TOUCH_KEY) || "auto"; } catch { return "auto"; }
}
function isTouch() {
  const m = touchMode();
  if (m === "on") return true;
  if (m === "off") return false;
  if (IS_POS_HOST) return true; // 安卓平板 App：默认触摸模式（部分平板 / 模拟器的 WebView 报 pointer: fine，不能只靠媒体查询）
  return Boolean(window.matchMedia && window.matchMedia("(any-pointer: coarse)").matches);
}
// 没有实体键盘的设备：任何安卓 App 里（平板收银机 / 服务员手机）、窄屏手机 / 8 寸平板 ≤820、不是 Windows 的纯触屏（iPad / 安卓平板浏览器）。
// 打开窗口不自动聚焦输入框（一聚焦就弹键盘挡住按钮），也不显示 F2 / F7 这类键盘快捷键提示。
// Windows 一体机（不管有没有鼠标）自动聚焦和 F 键提示都和原来一样（店主 10-28 定，B51）
const noAutoFocus = () => IS_POS_HOST || Boolean(window.PosBridge && window.PosApp) || /RestaurantPOSApp/.test(navigator.userAgent || "") || window.innerWidth <= 820
  || (!/Windows/.test(navigator.userAgent || "") && Boolean(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches === false));
function applyTouch() {
  document.documentElement.classList.toggle("touch", isTouch());
}
function setTouchMode(mode) {
  try { localStorage.setItem(TOUCH_KEY, mode); } catch {}
  applyTouch();
}
applyTouch();

const Keypad = (() => {
  // 屏幕键盘（触摸模式）：
  // - 数字框（金额、数量）获得焦点时自动弹出「123」数字键盘
  // - 文字框不自动弹，只在右下角显示「⌨」按钮，需要时点开；有字母（ABC）和符号（#+=）两页
  // - 「⌄ 收起」随时收起，收起后点「⌨」再打开；「中」切换到 Windows 自带的输入法打中文
  // - 用这个键盘时屏蔽系统自带的触摸键盘（inputmode=none），避免两个键盘叠在一起
  const PAGES = {
    num: [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [".", "0", "back"], ["abc", "clear", "done"]],
    abc: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["shift", "z", "x", "c", "v", "b", "n", "m", "back"],
      ["num", "sym", "acc", "zh", "space", "done"],
    ],
    // 法语重音字母（点 abc 页的「àé」进来）
    acc: [
      ["à", "â", "ä", "é", "è", "ê", "ë", "ç"],
      ["î", "ï", "ô", "ö", "ù", "û", "ü", "ÿ"],
      ["œ", "æ", "«", "»", "°", "'", "-", "back"],
      ["num", "abc", "space", "done"],
    ],
    sym: [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["-", "/", ":", ";", "(", ")", "€", "¥", "$", "&"],
      ["@", ".", ",", "?", "!", "'", "\"", "#", "%", "back"],
      ["num", "abc", "*", "+", "=", "_", "space", "done"],
    ],
  };
  const LABEL = { back: "⌫", clear: "C", done: "完成", abc: "ABC", sym: "#+=", num: "123", acc: "àé", zh: "中", space: "空格", shift: "⇧" };
  // 键盘整块 translate="no"（按键字母不能被翻译），「完成」「空格」「收起」自己按界面语言翻（「收起」前面的箭头是 SVG，B23：「⌄」有的字体像小 v）（整改 U2；双语模式只取译文那行）
  const L = (s) => { try { return typeof I18N !== "undefined" ? String(I18N.t(s)).split(/\n/).pop() : s; } catch { return s; } };
  const TR_KEYS = new Set(["done", "space"]);
  const UPPER = (p) => p === "abc" || p === "acc"; // 这两页支持大写（⇧）
  let el = null, fab = null, input = null, page = "num", shift = false, hidden = false;

  const TEXT_TYPES = /^(text|search|number|password|tel|email|url)$/;
  // 手机浏览器（iPhone、安卓手机）有自己的输入法，不用屏幕键盘，也不显示右下角「⌨」按钮（老板手机页以前会多出一个黑圆钮）。
  // 只看手机的浏览器标识；收银一体机、平板、手持收银机、我们自己的安卓 App（标识里有 RestaurantPOSApp）照常用屏幕键盘
  const PHONE = (() => { try { const ua = navigator.userAgent || ""; return /iPhone|iPod|Android.*Mobile/.test(ua) && !/RestaurantPOSApp/.test(ua) && !window.PosApp; } catch { return false; } })();
  const eligible = (x) => x && !PHONE && !x.readOnly && !x.disabled && !x.closest(".no-keypad, .keypad") &&
    ((x.tagName === "INPUT" && TEXT_TYPES.test(x.type)) || x.tagName === "TEXTAREA");
  const isNumeric = (x) => x.tagName === "INPUT" && (x.type === "number" || x.dataset.kpNumber === "1" ||
    /^(decimal|numeric)$/.test(x.dataset.kpMode || x.getAttribute("inputmode") || ""));

  function build() {
    el = document.createElement("div");
    el.className = "keypad";
    el.setAttribute("translate", "no");
    el.hidden = true;
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "keypad-fab";
    fab.hidden = true;
    // B28：按钮显示时 <html> 挂 kp-fab-on，弹窗底栏给它让出位置（不挡「开票并打印」这类主按钮）
    new MutationObserver(() => document.documentElement.classList.toggle("kp-fab-on", !fab.hidden)).observe(fab, { attributes: true, attributeFilter: ["hidden"] });
    fab.setAttribute("translate", "no");
    fab.setAttribute("aria-label", "打开屏幕键盘");
    fab.textContent = "⌨";
    // 按键、⌨ 按钮都不抢输入框的焦点
    for (const n of [el, fab]) {
      n.addEventListener("pointerdown", (e) => e.preventDefault());
      n.addEventListener("mousedown", (e) => e.preventDefault());
    }
    el.addEventListener("click", onKey);
    fab.addEventListener("click", () => { if (input) show(isNumeric(input) ? "num" : "abc"); });
    document.body.append(el, fab);
  }

  function render() {
    const keys = PAGES[page];
    el.className = `keypad kp-${page}`;
    el.innerHTML = `<div class="kp-top"><span class="kp-grip" title="拖动移动键盘，双击回到默认位置">⠿</span><span class="kp-resize" title="左右拖动调整键盘大小，双击恢复默认">↔</span><button type="button" data-kp="hide" class="kp-hide"><svg class="kp-hide-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>${esc(L("收起"))}</button></div>` +
      keys.map((row) => `<div class="kp-row">${row.map((k) => {
        const label = TR_KEYS.has(k) ? L(LABEL[k]) : LABEL[k] || (shift && UPPER(page) ? k.toUpperCase() : k);
        const cls = [k.length > 1 ? "kp-fn" : "", k === "done" ? "kp-done" : "", k === "space" ? "kp-space" : "", k === "shift" && shift ? "on" : ""].join(" ");
        return `<button type="button" data-kp="${esc(k)}" class="${cls}">${esc(label)}</button>`;
      }).join("")}</div>`).join("");
  }

  // 数字输入框编辑时临时改成 text（number 类型不接受「12.」这种中间状态，也不能设置光标）
  function attach(target) {
    if (input && input !== target) detach();
    input = target;
    if (target.type === "number") {
      target.dataset.kpInt = target.step && !String(target.step).includes(".") && target.step !== "any" ? "1" : "";
      target.dataset.kpNumber = "1";
      target.type = "text";
    }
    if (!("kpMode" in target.dataset)) target.dataset.kpMode = target.getAttribute("inputmode") || "";
    if (target.dataset.kpSystem !== "1") target.setAttribute("inputmode", "none");
  }

  function detach() {
    const t = input;
    if (!t) return;
    input = null;
    if (t.dataset.kpNumber) {
      if (t.value.endsWith(".")) t.value = t.value.slice(0, -1); // 「12.」变回数字框前去掉结尾的小数点
      t.type = "number";
      delete t.dataset.kpNumber;
    }
    if ("kpMode" in t.dataset) {
      if (t.dataset.kpMode) t.setAttribute("inputmode", t.dataset.kpMode); else t.removeAttribute("inputmode");
      delete t.dataset.kpMode;
    }
    delete t.dataset.kpSystem;
    t.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function show(p) {
    if (!el) build();
    page = p;
    hidden = false;
    render();
    el.style.setProperty("--kp-scale", getScale());
    el.hidden = false;
    fab.hidden = true;
    place();
    requestAnimationFrame(avoid);
  }
  function hide() {
    if (!el) return;
    el.hidden = true;
    hidden = true;
    fab.hidden = !input;
    unpad();
  }
  function closeAll() {
    if (el) { el.hidden = true; fab.hidden = true; }
    unpad();
    detach();
  }

  // ---- 拖动：位置按「数字键盘 / 字母键盘」分开记在这台设备上（存的是相对屏幕的比例，换分辨率也不跑出屏幕）----
  const posKey = () => "kp_pos_" + (page === "num" ? "num" : "abc");
  let swapped = false; // 自动换到另一边（不记住）
  function place() {
    let pos = null;
    try { pos = JSON.parse(store.get(posKey()) || "null"); } catch {}
    if (narrow()) pos = null; // 窄屏（平板竖屏 / 手机）：键盘固定贴底，不按拖过的位置放
    el.classList.toggle("kp-moved", Boolean(pos));
    el.classList.toggle("kp-swap", !pos && swapped);
    if (!pos) { el.style.left = el.style.top = ""; return; }
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(4, Math.min(innerWidth - w - 4, pos.x * innerWidth)) + "px";
    el.style.top = Math.max(4, Math.min(innerHeight - h - 4, pos.y * innerHeight)) + "px";
  }
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".keypad .kp-grip"); if (!g) return;
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    g.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.moved = true;
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(4, Math.min(innerWidth - w - 4, e.clientX - drag.dx)), y = Math.max(4, Math.min(innerHeight - h - 4, e.clientY - drag.dy));
    el.classList.add("kp-moved"); el.classList.remove("kp-swap");
    el.style.left = x + "px"; el.style.top = y + "px";
  });
  document.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved) store.set(posKey(), JSON.stringify({ x: parseFloat(el.style.left) / innerWidth, y: parseFloat(el.style.top) / innerHeight }));
    drag = null;
    unpad(); avoid();
  });
  document.addEventListener("dblclick", (e) => { if (!e.target.closest(".keypad .kp-grip")) return; store.set(posKey(), null); swapped = false; place(); unpad(); avoid(); });
  addEventListener("resize", () => { if (el && !el.hidden) { place(); unpad(); avoid(); } });

  // ---- 左右拖动调整键盘大小（整体放大/缩小，记在这台设备上；双击手柄恢复默认）----
  const getScale = () => { const v = parseFloat(store.get("kp_scale")); return v >= 0.7 && v <= 1.6 ? v : 1; };
  let rz = null;
  document.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".keypad .kp-resize"); if (!h || !el) return;
    rz = { x: e.clientX, s: getScale() };
    h.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  document.addEventListener("pointermove", (e) => {
    if (!rz) return;
    const s = Math.max(0.7, Math.min(1.6, rz.s + (e.clientX - rz.x) / 480));
    el.style.setProperty("--kp-scale", s.toFixed(3));
  });
  document.addEventListener("pointerup", () => {
    if (!rz) return;
    store.set("kp_scale", el.style.getPropertyValue("--kp-scale") || "1");
    rz = null; place(); unpad(); avoid();
  });
  document.addEventListener("dblclick", (e) => {
    if (!e.target.closest(".keypad .kp-resize")) return;
    store.set("kp_scale", null); el.style.setProperty("--kp-scale", "1"); place(); unpad(); avoid();
  });

  // ---- 让开正在填的输入框：先在底部留出键盘的高度、把输入框滚上来；滚不动（固定的弹窗）就把小键盘换到另一边 ----
  let padded = null;
  const narrow = () => innerWidth <= 820;
  function unpad() {
    if (!padded) return;
    if (padded.classList.contains("kp-open")) { padded.classList.remove("kp-open"); padded.style.removeProperty("--kp-h"); }
    else { padded.style.paddingBottom = padded.dataset.kpPad || ""; delete padded.dataset.kpPad; }
    padded = null;
  }
  const covered = () => { const a = input.getBoundingClientRect(), b = el.getBoundingClientRect(); return a.bottom > b.top - 8 && a.top < b.bottom && a.right > b.left && a.left < b.right; };
  function scroller(n) {
    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  function avoid() {
    if (!el || el.hidden || !input || !document.contains(input)) return;
    // 窄屏（≤820）弹窗里的输入框（整改 U1）：键盘贴底，弹窗整体让到键盘上面（弹窗变矮、内容区自己滚），
    // 「确认收款」等底部按钮不会被键盘挡住；再把输入框滚到看得见
    // 平板横屏打开字母键盘（宽、贴底）时弹窗也一样让上去（B57；拖动过的键盘不算）
    const ov = (narrow() || (IS_POS_HOST && page !== "num" && !el.classList.contains("kp-moved"))) && input.closest(".modal-overlay"); // 字母 / 重音 / 符号页都算（B65）
    if (ov) {
      if (padded !== ov) { unpad(); ov.classList.add("kp-open"); padded = ov; }
      ov.style.setProperty("--kp-h", Math.ceil(el.getBoundingClientRect().height) + "px");
      // data-kp-follow：输入框下面紧跟着要一起看到的内容（结账的「还差 / 找零」和快捷金额，B21），先把它滚上来，再保证输入框看得见
      requestAnimationFrame(() => {
        try {
          const sel = input?.closest("[data-kp-follow]")?.dataset.kpFollow;
          const follow = sel && ov.querySelector(sel);
          if (follow) follow.scrollIntoView({ block: "nearest" });
          input?.scrollIntoView({ block: "nearest" });
        } catch {}
      });
      return;
    }
    if (padded && padded.classList.contains("kp-open")) unpad(); // 换回数字键盘：弹窗不再让位
    if (!covered()) return;
    const kb = el.getBoundingClientRect();
    const sc = scroller(input);
    const isDoc = sc === document.scrollingElement || sc === document.documentElement;
    const box = isDoc ? document.body : sc;
    if (padded !== box) { unpad(); box.dataset.kpPad = box.style.paddingBottom || ""; box.style.paddingBottom = `calc(${getComputedStyle(box).paddingBottom} + ${Math.ceil(kb.height) + 16}px)`; padded = box; }
    const need = input.getBoundingClientRect().bottom - (kb.top - 16);
    if (need > 0) (isDoc ? window : sc).scrollBy({ top: need, behavior: "smooth" });
    // 滚完还挡着（比如固定在屏幕上的弹窗）：没被拖过的小数字键盘换到另一边
    setTimeout(() => {
      if (!el.hidden && input && covered() && page === "num" && !el.classList.contains("kp-moved")) { swapped = !swapped; place(); }
    }, 350);
  }

  function insert(text) {
    const t = input;
    let start = t.selectionStart ?? t.value.length, end = t.selectionEnd ?? t.value.length;
    const max = t.maxLength > 0 ? t.maxLength : Infinity;
    if (t.value.length - (end - start) + text.length > max) return;
    t.value = t.value.slice(0, start) + text + t.value.slice(end);
    const pos = start + text.length;
    try { t.setSelectionRange(pos, pos); } catch {}
  }

  function onKey(e) {
    const k = e.target.closest("[data-kp]")?.dataset.kp;
    if (!k || !input) return;
    const t = input;
    if (k === "hide") return hide();
    if (k === "done") { closeAll(); t.blur(); return; }
    if (k === "abc" || k === "sym" || k === "num" || k === "acc") { show(k); return; }
    if (k === "shift") { shift = !shift; render(); return; }
    if (k === "zh") {
      // 改用 Windows 自带的输入法：恢复系统键盘，收起我们的键盘
      t.dataset.kpSystem = "1";
      if (t.dataset.kpMode) t.setAttribute("inputmode", t.dataset.kpMode); else t.removeAttribute("inputmode");
      el.hidden = true;
      hidden = true;
      fab.hidden = true;
      toast(IS_POS_HOST ? "已切换到系统输入法：点输入框，用平板自带的键盘打中文" : "已切换到系统输入法：点输入框或任务栏上的键盘图标即可打中文", "info");
      t.blur();
      setTimeout(() => t.focus(), 50);
      return;
    }
    const numeric = t.dataset.kpNumber === "1";
    if (k === "back") {
      const s0 = t.selectionStart ?? t.value.length, e0 = t.selectionEnd ?? t.value.length;
      if (s0 !== e0) { t.value = t.value.slice(0, s0) + t.value.slice(e0); t.setSelectionRange(s0, s0); }
      else if (s0 > 0) { t.value = t.value.slice(0, s0 - 1) + t.value.slice(s0); t.setSelectionRange(s0 - 1, s0 - 1); }
    } else if (k === "clear") {
      t.value = "";
    } else if (numeric && page === "num") {
      // 数字框：只能一个小数点；整数框不能输小数点；开头的 0 被替换
      if (k === ".") { if (t.dataset.kpInt === "1" || t.value.includes(".")) return; if (!t.value) t.value = "0"; t.value += "."; }
      else t.value = t.value === "0" ? k : t.value + k;
    } else {
      insert(k === "space" ? " " : shift && UPPER(page) ? k.toUpperCase() : k);
      if (shift) { shift = false; render(); }
    }
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }

  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!isTouch() || !eligible(t)) return;
    if (!el) build();
    attach(t);
    if (t.dataset.kpSystem === "1") return;
    // 数字框自动弹出；文字框只显示 ⌨（键盘已经开着时继续用当前这一页）
    if (isNumeric(t)) { swapped = false; show("num"); }
    else if (!el.hidden) show(page === "num" ? "abc" : page);
    else { hidden = true; fab.hidden = false; }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target !== input) return;
    setTimeout(() => {
      if (input && document.activeElement !== input) {
        // 焦点去了别的输入框时由 focusin 接管；否则收起
        if (!eligible(document.activeElement)) { if (el) { el.hidden = true; fab.hidden = true; } unpad(); } // 键盘藏了，弹窗也不再让位（B66）
        if (document.activeElement !== input) detach();
      }
    }, 120);
  });
  return { show, hide, close: closeAll, get visible() { return Boolean(el && !el.hidden); }, get fabVisible() { return Boolean(fab && !fab.hidden); } };
})();

// ---------- exe 的收银窗口（地址带 ?app=1） ----------
// 保持一条标记为 app 的连接：窗口全部关闭后，启动器据此退出收银系统；
// 关闭窗口前提示确认（误关会导致手机点餐也断开）。页面自己刷新（切换语言、退出登录）时不提示。
const IS_APP_WINDOW = new URLSearchParams(location.search).has("app");
function reloadPage() {
  window.__posReloading = true;
  location.reload();
}
// 收银服务自己重启（导入数据、云端恢复、清除数据后）：等服务回来（/health 通了）再刷新页面，最多等 2 分钟；
// 安卓平板上服务退出后要等系统重新拉起，几秒到十几秒不等，固定等几秒再刷新会碰上空白页
function reloadWhenServerBack() {
  const t0 = Date.now();
  setTimeout(function poll() { // 先等 3 秒：服务收到请求后 1.5 秒才退出，太早问会以为已经好了
    if (Date.now() - t0 > 120000) return reloadPage();
    fetch("/health", { cache: "no-store" }).then((r) => (r.ok ? reloadPage() : setTimeout(poll, 1500))).catch(() => setTimeout(poll, 1500));
  }, 3000);
}
// 安卓 App（平板版收银主机 / 服务员手机 App）里的网页：不能开新窗口，也没有网页打印（以前点了会弹「离开此页」确认框，然后什么都不发生）
const inAndroidApp = () => Boolean(window.PosBridge && window.PosApp);
// 安卓 App（平板收银机 / 手机 App）：网页打印（window.print / 新窗口）没有反应，把整页 HTML 交给安卓系统打印（系统打印窗口里也能另存为 PDF）。
// 打印成功打开返回 true；App 太旧不支持时提示更新
async function hostPrintHtml(html, name) {
  try {
    let h = String(html).replace(/<script[\s\S]*?<\/script>/gi, ""); // 页面里自动调 window.print() 的脚本不要
    if (window.Stickers?.inlineImages) {
      const inl = await window.Stickers.inlineImages(h);
      if (inl.failed) toast(`有 ${inl.failed} 张图片没取到，先打印其余的`, "error");
      h = inl.html;
    }
    await window.PosApp.call("printHtml", { html: h, name: name || "Print" });
    return true;
  } catch (e) {
    toast(/不支持/.test(e.message) ? (IS_POS_HOST ? "这个版本的 App 还不能打印：请更新收银系统" : "这个版本的手机 App 还不能打印：请更新 App") : "打印没有打开：" + e.message, "error", 8000);
    return false;
  }
}
// 安卓 App 里的导出（B64）：把收银主机上的下载地址交给 App，App 原生边下边写进「下载/Gway」，不经网页内存（大包不再撑爆内存）。
// 已保存（并已提示）返回 true；不在 App 里、或 App 太旧不支持 saveUrl 返回 false，调用方照原来的 fetch → 下载
async function appSaveUrl(path, filename, headers) {
  if (!inAndroidApp()) return false;
  let r;
  try {
    r = await window.PosApp.call("saveUrl", { url: new URL(path, location.href).href, filename, headers: headers || { Authorization: "Bearer " + store.get("pos_token") } });
  } catch (e) {
    if (/不支持/.test(e.message)) return false;
    throw new Error(`保存失败：${e.message}`);
  }
  savedToast(savedName(r, filename));
  return true;
}
// 「已保存到「下载/Gway」：文件名」：先翻好句子再填文件名，文件名原样显示、不参与翻译
function savedToast(name) {
  const tpl = typeof I18N !== "undefined" ? String(I18N.t("已保存到「下载/Gway」：{0}")).split(/\n/).pop() : "已保存到「下载/Gway」：{0}";
  toast(tpl.replace("{0}", name), "success", 8000);
  document.querySelector("#toasts")?.lastElementChild?.setAttribute("translate", "no");
}
// App 返回的保存位置（Download/Gway/<真实文件名>，同名时自动加 (1)）→ 真实文件名
function savedName(r, fallback) {
  const d = r && typeof r === "object" ? r : { path: r };
  return d.name || String(d.path || fallback || "").split("/").pop() || fallback;
}
if (IS_APP_WINDOW) {
  (function keep() {
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?app=1");
    ws.onclose = () => setTimeout(keep, 1000);
  })();
  // 平板 App 里不注册（B47）：WebView 会弹英文「Leave this page」，平板上也没有「关窗」这回事
  if (!IS_POS_HOST) window.addEventListener("beforeunload", (e) => {
    if (window.__posReloading) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

// ---------- 全屏（手机、平板用 IP 打开收银系统页面时） ----------
// 手机 / 平板浏览器的地址栏、工具栏会挡住一部分页面：给一个「全屏」按钮（Fullscreen API，老的 Safari / 安卓浏览器用 webkit 前缀）。
// iPhone 的 Safari 不支持网页全屏 → 提示「添加到主屏幕」，以后从主屏幕图标打开就没有地址栏（页面有 apple-mobile-web-app-capable 和 manifest）。
// 不显示按钮：收银台本机（localhost；exe 的收银窗口 ?app=1 用 mount 的 always 照样显示，店主 10-25）、我们自己的安卓 App、已经从主屏幕打开的、
// 没有触摸屏的电脑浏览器（按 F11 就行）。
const PosFullscreen = (() => {
  const d = document, root = d.documentElement;
  const ua = navigator.userAgent || "";
  const reqFn = root.requestFullscreen || root.webkitRequestFullscreen || root.webkitRequestFullScreen || null;
  const exitFn = d.exitFullscreen || d.webkitExitFullscreen || d.webkitCancelFullScreen || null;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIPhone = /iPhone|iPod/.test(ua);
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? true;
  // iPhone 的 Safari 里有 webkitRequestFullscreen 但只对视频有效，当作不支持
  const supported = () => Boolean(reqFn) && enabled !== false && !isIPhone;
  const isOn = () => Boolean(d.fullscreenElement || d.webkitFullscreenElement || d.webkitCurrentFullScreenElement);
  const mm = (q) => { try { return window.matchMedia(q).matches; } catch { return false; } };
  // 浏览器自己的全屏（按了 F11）：网页的 JS 退不出来，只能按 F11
  const browserFs = () => !isOn() && (mm("(display-mode: fullscreen)") ||
    (!touch() && screen.height > 0 && window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1));
  const standalone = () => navigator.standalone === true || mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)");
  const local = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const touch = () => (navigator.maxTouchPoints || 0) > 0 || mm("(pointer: coarse)");
  const ownApp = () => /RestaurantPOSApp/.test(ua) || Boolean(window.PosApp || window.PosBridge);
  // 这台设备要不要显示「全屏」按钮
  const wanted = () => !local() && !(typeof IS_APP_WINDOW !== "undefined" && IS_APP_WINDOW) && !ownApp() && !standalone() && touch();

  function request() {
    if (!supported() || isOn()) return Promise.resolve(isOn());
    try {
      const r = reqFn.call(root, { navigationUI: "hide" });
      return r && typeof r.then === "function" ? r.then(() => true, () => false) : Promise.resolve(true);
    } catch { return Promise.resolve(false); }
  }
  function exit() {
    if (!exitFn || !isOn()) return Promise.resolve();
    try { const r = exitFn.call(d); return r && r.then ? r.catch(() => {}) : Promise.resolve(); } catch { return Promise.resolve(); }
  }
  // 「添加到主屏幕」的说明（iPhone，或者浏览器不让网页全屏）
  function homeScreenTip() {
    const body = isIOS
      ? `<p>iPhone / iPad 的 Safari 浏览器不支持网页全屏。</p>
         <ol style="line-height:1.8;padding-left:20px;margin:0 0 8px"><li>点浏览器底部（iPad 在顶部）的「分享」按钮 <b>⬆︎</b></li><li>往下找，点「添加到主屏幕」</li><li>以后从主屏幕上的图标打开，就没有地址栏，整个屏幕都是收银系统</li></ol>`
      : `<p>这个浏览器不让网页全屏。</p>
         <ol style="line-height:1.8;padding-left:20px;margin:0 0 8px"><li>点浏览器右上角的菜单「⋮」</li><li>选「添加到主屏幕」或「安装应用」</li><li>以后从主屏幕上的图标打开，就是整屏显示</li></ol>`;
    openModal({ title: "全屏显示", body, buttons: [{ label: "知道了", kind: "primary" }] });
  }
  async function toggle() {
    if (isOn()) return exit();
    if (browserFs()) return toast("按 F11 退出全屏", "info", 4000);
    if (!supported()) return homeScreenTip();
    if (!(await request())) homeScreenTip();
  }
  const listeners = new Set();
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) d.addEventListener(ev, () => listeners.forEach((fn) => { try { fn(isOn()); } catch {} }));
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // 放一个「全屏」按钮：slot = 放按钮的元素（不传 = 右下角浮动的小按钮）；返回按钮（这台设备不需要时返回 null）
  // icon = 只放线条图标（收银台顶栏，和静音按钮一样）；always = 收银电脑本机也显示（店主 10-25：本机窗口也要能全屏，挡掉任务栏和标题栏）
  const ICON_ON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_OFF = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  function mount(slot, { className = "btn small", icon = false, always = false } = {}) {
    if (!wanted() && !(always && supported() && !ownApp())) return null;
    const b = d.createElement("button");
    b.type = "button";
    b.className = `${className} fs-btn${icon ? " fs-icon" : ""}${slot ? "" : " fs-float"}`;
    b.dataset.fs = "1";
    const label = () => {
      const on = isOn() || browserFs();
      b.innerHTML = icon ? (on ? ICON_OFF : ICON_ON) : on ? `⤡<span class="fs-txt">退出全屏</span>` : `⛶<span class="fs-txt">全屏</span>`;
      b.title = on ? "退出全屏" : icon ? "全屏显示" : supported() ? "全屏显示（隐藏浏览器的地址栏）" : "全屏显示：添加到主屏幕";
      if (icon) b.setAttribute("aria-label", b.title);
    };
    label();
    const off = onChange(() => (b.isConnected ? label() : off())); // 页面重画后旧按钮没了：不再跟着更新
    // 浏览器全屏（F11）开关不发 fullscreenchange，只改窗口大小
    const onResize = () => (b.isConnected ? label() : removeEventListener("resize", onResize));
    addEventListener("resize", onResize);
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
    (slot || d.body).appendChild(b);
    return b;
  }
  return { supported, isOn, browserFs, request, exit, toggle, onChange, mount, wanted, homeScreenTip, isIOS };
})();
window.PosFullscreen = PosFullscreen;

// 手机浏览器的 100vh 比真正看得见的高度高（不算地址栏 / 工具栏），页面底部会被挡住：
// 把看得见的高度写到 --app-vh（CSS 里 height: var(--app-vh, 100vh)；支持 dvh 的浏览器直接用 100dvh）。
// 用 innerHeight 不用 visualViewport：弹出输入法时不跟着缩，页面不会跳
(function trackViewport() {
  const set = () => { try { document.documentElement.style.setProperty("--app-vh", window.innerHeight + "px"); } catch {} };
  set();
  window.addEventListener("resize", set);
  window.addEventListener("orientationchange", () => setTimeout(set, 300));
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => setTimeout(set, 100));
})();

// 口味备注的拆分 / 拼接（收银台 openNoteModal、顾客点餐页 openNoteSheet 共用，店主 10-11：两边以前各写一套，规则不一样出过错）
//   菜品备注：按「，,、；;」拆，不按空格拆（法语「sans oignon」是一句）；整单备注：句子之间用「；」，系统写的句子（取餐：… / 送达：… /【外送 …】）原样保留
const NoteText = {
  SYS_RE: /^(【[^】]*】|(取餐|送达)：)/,
  parse(current, presets = [], { order = false } = {}) {
    const cur = current || "";
    const sys = [], chosen = new Set(), customParts = [];
    if (order) {
      for (const seg of cur.split("；").map((x) => x.trim()).filter(Boolean)) {
        if (NoteText.SYS_RE.test(seg)) { sys.push(seg); continue; }
        const pieces = seg.split(/[，,、]/).map((x) => x.trim()).filter(Boolean);
        if (pieces.length && pieces.every((x) => presets.includes(x))) pieces.forEach((x) => chosen.add(x));
        else customParts.push(seg);
      }
      return { sys, chosen, custom: customParts.join("；") };
    }
    const pieces = cur.split(/[，,、；;]+/).map((x) => x.trim()).filter(Boolean);
    pieces.filter((x) => presets.includes(x)).forEach((x) => chosen.add(x));
    return { sys, chosen, custom: pieces.filter((x) => !presets.includes(x)).join("，") };
  },
  compose({ sys = [], presets = [], chosen, text = "", order = false, maxLen = 30 }) {
    const pre = presets.filter((p) => chosen.has(p));
    if (!order) return [...pre, text.trim()].filter(Boolean).join("，").slice(0, maxLen);
    return [...sys, pre.join("，"), ...text.split(/[；;]/).map((x) => x.trim())].filter(Boolean).join("；");
  },
};
if (typeof module !== "undefined") module.exports = { NoteText };
