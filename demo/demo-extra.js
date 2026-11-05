// 演示外壳：点餐情况（一键造数据）+ 自动演示（一步一步在真实页面上点，配大白话说明）
(function () {
  "use strict";
  var D = window.Demo;
  var $ = D.$;
  var TX = {
    fr: {
      sc_idle: ["Calme", "Tout est libre, prêt pour le service"],
      sc_rush: ["Coup de feu", "Salle pleine, la cuisine enchaîne les commandes"],
      sc_scanning: ["Un client commande", "Il est en train de remplir son panier"],
      sc_online: ["Commande en ligne", "Une commande à emporter arrive par le lien"],
      sc_paid_wait: ["Payée, à retirer", "Commande payée et prête, le client est prévenu"],
      sc_closed: ["Fermé", "Le lien en ligne affiche « fermé »"],
      cap_idle: "Calme : toutes les tables sont libres. Scannez, commandez : tout arrive en direct.",
      cap_rush: "Coup de feu : tables occupées, commandes en cuisine, additions en attente. Le client de la table 5 peut encore commander.",
      cap_rush_tea: "Coup de feu : une file de commandes payées en préparation, deux sont déjà prêtes.",
      cap_rush_market: "Journée chargée : ventes à la caisse et commandes en ligne à préparer.",
      cap_scanning: "Un client vient de scanner le QR code : il ajoute des articles à son panier.",
      cap_online: "Une commande arrive par le lien en ligne : la caisse sonne et doit l'accepter.",
      cap_paid_wait: "Commande payée et préparée : le téléphone du client affiche qu'elle est prête.",
      cap_closed: "Hors des heures d'ouverture : le lien en ligne affiche que c'est fermé, sans perdre le menu.",
      a1: "Le client scanne le QR code du comptoir avec son téléphone. Pas d'application à installer.",
      a2: "Il choisit dans sa langue, avec photos, options et allergènes.",
      a3: "Il envoie sa commande.",
      a4: "La caisse sonne : la nouvelle commande apparaît tout de suite.",
      a5: "Le client paie au comptoir (carte, espèces ou ticket resto) : la commande part aussitôt en cuisine.",
      a5r: "Le client paie à la caisse : le ticket s'imprime.",
      a6: "La cuisine a terminé : un appui sur l'écran, le client est prévenu.",
      a6r: "La commande est préparée : le client est prévenu.",
      a7: "Le téléphone du client affiche : commande prête !",
      a9: "Terminé. Tout ce que vous avez vu est le vrai logiciel.",
      step: "Étape",
    },
    zh: {
      sc_idle: ["空闲", "桌台都空着，随时开门营业"],
      sc_rush: ["高峰满座", "满座，后厨一单接一单"],
      sc_scanning: ["有人正在扫码点单", "顾客正在往购物车里加菜"],
      sc_online: ["网上外带单进来", "网上点单链接来了一张外带单"],
      sc_paid_wait: ["已付款等取餐", "付好款、做好了，顾客手机上收到通知"],
      sc_closed: ["打烊", "网上点单链接显示已打烊"],
      cap_idle: "空闲：桌台都空着。扫码、点菜，单子实时到收银台和后厨。",
      cap_rush: "高峰满座：桌台都有人，后厨在出菜，有桌等结账。5 号桌的顾客还能继续扫码加菜。",
      cap_rush_tea: "高峰：一排已付款的单在做，有两单已经做好。",
      cap_rush_market: "忙碌的一天：收银台连续卖货，还有网上订单要备货。",
      cap_scanning: "顾客刚扫了二维码，正在往购物车里加东西。",
      cap_online: "网上点单链接来了一张单：收银台响铃，等店里接单。",
      cap_paid_wait: "付好款、做好了：顾客手机上显示可以取餐。",
      cap_closed: "不在营业时间：网上点单链接显示已打烊，菜单照样能看。",
      a1: "顾客用手机扫前台的二维码，不用装任何 App。",
      a2: "用自己的语言选菜：有图片、规格、过敏原。",
      a3: "顾客下单。",
      a4: "收银台响了：新单马上出现。",
      a5: "顾客在前台付款（刷卡、现金、餐券都行）：付完单子马上到后厨。",
      a5r: "顾客在收银台付款：小票打出来。",
      a6: "后厨做好了：在屏上点一下，顾客马上收到通知。",
      a6r: "货备好了：顾客马上收到通知。",
      a7: "顾客手机上显示：可以取餐了！",
      a9: "演示结束。刚才看到的都是真实软件在跑。",
      step: "第",
    },
  };
  var tx = function (k) { return (TX[D.prefs.ui] || TX.fr)[k]; };
  var ICON = {
    idle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    rush: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    scanning: '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>',
    online: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    paid_wait: '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    closed: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  };
  var current = null;
  var capKey = null; // 当前说明是哪一句（切语言时按新语言重新显示）
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function caption(step, text, stop) {
    $("#caption").hidden = !text;
    $("#capStep").hidden = !step;
    $("#capStep").textContent = step || "";
    $("#capText").textContent = text || "";
    $("#capStop").hidden = !stop;
  }
  function focusDev(which) {
    ["Cust", "Pos", "Kds"].forEach(function (k) {
      var el = $("#dev" + k);
      el.classList.toggle("focus", which === k);
      el.classList.toggle("dim", Boolean(which) && which !== k);
    });
  }
  function frame(role) { var f = document.querySelector('iframe[name="demo-' + role + '"]'); return f && f.contentWindow; }
  function doc(role) { try { return frame(role).document; } catch (e) { return null; } }
  function waitFor(fn, ms) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function loop() {
        var v; try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > (ms || 15000)) return resolve(null);
        setTimeout(loop, 200);
      })();
    });
  }
  var call = function (method, url, body) { return D.api("call", { method: method, url: url, body: body }); };
  function retail() { var s = D.state; return s && (s.store_type === "market" || s.store_type === "store"); }

  // ---------- 点餐情况 ----------
  function runScenario(name, quiet) {
    D.busy(true);
    current = name;
    return D.api("scenario", { name: name }).then(function (r) {
      D.setOverride(r.phone || null);
      return D.refreshState().then(function () {
        // 等手机框真的换成新页面再自动加菜（不然会点到还没换掉的旧页面上；静态版造数据很快，更容易碰到）
        var custLoaded = new Promise(function (res) { document.getElementById("fCust").addEventListener("load", res, { once: true }); });
        D.loadAll();
        if (!quiet) {
          var k = "cap_" + name + (name === "rush" && D.state.store !== "resto" ? "_" + D.state.store : "");
          capKey = { key: tx(k) ? k : "cap_" + name };
          caption("", tx(capKey.key), false);
        }
        if (r.phone && r.phone.drive === "cart") return custLoaded.then(function () { return fillCart(3); });
      });
    }).catch(function (e) { D.toast(e.message); }).then(function () { D.busy(false); });
  }

  // 只滚手机框里面（scrollIntoView 会把外壳页面也一起滚走）
  function reveal(d, el) {
    var w = d.defaultView, r = el.getBoundingClientRect();
    w.scrollTo({ top: w.scrollY + r.top - w.innerHeight / 2, behavior: "smooth" });
    window.scrollTo(0, 0);
  }
  // 在顾客手机上真点几样（没规格的点「+」，有规格的打开规格选第二个再「加入」）
  function addOne(d, i) {
    var plus = d.querySelectorAll("[data-inc]");
    var spec = d.querySelectorAll("[data-spec]");
    if (i % 2 === 1 && spec.length || !plus.length) {
      var b = spec[Math.min(i, spec.length - 1)];
      if (!b) return Promise.resolve();
      reveal(d, b);
      b.click();
      return waitFor(function () { return d.querySelector(".opt-overlay [data-add]"); }, 4000).then(function (add) {
        if (!add) return;
        var chips = d.querySelectorAll(".opt-overlay .opt-group:first-child .opt");
        if (chips[1]) chips[1].click();
        return sleep(700).then(function () { var a2 = d.querySelector(".opt-overlay [data-add]"); if (a2) a2.click(); return sleep(500); }).then(function () { var left = d.querySelector(".opt-overlay [data-close]"); if (left) left.click(); });
      });
    }
    var p = plus[Math.min(i, plus.length - 1)];
    reveal(d, p);
    p.click();
    return Promise.resolve();
  }
  function fillCart(n) {
    return waitFor(function () { var d = doc("cust"); return d && d.querySelector("[data-inc],[data-spec]") && d; }, 15000).then(function (d) {
      if (!d) return;
      var i = 0;
      return (function next() {
        if (i >= n) return;
        return sleep(900).then(function () { return addOne(d, i++); }).then(next);
      })();
    });
  }

  // ---------- 自动演示 ----------
  var running = false, stopFlag = false;
  function guard() { if (stopFlag) throw new Error("stopped"); }
  function say(n, total, key) { capKey = { n: n, total: total, key: key }; caption(tx("step") + " " + n + "/" + total, tx(key), true); }
  async function auto() {
    if (running) return;
    running = true; stopFlag = false;
    var r = retail(), total = 7;
    $("#autoBtn").disabled = true;
    try {
      await runScenario("idle", true);
      D.setOverride({ entry: "takeaway" });
      var loaded = new Promise(function (res) { document.getElementById("fCust").addEventListener("load", res, { once: true }); });
      D.renderPanel(); D.loadCust();
      await loaded;
      // 1 扫码
      focusDev("Cust"); say(1, total, "a1");
      var d = await waitFor(function () { var x = doc("cust"); return x && x.querySelector("[data-inc],[data-spec]") && x; }, 20000);
      if (!d) throw new Error("menu not loaded");
      await sleep(3200); guard();
      // 2 选菜
      say(2, total, "a2");
      for (var i = 0; i < 3; i++) { await addOne(d, i); await sleep(1300); guard(); }
      await sleep(800);
      // 3 下单
      say(3, total, "a3");
      d.querySelector("#go") && d.querySelector("#go").click();
      await sleep(1600); guard();
      var togo = d.querySelector('[data-dine="togo"]'); if (togo) { togo.click(); await sleep(700); }
      var alg = d.querySelector("#algOk"); if (alg) { alg.click(); await sleep(300); }
      var sub = await waitFor(function () { var b = d.querySelector("#submit"); return b && !b.disabled && b; }, 5000);
      if (sub) sub.click();
      await waitFor(function () { return d.querySelector(".voucher"); }, 8000);
      await sleep(2600); guard();
      // 4 收银台响
      focusDev("Pos"); say(4, total, "a4");
      var pd = doc("pos");
      var tab = pd && (pd.querySelector('#nav [data-tab="takeaway"]:not(.nav-off)') || pd.querySelector('#nav [data-tab="orders"]'));
      if (tab) tab.click();
      var list = await call("GET", "/api/takeaway");
      var o = (list || []).filter(function (x) { return x.status === "open"; }).pop();
      if (!o) throw new Error("order not found");
      await sleep(3200); guard();
      // 5 付款：外带单付完款才进后厨（收银系统的规则）；超市：付款后打小票
      focusDev("Pos"); say(5, total, r ? "a5r" : "a5");
      var full = await call("GET", "/api/orders/" + o.id);
      await call("POST", "/api/orders/" + o.id + "/checkout", { payments: [{ method: "card", amount_cents: full.total_cents }] });
      await sleep(1600);
      focusDev("Kds");
      await sleep(3200); guard();
      // 6 做好了
      say(6, total, r ? "a6r" : "a6");
      if (!r) {
        var kd = doc("kds");
        var bump = kd && await waitFor(function () { return kd.querySelector('[data-bump="' + o.id + '"]'); }, 4000);
        await sleep(1200);
        if (bump) bump.click(); else await call("POST", "/api/kds/orders/" + o.id + "/bump").catch(function () {});
        await sleep(1800);
      } else { focusDev("Pos"); await sleep(1800); }
      await call("POST", "/api/takeaway/" + o.id + "/ready").catch(function () {});
      await sleep(2000); guard();
      // 7 顾客手机
      focusDev("Cust"); say(7, total, "a7");
      d.defaultView.scrollTo(0, 0);
      await sleep(5000); guard();
      focusDev(null); capKey = { key: "a9" }; caption("", tx("a9"), false);
    } catch (e) {
      if (e.message !== "stopped") D.toast(e.message);
      focusDev(null); caption("", "", false);
    } finally {
      running = false; $("#autoBtn").disabled = false;
    }
  }
  $("#capStop").onclick = function () { stopFlag = true; caption("", "", false); focusDev(null); };

  window.DemoExtra = {
    panel: function () {
      var s = D.state;
      $("#scGroup").hidden = !(s.scenarios && s.scenarios.length);
      $("#autoGroup").hidden = false;
      $("#scenarios").innerHTML = (s.scenarios || []).map(function (k) {
        var x = tx("sc_" + k) || [k, ""];
        return '<button data-sc="' + k + '" class="' + (current === k ? "on" : "") + '">' + (ICON[k] || "") + "<span><b>" + x[0] + "</b><small>" + x[1] + "</small></span></button>";
      }).join("");
      $("#scenarios").onclick = function (ev) {
        var b = ev.target.closest("[data-sc]"); if (!b || running) return;
        runScenario(b.dataset.sc).then(function () { D.renderPanel(); });
      };
      $("#autoBtn").onclick = auto;
    },
    runScenario: runScenario, auto: auto, caption: function (a, b, c) { if (!b) capKey = null; caption(a, b, c); },
    // 外壳切语言时调用：框会整个重新加载，自动演示停下；静态说明换成新语言
    relang: function () {
      if (running) { stopFlag = true; capKey = null; caption("", "", false); focusDev(null); return; }
      if (capKey && !$("#caption").hidden) caption(capKey.n ? tx("step") + " " + capKey.n + "/" + capKey.total : "", tx(capKey.key), Boolean(capKey.n));
    },
  };
})();
