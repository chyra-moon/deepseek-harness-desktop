<div align="center">

  <h1>DeepSeek Harness Desktop</h1>

  <p><strong>熟悉的 DeepSeek Harness，更顺手的 Windows 桌面体验。</strong></p>

  <p>官方 Web 界面 · 内置本地服务 · 托盘常驻 · 自动恢复</p>

  <p>
    <a href="https://github.com/chyra-moon/deepseek-harness-desktop/releases"><img src="https://img.shields.io/github/v/release/chyra-moon/deepseek-harness-desktop?include_prereleases&style=flat-square&color=4D6BFE&label=release" alt="GitHub Release"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20x64-4D6BFE?style=flat-square" alt="Windows x64">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748B?style=flat-square" alt="MIT License"></a>
  </p>

  <p>
    <a href="https://github.com/chyra-moon/deepseek-harness-desktop/releases"><strong>下载最新版 →</strong></a>
    &nbsp; · &nbsp;
    <a href="#快速开始">快速开始</a>
    &nbsp; · &nbsp;
    <a href="https://github.com/chyra-moon/deepseek-harness-desktop/issues">问题反馈</a>
    &nbsp; · &nbsp;
    <a href="README_EN.md">English</a>
  </p>

</div>

---

## 项目介绍

**DeepSeek Harness Desktop** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Windows 桌面适配版。项目使用 Electron 加载官方 Web 前端，将本地服务的启动、连接与恢复整合进桌面应用，让你从桌面直接进入 Harness 工作区。

安装包包含运行时与官方 dsh 服务，日常启动无需另行安装 Node.js 或输入命令。桌面适配层提供窗口管理、托盘驻留和连接恢复等能力；Harness 的核心功能与工作流程由内置的官方 dsh 提供。

> 本项目由社区维护，非 DeepSeek 官方客户端。DeepSeek Harness、`@deepseek-ai/*` 软件包及官方前端的版权归各自权利人所有。

## 桌面版带来了什么

| 能力 | 使用体验 |
| --- | --- |
| **官方界面** | 加载官方 Web 前端，延续 Harness 的工作区与会话操作方式。 |
| **服务自动管理** | 启动时自动连接或拉起本地 dsh 服务，无需单独维护终端窗口。 |
| **已有服务复用** | 默认探测本机 `3080` 端口；识别到 dsh 服务后直接连接，可与浏览器使用同一实例。 |
| **连接异常恢复** | 定期检查服务状态，检测到异常后尝试恢复服务并重新加载页面。 |
| **桌面常驻** | 支持托盘显示与隐藏、窗口位置和尺寸记忆，以及单实例运行。 |
| **清晰的启动状态** | 鲸鱼光点动画搭配状态提示，展示服务启动与恢复过程。 |

## 下载与安装

### [获取最新版本 →](https://github.com/chyra-moon/deepseek-harness-desktop/releases)

面向 **Windows x64**。进入发布页面，查看版本说明，并在 **Assets** 中选择适合你的文件：

| 发行形式 | 文件名特征 | 适合场景 |
| --- | --- | --- |
| **安装版 · 推荐** | `DeepSeek.Harness-<版本>-x64.exe` | 日常使用，可选择安装目录，并创建桌面与开始菜单快捷方式。 |
| **解压版** | `DeepSeek.Harness-<版本>-win32-x64.zip` | 希望直接管理应用文件；完整解压后运行其中的程序。 |
| **单文件便携版** | `DeepSeek.Harness-<版本>-portable-x64.exe` | 无需安装；启动时需要解包，可能比安装版等待更久。 |

文件名以发布页面实际附件为准。下载入口不绑定具体版本，后续更新可继续通过同一链接获取；预发布版本也请在发布列表中查看。

## 快速开始

1. **下载并启动**：安装应用，或将 ZIP 完整解压后运行 `DeepSeek Harness.exe`。
2. **等待服务就绪**：应用自动启动内置服务；若默认端口已有可识别的 dsh 服务，则直接复用。
3. **进入工作区**：在 Harness 界面中完成所需配置，选择工作区并开始使用。模型连接与凭据以官方界面的配置要求为准。

关闭窗口后，应用默认保留在系统托盘。点击托盘图标可恢复窗口；要完全关闭应用，请在托盘菜单中选择 **退出**。

