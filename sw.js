// 静态版演示的 Service Worker：代替后台服务器。
// 真实收银页面（app/ 下 order.html、cashier.html、kitchen.html，网址 s/<店>/页面）发出的 /api/* 请求在这里由 fake/engine.js 回应；
// 页面里写死的绝对路径（/api/…、/uploads/…）按「是哪个页面发的」认出是哪家店。
// 数据只在这个浏览器里（内存 + IndexedDB），推送用 BroadcastChannel 发给同一浏览器里的页面（inject.js 里的假 WebSocket 收）。
importScripts("fake/engine.js");

const BASE = new URL("./", self.registration.scope).pathname; // 例如 /gway-demo/
const SHOPS = ["resto", "tea", "market"];
const APP_PAGES = /^(order|cashier|kitchen|ticket)\.html$/;
const shops = {};
const loading = {};
const queue = {}; // 每家店的请求排队处理（写操作不会交错）

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// 顾客手机「做好了」系统通知：点一下回到点单页（和收银系统自己的 sw.js 一样）
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.includes("order.html"));
    return c ? c.focus() : self.clients.openWindow(BASE);
  }));
});

// ---------- IndexedDB：每家店一条记录 ----------
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("gway-demo", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("shops");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  try { const d = await idb(); return await new Promise((res) => { const q = d.transaction("shops").objectStore("shops").get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; }
}
async function idbPut(key, val) {
  try { const d = await idb(); await new Promise((res) => { const t = d.transaction("shops", "readwrite"); t.objectStore("shops").put(val, key); t.oncomplete = res; t.onerror = res; }); } catch {}
}

const channels = {};
const channel = (key) => channels[key] || (channels[key] = new BroadcastChannel("gway-demo-" + key));
const fileCache = {};
async function json(url) {
  if (!fileCache[url]) fileCache[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }).catch((e) => { delete fileCache[url]; throw e; });
  return fileCache[url];
}
async function shop(key) {
  if (shops[key]) return shops[key];
  if (!loading[key]) loading[key] = (async () => {
    const snap = await json(BASE + "data/" + key + "/snapshot.json");
    const saved = await idbGet(key);
    const files = {
      i18n: (lang, scope) => json(BASE + "data/" + key + "/i18n/" + lang + (scope ? "-" + scope : "") + ".json"),
      qr: (id) => fetch(BASE + "data/" + key + "/qr/" + Number(id) + ".svg").then((r) => (r.ok ? r.text() : null)).catch(() => null),
    };
    shops[key] = new GwayFake.Shop(key, snap, saved, (type, data) => channel(key).postMessage({ type, ...data }), files);
    return shops[key];
  })().finally(() => { delete loading[key]; });
  return loading[key];
}
function serial(key, fn) {
  const prev = queue[key] || Promise.resolve();
  const next = prev.then(fn, fn);
  queue[key] = next.catch(() => {});
  return next;
}

// 网址 → { shop, remote, rel }：s/<店>/页面 是店里 WiFi 打开的；s/<店>/web/页面 = 从网上点单链接打开（收银系统的「外网」）
function parse(pathname) {
  if (!pathname.startsWith(BASE)) return null;
  const m = /^s\/([a-z]+)\/(web\/)?(.*)$/.exec(pathname.slice(BASE.length));
  if (!m || !SHOPS.includes(m[1])) return null;
  return { shop: m[1], remote: Boolean(m[2]), rel: m[3] };
}
const ctxCache = new Map();
async function clientCtx(id) {
  if (!id) return null;
  if (ctxCache.has(id)) return ctxCache.get(id);
  const c = await self.clients.get(id);
  const ctx = c ? parse(new URL(c.url).pathname) : null;
  if (ctx) { ctxCache.set(id, ctx); if (ctxCache.size > 200) ctxCache.delete(ctxCache.keys().next().value); }
  return ctx;
}

const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
// 接口返回的「错误」（比如共享购物车没开 = 404 CART_OFF，这是收银系统正常的回答）：用 200 + X-Demo-Status 带回去，
// 页面里 inject.js 换回原来的状态码再交给页面 —— 页面逻辑和真的一样，浏览器控制台不会因为这些正常回答报红
const JA = (status, body) => status >= 400 ? new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Demo-Status": String(status) } }) : J(status, body);
const NOTE = (title) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font:16px system-ui;padding:40px;color:#444"><h2>${title}</h2><p>演示版不提供这个页面。<br>Cette page n'est pas disponible dans la démo.</p></body>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

async function api(ctx, req, url) {
  const key = ctx.shop;
  let body = {};
  if (req.method !== "GET" && req.method !== "HEAD") { try { const t = await req.text(); body = t ? JSON.parse(t) : {}; } catch { body = {}; } }
  return serial(key, async () => {
    const s = await shop(key);
    const r = await s.handle(req.method, url.pathname.replace(/^.*?(\/api\/)/, "/api/"), url.searchParams, body, { remote: ctx.remote });
    if (req.method !== "GET") await idbPut(key, s.db);
    if (r.__raw) return new Response(r.text, { status: r.status, headers: { "Content-Type": r.type, "Cache-Control": "no-store" } });
    return JA(r.status, r.body);
  });
}
async function control(ctx, req, sub) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  return serial(ctx.shop, async () => {
    const s = await shop(ctx.shop);
    const r = await s.control(req.method, sub, body);
    if (req.method !== "GET") await idbPut(ctx.shop, s.db);
    return J(r.status, r.body);
  });
}

async function handle(e) {
  const req = e.request;
  const url = new URL(req.url);
  // 「网上点单链接」页面在 s/<店>/web/ 下，它的 ../../demo/inject.js 落到 s/demo/inject.js
  if (url.pathname.startsWith(BASE + "s/") && /\/demo\/inject\.js$/.test(url.pathname)) return fetch(BASE + "demo/inject.js");
  let ctx = parse(url.pathname);
  let rel = ctx && ctx.rel;
  if (!ctx) {
    // 页面里写死的绝对路径：/api/…、/uploads/…、/conformite.html（不在演示目录下）
    if (url.pathname.startsWith(BASE) && BASE !== "/") return fetch(req);
    ctx = await clientCtx(e.clientId);
    if (!ctx) return fetch(req);
    rel = url.pathname.replace(/^\//, "");
  }
  if (/^api\//.test(rel)) return api(ctx, req, url);
  if (/^demo-api\//.test(rel)) return control(ctx, req, rel.slice(9));
  if (/^uploads\/[\w.-]+$/.test(rel)) return fetch(BASE + "data/" + ctx.shop + "/" + rel);
  if (rel === "ws" || rel === "health") return J(200, { ok: true, demo: true });
  if (/\.html$/.test(rel) && !APP_PAGES.test(rel)) return NOTE("Gway POS");
  const r = await fetch(BASE + "app/" + rel + url.search);
  if (r.status === 404 && /\.html$/.test(rel)) return NOTE("Gway POS");
  return r;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(handle(e).catch((err) => J(500, { error: "演示出错：" + (err && err.message) })));
});
