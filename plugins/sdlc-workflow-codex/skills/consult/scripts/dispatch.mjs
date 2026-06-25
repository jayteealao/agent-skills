#!/usr/bin/env node
// skills/consult/scripts/dispatch.mjs
//
// Fan-out oracle runner for the `consult` skill.
// EXTERNAL-MODEL-DISPATCH-PLAN §12.0 / §12.1.
//
//   node dispatch.mjs <read-only|write> <repoRoot> <promptFile> [provider ...]
//
// - bare (no provider arg) → fan out to ALL available providers in parallel (D16).
// - provider keyword(s) → run only those; a NAMED-but-unavailable provider is
//   reported as skipped with a reason, never silently dropped.
//
// Providers:
//   codex, claude  — subscription CLIs, REPO-AWARE (cwd=repoRoot, read the live
//                    tree themselves), read-only sandboxed. Evidence: repo-aware.
//   gemini, openai — per-token REST, PROMPT-ONLY (see only what the prompt
//                    inlined). Evidence: prompt-only.
//   <provider>/<model> — any token containing "/" → Vercel AI Gateway,
//                    per-token, prompt-only (e.g. anthropic/claude-..., openai/...).
//
// Prints ONE JSON object to stdout:
//   { results: [{provider, ok, text, costUsd, evidenceScope, error}], skipped:
//     [{provider, reason}], bare: bool }
//
// Exit: 0 when the call was well-formed (per-provider failures live in results);
//       2 on a usage error; 3 when the externalDispatch consent gate is OFF.
//
// TRUST BOUNDARY (§4.1): this script re-checks the externalDispatch.enabled
// consent flag ITSELF. A direct `node dispatch.mjs …` cannot bypass the SKILL.md
// prose — the script, not just the model, is the consent boundary.
//
// HOOK ISOLATION (§3.1, corrected 2026-06): the load-bearing suppression of the
// repo's SDLC hooks is the SDLC_DISPATCH_ACTIVE=1 sentinel (isolate.mjs) which
// every SDLC hook early-exits on — NOT the plan's `--settings {disableAllHooks}`
// (that key is undocumented; an unknown --settings key could abort the run, so
// it is omitted). The sentinel is confirmed-by-construction and carries zero
// auth risk, so it is the primary mechanism here, not mere defense-in-depth.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildClaudeEnv,
  buildCodexEnv,
  prepareCodexHome,
  userCodexHome,
} from './isolate.mjs';

// ── configuration (NOT user-facing flags, D15) ──────────────────────────────
// Default reasoning models for the REST oracles. To pin a specific model use the
// "<provider>/<model>" form (routed through the gateway), e.g. `openai/gpt-5.5`.
const OPENAI_MODEL = process.env.SDLC_CONSULT_OPENAI_MODEL || 'gpt-5.5';
const GEMINI_MODEL = process.env.SDLC_CONSULT_GEMINI_MODEL || 'gemini-3-pro';
const CLI_MAX_TURNS = 16;          // headless oracle: read + reason, then answer
const FANOUT_CONCURRENCY = 4;      // cap parallel sub-agents (§8 watch item)
const STDIN_SOFT_LIMIT = 9_000_000; // ~9 MB; claude stdin hard-caps at 10 MB

export const CLI_PROVIDERS = ['codex', 'claude'];
export const REST_PROVIDERS = ['gemini', 'openai'];

// ── consent gate (the trust boundary) ───────────────────────────────────────

/** Read ~/.sdlc/hub-config.json and return externalDispatch.enabled === true. */
export function dispatchEnabled({ home = homedir() } = {}) {
  try {
    const cfgPath = join(home, '.sdlc', 'hub-config.json');
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    return cfg?.externalDispatch?.enabled === true;
  } catch {
    return false;
  }
}

// ── routing / availability (pure, testable) ─────────────────────────────────

/** Cheap, no-network availability probe. */
export function providerAvailable(provider, { env = process.env, hasBin = defaultHasBin } = {}) {
  if (provider === 'codex' || provider === 'claude') return hasBin(provider);
  if (provider === 'gemini') return Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (provider === 'openai') return Boolean(env.OPENAI_API_KEY);
  if (provider.includes('/')) return Boolean(env.AI_GATEWAY_API_KEY); // gateway model id
  return false;
}

