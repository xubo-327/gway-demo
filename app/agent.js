// 服务员手机「Gway 点单」App / 平板「Gway 收银」App 里才会用到：把收银系统的打印任务交给 App 连着的蓝牙打印机。
// App（安卓 / 苹果）提供原生桥：
//   安卓 window.PosBridge.call(method, argsJson, callbackId)
//   苹果 window.webkit.messageHandlers.posBridge.postMessage({ method, args, cbId })
// 原生做完后调用 window.__posBridgeCb(callbackId, { ok, data | error })；打印机状态变化调用 window.__posBridgeEvent({ type: "printer", ... })
// 普通浏览器里打开时什么都不做。
(function () {
  const android = window.PosBridge && typeof window.PosBridge.call === "function";
  const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.posBridge;
  if (!android && !ios) return;
  document.documentElement.classList.add("in-app");

  // ---------- 原生调用 ----------
  const cbs = new Map();
  let seq = 0;
  window.__posBridgeCb = (id, res) => {
    const c = cbs.get(id);
    if (!c) return;
    cbs.delete(id);
    clearTimeout(c.timer);
    const r = typeof res === "string" ? JSON.parse(res) : res;
    r && r.ok ? c.resolve(r.data) : c.reject(new Error((r && r.error) || "操作失败"));
  };
  const TIMEOUT = { scan: 20000, connect: 40000, print: 60000, discover: 30000, saveFile: 60000, saveUrl: 180000, localAgentKey: 3000, disconnect: 40000 };
  function call(method, args = {}) {
    return new Promise((resolve, reject) => {
      const id = "c" + ++seq;
      const timer = setTimeout(() => { cbs.delete(id); reject(new Error("App 没有回应")); }, TIMEOUT[method] || 15000);
      cbs.set(id, { resolve, reject, timer });
      const a = JSON.stringify(args);
      try {
        if (android) window.PosBridge.call(method, a, id);
        else ios.postMessage({ method, args: a, cbId: id });
      } catch (e) { cbs.delete(id); clearTimeout(timer); reject(e); }
    });
  }

  // 安卓 WebView 没有网页语音播报：用手机自带的 TTS 念来单提醒
  if (!("speechSynthesis" in window)) {
    const voice = { name: "手机语音", lang: "zh-CN", default: true, localService: true, voiceURI: "app" };
    window.SpeechSynthesisUtterance = function (text) { this.text = text; this.rate = 1; this.lang = "zh-CN"; this.voice = null; this.volume = 1; };
    window.speechSynthesis = { getVoices: () => [voice], speak: (u) => call("speak", { text: u.text, rate: u.rate, pitch: u.pitch || 1, volume: u.volume ?? 1, lang: u.lang || "" }).catch(() => {}),
      cancel: () => call("speak", { text: "" }).catch(() => {}), addEventListener() {}, removeEventListener() {} };
  }

  if (android) {
    const click0 = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const href = this.href || "";
      if (!this.download || !/^(blob|data):/.test(href)) return click0.call(this);
      const name = this.download, self = this;
      fetch(href).then((r) => r.blob()).then((b) => new Promise((res, rej) => {
        // 旧 App 只能整包转 base64 交给 App（内存要好几倍）：大包先提醒（B64）
        if (b.size > 40 * 1024 * 1024 && typeof toast === "function") toast("数据较大，请更新 App 或用云端备份换平板", "error", 10000);
        const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(b);
      }))
        .then((data) => call("saveFile", { name, data }))
        .then((where) => { const n = String((where && where.name) || (where && where.path) || where || name).split("/").pop(); if (typeof savedToast === "function") savedToast(n); else alert("已保存到「下载/Gway」：" + n); })
        .catch((e) => { if (/不支持/.test(e.message)) click0.call(self); else typeof toast === "function" ? toast(`保存失败：${e.message}`, "error") : alert(e.message); });
    };
  }

  let info = { deviceId: null, platform: "", version: "" };
  let printer = { connected: false, name: null, address: null };
  // 安卓平板版（1.27 起）可以同时连好几台：printer.printers = [{ address, name, connected, kind }]，每台在收银系统里单独登记；
  // 手机 App / 旧版平板只有一台（没有 printers），按设备登记成一台
  const multi = () => Array.isArray(printer.printers);
  const local = () => (multi() ? printer.printers : [{ address: "", name: printer.name, connected: printer.connected }]);
  const registered = {}; // 打印机地址（单台时是 ""）-> { row: 收银系统里登记的打印机, name: 登记时的名字（换了打印机要重新登记改名字） }
  let ws = null;
  const token = () => { try { return typeof store !== "undefined" ? store.get("pos_token") : localStorage.getItem("pos_token"); } catch { return null; } };

  // ---------- 和收银系统的连接：接打印任务 ----------
  // 安全整改 D-12：连上后先发员工登录令牌认证（令牌不放进地址），收银系统确认是店里登录过的设备才会派打印任务；
  // 还没登录就先不连，登录后自动连上
  // 安卓平板版（整改 F1）：App 给本机收银页一个本机打印密钥，带它认证就不用员工登录、登录过期也照样打印；
  // 拿不到（手机 App、旧版 App、副屏）就照原来的登录方式
  let localKey = null, badKey = null, retryTimer = null; // badKey：服务不认的密钥，别再拿它连
  async function loadLocalKey() {
    if (!info.host) return;
    try { const k = await call("localAgentKey"); localKey = typeof k === "string" && /^[0-9a-f]{32,128}$/i.test(k) && k !== badKey ? k : null; } catch { localKey = null; }
  }
  // 平板刚启动时 App 可能 3 秒内没回密钥，先按登录方式连；每 30 秒再问一次，拿到为止，拿到了就断开重连改用密钥（B26）
  function retryLocalKey() {
    if (!info.host || localKey || retryTimer) return;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (localKey) return;
      await loadLocalKey();
      if (!localKey) return retryLocalKey();
      closeWhenIdle();
    }, 30000);
  }
  // 拿到密钥后关掉旧连接重连：有正在打印的任务就等它打完（2 秒后再看），免得打印结果回不去（B53）
  let printing = 0;
  function closeWhenIdle() {
    if (printing > 0) return setTimeout(closeWhenIdle, 2000);
    if (ws && ws.readyState <= 1) try { ws.close(); } catch {}
  }
  function connectWs() {
    if (!info.deviceId) return;
    if (!localKey && !token()) return setTimeout(connectWs, 5000);
    const sock = ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?agent=" + encodeURIComponent(info.deviceId));
    ws.onopen = () => { try { sock.send(JSON.stringify(localKey ? { type: "agent_auth", key: localKey } : { type: "agent_auth", token: token() })); } catch {} };
    ws.onmessage = async (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.type === "agent_ready") return sendStatus();
      if (msg.type !== "agent_print") return;
      // 打印结果用收到这个任务的那条连接回（B53：中途重连过，全局 ws 已经是新连接，服务端在旧连接上等结果）
      printing++;
      try {
        // deadline：收到任务 25 秒后还没轮到真正写打印机就别打了（服务端本机打印 45 秒、手机 30 秒就算失败，晚打出来会重复出单），App 自己判断
        const deadline = Date.now() + 25000;
        await call("print", msg.target ? { data: msg.data, target: msg.target, deadline } : { data: msg.data, deadline });
        try { sock.send(JSON.stringify({ type: "agent_print_result", id: msg.id, ok: true })); } catch {}
      } catch (e) {
        try { sock.send(JSON.stringify({ type: "agent_print_result", id: msg.id, ok: false, error: e.message })); } catch {}
      } finally { printing--; }
    };
    ws.onclose = (e) => {
      // 4401 = 登录失效，等重新登录；用本机密钥时说明收银服务重启换了密钥，重新问 App 要一次；
      // 拿回来还是同一个（服务不认这个密钥）就别再用它，改用登录令牌
      if (e && e.code === 4401 && localKey) { const old = localKey; loadLocalKey().finally(() => { if (localKey === old) { badKey = old; localKey = null; retryLocalKey(); } setTimeout(connectWs, 2000); }); }
      // 平板上用登录令牌被拒（本机打印的编号只认密钥，B7）：先问 App 要密钥再连，没拿到就每 30 秒再问（B26）
      else if (e && e.code === 4401 && info.host) loadLocalKey().finally(() => { if (!localKey) retryLocalKey(); setTimeout(connectWs, localKey ? 2000 : 5000); });
      else setTimeout(connectWs, e && e.code === 4401 ? 5000 : 2000);
    };
  }
  function sendStatus() {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "agent_status", connected: printer.connected, printer: printer.name,
      ...(multi() ? { printers: printer.printers.map((p) => ({ target: p.address, name: p.name, connected: Boolean(p.connected) })) } : {}) }));
  }
  const needsRegister = () => local().some((p) => p.connected && (!registered[p.address] || registered[p.address].name !== p.name));
  // 连上蓝牙打印机后在收银系统里登记（要先登录；没登录就等登录后再试）
  async function register() {
    if (!token()) return;
    for (const p of local()) {
      if (!p.connected || (registered[p.address] && registered[p.address].name === p.name)) continue;
      try {
        const res = await fetch("/api/printers/agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
          body: JSON.stringify({ device_id: info.deviceId, printer_name: p.name, width: printer.width || 32, ...(p.address ? { target: p.address } : {}) }) });
        if (res.ok) registered[p.address] = { row: await res.json(), name: p.name };
      } catch {}
    }
    renderFab();
    renderPanel();
  }
  setInterval(() => { if (needsRegister()) register(); }, 5000);

  window.__posBridgeEvent = (e) => {
    const ev = typeof e === "string" ? JSON.parse(e) : e;
    if (ev.type === "printer") {
      printer = { ...printer, ...ev };
      sendStatus();
      if (needsRegister()) register();
      renderFab();
      renderPanel();
    }
  };

  // ---------- 左下角的打印机按钮 + 管理面板 ----------
  const css = document.createElement("style");
  css.textContent = `
    #posFab { position: fixed; left: 10px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 90; width: 46px; height: 46px; border-radius: 50%; border: 0;
      background: #2b2824; color: #fff; font-size: 20px; box-shadow: 0 3px 12px rgba(0,0,0,.3); }
    #posFab i { position: absolute; right: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #ff453a; border: 2px solid #2b2824; }
    #posFab.on i { background: #34c759; }
    /* 平板竖屏 / 手机（≤820，收银台导航在屏幕底部）：打印机按钮放进底部导航栏最左边、导航让出这块位置，
       不再浮在页面内容上压住「+ 新增菜品」之类的按钮（1.26.4） */
    @media (max-width: 820px) {
      html.pos-fab-nav #posFab { left: 6px; bottom: calc(7px + env(safe-area-inset-bottom)); width: 44px; height: 44px; z-index: 41; box-shadow: none; background: rgba(255,255,255,.14); }
      html.pos-fab-nav #posFab i { border-color: #3a3530; }
      html.pos-fab-nav .nav { padding-left: 56px !important; }
    }
    /* 横屏（>820）按钮浮在左下角：桌台区底部留出按钮的高度，最后一排桌台卡片能滚到按钮上面（整改 T7） */
    @media (min-width: 821px) { html.pos-fab-nav .table-area { padding-bottom: 72px; } }
    #posPanel { position: fixed; inset: 0; z-index: 95; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; }
    #posPanel .box { background: #fff; width: 100%; max-width: 560px; max-height: 88vh; overflow: auto; border-radius: 16px 16px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); font-size: 15px; color: #222; }
    #posPanel h3 { margin: 0 0 8px; font-size: 18px; }
    #posPanel .dev { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eee; }
    #posPanel .dev span { flex: 1; } #posPanel .dev small { display: block; color: #888; }
    #posPanel button { border: 1px solid #ddd; background: #fff; border-radius: 10px; padding: 9px 13px; font-size: 14px; min-height: 44px; }
    #posPanel button.p { background: var(--accent, #c2410c); color: #fff; border-color: var(--accent, #c2410c); }
    #posPanel .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
    #posPanel .muted { color: #888; font-size: 13px; }`;
  document.head.appendChild(css);
  const fab = document.createElement("button");
  fab.id = "posFab";
  fab.title = "本机打印机";
  fab.innerHTML = "🖨<i></i>";
  fab.onclick = () => openPanel();
  // 平板点餐机（顾客用的点餐页）上不显示打印机按钮，免得顾客乱点；打印照样能用
  if (!/order\.html/.test(location.pathname)) {
    document.body.appendChild(fab);
    if (document.querySelector("nav.nav")) document.documentElement.classList.add("pos-fab-nav"); // 收银台：竖屏时放进底部导航栏
  }
  function renderFab() { fab.classList.toggle("on", printer.connected); }

  let panel = null, devices = [], busy = "";
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function openPanel() {
    panel = document.createElement("div");
    panel.id = "posPanel";
    panel.addEventListener("click", onClick);
    document.body.appendChild(panel);
    renderPanel();
    refresh();
  }
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = `<div class="box">
      <h3>🖨 ${info.host ? "本机打印机（蓝牙 / USB）" : "蓝牙打印机"}</h3>
      ${multi() ? (printer.printers.length ? printer.printers.map((p) => `<div class="dev"><span>${p.connected ? "✅" : "⏳"} <b>${esc(p.name || p.address)}</b><small>${p.connected ? "已连接" : "没连上，会自动重连"}${registered[p.address] ? ` · 收银系统里叫「${esc(registered[p.address].row.name)}」` : ""}</small></span>
          ${p.connected ? `<button data-a="test" data-addr="${esc(p.address)}">测试页</button>` : ""}<button data-a="disconnect" data-addr="${esc(p.address)}">断开</button></div>`).join("") : "<p>❌ 没有连接</p>")
        + (busy ? `<p class="muted">${esc(busy)}</p>` : "")
        + `<p class="muted">可以同时连好几台蓝牙打印机，每台在收银系统里是单独一台：到「设置 → 打印 → 打印机 → 出票规则」里把后厨单、结账单等分配给它们。${printer.connected && !Object.keys(registered).length ? "登录收银台后会自动添加到收银系统的打印机列表。" : ""}</p>`
      : `<p>${printer.connected ? `✅ 已连接：<b>${esc(printer.name)}</b>` : "❌ 没有连接"}${busy ? ` · <span class="muted">${esc(busy)}</span>` : ""}</p>
      ${registered[""] ? `<p class="muted">在收银系统里是「${esc(registered[""].row.name)}」：到「设置 → 打印 → 打印机 → 出票规则」里把后厨单、结账单等分配给它。</p>` : printer.connected ? `<p class="muted">登录收银台后会自动添加到收银系统的打印机列表。</p>` : ""}`}
      <div class="row">
        <button data-a="scan">🔍 ${info.host ? "搜索打印机（USB / 蓝牙）" : "搜索附近的打印机"}</button>
        ${printer.connected && !multi() ? `<button data-a="test" data-addr="">打印测试页</button><button data-a="disconnect">断开</button>` : ""}
      </div>
      <div>${devices.map((d) => { const on = local().some((p) => p.connected && (multi() ? p.address === d.address : d.address === printer.address)); return `<div class="dev"><span>${esc(d.name || d.address)}<small>${esc(d.address)} · ${d.type === "usb" ? "USB 线连接" : d.type === "ble" ? "低功耗蓝牙" : "经典蓝牙"}${d.paired ? " · 已配对" : ""}${d.printer ? " · 打印设备" : ""}</small></span>
        <button class="${on ? "" : "p"}" data-a="connect" data-addr="${esc(d.address)}">${on ? "已连接" : multi() && printer.connected ? "再连一台" : "连接"}</button></div>`; }).join("")
        || `<p class="muted">${info.host ? "没有找到打印机：USB 打印机插上线、开机后点「搜索」；蓝牙打印机先在平板「设置 → 蓝牙」里配对。商米 / iMin 自带的打印机会显示成 InnerPrinter 或 USB 打印机。网口 / WiFi 打印机不用在这里连：在「设置 → 打印机」里添加 IP 地址。" : "没有找到打印机：先在手机「设置 → 蓝牙」里和打印机配对，或者点「搜索附近的打印机」（BLE 打印机不用配对）。"}</p>`}</div>
      <p class="muted">${esc(info.platform)} App ${esc(info.version)} · 设备 ${esc((info.deviceId || "").slice(0, 12))}</p>
      <div class="row">${info.host ? `<button data-a="awake">🔋 不让系统省电关掉收银服务</button>` : `<button data-a="server">切换收银电脑 / 平板</button>`}<button data-a="close" style="margin-left:auto">关闭</button></div>
    </div>`;
  }
  async function refresh() {
    try { devices = await call("list"); } catch (e) { busy = e.message; }
    renderPanel();
  }
  async function onClick(e) {
    if (e.target === panel) return close();
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === "close") return close();
      if (a === "scan") { busy = "正在搜索…"; renderPanel(); devices = await call("scan"); busy = ""; }
      if (a === "connect") { busy = "正在连接…"; renderPanel(); await call("connect", { address: b.dataset.addr }); busy = ""; }
      if (a === "disconnect") { await call("disconnect", b.dataset.addr ? { address: b.dataset.addr } : {}); delete registered[b.dataset.addr || ""]; busy = ""; }
      if (a === "test") {
        const key = b.dataset.addr || "";
        if (!registered[key]) await register();
        if (!registered[key]) throw new Error("请先登录收银台");
        const res = await fetch(`/api/printers/${registered[key].row.id}/test-page`, { method: "POST", headers: { Authorization: "Bearer " + token() } });
        busy = res.ok ? "测试页已发送" : "测试打印失败";
      }
      if (a === "server") return call("changeServer");
      if (a === "awake") { await call("keepAwake"); busy = "已打开系统设置：选「不优化 / 允许后台运行」"; }
    } catch (err) { busy = err.message; }
    renderPanel();
  }
  function close() { panel?.remove(); panel = null; }

  // ---------- 启动 ----------
  (async () => {
    // App 刚启动时 info 偶尔被拒 / 没回：2 秒后再试，最多再试 3 次（B55）
    for (let n = 0; ; n++) {
      try { info = await call("info"); break; } catch { if (n >= 3) return; await new Promise((r) => setTimeout(r, 2000)); }
    }
    await loadLocalKey();
    connectWs();
    retryLocalKey();
    try { printer = { ...printer, ...(await call("status")) }; } catch {}
    if (!printer.connected || local().some((p) => !p.connected)) { try { await call("autoconnect"); } catch {} } // 自动连上次用的 / 已配对的打印机
    renderFab();
  })();
  window.PosApp = { call, get printer() { return printer; }, get info() { return info; } };
})();
