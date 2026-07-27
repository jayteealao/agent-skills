// skills/consult/scripts/isolate.mjs
//
// Hook-isolation + credential-scrub for headless oracle dispatch.
// EXTERNAL-MODEL-DISPATCH-PLAN §3.1 / §12.0.
//
// A headless `claude`/`codex` sub-agent spawned by the `consult` skill boots a
// session INSIDE the user's repo. Two problems follow, and this module shapes
// the child `env` to neutralise both:
//
//   1. Hooks. A booted Claude session fires the repo's SDLC SessionStart hook
//      (hub adopt/register/bootstrap render) and — if it wrote — the write
//      hooks. The load-bearing suppression is the `SDLC_DISPATCH_ACTIVE=1`
//      sentinel set here, which every SDLC hook early-exits on. (The plan's
//      `--settings {disableAllHooks:true}` flag is deliberately NOT used: that
//      key is undocumented, an unknown --settings key could abort the headless
//      run, and `--bare` would break subscription OAuth — so the sentinel, fully
//      under our control and carrying zero auth risk, is the PRIMARY mechanism,
//      not mere defense-in-depth.) Codex does not run Claude Code hooks at all;
//      the sentinel is harmless there and the read-only OS sandbox is its guarantee.
//
//   2. Billing. Headless `claude` bills per-token when ANTHROPIC_API_KEY /
//      ANTHROPIC_AUTH_TOKEN are present (credential precedence: cloud creds >
//      AUTH_TOKEN > API_KEY > apiKeyHelper > OAuth). To bill the user's
//      subscription instead, those two vars are SCRUBBED from the child env so
//      OAuth wins. `CLAUDE_CONFIG_DIR` is intentionally KEPT — the OAuth
//      `.credentials.json` lives there, so relocating it would break auth.
//      Codex's equivalent per-token key (CODEX_API_KEY) is scrubbed so the
//      cached `codex login` (auth.json) wins.
//
// Everything here is a pure function returning a fresh `env` object (no
// spawning, no global mutation) so the scrub/sentinel logic is unit-testable
// without a live CLI.

import { existsSync, copyFileSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Present-in-env ⇒ headless `claude` outranks subscription OAuth (credential
// precedence: cloud provider vars > ANTHROPIC_AUTH_TOKEN > ANTHROPIC_API_KEY >
// apiKeyHelper > CLAUDE_CODE_OAUTH_TOKEN > /login subscription OAuth). Scrub ALL
// of these for the subscription path so the child falls through to the stored
// OAuth credentials in CLAUDE_CONFIG_DIR. (Confirmed against the auth docs,
// 2026-06 — supersedes the plan's two-var list, which missed the cloud vars.)
export const CLAUDE_SUBSCRIPTION_SCRUB = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

// Codex per-token key; scrub for the subscription path so the cached
// `codex login` (auth.json in CODEX_HOME) wins.
export const CODEX_SUBSCRIPTION_SCRUB = ['CODEX_API_KEY'];

/**
 * Child env for a headless `claude -p` oracle.
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{ auth?: 'subscription'|'token' }} [opts]
 */
export function buildClaudeEnv(baseEnv = process.env, { auth = 'subscription' } = {}) {
  const env = { ...baseEnv };
  env.SDLC_DISPATCH_ACTIVE = '1';            // PRIMARY hook suppression (every SDLC hook early-exits on it)
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'; // the sub-session must not mutate memory
  if (auth === 'subscription') {
    for (const k of CLAUDE_SUBSCRIPTION_SCRUB) delete env[k];
  }
  return env;
}

/**
 * Child env for a headless `codex exec` oracle.
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{ codexHome?: string|null, auth?: 'subscription'|'token' }} [opts]
 */
export function buildCodexEnv(baseEnv = process.env, { codexHome = null, auth = 'subscription' } = {}) {
  const env = { ...baseEnv };
  env.SDLC_DISPATCH_ACTIVE = '1';
  if (codexHome) env.CODEX_HOME = codexHome;
  if (auth === 'subscription') {
    for (const k of CODEX_SUBSCRIPTION_SCRUB) delete env[k];
  }
  return env;
}

/** The user's real CODEX_HOME (env override, else ~/.codex). */
export function userCodexHome(baseEnv = process.env) {
  return baseEnv.CODEX_HOME || join(homedir(), '.codex');
}

/**
 * Where an isolated CODEX_HOME may live — NOT the OS temp dir.
 *
 * Repro'd on Windows 2026-07-26: with CODEX_HOME under `%LOCALAPPDATA%\Temp\`,
 * codex refuses part of its own setup —
 *
 *   WARNING: proceeding, even though we could not create PATH aliases:
 *   Refusing to create helper binaries under temporary dir "C:\…\Temp\"
 *   (codex_home: "C:\…\Temp\sdlc-consult-codex-mwDrL5")
 *
 * codex deliberately treats a temp-dir home as untrustworthy. So the isolated
 * home is created as a sibling of the user's REAL codex home instead — a normal,
 * non-temp directory that codex accepts, still outside the real home so the
 * sub-agent cannot mutate the user's sessions/history.
 */
export function isolatedHomeParent(sourceHome) {
  // sibling of the real home: ~/.codex → ~/  (never inside it, never in tmpdir)
  return dirname(sourceHome || join(homedir(), '.codex'));
}

/**
 * Prepare an ISOLATED CODEX_HOME for the sub-agent by copying the user's
 * auth.json (codex issue #15410: an isolated home cannot authenticate without
 * it) plus config.toml (so the user's model selection carries over). Returns
 * the isolated home path, or null when the source auth.json is absent or the
 * copy fails — in which case the caller MUST fall back to the user's real
 * CODEX_HOME rather than break the run for the sake of isolation.
 *
 * C3 (UNVERIFIED, EXTERNAL-MODEL-DISPATCH-PLAN §10): the codex-side hook-disable
 * knob (`[features] hooks=false`?) and `--ignore-user-config`/`--ignore-rules`
 * are NOT doc-confirmed, so we deliberately do NOT inject a speculative config
 * flag that could make codex reject the run. The `--sandbox read-only` OS
 * sandbox + the sentinel are the guarantees; copying config.toml verbatim keeps
 * the user's model. Verify the knobs before relying on codex-side hook suppression.
 *
 * The isolated home is created OUTSIDE the OS temp dir (see isolatedHomeParent) —
 * codex refuses to create its helper binaries under a temp dir.
 *
 * @param {string} sourceHome  the user's real CODEX_HOME
 * @param {{ mkHome?: (parent: string) => string }} [opts]  injectable dir maker (tests)
 */
export function prepareCodexHome(sourceHome, { mkHome = defaultMkHome } = {}) {
  try {
    if (!sourceHome || !existsSync(join(sourceHome, 'auth.json'))) return null;
    const home = mkHome(isolatedHomeParent(sourceHome));
    copyFileSync(join(sourceHome, 'auth.json'), join(home, 'auth.json'));
    const cfg = join(sourceHome, 'config.toml');
    if (existsSync(cfg)) copyFileSync(cfg, join(home, 'config.toml'));
    return home;
  } catch {
    return null;
  }
}

function defaultMkHome(parent) {
  return mkdtempSync(join(parent, '.sdlc-consult-codex-'));
}

// Failure CLASSIFICATION (auth / sandbox / not-found) lives in dispatch.mjs
// (`extractCliFailure`), next to the per-provider output parsers it depends on.
// This module stays purely about shaping the child ENV and its isolated home.
