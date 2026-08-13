"use strict";

/**
 * 由官方前端 favicon.svg 生成应用图标:
 *   assets/icon.png   (512x512, 窗口/打包用)
 *   assets/tray.png   (32x32, 托盘)
 *   assets/tray@2x.png(64x64, 高分屏托盘)
 *
 * 用法:npm run icon
 */
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "assets");

function resolveFavicon() {
  try {
    const pkg = require.resolve("@deepseek-ai/dsh-web-frontend/package.json");
    return path.join(path.dirname(pkg), "dist", "favicon.svg");
  } catch {
    // 开发环境回退:npx 缓存里的官方前端
    const alt = path.join(
      process.env.LOCALAPPDATA,
      "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules",
      "@deepseek-ai", "dsh-web-frontend", "dist", "favicon.svg");
    return fs.existsSync(alt) ? alt : null;
  }
}

async function renderIcon(svg) {
  // 方案 A:nativeImage 直接解码 SVG(部分版本支持)
  const viaNative = nativeImage.createFromDataURL(
    "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"));
  if (!viaNative.isEmpty() && viaNative.getSize().width > 100) return viaNative;

  // 方案 B:离屏窗口渲染后截图
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false,
    transparent: true, backgroundColor: "#00000000",
    webPreferences: { offscreen: true },
  });
  const dataUrl = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  await win.loadURL(dataUrl);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  win.destroy();
  if (img.isEmpty()) throw new Error("图标渲染失败");
  return img;
}

app.whenReady().then(async () => {
  const src = resolveFavicon();
  if (!src) {
    console.error("找不到官方 favicon.svg,请先安装 @deepseek-ai/dsh");
    app.exit(1);
    return;
  }
  // 统一 512 画布 + 白色前景(官方深色主题观感),透明背景
  let svg = fs.readFileSync(src, "utf8");
  svg = svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="512" height="512"');
  if (!svg.includes("#fff")) {
    svg = svg.replace(/<style>/, "<style>path{fill:#fff!important}");
    svg = svg.replace(/<\/style>/, "</style>");
  } else if (!svg.includes("path{fill")) {
    svg = svg.replace(/<style>/, "<style>path{fill:#fff!important}");
  }

  const img = await renderIcon(svg);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "icon.png"), img.resize({ width: 512, height: 512 }).toPNG());
  fs.writeFileSync(path.join(OUT_DIR, "icon-256.png"), img.resize({ width: 256, height: 256 }).toPNG());
  fs.writeFileSync(path.join(OUT_DIR, "tray.png"), img.resize({ width: 32, height: 32 }).toPNG());
  fs.writeFileSync(path.join(OUT_DIR, "tray@2x.png"), img.resize({ width: 64, height: 64 }).toPNG());
  console.log("图标已生成:", OUT_DIR);
  app.exit(0);
});
