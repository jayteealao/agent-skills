// tests/unit/lib/tray-format.test.mjs
//
// Pure coverage for the tray display layer (lib/tray-format.mjs): formatHealth
// over all four icon states (hub-up, per-repo-up, down, stale) plus the
// fmtUptime/fmtBytes/fmtRelTime edge cases. No live server — every case is a
// fixture payload + a fixed `now`.

import { test } from 'node:test';
import { equal, deepEqual, match, ok } from 'node:assert/strict';

import {
  formatHealth, fmtUptime, fmtBytes, fmtRelTime,
} from '../../../lib/tray-format.mjs';

const NOW = Date.UTC(2026, 5, 7, 12, 0, 0);
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function hubPayload(over = {}) {
  return {
    ok: true, status: 'ok', pid: 1234, version: '9.45.0',
    uptimeMs: 2 * HOUR + 14 * MIN, configHash: 'abcdef1234567890',
    entries: [
      { id: 'a1b2', repoRoot: '/r/one', branch: 'master', lastRenderedAt: ago(3 * MIN), slugs: ['x', 'y'] },
    ],
    metrics: { requests: 248, sseClients: 1, perRepoLastServed: {}, rssBytes: 260 * 1024 * 1024 },
    ...over,
  };
}

function perRepoPayload(over = {}) {
  return { ok: true, status: 'ok', pid: 99, version: '9.45.0', configHash: 'cfg0', renderedAt: ago(3 * MIN), ...over };
}

/* ───────────────────────── formatHealth states ───────────────────────── */

test('hub up: healthy summary, tooltip, detail rows, repo items', () => {
  const r = formatHealth({ reachable: true, payload: hubPayload(), pluginVersion: '9.45.0' }, NOW);
  equal(r.iconState, 'up');
  equal(r.summary, '● healthy — v9.45.0 · 1 repo');
  equal(r.tooltip, 'SDLC hub v9.45.0 · 1 repo · up 2h14m · 248 req');

  const labels = r.detailRows.map((d) => d.label);
  deepEqual(labels, ['Version', 'PID', 'Uptime', 'Requests', 'SSE clients', 'RSS', 'Config']);
  equal(r.detailRows.find((d) => d.label === 'RSS').value, '260 MB');
  equal(r.detailRows.find((d) => d.label === 'Config').value, 'abcdef12');

  equal(r.repoItems.length, 1);
  equal(r.repoItems[0].href, '/r/a1b2/');
  equal(r.repoItems[0].label, '↳ a1b2 · master · 2 slugs · 3m ago');
});

test('hub up: pluralization (0 repos, 1 slug)', () => {
  const r = formatHealth({
    reachable: true,
    payload: hubPayload({ entries: [{ id: 'z', branch: 'dev', slugs: ['only'], lastRenderedAt: ago(0) }] }),
    pluginVersion: '9.45.0',
  }, NOW);
  match(r.summary, /· 1 repo$/);
  equal(r.repoItems[0].label, '↳ z · dev · 1 slug · just now');

  const empty = formatHealth({ reachable: true, payload: hubPayload({ entries: [] }), pluginVersion: '9.45.0' }, NOW);
  equal(empty.summary, '● healthy — v9.45.0 · 0 repos');
});

test('per-repo daemon up: serving-repo summary, no repo items, rendered row', () => {
  const r = formatHealth({ reachable: true, payload: perRepoPayload(), pluginVersion: '9.45.0' }, NOW);
  equal(r.iconState, 'up');
  equal(r.summary, '● serving repo — v9.45.0');
  equal(r.tooltip, 'SDLC repo v9.45.0 · rendered 3m ago');
  deepEqual(r.repoItems, []);
  equal(r.detailRows.find((d) => d.label === 'Rendered').value, '3m ago');
});

test('down: unreachable probe', () => {
  const r = formatHealth({ reachable: false, payload: null, pluginVersion: '9.45.0' }, NOW);
  equal(r.iconState, 'down');
  equal(r.summary, '● hub down — start it?');
  equal(r.tooltip, 'SDLC hub — down');
  deepEqual(r.repoItems, []);
});

test('down: reachable but unparseable payload', () => {
  const r = formatHealth({ reachable: true, payload: null, pluginVersion: '9.45.0' }, NOW);
  equal(r.iconState, 'down');
});

test('stale: version mismatch takes precedence over up', () => {
  const r = formatHealth({ reachable: true, payload: hubPayload({ version: '9.44.0' }), pluginVersion: '9.45.0' }, NOW);
  equal(r.iconState, 'stale');
  equal(r.summary, '● stale v9.44.0 → v9.45.0 (restart)');
  match(r.tooltip, /stale v9\.44\.0 → v9\.45\.0/);
  // detail + repo rows still populated so the user can inspect the stale hub
  ok(r.repoItems.length === 1);
});

test('stale check is skipped when the tray version is unknown', () => {
  const r = formatHealth({ reachable: true, payload: hubPayload({ version: '9.44.0' }), pluginVersion: '' }, NOW);
  equal(r.iconState, 'up');
});

/* ───────────────────────── helpers ───────────────────────── */

test('fmtUptime', () => {
  equal(fmtUptime(0), '0s');
  equal(fmtUptime(45_000), '45s');
  equal(fmtUptime(90_000), '1m');
  equal(fmtUptime(2 * HOUR + 14 * MIN), '2h14m');
  equal(fmtUptime(3 * DAY), '3d0h');
  equal(fmtUptime(-5), '0s');
  equal(fmtUptime('nope'), '0s');
});

test('fmtBytes', () => {
  equal(fmtBytes(0), '0 B');
  equal(fmtBytes(512), '512 B');
  equal(fmtBytes(1536), '1.5 KB');
  equal(fmtBytes(260 * 1024 * 1024), '260 MB');
  equal(fmtBytes(-1), '0 B');
  equal(fmtBytes(undefined), '0 B');
});

test('fmtRelTime', () => {
  equal(fmtRelTime(null, NOW), 'never');
  equal(fmtRelTime('not-a-date', NOW), 'never');
  equal(fmtRelTime(ago(0), NOW), 'just now');
  equal(fmtRelTime(ago(10_000), NOW), 'just now');
  equal(fmtRelTime(ago(3 * MIN), NOW), '3m ago');
  equal(fmtRelTime(ago(2 * HOUR), NOW), '2h ago');
  equal(fmtRelTime(ago(5 * DAY), NOW), '5d ago');
});
