# Adapter: `desktop`

## Detection signals
- `package.json` with `electron` / `electron-builder` / `tauri-build` dependency
- `src-tauri/` directory (Tauri)
- `pyproject.toml` declaring `pyqt`, `pyside`, `tkinter`, `kivy`, `wxpython` dependencies
- `.app` / `.exe` bundles under `dist/` or `build/`

## Bootstrap
1. **Build the desktop app** — `npm run electron:dev`, `cargo tauri dev`, or the project's documented launch command.
2. **For Electron**: probe may attach via Playwright for Electron — install if needed (`npm install -D playwright`).
3. **Headless host (no display)** — a GUI app started from a background subagent, SSH, or CI has no display to draw into. On **Linux**, wrap the launch and the whole drive in a virtual framebuffer: `xvfb-run -a <launch/test command>` (Electron + Playwright-for-Electron run cleanly under Xvfb, and `page.screenshot()` reads the offscreen surface). On **macOS / Windows**, a native GUI app genuinely needs an interactive desktop session — that (not a missing display flag) is the real wall, so if none is available, defer with the recorded launch failure after climbing any device-free rungs (unit/component tests) first. Do NOT record "no display" as the residual until `xvfb-run` (Linux) has been attempted.
4. **Resolution attempt before failing:** retry once after `npm install` / `cargo build` if the launch fails.

## Enumerate
Inventory windows and menus **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the menu template (Electron `Menu.buildFromTemplate`, Tauri menu builder) and the window/route registry.
2. **Static rung** — grep for window-creation calls and renderer route literals.
3. **Traversal rung** — walk the menu tree in the running app, recording each reachable window and dialog. The count is a FLOOR.

## Drive
- **Electron** — Playwright for Electron exposes the same Page API as web. Use it for click/type/screenshot.
- **Tauri** — drive via the webview side using a Playwright connection if the app exposes one; otherwise fall back to OS-level automation (PyAutoGUI, Robot Framework with imagebased keywords).
- **Native (PyQt, etc.)** — use PyAutoGUI for OS-level events; this is the least precise option and should be a last resort.

## Observe
- **Screenshots** — Playwright `page.screenshot()` for Electron; OS-level screen capture (`screencapture` on macOS, `gnome-screenshot` on Linux, `Snipping Tool` programmatic on Windows) for native.
- **Logs** — application log file location varies; check `~/Library/Logs/<app>/` (macOS), `%APPDATA%\<app>\logs\` (Windows), `~/.config/<app>/logs/` (Linux).

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **Offline** — disconnect the app's backing service (harness-owned only).
- **Missing config / first-run state** — launch against a fresh profile directory.
Restore the original profile before teardown.

## Tear down
- Quit the application: `osascript -e 'quit app "<name>"'` (macOS), equivalent on other OSes.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png        # screenshot
  <criterion-or-target-slug>.log        # app log excerpt
```

## Remediation hints
- Electron app fails to start → "Run the dev script manually and check for missing native modules; common culprits are `node-gyp` build failures."
- App exits with `cannot open display` / `Missing X server` / `GTK could not initialize` (Linux, headless) → this is a **no-display** failure, not a broken build. Re-run the launch and drive under `xvfb-run -a …`; only after the framebuffer attempt fails is the display genuinely unavailable.
- Tauri build fails → "Ensure Rust toolchain and platform-specific build tools (Xcode CLT on macOS, MSVC on Windows, libwebkit2gtk on Linux) are installed."
