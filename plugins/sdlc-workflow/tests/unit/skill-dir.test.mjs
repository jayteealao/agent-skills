// `<skill-dir>` reaches every agent that did not load the skill.
//
// Only the session that loaded SKILL.md knows the folder of the skill. Every other agent (a
// sub-agent, a stage agent of a driven run, an agent of an orchestrate run) reads references that
// say `node "<skill-dir>/scripts/wf.mjs"`. Without a folder, agents searched the whole disk for
// wf.mjs, and those searches never ended. These tests fail when a prompt that code builds for
// another agent, or a prompt template of a reference, leaves the folder out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SKILL_DIR, SKILL_DIR_FALLBACK, skillDirLine, skillDirOf } from '../../lib/skill-dir.mjs';
import { buildBrief } from '../../lib/brief.mjs';
import { firstMessage } from '../../lib/orchestrate-runner.mjs';
import { writeShim } from '../../lib/wf-shim.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF = path.join(pluginRoot, 'scripts', 'wf.mjs');
const read = (rel) => readFileSync(path.join(pluginRoot, rel), 'utf8');
const SCRIPTS = ['skills/wf/workflows/yolo.js', 'skills/wf/workflows/optimize.js'];

test('SKILL_DIR is the folder that holds scripts/wf.mjs and reference/', () => {
  assert.ok(path.isAbsolute(SKILL_DIR));
  assert.ok(existsSync(path.join(SKILL_DIR, 'scripts', 'wf.mjs')));
  assert.ok(existsSync(path.join(SKILL_DIR, 'reference', '_host-invocation.md')));
  assert.ok(!SKILL_DIR.includes('\\'), 'forward slashes, for Git Bash and PowerShell alike');
  assert.equal(skillDirOf('C:\\p\\skills\\wf\\reference\\'), 'C:/p/skills/wf');
});

test('the line names the folder and the wf.mjs command, and forbids a search', () => {
  const line = skillDirLine('/p/skills/wf');
  assert.match(line, /^skill-dir: \/p\/skills\/wf\n/);
  assert.ok(line.includes('node "/p/skills/wf/scripts/wf.mjs"'));
  assert.match(line, /Never search the disk for wf\.mjs/);
});

// ---- the workflow scripts: every agent() call carries the line ----------------------------

/** The code of a workflow script without its comment lines. */
const codeOf = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

for (const rel of SCRIPTS) {
  test(`${path.basename(rel)} builds the same line as lib/skill-dir.mjs`, () => {
    const src = read(rel);
    const m = /^const SKILL_DIR_LINE = ([\s\S]*?'Never search the disk for wf\.mjs, a script or the plugin folder\.')$/m.exec(src);
    assert.ok(m, `${rel} defines SKILL_DIR_LINE`);
    const built = new Function('SKILL_DIR', `return ${m[1]}`)('/p/skills/wf');
    assert.equal(built, skillDirLine('/p/skills/wf'));
    assert.match(src, /^const SKILL_DIR = String\(referenceRoot\)\.replace\(.*\.replace\(\/\\\/reference\$\/, ''\)$/m);
  });

  test(`${path.basename(rel)} calls agent() only where the line goes first`, () => {
    const calls = [...codeOf(read(rel)).matchAll(/(?<![\w.])agent\((?!s\))(.{0,40})/g)].map((c) => c[1]);
    assert.equal(calls.length, 1, `one raw agent() call, the wrapper; found ${calls.length}: ${calls.join(' | ')}`);
    assert.match(calls[0], /^`\$\{SKILL_DIR_LINE\}\\n\\n\$\{prompt\}`/);
  });
}

test('a yolo walk: every prompt that an agent receives starts with the skill-dir line', async () => {
  const src = read('skills/wf/workflows/yolo.js');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', src.replace('export const meta', 'const meta'));
  const prompts = [];
  const slice = { slice: 'a', status: 'defined', reverifyReason: 'none', stages: { plan: 'done', implement: 'done', verify: 'done', review: 'n-a' } };
  await driver(
    { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo' },
    async (prompt, opts = {}) => {
      prompts.push({ label: opts.label, prompt });
      if (opts.label === 'orient') {
        return { ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed', runId: 'r1', charter: [], priorDeferrals: [], branch: { current: 'b', target: 'b', match: true, strategy: 'none' }, slices: [slice] };
      }
      if (opts.label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
      if (opts.label && opts.label.startsWith('scout:')) return { findings: [] };
      if (opts.label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0, couldNotFixBlockers: 0 } };
      return undefined;
    },
    () => {}, () => {}, async (fns) => Promise.all(fns.map((f) => f())),
  );
  assert.ok(prompts.length >= 3, `the walk reached several agents: ${prompts.map((p) => p.label).join(', ')}`);
  for (const p of prompts) {
    assert.ok(p.prompt.startsWith(`${skillDirLine('/plugin/skills/wf')}\n\n`), `the prompt of ${p.label} starts with the line`);
    assert.doesNotMatch(p.prompt, /\/reference\/\.\.\/scripts\/wf\.mjs/, `${p.label}: wf.mjs is named by the skill folder`);
  }
});

// ---- the outputs of code that an agent reads first -----------------------------------------

test('the brief names the skill folder of its reference folder', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-skilldir-'));
  try {
    const ref = path.join(root, 'skills', 'wf', 'reference');
    mkdirSync(ref, { recursive: true });
    mkdirSync(path.join(root, '.ai', 'workflows', 'demo'), { recursive: true });
    writeFileSync(path.join(ref, 'plan.md'), '# Plan\n\n## Card\n\n- One.\n');
    const b = buildBrief({ projectRoot: root, referenceRoot: ref, slug: 'demo', stage: 'plan' });
    assert.ok(b.text.includes(skillDirLine(skillDirOf(ref))), b.text.slice(0, 600));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the dispatch prints the skill-dir line, and `wf.mjs skill-dir` prints the folder', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-skilldir-'));
  try {
    const text = spawnSync(process.execPath, [WF, 'dispatch', root, '--host', 'claude', '--', 'status'], { encoding: 'utf8' });
    assert.equal(text.status, 0, text.stderr);
    const line = /^skill-dir: (.+)$/m.exec(text.stdout);
    assert.ok(line, text.stdout);
    assert.ok(existsSync(path.join(line[1], 'scripts', 'wf.mjs')), `${line[1]} holds scripts/wf.mjs`);
    const json = spawnSync(process.execPath, [WF, 'dispatch', root, '--host', 'claude', '--json', '--', 'status'], { encoding: 'utf8' });
    assert.equal(JSON.parse(json.stdout).skillDir, SKILL_DIR);
    const bare = spawnSync(process.execPath, [WF, 'skill-dir'], { encoding: 'utf8' });
    assert.equal(bare.status, 0, bare.stderr);
    assert.equal(bare.stdout.trim(), SKILL_DIR);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('with no line, the stable entry point prints the folder', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'sdlc-skilldir-home-'));
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    const { shim } = writeShim(pluginRoot, { version: '0.0.0-test', host: 'claude' });
    const r = spawnSync(process.execPath, [shim, 'skill-dir'], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: home } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), SKILL_DIR);
    assert.equal(SKILL_DIR_FALLBACK, 'node "$HOME/.sdlc/bin/wf.mjs" skill-dir');
  } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('the first message of an orchestrate agent names the folder on one line', () => {
  const m = firstMessage('C:/r/task-1.md');
  assert.ok(!m.includes('\n'), 'hc may type it into a terminal: a newline would send it early');
  assert.ok(m.includes(`skill-dir: ${SKILL_DIR} `));
  assert.ok(m.includes(`node "${SKILL_DIR}/scripts/wf.mjs"`));
  assert.match(m, /Never search the disk for wf\.mjs/);
});

