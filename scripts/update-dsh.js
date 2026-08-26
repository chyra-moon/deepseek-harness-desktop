"use strict";

/**
 * update:dsh —— 一键升级官方 dsh 并重新出包。
 *
 * 流程:查 npm 最新版 -> 批量改 package.json 中全部 @deepseek-ai/* 依赖
 * (dsh 本体精确锁定,其余 ^ 范围,全部对齐到同一版本,避免 monorepo 版本错位)
 * -> npm install -> 内置服务器冒烟(不通过即中止) -> npm run dist 出包。
 *
 * 版本来源说明:官方发布新版本时通常只移动 `next` dist-tag(latest 长期停留在
 * 旧版,如 dsh-attachment 的 latest 仍是 0.0.1-rc.1),因此这里按
 * `dist-tags.next` 优先、`latest` 兜底、再看完整 versions 列表取最大发布版的
 * 顺序解析,而不是只查 `npm view <pkg> version`(那会查到 stale 的 latest 并把
 * 依赖降级)。
 *
 * 用法:
 *   npm run update:dsh              # 升级(已是新版则提示并退出)
 *   npm run update:dsh -- --force   # 强制重跑出包(版本不变时)
 *   npm run update:dsh -- --dry-run # 只打印将改动的版本,不动任何东西
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

/** 简单 semver 比较(仅覆盖 x.y.z 与 x.y.z-rc.n 两种形态,足够本家族使用)。 */
function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(String(v).trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === void 0 ? Infinity : Number(m[4])];
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 4; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
const maxVersion = (list) => list.reduce((acc, v) => (compareVersions(v, acc) > 0 ? v : acc), list[0]);

/** 查询一个包的最新发布版本:next tag 优先,latest 兜底,最后取 versions 列表最大值。 */
function latestPublished(name) {
  // 1) dist-tags
  try {
    const tags = JSON.parse(execSync(`npm view ${name} dist-tags --json`, {
      cwd: root, encoding: "utf8",
    }));
    const candidates = [tags.next, tags.latest].filter((v) => typeof v === "string" && v.length > 0);
    if (candidates.length > 0) return maxVersion(candidates);
  } catch { /* 查询失败,走 versions 列表 */ }
  // 2) versions 列表(全量,取最大)
  try {
    const list = JSON.parse(execSync(`npm view ${name} versions --json`, {
      cwd: root, encoding: "utf8",
    }));
    if (Array.isArray(list) && list.length > 0) return maxVersion(list);
  } catch { /* 彻底失败 */ }
  return null;
}

function main() {
  // 1) 查官方最新版本(以 dsh 主包为锚)
  const latest = latestPublished("@deepseek-ai/dsh");
  if (!latest) throw new Error("无法查询 @deepseek-ai/dsh 的最新版本");
  const current = pkg.dependencies["@deepseek-ai/dsh"];
  console.log(`当前锁定: ${current} | npm 最新(next/latest 解析): ${latest}`);

  // 2) 版本决策:只对齐 dsh monorepo 家族(@deepseek-ai/dsh 与 @deepseek-ai/dsh-*)。
  //    cordis / cordis-plugin-* / schemastery 是独立版本线的库,交给 Dependabot,这里不动。
  //    注意:monorepo 并非总是全家族同步发布,因此按包逐个查询各自最新版,
  //    且仅当该包确实发布了目标版本时才升级(如 dsh-client-schema-form 停在 0.1.0-rc.7)。
  const isDshFamily = (name) =>
    name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-");
  const changed = [];
  for (const name of Object.keys(pkg.dependencies)) {
    if (!isDshFamily(name)) continue;
    const published = latestPublished(name);
    if (!published) {
      console.log(`  (跳过 ${name}: 查询最新版失败)`);
      continue;
    }
    // 家族版本通常统一;若某包低于锚定版本(如 schema-form 停在旧线),保持不动
    if (compareVersions(published, latest) < 0) {
      console.log(`  (跳过 ${name}: 最新 ${published} 低于目标 ${latest})`);
      continue;
    }
    const next = name === "@deepseek-ai/dsh" ? published : `^${published}`;
    if (pkg.dependencies[name] !== next) {
      changed.push(`${name}: ${pkg.dependencies[name]} -> ${next}`);
      if (!dryRun) pkg.dependencies[name] = next;
    }
  }

  if (changed.length === 0 && !force) {
    console.log("\n已是最新版本,无需更新。");
    console.log("提示: --force 可跳过版本检查直接重跑冒烟+出包; --dry-run 只预览改动。");
    return;
  }
  if (changed.length === 0 && force) {
    console.log("\n版本未变,但 --force:继续重跑冒烟+出包。");
  } else {
    console.log(`\n将更新 ${changed.length} 个 @deepseek-ai/* 依赖:`);
    for (const line of changed) console.log(`  ${line}`);
    if (dryRun) {
      console.log("\n[dry-run] 未做任何修改。");
      return;
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  if (dryRun) return;

  // 3) 安装依赖
  run("npm install");

  // 4) 冒烟验证(内置服务器自建模式;不通过会抛错中止,不会出包)
  run("npm run smoke -- --port 0");

  // 5) 出包(NSIS + portable)
  run("npm run dist");

  console.log("\n全部完成! 接下来:");
  console.log("  1. git add -A && git commit -m \"deps: 升级 @deepseek-ai/* 到 " + latest + "\" && git push");
  console.log("  2. 在 GitHub 发新 Release,上传 release/ 下两个新安装包");
}

try {
  main();
} catch (e) {
  console.error(`\n[update:dsh] 失败: ${(e && e.message) || e}`);
  process.exit(1);
}
