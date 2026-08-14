"use strict";

/**
 * gen-whale-path —— 从官方前端 favicon.svg 提取鲸鱼图标的全部子路径,
 * 生成 src/whale-path.json(1:1 官方路径,含身体/肚皮/眼睛/水花四段)。
 * 用法: node scripts/gen-whale-path.js
 */

const fs = require("node:fs");
const path = require("node:path");

function resolveFavicon() {
  try {
    const pkg = require.resolve("@deepseek-ai/dsh-web-frontend/package.json");
    return path.join(path.dirname(pkg), "dist", "favicon.svg");
  } catch { return null; }
}

const src = resolveFavicon();
if (!src) {
  console.error("找不到官方 favicon.svg(请先安装 @deepseek-ai/dsh-web-frontend)");
  process.exit(1);
}

const svg = fs.readFileSync(src, "utf8");
const m = svg.match(/<path[^>]+d="([^"]+)"/);
if (!m) {
  console.error("favicon.svg 中未找到 path 数据");
  process.exit(1);
}

// 官方 d 字符串含 4 段子路径:身体 / 肚皮 / 眼睛 / 水花
const sub = m[1]
  .split(/(?=M(?=[-\d.]))/)
  .map((s) => s.trim())
  .filter((s) => s.length > 2);

if (sub.length !== 4) {
  console.error(`预期 4 段子路径,实际 ${sub.length} 段`);
  process.exit(1);
}

const [body, belly, eye, spout] = sub;
const out = path.join(__dirname, "..", "src", "whale-path.json");
fs.writeFileSync(out, JSON.stringify({ body, belly, eye, spout }, null, 2) + "\n");
console.log(`已生成 ${out} (body ${body.length}, belly ${belly.length}, eye ${eye.length}, spout ${spout.length} 字符)`);