/** Human-readable reason a provider is unavailable (for the skipped list). */
export function skipReason(provider, { env = process.env } = {}) {
  if (provider === 'codex') return 'codex CLI not found on PATH';
  if (provider === 'claude') return 'claude CLI not found on PATH';
  if (provider === 'gemini') return 'GEMINI_API_KEY / GOOGLE_API_KEY not set';
  if (provider === 'openai') return 'OPENAI_API_KEY not set';
  if (provider.includes('/')) return 'AI_GATEWAY_API_KEY not set';
  return `unknown provider "${provider}"`;
}

/** The bare fan-out set: every DISTINCT available provider. */
export function defaultProviders(opts = {}) {
  return [...CLI_PROVIDERS, ...REST_PROVIDERS].filter((p) => providerAvailable(p, opts));
}

/**
 * Resolve a requested provider list into { toRun, skipped, bare }. An empty
 * request fans out to defaultProviders; a non-empty request keeps only the
 * available ones and records the rest as skipped (with a reason).
 */
export function resolveProviders(requested, opts = {}) {
  const bare = !(requested && requested.length);
  const list = bare ? defaultProviders(opts) : requested;
  const toRun = [];
  const skipped = [];
  for (const p of list) {
    if (providerAvailable(p, opts)) toRun.push(p);
    else skipped.push({ provider: p, reason: skipReason(p, opts) });
  }
  return { toRun, skipped, bare };
}

/** Repo-aware (reads the live tree) vs prompt-only (sees only the inlined prompt). */
export function evidenceScope(provider) {
  return (provider === 'codex' || provider === 'claude') ? 'repo-aware' : 'prompt-only';
}

