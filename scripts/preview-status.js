"use strict";

/**
 * preview —— 生成加载动画的独立预览页(不打包、不装应用,浏览器直接打开)。
 * 用法:
 *   npm run preview            # 生成 preview-status.html 并输出路径
 *   npm run preview -- --open  # 生成并直接用默认浏览器打开
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildStatusHtml } = require("../src/status-page.js");

const out = path.join(__dirname, "..", "preview-status.html");
fs.writeFileSync(out, buildStatusHtml("正在启动服务器…", "首次启动或复用外部服务器时可能需要几秒到几十秒。"));
console.log(out);

if (process.argv.includes("--open")) {
  const { execSync } = require("node:child_process");
  try {
    execSync(`start "" "${out}"`, { shell: "cmd.exe" });
  } catch { /* 打不开浏览器就算了,文件已生成 */ }
}
