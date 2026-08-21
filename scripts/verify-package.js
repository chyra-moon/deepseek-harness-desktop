"use strict";

/**
 * verify-package —— 打包产物完整性校验。
 * 检查 release/DeepSeek Harness-win32-x64 里的关键文件是否齐全:
 * 应用源码、官方 dsh 入口、目录选择器 worker、koffi 原生绑定、
 * 鲸鱼路径数据、安装包与压缩包。缺任何一项即退出码 1。
 *
 * 用法:npm run verify
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "release", "DeepSeek Harness-win32-x64");
const RES = path.join(APP, "resources", "app");

const CHECKS = [
  // 应用源码(缺失 = Issue #3 所述症状)
  ["src/main.js", path.join(RES, "src", "main.js")],
  ["src/preload.js", path.join(RES, "src", "preload.js")],
  ["src/status-page.js", path.join(RES, "src", "status-page.js")],
  ["src/whale-path.json", path.join(RES, "src", "whale-path.json")],
  ["package.json", path.join(RES, "package.json")],
  // 官方 dsh 服务器入口
  ["dsh bin.js", path.join(RES, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")],
  // 目录选择器原生 worker(缺它 = 打不开新工作区)
  ["picker worker.cjs", path.join(RES, "node_modules", "@deepseek-ai", "dsh-host-directory-picker-native", "lib", "worker.cjs")],
  // koffi 原生绑定(缺它 = 沙箱/选择器不可用)
  ["koffi.node", path.join(RES, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node")],
  // Electron 运行时
  ["electron 可执行文件", path.join(APP, "DeepSeek Harness.exe")],
];

const ARTIFACTS = [
  ["NSIS 安装包", path.join(ROOT, "release", "DeepSeek Harness-0.1.1-rc.1-x64.exe")],
  ["便携版", path.join(ROOT, "release", "DeepSeek Harness-0.1.1-rc.1-portable-x64.exe")],
  ["解压版(zip)", path.join(ROOT, "release", "DeepSeek Harness-0.1.1-rc.1-win32-x64.zip")],
];

let failed = 0;
console.log("=== 关键文件检查 ===");
for (const [name, p] of CHECKS) {
  const ok = fs.existsSync(p);
  console.log(`${ok ? "  ✓" : "  ✗ MISSING"} ${name}`);
  if (!ok) failed++;
}

console.log("=== 发布产物检查 ===");
for (const [name, p] of ARTIFACTS) {
  const ok = fs.existsSync(p);
  const size = ok ? `(${(fs.statSync(p).size / 1048576).toFixed(1)}MB)` : "";
  console.log(`${ok ? "  ✓" : "  ✗ MISSING"} ${name} ${size}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n[verify] ${failed} 项缺失 —— 打包不完整,禁止发布!`);
  process.exit(1);
}
console.log("\n[verify] 全部通过 ✓");
process.exit(0);
