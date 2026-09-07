# bin/tray — the vendored tray helpers

The system tray app (`scripts/tray.mjs`) drives one of these three helper
binaries over stdio. `scripts/tray.mjs` copies the helper for the current
platform to `~/.sdlc/bin/` and runs that copy; it never executes a file in the
plugin directory.

## Provenance

| File | Platform | Size (bytes) | Upstream |
| --- | --- | --- | --- |
| `tray_windows_release.exe` | Windows x64 | 3,637,760 | `systray-portable` helper as shipped in the `systray2` npm package |
| `tray_darwin_release` | macOS | 4,220,664 | same |
| `tray_linux_release` | Linux x64 | 3,566,752 | same |

- Upstream project: `felixhao28/systray-portable` (Go, `getlantern/systray`
  fork), distributed through the `systray2` npm package under `traybin/`.
- Vendored: 2026-06-07, plugin release 9.46.0 (commit `cf412e78`).
- Upstream version and build date: not recorded at vendoring time. Record
  both here on the next refresh; until then the SHA-256 digests below are the
  identity of the helpers this plugin ships.

## Integrity

`SHA256SUMS` carries the SHA-256 digest of each helper. Before `scripts/tray.mjs`
copies a helper to `~/.sdlc/bin/`, `verifyTrayHelper` in
`lib/tray-autostart.mjs` computes the digest and compares it with the entry.
A missing entry or a mismatch refuses the copy and logs the reason; the tray
does not start on an unverified helper.

To refresh a helper:

1. Replace the binary in this directory.
2. Regenerate the manifest. Run `sha256sum tray_* > SHA256SUMS` in this
   directory. The manifest must list all three helpers.
3. Record the upstream version and build date in the table above.
4. Run `npm test -- exposure-defaults`. The test checks the manifest against
   the three files.
