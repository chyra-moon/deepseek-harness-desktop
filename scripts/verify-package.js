"use strict";

/**
 * verify-package —— 打包产物完整性校验。
 * 检查 release/DeepSeek Harness-win32-x64 里的关键文件是否齐全:
 * 应用源码、官方 dsh 入口、目录选择器 worker(含 UTF-16 截断修复)、
 * koffi 原生绑定、鲸鱼路径数据、安装包与压缩包。缺任何一项即退出码 1。
 *
 * 版本号从 package.json 读取,不硬编码,升级时无需改动本文件。
 *
 * 用法:npm run verify
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "release", "DeepSeek Harness-win32-x64");
const RES = path.join(APP, "resources", "app");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

// 官方 0.1.1 中文路径截断 bug 的修复模式(见 scripts/patch-dsh.js);
// 0.1.2-alpha.3 起官方直接内联修复,写法变为 `!(bytes[end] === 0 && bytes[end + 1] === 0)`,
// 语义与本修复的 `(bytes[end] !== 0 || bytes[end + 1] !== 0)` 等价,一并识别。
const FIXED_READUTF16 = /while\s*\(\s*end\s*\+\s*1\s*<\s*bytes\.length\s*&&\s*(?:\(\s*bytes\[end\]\s*!==\s*0\s*\|\|\s*bytes\[end\s*\+\s*1\]\s*!==\s*0\s*\)|!\s*\(\s*bytes\[end\]\s*===\s*0\s*&&\s*bytes\[end\s*\+\s*1\]\s*===\s*0\s*\))\s*\)\s*end\s*\+=\s*2\s*;/;

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
  // koffi 原生绑定(缺它 = 沙箱/选择器不可用)。当前 npm(allow-scripts 沙箱)会把
  // 平台专属的 @koromix/koffi-win32-x64 装入 koffi 的嵌套 node_modules,而非 hoist 到顶层,
  // 因此顶层与嵌套两处任一存在即视为就绪(运行时 koffi 也能解析到任一位置)。
  ["koffi.node", [
    path.join(RES, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"),
    path.join(RES, "node_modules", "koffi", "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"),
  ]],
  // Electron 运行时
  ["electron 可执行文件", path.join(APP, "DeepSeek Harness.exe")],
];

const ARTIFACTS = [
  ["NSIS 安装包", path.join(ROOT, "release", `DeepSeek Harness-${VERSION}-x64.exe`)],
  ["便携版", path.join(ROOT, "release", `DeepSeek Harness-${VERSION}-portable-x64.exe`)],
  ["解压版(zip)", path.join(ROOT, "release", `DeepSeek Harness-${VERSION}-win32-x64.zip`)],
];

let failed = 0;
console.log("=== 关键文件检查 ===");
for (const [name, paths] of CHECKS) {
  const list = Array.isArray(paths) ? paths : [paths];
  const ok = list.some((p) => fs.existsSync(p));
  console.log(`${ok ? "  ✓" : "  ✗ MISSING"} ${name}`);
  if (!ok) failed++;
}

// 补丁断言:worker.cjs 必须含 UTF-16 截断修复(防官方包更新导致 patch 失效)
const workerPath = path.join(RES, "node_modules", "@deepseek-ai", "dsh-host-directory-picker-native", "lib", "worker.cjs");
const workerPatched = fs.existsSync(workerPath) && FIXED_READUTF16.test(fs.readFileSync(workerPath, "utf8"));
console.log(`${workerPatched ? "  ✓" : "  ✗ MISSING"} picker worker.cjs UTF-16 截断修复`);
if (!workerPatched) failed++;

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
