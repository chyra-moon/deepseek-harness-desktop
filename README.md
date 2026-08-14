# DeepSeek Harness 桌面版

![GitHub Release](https://img.shields.io/github/v/release/chyra-moon/deepseek-harness-desktop)
![License](https://img.shields.io/github/license/chyra-moon/deepseek-harness-desktop)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)

> ⚠️ **社区项目，非官方出品**。DeepSeek Harness 本体、`@deepseek-ai/*` 软件包与官方前端版权归 [deepseek-ai](https://github.com/deepseek-ai) 及其贡献者所有。

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方网页版装进 Windows 桌面应用 —— **同一个界面、同一个服务器，双击即用**。

## 为什么选它

- 🎯 **零配置**：不用装 Node.js、不用敲命令，装完双击就是官方界面（一比一加载官方前端，不是仿制皮肤）
- 🐳 **服务器内置**：应用自己托管官方 dsh 服务器；你已开着网页版/CLI 时自动复用，会话数据互通
- 🔄 **断线自愈**：外部服务器被关掉？应用 5 秒内自动接管重启，页面自动恢复，不会"界面还在但发不了消息"
- 🖥 **正经桌面体验**：托盘驻留、窗口记忆、单实例、崩溃自动重启、无菜单栏纯净窗口
- 🐋 **鲸鱼加载动画**：官方鲸鱼由蓝/白光点构成（肚皮、眼睛、水花三处细节一比一），呼吸式起伏

## 下载

| 版本 | 链接 | 说明 |
| --- | --- | --- |
| 安装版（推荐） | [DeepSeek.Harness-0.1.0-x64.exe](https://github.com/chyra-moon/deepseek-harness-desktop/releases/latest/download/DeepSeek.Harness-0.1.0-x64.exe) | 桌面/开始菜单自动建快捷方式 |
| 免安装便携版 | [DeepSeek.Harness-0.1.0-portable-x64.exe](https://github.com/chyra-moon/deepseek-harness-desktop/releases/latest/download/DeepSeek.Harness-0.1.0-portable-x64.exe) | 首次启动解压较慢（正常现象） |

快捷键：`Ctrl+Shift+I` 开发者工具 · `Ctrl+R` 重载 · `Ctrl+Shift+O` 在浏览器打开。
关闭窗口会驻留托盘，托盘右键可退出或查看关于信息。

## 从源码运行

```bash
npm install && npm start      # 首次使用前先执行 npm run icon 生成图标
```

其他常用命令：

```bash
npm run dist                      # 打包(NSIS 安装版 + 便携版)
npm run update:dsh                # 一键升级官方 dsh 并重新出包
npm run preview -- --open         # 浏览器实时预览加载动画
```

官方 dsh 发新版后，Dependabot 会自动开升级 PR（CI 自动跑 Windows 冒烟），合并后跑一条 `npm run update:dsh` 即可出新安装包。

## 常见问题

- **杀毒软件报毒**：社区未签名应用的常见误报；源码全部公开，可自行审计或从源码构建
- **不想关窗口驻留托盘**：在应用数据目录的 `settings.json` 里设置 `"closeToTray": false`
- **工作区选择器打不开**（远程桌面环境）：`settings.json` 里设置 `"directoryPicker": "browse"` 改用应用内浏览选择器（`"native"` 为 Windows 原生对话框，默认值）
- **想用最新官方版**：跑官方最新的 `npx @deepseek-ai/dsh web`，桌面版会自动复用

## 许可

本项目以 [MIT](LICENSE) 协议开源。
