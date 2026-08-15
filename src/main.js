"use strict";

/**
 * DeepSeek Harness 桌面版 —— Electron 主进程
 *
 * 设计:UI 与网页版一比一(直接加载官方 dsh web 服务器与官方前端 dist),
 * 桌面层只负责原生外壳:服务器托管/复用、窗口、托盘、菜单、单实例。
 *
 * 服务器生命周期:
 *   1. 探测 127.0.0.1:3080,已有官方 dsh 服务器则直接复用(attach);
 *   2. 否则用内置 @deepseek-ai/dsh 自建(ELECTRON_RUN_AS_NODE);
 *   3. 内置缺失/失败时自动回退到 `npx -y @deepseek-ai/dsh web`(无需用户手动);
 *   4. 运行期间每 5 秒探活,掉线(含复用的外部服务器被关闭)自动恢复并重载页面。
 */

const {
  app, BrowserWindow, Tray, Menu, Notification, dialog, shell, nativeImage,
} = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { buildStatusHtml } = require("./status-page");

// 若从带控制台的父进程(批处理/计划任务/终端)启动,Electron 会继承其控制台,
// 脚本退出后留下一个空终端窗口。这里主动脱离控制台,该窗口随即消失;
// 从桌面双击启动时本就没有控制台,此调用无副作用。
try {
  const k = require("koffi");
  const koffi = k.default || k;
  koffi.load("kernel32.dll").func("__stdcall", "FreeConsole", "int", [])();
} catch { /* koffi 不可用时忽略 */ }

// 远程桌面/无 GPU 环境下 Chromium 的硬件加速路径会偶发 fail-fast
// (CoreMessaging.dll / GPU process 崩溃);DSH UI 为纯 2D 页面,禁用无副作用。
app.disableHardwareAcceleration();

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3080;
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
/** 诊断开关:跳过内置 bin,强制走 npx 回退路径。 */
const FORCE_NPX = process.env.DSH_FORCE_NPX === "1";

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let mainWindow = null;
let tray = null;
let serverProc = null; // 当前服务器的子进程(attach 模式为 null)
let serverOwned = false; // 服务器是否由本应用托管
let serverUrl = null;
let quitting = false;
let restarting = null; // 自动恢复的进行中 Promise(防重入)
let healthTimer = null; // 探活定时器
let retryTimer = null; // 启动失败自动重试定时器
let settings = { closeToTray: true, workspace: null, directoryPicker: "native" };

const log = (...args) => console.log("[desktop]", ...args);

