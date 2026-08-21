"use strict";

/**
 * 自动更新(桌面版增强):
 * - 启动时检查更新源(latest.yml, Generic Provider)
 * - 发现新版本 → 后台下载(NSIS 差分 blockmap)→ 进度实时回调 → 静默安装并重启
 * - 更新源优先级: 环境变量 DSH_UPDATE_URL > %APPDATA%/DeepSeek Harness/update-url.txt
 *   未配置更新源时完全跳过,不影响正常启动。
 */
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

let started = false;
let updating = false; // 发现新版本 / 下载中 / 安装中

/** 解析更新源地址(末尾去斜杠)。 */
function resolveFeedUrl() {
  if (process.env.DSH_UPDATE_URL && process.env.DSH_UPDATE_URL.trim()) {
    return process.env.DSH_UPDATE_URL.trim().replace(/\/+$/, "");
  }
  try {
    const f = path.join(app.getPath("userData"), "update-url.txt");
    if (fs.existsSync(f)) {
      const v = fs.readFileSync(f, "utf8").trim();
      if (v) return v.replace(/\/+$/, "");
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 启动自动更新检查。
 * @param {object} hooks
 * @param {(title: string, detail: string) => void} hooks.onStatus   状态页文案
 * @param {(p: {percent:number, speed:number, transferred:number, total:number}) => void} hooks.onProgress 下载进度
 * @param {(reason: string) => void} hooks.onDone 无更新/失败(继续正常启动)
 */
function startAutoUpdate(hooks) {
  if (started) return;
  started = true;

  const feedUrl = resolveFeedUrl();
  if (!feedUrl) {
    hooks.onDone("no-feed");
    return;
  }

  autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = true; // 跟随 rc 版本线

  autoUpdater.on("checking-for-update", () => {
    hooks.onStatus("正在检查更新…", "更新源: " + feedUrl);
  });

  autoUpdater.on("update-available", (info) => {
    updating = true;
    hooks.onStatus(`发现新版本 ${info && info.version ? info.version : ""}，正在下载…`, "0%");
  });

  autoUpdater.on("download-progress", (p) => {
    hooks.onProgress({
      percent: Math.round((p && p.percent ? p.percent : 0) * 10) / 10,
      speed: (p && p.bytesPerSecond) || 0,
      transferred: (p && p.transferred) || 0,
      total: (p && p.total) || 0,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const ver = info && info.version ? info.version : "";
    hooks.onStatus(`更新已就绪 ${ver}，正在安装…`, "安装完成后将自动重启");
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall();
      } catch (e) {
        hooks.onStatus("安装启动失败", String((e && e.message) || e));
        updating = false;
        hooks.onDone("install-error");
      }
    }, 800);
  });

  autoUpdater.on("update-not-available", () => {
    hooks.onDone("not-available");
  });

  autoUpdater.on("error", (e) => {
    console.error("[updater]", e && (e.stack || e.message));
    updating = false;
    hooks.onDone("error");
  });

  autoUpdater.checkForUpdates().catch((e) => {
    console.error("[updater] check failed:", e);
    updating = false;
    hooks.onDone("check-error");
  });
}

/** 更新流程是否进行中(发现新版本后,阻止载入主 UI,保持鲸鱼状态页)。 */
function isUpdating() {
  return updating;
}

module.exports = { startAutoUpdate, isUpdating, resolveFeedUrl };
