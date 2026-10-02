#!/usr/bin/env node
/**
 * scripts/work-packets.mjs — check and write a brainstorm's work set
 * (BRAINSTORM-WORK-PACKETS-PLAN, `done` 3.4).
 *
 *   node work-packets.mjs check <workflow-dir> [--json]
 *   node work-packets.mjs write <workflow-dir> [--json] [--dry-run]
 *
 * <workflow-dir> is .ai/workflows/<brainstorm-slug>. `check` reports the
 * contract, coverage, cycle, size, and source errors (exit 1 on an error).
 * `write` runs the check, then writes each packet, research/index.md, and
 * work/index.md last. Bundled to dist/work-packets.mjs; the skill wrapper
 * skills/wf/scripts/work-packets.mjs runs the bundle.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { checkWorkSet, writeWorkSet } from '../lib/work-packets.mjs';

const USAGE = 'Usage: work-packets.mjs <check|write> <workflow-dir> [--json] [--dry-run]';

function gitIgnoredCheck(projectRoot) {
  const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const cache = new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    const r = spawnSync('git', ['check-ignore', '-q', '--', path], { cwd: projectRoot, encoding: 'utf8' });
    const ignored = r.status === 0;
    cache.set(path, ignored);
    return ignored;
  };
}

function projectRootOf(dir) {
  // .ai/workflows/<slug> → the project root three levels up.
  return resolve(dir, '..', '..', '..');
}

export function main(argv = process.argv.slice(2), { log = console.log, now = null } = {}) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const [command, dirArg] = argv.filter((a) => !a.startsWith('--'));
  if (!['check', 'write'].includes(command) || !dirArg) {
    log(USAGE);
    return 2;
  }
  const dir = resolve(dirArg);
  const boardPath = join(dir, 'brainstorm-board.json');
  if (!existsSync(boardPath)) {
    log(`work-packets: no brainstorm-board.json in ${dir}`);
    return 2;
  }
  const isIgnored = gitIgnoredCheck(projectRootOf(dir));
  const json = flags.has('--json');

  if (command === 'check') {
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    const result = checkWorkSet(board, { isIgnored });
    if (json) log(JSON.stringify(result, null, 2));
    else {
      for (const e of result.errors) log(`error: ${e}`);
      for (const w of result.warnings) log(`warning: ${w}`);
      if (!result.errors.length) log(`work-packets: check passed (${result.warnings.length} warnings)`);
    }
    return result.errors.length ? 1 : 0;
  }

  const result = writeWorkSet(dir, { now, isIgnored, dryRun: flags.has('--dry-run') });
  if (json) log(JSON.stringify(result, null, 2));
  else if (!result.ok) {
    for (const e of result.errors) log(`error: ${e}`);
    log('work-packets: nothing written. Fix the board, then run write again.');
  } else {
    log(`work-packets: work-revision ${result.revision}${result.unchanged ? ' (unchanged)' : ''}`);
    for (const [label, list] of [['added', result.added], ['changed', result.changed], ['kept (started)', result.kept], ['cut', result.cut], ['pending cut', result.pendingCut], ['written in session', result.writtenNow]]) {
      if (list?.length) log(`  ${label}: ${list.join(', ')}`);
    }
    for (const w of result.warnings ?? []) log(`warning: ${w}`);
  }
  return result.ok ? 0 : 1;
}

const invoked = process.argv[1] && /work-packets\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invoked && !/skills\/wf\/scripts\//.test(process.argv[1].replace(/\\/g, '/'))) {
  process.exitCode = main();
}