// ---------------------------------------------------------------------------
// 错误兜底:主进程异常写日志(userData/error.log),不再弹系统级报错框吓用户
// ---------------------------------------------------------------------------
function logError(kind, e) {
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "error.log"),
      `[${new Date().toISOString()}] ${kind}: ${(e && e.stack) || e}\n`);
  } catch { /* 忽略 */ }
}
process.on("uncaughtException", (e) => logError("uncaughtException", e));
process.on("unhandledRejection", (e) => logError("unhandledRejection", e));

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() {
  try {
    // 兼容带 BOM 的 UTF-8(部分编辑器/工具写出 BOM 会让 JSON.parse 抛错)
    const text = fs.readFileSync(settingsFile(), "utf8").replace(/^\uFEFF/, "");
    settings = { ...settings, ...JSON.parse(text) };
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
  if (FORCE_NPX) return null;
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

/** 服务器子进程的环境:directoryPicker=browse 时设置 SSH_CONNECTION,
 *  让 dsh 的目录选择器解析器挂载应用内浏览选择器(唯一消费者,已确认无副作用),
 *  规避远程桌面会话下原生对话框 worker 崩溃导致"打不开新工作区"。 */
function serverEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (settings.directoryPicker === "browse") env.SSH_CONNECTION = "desktop-shell-browse";
  return env;
}

/**
 * spawn 一次 dsh web 服务器。kind = "builtin" | "npx"。
 * 返回 { child, url, exited, exit } —— url 从 stdout 的 "dsh web: ..." 行解析。
 */
function spawnDsh(port, kind) {
  const workspace = settings.workspace || os.homedir();
  let child;
  if (kind === "npx") {
    // 自动完成用户手动执行的 `npx @deepseek-ai/dsh web`(Windows 经 cmd 调用 npx)
    child = spawn("cmd.exe", [
      "/d", "/s", "/c",
      `npx -y @deepseek-ai/dsh web --host ${HOST} --port ${port}`,
    ], {
      cwd: workspace,
      env: serverEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    const bin = resolveDshBin();
    if (!bin) throw new Error("找不到 dsh 服务器入口(node_modules/@deepseek-ai/dsh 未安装)");
    child = spawn(process.execPath, [bin, "web", "--host", HOST, "--port", String(port)], {
      cwd: workspace,
      env: serverEnv({ ELECTRON_RUN_AS_NODE: "1" }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }
  const handle = { child, url: null, exited: false, exit: null, kind };
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

/** 在指定端口启动一次服务器(内置 bin 优先,npx 自动回退);成功返回 true。 */
async function trySpawn(port) {
  const kinds = resolveDshBin() ? ["builtin", "npx"] : ["npx"];
  for (const kind of kinds) {
    const handle = spawnDsh(port, kind);
    serverProc = handle;
    const deadline = Date.now() + 20000;
    while (!handle.url && !handle.exited && Date.now() < deadline) await sleep(100);
    if (!handle.url && !handle.exited && port !== 0) {
      // URL 行没抓到就直接探测目标端口
      if ((await probe(`http://${HOST}:${port}`)) === "dsh") {
        handle.url = `http://${HOST}:${port}`;
      }
    }
    if (handle.url && (await waitForDsh(handle.url, 30000))) {
      serverUrl = handle.url;
      serverOwned = true;
      log(`已启动内置服务器(${kind}): ${serverUrl} (工作目录: ${settings.workspace || os.homedir()})`);
      watchServerCrash();
      return true;
    }
    const why = handle.exit
      ? `退出码 ${handle.exit.code}: ${(handle.exit.stderr || "无输出").split("\n").slice(-4).join("\n")}`
      : "等待就绪超时";
    log(`端口 ${port} (${kind}) 启动失败: ${why}`);
    if (serverProc === handle) serverProc = null;
  }
  return false;
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
  throw new Error("无法启动 dsh web 服务器(请检查端口占用、Node 环境或 @deepseek-ai/dsh 安装)");
}

/**
 * 结束服务器进程树。Windows 下 child.kill() 只杀直接子进程:
 * npx 路径(spawn cmd.exe → npx → node)会留下孤儿 node 继续占端口,
 * 必须用 taskkill /T 杀掉整棵树。
 */
function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true, stdio: "ignore",
      });
    } catch { /* 已退出 */ }
  }
  try { child.kill(); } catch { /* 已退出 */ }
}

function stopServer() {
  if (serverProc && serverOwned) {
    const h = serverProc;
    serverProc = null;
    killTree(h.child);
  }
}

/** 托管的服务器进程退出时自动重启(不弹窗打扰)。 */
function watchServerCrash() {
  if (!serverProc) return;
  const h = serverProc;
  h.child.on("exit", (code) => {
    if (serverProc !== h) return; // 已被替换,旧句柄退出无需处理
    serverProc = null;
    if (quitting || SMOKE) return;
    log(`内置服务器退出 code=${code},自动恢复…`);
    handleServerDown();
  });
}

/**
 * 服务器不可用(复用的外部服务器被关闭 / 托管进程崩溃 / 无响应)。
 * 自动重新获取服务器并重载页面;失败则通知用户。防重入。
 */
function handleServerDown() {
  if (quitting || SMOKE) return Promise.resolve();
  if (restarting) return restarting;
  restarting = (async () => {
    log("服务器不可用,自动恢复…");
    if (serverProc) { killTree(serverProc.child); serverProc = null; }
    serverUrl = null;
    serverOwned = false;
    try {
      await startServer();
      if (mainWindow && !mainWindow.isDestroyed() && serverUrl) {
        mainWindow.loadURL(serverUrl).catch((e) => log("恢复后重载失败:", (e && e.message) || e));
      }
      log("自动恢复完成:", serverUrl);
    } catch (e) {
      log("自动恢复失败:", (e && e.message) || e);
      logError("handleServerDown", e);
      try {
        new Notification({
          title: "DeepSeek Harness",
          body: "服务器自动恢复失败,将稍后重试。",
        }).show();
      } catch (e2) { log("通知失败:", (e2 && e2.message) || e2); }
    } finally {
      restarting = null;
    }
  })();
  return restarting;
}

/** 运行期探活:每 5 秒确认服务器仍在,掉线即自动恢复。 */
function startHealthWatch() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(async () => {
    if (quitting || !serverUrl || restarting) return;
    if ((await probe(serverUrl)) === "dsh") return;
    log(`探活失败: ${serverUrl} 无响应`);
    handleServerDown();
  }, 5000);
}

/** 页面加载失败(例如服务器在加载瞬间退出)→ 自动恢复并重载。 */
async function handleLoadFailure() {
  if (quitting || SMOKE) return;
  log("页面加载失败,尝试重新获取服务器…");
  await handleServerDown();
}
// ---------------------------------------------------------------------------
// 窗口 / 状态页
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

/** 在窗口内显示状态页(启动中 / 失败重试),避免白屏与闪退观感。 */
function showStatus(title, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(buildStatusHtml(title, detail))).catch(() => {});
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
  showStatus("正在启动服务器…", "首次启动或复用外部服务器时可能需要几秒到几十秒。");

  // 外链交给系统浏览器,不在应用内跳转(保持 1:1 页面)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("data:")) return; // 状态页允许
    if (serverUrl && url.startsWith(serverUrl)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // 无菜单栏后的键盘快捷键(替代原"文件/编辑/视图"菜单):
  //   Ctrl+Shift+I 开发者工具 | Ctrl+R / F5 重载 | Ctrl+Shift+O 在浏览器中打开
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    const key = String(input.key).toLowerCase();
    if (ctrl && input.shift && key === "i") {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if ((ctrl && key === "r") || input.key === "F5") {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (ctrl && input.shift && key === "o") {
      if (serverUrl) shell.openExternal(serverUrl);
      event.preventDefault();
    }
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
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (url.startsWith("data:")) return;
    if (code === -3) return; // ERR_ABORTED:主动中断(如重新加载)不算失败
    log(`did-fail-load ${code} ${desc}`);
    handleLoadFailure().catch((e) => log("加载失败处理异常:", (e && e.message) || e));
  });
}

/** 服务器就绪后加载官方 UI。 */
function loadMainUi() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!serverUrl) return;
  mainWindow.loadURL(serverUrl).catch((e) => log("loadURL 失败:", (e && e.message) || e));
  if (SMOKE) runSmoke();
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
      finishSmoke(ok ? 0 : 1, JSON.stringify(result));
    } catch (e) {
      console.log("[smoke] 校验失败:", e);
      finishSmoke(1, String(e));
    }
  });
  setTimeout(() => { console.log("[smoke] 超时"); finishSmoke(2, "timeout"); }, 60000).unref();
}

