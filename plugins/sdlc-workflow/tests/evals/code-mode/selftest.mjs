#!/usr/bin/env node
// The self-test of the eval harness. It starts no model and spends no usage. For each task it
// makes a fresh fixture, checks that the task fails at the start, applies a known solution with
// the CLI or with code mode (lib/ops/code-host.mjs), and checks that the task passes then.
//
//   node tests/evals/code-mode/selftest.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { runCode } from '../../../lib/ops/code-host.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_ROOT, QUESTIONS, SLUG, makeFixture } from './fixture.mjs';
import { TASKS } from './tasks.mjs';

const WF = join(PLUGIN_ROOT, 'scripts', 'wf.mjs');
const home = mkdtempSync(join(tmpdir(), 'codemode-home-'));
process.env.SDLC_HOME = home;

function wf(root, args) {
  const r = spawnSync(process.execPath, [WF, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, SDLC_HOME: home } });
  if (r.status !== 0) throw new Error(`wf.mjs ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout;
}

async function code(root, body, mode = 'run') {
  const r = await runCode(root, { slug: SLUG, code: body, mode });
  if (!r.ok) throw new Error(`code: ${r.error}`);
  return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
}

/** A known solution of each task: the CLI for most, code where it fits. Returns the answer text. */
const SOLUTIONS = {
  'verify-report': (f) => code(f.root, `return wf.records.fields('03-slice', ['slices']).slices.map(({ slug }) => {
  const v = wf.records.get(\`06-verify-\${slug}\`);
  return v ? \`\${slug}: \${v.frontmatter.result} \${v.frontmatter.convergence}\` : \`\${slug}: none\`;
}).join('\\n');`, 'query'),
  'three-slices': async (f) => {
    for (const s of ['s4', 's5', 's6']) wf(f.root, ['record', 'set', '.', SLUG, '03-slice', `slices[${s}].status=in-progress`]);
    await code(f.root, "wf.records.set('index', 'runtime-evidence-deferrals+', { slice: 's6', ac: 'AC-2', reason: 'waits for the payment API sandbox', 'clearing-event': 'the payment API sandbox is up' });");
    return '';
  },
  'five-answers': (f) => {
    const file = join(f.dir, '.draft', 'answers.json');
    mkdirSync(join(f.dir, '.draft'), { recursive: true });
    writeFileSync(file, JSON.stringify(QUESTIONS.map(([key, question, answer]) => ({ kind: 'answer', key, question, answer, by: 'person' }))));
    wf(f.root, ['decide', 'add', '.', SLUG, '--file', file]);
  },
  'drop-slice': (f) => wf(f.root, ['slice', 'drop', '.', SLUG, 's5', '--reason', 'merged into s4']),
  'board-group': (f) => wf(f.root, ['board', 'move', '.', SLUG, 'i1', 'i2', 'i3', 'i4', '--new', 'sync', '--name', 'Sync engine']),
  'after-stop': (f) => wf(f.root, ['status', '.', SLUG, '--brief']),
  'one-decision': (f) => wf(f.root, ['decide', 'add', '.', SLUG, '--kind', 'answer', '--key', 'cache', '--question', 'Which cache?', '--answer', 'redis', '--by', 'stage']),
  'step-done': (f) => wf(f.root, ['step', 'done', '.', SLUG, 's3', '3', '--sha', 'HEAD']),
  'three-reads': (f) => wf(f.root, ['status', '.', SLUG, '--json']) + wf(f.root, ['record', 'get', '.', SLUG, '03-slice']) + wf(f.root, ['record', 'get', '.', SLUG, '06-verify-s2', '--field', 'convergence']),
  'ten-findings': (f) => code(f.root, "return wf.findings.list().filter((x) => x.severity === 'HIGH').map((x) => x.id).join(', ');", 'query'),
  'steps-loop': (f) => {
    wf(f.root, ['step', 'done', '.', SLUG, 's3', '3', '--sha', 'HEAD']);
    for (const [n, title] of [[4, 'Docs'], [5, 'Tests'], [6, 'Cleanup']]) {
      wf(f.root, ['step', 'start', '.', SLUG, 's3', String(n), '--title', title]);
      wf(f.root, ['step', 'done', '.', SLUG, 's3', String(n), '--no-change']);
    }
  },
  'held-question': (f) => wf(f.root, ['decide', 'hold', '.', SLUG, '--key', 'retry-limit', '--question', 'Which retry limit?', '--stage', 'implement', '--slice', 's3', '--options', '3|5', '--recommended', '3']),
  'suite-run': (f) => wf(f.root, ['profile', 'run', '.', 'fast']),
  'bulk-findings': (f) => { for (let n = 1; n <= 6; n += 1) wf(f.root, ['findings', 'set', '.', SLUG, `COR-${n}`, 'fixed', '--commit', 'HEAD']); },
};

let failed = 0;
for (const task of TASKS) {
  const top = mkdtempSync(join(tmpdir(), `codemode-${task.id}-`));
  try {
    const f = makeFixture(join(top, 'repo'));
    const start = task.check(f, '');
    const answer = await SOLUTIONS[task.id](f);
    const end = task.check(f, answer);
    const ok = !start.pass && end.pass;
    if (!ok) failed += 1;
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${task.id}: start ${start.pass ? 'passes (wrong)' : 'fails'}; solved: ${end.why}\n`);
  } catch (e) {
    failed += 1;
    process.stdout.write(`FAIL ${task.id}: ${e.message}\n`);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
}
rmSync(home, { recursive: true, force: true });
process.stdout.write(failed ? `${failed} task(s) failed\n` : `all ${TASKS.length} tasks pass the self-test\n`);
process.exitCode = failed ? 1 : 0;
