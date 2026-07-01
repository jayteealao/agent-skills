// Unit tests for the consult skill's Phase-0 runner scripts + the hook sentinel.
// EXTERNAL-MODEL-DISPATCH-PLAN §6. No live CLI/network: pure functions are tested
// directly; the impure runner is exercised through an injected `run` seam; the
// hook early-exit is checked by spawning the SOURCE hook with the sentinel set.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';

import {
  providerAvailable,
  skipReason,
  defaultProviders,
  resolveProviders,
  evidenceScope,
  buildClaudeArgs,
  buildCodexArgs,
  winWrap,
  parseClaudeOutput,
  parseCodexOutput,
  buildRestRequest,
  parseOpenAiChat,
  parseGemini,
  runFanout,
  buildCliSpawn,
} from '../../../skills/consult/scripts/dispatch.mjs';
import {
  buildClaudeEnv,
  buildCodexEnv,
  prepareCodexHome,
  userCodexHome,
  CLAUDE_SUBSCRIPTION_SCRUB,
  CODEX_SUBSCRIPTION_SCRUB,
} from '../../../skills/consult/scripts/isolate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

const ALL_KEYS_ENV = {
  GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', AI_GATEWAY_API_KEY: 'a',
};
const yesBin = () => true;
const noBin = () => false;

