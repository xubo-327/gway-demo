// 静态版：每个真实收银页面（s/<店>/order.html 等）最先加载这一个脚本。做三件事：
// 1. 每个框的界面语言分开存（和服务器版 web/inject.js 一样：localStorage「pos_lang」按框名 demo-cust / demo-pos / demo-kds 分开）
// 2. 收银系统用 WebSocket（/ws）推送「什么变了」；静态版没有服务器，换成一个假的 WebSocket：
//    收 Service Worker（假服务器）用 BroadcastChannel 发来的消息，同一浏览器里的顾客手机、收银台、后厨就能联动
// 3. 演示框里不弹系统对话框
(function () {
  var m = /\/s\/([a-z]+)\//.exec(location.pathname);
  var shop = m ? m[1] : "resto";
  var name = String(window.name || "");
  if (name.indexOf("demo-") === 0) {
    var role = name.slice(5);
    var KEY = "pos_lang", NS = "pos_lang::" + role;
    var P = Storage.prototype, g = P.getItem, s = P.setItem, r = P.removeItem;
    var map = function (st, k) { return st === window.localStorage && k === KEY ? NS : k; };
    P.getItem = function (k) { return g.call(this, map(this, k)); };
    P.setItem = function (k, v) { return s.call(this, map(this, k), v); };
    P.removeItem = function (k) { return r.call(this, map(this, k)); };
    var lm = /[?&]_demo_lang=([a-z]{2})/.exec(location.search), mm = /[?&]_demo_mode=(dual|single)/.exec(location.search);
    if (lm) try { s.call(window.localStorage, NS, JSON.stringify({ lang: lm[1], mode: mm ? mm[1] : "single" })); } catch (e) {}
    try { window.alert = function (t) { console.log("[alert]", t); }; } catch (e) {}
    document.documentElement.classList.add("in-demo");
  }
  // 静态版直接进入演示：登录令牌是假的（假服务器认任何令牌）
  try { if (!localStorage.getItem("pos_token")) localStorage.setItem("pos_token", "demo-token"); } catch (e) {}

  function FakeWS(url) {
    var self = this;
    this.url = String(url);
    this.readyState = 0;
    this.protocol = ""; this.extensions = ""; this.bufferedAmount = 0; this.binaryType = "blob";
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this._l = {};
    var agent = /[?&](agent|display)=/.test(this.url); // 打印代理 / 副屏：静态版没有，连上不发消息
    setTimeout(function () {
      if (self.readyState !== 0) return;
      self.readyState = 1;
      self._fire("open", {});
      if (agent) return;
      try {
        self._bc = new BroadcastChannel("gway-demo-" + shop);
        self._bc.onmessage = function (e) { if (self.readyState === 1) self._fire("message", { data: JSON.stringify(e.data) }); };
      } catch (e) {}
    }, 30);
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  FakeWS.prototype = {
    CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
    send: function () {}, // 共享购物车订阅、打印结果等：静态版不用
    close: function () {
      if (this.readyState === 3) return;
      this.readyState = 3;
      try { this._bc && this._bc.close(); } catch (e) {}
      // 不触发 onclose：页面收到 onclose 会一直重连
    },
    addEventListener: function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener: function (t, fn) { this._l[t] = (this._l[t] || []).filter(function (f) { return f !== fn; }); },
    _fire: function (t, ev) {
      ev.type = t; ev.target = this;
      try { if (typeof this["on" + t] === "function") this["on" + t](ev); } catch (e) { console.error(e); }
      (this._l[t] || []).forEach(function (fn) { try { fn(ev); } catch (e) { console.error(e); } });
    },
  };
  window.WebSocket = FakeWS;

  // 假服务器的错误回答带 X-Demo-Status（见 sw.js）：换回真正的状态码
  var of = window.fetch;
  if (of) window.fetch = function () {
    return of.apply(this, arguments).then(function (res) {
      var st = res.headers.get("X-Demo-Status");
      if (!st) return res;
      return res.text().then(function (t) { return new Response(t, { status: Number(st), headers: { "Content-Type": "application/json; charset=utf-8" } }); });
    });
  };
})();
