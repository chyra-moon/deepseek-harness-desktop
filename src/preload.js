"use strict";

/**
 * 预加载脚本:只暴露只读的桌面环境信息,不干预页面(保持 UI 一比一)。
 * 页面可通过 window.dshDesktop 感知自己运行在桌面版中。
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