### 常用快捷键

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl + R` / `F5` | 重新加载当前页面 |
| `Ctrl + Shift + O` | 在系统浏览器中打开当前服务 |
| `Ctrl + Shift + I` | 打开或关闭开发者工具 |

## 使用说明

<details>
<summary><strong>与浏览器版一起使用</strong></summary>

应用默认检查 `127.0.0.1:3080`，识别到已运行的 dsh 服务后会直接连接。同一服务实例下，桌面端和浏览器端访问的是同一套会话数据。

若该端口被其他程序占用，应用会尝试使用空闲端口启动内置服务。可通过托盘菜单中的 **关于** 查看当前服务地址和运行模式。

</details>

<details>
<summary><strong>关闭托盘驻留与选择工作区</strong></summary>

完全退出应用后，在应用数据目录的 `settings.json` 中将 `closeToTray` 改为 `false`，下次启动后关闭窗口即可退出。修改时保留文件中的其他配置项。

工作区默认使用应用内浏览式目录选择器，以改善远程桌面及受控会话环境下的兼容性。当前版本启动时会将历史 `directoryPicker: "native"` 配置迁移为 `"browse"`。

</details>

<details>
<summary><strong>版本更新</strong></summary>

普通用户可随时通过 [Releases 页面](https://github.com/chyra-moon/deepseek-harness-desktop/releases) 获取更新，具体变化以各版本的发布说明为准。

项目也提供可配置的自动更新机制：打包版通过环境变量 `DSH_UPDATE_URL` 或应用数据目录中的 `update-url.txt` 读取更新源。未配置更新源时会跳过自动更新；配置有效更新源后，会在启动时检查、下载更新，并在下载完成后启动安装与重启流程。

更新源需要提供 electron-updater Generic Provider 所需的更新清单与安装文件，不是直接填入 GitHub Releases 页面地址。

</details>

<details>
<summary><strong>升级到 0.1.5 时的会话数据变化</strong></summary>

官方 dsh `0.1.5` 起将**会话日志格式升级到 V3**：应用打开旧会话时会自动迁移，**生成新版日志文件并保留原文件**（同目录下 `session.v3.jsonl.zstd` 与 `session.jsonl.zstd` 并存）。

需要注意：**升级后的新内容只写入 V3 文件，更早版本的应用无法读取它**。因此从 0.1.5 回退到旧版本时，旧历史仍可读取，但升级之后产生的对话不会显示。

建议：跨大版本升级前先备份应用数据目录下的 `sessions` 文件夹（例如 `%USERPROFILE%\.dsh\sessions`）。

</details>

<details>
<summary><strong>启动异常与问题反馈</strong></summary>

服务恢复需要一定时间，实际耗时取决于本机环境与服务启动情况。若持续无法进入界面，可先通过托盘 **关于** 查看服务信息，再通过 [Issues](https://github.com/chyra-moon/deepseek-harness-desktop/issues) 反馈。

建议附上应用版本、Windows 版本、使用的发行形式和复现步骤；如有错误信息，可一并提供相关片段。

</details>

## 开发与构建

<details>
<summary><strong>从源码运行、验证与打包</strong></summary>

准备 Windows x64 与 Node.js / npm 环境，在项目目录执行：

```bash
npm install
npm run icon
npm start
```

常用维护命令：

| 命令 | 用途 |
| --- | --- |
| `npm run smoke` | 运行应用启动冒烟检查 |
| `npm run dist` | 构建安装版、解压版与便携版，并校验打包完整性 |
| `npm run verify` | 单独校验已生成的应用包 |
| `npm run update:dsh` | 升级官方 dsh 并重新构建发行包 |
| `npm run preview -- --open` | 在浏览器中预览启动状态页 |

构建产物位于 `release/`。当前源码中的桌面版本与内置 dsh 版本均为 `0.1.5-rc.1`；后续以 `package.json` 和发布说明为准。

</details>

## 致谢与许可

感谢 [DeepSeek](https://github.com/deepseek-ai) 及 DeepSeek Harness 贡献者提供的开源基础。

本项目以 [MIT License](LICENSE) 开源。上游软件包与其他依赖遵循各自的许可证。