function defaultHasBin(bin) {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    return spawnSync(finder, [bin], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

// ── CLI provider arg-building (pure) ────────────────────────────────────────

/**
 * Headless read-only `claude -p` argv. The prompt rides on STDIN (a short
 * positional pointer keeps a prompt arg present and within argv limits).
 *   --tools         : the TOOLSET restriction — Edit/Write/Bash absent (A1).
 *   --strict-mcp-config (no --mcp-config) : load NO MCP servers (--tools does
 *                     not gate MCP, so this keeps write-capable MCP tools out).
 *   --permission-mode plan : belt-and-suspenders read-only at the permission layer.
 *   --max-turns     : bound the agentic loop.
 *   --output-format json   : parse result/total_cost_usd.
 */
export function buildClaudeArgs({ maxTurns = CLI_MAX_TURNS } = {}) {
  return [
    '-p', 'Follow the consultation instructions provided on standard input.',
    '--output-format', 'json',
    '--tools', 'Read,Glob,Grep',
    '--strict-mcp-config',
    '--permission-mode', 'plan',
    '--max-turns', String(maxTurns),
  ];
}

/** Headless read-only `codex exec` argv. Prompt rides on STDIN. --json = NDJSON stream. */
export function buildCodexArgs() {
  return ['exec', '--sandbox', 'read-only', '--json'];
}

/**
 * Wrap a CLI invocation for the platform. On win32, `.cmd` shims (codex.cmd,
 * claude.cmd) cannot be spawned directly — route through cmd.exe. The prompt
 * never touches argv (it's piped to stdin), so cmd.exe quoting is a non-issue.
 */
export function winWrap(bin, args) {
  if (process.platform === 'win32') {
    return { cmd: 'cmd.exe', cmdArgs: ['/d', '/s', '/c', bin, ...args] };
  }
  return { cmd: bin, cmdArgs: args };
}

// ── CLI output parsing (pure) ───────────────────────────────────────────────

/** Parse `claude --output-format json` stdout → { text, costUsd, sessionId }. */
export function parseClaudeOutput(stdout) {
  try {
    const obj = JSON.parse(stdout);
    return {
      text: typeof obj.result === 'string' ? obj.result : (obj.result ?? '').toString(),
      costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : null,
      sessionId: obj.session_id ?? null,
    };
  } catch {
    // Not JSON (e.g. an early error printed plain) — surface the raw text.
    return { text: String(stdout || '').trim(), costUsd: null, sessionId: null };
  }
}

/**
 * Parse `codex exec --json` stdout. Codex emits an NDJSON event stream and the
 * exact schema is C3-unverified (§10), so extract defensively: walk the lines in
 * reverse and return the first that yields assistant-looking text; fall back to
 * the raw trimmed stdout. Subscription billing → no per-token cost to report.
 */
export function parseCodexOutput(stdout) {
  const raw = String(stdout || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(lines[i]); } catch { continue; }
    const text = extractCodexText(evt);
    if (text) return { text, costUsd: null };
  }
  return { text: raw.trim(), costUsd: null };
}

function extractCodexText(evt) {
  if (!evt || typeof evt !== 'object') return null;
  // Common shapes across codex versions: {msg:{text}}, {text}, {message:{content}},
  // {type:'agent_message', message}, {item:{text}}.
  const candidates = [
    evt.msg?.text,
    evt.text,
    typeof evt.message === 'string' ? evt.message : evt.message?.content,
    evt.item?.text,
    evt.delta?.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

// ── REST provider request-building (pure) ───────────────────────────────────

/**
 * Build the fetch request for a REST oracle. Returns { url, init, parse } where
 * parse(json) → { text, costUsd }. Three shapes: native OpenAI, native Gemini,
 * and the OpenAI-compatible Vercel AI Gateway (any "<provider>/<model>" token).
 */
export function buildRestRequest(provider, prompt, { env = process.env } = {}) {
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: OPENAI_MODEL, messages: [{ role: 'user', content: prompt }] }),
      },
      parse: parseOpenAiChat,
    };
  }
  if (provider === 'gemini') {
    const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
      parse: parseGemini,
    };
  }
  // "<provider>/<model>" → Vercel AI Gateway (OpenAI-compatible).
  return {
    url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_GATEWAY_API_KEY}` },
      body: JSON.stringify({ model: provider, messages: [{ role: 'user', content: prompt }] }),
    },
    parse: parseOpenAiChat,
  };
}

export function parseOpenAiChat(json) {
  const text = json?.choices?.[0]?.message?.content ?? '';
  return { text: String(text).trim(), costUsd: null };
}

export function parseGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? '').join('').trim();
  return { text, costUsd: null };
}

// ── runners (impure: spawn / fetch) ─────────────────────────────────────────

/**
 * Assemble the platform spawn for a CLI oracle: bin/args + the HARDENED child
 * `env` from isolate.mjs (the SDLC_DISPATCH_ACTIVE sentinel that every SDLC hook
 * early-exits on, the credential scrub that forces subscription billing, and the
 * isolated CODEX_HOME). Returned as a pure, testable unit precisely BECAUSE the
 * whole read-only / subscription / hook-isolation guarantee rides on `env`
 * actually reaching spawn() — wiring it here, under test, is what stops that from
 * silently regressing. `tempHome` is the freshly-created CODEX_HOME to remove
 * after the child exits (null when none was created — never the user's real home).
 */
export function buildCliSpawn(provider, repoRoot, { env = process.env, prepareHome = prepareCodexHome } = {}) {
  let bin, args, childEnv, tempHome = null;
  if (provider === 'claude') {
    bin = 'claude';
    args = buildClaudeArgs();
    childEnv = buildClaudeEnv(env);
  } else {
    bin = 'codex';
    args = buildCodexArgs();
    tempHome = prepareHome(userCodexHome(env)); // null on failure → buildCodexEnv leaves the real home
    childEnv = buildCodexEnv(env, { codexHome: tempHome });
  }
  const { cmd, cmdArgs } = winWrap(bin, args);
  const options = { cwd: repoRoot, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true };
  return { cmd, cmdArgs, options, tempHome };
}

function runCli(provider, prompt, repoRoot) {
  return new Promise((resolve) => {
    const { cmd, cmdArgs, options, tempHome } = buildCliSpawn(provider, repoRoot);
    const parse = provider === 'claude' ? parseClaudeOutput : parseCodexOutput;
    const evScope = evidenceScope(provider);
    // The isolated CODEX_HOME holds a COPY of auth.json — remove it once the
    // child is done (idempotent: 'error' then 'close' may both fire).
    const cleanup = () => { if (tempHome) { try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* best-effort */ } } };

    let child;
    try {
      child = spawn(cmd, cmdArgs, options);
    } catch (err) {
      cleanup();
      resolve({ provider, ok: false, text: '', costUsd: null, evidenceScope: evScope, error: String(err?.message || err) });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      cleanup();
      resolve({ provider, ok: false, text: '', costUsd: null, evidenceScope: evScope, error: String(err?.message || err) });
    });
    child.on('close', (code) => {
      cleanup();
      if (code === 0) {
        const { text, costUsd } = parse(stdout);
        resolve({ provider, ok: Boolean(text), text, costUsd, evidenceScope: evScope, error: text ? null : `empty output${stderr ? `: ${stderr.trim()}` : ''}` });
      } else {
        resolve({ provider, ok: false, text: '', costUsd: null, evidenceScope: evScope, error: `${provider} exited ${code}${stderr ? `: ${stderr.trim().slice(0, 500)}` : ''}` });
      }
    });

    // Feed the prompt on stdin (avoids argv limits + cmd.exe quoting).
    try {
      if (prompt.length > STDIN_SOFT_LIMIT) {
        child.stdin.write(prompt.slice(0, STDIN_SOFT_LIMIT));
      } else {
        child.stdin.write(prompt);
      }
      child.stdin.end();
    } catch { /* child may have already exited; close handler resolves */ }
  });
}

async function runRest(provider, prompt) {
  const evScope = evidenceScope(provider);
  try {
    const { url, init, parse } = buildRestRequest(provider, prompt);
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { provider, ok: false, text: '', costUsd: null, evidenceScope: evScope, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}` };
    }
    const json = await res.json();
    const { text, costUsd } = parse(json);
    return { provider, ok: Boolean(text), text, costUsd, evidenceScope: evScope, error: text ? null : 'empty response' };
  } catch (err) {
    return { provider, ok: false, text: '', costUsd: null, evidenceScope: evScope, error: String(err?.message || err) };
  }
}

