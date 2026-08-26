"use strict";

/**
 * ensure-icon —— 打包前检查应用图标是否存在,缺失时自动生成。
 *
 * assets/icon.png 等被 .gitignore 排除(由 npm run icon 生成),新克隆的仓库
 * 直接打包会缺图标(只有警告不致命,但图标缺失体验差)。这里在 package:app
 * 之前自动补上:调 npm run icon(经 Electron offscreen 渲染官方 favicon)。
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const needs = [
  "icon.png",
  "icon-256.png",
  "tray.png",
  "tray@2x.png",
].map((name) => path.join(root, "assets", name));

const missing = needs.filter((p) => !fs.existsSync(p));
if (missing.length === 0) {
  console.log("[ensure-icon] 图标已存在,跳过生成。");
  process.exit(0);
}

console.log(`[ensure-icon] 缺失 ${missing.length} 个图标,自动生成…`);
try {
  execSync("electron scripts/make-icon.js", {
    cwd: root, stdio: "inherit", windowsHide: true,
  });
} catch (e) {
  console.error(`[ensure-icon] 生成失败: ${(e && e.message) || e}`);
  console.error("[ensure-icon] 可先手动执行 npm run icon,或确认 assets 目录可写。");
  process.exit(1);
}
