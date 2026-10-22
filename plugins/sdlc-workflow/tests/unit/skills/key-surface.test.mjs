// WF-KEY-SURFACE-PLAN guard tests: 19 keys, 6 sub-keys, 17 intake modes, the
// intake fast path, the reserved slug names, and the clean break (no file
// prints a removed command).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, doesNotMatch, equal, match, ok } from 'node:assert/strict';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
const REF = 'skills/wf/reference';

const KEYS = ['intake', 'shape', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro',
  'design', 'probe', 'auto', 'yolo', 'campaign', 'loop', 'status', 'project', 'docs'];
const SUB_KEYS = { 'loop goal': 'goal.md', 'loop optimize': 'optimize.md', 'loop prototype': 'prototype.md',
  'status recap': 'recap.md', 'project ship-plan': 'ship-plan.md', 'project observability': 'observability.md' };
const ENTRY_MODES = ['fix', 'rca', 'investigate', 'discover', 'audit', 'hotfix', 'refactor', 'update-deps', 'ideate',
  'brainstorm', 'adopt', 'optimize', 'simplify', 'task'];
const MAINTENANCE = ['amend', 'modernize', 'close'];
const REMOVED = ['goal', 'optimize', 'prototype', 'brainstorm', 'simplify', 'task', 'recap', 'close', 'ship-plan', 'observability'];

const skill = read('skills/wf/SKILL.md');
const intake = read(`${REF}/intake.md`);