function tempDir(prefix = 'sdlc-consult-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ── routing / availability ──────────────────────────────────────────────────

test('providerAvailable: CLI keys off the bin probe, REST off the env', () => {
  equal(providerAvailable('codex', { hasBin: yesBin }), true);
  equal(providerAvailable('codex', { hasBin: noBin }), false);
  equal(providerAvailable('gemini', { env: { GEMINI_API_KEY: 'x' } }), true);
  equal(providerAvailable('gemini', { env: { GOOGLE_API_KEY: 'x' } }), true);
  equal(providerAvailable('gemini', { env: {} }), false);
  equal(providerAvailable('openai', { env: { OPENAI_API_KEY: 'x' } }), true);
  // "<provider>/<model>" → gateway, gated on AI_GATEWAY_API_KEY.
  equal(providerAvailable('anthropic/claude-x', { env: { AI_GATEWAY_API_KEY: 'x' } }), true);
  equal(providerAvailable('anthropic/claude-x', { env: {} }), false);
});

test('defaultProviders: the bare fan-out set is every distinct available provider', () => {
  deepEqual(
    defaultProviders({ env: ALL_KEYS_ENV, hasBin: yesBin }),
    ['codex', 'claude', 'gemini', 'openai'],
  );
  deepEqual(defaultProviders({ env: {}, hasBin: noBin }), []);
});

test('resolveProviders: bare fans out; a keyword narrows; unavailable → skipped with reason', () => {
  const bare = resolveProviders([], { env: ALL_KEYS_ENV, hasBin: yesBin });
  deepEqual(bare.toRun, ['codex', 'claude', 'gemini', 'openai']);
  equal(bare.bare, true);
  deepEqual(bare.skipped, []);

  const narrowed = resolveProviders(['gemini'], { env: ALL_KEYS_ENV, hasBin: yesBin });
  deepEqual(narrowed.toRun, ['gemini']);
  equal(narrowed.bare, false);

  const missing = resolveProviders(['gemini'], { env: {}, hasBin: noBin });
  deepEqual(missing.toRun, []);
  equal(missing.skipped.length, 1);
  equal(missing.skipped[0].provider, 'gemini');
  match(missing.skipped[0].reason, /GEMINI_API_KEY/);
});

test('evidenceScope: CLI is repo-aware, REST is prompt-only', () => {
  equal(evidenceScope('codex'), 'repo-aware');
  equal(evidenceScope('claude'), 'repo-aware');
  equal(evidenceScope('gemini'), 'prompt-only');
  equal(evidenceScope('openai/gpt-5.5'), 'prompt-only');
});

test('skipReason: each provider names the missing prerequisite', () => {
  match(skipReason('codex'), /PATH/);
  match(skipReason('openai', { env: {} }), /OPENAI_API_KEY/);
  match(skipReason('foo/bar', { env: {} }), /AI_GATEWAY_API_KEY/);
});

// ── security-critical CLI arg choices (these are the read-only guarantee) ─────

test('buildClaudeArgs: --tools is the toolset restriction; no allowlist/hook-key footguns', () => {
  const args = buildClaudeArgs();
  const i = args.indexOf('--tools');
  ok(i >= 0 && args[i + 1] === 'Read,Glob,Grep', 'restricts toolset to Read,Glob,Grep');
  ok(args.includes('--strict-mcp-config'), 'loads no MCP servers');
  ok(args.includes('--permission-mode') && args.includes('plan'), 'belt-and-suspenders plan mode');
  ok(args.includes('--output-format') && args.includes('json'), 'parseable output');
  // A1: --allowed-tools is only an auto-approval allowlist (leaves Write/Bash) — must NOT be used.
  ok(!args.includes('--allowed-tools') && !args.includes('--allowedTools'), 'no auto-approval allowlist');
  // disableAllHooks is undocumented; an unknown --settings key could abort the run.
  ok(!args.includes('--settings'), 'no speculative --settings key');
  ok(!args.join(' ').includes('disableAllHooks'), 'hook suppression is via the sentinel, not a flag');
});

test('buildCodexArgs: read-only OS sandbox + json stream', () => {
  const args = buildCodexArgs();
  const i = args.indexOf('--sandbox');
  ok(i >= 0 && args[i + 1] === 'read-only', 'codex runs under the read-only sandbox');
  ok(args.includes('--json'), 'json event stream');
});

test('winWrap: win32 routes CLI shims through cmd.exe; posix spawns directly', () => {
  const { cmd, cmdArgs } = winWrap('claude', ['-p']);
  if (process.platform === 'win32') {
    equal(cmd, 'cmd.exe');
    deepEqual(cmdArgs.slice(0, 4), ['/d', '/s', '/c', 'claude']);
  } else {
    equal(cmd, 'claude');
    deepEqual(cmdArgs, ['-p']);
  }
});

// ── output parsing ───────────────────────────────────────────────────────────

test('parseClaudeOutput: pulls result/total_cost_usd/session_id, tolerates non-JSON', () => {
  deepEqual(
    parseClaudeOutput(JSON.stringify({ result: 'verdict', total_cost_usd: 0.012, session_id: 's1' })),
    { text: 'verdict', costUsd: 0.012, sessionId: 's1' },
  );
  const plain = parseClaudeOutput('boom: not json');
  equal(plain.text, 'boom: not json');
  equal(plain.costUsd, null);
});

test('parseCodexOutput: extracts the last assistant text from the NDJSON stream', () => {
  const ndjson = [
    '{"type":"thinking"}',
    'not json at all',
    '{"msg":{"text":"the answer"}}',
    '{"type":"token_count"}',
  ].join('\n');
  equal(parseCodexOutput(ndjson).text, 'the answer');
  // all-garbage → raw fallback
  equal(parseCodexOutput('plain text reply').text, 'plain text reply');
});

// ── REST request building ────────────────────────────────────────────────────

test('buildRestRequest: openai native shape', () => {
  const { url, init } = buildRestRequest('openai', 'hello', { env: { OPENAI_API_KEY: 'sk-x' } });
  match(url, /api\.openai\.com\/v1\/chat\/completions/);
  match(init.headers.authorization, /^Bearer sk-x$/);
  const body = JSON.parse(init.body);
  equal(body.messages[0].content, 'hello');
  ok(body.model, 'carries a model id');
});

test('buildRestRequest: gemini native shape carries the key in the query', () => {
  const { url, init } = buildRestRequest('gemini', 'hi', { env: { GEMINI_API_KEY: 'k-y' } });
  match(url, /generativelanguage\.googleapis\.com/);
  match(url, /key=k-y/);
  const body = JSON.parse(init.body);
  equal(body.contents[0].parts[0].text, 'hi');
});

test('buildRestRequest: a "<provider>/<model>" token routes through the gateway', () => {
  const { url, init } = buildRestRequest('anthropic/claude-x', 'q', { env: { AI_GATEWAY_API_KEY: 'g-z' } });
  match(url, /ai-gateway\.vercel\.sh\/v1\/chat\/completions/);
  match(init.headers.authorization, /^Bearer g-z$/);
  equal(JSON.parse(init.body).model, 'anthropic/claude-x');
});

test('parse helpers: openai-compatible + gemini response shapes', () => {
  equal(parseOpenAiChat({ choices: [{ message: { content: 'ok' } }] }).text, 'ok');
  equal(parseGemini({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }).text, 'ab');
});

// ── fan-out concurrency / ordering ───────────────────────────────────────────

test('runFanout: preserves input order and bounds concurrency', async () => {
  let active = 0;
  let peak = 0;
  const run = async (p) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return { provider: p, ok: true };
  };
  const providers = ['a', 'b', 'c', 'd', 'e'];
  const results = await runFanout(providers, 'prompt', '/repo', { concurrency: 2, run });
  deepEqual(results.map((r) => r.provider), providers);
  ok(peak <= 2, `concurrency cap honored (peak=${peak})`);
});

// ── spawn wiring (REGRESSION: the hardened env MUST reach spawn) ───────────────
// The whole read-only/subscription/hook-isolation guarantee rides on the child
// env actually being passed to spawn(). buildCliSpawn returns the exact options
// object handed to spawn, so these assert the wiring the runner depends on.

