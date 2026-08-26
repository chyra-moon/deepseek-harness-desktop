"use strict";

/**
 * prune:node-modules [dir] —— 清理 node_modules(或打包产物内的 node_modules)
 * 中运行期不需要的文件,减少 NSIS 安装器需要逐个写入的文件数量,显著缩短
 * 安装耗时。
 *
 * 两种用法:
 *   npm run prune            # 直接清理工作区 node_modules(本地资源省空间)
 *   npm run prune:release    # 打包后清理 release 副本中的 node_modules
 *                            # (dist 流程默认只清副本,不动源码,可重复出包)
 *
 * 安全边界:只删除满足以下任一条件的文件/目录:
 *   1. *.map(source map,仅用于调试)
 *   2. *.d.ts(TypeScript 声明,Node 运行时不读取;exports.types 只在 tsc 用)
 *   3. README / CHANGELOG / CONTRIBUTING 等文档
 *   4. 明确的测试目录(__tests__/test/tests/e2e/fixtures,仅整目录)
 * 保留 package.json(运行时 exports 必需)、LICENSE、全部可执行入口。
 *
 * 幂等:重复运行无害。需要恢复时重新 npm install 即可。
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  path.join(__dirname, ".."),
  process.argv[2] || "node_modules");

if (!fs.existsSync(root)) {
  console.error(`[prune] ${root} 不存在,跳过。`);
  process.exit(0);
}

let removedFiles = 0;
let removedDirs = 0;

/** 文档文件(任意目录,任意大小写)。 */
const DOC_RE = /^(readme|changelog|changes|history|contributing|authors|conduct|notice|news|thanks|security)(\..*)?$/i;
/** 测试目录。 */
const TEST_DIRS = new Set([
  "__tests__", "__mocks__", "test", "tests", "e2e", "fixtures", "fixture",
  "testdata", "bench", "benchmarks",
]);
/** 元数据目录(不参与运行时)。 */
const JUNK_DIRS = new Set([".github", ".vscode", ".idea"]);

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (TEST_DIRS.has(entry.name) || JUNK_DIRS.has(entry.name)) {
        try {
          fs.rmSync(full, { recursive: true, force: true });
          removedDirs++;
          continue;
        } catch { /* 删不掉就跳过 */ }
      }
      walk(full);
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".map") || lower.endsWith(".d.ts") || DOC_RE.test(entry.name)) {
        try {
          fs.unlinkSync(full);
          removedFiles++;
        } catch { /* 忽略 */ }
      }
    }
  }
}

walk(root);

console.log(`[prune] ${root} 删除 ${removedFiles} 个文件、${removedDirs} 个目录`);
process.exit(0);
