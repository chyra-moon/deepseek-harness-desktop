"use strict";

/**
 * update:dsh —— 一键升级官方 dsh 并重新出包。
 *
 * 流程:查 npm 最新版 -> 批量改 package.json 中全部 @deepseek-ai/* 依赖
 * (dsh 本体精确锁定,其余 ^ 范围,全部对齐到同一版本,避免 monorepo 版本错位)
 * -> npm install -> 内置服务器冒烟(不通过即中止) -> npm run dist 出包。
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

function main() {
  // 1) 查官方最新版本
  const latest = execSync("npm view @deepseek-ai/dsh version", {
    cwd: root, encoding: "utf8",
  }).trim();
  const current = pkg.dependencies["@deepseek-ai/dsh"];
  console.log(`当前锁定: ${current} | npm 最新: ${latest}`);

  // 2) 版本决策:只对齐 dsh monorepo 家族(@deepseek-ai/dsh 与 @deepseek-ai/dsh-*)。
  //    cordis / cordis-plugin-* / schemastery 是独立版本线的库,交给 Dependabot,这里不动。
  //    注意:monorepo 并非总是全家族同步发布(如 dsh-client-schema-form 停留在 0.1.0-rc.7),
  //    因此按包逐个查询各自最新版,而不是一刀切对齐到 @deepseek-ai/dsh 的版本。
  const isDshFamily = (name) =>
    name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-");
  const changed = [];
  for (const name of Object.keys(pkg.dependencies)) {
    if (!isDshFamily(name)) continue;
    let pkgLatest = latest;
    if (name !== "@deepseek-ai/dsh") {
      try {
        pkgLatest = execSync(`npm view ${name} version`, {
          cwd: root, encoding: "utf8",
        }).trim();
      } catch {
        console.log(`  (跳过 ${name}: 查询最新版失败)`);
        continue;
      }
    }
    const next = name === "@deepseek-ai/dsh" ? pkgLatest : `^${pkgLatest}`;
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
