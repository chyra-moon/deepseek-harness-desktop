"use strict";

/**
 * 预加载脚本:
 * 1. 暴露只读的桌面环境信息(window.dshDesktop),不干预页面数据;
 * 2. 侧边栏悬停自动化(桌面版增强):打开页面自动收起侧边栏,
 *    鼠标移入左侧 56px 轨道自动展开,移出侧边栏区域自动收起。
 *    展开/收起通过点击官方折叠按钮触发,动画与官方完全一致。
 * 3. 设置模态保护:官方设置面板是渲染在侧边栏 shell 内的全屏模态
 *    (role=dialog aria-modal),若在模态打开时执行"移出即收起",
 *    会连带关闭设置面板(收起/展开反复触发,面板消失又出现)。
 *    因此模态打开期间暂停全部悬停自动化。
 * 4. 性能优化:设置模态的遮罩带全屏 backdrop-filter 模糊,
 *    Electron 中渲染代价极高(打开设置卡顿的主因),桌面版去掉
 *    模糊只保留半透明遮罩,观感几乎不变。
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("dshDesktop", {
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});

// ---------------------------------------------------------------------------
// 侧边栏悬停自动化
// ---------------------------------------------------------------------------
(() => {
  const COLLAPSED_RAIL = 56;      // 收起后保留的轨道宽度(px)
  const LEAVE_SLACK = 6;          // 移出判定余量(px)
  const CLICK_GUARD_MS = 250;     // 点击后的短暂锁,防止动画期间重复触发
  // 官方折叠按钮:优先用固定类名;aria-label 在收起/展开态下文案会变,仅作兜底
  const TOGGLE_SELECTOR = '.hHd-Xa_toggle, button[aria-label="收起侧边栏"], button[aria-label="展开侧边栏"]';
  const SIDEBAR_SELECTOR = ".hHd-Xa_root";
  const COLLAPSED_SELECTOR = ".hHd-Xa_root.hHd-Xa_collapsed";

  let clickLockedUntil = 0;

  /** 模态对话框(设置面板等)打开时暂停自动化:折叠侧边栏会连带关闭模态。 */
  const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], .VOzbGW_overlay';

  function isModalOpen() {
    return document.querySelector(MODAL_SELECTOR) !== null;
  }

  /** 设置模态遮罩的 backdrop-filter 模糊在 Electron 里很贵,桌面版去掉(保留半透明遮罩)。 */
  const PERF_CSS = `.VOzbGW_mask{backdrop-filter:none!important}`;

  function injectPerfCss() {
    try {
      const style = document.createElement("style");
      style.textContent = PERF_CSS;
      (document.head || document.documentElement).appendChild(style);
    } catch { /* 忽略 */ }
  }

  function isCollapsed() {
    return document.querySelector(COLLAPSED_SELECTOR) !== null;
  }

  function clickToggle() {
    const now = Date.now();
    if (now < clickLockedUntil) return false;
    const btn = document.querySelector(TOGGLE_SELECTOR);
    if (!btn) return false;
    clickLockedUntil = now + CLICK_GUARD_MS;
    btn.click();
    return true;
  }

  /** 自动收起(仅在页面刚加载、侧边栏处于展开态时执行一次)。 */
  function autoCollapseOnce() {
    if (isCollapsed()) return;
    clickToggle();
  }

  function onMouseMove(e) {
    if (Date.now() < clickLockedUntil) return;
    if (isModalOpen()) return; // 设置等模态打开:不触发任何折叠/展开
    if (isCollapsed()) {
      // 收起态:鼠标进入最左侧轨道 → 展开
      if (e.clientX <= COLLAPSED_RAIL) clickToggle();
    } else {
      // 展开态:鼠标移出侧边栏列 → 收起
      const root = document.querySelector(SIDEBAR_SELECTOR);
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (e.clientX > rect.right + LEAVE_SLACK) clickToggle();
    }
  }

  function start() {
    injectPerfCss();
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    // 等 React 渲染出折叠按钮(官方 UI 是 SPA,加载有延迟)
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (document.querySelector(TOGGLE_SELECTOR)) {
        clearInterval(iv);
        setTimeout(autoCollapseOnce, 120);
      } else if (tries > 60) {
        clearInterval(iv); // 状态页等非主界面:放弃
      }
    }, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
