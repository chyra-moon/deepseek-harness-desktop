"use strict";

/**
 * 启动 / 恢复状态页:DeepSeek 鲸鱼光点动画。
 * 一比一还原官方鲸鱼图标轮廓,整个鲸鱼实心区域由白/蓝两色光点填充
 * (拒绝采样内部 + 路径采样轮廓),呼吸式缓慢起伏,纯 canvas,无图片资源。
 */

/** 官方 favicon 同款鲸鱼轮廓(viewBox 0 0 50 50)。 */
const WHALE_PATH =
  "M48.8 10c-.5-.2-.7.3-1 .5-.1.1-.2.2-.3.3-.8.8-1.7 1.4-2.8 1.3-1.7-.1-3.1.4-4.4 1.7-.3-1.6-1.2-2.5-2.5-3.1-.7-.4-1.4-.7-1.9-1.4-.4-.5-.5-1-.6-1.6-.1-.3-.2-.6-.6-.7-.4-.1-.6.3-.7.5-.6 1.2-.9 2.5-.9 3.8.1 3 1.3 5.3 3.7 7-.3.2-.3.4-.4.7-.2.6-.4 1.1-.5 1.7-.1.4-.3.4-.7.3-1.3-.6-2.5-1.4-3.5-2.4-1.7-1.7-3.3-3.6-5.2-5.1-.5-.3-.9-.7-1.4-1-2-2 .2-3.6.8-3.8.5-.2.1-.9-1.6-.9-3.4 0-1.6.6-3.7 1.4-.3.1-.6.2-1 .3-1.8-.4-3.8-.5-5.8-.2-3.8.4-6.8 2.2-9 5.4-2.7 3.8-3.3 8-2.6 12.5.8 4.7 3.2 8.6 6.8 11.6 3.7 3.2 8 4.7 13 4.4 3-.2 6.3-.6 10-3.8 1 .5 2 .7 3.6.8 1.3.1 2.5-.1 3.4-.3 1.5-.3 1.4-1.7.9-1.9-4.4-2.1-3.4-1.2-4.3-1.9 2.2-2.7 5.6-5.4 6.9-14.4.1-.7 0-1.2 0-1.7 0-.4.1-.5.5-.6 1.1-.1 2.1-.4 3.1-1 2.8-1.5 3.9-4.1 4.2-7.2 0-.5 0-1-.5-1.2z";

