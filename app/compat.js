// 浏览器太旧（IE、Chrome 80 以前）：收银系统的页面跑不起来，只会弹「脚本错误」。
// 这里用最老的写法（IE 也能运行）先检查一下，太旧就显示一句看得懂的提示，后面的页面内容不再加载。
// Win7 上最高能装 Chrome 109 / Edge 109，都可以正常使用。
(function () {
  var ok = true;
  try { new Function("var a = {}; return a?.b ?? `${1}`;")(); } catch (e) { ok = false; }
  if (ok) return;
  document.write(
    '<div style="font:18px/1.8 sans-serif;padding:40px;max-width:720px;margin:auto;color:#222">' +
    "<h2>浏览器版本太旧，打不开收银系统</h2>" +
    "请用 <b>Google Chrome</b> 或 <b>Microsoft Edge</b> 浏览器打开。<br>" +
    "Windows 7 电脑请安装 Chrome 109 版（Win7 能装的最后一个版本），装好后重新打开收银系统。" +
    '<hr style="margin:24px 0;border:0;border-top:1px solid #ddd">' +
    "Navigateur trop ancien : veuillez utiliser Google Chrome ou Microsoft Edge (Chrome 109 sous Windows 7).<br>" +
    "Browser too old: please use Google Chrome or Microsoft Edge (Chrome 109 on Windows 7)." +
    '</div><plaintext style="display:none">'
  );
})();