function runOne(provider, prompt, repoRoot) {
  if (provider === 'codex' || provider === 'claude') return runCli(provider, prompt, repoRoot);
  return runRest(provider, prompt);
}

/** Bounded-concurrency fan-out preserving input order in the output array. */
export async function runFanout(providers, prompt, repoRoot, { concurrency = FANOUT_CONCURRENCY, run = runOne } = {}) {
  const results = new Array(providers.length);
  let next = 0;
  async function worker() {
    while (next < providers.length) {
      const i = next++;
      results[i] = await run(providers[i], prompt, repoRoot);
    }
  }
  const pool = Array.from({ length: Math.min(concurrency, providers.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

// ── CLI entry ───────────────────────────────────────────────────────────────

async function main() {
  const [mode, repoRoot, promptFile, ...providers] = process.argv.slice(2);

  if (!mode || !repoRoot || !promptFile) {
    process.stderr.write('usage: node dispatch.mjs <read-only|write> <repoRoot> <promptFile> [provider ...]\n');
    process.exit(2);
  }
  if (mode === 'write') {
    process.stderr.write('write mode is DEFERRED (EXTERNAL-MODEL-DISPATCH-PLAN D12). consult is read-only.\n');
    process.exit(2);
  }
  if (mode !== 'read-only') {
    process.stderr.write(`unknown mode "${mode}" (expected read-only)\n`);
    process.exit(2);
  }
  if (!dispatchEnabled()) {
    process.stderr.write(
      'external-model dispatch is OFF. Set externalDispatch.enabled=true in ~/.sdlc/hub-config.json to consent.\n',
    );
    process.exit(3);
  }
  if (!existsSync(promptFile)) {
    process.stderr.write(`prompt file not found: ${promptFile}\n`);
    process.exit(2);
  }

  const prompt = readFileSync(promptFile, 'utf-8');
  const { toRun, skipped, bare } = resolveProviders(providers);
  const results = toRun.length ? await runFanout(toRun, prompt, repoRoot) : [];
  process.stdout.write(`${JSON.stringify({ results, skipped, bare }, null, 2)}\n`);
  process.exit(0);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || basename(process.argv[1] || '') === 'dispatch.mjs') {
  main().catch((err) => {
    process.stderr.write(`${String(err?.stack || err)}\n`);
    process.exit(1);
  });
}
