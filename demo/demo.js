// 演示外壳（静态版 / GitHub Pages）：左边控制面板，右边并排显示真实页面（顾客手机 order.html、收银台 cashier.html、后厨 kitchen.html）
// 和服务器版 web/demo.js 的区别：没有后台服务器，sw.js 里的假服务器回应接口；三家店用 ?shop= 区分（不换端口）；数据只在这个浏览器里
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- 外壳自己的文字（法 / 中） ----------
  var T = {
    fr: {
      tagline: "Démo interactive — menu électronique & caisse", reset: "Réinitialiser",
      g_store: "Type de commerce", g_look: "Apparence du menu client", look_hint: "Les vrais thèmes du logiciel : le menu change aussitôt.",
      layout: "Présentation", l_menu: "Menu", l_shop: "Boutique",
      g_lang: "Langue", lang_hint: "Change d'un coup tous les écrans : cette page, le téléphone du client, la caisse et la cuisine.",
      g_customer: "Côté client", c_device: "Appareil du client", c_entry: "Le client scanne…",
      d_phone: "Téléphone", d_tablet: "Tablette", d_desktop: "Ordinateur",
      g_staff: "Côté restaurant", s_screens: "Écrans affichés",
      sc_both: "Caisse + cuisine", sc_both_r: "Caisse + ticket", sc_pos: "Caisse", sc_kds: "Cuisine",
      g_situation: "Situation", g_auto: "Démo automatique", auto_hint: "Le parcours complet, étape par étape, avec explications.", auto_go: "Lancer la démo", stop: "Arrêter",
      f_cust: "Téléphone du client", f_pos: "Caisse", f_pos_sub: "à la caisse ou au comptoir", f_kds: "Écran cuisine", f_kds_sub: "les commandes arrivent ici", f_ticket: "Ticket imprimé", f_ticket_sub: "aperçu du dernier ticket (imprimante simulée)",
      loading: "Préparation…", foot: "Démo avec des données fictives. Les écrans sont ceux du vrai logiciel ; les données de démo restent uniquement dans votre navigateur. Recharger la page ou « Réinitialiser » remet tout à zéro.", sw_fail: "Votre navigateur ne permet pas cette démo (Service Worker indisponible, ex. navigation privée). Essayez Chrome, Edge, Firefox ou Safari récent.",
      table: "Table", qr_table: "QR code de la table", takeaway: "QR « à emporter » au comptoir", online: "Lien de commande en ligne",
      sub_table: "a scanné le QR de la table {n}", sub_takeaway: "a scanné le QR du comptoir", sub_online: "commande depuis le lien en ligne",
      st_resto: "Restaurant", st_resto_d: "Tables, QR par table, cuisine", st_tea: "Bubble tea & snack", st_tea_d: "À emporter, numéro de retrait", st_market: "Supérette & bazar", st_market_d: "Codes-barres, pesée, tailles", soon: "bientôt",
      reset_done: "Démo remise à zéro", look_default: "Par défaut",
    },
    zh: {
      tagline: "互动演示 — 电子菜单 + 收银", reset: "重置演示",
      g_store: "店型", g_look: "顾客菜单观感", look_hint: "软件里真实的主题风格，点一下菜单马上换。",
      layout: "样式", l_menu: "点餐版", l_shop: "电商版",
      g_lang: "语言", lang_hint: "一键切换所有画面：本页、顾客手机、收银台和后厨。",
      g_customer: "顾客这边", c_device: "顾客用的设备", c_entry: "顾客扫的是…",
      d_phone: "手机", d_tablet: "平板", d_desktop: "电脑",
      g_staff: "店里这边", s_screens: "显示哪些屏",
      sc_both: "收银台 + 后厨", sc_both_r: "收银台 + 小票", sc_pos: "只看收银台", sc_kds: "只看后厨",
      g_situation: "点餐情况", g_auto: "自动演示", auto_hint: "自动走一遍完整流程，每一步都有说明。", auto_go: "开始自动演示", stop: "停止",
      f_cust: "顾客手机", f_pos: "收银台", f_pos_sub: "前台收银 / 吧台", f_kds: "后厨屏", f_kds_sub: "单子到这里", f_ticket: "打出来的小票", f_ticket_sub: "最新一张小票预览（模拟打印机）",
      loading: "准备中…", foot: "演示数据都是虚构的。画面是真实软件的界面；演示数据只保存在你的浏览器里，刷新页面或点「重置演示」就全部恢复。", sw_fail: "你的浏览器不支持这个演示（没有 Service Worker，比如无痕模式）。请用新版 Chrome、Edge、Firefox 或 Safari 打开。",
      table: "桌", qr_table: "桌贴二维码", takeaway: "前台外带二维码", online: "网上点单链接",
      sub_table: "扫了 {n} 号桌的二维码", sub_takeaway: "扫了前台外带码", sub_online: "从网上点单链接下单",
      st_resto: "中餐馆", st_resto_d: "桌台、每桌二维码、后厨", st_tea: "奶茶快餐", st_tea_d: "外带、取餐号", st_market: "超市百货", st_market_d: "条码、称重、尺码颜色", soon: "即将推出",
      reset_done: "演示已重置", look_default: "默认",
    },
  };
  var THEMES = [
    ["", "Classique", "默认", ["#f4f2ee", "#ffffff"]],
    ["chaleur", "Chaleur", "暖意", ["#f4f2ee", "#ebe7df"]],
    ["galerie", "Galerie", "画廊", ["#ffffff", "#f2f2ef"]],
    ["pop", "Pop", "潮玩", ["#ffffff", "#fde047"]],
    ["atelier", "Atelier", "工坊", ["#e8e6db", "#dcd9cb"]],
    ["module", "Module", "模块", ["#eceef1", "#e1e4e9"]],
    ["marche", "Marché", "市集", ["#f1f1ef", "#facc15"]],
    ["aurore", "Aurore", "极光", ["#f6f6fa", "#e9d5ff"]],
    ["nuit", "Nuit", "夜幕", ["#0f1016", "#181a23"]],
    ["verre", "Verre", "玻璃", ["#eef0f6", "#c7d2fe"]],
    ["affiche", "Affiche", "海报", ["#f3f3f1", "#fda4af"]],
  ];
  var STORES = {
    resto: { ic: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10"/><path d="M16 3c-2 0-3 3-3 6s1 3 3 3v9"/></svg>' },
    tea: { ic: '<svg viewBox="0 0 24 24"><path d="M7 7h10l-1 12.2a2 2 0 0 1-2 1.8H10a2 2 0 0 1-2-1.8z"/><path d="M13.5 7l1.6-3.6"/><path d="M8.5 11h7"/></svg>' },
    market: { ic: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.3 11.4a1 1 0 0 0 1 .8h8.1a1 1 0 0 0 1-.8L20 8H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/></svg>' },
  };
  var ORDER = ["resto", "tea", "market"];
  var DEVICES = { phone: [390, 844], tablet: [820, 1180], desktop: [1280, 820] };
  var BEZEL = { phone: [28, 54], tablet: [32, 32], monitor: [20, 20], browser: [0, 34] };
  var POS_SIZE = [1280, 800], KDS_SIZE = [1100, 720];

  // ---------- 偏好（网址参数优先：换店型时带过去） ----------
  var qs = new URLSearchParams(location.search);
  var SHOP = ORDER.indexOf(qs.get("shop")) >= 0 ? qs.get("shop") : "resto";
  var P = "s/" + SHOP + "/"; // 这家店的页面都在 s/<店>/ 下（由 sw.js 提供）
  // 店主 11-04：只做中文和法语，一个语言按钮切所有画面（外壳、顾客手机、收银台、后厨 / 小票），默认中文
  var prefs = { ui: "zh", dev: "phone", scr: "both", entry: "" };
  try { var old = JSON.parse(localStorage.getItem("demo_prefs") || "{}"); ["ui", "dev", "scr", "entry"].forEach(function (k) { if (old[k] != null) prefs[k] = old[k]; }); } catch (e) {}
  ["ui", "dev", "scr"].forEach(function (k) { if (qs.get(k)) prefs[k] = qs.get(k); });
  if (prefs.ui !== "fr") prefs.ui = "zh";
  if (qs.has("ui") || qs.has("dev") || qs.has("scr")) history.replaceState(null, "", location.pathname + "?shop=" + SHOP);
  var save = function () { try { localStorage.setItem("demo_prefs", JSON.stringify(prefs)); } catch (e) {} };
  var t = function (k) { return (T[prefs.ui] || T.fr)[k] || T.fr[k] || k; };

  var S = null; // /demo/api/state
  var api = function (sub, body) {
    return fetch(P + "demo-api/" + sub, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; });
    });
  };
  function toast(msg) {
    var d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }
  function busy(on) { $("#busy").hidden = !on; }

  // ---------- 语言：每个框分开存（见 inject.js） ----------
  function setFrameLang(role, lang, mode) {
    try { localStorage.setItem("pos_lang::" + role, JSON.stringify({ lang: lang, mode: mode || "single" })); } catch (e) {}
  }
  // 三个框都用外壳选的语言（真实软件自己的 pos_lang 机制，见 inject.js）
  function frameLangs() { ["cust", "pos", "kds"].forEach(function (r) { setFrameLang(r, prefs.ui, "single"); }); }

  // ---------- 顾客框打开什么 ----------
  function entries() {
    var out = [];
    if (S.nav_tables !== false && S.store_type === "restaurant") S.tables.forEach(function (tb) { out.push({ v: "table:" + tb.no, label: t("qr_table") + " · " + t("table") + " " + tb.no }); });
    out.push({ v: "takeaway", label: t("takeaway") });
    if (S.remote) out.push({ v: "online", label: t("online") });
    return out;
  }
  var override = null; // { entry, voucher }：情况 / 自动演示临时指定
  function custUrl() {
    var e = (override && override.entry) || prefs.entry || "";
    var v = override && override.voucher ? "&v=" + encodeURIComponent(override.voucher) : "";
    if (e.indexOf("table:") === 0) {
      var no = e.slice(6), tb = S.tables.filter(function (x) { return String(x.no) === no; })[0];
      if (tb) return { url: P + "order.html?t=" + tb.token + v, sub: t("sub_table").replace("{n}", no) };
    }
    // 网上点单链接 = 收银系统的「外网」：s/<店>/web/order.html（假服务器按外网规则回应：要填姓名电话、打烊页……）
    if (e === "online" && S.remote) return { url: P + "web/order.html?t=" + S.remote.token + v, sub: t("sub_online") };
    return { url: P + "order.html?t=" + S.takeaway_token + v, sub: t("sub_takeaway") };
  }
  function defaultEntry() {
    var list = entries().map(function (x) { return x.v; });
    if (list.indexOf(prefs.entry) >= 0) return prefs.entry;
    return list.indexOf("table:5") >= 0 ? "table:5" : "takeaway";
  }

  // ---------- 渲染面板 ----------
  function seg(id, value, onPick) {
    var el = $(id);
    $$("button", el).forEach(function (b) { b.classList.toggle("on", b.dataset.v === value); });
    el.onclick = function (ev) { var b = ev.target.closest("button[data-v]"); if (b && b.dataset.v !== value) onPick(b.dataset.v); };
  }
  function renderTexts() {
    var retail = S && (S.store_type === "market" || S.store_type === "store");
    document.documentElement.lang = prefs.ui === "zh" ? "zh-CN" : "fr";
    $$("[data-t]").forEach(function (el) { el.textContent = t(el.dataset.t); });
    if (retail) { $("#devKds b").textContent = t("f_ticket"); $("#devKds .sub").textContent = t("f_ticket_sub"); $("#screens [data-v=kds]").textContent = t("f_ticket"); $("#screens [data-v=both]").textContent = t("sc_both_r"); }
    document.title = prefs.ui === "zh" ? "Gway 收银 — 互动演示" : "Gway POS — Démo interactive";
  }
  function renderPanel() {
    renderTexts();
    $("#storeChip").textContent = S.store_name || "";
    var avail = ORDER;
    $("#storeList").innerHTML = ORDER.map(function (k) {
      var ok = avail.indexOf(k) >= 0;
      return '<button class="store-card ' + (k === S.store ? "on" : "") + '" data-store="' + k + '"' + (ok ? "" : " disabled") + '><span class="ic">' + STORES[k].ic + '</span><span><b>' + t("st_" + k) + '</b><small>' + (ok ? t("st_" + k + "_d") : t("soon")) + "</small></span></button>";
    }).join("");
    $("#storeList").onclick = function (ev) {
      var b = ev.target.closest("[data-store]"); if (!b || b.disabled || b.dataset.store === S.store) return;
      var p = new URLSearchParams({ ui: prefs.ui, dev: prefs.dev, scr: prefs.scr });
      p.set("shop", b.dataset.store);
      location.href = "?" + p.toString();
    };
    $("#themes").innerHTML = THEMES.map(function (th) {
      var on = th[0] === S.look.site_theme;
      return '<button class="theme ' + (on ? "on" : "") + '" data-theme="' + th[0] + '"><div class="sw"><i style="background:' + th[3][0] + '"></i><i style="background:' + th[3][1] + '"></i><i class="acc" style="background:var(--accent)"></i></div><span>' + (prefs.ui === "zh" ? th[2] : th[1]) + "</span></button>";
    }).join("");
    $("#themes").onclick = function (ev) {
      var b = ev.target.closest("[data-theme]"); if (!b) return;
      setLook({ site_theme: b.dataset.theme });
    };
    seg("#shopStyle", S.look.shop_style, function (v) { setLook({ shop_style: v }); });
    seg("#uiLang", prefs.ui, setLang);
    seg("#custDevice", prefs.dev, function (v) { prefs.dev = v; save(); renderPanel(); layout(); loadCust(); });
    seg("#screens", prefs.scr, function (v) { prefs.scr = v; save(); renderPanel(); layout(); });
    var sel = $("#custEntry");
    sel.innerHTML = entries().map(function (x) { return '<option value="' + x.v + '">' + x.label + "</option>"; }).join("");
    sel.value = prefs.entry = defaultEntry();
    if (override && override.entry) sel.value = override.entry;
    sel.onchange = function () { prefs.entry = sel.value; override = null; save(); loadCust(); };
    $("#resetBtn").onclick = doReset;
    if (window.DemoExtra) window.DemoExtra.panel();
  }

  // 切语言：外壳文字、三个框（顾客手机 / 收银台 / 后厨）一起换；小票语言用收银系统自己的「顾客小票语言」设置
  function setLang(v) {
    prefs.ui = v === "fr" ? "fr" : "zh"; save();
    if (window.DemoExtra && window.DemoExtra.relang) window.DemoExtra.relang();
    renderPanel(); layout();
    syncTicketLang().then(loadAll, loadAll);
  }
  function syncTicketLang() {
    if (!S || S.look.lang === prefs.ui) return Promise.resolve();
    S.look.lang = prefs.ui;
    return api("look", { lang: prefs.ui }).catch(function (e) { toast(e.message); });
  }

  function setLook(body) {
    Object.assign(S.look, body);
    renderPanel();
    api("look", body).then(loadCust).catch(function (e) { toast(e.message); });
  }

  // ---------- 框 ----------
  function loadCust(url) {
    var u = url ? { url: url, sub: "" } : custUrl();
    frameLangs();
    $("#custSub").textContent = u.sub;
    // 加一个参数让框一定重新加载（同一网址 src 不变时浏览器不刷新）
    var f = $("#fCust");
    var sep = u.url.indexOf("?") >= 0 ? "&" : "?";
    f.src = u.url + sep + "_r=" + Date.now();
  }
  function loadStaff() {
    try { localStorage.setItem("pos_token", S.token); } catch (e) {}
    frameLangs();
    $("#fPos").src = P + "cashier.html?_r=" + Date.now();
    var retail = S.store_type === "market" || S.store_type === "store";
    $("#fKds").src = P + (retail ? "ticket.html?lang=" + prefs.ui + "&" : "kitchen.html?") + "_r=" + Date.now();
    $("#devKds b").textContent = t(retail ? "f_ticket" : "f_kds");
    $("#devKds .sub").textContent = t(retail ? "f_ticket_sub" : "f_kds_sub");
  }
  function loadAll() { loadStaff(); loadCust(); }

  // 按舞台大小缩放三个设备
  function wrap(fig) {
    var bez = $(".bezel", fig);
    if (bez.parentNode.classList.contains("holder")) return bez.parentNode;
    var h = document.createElement("div"); h.className = "holder"; h.style.position = "relative";
    bez.parentNode.insertBefore(h, bez); h.appendChild(bez); bez.style.position = "absolute"; bez.style.left = "0"; bez.style.top = "0";
    return h;
  }
  function sizeDev(fig, kind, w, h, s) {
    var pad = BEZEL[kind], bez = $(".bezel", fig), holder = wrap(fig), f = $("iframe", fig);
    var W = w + pad[0], H = h + pad[1];
    bez.className = "bezel " + kind;
    bez.style.width = W + "px"; bez.style.height = H + "px"; bez.style.transform = "scale(" + s + ")";
    f.style.width = w + "px"; f.style.height = h + "px";
    holder.style.width = Math.round(W * s) + "px"; holder.style.height = Math.round(H * s) + "px";
    fig.style.width = Math.round(W * s) + "px";
  }
  function layout() {
    var box = $("#devices"), W = box.clientWidth, H = box.clientHeight - 34, gap = 24;
    var showPos = prefs.scr !== "kds", showKds = prefs.scr !== "pos";
    $("#devPos").hidden = !showPos; $("#devKds").hidden = !showKds;
    var ck = prefs.dev === "phone" ? "phone" : prefs.dev === "tablet" ? "tablet" : "browser";
    var cs = DEVICES[prefs.dev], cp = BEZEL[ck];
    var right = [];
    if (showPos) right.push(POS_SIZE[0] + BEZEL.tablet[0]);
    if (showKds) right.push(KDS_SIZE[0] + BEZEL.monitor[0]);
    var rightW = right.reduce(function (a, b) { return a + b; }, 0);
    // 顾客设备先按高度放到最大，但给店里的屏至少留 45% 宽度
    var s1 = Math.min(1, H / (cs[1] + cp[1]), (W * (prefs.dev === "phone" ? 0.4 : 0.5)) / (cs[0] + cp[0]));
    var w1 = (cs[0] + cp[0]) * s1;
    var restW = W - w1 - gap * right.length;
    var maxH = Math.max(showPos ? POS_SIZE[1] + BEZEL.tablet[1] : 0, showKds ? KDS_SIZE[1] + BEZEL.monitor[1] : 0);
    // 收银台和后厨：并排或上下，取放得更大的那种
    var sideS = Math.min(restW / rightW, H / maxH);
    var stackW = Math.max.apply(null, right), stackH = (showPos ? POS_SIZE[1] + BEZEL.tablet[1] : 0) + (showKds ? KDS_SIZE[1] + BEZEL.monitor[1] : 0) + (right.length > 1 ? 34 + gap : 0);
    var stackS = Math.min((W - w1 - gap) / stackW, H / stackH);
    var stacked = right.length > 1 && stackS > sideS;
    var s2 = Math.min(1, stacked ? stackS : sideS);
    sizeDev($("#devCust"), ck, cs[0], cs[1], s1);
    sizeDev($("#devPos"), "tablet", POS_SIZE[0], POS_SIZE[1], s2);
    sizeDev($("#devKds"), "monitor", KDS_SIZE[0], KDS_SIZE[1], s2);
    box.classList.toggle("stacked", stacked);
    var col = $("#rightCol");
    if (!col) {
      col = document.createElement("div"); col.id = "rightCol"; col.className = "right-col";
      box.appendChild(col); col.appendChild($("#devPos")); col.appendChild($("#devKds"));
    }
    col.style.display = "flex"; col.style.gap = gap + "px"; col.style.flexDirection = stacked ? "column" : "row"; col.style.alignItems = "flex-start";
  }

  function doReset() {
    busy(true); override = null;
    if (window.DemoExtra) window.DemoExtra.caption("", "", false);
    return api("reset", {}).then(function (r) { S.token = r.token; return refreshState(); }).then(function () { loadAll(); toast(t("reset_done")); })
      .catch(function (e) { toast(e.message); }).then(function () { busy(false); });
  }
  function refreshState() { return api("state").then(function (s) { S = s; renderPanel(); return s; }); }

  // 给 demo-auto.js 等用
  window.Demo = {
    get state() { return S; }, prefs: prefs, t: t, api: api, busy: busy, toast: toast, $: $, $$: $$,
    loadCust: loadCust, setOverride: function (o) { override = o; }, layout: function () { layout(); }, T: T, loadStaff: loadStaff, loadAll: loadAll, refreshState: refreshState, setFrameLang: setFrameLang, renderPanel: renderPanel, syncTicketLang: syncTicketLang,
  };

  // 先装好 Service Worker（假服务器），再打开页面。每次打开 / 刷新都从干净的快照开始
  function swReady() {
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error(t("sw_fail")));
    return navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; }).then(function () {
      if (navigator.serviceWorker.controller) return;
      // 第一次打开：等 Service Worker 接管这个页面（clients.claim）；等不到就刷新一次
      return new Promise(function (resolve) {
        var done = false;
        navigator.serviceWorker.addEventListener("controllerchange", function () { if (!done) { done = true; resolve(); } });
        setTimeout(function () { if (!done) { done = true; if (!sessionStorage.getItem("demo_sw_reload")) { sessionStorage.setItem("demo_sw_reload", "1"); location.reload(); } else resolve(); } }, 4000);
      });
    });
  }
  busy(true);
  renderTexts();
  swReady().then(function () { sessionStorage.removeItem("demo_sw_reload"); return api("reset", { keep_look: false }); })
    .then(function (r) { try { localStorage.setItem("pos_token", r.token); } catch (e) {} return refreshState(); })
    .then(syncTicketLang).then(function () {
      layout(); loadAll(); busy(false);
    }).catch(function (e) { busy(false); toast(e.message); var f = document.querySelector(".foot"); if (f) f.textContent = e.message; });
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
})();
