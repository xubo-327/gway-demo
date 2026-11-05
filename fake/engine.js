// 静态版演示的「假收银服务器」：在浏览器的 Service Worker 里跑，回应真实收银页面发出的 /api/* 请求。
// 数据初始值 = 从服务器版演示抓的真实接口快照（data/<店>/snapshot.json）；订单、结账、后厨、外带、小票在这里按收银系统的规则模拟。
// 只实现演示用得到的接口；别的接口返回友好提示（演示版不提供），页面不会卡住。
// 每家店一个实例；状态（可存进 IndexedDB 的普通对象）在 this.db 里。emit(type, data) = 模拟收银系统的 WebSocket 广播。
(function (root) {
  "use strict";

  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const now = (offsetMin = 0) => fmt(new Date(Date.now() + offsetMin * 60000));
  const today = () => now().slice(0, 10);
  const hex = (n) => { let s = ""; for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)]; return s; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const NA = "演示版不提供这个功能（Démo : fonction non disponible）";

  class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra || {}; } }
  const bad = (m) => new HttpError(400, m);
  const notFound = (m) => new HttpError(404, m || "不存在");

  // 订单 / 菜品行的完整字段（照真实接口的返回，见 tools/snapshot.js 时对照的 /api/orders/:id）
  const ORDER_TPL = { id: 0, table_id: 0, staff_id: null, source: "staff", status: "open", discount_type: null, discount_value: 0, discount_reason: null, discount_by: null, round_off: 0,
    subtotal_cents: 0, discount_cents: 0, round_off_cents: 0, total_cents: 0, closed_by: null, cancel_reason: null, created_at: "", closed_at: null, updated_at: "", order_type: "dine_in",
    pickup_no: null, access_token: null, picked_up_at: null, client_ip: null, shift_id: null, business_date: null, refunded_cents: 0, voided_at: null, note: null, rush_count: 0, tip_cents: 0,
    tip_method: null, remote: 0, contact_name: null, contact_phone: null, pickup_time: null, kitchen_printed_at: null, print_first_at: null, order_cancelled_at: null, pay_mode: null, await_pay: null,
    platform_id: null, platform_ref: null, external_id: null, ready_notified_at: null, gway_cancel_sent: 0, gway_delivery: null, delivery_json: null, extra_cents: 0, kiosk_id: null, client_device: null,
    dine_option: null, receipt_skipped: 0, guests: null, note_cust: null, platform_commission_bp: null, platform_commission_cents: null };
  const ITEM_TPL = { id: 0, order_id: 0, menu_item_id: 0, name_at_order: "", price_cents: 0, qty: 1, status: "active", source: "staff", staff_id: null, cancel_reason: null, cancelled_by: null,
    cancelled_at: null, created_at: "", options_json: "[]", options_text: "", note: null, kds_done_at: null, kds_done_by: null, weight: null, unit_price_cents: null, orig_price_cents: null,
    cost_cents: null, returned_qty: 0, item_code: null, printer_id: null, category_name: null, staff_name: null };

  // 小票文字（中 / 法），宽度按热敏打印机：汉字算 2 格
  const RT = {
    zh: { receipt: "结账单", prebill: "预结单", kitchen: "后厨单", table: "桌", takeaway: "外带", pickup: "取餐号", no: "单号", cashier: "收银", time: "时间", head: ["菜品", "数量", "金额"],
      subtotal: "小计", total: "应收", cash: "现金", card: "刷卡", voucher: "餐券", change: "找零", thanks: "谢谢惠顾，欢迎再次光临", tel: "电话", demo: "演示小票 · 数据虚构", retail: "收银", c: "：" },
    fr: { receipt: "TICKET DE CAISSE", prebill: "ADDITION", kitchen: "BON CUISINE", table: "Table", takeaway: "À emporter", pickup: "Retrait", no: "N°", cashier: "Caisse", time: "Date", head: ["Article", "Qté", "Montant"],
      subtotal: "Sous-total", total: "TOTAL", cash: "Espèces", card: "Carte", voucher: "Titre-resto", change: "Rendu", thanks: "Merci de votre visite, à bientôt !", tel: "Tél.", demo: "Ticket de démo · données fictives", retail: "Vente", c: " : " },
  };
  const cw = (s) => [...String(s)].reduce((n, c) => n + (/[ᄀ-￿]/.test(c) && !/[À-ɏ]/.test(c) ? 2 : 1), 0);
  const padR = (s, w) => s + " ".repeat(Math.max(1, w - cw(s)));
  const padL = (s, w) => " ".repeat(Math.max(0, w - cw(s))) + s;

  class Shop {
    constructor(key, snap, saved, emit, files) {
      this.key = key;
      this.snap = snap;
      this.emit = emit || (() => {});
      this.files = files || {}; // { i18n(lang, scope) → Promise<json>, qr(id) → Promise<string> }
      this.retail = ["market", "store"].includes(snap.settings.store_type);
      // 菜品索引：后台菜单 + 超市商品 + 顾客菜单（规格、分类、出票打印机）
      this.items = new Map();
      const cats = new Map((snap.categories || []).map((c) => [c.id, c]));
      for (const c of (snap.retail_categories || [])) cats.set(c.id, c);
      for (const it of (snap.public_menu.items || [])) this.items.set(it.id, { ...it, full_name: it.variant ? `${it.name} ${it.variant}` : it.name });
      for (const it of (snap.menu_items || [])) this.items.set(it.id, { ...(this.items.get(it.id) || {}), ...it, full_name: it.name });
      for (const it of ((snap.retail_goods && snap.retail_goods.items) || [])) this.items.set(it.id, { ...(this.items.get(it.id) || {}), ...it, full_name: it.full_name || it.name });
      for (const it of this.items.values()) { const c = cats.get(it.category_id); it._cat = c ? c.name : it.category_name || null; it._printer = c ? c.printer_id : it.printer_id || null; }
      this.db = saved && saved.v === 2 ? saved : this.fresh();
    }

    // ---------- 状态 ----------
    fresh(keepLook) {
      const s = clone(this.snap.settings);
      s.shared_cart = false; // 静态版：同桌共享购物车关掉（每台手机自己的购物车，页面照样能点单）
      if (keepLook) Object.assign(s, keepLook);
      return { v: 2, settings: s, orders: [], items: [], payments: [], jobs: [], tables: {}, shift: null, seq: { order: 0, item: 0, pay: 0, job: 0 }, requests: {} };
    }
    reset(keepLook) {
      const look = keepLook ? { site_theme: this.db.settings.site_theme, shop_style: this.db.settings.shop_style, ticket_lang_customer: this.db.settings.ticket_lang_customer } : null;
      this.db = this.fresh(look);
      this.emit("orders", {}); this.emit("takeaway", {}); this.emit("kds", {}); this.emit("settings", {}); this.emit("print", {});
    }
    get S() { return this.db.settings; }
    staff() { return this.snap.me || { id: 1, name: "店长", role: "admin" }; }
    tableRows() { return this.snap.tables; }
    tableById(id) { return this.snap.tables.find((t) => t.id === Number(id)); }
    counter() { return { id: this.snap.takeaway_info.table_id, qr_token: this.snap.takeaway_info.qr_token, table_no: "外带", kind: "takeaway" }; }
    tstate(id) { return this.db.tables[id] || (this.db.tables[id] = { current_order_id: null, status: "idle", last_order_id: null }); }
    order(id) { return this.db.orders.find((o) => o.id === Number(id)); }
    itemsOf(id) { return this.db.items.filter((i) => i.order_id === id); }
    paysOf(id) { return this.db.payments.filter((p) => p.order_id === id); }

    // ---------- 金额 ----------
    totals(o) {
      if (o.status === "closed") return { subtotal_cents: o.subtotal_cents, discount_cents: o.discount_cents, extra_cents: o.extra_cents || 0, round_off_cents: o.round_off_cents, total_cents: o.total_cents };
      const items = this.itemsOf(o.id).filter((i) => i.status === "active");
      const subtotal = items.reduce((s, i) => s + i.price_cents * i.qty, 0);
      let discount = 0;
      if (o.discount_type === "percent") discount = Math.round((subtotal * o.discount_value) / 100);
      else if (o.discount_type === "amount") discount = Math.min(o.discount_value, subtotal);
      const before = subtotal - discount;
      const round = o.round_off ? before % 100 : 0;
      return { subtotal_cents: subtotal, discount_cents: discount, extra_cents: 0, round_off_cents: round, total_cents: before - round };
    }
    tableNo(o) { if (o.order_type !== "dine_in") return "外带"; const t = this.tableById(o.table_id); return t ? t.table_no : ""; }
    full(o) {
      const all = this.itemsOf(o.id);
      const st = this.staff();
      return { ...o, ...this.totals(o), table_no: this.tableNo(o), staff_name: o.staff_id ? st.name : null, closed_by_name: o.closed_by ? st.name : null,
        items: all.filter((i) => i.status === "active"), charges: [], cancelled_items: all.filter((i) => i.status === "cancelled"),
        payments: this.paysOf(o.id).map((p) => ({ ...p, staff_name: st.name })), refunds: [], invoice: null, online: null, platform: null };
    }

    // ---------- 下单 ----------
    buildLines(items, source) {
      if (!Array.isArray(items) || !items.length) throw bad("请至少选择一个菜品");
      return items.map((l) => {
        const it = this.items.get(Number(l && l.menu_item_id));
        if (!it) throw bad("菜品不存在或已下架");
        const qty = Math.max(1, Math.min(99, Math.round(Number(l.qty) || 1)));
        const picked = [];
        const sel = Array.isArray(l.options) ? l.options : [];
        for (const g of (it.options || [])) {
          const mine = sel.filter((s) => s && s.group === g.name);
          let chosen = mine.map((s) => g.choices.find((c) => c.name === s.choice)).filter(Boolean);
          if (!chosen.length && g.required) chosen = [g.choices[0]];
          if (g.type !== "multi") chosen = chosen.slice(0, 1);
          for (const c of chosen) picked.push({ group: g.name, choice: c.name, price_cents: c.price_cents || 0 });
        }
        const weight = l.weight == null || l.weight === "" ? null : Math.round(Number(l.weight) * 1000) / 1000;
        let price = it.price_cents + picked.reduce((s, c) => s + c.price_cents, 0);
        if (weight) price = Math.round(it.price_cents * weight);
        return { it, qty, picked, note: l.note ? String(l.note).slice(0, 30) : null, price, weight, source };
      });
    }
    insertLines(o, lines, at) {
      const out = [];
      for (const l of lines) {
        const row = { ...ITEM_TPL, id: ++this.db.seq.item, order_id: o.id, menu_item_id: l.it.id, name_at_order: l.it.full_name || l.it.name, price_cents: l.price, qty: l.qty,
          source: l.source, staff_id: l.source === "staff" ? this.staff().id : null, created_at: at || now(), options_json: JSON.stringify(l.picked),
          options_text: l.picked.map((c) => c.choice).join(" / "), note: l.note, weight: l.weight, unit_price_cents: l.weight ? l.it.price_cents : null,
          item_code: l.it.code || null, printer_id: l.it._printer, category_name: l.it._cat, staff_name: l.source === "staff" ? this.staff().name : null };
        this.db.items.push(row);
        out.push(row);
      }
      o.updated_at = now();
      return out;
    }
    newOrder(fields) {
      const o = { ...ORDER_TPL, ...fields, id: ++this.db.seq.order, created_at: fields.created_at || now(), updated_at: now() };
      this.db.orders.push(o);
      return o;
    }
    seen(rid) { return rid && this.db.requests[rid] ? this.order(this.db.requests[rid]) : null; }
    addDineIn({ tableId, items, requestId, source = "staff", guests, note, at }) {
      const dup = this.seen(requestId);
      if (dup) return this.full(dup);
      const t = this.tableById(tableId);
      if (!t || t.kind === "takeaway") throw notFound("桌台不存在");
      const lines = this.buildLines(items, source);
      const ts = this.tstate(t.id);
      let o = ts.current_order_id && this.order(ts.current_order_id);
      if (!o || o.status !== "open") {
        o = this.newOrder({ table_id: t.id, source, staff_id: source === "staff" ? this.staff().id : null, guests: guests ? Number(guests) : null, created_at: at });
        ts.current_order_id = o.id; ts.status = "occupied"; ts.opened_at = o.created_at;
      } else if (guests && !o.guests) o.guests = Number(guests);
      if (note) o.note = o.note ? o.note + "；" + note : String(note).slice(0, 60);
      const added = this.insertLines(o, lines, at);
      if (requestId) this.db.requests[requestId] = o.id;
      this.job(o, "kitchen", added);
      this.touch(o);
      return this.full(o);
    }
    nextPickup() { return this.db.orders.filter((o) => o.order_type === "takeaway").reduce((m, o) => Math.max(m, o.pickup_no || 0), 0) + 1; }
    createTakeaway({ items, requestId, note, source = "customer", remote = false, contact = null, dineOption = null, device = null, at }) {
      const dup = this.seen(requestId);
      if (dup) return dup;
      const lines = this.buildLines(items, source);
      let name = null, phone = null, pickup = null;
      if (remote) {
        const c = contact || {};
        name = String(c.name || "").trim() || null; phone = String(c.phone || "").trim() || null;
        if (!name && this.S.remote_need_name !== false) throw bad("请填写姓名");
        if (this.S.remote_need_phone !== false && !/^[+0-9][0-9 .\-]{5,19}$/.test(phone || "")) throw bad("请填写正确的电话号码");
        const t = String(c.pickup_time || "asap");
        if (/^\+\d{1,3}$/.test(t)) pickup = now(Number(t.slice(1))).slice(0, 16);
        else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) pickup = today() + " " + t;
      }
      const o = this.newOrder({ table_id: this.counter().id, order_type: "takeaway", source, staff_id: source === "staff" ? this.staff().id : null, pickup_no: this.nextPickup(), access_token: hex(24),
        remote: remote ? 1 : 0, contact_name: name, contact_phone: phone, pickup_time: pickup, pay_mode: remote ? "store" : null, await_pay: 0, note: note ? String(note).slice(0, 60) : null,
        dine_option: dineOption === "here" || dineOption === "togo" ? dineOption : null, client_device: device ? String(device).slice(0, 40) : null, created_at: at });
      this.insertLines(o, lines, at);
      if (requestId) this.db.requests[requestId] = o.id;
      this.emit("orders", { order_id: o.id });
      this.emit("takeaway", { order_id: o.id, pickup_no: o.pickup_no, event: remote ? "new_remote" : "new", source });
      return o;
    }
    touch(o) {
      this.emit("orders", { order_id: o.id });
      this.emit("kds", { order_id: o.id });
      if (o.order_type === "takeaway") this.emit("takeaway", { order_id: o.id, pickup_no: o.pickup_no, event: "update", source: o.source });
    }

    // ---------- 结账、出餐 ----------
    shiftNow() {
      if (!this.db.shift) this.db.shift = { id: 1, business_date: today(), opened_at: now(), opened_by: 1, opening_cash_cents: 0, auto_opened: 1 };
      return this.db.shift;
    }
    checkout(id, payments, at) {
      const o = this.order(id);
      if (!o) throw notFound("订单不存在");
      if (o.status !== "open") throw bad("这张单已经结过账了");
      const tot = this.totals(o);
      if (!this.itemsOf(o.id).some((i) => i.status === "active")) throw bad("订单没有有效菜品，无法结账");
      if (!Array.isArray(payments) || !payments.length) throw bad("缺少支付明细 payments");
      const paid = payments.reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
      if (paid < tot.total_cents) throw bad("收款金额不够");
      if (paid > tot.total_cents) throw bad("收款金额超过应收");
      const sh = this.shiftNow();
      const t = at || now();
      for (const p of payments) {
        if (!["cash", "card", "voucher"].includes(p.method)) throw bad("支付方式必须是 cash、card 或 voucher");
        this.db.payments.push({ id: ++this.db.seq.pay, order_id: o.id, staff_id: 1, method: p.method, amount_cents: Number(p.amount_cents), received_cents: p.method === "cash" && p.received_cents != null ? Number(p.received_cents) : null,
          paid_at: t, shift_id: sh.id, business_date: sh.business_date, voucher_type: p.voucher_type || null, via_terminal: null });
      }
      Object.assign(o, tot, { status: "closed", closed_at: t, closed_by: 1, shift_id: sh.id, business_date: sh.business_date, updated_at: t });
      if (o.order_type === "dine_in") { const ts = this.tstate(o.table_id); ts.current_order_id = null; ts.status = "idle"; ts.last_order_id = o.id; ts.opened_at = null; }
      if (o.order_type === "takeaway" && !o.kitchen_printed_at) this.job(o, "kitchen", this.itemsOf(o.id).filter((i) => i.status === "active"));
      this.job(o, "receipt");
      this.touch(o);
      this.emit("shift", {});
      if (o.order_type === "takeaway") this.emit("takeaway", { order_id: o.id, pickup_no: o.pickup_no, event: "paid", source: o.source });
      return this.full(o);
    }
    bump(id) {
      const o = this.order(id);
      if (!o) throw notFound("这张单不存在");
      const t = now();
      let n = 0;
      for (const i of this.itemsOf(o.id)) if (i.status === "active" && !i.kds_done_at) { i.kds_done_at = t; i.kds_done_by = 1; n++; }
      if (!n) throw bad("这一单已经都做好了");
      this.touch(o);
      return { ok: true, items: n };
    }
    recall(id) {
      const o = this.order(id);
      if (!o) throw notFound("这张单不存在");
      let n = 0;
      for (const i of this.itemsOf(o.id)) if (i.kds_done_at) { i.kds_done_at = null; i.kds_done_by = null; n++; }
      this.touch(o);
      return { ok: true, items: n };
    }
    markReady(id) {
      const o = this.order(id);
      if (!o || o.order_type !== "takeaway") throw notFound("外带单不存在");
      if (o.status !== "closed" || o.picked_up_at) throw bad("只有已付款、还没取餐的外带单可以通知取餐");
      o.ready_notified_at = now();
      this.emit("orders", { order_id: o.id });
      this.emit("takeaway", { order_id: o.id, pickup_no: o.pickup_no, event: "ready", source: o.source });
      return this.full(o);
    }
    pickup(id) {
      const o = this.order(id);
      if (!o || o.order_type !== "takeaway") throw notFound("外带单不存在");
      if (o.status !== "closed") throw bad("还没付款，不能标记取餐");
      o.picked_up_at = now();
      this.emit("orders", { order_id: o.id });
      this.emit("takeaway", { order_id: o.id, pickup_no: o.pickup_no, event: "picked_up", source: o.source });
      return this.full(o);
    }
    accept(id) {
      const o = this.order(id);
      if (!o || o.order_type !== "takeaway") throw notFound("外带单不存在");
      if (o.status !== "open") throw bad("这张单已经处理过了");
      if (!o.kitchen_printed_at) { o.kitchen_printed_at = now(); this.job(o, "kitchen", this.itemsOf(o.id).filter((i) => i.status === "active")); }
      this.touch(o);
      return this.full(o);
    }
    printFirst(id) {
      const o = this.order(id);
      if (!o || o.order_type !== "takeaway") throw notFound("外带单不存在");
      if (o.status !== "open") throw bad("这张单已经结过账了");
      if (!o.kitchen_printed_at) { o.kitchen_printed_at = now(); o.print_first_at = o.kitchen_printed_at; this.job(o, "kitchen", this.itemsOf(o.id).filter((i) => i.status === "active")); }
      this.touch(o);
      return { ...this.decorate(this.full(o)), printer_problems: [] };
    }
    cancelTakeaway(id, reason) {
      const o = this.order(id);
      if (!o) throw notFound("订单不存在");
      if (o.status !== "open") throw bad("只能作废还没付款的单");
      Object.assign(o, { status: "cancelled", cancel_reason: reason ? String(reason).slice(0, 40) : "作废", order_cancelled_at: now(), updated_at: now() });
      if (o.order_type === "dine_in") { const ts = this.tstate(o.table_id); ts.current_order_id = null; ts.status = "idle"; }
      this.touch(o);
      return this.full(o);
    }
    prebill(id) {
      const o = this.order(id);
      if (!o || o.status !== "open") throw bad("订单不存在或已结账");
      if (o.order_type === "dine_in") this.tstate(o.table_id).status = "billing";
      this.job(o, "prebill");
      this.emit("orders", { order_id: o.id });
      return this.full(o);
    }
    cancelItem(orderId, itemId, qty, reason) {
      const o = this.order(orderId);
      const it = this.db.items.find((i) => i.id === Number(itemId) && i.order_id === Number(orderId));
      if (!o || !it || o.status !== "open") throw bad("只能退还没结账的菜");
      const n = qty ? Math.min(Number(qty), it.qty) : it.qty;
      if (n < it.qty) {
        it.qty -= n;
        this.db.items.push({ ...it, id: ++this.db.seq.item, qty: n, status: "cancelled", cancelled_at: now(), cancelled_by: 1, cancel_reason: reason || null });
      } else Object.assign(it, { status: "cancelled", cancelled_at: now(), cancelled_by: 1, cancel_reason: reason || null });
      this.touch(o);
      return this.full(o);
    }
    retailSale({ lines, payments, at }) {
      const built = (lines || []).map((l) => ({ menu_item_id: l.item_id, qty: l.weight ? 1 : l.qty, weight: l.weight }));
      const o = this.newOrder({ table_id: this.counter().id, order_type: "retail", source: "staff", staff_id: 1, created_at: at });
      this.insertLines(o, this.buildLines(built, "staff"), at);
      return this.checkout(o.id, payments || [{ method: "card", amount_cents: this.totals(o).total_cents }], at);
    }
    quote(lines) {
      const built = this.buildLines((lines || []).map((l) => ({ menu_item_id: l.item_id, qty: l.weight ? 1 : l.qty, weight: l.weight })), "staff");
      const out = built.map((l) => ({ item_id: l.it.id, name: l.it.full_name, qty: l.qty, weight: l.weight, unit: l.it.unit || "pc", unit_price_cents: l.weight ? l.it.price_cents : null, price_cents: l.price, orig_price_cents: null, amount_cents: l.price * l.qty }));
      const sub = out.reduce((s, l) => s + l.amount_cents, 0);
      return { lines: out, subtotal_cents: sub, discount_cents: 0, extra_cents: 0, round_off_cents: 0, total_cents: sub };
    }

    // ---------- 打印（模拟打印机：只记下来，超市的小票预览用） ----------
    job(o, kind, items) {
      const pr = (this.snap.printers && this.snap.printers.printers) || [];
      const bill = pr.find((p) => p.id === (this.snap.printers.routes && this.snap.printers.routes.bill_printer_id)) || pr[0] || { id: 1, name: "前台收银", color: "purple" };
      const kitchen = pr.find((p) => p.id === ((items && items[0] && items[0].printer_id) || 2)) || bill;
      const p = kind === "kitchen" ? kitchen : bill;
      const j = { id: ++this.db.seq.job, order_id: o.id, kind, printer_id: p.id, device_id: p.id, status: "simulated", error: null, note: null, attempts: 1, created_at: now(), printed_at: now(),
        table_no: this.tableNo(o), order_type: o.order_type, pickup_no: o.pickup_no, dine_option: o.dine_option, printer_name: p.name, printer_color: p.color, device_name: p.name, device_color: p.color };
      j._items = items ? items.map((i) => i.id) : null;
      this.db.jobs.push(j);
      if (this.db.jobs.length > 200) this.db.jobs.splice(0, this.db.jobs.length - 200);
      this.emit("print", { job_id: j.id, status: "simulated", kind });
      return j;
    }
    jobView(j) { const { _items, ...rest } = j; return rest; }
    // dict：法语小票用的词典（菜名、规格、店长这些中文 → 法文；和收银系统打小票时用菜单翻译一样）
    payload(j, dict) {
      const o = this.order(j.order_id);
      const L = RT[this.S.ticket_lang_customer === "fr" ? "fr" : "zh"];
      const tr = (t) => (dict && t ? dict[t] || String(t).split(" / ").map((x) => dict[x] || x.split(" ").map((y) => dict[y] || y).join(" ")).join(" / ") : t);
      const W = 32, line = (text, x = {}) => ({ text, align: x.align || "left", bold: Boolean(x.bold), w: x.big ? 2 : 1, h: x.big ? 2 : 1 });
      const money = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
      const sep = line("-".repeat(W));
      if (!o) return { width: W, lines: [line(L.demo, { align: "center" })] };
      const f = this.full(o);
      const items = j._items ? this.db.items.filter((i) => j._items.includes(i.id)) : f.items;
      const out = [line(this.S.store_name || "", { align: "center", bold: true, big: true }), line(L[j.kind] || L.receipt, { align: "center" })];
      out.push(line(o.order_type === "dine_in" ? `${L.table} ${f.table_no}` : o.order_type === "retail" ? L.retail : `${L.takeaway}  ${L.pickup} #${pad(o.pickup_no || 0, 3)}`));
      out.push(line(`${L.no}${L.c}${o.id}    ${L.cashier}${L.c}${tr(this.staff().name)}`), line(`${L.time}${L.c}${j.created_at}`), sep);
      const name = (i) => tr(i.name_at_order) + (i.options_text ? " " + tr(i.options_text) : "");
      if (j.kind === "kitchen") {
        for (const i of items) out.push(line(`${i.qty} × ${name(i)}`, { bold: true, big: true }));
      } else {
        out.push(line(padR(L.head[0], 18) + padR(L.head[1], 6) + L.head[2]));
        for (const i of items) {
          const n = name(i), q = String(i.qty), m = money(i.price_cents * i.qty);
          const left = cw(n) > 18 ? n : padR(n, 18);
          out.push(line(cw(n) > 18 ? n : left + padL(q, 3) + padL(m, W - 21)));
          if (cw(n) > 18) out.push(line(padL(q, 21) + padL(m, W - 21)));
        }
        out.push(sep, line(padR(L.subtotal, W - cw(money(f.subtotal_cents))) + money(f.subtotal_cents)));
        out.push(line(`${L.total}     ${money(f.total_cents)}`, { bold: true, big: true }));
        for (const p of f.payments) {
          const label = L[p.method] || p.method;
          out.push(line(padR(label, W - cw(money(p.amount_cents))) + money(p.amount_cents)));
          if (p.method === "cash" && p.received_cents > p.amount_cents) out.push(line(padR(L.change, W - cw(money(p.received_cents - p.amount_cents))) + money(p.received_cents - p.amount_cents)));
        }
        out.push(sep, line(L.thanks, { align: "center" }));
        if (this.S.store_phone) out.push(line(`${L.tel}${L.c}${this.S.store_phone}`, { align: "center" }));
        if (this.S.store_address) out.push(line(this.S.store_address, { align: "center" }));
      }
      out.push(line(L.demo, { align: "center" }));
      return { width: W, lines: out };
    }

    // ---------- 各种视图 ----------
    tablesView() {
      return this.snap.tables.map((t) => {
        if (t.kind === "takeaway") return { ...t };
        const ts = this.tstate(t.id);
        const o = ts.current_order_id && this.order(ts.current_order_id);
        const base = { ...t, status: o ? ts.status : "idle", current_order_id: o ? o.id : null, last_order_id: ts.last_order_id || null };
        if (!o) return base;
        const live = this.itemsOf(o.id).filter((i) => i.status === "active");
        return { ...base, opened_at: o.created_at, item_count: live.reduce((s, i) => s + i.qty, 0), total_cents: this.totals(o).total_cents };
      });
    }
    takeawayStatus(o) { if (o.status === "open") return "unpaid"; if (o.status === "cancelled") return "cancelled"; return o.picked_up_at ? "picked_up" : "paid"; }
    decorate(o) { return { ...o, takeaway_status: this.takeawayStatus(o), pickup_label: "#" + pad(o.pickup_no || 0, 3), mall_no: null }; }
    lite(o) {
      const t = this.totals(o);
      const live = this.itemsOf(o.id).filter((i) => i.status === "active");
      const kdsDone = o.status === "closed" && !o.picked_up_at && live.length && live.every((i) => i.kds_done_at);
      const out = { id: o.id, status: o.status, source: o.source, pickup_no: o.pickup_no, dine_option: o.dine_option, created_at: o.created_at, picked_up_at: o.picked_up_at, remote: o.remote,
        contact_name: o.contact_name, pickup_time: o.pickup_time, note: o.note, pay_mode: o.pay_mode, kitchen_printed_at: o.kitchen_printed_at, print_first_at: o.print_first_at,
        ready_notified_at: o.ready_notified_at, kds_done: kdsDone || undefined, total_cents: t.total_cents, item_count: live.reduce((s, i) => s + i.qty, 0), lite: 1 };
      for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
      return this.decorate(out);
    }
    takeawayIds() {
      const since = now(-12 * 60);
      return this.db.orders.filter((o) => o.order_type === "takeaway" && (o.status === "open" || o.created_at >= since)).sort((a, b) => b.id - a.id);
    }
    kds() {
      const recall = now(-10);
      const open = [], done = [];
      for (const o of this.db.orders) {
        if (o.order_type === "retail" || o.status === "cancelled") continue;
        if (!(o.order_type === "dine_in" || o.status === "closed" || o.kitchen_printed_at)) continue;
        const its = this.itemsOf(o.id).filter((i) => i.status === "active" || (i.status === "cancelled" && !i.kds_done_at && i.cancelled_at >= recall));
        if (!its.length) continue;
        const tk = { order_id: o.id, order_type: o.order_type, label: o.order_type === "takeaway" ? "#" + pad(o.pickup_no || 0, 3) : this.tableNo(o), guests: o.guests, note: o.note, rush: o.rush_count || 0,
          since: o.order_type === "takeaway" ? o.kitchen_printed_at || o.closed_at || o.created_at : o.created_at, platform: null, contact: o.order_type === "takeaway" ? o.contact_name : null,
          pickup_time: o.pickup_time, dine_option: o.dine_option,
          items: its.map((i) => ({ id: i.id, name: i.name_at_order, options_text: i.options_text, note: i.note, qty: i.qty, cancelled: i.status === "cancelled", done_at: i.kds_done_at, created_at: i.created_at })) };
        const live = tk.items.filter((i) => !i.cancelled);
        if (live.length && live.every((i) => i.done_at)) {
          const last = live.map((i) => i.done_at).sort().pop();
          if (last >= recall) done.push({ ...tk, done_at: last });
        } else open.push(tk);
      }
      open.sort((a, b) => (a.since < b.since ? -1 : 1));
      done.sort((a, b) => (a.done_at > b.done_at ? -1 : 1));
      const dineDone = this.db.items.filter((i) => i.kds_done_at && i.kds_done_at.slice(0, 10) === today());
      return { open, done, stats: { done_today: dineDone.length, avg_minutes: dineDone.length ? 6.5 : null } };
    }
    voucher(o) {
      const f = this.full(o);
      return { pickup_no: o.pickup_no, pickup_label: "#" + pad(o.pickup_no || 0, 3), mall_no: null, status: this.takeawayStatus(o), cancel_reason: o.status === "cancelled" ? o.cancel_reason : null,
        items: f.items.map((i) => ({ name: i.name_at_order, options_text: i.options_text, note: i.note, qty: i.qty, price_cents: i.price_cents })), note: o.note,
        subtotal_cents: f.subtotal_cents, discount_cents: f.discount_cents + f.round_off_cents, charges: [], total_cents: f.total_cents, created_at: o.created_at, expire_minutes: 30,
        remote: Boolean(o.remote), contact_name: o.contact_name, pickup_time: o.pickup_time, accepted: Boolean(o.kitchen_printed_at),
        ready: Boolean(o.ready_notified_at) && o.status === "closed" && !o.picked_up_at, kiosk: false, dine_option: o.dine_option, pay_mode: o.pay_mode,
        online_pay: o.pay_mode ? { available: false, optional: false, status: null, paid: false, refunded: false } : null, delivery: null };
    }
    customerView(t) {
      const base = this.snap.public_tables[t.qr_token] || { kind: "dine_in", instore: true, table_no: t.table_no, ask_guests: false, guests: null };
      const ts = this.tstate(t.id);
      const o = ts.current_order_id && this.order(ts.current_order_id);
      const f = o && this.full(o);
      return { ...base, shared_cart: false, guests: o ? o.guests : null,
        order: f ? { id: f.id, items: f.items.map((i) => ({ id: i.id, menu_item_id: i.menu_item_id, name: i.name_at_order, options_text: i.options_text, note: i.note, qty: i.qty, price_cents: i.price_cents })), note: f.note, subtotal_cents: f.subtotal_cents } : null };
    }
    info(remote) {
      const s = this.S;
      const base = clone(remote && this.snap.remote_info ? this.snap.remote_info : this.snap.info);
      base.site_theme = s.site_theme || ""; base.shop_style = s.shop_style === "shop" ? "shop" : "menu"; base.store_name = s.store_name;
      base.online_pay = null; base.gway = null;
      base.remote_closed = remote && s.remote_paused ? { ...(this.snap.remote_closed || { reason: "paused", hours: "", week: null, next_open: null }), reason: "paused", message: s.remote_closed_msg || "" } : null;
      return base;
    }
    shiftView() {
      const sh = this.db.shift;
      if (!sh) return null;
      const pays = this.db.payments.filter((p) => p.shift_id === sh.id);
      const sum = (m) => pays.filter((p) => p.method === m).reduce((s, p) => s + p.amount_cents, 0);
      const orders = new Set(pays.map((p) => p.order_id)).size;
      return { ...sh, closed_at: null, closed_by: null, expected_cash_cents: sum("cash"), counted_cash_cents: null, note: null, auto_closed: 0, opened_by_name: this.staff().name, closed_by_name: null,
        order_count: orders, discount_cents: 0, cash_in_cents: sum("cash"), card_in_cents: sum("card"), voucher_in_cents: sum("voucher"), online_in_cents: 0, platform_in_cents: 0, other_refund_cents: 0,
        tip_cash_cents: 0, tip_card_cents: 0, cash_refund_cents: 0, card_refund_cents: 0, net_cents: pays.reduce((s, p) => s + p.amount_cents, 0), voided_printed: [], diff_cents: null, unpaid_printed: [] };
    }
    summary(from, to) {
      const tpl = clone(this.snap.reports_summary);
      const closed = this.db.orders.filter((o) => o.status === "closed");
      const pays = this.db.payments;
      const sum = (m) => pays.filter((p) => p.method === m).reduce((s, p) => s + p.amount_cents, 0);
      const T = Object.assign(tpl.totals, { order_count: closed.length, gross_cents: closed.reduce((s, o) => s + o.subtotal_cents, 0), total_cents: closed.reduce((s, o) => s + o.total_cents, 0),
        revenue_cents: closed.reduce((s, o) => s + o.total_cents, 0), cash_cents: sum("cash"), card_cents: sum("card"), voucher_cents: sum("voucher"),
        dine_in_count: closed.filter((o) => o.order_type === "dine_in").length, dine_in_cents: closed.filter((o) => o.order_type === "dine_in").reduce((s, o) => s + o.total_cents, 0),
        takeaway_count: closed.filter((o) => o.order_type !== "dine_in").length, takeaway_cents: closed.filter((o) => o.order_type !== "dine_in").reduce((s, o) => s + o.total_cents, 0) });
      tpl.from = from || today(); tpl.to = to || today();
      tpl.days = [{ ...T, date: today() }];
      for (const h of tpl.by_hour || []) { const os = closed.filter((o) => Number(o.closed_at.slice(11, 13)) === h.hour); h.order_count = os.length; h.total_cents = os.reduce((s, o) => s + o.total_cents, 0); }
      return tpl;
    }
    ordersList() {
      return this.db.orders.slice().sort((a, b) => b.id - a.id).map((o) => {
        const t = this.totals(o), live = this.itemsOf(o.id).filter((i) => i.status === "active");
        return { id: o.id, table_no: this.tableNo(o), status: o.status, source: o.source, staff_name: o.staff_id ? this.staff().name : null, order_type: o.order_type, pickup_no: o.pickup_no,
          picked_up_at: o.picked_up_at, closed_by_name: o.closed_by ? this.staff().name : null, created_at: o.created_at, closed_at: o.closed_at, cancel_reason: o.cancel_reason,
          item_count: live.reduce((s, i) => s + i.qty, 0), total_cents: t.total_cents, refunded_cents: 0, voided_at: null, business_date: o.business_date,
          payments: this.paysOf(o.id).map((p) => ({ method: p.method, amount_cents: p.amount_cents })), invoice_number: null };
      });
    }
    tableByToken(tok, remote) {
      if (tok === this.snap.takeaway_info.qr_token || (this.snap.remote_token && tok === this.snap.remote_token)) return this.counter();
      const t = this.snap.tables.find((x) => x.qr_token === tok && x.kind !== "takeaway");
      if (!t) throw notFound("二维码已失效，请联系服务员");
      return t;
    }

    // ---------- 路由 ----------
    // ctx: { remote }；返回 { status, body } 或 { status, text, type }
    async handle(method, path, query, body, ctx = {}) {
      try {
        const r = await this.route(method, path, query || new URLSearchParams(), body || {}, ctx);
        if (r && r.__raw) return r;
        return { status: r && r.__status ? r.__status : 200, body: r && r.__status ? r.body : r === undefined ? null : r };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...e.extra } };
        return { status: 500, body: { error: "演示出错：" + (e && e.message) } };
      }
    }
    async route(m, p, q, b, ctx) {
      const S = this.S, snap = this.snap;
      let x;
      const is = (method, re) => m === method && (x = re.exec(p));
      const created = (body) => ({ __status: 201, body });
      // ---- 顾客点单页（不用登录） ----
      if (is("GET", /^\/api\/public\/info$/)) return this.info(ctx.remote);
      if (is("GET", /^\/api\/public\/ui-lang$/)) return { lang: S.ui_lang || "zh" };
      if (is("GET", /^\/api\/public\/i18n\/([a-z]{2})$/)) {
        if (!["zh", "fr", "en", "es", "pt"].includes(x[1])) throw notFound("不支持的语言");
        return this.files.i18n ? await this.files.i18n(x[1], q.get("scope") === "customer" ? "customer" : "") : {};
      }
      if (is("GET", /^\/api\/public\/menu$/)) {
        const pm = clone(snap.public_menu);
        if (!this.retail) pm.hot = pm.hot || [];
        return pm;
      }
      if (is("GET", /^\/api\/public\/tables\/([\w-]+)$/)) {
        const t = this.tableByToken(x[1], ctx.remote);
        if (t.kind === "takeaway") return ctx.remote ? clone(snap.remote_table || snap.public_takeaway) : clone(snap.public_takeaway);
        return this.customerView(t);
      }
      if (is("GET", /^\/api\/public\/tables\/[\w-]+\/cart$/) || is("POST", /^\/api\/public\/tables\/[\w-]+\/cart(\/submit)?$/)) throw new HttpError(404, "本店没有开启同桌共享购物车", { code: "CART_OFF" });
      if (is("POST", /^\/api\/public\/tables\/([\w-]+)\/orders$/)) {
        const t = this.tableByToken(x[1], ctx.remote);
        if (t.kind === "takeaway") {
          const remote = Boolean(ctx.remote);
          if (remote && S.remote_paused) throw new HttpError(403, "本店现在不接网上订单");
          const o = this.createTakeaway({ items: b.items, requestId: b.request_id, note: b.note, source: "customer", remote, contact: b.contact, dineOption: b.dine_option, device: b.device });
          return created({ kind: "takeaway", access_token: o.access_token, voucher: this.voucher(o) });
        }
        if (ctx.remote && !this.tstate(t.id).current_order_id) throw new HttpError(403, "请先让服务员为您开台", { code: "TABLE_NOT_OPEN" });
        const f = this.addDineIn({ tableId: t.id, items: b.items, requestId: b.request_id, note: b.note, source: "customer", guests: b.guests });
        this.emit("customer_order", { table_no: t.table_no, order_id: f.id, batch: this.db.seq.item });
        return created(this.customerView(t));
      }
      if (is("GET", /^\/api\/public\/takeaway\/([\w-]+)$/)) {
        const o = this.db.orders.find((o) => o.access_token === x[1]);
        if (!o) throw notFound("订单不存在或已过期");
        return this.voucher(o);
      }
      if (is("POST", /^\/api\/public\/takeaway\/([\w-]+)\/cancel$/)) {
        const o = this.db.orders.find((o) => o.access_token === x[1]);
        if (!o) throw notFound("订单不存在");
        if (o.kitchen_printed_at) throw new HttpError(409, "店里已经接单在做了，不能取消，请联系店里");
        return this.voucher(this.order(this.cancelTakeaway(o.id, "顾客自行取消").id));
      }
      if (is("POST", /^\/api\/public\/takeaway\/[\w-]+\/pay$/)) throw new HttpError(403, "演示版不能网上付款");
      if (is("POST", /^\/api\/public\/order-lookup$/)) return [];

      // ---- 登录（静态版直接进入演示，不要 PIN） ----
      if (is("GET", /^\/api\/auth\/me$/)) return this.staff();
      if (is("GET", /^\/api\/auth\/staff-list$/)) return snap.staff_list || [this.staff()];
      if (is("POST", /^\/api\/auth\/login$/)) return { token: "demo-token", staff: this.staff(), expires_in: 86400 };
      if (is("POST", /^\/api\/auth\/logout$/)) return { ok: true };
      if (is("POST", /^\/api\/auth\/media-ticket$/)) return { ticket: "demo", expires_in: 600 };
      if (is("GET", /^\/api\/license\/status$/)) return { required: false, machine_code: "DEMO", activated: false };
      if (is("GET", /^\/api\/license\/notices$/)) return [];
      if (is("GET", /^\/api\/license\/update$/)) return snap.license_update || { current: "", ready: false, latest: null, installing: false };
      if (/^\/api\/(license|admin|staff|data-reset|tunnel|gway|backup|platforms|kiosks|display-devices|fiscal|terminal|invoices|i18n)\b/.test(p) && m !== "GET") throw new HttpError(403, NA);

      // ---- 设置 ----
      if (is("GET", /^\/api\/settings$/)) return clone(S);
      if (is("PUT", /^\/api\/settings$/)) {
        const allow = ["site_theme", "shop_style", "ticket_lang_customer", "ticket_lang_kitchen", "ui_lang", "customer_lang", "remote_closed_msg", "theme_color", "theme_pattern", "home_tab", "voice_mode", "chime_volume"];
        for (const k of Object.keys(b)) if (allow.includes(k)) S[k] = b[k];
        this.emit("settings", {});
        return clone(S);
      }
      if (is("POST", /^\/api\/settings\/online$/)) {
        if (!["open", "off", "mall_off", "all_off"].includes(String(b.mode))) throw bad("mode 不对");
        S.remote_paused = b.mode !== "open";
        this.emit("settings", {});
        return clone(S);
      }

      // ---- 菜单、桌台 ----
      if (is("GET", /^\/api\/menu\/categories$/)) return clone(snap.categories || []);
      if (is("GET", /^\/api\/menu\/items$/)) return clone(snap.menu_items || []);
      if (is("GET", /^\/api\/menu\/stock$/)) return clone(snap.menu_stock || { items: [] });
      if (is("GET", /^\/api\/menu\/hot$/)) return clone(snap.menu_hot || []);
      if (is("GET", /^\/api\/menu\/allergens$/)) return clone(snap.public_menu.allergen_list || []);
      if (is("GET", /^\/api\/tables$/)) return this.tablesView();
      if (is("GET", /^\/api\/tables\/layout$/)) return clone(snap.layout);
      if (is("GET", /^\/api\/tables\/(\d+)\/qr\.svg$/) || is("GET", /^\/api\/print-templates\/qr\.svg$/)) {
        const id = x[1] || snap.takeaway_info.table_id;
        const svg = this.files.qr ? await this.files.qr(id) : null;
        return { __raw: true, status: 200, type: "image/svg+xml", text: svg || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#eee"/></svg>' };
      }
      if (is("GET", /^\/api\/tables\/(\d+)\/draft$/)) return { lines: [], note: null };
      if (is("POST", /^\/api\/tables\/(\d+)\/clear$/)) { const ts = this.tstate(Number(x[1])); if (ts.current_order_id) throw bad("这桌还没结账"); ts.status = "idle"; this.emit("orders", {}); return { ok: true }; }
      if (is("POST", /^\/api\/tables\/clear-all$/)) return { cleared: 0 };

      // ---- 订单 ----
      if (is("GET", /^\/api\/orders\/table\/(\d+)\/open$/)) { const ts = this.tstate(Number(x[1])); const o = ts.current_order_id && this.order(ts.current_order_id); return o ? this.full(o) : null; }
      if (is("GET", /^\/api\/orders\/(\d+)$/)) {
        const o = this.order(x[1]);
        if (!o) throw notFound("订单不存在");
        return { ...this.full(o), print_jobs: this.db.jobs.filter((j) => j.order_id === o.id).map((j) => ({ id: j.id, kind: j.kind, printer_id: j.printer_id, status: j.status, error: null, note: null, created_at: j.created_at, printer_name: j.printer_name, printer_color: j.printer_color })) };
      }
      if (is("GET", /^\/api\/orders$/)) return this.ordersList();
      if (is("POST", /^\/api\/orders$/)) return created(this.addDineIn({ tableId: b.table_id, items: b.items, requestId: b.request_id, note: b.note, source: "staff", guests: b.guests }));
      if (is("POST", /^\/api\/orders\/(\d+)\/checkout$/)) return this.checkout(Number(x[1]), b.payments);
      if (is("POST", /^\/api\/orders\/(\d+)\/prebill$/)) return this.prebill(Number(x[1]));
      if (is("POST", /^\/api\/orders\/(\d+)\/rush$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); o.rush_count = (o.rush_count || 0) + 1; this.touch(o); return this.full(o); }
      if (is("POST", /^\/api\/orders\/(\d+)\/items\/(\d+)\/cancel$/)) return this.cancelItem(Number(x[1]), Number(x[2]), b.qty, b.reason);
      if (is("POST", /^\/api\/orders\/(\d+)\/void$/) || is("POST", /^\/api\/tables\/\d+\/void$/)) {
        const id = /orders/.test(p) ? Number(x[1]) : this.tstate(Number(/tables\/(\d+)/.exec(p)[1])).current_order_id;
        return this.cancelTakeaway(id, b.reason || "作废清台");
      }
      if (is("PATCH", /^\/api\/orders\/(\d+)\/guests$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); o.guests = b.guests == null ? null : Number(b.guests); this.touch(o); return this.full(o); }
      if (is("PATCH", /^\/api\/orders\/(\d+)\/note$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); o.note = b.note ? String(b.note).slice(0, 60) : null; this.touch(o); return this.full(o); }
      if (is("POST", /^\/api\/orders\/(\d+)\/(reprint|reprint-kitchen)$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); this.job(o, x[2] === "reprint" ? "receipt" : "kitchen", x[2] === "reprint" ? null : this.itemsOf(o.id)); return { ok: true }; }

      // ---- 外带 ----
      if (is("GET", /^\/api\/takeaway$/)) {
        const list = this.takeawayIds();
        if (q.get("view") !== "lite") return list.map((o) => this.decorate(this.full(o)));
        const full = Number(q.get("full")) || 0;
        return list.map((o) => (o.id === full ? this.decorate(this.full(o)) : this.lite(o)));
      }
      if (is("GET", /^\/api\/takeaway\/(awaiting-pay|pay-problems)$/)) return [];
      if (is("GET", /^\/api\/takeaway\/info$/)) return clone(snap.takeaway_info);
      if (is("POST", /^\/api\/takeaway$/)) return created(this.full(this.createTakeaway({ items: b.items, requestId: b.request_id, note: b.note, source: "staff", dineOption: b.dine_option })));
      if (is("POST", /^\/api\/takeaway\/(\d+)\/ready$/)) return this.markReady(Number(x[1]));
      if (is("POST", /^\/api\/takeaway\/(\d+)\/pickup$/)) return this.pickup(Number(x[1]));
      if (is("POST", /^\/api\/takeaway\/(\d+)\/accept$/)) return this.accept(Number(x[1]));
      if (is("POST", /^\/api\/takeaway\/(\d+)\/print-first$/)) return this.printFirst(Number(x[1]));
      if (is("POST", /^\/api\/takeaway\/(\d+)\/cancel$/)) return this.cancelTakeaway(Number(x[1]), b.reason);
      if (is("POST", /^\/api\/takeaway\/(\d+)\/items$/)) { const o = this.order(x[1]); if (!o || o.status !== "open") throw bad("只能给没付款的单加菜"); this.insertLines(o, this.buildLines(b.items, "staff")); this.touch(o); return this.full(o); }
      if (is("PUT", /^\/api\/takeaway\/(\d+)\/dine$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); o.dine_option = b.dine_option === "here" ? "here" : "togo"; this.touch(o); return this.full(o); }
      if (is("PUT", /^\/api\/takeaway\/(\d+)\/contact$/)) { const o = this.order(x[1]); if (!o) throw notFound("订单不存在"); o.contact_name = b.name || null; o.contact_phone = b.phone || null; this.touch(o); return this.full(o); }

      // ---- 后厨 ----
      if (is("GET", /^\/api\/kds$/)) return this.kds();
      if (is("GET", /^\/api\/kds\/stations$/)) return clone(snap.kds_stations || []);
      if (is("GET", /^\/api\/kds\/dish-stats$/)) return [];
      if (is("POST", /^\/api\/kds\/orders\/(\d+)\/bump$/)) return this.bump(Number(x[1]));
      if (is("POST", /^\/api\/kds\/orders\/(\d+)\/recall$/)) return this.recall(Number(x[1]));
      if (is("POST", /^\/api\/kds\/items\/(\d+)$/)) {
        const it = this.db.items.find((i) => i.id === Number(x[1]));
        if (!it) throw notFound("这道菜不存在");
        it.kds_done_at = b.done === false ? null : now();
        this.touch(this.order(it.order_id));
        return { ok: true };
      }

      // ---- 打印（模拟） ----
      if (is("GET", /^\/api\/printers$/)) return clone(snap.printers);
      if (is("GET", /^\/api\/print-jobs\/failed$/)) return { count: 0, jobs: [] };
      if (is("GET", /^\/api\/print-jobs$/)) {
        const lim = Math.max(1, Math.min(100, Number(q.get("limit")) || 30));
        const all = this.db.jobs.slice().reverse();
        return { jobs: all.slice(0, lim).map((j) => this.jobView(j)), has_more: all.length > lim };
      }
      if (is("GET", /^\/api\/print-jobs\/(\d+)$/)) {
        const j = this.db.jobs.find((j) => j.id === Number(x[1]));
        if (!j) throw notFound("打印记录不存在");
        const dict = this.S.ticket_lang_customer === "fr" && this.files.i18n ? await this.files.i18n("fr", "").catch(() => null) : null;
        return { ...this.jobView(j), payload: this.payload(j, dict) };
      }
      if (is("POST", /^\/api\/print-jobs\/\d+\/(retry|dismiss)$/) || is("POST", /^\/api\/print-jobs\/retry-failed$/)) return { ok: true };
      if (is("POST", /^\/api\/printers\/drawer\/open$/)) return { ok: true };
      if (is("POST", /^\/api\/display\/[\w-]+$/)) return { ok: true };

      // ---- 班次、报表 ----
      if (is("GET", /^\/api\/shifts\/current$/)) return this.shiftView();
      if (is("POST", /^\/api\/shifts\/open$/)) { this.db.shift = { id: 1, business_date: today(), opened_at: now(), opened_by: 1, opening_cash_cents: Number(b.opening_cash_cents) || 0, auto_opened: 0 }; this.emit("shift", {}); return created(this.shiftView()); }
      if (is("POST", /^\/api\/shifts\/current\/close$/)) { const closed = { ...this.shiftView(), closed_at: now() }; this.db.shift = null; this.emit("shift", {}); return { closed, next: null }; }
      if (is("GET", /^\/api\/reports\/summary$/)) return this.summary(q.get("from"), q.get("to"));

      // ---- 超市 ----
      if (this.retail || /^\/api\/retail\//.test(p)) {
        if (is("GET", /^\/api\/retail\/catalog$/)) return clone(snap.retail_catalog || []);
        if (is("GET", /^\/api\/retail\/categories$/)) return clone(snap.retail_categories || []);
        if (is("GET", /^\/api\/retail\/goods$/)) return clone(snap.retail_goods || { total: 0, items: [] });
        if (is("GET", /^\/api\/retail\/goods\/(\d+)$/)) { const g = ((snap.retail_goods && snap.retail_goods.items) || []).find((g) => g.id === Number(x[1])); if (!g) throw notFound("商品不存在"); return clone(g); }
        if (is("GET", /^\/api\/retail\/holds$/)) return [];
        if (is("GET", /^\/api\/retail\/stock\/low-count$/)) return { count: 0 };
        if (is("GET", /^\/api\/retail\/scale$/)) return { ok: false, error: "演示版没有连电子秤" };
        if (is("GET", /^\/api\/retail\/scan$/)) {
          const code = String(q.get("code") || "").trim();
          const g = (snap.retail_catalog || []).find((g) => g.barcode === code || g.code === code || g.plu === code);
          if (!g) throw notFound("找不到这个条码的商品");
          return { item: clone(g), weight: null };
        }
        if (is("POST", /^\/api\/retail\/quote$/)) return this.quote(b.lines);
        if (is("POST", /^\/api\/retail\/sale$/)) { const dup = this.seen(b.request_id); if (dup) return this.full(dup); const f = this.retailSale({ lines: b.lines, payments: b.payments }); if (b.request_id) this.db.requests[b.request_id] = f.id; return f; }
      }
      if (m === "GET" && /^\/api\/tunnel$/.test(p)) return { enabled: false, state: "off", url: null, order_url: null, demo: true };
      if (m === "GET") throw new HttpError(404, NA);
      throw new HttpError(403, NA);
    }

    // ---------- 演示外壳用的控制接口（静态版代替服务器版的 /demo/api/*） ----------
    demoState(base) {
      const tables = this.snap.tables.filter((t) => t.kind !== "takeaway").map((t) => ({ id: t.id, no: t.table_no, token: t.qr_token, area: t.area }));
      return { store: this.key, token: "demo-token", tables, takeaway_token: this.snap.takeaway_info.qr_token,
        remote: this.snap.remote_token ? { token: this.snap.remote_token } : null,
        look: { site_theme: this.S.site_theme || "", shop_style: this.S.shop_style || "menu", lang: this.S.ticket_lang_customer === "zh" ? "zh" : "fr" },
        store_type: this.S.store_type, nav_tables: this.S.nav_tables, store_name: this.S.store_name, scenarios: ["idle", "rush", "scanning", "online", "paid_wait", "closed"] };
    }
    setLook(b) {
      if ("site_theme" in b) this.S.site_theme = String(b.site_theme || "");
      if ("shop_style" in b) this.S.shop_style = b.shop_style === "shop" ? "shop" : "menu";
      if ("lang" in b) this.S.ticket_lang_customer = b.lang === "zh" ? "zh" : "fr";
      this.emit("settings", {});
      return { ok: true };
    }
    // 点餐情况：每次先恢复干净数据（保留主题 / 样式 / 小票语言），再按服务器版 lib/scenarios.js 的同样做法造数据
    scenario(name) {
      if (!["idle", "rush", "scanning", "online", "paid_wait", "closed"].includes(name)) throw bad("unknown scenario");
      this.reset(true);
      const k = this.key, retail = this.retail;
      const list = retail ? ((this.snap.retail_goods && this.snap.retail_goods.items) || []).filter((g) => g.is_active !== false) : (this.snap.menu_items || []).filter((i) => i.is_active);
      const pickOpts = (it, alt) => (it.options || []).filter((g) => g.required).map((g) => ({ group: g.name, choice: g.choices[Math.min(alt, g.choices.length - 1)].name }));
      const lines = (n, seed) => {
        const src = retail ? list.filter((g) => !g.weighed) : list;
        const out = [];
        for (let i = 0; i < n; i++) {
          const it = src[(seed * 7 + i * 5) % src.length];
          if (out.some((l) => l.menu_item_id === it.id)) continue;
          out.push({ menu_item_id: it.id, qty: 1 + ((seed + i) % 3 === 0 ? 1 : 0), options: retail ? [] : pickOpts(this.items.get(it.id) || it, (seed + i) % 2) });
        }
        return out;
      };
      const ago = (min) => now(-min);
      const pay = (o, at) => this.checkout(o.id, [{ method: o.id % 3 === 0 ? "cash" : "card", amount_cents: this.totals(o).total_cents, received_cents: this.totals(o).total_cents }], at);
      const take = (seed, { paid = false, ready = false, bump = false, at } = {}) => {
        const o = this.createTakeaway({ items: lines(2 + (seed % 2), seed), source: "customer", dineOption: "togo", at });
        if (paid) pay(o, at);
        if (bump) this.bump(o.id);
        if (ready) this.markReady(o.id);
        return o;
      };
      const remoteOrder = (seed, contact) => this.createTakeaway({ items: lines(3, seed), source: "customer", remote: true, contact });
      const soon = (min) => now(min).slice(11, 16);
      let phone = { entry: k === "resto" ? "table:5" : "takeaway" };
      if (name === "rush") {
        if (k === "resto") {
          let i = 0;
          for (const t of this.snap.tables.filter((t) => t.kind !== "takeaway")) {
            i++;
            if (t.table_no === "5") continue;
            this.addDineIn({ tableId: t.id, items: lines(3 + (i % 3), i), source: i % 4 === 2 ? "customer" : "staff", guests: 2 + (i % 5), at: ago(4 + ((i * 7) % 38)) });
          }
          for (const tk of this.kds().open.slice(0, 4)) this.bump(tk.order_id);
          for (const t of this.snap.tables.filter((x) => ["2", "9"].includes(x.table_no))) { const ts = this.tstate(t.id); if (ts.current_order_id) this.prebill(ts.current_order_id); }
          take(21, { paid: true, at: ago(6) });
          take(22, { paid: true, at: ago(3) });
        } else if (k === "tea") {
          for (let i = 0; i < 9; i++) take(i + 1, { paid: i !== 8, bump: i < 2, ready: i < 2, at: ago(18 - i * 2) });
        } else {
          const g = list;
          for (let i = 0; i < 6; i++) {
            const ls = [g[(i * 3) % g.length], g[(i * 3 + 4) % g.length], g[(i * 3 + 9) % g.length]].map((x) => ({ item_id: x.id, qty: x.weighed ? 1 : 1 + (i % 2), weight: x.weighed ? 0.5 + i * 0.25 : null }));
            const qt = this.quote(ls);
            this.retailSale({ lines: ls, payments: [{ method: i % 2 ? "card" : "cash", amount_cents: qt.total_cents, received_cents: qt.total_cents }], at: ago(60 - i * 9) });
          }
          remoteOrder(3, { name: "Léa Martin", phone: "0694 11 22 33", pickup_time: soon(45) });
          take(5, { paid: true, at: ago(4) });
        }
      }
      if (name === "scanning") phone.drive = "cart";
      if (name === "online") { const o = remoteOrder(4, { name: "Marie Dupont", phone: "0694 12 34 56", pickup_time: soon(30) }); phone = { entry: "online", voucher: o.access_token }; }
      if (name === "paid_wait") {
        take(2, { paid: true, at: ago(9) }); take(3, { paid: true, at: ago(7) });
        const mine = take(4, { paid: true, bump: true, ready: true, at: ago(5) });
        phone = { entry: "takeaway", voucher: mine.access_token };
      }
      if (name === "closed") { this.S.remote_paused = true; this.S.remote_closed_msg = "Fermé pour aujourd'hui. À demain dès 11 h !"; phone = { entry: "online" }; this.emit("settings", {}); }
      this.emit("orders", {}); this.emit("takeaway", {}); this.emit("kds", {});
      return { ok: true, phone };
    }
    // 自动演示里收银台 / 后厨那一步（和服务器版一样只放行这几个）
    async call(method, url, body) {
      const allow = [/^\/api\/takeaway\/\d+\/(print-first|ready|pickup|accept)$/, /^\/api\/orders\/\d+\/checkout$/, /^\/api\/kds\/orders\/\d+\/bump$/, /^\/api\/takeaway(\?.*)?$/, /^\/api\/kds(\?.*)?$/, /^\/api\/orders\/\d+$/];
      if (!allow.some((r) => r.test(String(url || "")))) throw new HttpError(403, "not allowed");
      const u = new URL(url, "http://x");
      const r = await this.handle(method === "GET" ? "GET" : "POST", u.pathname, u.searchParams, body || {}, {});
      if (r.status >= 400) throw new HttpError(r.status, (r.body && r.body.error) || "error");
      return r.body;
    }
    async control(method, sub, body) {
      try {
        if (sub === "state") return { status: 200, body: this.demoState() };
        if (sub === "look" && method === "POST") return { status: 200, body: this.setLook(body || {}) };
        if (sub === "reset" && method === "POST") { this.reset(body && body.keep_look !== false); return { status: 200, body: { ok: true, token: "demo-token" } }; }
        if (sub === "scenario" && method === "POST") return { status: 200, body: { ...this.scenario(String((body && body.name) || "")), token: "demo-token" } };
        if (sub === "call" && method === "POST") return { status: 200, body: await this.call(body.method, body.url, body.body) };
        return { status: 404, body: { error: "unknown" } };
      } catch (e) {
        return { status: e.status || 500, body: { error: e.message } };
      }
    }
  }

  const api = { Shop, HttpError };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GwayFake = api;
})(typeof self !== "undefined" ? self : this);