test('buildCliSpawn: claude — sentinel + key-scrub land in the spawn env (not just built)', () => {
  const { cmd, options, tempHome } = buildCliSpawn('claude', '/repo', { env: { ANTHROPIC_API_KEY: 'k', PATH: '/bin' } });
  equal(options.cwd, '/repo');
  equal(options.env.SDLC_DISPATCH_ACTIVE, '1', 'sentinel reaches the child (hook isolation)');
  equal(options.env.ANTHROPIC_API_KEY, undefined, 'API key scrubbed on the child (subscription billing)');
  equal(tempHome, null, 'no temp home for the claude path');
  ok(cmd === 'claude' || cmd === 'cmd.exe', 'spawns the claude bin (or cmd.exe shim on win32)');
});

test('buildCliSpawn: codex — isolated CODEX_HOME + sentinel reach the spawn env', () => {
  const { options, tempHome } = buildCliSpawn('codex', '/repo', { env: { CODEX_API_KEY: 'c', PATH: '/bin' }, prepareHome: () => '/iso' });
  equal(options.env.CODEX_HOME, '/iso', 'isolated home reaches the child');
  equal(options.env.SDLC_DISPATCH_ACTIVE, '1');
  equal(options.env.CODEX_API_KEY, undefined, 'per-token key scrubbed');
  equal(tempHome, '/iso', 'temp home returned for cleanup');
});

// ── isolation / credential scrub ─────────────────────────────────────────────

test('buildClaudeEnv: scrubs every per-token var, keeps CLAUDE_CONFIG_DIR + sets sentinel', () => {
  const base = {
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CONFIG_DIR: '/cfg', PATH: '/bin',
  };
  const env = buildClaudeEnv(base);
  for (const k of CLAUDE_SUBSCRIPTION_SCRUB) equal(env[k], undefined, `${k} scrubbed`);
  equal(env.SDLC_DISPATCH_ACTIVE, '1');
  equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  equal(env.CLAUDE_CONFIG_DIR, '/cfg', 'OAuth config dir preserved');
  equal(base.ANTHROPIC_API_KEY, 'k', 'does not mutate the caller env');
});

test('buildClaudeEnv: token mode keeps the keys', () => {
  const env = buildClaudeEnv({ ANTHROPIC_API_KEY: 'k' }, { auth: 'token' });
  equal(env.ANTHROPIC_API_KEY, 'k');
  equal(env.SDLC_DISPATCH_ACTIVE, '1');
});

test('buildCodexEnv: sets isolated CODEX_HOME + sentinel, scrubs the per-token key', () => {
  const env = buildCodexEnv({ CODEX_API_KEY: 'c', PATH: '/bin' }, { codexHome: '/iso' });
  equal(env.CODEX_HOME, '/iso');
  equal(env.SDLC_DISPATCH_ACTIVE, '1');
  for (const k of CODEX_SUBSCRIPTION_SCRUB) equal(env[k], undefined);
});

test('prepareCodexHome: copies auth.json when present, returns null otherwise', () => {
  const src = tempDir('sdlc-codex-src-');
  // no auth.json yet → null (caller falls back to the real home)
  equal(prepareCodexHome(src), null);

  writeFileSync(join(src, 'auth.json'), '{"token":"x"}', 'utf-8');
  writeFileSync(join(src, 'config.toml'), 'model = "gpt-5"\n', 'utf-8');
  const isoDir = tempDir('sdlc-codex-iso-');
  const home = prepareCodexHome(src, { mkHome: () => isoDir });
  equal(home, isoDir);
  ok(existsSync(join(isoDir, 'auth.json')), 'auth.json copied');
  ok(existsSync(join(isoDir, 'config.toml')), 'config.toml copied');
});

test('userCodexHome: honors CODEX_HOME, else ~/.codex', () => {
  equal(userCodexHome({ CODEX_HOME: '/x' }), '/x');
  equal(userCodexHome({}), join(homedir(), '.codex'));
});

// ── the hook sentinel early-exit (defense-in-depth made primary) ──────────────

test('SDLC_DISPATCH_ACTIVE makes pre-write-validate skip an otherwise-blocking write', () => {
  const repo = tempDir('sdlc-repo-');
  const badArtifact = join(repo, '.ai', 'workflows', 'demo', '01-intake.md');
  const input = {
    cwd: repo,
    tool_name: 'Write',
    tool_input: { file_path: badArtifact, content: 'no frontmatter at all\n' },
  };
  const hook = join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs');
  const run = (extraEnv) => spawnSync(process.execPath, [hook], {
    cwd: repo, input: JSON.stringify(input), encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...extraEnv },
  });

  // Baseline: invalid frontmatter blocks (exit 2).
  equal(run({}).status, 2, 'invalid artifact is blocked without the sentinel');
  // With the sentinel: a dispatched sub-agent's write is not validated (exit 0).
  equal(run({ SDLC_DISPATCH_ACTIVE: '1' }).status, 0, 'sentinel makes the hook early-exit');
});