function buildStatusHtml(title, detail) {
  const t = JSON.stringify(String(title || ""));
  const d = JSON.stringify(String(detail || ""));
  const whale = JSON.stringify(WHALE_PATH);
  return `<!doctype html><html><head><meta charset="utf-8"><title>DeepSeek Harness</title>
<style>
  html,body{height:100%;margin:0;overflow:hidden;background:#0b0e14}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,"Segoe UI","Microsoft YaHei",sans-serif;user-select:none}
  svg{position:absolute;left:-9999px;top:0}
  canvas{display:block}
  .t{color:#e6edf3;font-size:20px;font-weight:600;margin-top:30px;letter-spacing:.5px}
  .d{color:#8b949e;font-size:13px;margin-top:8px;opacity:.9;text-align:center;max-width:540px;line-height:1.7;padding:0 20px}
</style></head><body>
<svg width="60" height="60" viewBox="0 0 50 50"><path id="whale" d="${WHALE_PATH}"/></svg>
<canvas id="cv"></canvas>
<div class="t"><span id="tt"></span><span id="dots"></span></div>
<div class="d" id="dd"></div>
<script>
(function () {
  var TITLE = ${t};
  var DETAIL = ${d};
  var WHALE = ${whale};
  var path = document.getElementById("whale");
  var cv = document.getElementById("cv");
  var ctx = cv.getContext("2d");
  var tt = document.getElementById("tt");
  var dd = document.getElementById("dd");
  var dotsEl = document.getElementById("dots");
  tt.textContent = TITLE;
  dd.textContent = DETAIL;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var SIZE = Math.max(220, Math.min(400, window.innerWidth - 40, window.innerHeight * 0.52));
  cv.style.width = SIZE + "px";
  cv.style.height = SIZE + "px";
  cv.width = Math.floor(SIZE * DPR);
  cv.height = Math.floor(SIZE * DPR);

  var shape = new Path2D(WHALE);

  // --- 光点采样 ---
  // 内部实心:在 50x50 包围盒内拒绝采样,只保留鲸鱼体内的点
  var inner = [];
  var tries = 0;
  while (inner.length < 420 && tries < 20000) {
    tries++;
    var x = Math.random() * 50;
    var y = Math.random() * 50;
    if (ctx.isPointInPath(shape, x, y)) inner.push({ x: x, y: y });
  }
  // 轮廓:沿路径等距采样,勾勒清晰剪影
  var outline = [];
  var L = path.getTotalLength();
  for (var i = 0; i < 110; i++) {
    var p = path.getPointAtLength((i / 110) * L);
    outline.push({ x: p.x, y: p.y });
  }
  // 组装全部光点:白/蓝混色,内部点带随机半径与相位,轮廓点小而亮
  var dots = [];
  for (var i = 0; i < inner.length; i++) {
    var d = inner[i];
    dots.push({
      x: d.x, y: d.y,
      r: 0.32 + Math.random() * 0.38,
      white: Math.random() < 0.32,
      ph: Math.random() * 6.2832,
      sp: 0.6 + Math.random() * 1.2,
    });
  }
  for (var j = 0; j < outline.length; j++) {
    var o = outline[j];
    dots.push({
      x: o.x, y: o.y,
      r: 0.24 + Math.random() * 0.22,
      white: Math.random() < 0.55,
      ph: Math.random() * 6.2832,
      sp: 0.6 + Math.random() * 1.2,
    });
  }

  // --- 光点精灵(径向渐变,避免逐帧 shadowBlur 的性能开销) ---
  function makeSprite(rgb) {
    var s = document.createElement("canvas");
    s.width = s.height = 32;
    var g = s.getContext("2d");
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(" + rgb + ",1)");
    grad.addColorStop(0.3, "rgba(" + rgb + ",0.85)");
    grad.addColorStop(0.65, "rgba(" + rgb + ",0.22)");
    grad.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return s;
  }
  var spriteBlue = makeSprite("77,107,254");
  var spriteWhite = makeSprite("234,240,255");

  var s = SIZE / 50;
  var CX = 25, CY = 25;
  var start = performance.now();
  var BREATH = 2.4; // 呼吸周期(秒):缓慢起伏

  function frame(now) {
    var t = (now - start) / 1000;
    var phase = t * 2 * Math.PI / BREATH;
    var k = 1 + 0.045 * Math.sin(phase);          // 整体呼吸缩放
    var breathe = 0.5 + 0.5 * Math.sin(phase);    // 亮度随呼吸同步
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.scale(k * s, k * s);
    ctx.translate(-CX, -CY);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var tw = 0.5 + 0.5 * Math.sin(t * d.sp + d.ph);
      var alpha = Math.min(0.95, 0.3 + 0.4 * breathe + 0.25 * tw);
      var core = d.r * 1.35 * (0.9 + 0.12 * tw); // 亮核半径(50 坐标系)
      var G = core * 3;                           // 含渐隐的光晕半径
      ctx.globalAlpha = alpha;
      ctx.drawImage(d.white ? spriteWhite : spriteBlue, d.x - G, d.y - G, G * 2, G * 2);
    }
    ctx.restore();
    var dp = Math.floor(t / 0.4) % 4;
    dotsEl.textContent = dp === 0 ? "" : dp === 1 ? "." : dp === 2 ? ".." : "...";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script></body></html>`;
}

module.exports = { buildStatusHtml };