/** 冒烟测试结束:结果写入 userData/smoke-result.json(不依赖 stdout 捕获,可被自动化读取),再退出。 */
function finishSmoke(code, note = "") {
  try {
    fs.writeFileSync(
      path.join(app.getPath("userData"), "smoke-result.json"),
      JSON.stringify({ code, ok: code === 0, note, time: Date.now() }));
  } catch { /* 忽略 */ }
  stopServer();
  setTimeout(() => app.exit(code), 200);
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
    { type: "separator" },
    { label: "退出", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", toggleWindow);
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function bootstrap() {
  loadSettings();
  createWindow(); // 先出窗口(状态页),服务器后台启动
  Menu.setApplicationMenu(null); // 纯净窗口:无菜单栏,快捷键见 createWindow
  if (!SMOKE) { try { createTray(); } catch (e) { log("托盘创建失败:", (e && e.message) || e); } }
  try {
    await startServer();
    loadMainUi();
    startHealthWatch();
    if (serverOwned && !settings.firstRunDone) {
      settings.firstRunDone = true;
      saveSettings();
      try {
        new Notification({
          title: "DeepSeek Harness 已启动",
          body: `服务器运行于 ${serverUrl}\n关闭窗口后应用会驻留托盘,可随时恢复。`,
        }).show();
      } catch (e3) { log("通知失败:", (e3 && e3.message) || e3); }
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    log("启动失败:", msg);
    if (SMOKE) {
      try {
        fs.writeFileSync(
          path.join(app.getPath("userData"), "smoke-result.json"),
          JSON.stringify({ code: 1, ok: false, note: msg, time: Date.now() }));
      } catch { /* 忽略 */ }
      stopServer();
      app.exit(1);
      return;
    }
    // 窗口内显示失败状态并每 10 秒自动重试(不闪退、不弹窗打断)
    showStatus("服务器启动失败,自动重试中…", msg);
    retryTimer = setInterval(async () => {
      if (quitting || serverUrl) { clearInterval(retryTimer); retryTimer = null; return; }
      try {
        await startServer();
        if (serverUrl) {
          clearInterval(retryTimer);
          retryTimer = null;
          loadMainUi();
          startHealthWatch();
        }
      } catch (e2) {
        log("重试失败:", (e2 && e2.message) || e2);
        showStatus("服务器启动失败,自动重试中…", (e2 && e2.message) || String(e2));
      }
    }, 10000);
  }
}

app.setAppUserModelId("ai.deepseek.harness.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // SMOKE 用退出码 9 区分"被单实例锁拒绝"(否则会与冒烟成功 exit 0 混淆,造成假阳性)
  log("另一个实例正在运行,当前实例退出");
  app.exit(SMOKE ? 9 : 0);
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on("before-quit", () => {
    quitting = true;
    if (healthTimer) clearInterval(healthTimer);
    if (retryTimer) clearInterval(retryTimer);
    stopServer();
  });
  // Windows/Linux: 窗口全关后保持托盘驻留(托盘"退出"才会真正退出)
  app.on("window-all-closed", () => { /* 保留在托盘 */ });
  app.whenReady().then(bootstrap);
}
