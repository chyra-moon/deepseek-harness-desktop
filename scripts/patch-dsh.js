"use strict";

/**
 * patch:dsh —— 对官方 @deepseek-ai/* 包应用桌面版必要的本地补丁。
 *
 * 背景:官方 npm 发布的 0.1.1-rc.1 / 0.1.1-rc.2 中,@deepseek-ai/dsh-host-directory-picker-native
 * 的 Win32 koffi 目录选择器存在 UTF-16 截断 bug(官方讨论区 #563 / #580,官方修复
 * "fix/win32-utf16-nul-truncation" 分支尚未进 rc.2 发布):
 *
 *   while (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
 *
 * 该循环每秒读取一个 UTF-16 码元的**低字节**来判断字符串结束,但中文等字符
 * 的低字节可能是 0x00(如「开」U+5F00、「一」U+4E00),路径在此处被提前截断,
 * 导致工作区指向一个不存在的目录,界面弹「添加失败」。
 *
 * 修复:仅当**完整 2 字节码元**为 0x0000(NUL 终止)时才停止。
 *
 * 本脚本幂等:已打补丁则跳过;找不到期望代码则报错退出(防止官方包变更后
 * 静默失效;此时应核对官方是否已修复并移除本补丁)。
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const TARGET = path.join(
  root, "node_modules", "@deepseek-ai", "dsh-host-directory-picker-native",
  "lib", "worker.cjs");

// 宽松匹配以容忍缩进/换行变化
const BROKEN_RE = /while\s*\(\s*end\s*\+\s*1\s*<\s*bytes\.length\s*&&\s*bytes\[end\]\s*!==\s*0\s*\)\s*end\s*\+=\s*2\s*;/;
// 官方 0.1.2-alpha.3 已内联修复,写法改为 `!(bytes[end] === 0 && bytes[end + 1] === 0)`;
// 语义与本补丁改造后的 `(bytes[end] !== 0 || bytes[end + 1] !== 0)` 等价,一并识别为"已修复"。
const FIXED_RE = /while\s*\(\s*end\s*\+\s*1\s*<\s*bytes\.length\s*&&\s*(?:\(\s*bytes\[end\]\s*!==\s*0\s*\|\|\s*bytes\[end\s*\+\s*1\]\s*!==\s*0\s*\)|!\s*\(\s*bytes\[end\]\s*===\s*0\s*&&\s*bytes\[end\s*\+\s*1\]\s*===\s*0\s*\))\s*\)\s*end\s*\+=\s*2\s*;/;

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[patch:dsh] 找不到 ${TARGET}(依赖未安装?)`);
    process.exit(1);
  }
  const src = fs.readFileSync(TARGET, "utf8");
  if (FIXED_RE.test(src)) {
    console.log("[patch:dsh] 已存在修复,跳过。");
    return;
  }
  if (!BROKEN_RE.test(src)) {
    console.error("[patch:dsh] 未找到预期的 readUtf16 循环代码(官方包可能已变化),请核对后更新补丁。");
    process.exit(1);
  }
  const patched = src.replace(BROKEN_RE,
    "while (end + 1 < bytes.length && (bytes[end] !== 0 || bytes[end + 1] !== 0)) end += 2;");
  fs.writeFileSync(TARGET, patched, "utf8");
  console.log("[patch:dsh] 已修复 worker.cjs 的 UTF-16 截断 bug(中文路径不再被截断)。");
}

try {
  main();
} catch (e) {
  console.error(`[patch:dsh] 失败: ${(e && e.message) || e}`);
  process.exit(1);
}
