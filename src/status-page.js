"use strict";

/**
 * 启动 / 恢复状态页:DeepSeek 鲸鱼光点动画。
 * 形状 1:1 取自官方 favicon.svg(src/whale-path.json,由 scripts/gen-whale-path.js 生成),
 * 含身体 / 肚皮 / 眼睛 / 水花四段子路径;身体与水花用蓝光点实心填充,
 * 肚皮与眼睛留白(白底透出),轮廓混白色光点描边;呼吸式缓慢起伏;
 * 白底 + 深色文字;性能:光点烘焙进离屏画布,每帧仅 2 次 drawImage。
 */

const FALLBACK_PATH =
  "M48.8 10c-.5-.2-.7.3-1 .5-.1.1-.2.2-.3.3-.8.8-1.7 1.4-2.8 1.3-1.7-.1-3.1.4-4.4 1.7-.3-1.6-1.2-2.5-2.5-3.1-.7-.4-1.4-.7-1.9-1.4-.4-.5-.5-1-.6-1.6-.1-.3-.2-.6-.6-.7-.4-.1-.6.3-.7.5-.6 1.2-.9 2.5-.9 3.8.1 3 1.3 5.3 3.7 7-.3.2-.3.4-.4.7-.2.6-.4 1.1-.5 1.7-.1.4-.3.4-.7.3-1.3-.6-2.5-1.4-3.5-2.4-1.7-1.7-3.3-3.6-5.2-5.1-.5-.3-.9-.7-1.4-1-2-2 .2-3.6.8-3.8.5-.2.1-.9-1.6-.9-3.4 0-1.6.6-3.7 1.4-.3.1-.6.2-1 .3-1.8-.4-3.8-.5-5.8-.2-3.8.4-6.8 2.2-9 5.4-2.7 3.8-3.3 8-2.6 12.5.8 4.7 3.2 8.6 6.8 11.6 3.7 3.2 8 4.7 13 4.4 3-.2 6.3-.6 10-3.8 1 .5 2 .7 3.6.8 1.3.1 2.5-.1 3.4-.3 1.5-.3 1.4-1.7.9-1.9-4.4-2.1-3.4-1.2-4.3-1.9 2.2-2.7 5.6-5.4 6.9-14.4.1-.7 0-1.2 0-1.7 0-.4.1-.5.5-.6 1.1-.1 2.1-.4 3.1-1 2.8-1.5 3.9-4.1 4.2-7.2 0-.5 0-1-.5-1.2z";

let WHALE = null;
try {
  WHALE = require("./whale-path.json");
} catch { /* 首次开发未生成时退回纯轮廓 */ }

