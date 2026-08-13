// 边界内依赖完整性扫描:在指定 root 内模拟 Node 向上解析,找出 root 内无法满足的依赖。
// 用法:ELECTRON_RUN_AS_NODE=1 electron scan-deps-bounded.js <root>
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const missing = new Map();

function* walk(dir, depth) {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === ".bin") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p, e.name === "node_modules" || depth > 0 ? depth + 1 : depth);
    } else if (e.name === "package.json") {
      yield p;
    }
  }
}

// 从 fromDir 向上(不越过 root)查找 node_modules/<name>
function resolveWithin(name, fromDir) {
  let dir = fromDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "node_modules", name))) return true;
    if (dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // root 本身是 node_modules 目录时,还需要直接查 <root>/<name>
  if (path.basename(root) === "node_modules" && fs.existsSync(path.join(root, name))) return true;
  return false;
}

let count = 0;
for (const pkgJsonPath of walk(root, 0)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")); } catch { continue; }
  if (!j.name) continue;
  const dir = path.dirname(pkgJsonPath);
  const declared = { ...(j.dependencies || {}), ...(j.peerDependencies || {}) };
  for (const [name, req] of Object.entries(declared)) {
    if (name.startsWith("node:")) continue;
    if (!resolveWithin(name, dir)) {
      const key = `${name}@${req}`;
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(j.name);
    }
  }
  count++;
}

console.log(`scanned ${count} package.json files under ${root}`);
if (missing.size === 0) {
  console.log("ALL RESOLVABLE WITHIN ROOT");
} else {
  for (const [key, from] of missing) {
    console.log(`MISSING ${key}  required-by: ${[...new Set(from)].slice(0, 6).join(", ")}`);
  }
}
