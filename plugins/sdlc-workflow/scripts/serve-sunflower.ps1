# scripts/serve-sunflower.ps1 — Windows tailscale wrapper for the sunflower view.
#
# Usage:
#   .\scripts\serve-sunflower.ps1 [-Root <path>] [-Port <int>] [-Path <slug>]
#
# Defaults:
#   -Root .ai/_view
#   -Port 443    (HTTPS via tailscale)
#   -Path /sdlc
#
# Requires:
#   tailscale (https://tailscale.com/download) on PATH.
#   View tree must already be rendered (run `node scripts/render-sunflower.mjs`).

[CmdletBinding()]
param(
  [string]$Root = ".ai/_view",
  [int]$Port = 443,
  [string]$Path = "/sdlc"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
  Write-Host "tailscale CLI not found on PATH." -ForegroundColor Red
  Write-Host "Install from https://tailscale.com/download and re-run."
  exit 1
}

$resolved = Resolve-Path -Path $Root -ErrorAction SilentlyContinue
if (-not $resolved) {
  Write-Host "View root not found: $Root" -ForegroundColor Yellow
  Write-Host "Render it first: node scripts/render-sunflower.mjs"
  exit 1
}

Write-Host "Serving $resolved at https://<host>.<tailnet>${Path}/ on port $Port"
Write-Host "(Ctrl+C to stop)"

& tailscale serve --bg=false --https=$Port --set-path=$Path $resolved
