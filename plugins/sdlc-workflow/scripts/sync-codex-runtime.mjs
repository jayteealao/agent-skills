#!/usr/bin/env node
// scripts/sync-codex-runtime.mjs
//
// Mechanically synchronize the shared runtime payload from the Claude plugin
// (the canonical source for the first native release — NATIVE-INTEROP "Initial
// Source of Truth") into the native Codex package's runtime/, and verify
// byte/hash parity (Workstream D).
//
//   node scripts/sync-codex-runtime.mjs          # copy payload + write baseline
//   node scripts/sync-codex-runtime.mjs --check   # parity gate only (no writes)
//
// The copy reuses lib/runtime-store.copyRuntimePayload, so the bytes the Codex
// package ships are the SAME set the hub materializes into ~/.sdlc/runtime — they
// cannot drift. Because the buildId is a content hash of dist/assets/components/
// schemas (lib/runtime-buildid.mjs), copying verbatim reproduces it, giving the
// "Claude runtime build ID == Codex runtime build ID" release invariant for free.
//
// IMPORTANT: build the Claude plugin first (`npm run build`). The sync refuses to
// run against a stale/unbuilt Claude payload so the Codex package never ships a
// runtime whose bytes don't match its own manifest.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAYLOAD_DIRS, PAYLOAD_FILES, copyRuntimePayload } from '../lib/runtime-store.mjs';
import { verifyRuntime } from './verify-runtime.mjs';

const CLAUDE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_ROOT = resolve(CLAUDE_ROOT, '..', 'sdlc-workflow-codex');
const CODEX_RUNTIME = join(CODEX_ROOT, 'runtime');
const BASELINE_PATH = join(CODEX_ROOT, 'runtime-baseline.json');

async function main() {
  const check = process.argv.includes('--check');

  // The Claude payload must reproduce its own manifest buildId before we copy it.
  const src = verifyRuntime(CLAUDE_ROOT);
  if (!src.ok) {
    fail(
      `Claude runtime payload is not valid (run \`npm run build\` first):\n` +
        src.problems.map((p) => `  - ${p}`).join('\n'),
    );
  }

  if (check) {
    runParityCheck(src);
    return;
  }

  // Fresh mirror: a removed payload file must not linger in the Codex copy.
  await rm(CODEX_RUNTIME, { recursive: true, force: true });
  await mkdir(CODEX_RUNTIME, { recursive: true });
  await copyRuntimePayload(CLAUDE_ROOT, CODEX_RUNTIME);

  // Confirm the freshly synced Codex runtime reproduces the SAME buildId.
  const dst = verifyRuntime(CODEX_RUNTIME);
  if (!dst.ok) fail(`synced Codex runtime failed verification:\n${dst.problems.map((p) => `  - ${p}`).join('\n')}`);
  if (dst.declaredBuildId !== src.declaredBuildId) {
    fail(`synced buildId ${dst.declaredBuildId} != source buildId ${src.declaredBuildId}`);
  }

  writeBaseline(src);

  const fileCount = listPayloadFiles(CODEX_RUNTIME).length;
  console.log(
    `[sync-codex-runtime] synced ${fileCount} payload files → ${rel(CODEX_RUNTIME)}\n` +
      `[sync-codex-runtime] runtimeVersion=${src.runtimeVersion} buildId=${src.declaredBuildId.slice(0, 12)}…\n` +
      `[sync-codex-runtime] wrote ${rel(BASELINE_PATH)}`,
  );
  // Re-run parity as a post-condition so a successful sync is always verified.
  runParityCheck(src);
}

/**
 * Cross-package byte-for-byte parity gate. Asserts the Codex runtime exists,
 * carries an identical manifest + buildId, reproduces that buildId, and that
 * every payload file is hash-equal to the Claude source. Exits non-zero on any
 * mismatch. This is the release gate referenced by NATIVE-INTEROP "Required
 * release checks".
 */
function runParityCheck(src = verifyRuntime(CLAUDE_ROOT)) {
  if (!existsSync(CODEX_RUNTIME)) {
    fail(`Codex runtime missing at ${rel(CODEX_RUNTIME)} — run \`npm run sync:codex\` first`);
  }
  const dst = verifyRuntime(CODEX_RUNTIME);
  if (!dst.ok) fail(`Codex runtime invalid:\n${dst.problems.map((p) => `  - ${p}`).join('\n')}`);

  const problems = [];

  // 1. Manifests identical (byte-for-byte).
  const srcManifest = readFileSync(join(CLAUDE_ROOT, 'runtime-manifest.json'), 'utf-8');
  const dstManifest = readFileSync(join(CODEX_RUNTIME, 'runtime-manifest.json'), 'utf-8');
  if (srcManifest !== dstManifest) problems.push('runtime-manifest.json differs between packages');

  // 2. buildIds identical + reproduced on both sides.
  if (src.declaredBuildId !== dst.declaredBuildId) {
    problems.push(`declared buildId differs: claude=${src.declaredBuildId} codex=${dst.declaredBuildId}`);
  }

  // 3. Every payload file present in both and hash-equal.
  const srcFiles = new Map(listPayloadFiles(CLAUDE_ROOT).map((r) => [r, sha256(join(CLAUDE_ROOT, r))]));
  const dstFiles = new Map(listPayloadFiles(CODEX_RUNTIME).map((r) => [r, sha256(join(CODEX_RUNTIME, r))]));
  for (const [r, h] of srcFiles) {
    if (!dstFiles.has(r)) problems.push(`missing in Codex: ${r}`);
    else if (dstFiles.get(r) !== h) problems.push(`hash differs: ${r}`);
  }
  for (const r of dstFiles.keys()) {
    if (!srcFiles.has(r)) problems.push(`extra in Codex (not in source payload): ${r}`);
  }

  if (problems.length) {
    fail(`runtime parity FAILED (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  console.log(
    `[sync-codex-runtime] parity OK — ${srcFiles.size} files, buildId ${src.declaredBuildId.slice(0, 12)}… identical`,
  );
}

function writeBaseline(src) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: CLAUDE_ROOT })
      .toString()
      .trim();
  } catch { /* not a git checkout / git unavailable */ }
  const baseline = {
    claudeBaselineVersion: src.runtimeVersion,
    claudeBaselineCommit: commit,
    sharedRuntimeBuildId: src.declaredBuildId,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
}

/** Sorted POSIX relpaths of every payload file under `root` (dirs recursive). */
function listPayloadFiles(root) {
  const out = [];
  for (const d of PAYLOAD_DIRS) {
    const abs = join(root, d);
    if (existsSync(abs)) walk(abs, root, out);
  }
  for (const f of PAYLOAD_FILES) {
    if (existsSync(join(root, f))) out.push(f.split(sep).join('/'));
  }
  return out.sort();
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, out);
    else if (entry.isFile()) out.push(relative(root, abs).split(sep).join('/'));
  }
}

function sha256(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

function rel(p) { return relative(resolve(CLAUDE_ROOT, '..', '..'), p).split(sep).join('/'); }

function fail(msg) {
  process.stderr.write(`[sync-codex-runtime] ${msg}\n`);
  process.exit(1);
}

main().catch((err) => fail(err?.stack || String(err)));
