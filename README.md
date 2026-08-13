# DeepSeek Harness 桌面版 (Desktop)

> ⚠️ **社区项目,非官方出品**:本项目是第三方社区开发的桌面外壳,
> 与 DeepSeek 公司无隶属关系。DeepSeek Harness 本体、`@deepseek-ai/*` 软件包
> 及官方前端版权归 [deepseek-ai](https://github.com/deepseek-ai) 及其贡献者所有,
> 详见其 [MIT 许可](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE)。

将 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方网页版 **一比一** 复刻为 Windows 桌面应用。

UI 与网页版**像素级一致**:桌面版直接加载官方 `dsh web` 服务器与官方前端
(`@deepseek-ai/dsh` + `@deepseek-ai/dsh-web-frontend` 构建产物),未对界面做任何改动;
Electron 只提供原生桌面外壳:窗口、托盘、菜单、服务器托管。

## 特性

- **一比一 UI**:与浏览器版完全相同的界面与交互(同一个前端,同一个服务器)
- **服务器托管**:应用内置官方 `dsh` 服务器,双击即用,无需手动开终端
- **智能复用**:若 `127.0.0.1:3080` 已有官方服务器在运行(例如浏览器版),
  桌面版直接复用,不重复启动
- **系统托盘**:关闭窗口后驻留托盘,随时恢复;托盘菜单可打开浏览器、退出
- **原生菜单**:在浏览器中打开 / 重新加载 / 开发者工具 / 缩放 / 关于等
- **单实例**:重复启动只会聚焦已有窗口
- **窗口状态记忆**:记住上次窗口位置与大小
- **会话数据共享**:与 CLI / 浏览器版共用同一 `~/.dsh` 数据目录

## 快速开始

```bash
npm install        # 安装依赖(含 electron 与官方 dsh)
npm run icon       # 由官方 favicon.svg 生成应用图标(仅首次需要)
npm start          # 启动桌面应用
```

启动后:

1. 应用会先探测 `127.0.0.1:3080` 是否已有官方 dsh 服务器(有则复用);
2. 否则自动托管一个内置服务器(3080 被占用时自动改选空闲端口);
3. 官方 UI 在一个原生窗口中打开 —— 与网页版完全一致。

## 冒烟测试

```bash
npm run smoke                 # 复用模式:探测/复用 127.0.0.1:3080 上的官方服务器
npm run smoke -- --port 0     # 自建模式:强制启动一个内置服务器(系统分配端口)
```

自动启动、加载页面、校验 `window.__DSH_BOOT__` 注入与页面标题,然后退出
(退出码 0 = 通过,1 = 校验失败,2 = 超时)。`--port N` 可强制自建服务器到
指定端口并跳过复用逻辑(0 = 系统分配),也适用于正常启动:
`npm start -- --port 0`。

## 打包发行

```bash
npm run dist
```

流程:`electron-packager`(原样复制 node_modules,含嵌套依赖结构)→
`electron-builder --prepackaged`(生成安装包)。输出到 `release/`:

- `DeepSeek Harness-0.1.0-x64.exe` —— NSIS 安装包(可选安装目录、桌面/开始菜单快捷方式)
- `DeepSeek Harness-0.1.0-portable-x64.exe` —— 免安装便携版(首次启动需解压,较慢)

> **为什么不用 electron-builder 直接打包**:其 node-modules 智能收集器会
> 丢弃 peerDependencies(官方 dsh 大量使用 peer 依赖,如
> `@deepseek-ai/cordis-plugin-group` 等 90+ 个包),导致打包产物缺模块。
> 本项目已把全部 peer 依赖显式声明在 `package.json` 的 `dependencies` 中,
> 并用 `electron-packager` 原样复制依赖树,保证运行时自包含。

## 配置

设置保存在 Electron `userData` 目录的 `settings.json`:

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `closeToTray` | `true` | 关闭窗口时最小化到托盘 |
| `workspace` | 用户主目录 | 内置服务器的模型工作目录(agent 的 cwd) |

也可通过环境变量 `DSH_WORKSPACE` 指定工作目录。

## 目录结构

```
├── src/
│   ├── main.js        # Electron 主进程:服务器托管、窗口、托盘、菜单、单实例
│   └── preload.js     # 只读桌面环境信息(window.dshDesktop),不干预页面
├── scripts/
│   ├── make-icon.js           # 由官方 favicon.svg 生成 icon.png / tray.png
│   └── scan-deps-bounded.js   # 打包产物依赖完整性体检(诊断工具)
├── assets/            # 生成的图标
└── package.json
```

## 工作原理

- 服务器:`spawn(process.execPath, [dsh/lib/bin.js, "web", "--host", "127.0.0.1", "--port", N])`
  并以 `ELECTRON_RUN_AS_NODE=1` 让 Electron 充当 Node 运行时 —— 打包后无需用户另装 Node;
  打包布局无 asar(`resources/app/`),服务器子进程全部从真实磁盘加载;
- 就绪检测:解析服务器 stdout 的 `dsh web: http://127.0.0.1:PORT` 行,
  并对该地址轮询直到返回官方首页;
- 原生模块(node-pty / koffi)使用随包预编译产物(为 Node ABI 构建,
  恰好匹配 `ELECTRON_RUN_AS_NODE` 运行时);
- 远程桌面/无 GPU 环境:主进程已调用 `app.disableHardwareAcceleration()`,
  规避 Chromium 硬件加速路径的偶发 fail-fast 崩溃;
- 复用模式:应用退出时**不会**关闭外部服务器;托管模式:退出时随应用关闭。

## 常见问题

- **npm 11 的 allow-scripts 策略拦截安装脚本**:若 `npm install` 后提示
  `install scripts not yet covered by allowScripts`,执行
  `npm approve-scripts koffi @deepseek-ai/dsh-subprocess-local`,
  并确认 `node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node` 存在
  (缺失时用 `npm install @koromix/koffi-win32-x64@3.1.4 --no-save` 补装)。
- **打包后启动报 "找不到 dsh 服务器入口"**:确认安装包由 `npm run dist`
  生成(带 peer 依赖补全的完整依赖树);`resolveDshBin` 兼容有/无 asar
  两种布局。

## 许可

本项目以 [MIT](LICENSE) 协议开源。DeepSeek Harness 本体、`@deepseek-ai/*`
软件包及官方前端版权归 DeepSeek 及其贡献者所有。
