// tests/unit/lib/bootstrap-offpipeline.test.mjs
//
// Regression coverage for the off-pipeline render gap: artifacts under
// .ai/simplify/ (and profiles/dep-updates/ideation) were rendered by NEITHER
// the PostToolUse write hook (which skips them and defers to "the next
// bootstrap render") NOR the bootstrap planner (which only freshness-scanned
// workflow slugs + project + docs). Net: a /simplify run's output never
// appeared in .ai/_view/ until a full unscoped render happened to run.
//
// These tests spawn the REAL render-sunflower.mjs as a subprocess against a
// temp .ai tree, so they exercise the actual planner + work-set filter. Both
// halves of the fix are covered:
//   A. `--only simplify/**` now matches off-pipeline artifacts (the work-set
//      match path was a bare storageRel with no bucket prefix → matched nothing)
//   B. `--bootstrap --dry-run` schedules a `simplify` render job when the view
//      is missing/stale, and skips it when the view is fresh.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ok, equal, match } from 'node:assert/strict';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RENDER = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');
const RUN_ID = '20260613T0415Z';

function simplifyFixture(tmp) {
  const dir = join(tmp, '.ai', 'simplify');
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    'schema: sdlc/v1',
    'type: simplify-run',
    `run-id: "${RUN_ID}"`,
    'scope: codebase',
    'status: complete',
    'created-at: "2026-06-13T04:31:58Z"',
    'updated-at: "2026-06-13T04:31:58Z"',
    '---',
    '',
    '# Simplify run',
    '',
    'Synthetic off-pipeline fixture.',
    '',
  ].join('\n');
  writeFileSync(join(dir, `${RUN_ID}.md`), fm, 'utf-8');
  return dir;
}

function runRender(tmp, extraArgs) {
  return spawnSync(process.execPath, [RENDER, ...extraArgs, '--plugin-root', PLUGIN_ROOT], {
    cwd: tmp,
    encoding: 'utf-8',
  });
}

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-offpipeline-'));
  try { return fn(tmp); } finally { rmSync(tmp, { recursive: true, force: true }); }
}

test('--only simplify/** renders an off-pipeline artifact (work-set match path is bucket-prefixed)', () => {
  withTmp((tmp) => {
    simplifyFixture(tmp);
    const child = runRender(tmp, ['--only', 'simplify/**']);
    equal(child.status, 0, `render exited ${child.status}\n${child.stderr ?? ''}`);
    const out = join(tmp, '.ai', '_view', 'simplify', RUN_ID, 'INDEX.html');
    ok(existsSync(out), `expected rendered ${out}\nstdout:\n${child.stdout}`);
    match(readFileSync(out, 'utf-8'), /data-artifact-type="simplify-run"/);
  });
});

test('bootstrap schedules a simplify render job when the view is missing', () => {
  withTmp((tmp) => {
    simplifyFixture(tmp);
    const child = runRender(tmp, ['--bootstrap', '--dry-run']);
    equal(child.status, 0, `bootstrap exited ${child.status}\n${child.stderr ?? ''}`);
    const log = readFileSync(join(tmp, '.ai', '_view', '.bootstrap.log'), 'utf-8');
    match(log, /\[bootstrap\] render simplify \(missing\)/, log);
    match(log, /\[bootstrap\] dry-run complete: [1-9]\d* render job/, log);
  });
});

test('bootstrap skips simplify once its view is fresh (no spurious re-render)', () => {
  withTmp((tmp) => {
    simplifyFixture(tmp);
    // First render populates the view; the artifact mtime now predates the view.
    const first = runRender(tmp, ['--only', 'simplify/**']);
    equal(first.status, 0, `seed render exited ${first.status}\n${first.stderr ?? ''}`);
    ok(existsSync(join(tmp, '.ai', '_view', 'simplify', RUN_ID, 'INDEX.html')));

    const child = runRender(tmp, ['--bootstrap', '--dry-run']);
    equal(child.status, 0, `bootstrap exited ${child.status}\n${child.stderr ?? ''}`);
    const log = readFileSync(join(tmp, '.ai', '_view', '.bootstrap.log'), 'utf-8');
    match(log, /\[bootstrap\] skip simplify \(fresh\)/, log);
  });
});
