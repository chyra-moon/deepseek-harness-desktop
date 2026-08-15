"use strict";

/**
 * 预加载脚本:
 * 1. 暴露只读的桌面环境信息(window.dshDesktop),不干预页面数据;
 * 2. 侧边栏悬停自动化(桌面版增强):打开页面自动收起侧边栏,
 *    鼠标移入左侧 56px 轨道自动展开,移出侧边栏区域自动收起。
 *    展开/收起通过点击官方折叠按钮触发,动画与官方完全一致。
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
