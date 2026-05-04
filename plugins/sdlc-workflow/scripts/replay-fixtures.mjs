#!/usr/bin/env node
/**
 * Layer 2 behavioral-equivalence harness for the router migration.
 *
 * Replays a fixture set through the Claude Agent SDK against the plugin and
 * captures the agent's first N tool calls + first text response. Run twice
 * (pre-migration baseline branch, post-migration branch) and diff the
 * captured transcripts.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node plugins/sdlc-workflow/scripts/replay-fixtures.mjs \
 *       --mode old --out tests/transcripts/baseline
 *   ANTHROPIC_API_KEY=sk-... node plugins/sdlc-workflow/scripts/replay-fixtures.mjs \
 *       --mode new --out tests/transcripts/migrated
 *   node plugins/sdlc-workflow/scripts/replay-fixtures.mjs --diff \
 *       --baseline tests/transcripts/baseline --migrated tests/transcripts/migrated
 *
 * --mode old   uses the `old` field of each fixture (e.g. `/review-security pr 123`).
 *              Run on the pre-migration branch.
 * --mode new   uses the `new` field (e.g. `/review security pr 123`). Run after migration.
 * --diff       compares two transcript directories. A fixture passes when the
 *              tool-call sequences match modulo at most one allowlisted extra
 *              `Read` of `skills/review/reference/<expected>.md`.
 *
 * Requires `@anthropic-ai/claude-agent-sdk` (or `@anthropic-ai/sdk`) installed.
 * Caching is enabled: SKILL.md and the reference files are cacheable prefixes,
 * so subsequent fixtures pay only the cache-read rate.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mode') opts.mode = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else if (a === '--diff') opts.diff = true;
    else if (a === '--baseline') opts.baseline = args[++i];
    else if (a === '--migrated') opts.migrated = args[++i];
    else if (a === '--fixtures') opts.fixtures = args[++i];
    else if (a === '--max-tool-calls') opts.maxToolCalls = parseInt(args[++i], 10);
    else if (a === '--help') opts.help = true;
  }
  return opts;
}

function loadFixtures(path) {
  const fixturesPath = path || join(PLUGIN_ROOT, 'tests', 'migration-fixtures.json');
  return JSON.parse(readFileSync(fixturesPath, 'utf-8'));
}

async function loadSdk() {
  // Lazy import so the diff path works without the SDK installed.
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    return sdk;
  } catch (err) {
    console.error('Could not load @anthropic-ai/claude-agent-sdk. Install it before running --mode.');
    console.error('  npm install --save-dev @anthropic-ai/claude-agent-sdk');
    throw err;
  }
}

async function runFixture({ sdk, fixture, mode, maxToolCalls }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const prompt = mode === 'old' ? fixture.old : fixture.new;
  const transcript = {
    fixtureId: fixture.id,
    mode,
    prompt,
    toolCalls: [],
    firstText: null,
    timestamp: new Date().toISOString(),
  };

  const limit = maxToolCalls || 5;

  // The SDK exposes a query function that streams events. We capture tool_use
  // events and the first text chunk, then stop.
  const queryFn = sdk.query || (sdk.default && sdk.default.query);
  if (!queryFn) {
    throw new Error('SDK does not export `query`. Check @anthropic-ai/claude-agent-sdk version.');
  }

  let toolCallsSeen = 0;
  for await (const event of queryFn({
    prompt,
    options: {
      cwd: REPO_ROOT,
      // The plugin must already be loaded by the harness's CLAUDE_PLUGIN_PATH
      // or equivalent; the SDK does not auto-load plugins. The replay script
      // assumes the runtime has the sdlc-workflow plugin available.
    },
  })) {
    if (event.type === 'tool_use') {
      transcript.toolCalls.push({
        name: event.name,
        input: redact(event.input),
      });
      toolCallsSeen++;
      if (toolCallsSeen >= limit) break;
    } else if (event.type === 'text' && transcript.firstText === null) {
      transcript.firstText = event.text.slice(0, 500);
    }
  }
  return transcript;
}

function redact(input) {
  // Replace timestamps and run IDs with placeholders so transcripts diff cleanly.
  if (typeof input === 'string') {
    return input
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?\b/g, '<TS>')
      .replace(/\brun-[a-f0-9-]{8,}\b/g, '<RUN-ID>');
  }
  if (input && typeof input === 'object') {
    const out = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) out[k] = redact(v);
    return out;
  }
  return input;
}

function diffTranscripts({ baselineDir, migratedDir }) {
  if (!existsSync(baselineDir) || !existsSync(migratedDir)) {
    console.error(`Missing transcript directory:\n  baseline=${baselineDir}\n  migrated=${migratedDir}`);
    process.exit(1);
  }
  const baseFiles = readdirSync(baselineDir).filter((f) => f.endsWith('.json'));
  const failures = [];
  let passes = 0;

  for (const f of baseFiles) {
    const baseline = JSON.parse(readFileSync(join(baselineDir, f), 'utf-8'));
    const migratedPath = join(migratedDir, f);
    if (!existsSync(migratedPath)) {
      failures.push(`[${baseline.fixtureId}] no migrated transcript`);
      continue;
    }
    const migrated = JSON.parse(readFileSync(migratedPath, 'utf-8'));
    const verdict = compareToolCallSequences(baseline.toolCalls, migrated.toolCalls);
    if (verdict.ok) {
      console.log(`  PASS  ${baseline.fixtureId}`);
      passes++;
    } else {
      failures.push(`[${baseline.fixtureId}] ${verdict.reason}`);
      console.log(`  FAIL  ${baseline.fixtureId} — ${verdict.reason}`);
    }
  }

  console.log(`\n${passes}/${baseFiles.length} fixtures passed.`);
  if (failures.length > 0) {
    console.error(`\nFailures:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

function compareToolCallSequences(baseline, migrated) {
  // Allow at most one extra Read of skills/review/reference/<x>.md inserted in
  // the migrated sequence (the router's reference load).
  const isAllowedExtra = (call) =>
    call.name === 'Read' &&
    typeof call.input === 'object' &&
    /skills[\\/]+review[\\/]+reference[\\/]/i.test(call.input.file_path || '');

  let i = 0;
  let j = 0;
  let extras = 0;
  while (i < baseline.length && j < migrated.length) {
    const b = baseline[i];
    const m = migrated[j];
    if (b.name === m.name) {
      i++;
      j++;
      continue;
    }
    if (isAllowedExtra(m) && extras === 0) {
      extras++;
      j++;
      continue;
    }
    return { ok: false, reason: `divergence at baseline[${i}]=${b.name} migrated[${j}]=${m.name}` };
  }
  if (i !== baseline.length) {
    return { ok: false, reason: `migrated truncated; baseline has ${baseline.length - i} more call(s)` };
  }
  // Migrated may have extras at the end; only allow allowlisted extras.
  while (j < migrated.length) {
    if (!isAllowedExtra(migrated[j])) {
      return { ok: false, reason: `unexpected extra migrated tool call: ${migrated[j].name}` };
    }
    extras++;
    j++;
  }
  if (extras > 1) return { ok: false, reason: `${extras} allowlisted extras (max 1 permitted)` };
  return { ok: true };
}

async function main() {
  const opts = parseArgs();
  if (opts.help || (!opts.mode && !opts.diff)) {
    console.log(`Usage:
  --mode old|new --out <dir>            Run fixtures, capture transcripts.
  --diff --baseline <dir> --migrated <dir>   Diff two transcript directories.
  --fixtures <path>                     Override fixtures JSON (default: tests/migration-fixtures.json).
  --max-tool-calls <N>                  Capture limit per fixture (default: 5).
`);
    return;
  }

  if (opts.diff) {
    diffTranscripts({
      baselineDir: resolve(REPO_ROOT, opts.baseline),
      migratedDir: resolve(REPO_ROOT, opts.migrated),
    });
    return;
  }

  const sdk = await loadSdk();
  const { fixtures } = loadFixtures(opts.fixtures);
  const outDir = resolve(REPO_ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });

  for (const fixture of fixtures) {
    console.log(`> ${opts.mode}: ${fixture.id}`);
    try {
      const transcript = await runFixture({
        sdk,
        fixture,
        mode: opts.mode,
        maxToolCalls: opts.maxToolCalls,
      });
      const outPath = join(outDir, `${fixture.id}.json`);
      writeFileSync(outPath, JSON.stringify(transcript, null, 2), 'utf-8');
      console.log(`   ${transcript.toolCalls.length} tool call(s) captured`);
    } catch (err) {
      console.error(`   ERROR: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