// ---- the prose ------------------------------------------------------------------------------

function mdFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) mdFiles(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
const SKILL_MD = [...mdFiles(path.join(pluginRoot, 'skills')), ...mdFiles(path.join(pluginRoot, 'reference'))];
const rel = (f) => path.relative(pluginRoot, f).split(path.sep).join('/');

test('every child-prompt template that names <skill-dir> carries the skill-dir line', () => {
  // A file that starts children cites _subagents.md; the orchestrate tasks are the other templates.
  const dispatchers = SKILL_MD.filter((f) => /_subagents\.md/.test(readFileSync(f, 'utf8')) || rel(f).endsWith('orchestrate/_tasks.md'));
  assert.ok(dispatchers.length > 5, 'the files that start children are found');
  const missing = [];
  for (const f of dispatchers) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      const body = m[1];
      const first = body.split('\n').find((l) => l.trim()) ?? '';
      // A command block runs in the session that read the file; it is no prompt.
      if (/^\s*(\d+\.\s*)?node /.test(first)) continue;
      if (first.trim() === '<the common head>') continue;
      if (body.includes('<skill-dir>') && !/^skill-dir: /m.test(body)) {
        missing.push(`${rel(f)}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'a child reads <skill-dir> with no folder: put the skill-dir line first in the template');
  assert.match(read('skills/wf/reference/orchestrate/_tasks.md'), /## The common head\n\n```text\nskill-dir: <skill-dir> /);
});

test('no skill file tells an agent to search for wf.mjs or the plugin folder', () => {
  const bad = [];
  const search = /\b(find|locate|search(?: the disk)? for|look for|glob for)\b[^.\n]{0,60}\b(wf\.mjs|plugin (?:folder|dir(?:ectory)?|root)|skill folder|<skill-dir>)/i;
  for (const f of SKILL_MD) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (search.test(l) && !/\b(never|do not|don't|no)\b[^.]*\bsearch/i.test(l)) bad.push(`${rel(f)}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('SKILL.md, the host contract and the sub-agent rules say where the folder comes from', () => {
  const skill = read('skills/wf/SKILL.md');
  const where = skill.indexOf('# Where the scripts are');
  assert.ok(where > 0 && where < skill.indexOf('# Step 0'), 'the rule comes before the dispatch check');
  assert.ok(skill.includes(SKILL_DIR_FALLBACK.replace(' skill-dir', '')));
  assert.match(skill, /Never search the disk for `wf\.mjs`/);
  assert.match(skill, /stop and ask the person/);
  assert.match(skill, /`skill-dir: <folder>`/);
  assert.match(read('skills/wf/reference/_host-invocation.md'), /\$HOME\/\.sdlc\/bin\/wf\.mjs" skill-dir/);
  assert.match(read('skills/wf/reference/_subagents.md'), /The first line of every child prompt is the `skill-dir:` line/);
});
