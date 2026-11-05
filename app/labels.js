// 价签（店主 10-25「都改，设置多个模板」+ 手机扫码打价签）：排版、条码、转成打印机指令、蓝牙发送。
// 收银台（电脑）和手机打价签页（label-phone.html）共用这一份。
// 一张价签先画成一张图（canvas）：电脑预览、系统打印用这张图；手机蓝牙打印把同一张图转成打印机指令，
// 所以预览和打出来一模一样，中文也能打（字是浏览器画的，不靠打印机字库）。
// 模板的默认值和检查在服务端（src/lib/labelTemplates.js），这里只管画和打。
const Labels = (() => {
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif';
  // 代码里直接用的文字按当前界面语言（画在图上的字、报错）；双语时取外文那一行
  const lt = (zh) => (typeof I18N !== "undefined" && I18N.t ? String(I18N.t(zh)).split("\n").pop() : zh);
  const DPMM_300 = 300 / 25.4; // 300 dpi 每毫米的点数（不是整 12，按 12 算 60 毫米宽会多出 11 个点被裁掉）
  const defMoney = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

  // ---------- 条码：13 / 8 位数字用 EAN，其他用 CODE128（原来在 retail.js） ----------
  const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  const EAN_PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
  function eanBits(code) {
    if (code.length === 13) {
      const par = EAN_PAR[Number(code[0])];
      let bits = "101";
      for (let i = 1; i <= 6; i++) bits += (par[i - 1] === "L" ? EAN_L : EAN_G)[Number(code[i])];
      bits += "01010";
      for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
      return bits + "101";
    }
    let bits = "101";
    for (let i = 0; i < 4; i++) bits += EAN_L[Number(code[i])];
    bits += "01010";
    for (let i = 4; i < 8; i++) bits += EAN_R[Number(code[i])];
    return bits + "101";
  }
  function c128Bits(text) {
    const vals = [104, ...[...text].map((ch) => Math.max(0, Math.min(94, ch.charCodeAt(0) - 32)))];
    const check = vals.reduce((s, v, i) => s + v * (i || 1), 0) % 103;
    let bits = "";
    for (const v of [...vals, check, 106]) [...C128[v]].forEach((w, i) => (bits += (i % 2 ? "0" : "1").repeat(Number(w))));
    return bits;
  }
  const barBits = (code) => (/^\d{13}$|^\d{8}$/.test(code) ? eanBits(code) : c128Bits(code));
  const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  function barcodeSvg(code) {
    const bits = barBits(code);
    const n = bits.length + 20;
    let rects = "";
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") { let j = i; while (bits[j + 1] === "1") j++; rects += `<rect x="${i + 10}" y="0" width="${j - i + 1}" height="40"/>`; i = j; }
    return `<svg viewBox="0 0 ${n} 52" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}<text x="${n / 2}" y="51" font-size="10" text-anchor="middle" font-family="monospace">${escXml(code)}</text></svg>`;
  }

  // ---------- 一张价签画成图 ----------
  // 中文按字换行，外文按词换行；超过行数最后一行加「…」
  function wrap(ctx, text, maxW, maxLines) {
    const toks = String(text || "").match(/[⺀-鿿豈-﫿＀-￯]|[^\s⺀-鿿豈-﫿＀-￯]+|\s+/g) || [];
    const lines = [];
    let cur = "";
    for (const t of toks) {
      const next = cur + t;
      if (ctx.measureText(next.trim()).width <= maxW || !cur.trim()) { cur = next; continue; }
      lines.push(cur.trim());
      cur = /^\s+$/.test(t) ? "" : t;
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
    const used = lines.join("").replace(/\s/g, "").length;
    if (used < String(text || "").replace(/\s/g, "").length && lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last + "…";
    }
    // 一个词比整行还长（很长的外文词）：按字截断
    return lines.map((l) => { let x = l; while (x.length > 1 && ctx.measureText(x).width > maxW) x = x.slice(0, -2) + "…"; return x; });
  }
  // 价签语言（店主 10-26：打印的价签单独选语言，和界面语言无关）。画在图上的固定文字按这里，商品名由服务端翻好（localize）
  const LABEL_LANGS = [["zh", "中文"], ["fr", "Français"], ["en", "English"], ["es", "Español"], ["pt", "Português"]];
  const EXPIRY = { zh: "保质期至", fr: "À consommer jusqu'au", en: "Use by", es: "Consumir antes del", pt: "Consumir até" };
  function expiryText(days, lang = "fr", today = new Date()) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(days));
    const p = (n) => String(n).padStart(2, "0");
    const date = lang === "zh" ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    return `${EXPIRY[lang] || EXPIRY.fr} ${date}`;
  }
  // 按价签语言换商品名：url = 取译名的接口（电脑 /api/labels/names，手机 /api/label-drop/<key>/names），get = 带登录的取数函数
  // cache：调用方给的（一个价签窗口里用同一个，窗口关了就丢；不给就每次重新取），改了商品名 / 译名下次打开就是新的
  async function localize(jobs, lang, url, get, nameCache = new Map()) {
    const need = [...new Set(jobs.map((j) => j.item.id).filter((id) => id > 0 && !nameCache.has(`${lang}:${id}`)))];
    if (need.length) {
      const r = await get(`${url}?lang=${lang}&ids=${need.join(",")}`);
      for (const id of need) nameCache.set(`${lang}:${id}`, r[id] || null);
    }
    return jobs.map((j) => { const n = nameCache.get(`${lang}:${j.item.id}`); return n ? { ...j, item: { ...j.item, name: n.name, variant: n.variant } } : j; });
  }
  const unitOf = (g) => (g.weighed ? (g.unit === "l" ? "/L" : "/kg") : g.unit === "l" ? "/L" : "");

  // item：商品（name / variant / price_cents / weighed / unit / barcodes）；tpl：模板；opt：{ dpmm 每毫米几个点, store 店名, money 金额格式 }
  function draw(item, tpl, opt = {}) {
    const dpmm = opt.dpmm || 8, money = opt.money || defMoney;
    const W = Math.round(tpl.w * dpmm), H = Math.round(tpl.h * dpmm);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000"; ctx.textBaseline = "alphabetic";
    const s = tpl.show || {}, k = tpl.size || 1;
    const pad = Math.max(1.2, Math.min(tpl.w, tpl.h) * 0.05) * dpmm;
    const inW = W - 2 * pad;
    const code = s.barcode && (item.barcodes || [])[0];
    // 条码放不下（很长的字母条码 + 很窄的纸，每根细条不到 1 个点，打出来扫不出）：只印条码数字
    const bars = code && barBits(code).length <= inW;
    const bcH = bars ? Math.round(H * 0.27) : 0, digH = code ? Math.round(H * 0.085) : 0;
    const bottom = H - pad - bcH - digH - (code ? H * 0.02 : 0);
    // 价格一定要印上：先给价格留够地方（至少价签高的 18%）；不够就名字从 2 行减到 1 行，再不够不印店名、颜色尺码
    const nameFs = H * 0.115 * k, varFs = H * 0.09 * k;
    ctx.font = `700 ${nameFs}px ${FONT}`;
    let nameLines = s.name ? wrap(ctx, item.name, inW, 2) : [];
    let showVar = Boolean(s.variant && item.variant), storeH = s.store && opt.store ? H * 0.075 : 0;
    // 保质期（店主 10-26）：商品填了保质期天数、模板没关掉，就印「保质期至 打印当天 + N 天」（按价签语言）
    const exp = s.expiry !== 0 && item.shelf_days > 0 ? expiryText(item.shelf_days, opt.lang, opt.today) : "";
    let expH = exp ? H * 0.085 : 0;
    const tight = () => s.price && pad + nameLines.length * nameFs * 1.12 + (showVar ? varFs * 1.1 : 0) + storeH + expH + H * 0.18 > bottom;
    if (tight() && nameLines.length > 1) nameLines = wrap(ctx, item.name, inW, 1);
    if (tight()) storeH = 0;
    if (tight()) showVar = false;
    if (tight()) expH = 0;
    let y = pad;
    if (nameLines.length) {
      ctx.font = `700 ${nameFs}px ${FONT}`;
      for (const l of nameLines) { y += nameFs; ctx.fillText(l, pad, y - nameFs * 0.12); y += nameFs * 0.12; }
    }
    if (showVar) {
      ctx.font = `${varFs}px ${FONT}`;
      y += varFs; ctx.fillText(wrap(ctx, item.variant, inW, 1)[0] || "", pad, y - varFs * 0.12); y += varFs * 0.1;
    }
    if (s.price) {
      const area = Math.max(bottom - y - storeH - expH, H * 0.12);
      const unit = unitOf(item);
      let fs = Math.min(area * 0.92, H * 0.3 * k);
      const main = money(item.price_cents);
      const fit = () => { ctx.font = `700 ${fs}px ${FONT}`; const a = ctx.measureText(main).width; ctx.font = `700 ${fs * 0.45}px ${FONT}`; return a + (unit ? ctx.measureText(" " + unit).width : 0); };
      while (fs > 4 && fit() > inW) fs *= 0.92;
      const base = y + (area + fs * 0.75) / 2;
      ctx.font = `700 ${fs}px ${FONT}`;
      ctx.fillText(main, pad, base);
      if (unit) { const x = pad + ctx.measureText(main).width; ctx.font = `700 ${fs * 0.45}px ${FONT}`; ctx.fillText(" " + unit, x, base); }
    }
    if (expH) {
      let fs = H * 0.07;
      ctx.font = `700 ${fs}px ${FONT}`;
      while (fs > 4 && ctx.measureText(exp).width > inW) { fs *= 0.92; ctx.font = `700 ${fs}px ${FONT}`; }
      ctx.fillText(exp, pad, bottom - storeH - H * 0.012);
    }
    if (storeH) {
      const fs = H * 0.065;
      ctx.font = `${fs}px ${FONT}`;
      ctx.fillText(wrap(ctx, opt.store, inW, 1)[0] || "", pad, bottom - fs * 0.15);
    }
    if (bars) {
      const bits = barBits(code);
      // 每根细条至少 1 个点，尽量用整数个点（热敏机打出来不糊）
      const mod = Math.max(1, Math.floor(inW / (bits.length + 8)));
      const bw = bits.length * mod > inW ? inW / bits.length : mod;
      const x0 = Math.round((W - bits.length * bw) / 2), y0 = Math.round(H - pad - digH - bcH);
      for (let i = 0; i < bits.length; i++) if (bits[i] === "1") { let j = i; while (bits[j + 1] === "1") j++; ctx.fillRect(Math.round(x0 + i * bw), y0, Math.max(1, Math.round((j - i + 1) * bw)), bcH); i = j; }
    }
    if (code) {
      ctx.font = `${digH * 0.95}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(code, W / 2, H - pad - digH * 0.08);
      ctx.textAlign = "left";
    }
    return cv;
  }

  // ---------- 电脑：系统打印（A4 排版 / 标签纸一张一页） ----------
  // jobs：[{ item, copies }]
  // 一次最多打多少张（太多浏览器会卡死）；调用的地方先检查总张数
  const MAX_COPIES = 2000;
  // 每个商品只画一次，转成一个短的 blob: 地址，几百张同样的价签共用它（以前每张都塞一整份图片，几千张会把收银页卡死）
  function blobUrl(cv) {
    const bin = atob(cv.toDataURL("image/png").split(",")[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
    return url;
  }
  function printHtml(jobs, tpl, opt = {}) {
    const dpmm = DPMM_300; // 300 dpi：激光 / 喷墨打印机打出来字边清楚
    const imgs = [];
    for (const { item, copies } of jobs) {
      const src = blobUrl(draw(item, tpl, { ...opt, dpmm }));
      for (let i = 0; i < Math.max(1, Math.min(999, copies || 1)) && imgs.length < MAX_COPIES; i++) imgs.push(src);
    }
    const a4 = tpl.paper === "a4";
    const css = a4
      ? `@page { size: A4; margin: 8mm; } body { margin: 0; } .grid { display: flex; flex-wrap: wrap; gap: 2mm; }
         img { width: ${tpl.w}mm; height: ${tpl.h}mm; outline: 0.2mm dashed #999; break-inside: avoid; }`
      : `@page { size: ${tpl.w}mm ${tpl.h}mm; margin: 0; } body { margin: 0; } img { display: block; width: ${tpl.w}mm; height: ${tpl.h}mm; break-after: page; }`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>价签</title><style>${css}</style></head><body><div class="grid">${imgs.map((s) => `<img src="${s}">`).join("")}</div></body></html>`;
  }
  // 屏幕上的预览：每个商品一张（份数写在旁边）
  function previewInto(el, jobs, tpl, opt = {}) {
    ensureCss();
    el.textContent = "";
    el.classList.add("lb-grid");
    for (const { item, copies } of jobs) {
      const cv = draw(item, tpl, { ...opt, dpmm: 8 });
      cv.className = "lb-cv";
      cv.style.width = Math.min(260, tpl.w * 4.2) + "px";
      const box = document.createElement("div");
      box.className = "lb-card";
      box.appendChild(cv);
      const n = document.createElement("span");
      n.className = "lb-n";
      n.textContent = "× " + (copies || 1);
      box.appendChild(n);
      el.appendChild(box);
    }
  }

  // ---------- 蓝牙打印机指令 ----------
  // 画好的图 → 一位黑白点阵（每行按 8 点补齐），black(x, y) 为真 = 要打黑
  function bitmap(cv, padTo) {
    const W = cv.width, H = cv.height;
    const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
    const outW = Math.max(W, padTo || 0), wb = Math.ceil(outW / 8), off = Math.floor((outW - W) / 2);
    const rows = [];
    for (let y = 0; y < H; y++) {
      const row = new Uint8Array(wb);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 150) row[(x + off) >> 3] |= 0x80 >> ((x + off) & 7);
      }
      rows.push(row);
    }
    return { wb, h: H, rows };
  }
  const enc = (s) => new TextEncoder().encode(s);
  function concat(parts) {
    const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  // 标签机（TSPL：芯烨、佳博、汉印等大多数蓝牙 / USB 标签机）：每张价签一个 BITMAP，PRINT 1,份数
  function tspl(list, tpl, cfg = {}) {
    const parts = [];
    const gap = cfg.gap ?? 2, density = Math.max(0, Math.min(15, Number(cfg.density ?? 8)));
    for (const { cv, copies } of list) {
      const bm = bitmap(cv);
      parts.push(enc(`SIZE ${tpl.w} mm,${tpl.h} mm\r\nGAP ${gap} mm,0 mm\r\nDIRECTION 1\r\nDENSITY ${density}\r\nCLS\r\nBITMAP 0,0,${bm.wb},${bm.h},0,`));
      // TSPL 的 BITMAP：0 = 打黑，1 = 不打 → 取反
      const data = new Uint8Array(bm.wb * bm.h);
      bm.rows.forEach((r, y) => r.forEach((b, x) => (data[y * bm.wb + x] = ~b & 0xff)));
      parts.push(data);
      parts.push(enc(`\r\nPRINT 1,${Math.max(1, Math.min(999, copies || 1))}\r\n`));
    }
    return concat(parts);
  }
  // 小票机装标签纸（ESC/POS 图片）：按纸宽居中；每张打完往前走「间距」那么多（小票机不认标签缝）
  // 价签比纸宽（58 毫米小票机只有 384 点，50×30 的吊牌是 400 点）：按比例缩到纸宽，不然整张错位乱码
  function fitWidth(cv, dots) {
    if (cv.width <= dots) return cv;
    const out = document.createElement("canvas");
    out.width = dots; out.height = Math.round(cv.height * dots / cv.width);
    const c = out.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(cv, 0, 0, out.width, out.height);
    return out;
  }
  function escpos(list, tpl, cfg = {}) {
    const dots = Number(cfg.width) === 80 ? 576 : 384, dpmm = 8;
    const feed = Math.round((cfg.gap ?? 3) * dpmm);
    const parts = [new Uint8Array([0x1b, 0x40])];
    for (const { cv, copies } of list) {
      const bm = bitmap(fitWidth(cv, dots), dots);
      for (let c = 0; c < Math.max(1, Math.min(999, copies || 1)); c++) {
        // 一次最多 128 行（有的小票机缓存小，一整张大图会丢行）
        for (let y0 = 0; y0 < bm.h; y0 += 128) {
          const h = Math.min(128, bm.h - y0);
          parts.push(new Uint8Array([0x1d, 0x76, 0x30, 0x00, bm.wb & 0xff, bm.wb >> 8, h & 0xff, h >> 8]));
          for (let y = y0; y < y0 + h; y++) parts.push(bm.rows[y]);
        }
        for (let f = feed; f > 0; f -= 255) parts.push(new Uint8Array([0x1b, 0x4a, Math.min(255, f)]));
      }
    }
    return concat(parts);
  }
  // 打印机设置（手机上记住）：kind = tspl 标签机 / escpos 小票机；dpi 203 / 300；纸宽 58 / 80（小票机）；间距；浓度
  // 小票机每一张都要整张图发一遍（标签机只发一次 + 份数）：小票机一次最多 300 张
  const ESCPOS_MAX = 300;
  function commands(jobs, tpl, cfg = {}, opt = {}) {
    const n = jobs.reduce((a, j) => a + Math.max(1, Math.min(999, j.copies || 1)), 0);
    if (n > (cfg.kind === "escpos" ? ESCPOS_MAX : MAX_COPIES)) throw new Error(lt(`一次最多打 ${cfg.kind === "escpos" ? ESCPOS_MAX : MAX_COPIES} 张，请分几批打`));
    const dpmm = cfg.kind !== "escpos" && Number(cfg.dpi) === 300 ? DPMM_300 : 8;
    const list = jobs.map(({ item, copies }) => ({ cv: draw(item, tpl, { ...opt, dpmm }), copies }));
    return cfg.kind === "escpos" ? escpos(list, tpl, cfg) : tspl(list, tpl, cfg);
  }

  // ---------- 蓝牙：Gway 安卓 App（经典蓝牙 + BLE）或手机 Chrome（只有 BLE，要 https） ----------
  // 不用 agent.js：那个会把这台手机登记成收小票的打印点
  const appBridge = () => (window.PosBridge && typeof window.PosBridge.call === "function" ? window.PosBridge : null);
  const cbs = new Map();
  let seq = 0;
  function appCall(method, args = {}, ms = 30000) {
    const br = appBridge();
    if (!br) return Promise.reject(new Error("不在 Gway App 里"));
    if (!window.__posBridgeCb) {
      window.__posBridgeCb = (id, res) => {
        const c = cbs.get(id);
        if (!c) return;
        cbs.delete(id); clearTimeout(c.t);
        const r = typeof res === "string" ? JSON.parse(res) : res;
        r && r.ok ? c.ok(r.data) : c.no(new Error((r && r.error) || "操作失败"));
      };
    }
    return new Promise((ok, no) => {
      const id = "lb" + ++seq;
      cbs.set(id, { ok, no, t: setTimeout(() => { cbs.delete(id); no(new Error("App 没有回应")); }, ms) });
      br.call(method, JSON.stringify(args), id);
    });
  }
  // 常见蓝牙打印机的 BLE 服务（手机 Chrome 只能连声明过的服务）
  const BLE_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "0000ff00-0000-1000-8000-00805f9b34fb", "0000ffe0-0000-1000-8000-00805f9b34fb", "0000fee7-0000-1000-8000-00805f9b34fb",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "0000ae30-0000-1000-8000-00805f9b34fb", "0000ff80-0000-1000-8000-00805f9b34fb"];
  let web = null; // { device, ch }
  const bt = {
    mode: () => (appBridge() ? "app" : navigator.bluetooth ? "web" : null),
    async list() { return appCall("list"); },
    async scan() { return appCall("scan", {}, 30000); },
    async connect(address) { return appCall("connect", { address }, 40000); },
    async status() {
      if (appBridge()) return appCall("status");
      return { connected: Boolean(web && web.device.gatt.connected), name: web?.device?.name || null };
    },
    // 手机 Chrome：弹出系统的选蓝牙设备窗口，找一个能写的特征值
    async webConnect() {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
      const server = await device.gatt.connect();
      let ch = null;
      for (const svc of await server.getPrimaryServices()) {
        for (const c of await svc.getCharacteristics()) if (c.properties.writeWithoutResponse || c.properties.write) { ch = c; break; }
        if (ch) break;
      }
      if (!ch) throw new Error("这台打印机没有可以写入的通道（可能不是打印机，或者只能用经典蓝牙：请用「Gway 点单」App）");
      web = { device, ch };
      return { connected: true, name: device.name || "" };
    },
    async send(bytes) {
      if (appBridge()) {
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return appCall("print", { data: btoa(bin) }, 120000);
      }
      if (!web || !web.device.gatt.connected) throw new Error("打印机没连上");
      const noResp = web.ch.properties.writeWithoutResponse;
      for (let i = 0; i < bytes.length; i += 180) {
        const part = bytes.subarray(i, i + 180);
        if (noResp) { await web.ch.writeValueWithoutResponse(part); if ((i / 180) % 8 === 7) await new Promise((r) => setTimeout(r, 20)); }
        else await web.ch.writeValue(part);
      }
    },
  };

  // 编辑器、预览的样式（电脑和手机共用，第一次用时加到页面上）
  function ensureCss() {
    if (document.getElementById("lbCss")) return;
    const st = document.createElement("style");
    st.id = "lbCss";
    st.textContent = `
      .lb-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
      .lb-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
      .lb-card { position: relative; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
      .lb-cv { display: block; height: auto; border: 1px solid #c9c2b8; border-radius: 4px; background: #fff; box-shadow: 0 2px 8px -4px rgba(0,0,0,.3); }
      .lb-n { font-size: 13px; font-weight: 700; color: #6b6259; }
      .lbe { display: flex; flex-direction: column; gap: 12px; }
      .lbe-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .lbe-list .btn.on { background: var(--accent, #c2410c); border-color: var(--accent, #c2410c); color: #fff; }
      .lbe-form { display: flex; flex-direction: column; gap: 10px; }
      .lbe-f { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .lbe-f > span:first-child { min-width: 96px; font-size: 13px; color: #6b6259; }
      .lbe-f input[type=text] { flex: 1; min-width: 160px; }
      .lbe-wh input { width: 70px; }
      .lbe-quick { display: inline-flex; flex-wrap: wrap; gap: 4px; }
      .lbe-checks { display: flex; flex-wrap: wrap; gap: 6px 14px; }
      .lbe-checks label { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; }
      .lbe-prev { padding: 12px; background: #efe9e1; border-radius: 10px; display: flex; justify-content: center; }
      .lbe-prev canvas { display: block; height: auto; background: #fff; box-shadow: 0 2px 10px -4px rgba(0,0,0,.35); }`;
    document.head.appendChild(st);
  }

  // ---------- 模板编辑（电脑弹窗和手机页共用）：左边选模板，右边改，下面实时预览 ----------
  // 画在图上的字不会被界面翻译：示例商品名按当前界面语言取（双语时取外文那一行）
  const sample = () => ({ name: lt("示例商品"), variant: "M", price_cents: 1290, weighed: false, unit: "pc", barcodes: ["2000000000213"], shelf_days: 3 }); // 示例带保质期：预览里看得到这一行
  const SIZES = [[0.85, "小"], [1, "中"], [1.2, "大"]];
  const FIELD_LABELS = [["name", "商品名"], ["variant", "颜色 / 尺码"], ["price", "价格"], ["store", "店名"], ["barcode", "条码"], ["expiry", "保质期（商品填了才印）"]];
  const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // el：放编辑器的容器；list：模板（会复制一份）；opt：{ store, money, sel }。返回 { get() 改好的模板 }
  function editor(el, list, opt = {}) {
    ensureCss();
    const ts = list.map((t) => ({ ...t, show: { ...t.show } }));
    let cur = Math.max(0, ts.findIndex((t) => t.id === opt.sel));
    const render = () => {
      const t = ts[cur];
      el.innerHTML = `<div class="lbe">
        <div class="lbe-list">${ts.map((x, i) => `<button type="button" class="btn small ${i === cur ? "on" : ""}" data-lbi="${i}">${escH(x.name)}</button>`).join("")}
          <button type="button" class="btn small" data-lbadd ${ts.length >= 12 ? "disabled" : ""}>＋ 新模板</button></div>
        <div class="lbe-form">
          <label class="lbe-f"><span>名称</span><input type="text" maxlength="30" data-lbk="name" value="${escH(t.name)}"></label>
          <div class="lbe-f"><span>纸张</span><div class="seg"><button type="button" data-lbp="roll" class="${t.paper === "roll" ? "on" : ""}">标签纸（一张一张）</button><button type="button" data-lbp="a4" class="${t.paper === "a4" ? "on" : ""}">A4 纸（排满一页）</button></div></div>
          <div class="lbe-f lbe-wh"><span>每张大小（毫米）</span><input type="number" inputmode="decimal" min="20" max="190" step="1" data-lbk="w" value="${t.w}" aria-label="宽"> × <input type="number" inputmode="decimal" min="12" max="150" step="1" data-lbk="h" value="${t.h}" aria-label="高">
            <span class="lbe-quick">${[[40, 30], [50, 30], [60, 40], [70, 50]].map(([w, h]) => `<button type="button" class="btn small" data-lbwh="${w}x${h}">${w}×${h}</button>`).join("")}</span></div>
          <div class="lbe-f"><span>字号</span><div class="seg">${SIZES.map(([v, l]) => `<button type="button" data-lbs="${v}" class="${Math.abs((t.size || 1) - v) < 0.06 ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="lbe-f"><span>印哪些</span><div class="lbe-checks">${FIELD_LABELS.map(([k, l]) => `<label><input type="checkbox" data-lbf="${k}" ${(t.show[k] ?? (k === "expiry" ? 1 : 0)) ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
          <div class="lbe-prev"></div>
          ${ts.length > 1 ? `<button type="button" class="btn small danger" data-lbdel>删除这个模板</button>` : ""}
        </div></div>`;
      const pv = el.querySelector(".lbe-prev");
      const cv = draw(sample(), t, { dpmm: 8, store: opt.store || "Gway", money: opt.money, lang: opt.lang });
      cv.style.width = Math.min(300, t.w * 5) + "px";
      pv.appendChild(cv);
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !el.contains(b)) return;
      const t = ts[cur];
      if (b.dataset.lbi) cur = Number(b.dataset.lbi);
      else if (b.hasAttribute("data-lbadd")) { ts.push({ ...t, id: "t" + Date.now().toString(36), name: t.name + " 2", show: { ...t.show } }); cur = ts.length - 1; }
      else if (b.hasAttribute("data-lbdel")) { ts.splice(cur, 1); cur = 0; }
      else if (b.dataset.lbp) { t.paper = b.dataset.lbp; if (t.paper === "roll") { t.w = Math.min(t.w, 110); t.h = Math.min(t.h, 150); } }
      else if (b.dataset.lbs) t.size = Number(b.dataset.lbs);
      else if (b.dataset.lbwh) { const [w, h] = b.dataset.lbwh.split("x").map(Number); t.w = w; t.h = h; }
      else return;
      render();
    });
    el.addEventListener("change", (e) => {
      const t = ts[cur], x = e.target;
      if (x.dataset.lbf) t.show[x.dataset.lbf] = x.checked ? 1 : 0;
      else if (x.dataset.lbk === "w" || x.dataset.lbk === "h") t[x.dataset.lbk] = Math.max(12, Math.min(190, Number(x.value) || t[x.dataset.lbk]));
      else return;
      render();
    });
    el.addEventListener("input", (e) => {
      if (e.target.dataset.lbk !== "name") return;
      ts[cur].name = e.target.value;
      const chip = el.querySelector(`[data-lbi="${cur}"]`);
      if (chip) chip.textContent = e.target.value || "…";
    });
    render();
    return { get: () => ts.map((t) => ({ ...t, name: (t.name || "").trim() })) };
  }

  return { MAX_COPIES, LABEL_LANGS, localize, barcodeSvg, draw, printHtml, previewInto, commands, tspl, escpos, bt, editor };
})();
