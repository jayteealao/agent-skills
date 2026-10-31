# Adapter: `desktop`

The registry ([../runtime-adapters.md](../runtime-adapters.md)) selects this adapter. [_protocols.md](_protocols.md) owns the enumeration and perturbation rules; this file gives only the steps of this platform.

## Bootstrap
1. **Build the desktop app** — `npm run electron:dev`, `cargo tauri dev`, or the project's documented launch command.
2. **For Electron**: probe may attach via Playwright for Electron — install if needed (`npm install -D playwright`).
3. **Host with no display** — on Linux, wrap the launch and the whole drive in a virtual framebuffer: `xvfb-run -a <launch/test command>`. Electron and Playwright for Electron run under Xvfb. [_ladder.md](_ladder.md) → Headless boot names the real wall on each OS.
4. **Resolution attempt before failing:** retry once after `npm install` / `cargo build` if the launch fails.

## Enumerate
1. **Recipe rung** — read the menu template (Electron `Menu.buildFromTemplate`, Tauri menu builder) and the window/route registry.
2. **Static rung** — grep for window-creation calls and renderer route literals.
3. **Traversal rung** — walk the menu tree in the running app, recording each reachable window and dialog.

## Drive
- **Electron** — Playwright for Electron exposes the same Page API as web. Use it for click/type/screenshot.
- **Tauri** — drive via the webview side using a Playwright connection if the app exposes one; otherwise fall back to OS-level automation (PyAutoGUI, Robot Framework with imagebased keywords).
- **Native (PyQt, etc.)** — use PyAutoGUI for OS-level events; this is the least precise option and should be a last resort.

## Observe
- **Screenshots** — Playwright `page.screenshot()` for Electron; OS-level screen capture (`screencapture` on macOS, `gnome-screenshot` on Linux, `Snipping Tool` programmatic on Windows) for native.
- **Logs** — application log file location varies; check `~/Library/Logs/<app>/` (macOS), `%APPDATA%\<app>\logs\` (Windows), `~/.config/<app>/logs/` (Linux).

## Perturb
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
- App exits with `cannot open display` / `Missing X server` / `GTK could not initialize` (Linux, no display) → this is a no-display failure, not a broken build. Run the launch and the drive again under `xvfb-run -a …`.
- Tauri build fails → "Ensure Rust toolchain and platform-specific build tools (Xcode CLT on macOS, MSVC on Windows, libwebkit2gtk on Linux) are installed."
