# scripts/tray.ps1 — launch the sunflower system-tray app (TRAY-APP-PLAN.md).
#
# Usage:
#   .\scripts\tray.ps1
#
# Puts a sunflower icon in the Windows notification area that controls the hub:
# health summary, open dashboard, refresh registry, restart/stop, open config/logs,
# per-repo-serve toggle, and "Start at login". The hub keeps running when you quit
# the tray. Prefers the committed bundle (dist/tray.mjs); falls back to source.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "node not found on PATH. Install Node.js >= 20 and re-run." -ForegroundColor Red
  exit 1
}

$pluginRoot = Split-Path -Parent $PSScriptRoot
$bundle = Join-Path $pluginRoot "dist/tray.mjs"
$source = Join-Path $pluginRoot "scripts/tray.mjs"
$entry = if (Test-Path $bundle) { $bundle } else { $source }

Write-Host "Starting SDLC sunflower tray..."
Write-Host "(close from the tray menu's Quit; the hub keeps running)"
& node $entry
