"use strict";

/**
 * DeepSeek Harness 桌面版 —— Electron 主进程
 *
 * 设计:UI 与网页版一比一(直接加载官方 dsh web 服务器与官方前端 dist),
 * 桌面层只负责原生外壳:服务器托管/复用、窗口、托盘、菜单、单实例。
 */

const {
  app, BrowserWindow, Tray, Menu, Notification, dialog, shell, nativeImage,
} = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// 远程桌面/无 GPU 环境下 Chromium 的硬件加速路径会偶发 fail-fast
// (CoreMessaging.dll / GPU process 崩溃);DSH UI 为纯 2D 页面,禁用无副作用。
app.disableHardwareAcceleration();

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3080;
const GITHUB_URL = "https://github.com/deepseek-ai/deepseek-harness";
/** index.html 中出现的标题,用于识别"这是官方 dsh 前端"。 */
const INDEX_MARKER = "DeepSeek Harness";
const SMOKE = process.argv.includes("--smoke");
/** --port N:强制自建服务器(0 = 系统分配端口),跳过探测/复用逻辑。 */
const FORCE_PORT = (() => {
  const i = process.argv.indexOf("--port");
  if (i === -1) return null;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : null;
})();

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let mainWindow = null;
let tray = null;
let serverProc = null; // 我们 spawn 的子进程(attach 模式为 null)
let serverOwned = false; // 服务器是否由本应用托管
let serverUrl = null;
let quitting = false;
let settings = { closeToTray: true, workspace: null };

const log = (...args) => console.log("[desktop]", ...args);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
  } catch { /* 首次运行无配置文件 */ }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) { log("保存设置失败", e); }
}