function buildStatusHtml(title, detail) {
  const t = JSON.stringify(String(title || ""));
  const d = JSON.stringify(String(detail || ""));
  const shapes = WHALE || { body: FALLBACK_PATH, belly: "", eye: "", spout: "" };
  const body = JSON.stringify(shapes.body || "");
  const belly = JSON.stringify(shapes.belly || "");
  const eye = JSON.stringify(shapes.eye || "");
  const spout = JSON.stringify(shapes.spout || "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>DeepSeek Harness</title>
<style>
  html,body{height:100%;margin:0;overflow:hidden;background:#ffffff}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,"Segoe UI","Microsoft YaHei",sans-serif;user-select:none}
  svg{position:absolute;left:-9999px;top:0}
  canvas{display:block}
  .t{color:#1f2328;font-size:20px;font-weight:600;margin-top:30px;letter-spacing:.5px}
  .d{color:#57606a;font-size:13px;margin-top:8px;opacity:.9;text-align:center;max-width:540px;line-height:1.7;padding:0 20px}
  .prog-wrap{display:none;flex-direction:column;align-items:center;width:300px;max-width:80vw;margin-top:22px}
  .prog{width:100%;height:6px;border-radius:999px;background:#e8edf7;position:relative;overflow:hidden}
  .prog-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#4d6bfe,#7aa0ff);box-shadow:0 0 14px rgba(77,107,254,.45);position:relative;transition:width .2s ease-out}
  .prog-fill::after{content:"";position:absolute;top:0;left:-40%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:pb-sweep 1.5s ease-in-out infinite}
  @keyframes pb-sweep{0%{left:-40%}100%{left:100%}}
  .prog-meta{color:#57606a;font-size:12px;margin-top:8px;opacity:.9}
</style></head><body>
<svg width="60" height="60" viewBox="0 0 50 50">
  <path id="p0" d=${body}></path>
  <path id="p1" d=${belly}></path>
  <path id="p2" d=${eye}></path>
  <path id="p3" d=${spout}></path>
</svg>
<canvas id="cv"></canvas>
<div class="t"><span id="tt"></span><span id="dots"></span></div>
<div class="d" id="dd"></div>
<div class="prog-wrap" id="pw"><div class="prog"><div class="prog-fill" id="pb"></div></div><div class="prog-meta" id="pm"></div></div>
<script>
(function () {
  var TITLE = ${t};
  var DETAIL = ${d};
  var BODY = ${body};
  var BELLY = ${belly};
  var EYE = ${eye};
  var SPOUT = ${spout};
  var cv = document.getElementById("cv");
  var ctx = cv.getContext("2d");
  var tt = document.getElementById("tt");
  var dd = document.getElementById("dd");
  var dotsEl = document.getElementById("dots");
  var pw = document.getElementById("pw");
  var pb = document.getElementById("pb");
  var pm = document.getElementById("pm");
  tt.textContent = TITLE;
  dd.textContent = DETAIL;

  // --- 供主进程实时更新(executeJavaScript 调用) ---
  function fmtSpeed(bps) {
    if (bps >= 1048576) return (bps / 1048576).toFixed(1) + " MB/s";
    if (bps >= 1024) return Math.round(bps / 1024) + " KB/s";
    return Math.round(bps) + " B/s";
  }
  function fmtSize(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
    if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
    if (b >= 1024) return Math.round(b / 1024) + " KB";
    return Math.round(b) + " B";
  }
  window.__setStatus = function (title, detail) {
    tt.textContent = title || "";
    dd.textContent = detail || "";
  };
  window.__setProgress = function (p) {
    if (!pw || !pb) return;
    var pct = Math.max(0, Math.min(100, +(p && p.percent) || 0));
    pw.style.display = "flex";
    pb.style.width = pct + "%";
    dd.textContent = ""; // 清除残留的初始详情行
    var meta = pct.toFixed(0) + "%";
    if (p && p.speed) meta += " · " + fmtSpeed(p.speed);
    if (p && p.transferred && p.total) meta += " · " + fmtSize(p.transferred) + " / " + fmtSize(p.total);
    pm.textContent = meta;
  };

  try {

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var SIZE = Math.max(220, Math.min(400, window.innerWidth - 40, window.innerHeight * 0.52));
  cv.style.width = SIZE + "px";
  cv.style.height = SIZE + "px";
  cv.width = Math.floor(SIZE * DPR);
  cv.height = Math.floor(SIZE * DPR);

  var bodyP = BODY ? new Path2D(BODY) : null;
  var bellyP = BELLY ? new Path2D(BELLY) : null;
  var eyeP = EYE ? new Path2D(EYE) : null;
  var spoutP = SPOUT ? new Path2D(SPOUT) : null;

  // --- 光点采样(小光点,数量加密以保持形体完整) ---
  function fill(shape, n, excludes, rmin, rmax, extra) {
    var pts = [];
    var tries = 0, cap = n * 60;
    while (pts.length < n && tries < cap) {
      tries++;
      var x = Math.random() * 50;
      var y = Math.random() * 50;
      if (!ctx.isPointInPath(shape, x, y)) continue;
      var skip = false;
      for (var e = 0; excludes && e < excludes.length; e++) {
        if (excludes[e] && ctx.isPointInPath(excludes[e], x, y)) { skip = true; break; }
      }
      if (!skip && extra && extra(x, y)) skip = true;
      if (skip) continue;
      pts.push({ x: x, y: y, r: rmin + Math.random() * (rmax - rmin), white: false, ph: Math.random() * 6.2832, sp: 0.5 + Math.random() * 1.2 });
    }
    return pts;
  }
  function ring(id, n, rmin, rmax, whiteRatio) {
    var out = [];
    var el = document.getElementById(id);
    if (!el || !el.getTotalLength || el.getTotalLength() === 0) return out;
    var L = el.getTotalLength();
    for (var i = 0; i < n; i++) {
      var p = el.getPointAtLength((i / n) * L);
      out.push({ x: p.x, y: p.y, r: rmin + Math.random() * (rmax - rmin), white: Math.random() < whiteRatio, ph: Math.random() * 6.2832, sp: 0.5 + Math.random() * 1.2 });
    }
    return out;
  }

  // 官方图标构成:身体(逆时针外轮廓) + 肚皮/眼睛/水花三处顺时针镂空
  // (nonzero 填充规则下即白色孔洞)。渲染 = 蓝光点身体 + 三处留白孔洞。
  var dots = [];
  if (bodyP) {
    dots = dots.concat(fill(bodyP, 720, [bellyP, eyeP, spoutP], 0.18, 0.40, function (x, y) {
      // 眼睛孔太小,周围光点辉光会糊住它 —— 眼睛中心(26.96, 24.6)外扩到 0.95 全部留白
      var dx = x - 26.96, dy = y - 24.6;
      return dx * dx + dy * dy < 0.95 * 0.95;
    }));
  }
  if (bodyP) dots = dots.concat(ring("p0", 170, 0.14, 0.26, 0.35));

  // --- 光点精灵:白核+淡蓝晕(白底可见) / 蓝核+蓝晕 ---
  function sprite(rgbCore, rgbGlow) {
    var sp = document.createElement("canvas");
    sp.width = sp.height = 32;
    var g = sp.getContext("2d");
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(" + rgbCore + ",1)");
    grad.addColorStop(0.25, "rgba(" + rgbCore + ",0.9)");
    grad.addColorStop(0.6, "rgba(" + rgbGlow + ",0.25)");
    grad.addColorStop(1, "rgba(" + rgbGlow + ",0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return sp;
  }
  var spriteBlue = sprite("77,107,254", "77,107,254");
  var spriteWhite = sprite("255,255,255", "154,179,255");

  // --- 烘焙离屏画布(性能:每帧只画 2 次) ---
  // 鲸鱼缩到画布 90%,留出呼吸放大的余量,避免边缘被裁剪
  var s = (SIZE / 50) * 0.90;
  var CX = 25, CY = 25;
  function bake(subset) {
    var off = document.createElement("canvas");
    off.width = cv.width;
    off.height = cv.height;
    var g = off.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.scale(s, s);
    g.translate(-CX, -CY);
    var list = subset || dots;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var core = d.r * 1.5;
      var G = core * (d.g || 2.3);
      g.globalAlpha = 1;
      g.drawImage(d.white ? spriteWhite : spriteBlue, d.x - G, d.y - G, G * 2, G * 2);
    }
    g.restore();
    return off;
  }
  var baseOff = bake();
  var twinkles = [];
  for (var k2 = 0; k2 < dots.length; k2++) {
    if (k2 % 4 === 0 || dots[k2].white) twinkles.push(dots[k2]);
  }
  var twOff = bake(twinkles);

  var start = performance.now();
  var BREATH = 2.4; // 呼吸周期(秒)
  window.__whaleFrames = 0; // 诊断计数器(无害,可留)

  function frame(now) {
    window.__whaleFrames++;
    var t = (now - start) / 1000;
    var phase = t * 2 * Math.PI / BREATH;
    var k = 1 + 0.04 * Math.sin(phase);
    var twA = 0.3 + 0.25 * Math.sin(t * 1.7);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.scale(k, k);
    ctx.drawImage(baseOff, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
    ctx.globalAlpha = Math.max(0.05, Math.min(0.75, twA));
    ctx.drawImage(twOff, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
    ctx.restore();
    var dp = Math.floor(t / 0.4) % 4;
    dotsEl.textContent = dp === 0 ? "" : dp === 1 ? "." : dp === 2 ? ".." : "...";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  } catch (e) {
    try { console.error("[whale-status]", e && (e.stack || e.message)); } catch (e2) { /* ignore */ }
  }
})();
</script></body></html>`;
}

module.exports = { buildStatusHtml };
