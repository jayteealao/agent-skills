// tests/unit/lib/runtime-manifest.test.mjs
//
// Shared runtime identity (NATIVE-INTEROP Workstream B). Covers the keystone
// module that both host plugins use to decide hub adoption (runtimeVersion) and
// render freshness (rendererBuildId, then buildId — WIDE-VIEW-REPAIR-PLAN §9.3):
// the manifest load + fallback, the identity object, and the migration-safe
// render-identity matcher.

import { test } from 'node:test';
import { equal, deepEqual, ok, match } from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import {
  readRuntimeManifest, runtimeIdentity, readRenderedIdentity, renderIdentityMatches,
  HUB_NAME, HUB_PROTOCOL_VERSION, ARTIFACT_SCHEMA,
} from '../../../lib/runtime-manifest.mjs';

const PKG = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8'));

/* ───────────────────────── manifest load ───────────────────────── */

test('runtime-manifest: reads the committed manifest with the host-neutral identity', () => {
  const m = readRuntimeManifest();
  equal(m.family, 'sdlc-workflow');
  equal(m.hubName, HUB_NAME, 'hubName is the singleton process name');
  equal(m.hubProtocolVersion, HUB_PROTOCOL_VERSION);
  equal(m.artifactSchema, ARTIFACT_SCHEMA);
  // The committed manifest is build-generated from package.json, so runtimeVersion
  // tracks the package version for the Claude package (the cross-host invariant is
  // that BOTH packages carry the SAME value, not that it differs from the package).
  equal(m.runtimeVersion, PKG.version, 'runtimeVersion is generated from the package version');
  // After a build, buildId is a 64-char sha256 hex; before a build it may be null.
  if (m.buildId !== null) match(m.buildId, /^[0-9a-f]{64}$/, 'buildId is a sha256 hex digest');
  // Same for rendererBuildId (sha256 over renderers/, view-src/, components/).
  if (m.rendererBuildId !== null) match(m.rendererBuildId, /^[0-9a-f]{64}$/, 'rendererBuildId is a sha256 hex digest');
  if (m.buildId !== null && m.rendererBuildId !== null) {
    ok(m.buildId !== m.rendererBuildId, 'the two hashes cover different byte sets');
  }
});

test('runtime-manifest: runtimeIdentity() exposes the comparison surface', () => {
  const id = runtimeIdentity();
  deepEqual(Object.keys(id).sort(), ['buildId', 'hubName', 'hubProtocolVersion', 'rendererBuildId', 'runtimeVersion']);
  equal(id.runtimeVersion, PKG.version);
  equal(id.hubName, HUB_NAME);
});

/* ───────────────────────── render identity matching ───────────────────────── */

test('renderIdentityMatches: rendererBuildId decides when both sides carry one (§9.3)', () => {
  ok(renderIdentityMatches(
    { version: 'x', buildId: 'abc', rendererBuildId: 'r1' },
    { runtimeVersion: 'y', buildId: 'def', rendererBuildId: 'r1' }),
  'equal rendererBuildId is fresh even when buildId AND version differ (a lib-only or prose-only release)');
  ok(!renderIdentityMatches(
    { version: 'x', buildId: 'abc', rendererBuildId: 'r1' },
    { runtimeVersion: 'x', buildId: 'abc', rendererBuildId: 'r2' }),
  'differing rendererBuildId is stale even when buildId and version match (a CSS edit without a bump)');
});

test('renderIdentityMatches: a pre-9.154 marker without rendererBuildId falls back to buildId', () => {
  ok(renderIdentityMatches({ version: 'x', buildId: 'abc', rendererBuildId: null }, { runtimeVersion: 'y', buildId: 'abc', rendererBuildId: 'r1' }),
    'marker without rendererBuildId → buildId axis');
  ok(!renderIdentityMatches({ version: 'x', buildId: 'abc' }, { runtimeVersion: 'x', buildId: 'def', rendererBuildId: 'r1' }),
    'marker without rendererBuildId and differing buildId → stale');
});

test('renderIdentityMatches: buildId is the precise axis when both sides carry one and neither has rendererBuildId', () => {
  ok(renderIdentityMatches({ version: 'x', buildId: 'abc' }, { runtimeVersion: 'y', buildId: 'abc' }),
    'equal buildId matches even when version differs (a same-version rebuild keeps one buildId)');
  ok(!renderIdentityMatches({ version: 'x', buildId: 'abc' }, { runtimeVersion: 'x', buildId: 'def' }),
    'differing buildId is stale even when version is identical (catches a rebuild)');
});

test('renderIdentityMatches: falls back to runtimeVersion for legacy markers', () => {
  // A pre-9.75 marker has version but no buildId → compare version vs runtimeVersion.
  ok(renderIdentityMatches({ version: '9.75.0', buildId: null }, { runtimeVersion: '9.75.0', buildId: 'abc' }),
    'legacy marker fresh when its version matches the active runtimeVersion');
  ok(!renderIdentityMatches({ version: '9.74.0', buildId: null }, { runtimeVersion: '9.75.0', buildId: 'abc' }),
    'legacy marker stale when its version lags the active runtimeVersion');
  // A pre-build active runtime has no buildId → also compares on version.
  ok(renderIdentityMatches({ version: '9.75.0', buildId: 'abc' }, { runtimeVersion: '9.75.0', buildId: null }),
    'no active buildId → version comparison');
});

test('renderIdentityMatches: unversioned/empty is always stale, never throws', () => {
  ok(!renderIdentityMatches({ version: null, buildId: null }, { runtimeVersion: '9.75.0', buildId: 'abc' }),
    'an unversioned marker is the split-brain the heal repairs → stale');
  ok(!renderIdentityMatches(null, { runtimeVersion: '9.75.0', buildId: 'abc' }), 'null recorded → stale');
  ok(!renderIdentityMatches(undefined, undefined), 'both undefined → stale, no throw');
});

/* ───────────────────────── marker reading ───────────────────────── */

test('readRenderedIdentity: parses version + buildId, tolerates legacy/missing/torn', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-rid-'));
  try {
    const marker = join(dir, '.last-render');

    writeFileSync(marker, JSON.stringify({ version: '9.154.0', buildId: 'deadbeef', rendererBuildId: 'cafe' }));
    deepEqual(readRenderedIdentity(marker), { version: '9.154.0', buildId: 'deadbeef', rendererBuildId: 'cafe' });

    // Pre-9.154 marker: version + buildId, no rendererBuildId.
    writeFileSync(marker, JSON.stringify({ version: '9.75.0', buildId: 'deadbeef' }));
    deepEqual(readRenderedIdentity(marker), { version: '9.75.0', buildId: 'deadbeef', rendererBuildId: null });

    // Legacy (pre-9.75) marker: version only.
    writeFileSync(marker, JSON.stringify({ version: '9.60.0' }));
    deepEqual(readRenderedIdentity(marker), { version: '9.60.0', buildId: null, rendererBuildId: null });

    // Torn / non-JSON → all null (sorts as stale).
    writeFileSync(marker, '{not json');
    deepEqual(readRenderedIdentity(marker), { version: null, buildId: null, rendererBuildId: null });

    // Missing file → all null.
    deepEqual(readRenderedIdentity(join(dir, 'nope')), { version: null, buildId: null, rendererBuildId: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
