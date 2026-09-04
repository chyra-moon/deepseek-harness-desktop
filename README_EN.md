<div align="center">
  <a href="README.md">绠€浣撲腑鏂?/a> | English
</div>

# DeepSeek Harness Desktop

![GitHub Release](https://img.shields.io/github/v/release/chyra-moon/deepseek-harness-desktop)
![License](https://img.shields.io/github/license/chyra-moon/deepseek-harness-desktop)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)

> 鈿狅笍 **Community project; not an official release.** DeepSeek Harness itself, the `@deepseek-ai/*` packages, and the official frontend are copyrighted by [deepseek-ai](https://github.com/deepseek-ai) and their contributors.

Run the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI as a Windows desktop app 鈥?**the same interface, the same server, ready with a double-click**.

## Why use it?

- 馃幆 **Zero configuration**: No Node.js installation or command line required. Install it, double-click it, and get the official UI鈥攏ot a replica or custom skin.
- 馃惓 **Bundled server**: The app hosts the official dsh server itself. If the web or CLI version is already running, the app automatically reuses it and shares the same session data.
- 馃攧 **Automatic recovery**: If an external server stops, the app takes over and restarts it within five seconds, then restores the page automatically.
- 馃枼 **A proper desktop experience**: System tray support, remembered window state, single-instance behavior, automatic crash recovery, and a clean menu-free window.
- 馃悑 **Whale loading animation**: The official whale is rendered with blue and white glowing dots, faithfully preserving details such as its belly, eye, and splash, with a gentle breathing motion.

## Download

| Edition | Link | Description |
| --- | --- | --- |
| Installer (recommended) | [DeepSeek.Harness-0.1.2-rc.1-x64.exe](https://github.com/chyra-moon/deepseek-harness-desktop/releases/download/v0.1.2-rc.1/DeepSeek.Harness-0.1.2-rc.1-x64.exe) | Automatically creates Desktop and Start menu shortcuts |
| Archive | [DeepSeek.Harness-0.1.2-rc.1-win32-x64.zip](https://github.com/chyra-moon/deepseek-harness-desktop/releases/download/v0.1.2-rc.1/DeepSeek.Harness-0.1.2-rc.1-win32-x64.zip) | Extract and run; the extraction progress is visible |
| Portable | [DeepSeek.Harness-0.1.2-rc.1-portable-x64.exe](https://github.com/chyra-moon/deepseek-harness-desktop/releases/download/v0.1.2-rc.1/DeepSeek.Harness-0.1.2-rc.1-portable-x64.exe) | Single executable; the first launch extracts in the background and may take several minutes without a progress indicator |

Keyboard shortcuts: `Ctrl+Shift+I` opens Developer Tools 路 `Ctrl+R` reloads 路 `Ctrl+Shift+O` opens the app in your browser.
Closing the window keeps the app running in the system tray. Right-click the tray icon to quit or view app information.

## Run from source

```bash
npm install && npm start      # Icons are auto-generated when missing; you can also run npm run icon manually
```

Other useful commands:

```bash
npm run dist                      # Build installer + archive + portable, then verify package integrity
npm run verify                    # Run package-integrity checks separately
npm run update:dsh                # Upgrade the official dsh packages and rebuild all distributions
npm run preview -- --open         # Preview the loading animation live in your browser
```

When the official dsh project publishes a new release, Dependabot automatically opens an upgrade PR and CI runs the Windows smoke test. After merging it, run `npm run update:dsh` to produce new distributions.

## FAQ

- **Antivirus warning**: False positives are common for unsigned community applications. All source code is public, so you can audit it or build the app yourself.
- **Do not keep the app in the system tray after closing the window**: Set `"closeToTray": false` in `settings.json` inside the app data directory.
- **The workspace picker does not open**: Since 0.1.2-rc.1 the app defaults to the **in-app browser-style picker** (`"directoryPicker": "browse"`), avoiding the native dialog worker crash in Remote Desktop / remote-controlled sessions. Existing `"native"` settings are automatically migrated to `"browse"` on startup. Set `"native"` manually only if you need the Windows native dialog on a physical desktop session.
- **Adding a workspace fails with a Chinese path**: The official 0.1.1 series native directory picker had a UTF-16 truncation bug (reported upstream); 0.1.2-rc.1 ships the official inlined fix, and the desktop packaging patch recognizes it idempotently. No action needed.
- **Use the latest official version**: Run the latest official `npx @deepseek-ai/dsh web`; the desktop app will detect and reuse it automatically.

## License

This project is open source under the [MIT License](LICENSE).