function iconPath(preferTray = false) {
  const base = path.join(__dirname, "..", "assets");
  const list = preferTray
    ? ["tray@2x.png", "tray.png", "icon.png"]
    : ["icon.png", "icon-256.png", "tray.png"];
  for (const name of list) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function httpGet(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}
function isDsh(res) {
  return !!res && res.status === 200 && res.body.includes(INDEX_MARKER);
}
/** 探测一个地址:返回 "dsh"(官方服务器) / "other"(别的服务) / "none"(无响应) */
async function probe(url) {
  const res = await httpGet(url);
  if (isDsh(res)) return "dsh";
  return res ? "other" : "none";
}
async function waitForDsh(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await probe(url)) === "dsh") return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// dsh 服务器
// ---------------------------------------------------------------------------
/** 解析 @deepseek-ai/dsh 的 bin 入口(兼容有/无 asar 两种打包布局)。 */
function resolveDshBin() {
  const candidates = [];
  if (app.isPackaged) {
    const base = process.resourcesPath;
    candidates.push(
      path.join(base, "app", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      path.join(base, "app.asar.unpacked", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    );
  } else {
    try {
      const pkg = require.resolve("@deepseek-ai/dsh/package.json");
      candidates.push(path.join(path.dirname(pkg), "lib", "bin.js"));
    } catch { /* 未安装 */ }
  }
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

/**
 * 以 ELECTRON_RUN_AS_NODE 方式 spawn 官方 dsh web 服务器。
 * 返回 { child, url, exited, exit } —— url 从 stdout 的 "dsh web: ..." 行解析。
 */
function spawnDsh(port) {
  const bin = resolveDshBin();
  if (!bin) throw new Error("找不到 dsh 服务器入口(node_modules/@deepseek-ai/dsh 未安装)");
  const args = [bin, "web", "--host", HOST, "--port", String(port)];
  const workspace = settings.workspace || os.homedir();
  const child = spawn(process.execPath, args, {
    cwd: workspace,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const handle = { child, url: null, exited: false, exit: null };
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
    const m = out.match(/dsh web: (https?:\/\/\S+)/);
    if (m && !handle.url) handle.url = m[1].trim();
  });
  child.stderr.on("data", (d) => { err += d.toString(); });
  child.on("exit", (code, sig) => {
    handle.exited = true;
    handle.exit = { code, sig, stderr: err.trim(), stdout: out.trim() };
  });
  return handle;
}

/** 启动(或复用)服务器,成功后设置 serverUrl / serverOwned。 */
async function startServer() {
  // 0) 强制端口模式:不探测、不复用,直接自建
  if (FORCE_PORT !== null) {
    const ports = FORCE_PORT === 0 ? [0] : [FORCE_PORT];
    for (const port of ports) {
      if (await trySpawn(port)) return;
    }
    throw new Error(`无法在端口 ${FORCE_PORT} 启动 dsh web 服务器`);
  }

  // 1) 默认端口已有官方 dsh 服务器(例如浏览器版正在运行)→ 直接复用
  const primary = `http://${HOST}:${DEFAULT_PORT}`;
  if ((await probe(primary)) === "dsh") {
    serverUrl = primary;
    serverOwned = false;
    log(`复用已有服务器: ${serverUrl}`);
    return;
  }

  // 2) 自己托管一个:3080 空闲就优先用 3080,否则让 OS 分配空闲端口
  const ports = (await probe(primary)) === "none" ? [DEFAULT_PORT, 0] : [0];
  for (const port of ports) {
    if (await trySpawn(port)) return;
  }
  throw new Error("无法启动 dsh web 服务器(请检查端口占用或 @deepseek-ai/dsh 安装)");
}

/** 在指定端口 spawn 一次服务器;成功返回 true。 */
async function trySpawn(port) {
  const handle = spawnDsh(port);
  serverProc = handle;
  const deadline = Date.now() + 20000;
  while (!handle.url && !handle.exited && Date.now() < deadline) await sleep(100);
  if (!handle.url && !handle.exited && port !== 0) {
    // 某些情况下 URL 行可能没抓到,直接探测目标端口
    if ((await probe(`http://${HOST}:${port}`)) === "dsh") {
      handle.url = `http://${HOST}:${port}`;
    }
  }
  if (handle.url && (await waitForDsh(handle.url, 30000))) {
    serverUrl = handle.url;
    serverOwned = true;
    log(`已启动内置服务器: ${serverUrl} (工作目录: ${settings.workspace || os.homedir()})`);
    watchServerCrash();
    return true;
  }
  const why = handle.exit
    ? `退出码 ${handle.exit.code}: ${(handle.exit.stderr || "无输出").split("\n").slice(-4).join("\n")}`
    : "等待就绪超时";
  log(`端口 ${port} 启动失败: ${why}`);
  if (serverProc === handle) serverProc = null;
  return false;
}

function stopServer() {
  if (serverProc && serverOwned) {
    const h = serverProc;
    serverProc = null;
    try { h.child.kill(); } catch { /* 已退出 */ }
  }
}

/** 托管的服务器意外退出时,询问是否重启。 */
function watchServerCrash() {
  if (!serverProc) return;
  serverProc.child.on("exit", async (code) => {
    serverProc = null;
    if (quitting || SMOKE) return;
    log(`内置服务器退出,code=${code}`);
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "服务器已停止",
      message: "DeepSeek Harness 内置服务器意外退出。",
      detail: `退出码: ${code}\n是否重新启动服务器?`,
      buttons: ["重新启动", "退出应用"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      try {
        await startServer();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(serverUrl);
      } catch (e) {
        dialog.showErrorBox("启动失败", String(e.message || e));
      }
    } else {
      quitting = true;
      app.quit();
    }
  });
}

/** 页面加载失败(例如复用的服务器后来退出了)→ 尝试接管/重启。 */
async function handleLoadFailure() {
  if (quitting || SMOKE) return;
  log("页面加载失败,尝试重新获取服务器…");
  try {
    if (!serverProc) await startServer();
    if (mainWindow && !mainWindow.isDestroyed() && serverUrl) mainWindow.loadURL(serverUrl);
  } catch (e) {
    dialog.showErrorBox("连接失败", String(e.message || e));
  }
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
const boundsFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), "utf8"));
    if (typeof b.width === "number" && typeof b.height === "number") return b;
  } catch { /* 首次运行 */ }
  return null;
}
function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { fs.writeFileSync(boundsFile(), JSON.stringify(mainWindow.getBounds())); } catch { /* 忽略 */ }
}

function createWindow() {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    ...(bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
               : { width: 1280, height: 800, center: true }),
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b0e14",
    title: "DeepSeek Harness",
    icon: iconPath() || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(serverUrl);

  // 外链交给系统浏览器,不在应用内跳转(保持 1:1 页面)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (serverUrl && url.startsWith(serverUrl)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // 关闭 → 最小化到托盘(可关闭)
  mainWindow.on("close", (e) => {
    if (settings.closeToTray && !quitting && !SMOKE) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    saveBounds();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("move", saveBounds);
  mainWindow.on("resize", saveBounds);
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    if (code === -3) return; // ERR_ABORTED:主动中断(如重新加载)不算失败
    log(`did-fail-load ${code} ${desc}`);
    handleLoadFailure();
  });

  if (SMOKE) runSmoke();
}

/** 冒烟测试结束:先停掉自己托管的服务器,再退出。 */
function finishSmoke(code) {
  stopServer();
  app.exit(code);
}