/** The backticked words of the first `(...)` list after `marker` in `text`. */
function listAfter(text, marker) {
  const at = text.indexOf(marker);
  ok(at >= 0, `missing ${marker}`);
  const close = text.indexOf(')', at);
  return [...text.slice(at, close).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
}

test('SKILL.md has the 19 keys, and a word that is not a key goes to the router', () => {
  const rows = [...skill.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
  deepEqual([...rows].sort(), [...KEYS].sort());
  match(skill, /If the key candidate is not one of the 19 keys, the reference is `reference\/route\.md`/);
  for (const gone of ['brainstorm', 'simplify', 'task', 'close', 'goal', 'optimize', 'prototype', 'recap', 'ship-plan', 'observability']) {
    doesNotMatch(skill, new RegExp(`^\\| \`${gone}\` \\|`, 'm'), `${gone} is no longer a key row`);
  }
});

test('each sub-key loads its own file directly, and the catalog has one row per sub-key', () => {
  match(skill, /^\| Sub-key \| Reference \|$/m);
  for (const [sub, file] of Object.entries(SUB_KEYS)) {
    ok(skill.includes(`\`${sub}\``), `SKILL.md names ${sub}`);
    ok(skill.includes(`\`reference/${file}\``), `SKILL.md names reference/${file}`);
    ok(existsSync(join(PLUGIN_ROOT, REF, file)), `${file} exists`);
  }
  match(skill, /\*\*Sub-keys\.\*\* When the next token is a sub-key of the key/);
  match(skill, /When `loop` or `project` has no sub-key token, render its sub-key rows/);
  const catalog = read('hooks/mod/catalog.ts');
  for (const sub of Object.keys(SUB_KEYS)) match(catalog, new RegExp(`key: '${sub}', name: '${sub.split(' ')[1]}'`));
  ok(!existsSync(join(PLUGIN_ROOT, REF, 'loop.md')) && !existsSync(join(PLUGIN_ROOT, REF, 'project.md')), 'loop and project have no reference file');
});

test('the intake fast path: the mode words of SKILL.md are the entry modes of intake.md', () => {
  match(skill, /\*\*Intake fast path\.\*\* When the key is `intake`, the next token is a mode word below, and `\.ai\/workflows\/<that token>\/` does not exist, the reference is `reference\/intake\/<mode>\.md` in place of `reference\/intake\.md`, and `reference\/intake\/_intake-context\.md` is its first input\./);
  deepEqual(listAfter(skill, 'A mode (`fix`'), ENTRY_MODES);
  const set = /The \*\*mode keyword set\*\* is: ([^\n]+?)\./.exec(intake);
  deepEqual([...set[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]), [...ENTRY_MODES, ...MAINTENANCE]);
  for (const mode of ENTRY_MODES) ok(existsSync(join(PLUGIN_ROOT, REF, 'intake', `${mode}.md`)), `intake/${mode}.md exists`);
  for (const mode of ['simplify', 'task']) {
    match(intake, new RegExp(`^\\| \`${mode}\` \\| \`intake/${mode}\\.md\` \\|$`, 'm'), `${mode} row of the file map`);
    ok(!existsSync(join(PLUGIN_ROOT, REF, `${mode}.md`)), `${mode}.md left the top level`);
  }
  match(intake, /`adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, and `close` are \*\*never\*\* auto-proposed/);
});

test('close is a slug-first maintenance word; a first token close is a description', () => {
  match(intake, /`token1` is `amend`, `modernize` or `close` → \*\*maintenance mode\*\*/);
  match(intake, /If `token0` is `close` and `token1` exactly matches an existing slug → STOP: \*"Run `\/wf intake <token1> close`/);
  match(intake, /Otherwise a `token0` of `close` starts a description \("close the dropdown"\): go to branch 4\./);
  match(intake, /^\| `close` \*\(maintenance — branch 0\)\* \| `intake\/close\.md` \|$/m);
  const close = read(`${REF}/intake/close.md`);
  match(close, /`intake\.md` branch 0 consumed the \*\*slug\*\* and the word `close`/);
  ok(!existsSync(join(PLUGIN_ROOT, REF, 'close.md')));
});

test('the reserved slug names cover every key, sub-key and mode word', () => {
  const ctx = read(`${REF}/intake/_intake-context.md`);
  const at = ctx.indexOf('**Reserved slug names.**');
  ok(at >= 0);
  const block = ctx.slice(at, ctx.indexOf('\n\n', ctx.indexOf('- the intake mode words', at)));
  const words = new Set([...block.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
  const subs = Object.keys(SUB_KEYS).map((s) => s.split(' ')[1]);
  for (const w of [...KEYS, ...subs, ...ENTRY_MODES, ...MAINTENANCE]) ok(words.has(w), `${w} is reserved`);
  match(read(`${REF}/intake/default.md`), /When the slug is a reserved name \(\[_intake-context\.md\]\(_intake-context\.md\)\), STOP and ask for another slug/);
  match(read(`${REF}/intake/_packet.md`), /or `<work-slug>` is a reserved slug name, ask the person for a new slug/);
  match(read(`${REF}/status.md`), /6\. A reserved slug name \(`intake\/_intake-context\.md`\) → flag/);
});

test('brainstorm has one file: the alias router is gone and its rules live in the mode', () => {
  ok(!existsSync(join(PLUGIN_ROOT, REF, 'brainstorm.md')));
  const mode = read(`${REF}/intake/brainstorm.md`);
  match(mode, /`\/wf intake brainstorm <brainstorm-slug> \[design \| add <text>\]`/);
  ok(mode.split('\n').length <= 250, 'the mode stays a stage body');
});

/** Every file under `dir` with one of the extensions. */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(abs);
  }
  return out;
}

test('the clean break: no live file prints a removed command (the CHANGELOG and docs/internal are history)', () => {
  const re = new RegExp(`(?:/wf|\\$wf|/skill:wf) (?:${REMOVED.join('|')})\\b`);
  const hits = [];
  for (const dir of ['skills', 'hooks', 'lib', 'scripts', 'renderers', 'workflows', 'reference', join('docs', 'site')]) {
    const abs = join(PLUGIN_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs, ['.md', '.mjs', '.js', '.ts', '.json', '.yaml', '.html'])) {
      const text = readFileSync(f, 'utf8');
      const m = re.exec(text);
      if (m) hits.push(`${relative(PLUGIN_ROOT, f)}: ${m[0]}`);
    }
  }
  for (const f of ['README.md', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const m = re.exec(read(f));
    if (m) hits.push(`${f}: ${m[0]}`);
  }
  deepEqual(hits, []);
});

test('the surface pins: 19 keys and 17 intake modes', () => {
  const pins = JSON.parse(read('docs/internal/surface-policy.json'));
  equal(pins.keys, 19);
  equal(pins.intakeModes, 17);
});
