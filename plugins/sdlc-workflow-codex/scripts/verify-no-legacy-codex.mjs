#!/usr/bin/env node
// scripts/verify-no-legacy-codex.mjs
//
// NATIVE-INTEROP-REWRITE-PLAN Workstream I regression gate: keep the native Codex
// package the ONLY Codex execution path. Two modes:
//
//   node scripts/verify-no-legacy-codex.mjs               # forward invariants (green now)
//   node scripts/verify-no-legacy-codex.mjs --post-cutover # also assert the legacy is gone
//
// The default mode asserts what is true today and must stay true: the Codex
// package is handwritten (no generated-wrapper artifacts) and is exposed in the
// Codex repo marketplace. The --post-cutover mode additionally asserts the legacy
// generated Codex packaging inside the Claude plugin, and the duplicate Codex
// marketplace exposure, have been removed — run it AFTER the cutover described in
// docs/internal/CUTOVER.md to lock the removal in.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CODEX_PKG = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const CLAUDE_PKG = join(REPO_ROOT, 'plugins', 'sdlc-workflow');
const MARKETPLACE = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');

const postCutover = process.argv.includes('--post-cutover');
const problems = [];

// ── forward invariants (always enforced) ────────────────────────────────────────

// 1. The Codex package itself must be handwritten — never carry generated wrappers.
for (const rel of ['.codex-generated', '.codex-plugin.overrides.json']) {
  if (existsSync(join(CODEX_PKG, rel))) problems.push(`Codex package contains a generated-wrapper artifact: ${rel}`);
}
// 2. The handwritten router surface must exist.
if (!existsSync(join(CODEX_PKG, 'skills', 'wf', 'SKILL.md'))) {
  problems.push('Codex package is missing its handwritten router skills (skills/wf/SKILL.md)');
}
// 3. The Codex repo marketplace must expose sdlc-workflow-codex.
const market = readMarketplace();
if (market && !market.names.includes('sdlc-workflow-codex')) {
  problems.push('Codex repo marketplace (.agents/plugins/marketplace.json) does not expose sdlc-workflow-codex');
}

// ── post-cutover invariants (the legacy must be gone) ───────────────────────────

if (postCutover) {
  for (const rel of ['.codex-generated', '.codex-plugin', '.codex-plugin.overrides.json']) {
    if (existsSync(join(CLAUDE_PKG, rel))) {
      problems.push(`legacy generated Codex packaging still present in the Claude plugin: ${rel}`);
    }
  }
  if (market && market.names.includes('sdlc-workflow')) {
    problems.push('Codex repo marketplace still exposes the legacy `sdlc-workflow` entry (duplicate Codex exposure)');
  }
}

if (problems.length) {
  process.stderr.write(`[verify-no-legacy-codex] FAIL (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`[verify-no-legacy-codex] OK${postCutover ? ' (post-cutover: legacy removed)' : ''}\n`);

function readMarketplace() {
  try {
    const json = JSON.parse(readFileSync(MARKETPLACE, 'utf-8'));
    return { names: (json.plugins || []).map((p) => p.name) };
  } catch {
    return null; // marketplace absent in this checkout — not this gate's concern
  }
}