// ---------------------------------------------------------------------------
// 冒烟测试:加载成功后校验 __DSH_BOOT__ 注入与标题,然后退出
// ---------------------------------------------------------------------------
function runSmoke() {
  mainWindow.webContents.once("did-finish-load", async () => {
    try {
      const result = await mainWindow.webContents.executeJavaScript(
        `({ title: document.title, boot: !!window.__DSH_BOOT__, url: location.href })`);
      console.log("[smoke]", JSON.stringify(result));
      const ok = result.boot && String(result.title).includes("DeepSeek Harness")
        && String(result.url).startsWith(serverUrl);
      finishSmoke(ok ? 0 : 1);
    } catch (e) {
      console.log("[smoke] 校验失败:", e);
      finishSmoke(1);
    }
  });
  setTimeout(() => { console.log("[smoke] 超时"); finishSmoke(2); }, 60000).unref();
}

// ---------------------------------------------------------------------------
// 托盘 / 菜单
// ---------------------------------------------------------------------------
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else { mainWindow.show(); mainWindow.focus(); }
}

function createTray() {
  const p = iconPath(true);
  const img = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
  tray = new Tray(img.isEmpty() ? nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==") : img);
  tray.setToolTip(`DeepSeek Harness\n${serverUrl || ""}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示 / 隐藏主窗口", click: toggleWindow },
    { label: "在浏览器中打开", enabled: !!serverUrl, click: () => serverUrl && shell.openExternal(serverUrl) },
    { type: "separator" },
    { label: "退出", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", toggleWindow);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "文件",
      submenu: [
        { label: "在浏览器中打开", accelerator: "CmdOrCtrl+Shift+O",
          enabled: !!serverUrl, click: () => serverUrl && shell.openExternal(serverUrl) },
        { type: "separator" },
        { label: "关闭窗口到托盘", type: "checkbox", checked: settings.closeToTray,
          click: (item) => { settings.closeToTray = item.checked; saveSettings(); } },
        ...(!isMac ? [{ type: "separator" }, { role: "quit", label: "退出" }] : []),
      ],
    },
    { label: "编辑", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "视图", submenu: [{ role: "reload", label: "重新加载" },
      { role: "forceReload", label: "强制重新加载" },
      { role: "toggleDevTools", label: "开发者工具" }, { type: "separator" },
      { role: "resetZoom", label: "实际大小" }, { role: "zoomIn", label: "放大" },
      { role: "zoomOut", label: "缩小" }, { type: "separator" },
      { role: "togglefullscreen", label: "全屏" }] },
    { label: "窗口", submenu: [{ role: "minimize" }, { role: "zoom" },
      ...(!isMac ? [{ role: "close" }] : [])] },
    {
      label: "帮助",
      submenu: [
        { label: "DeepSeek Harness GitHub", click: () => shell.openExternal(GITHUB_URL) },
        { label: "关于", click: () => {
          dialog.showMessageBox({
            type: "info",
            title: "关于 DeepSeek Harness",
            message: "DeepSeek Harness 桌面版",
            detail: [
              `版本: ${app.getVersion()}`,
              `Electron: ${process.versions.electron}`,
              `服务器: ${serverUrl || "未启动"}`,
              `服务器模式: ${serverOwned ? "内置(本应用托管)" : "复用外部实例"}`,
              `工作目录: ${settings.workspace || os.homedir()}`,
            ].join("\n"),
            buttons: ["确定"],
          });
        } },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function bootstrap() {
  loadSettings();
  try {
    await startServer();
  } catch (e) {
    const msg = String((e && e.message) || e);
    log("启动失败:", msg);
    if (!SMOKE) dialog.showErrorBox("DeepSeek Harness 启动失败", msg);
    stopServer();
    app.exit(1);
    return;
  }
  createWindow();
  buildMenu();
  if (!SMOKE) {
    createTray();
    if (serverOwned && !settings.firstRunDone) {
      settings.firstRunDone = true;
      saveSettings();
      new Notification({
        title: "DeepSeek Harness 已启动",
        body: `服务器运行于 ${serverUrl}\n关闭窗口后应用会驻留托盘,可随时恢复。`,
      }).show();
    }
  }
}

app.setAppUserModelId("ai.deepseek.harness.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on("before-quit", () => { quitting = true; stopServer(); });
  // Windows/Linux: 窗口全关后保持托盘驻留(托盘"退出"才会真正退出)
  app.on("window-all-closed", () => { /* 保留在托盘 */ });
  app.whenReady().then(bootstrap);
}
