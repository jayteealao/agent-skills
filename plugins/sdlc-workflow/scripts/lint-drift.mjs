#!/usr/bin/env node
// scripts/lint-drift.mjs — finds text that disagrees with the file or the code it names.
//
//   forms     every `/wf …` or `$wf …` form in the prose and the code strings fits a form of
//             skills/wf/keys.json; a command word that is not a key (a sub-key or a mode
//             typed as a key, or a near miss of a key) is an error
//   links     every relative markdown link names a file that exists, and its #anchor a
//             heading of that file; every "<file>.md Step N" pointer names a heading of that file
//   config    every backticked dotted setting whose first part is a setting of
//             schemas/sdlc-config.schema.json resolves in the schema; a retired setting is an error
//   fields    every frontmatter field that the code reads by name (`fm['current-stage']`)
//             is a property of schemas/frontmatter.schema.json, the contract every writer follows
//   hosts     every gap of the registry names its reason (lib/registry.mjs checks the shape)
//   generated every file that npm run generate writes matches the registry
//   cards     every stage reference has a ## Card section, which the brief of the stage reads
//   public    the comments of the drivers, lib, scripts and hooks, and the comments, test titles
//             and file names of the tests, name no internal plan or review id (AGENTS.md "Public text")
//   wfdir     the cards and the drivers name the folder of a workflow `<wf-dir>/`, never
//             `.ai/workflows/<slug>/` (only _records.md defines the local folder)
//
//   node scripts/lint-drift.mjs [--json]     exit 1 when it finds any drift
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RETIRED_CONFIG_KEYS } from '../lib/config.mjs';
import { parseForm } from '../lib/dispatch.mjs';
import { cardOf } from '../lib/brief.mjs';
import { PLUGIN_ROOT, loadRegistry, registryErrors, reservedWords } from '../lib/registry.mjs';
import { generate } from './generate.mjs';

const toPosix = (p) => p.split(sep).join('/');
const PROSE_DIRS = ['skills', 'reference'];
const PROSE_FILES = ['README.md'];
const CODE_DIRS = ['hooks', 'lib', 'scripts', 'skills'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'archived', '.git', 'fixtures']);

function walk(root, dir, exts, out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, rel, exts, out); }
    else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

export function proseFiles(root = PLUGIN_ROOT) {
  return [...PROSE_FILES.filter((f) => existsSync(join(root, f))), ...PROSE_DIRS.flatMap((d) => walk(root, d, ['.md']))].sort();
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ---------------------------------------------------------------- forms

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** A token of a written form fits an atom of a registry form, without a disk. */
function tokenFits(atom, t, modes) {
  if (/<[^>]+>/.test(t) || t.includes('|') || /^(\.\.\.|…)$/.test(t)) return true;
  if (atom.text) return true;
  if (atom.word) return t === atom.word;
  if (atom.pr) return /^pr#(\d+|N|<[^>]+>)$/.test(t);
  if (atom.slot === 'mode') return modes.has(t);
  if (['slug', 'slice', 'branch'].includes(atom.slot)) return /^[a-z0-9][a-z0-9._/-]*$/.test(t);
  return true;
}

function fitsSyntax(items, tokens, i, modes) {
  if (!items.length) return i === tokens.length;
  const [head, ...rest] = items;
  if (head.group) return fitsSyntax([...head.group, ...rest], tokens, i, modes) || fitsSyntax(rest, tokens, i, modes);
  if (i >= tokens.length) return false;
  return head.alts.some((a) => (a.text
    ? Array.from({ length: tokens.length - i }, (_, n) => i + n + 1).some((j) => fitsSyntax(rest, tokens, j, modes))
    : tokenFits(a, tokens[i], modes) && fitsSyntax(rest, tokens, i + 1, modes)));
}

/**
 * Check one written form. Returns null when it fits, or the reason. With `keyOnly`, only the
 * command word is checked: a code string carries prose after the form.
 */
export function checkForm(reg, form, { keyOnly = false } = {}) {
  const tokens = form.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter((t) => t && t !== '…' && t !== '...');
  if (!tokens.length) return null;
  const [word, ...rest] = tokens;
  if (/<[^>]+>/.test(word)) return null;
  const key = reg.keys.find((k) => k.name === word);
  if (!key) {
    const reserved = reservedWords(reg);
    if (reserved.has(word)) return `\`${word}\` is not a key`;
    const near = reg.keys.find((k) => levenshtein(k.name, word) <= 1 && word.length > 3);
    return near ? `\`${word}\` is not a key (near \`${near.name}\`)` : null;
  }
  if (keyOnly) return null;
  const modes = new Set((reg.keys.find((k) => k.name === 'intake')?.modes ?? []).map((m) => m.name));
  if (!rest.length && key.subkeys?.length && key.needs === 'sub-key') return null;
  // A sub-key on its own names the sub-key.
  if (rest.length === 1 && key.subkeys?.some((s) => s.name === rest[0])) return null;
  if (key.modes?.length && modes.has(rest[0])) return null;
  const forms = key.args.map(parseForm);
  if (!rest.length && forms.every((f) => !fitsSyntax(f, [], 0, modes))) return null; // a bare key names the key
  if (forms.some((f) => fitsSyntax(f, rest, 0, modes))) return null;
  return `\`/wf ${tokens.join(' ')}\` fits no form of \`${key.name}\``;
}

const FORM_RE = /(?:^|[\s`"'(])(?:\/wf|\$wf|\/sdlc-workflow:wf)((?: +[^\s`"')]+)*)/g;

/** The /wf forms written in a text: inside backticks, in code lines, and in quoted strings. */
export function formsIn(text) {
  const out = [];
  for (const m of text.matchAll(/`([^`\n]*)`/g)) {
    const inner = m[1];
    const f = /^(?:\/wf|\$wf|\/sdlc-workflow:wf)(\s+.*)?$/.exec(inner.trim());
    if (f) out.push({ form: (f[1] ?? '').trim(), index: m.index });
  }
  let inFence = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (inFence) {
      const f = /^\s*(?:\/wf|\$wf)(\s+[^#→]*?)?\s*(?:→.*|#.*)?$/.exec(line);
      if (f) out.push({ form: (f[1] ?? '').trim(), index: offset });
    }
    offset += line.length + 1;
  }
  return out;
}

function lintForms(root, reg) {
  const findings = [];
  for (const rel of proseFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
    for (const { form, index } of formsIn(text)) {
      const why = checkForm(reg, form);
      if (why) findings.push({ check: 'forms', file: rel, line: lineOf(text, index), message: why });
    }
  }
  for (const rel of CODE_DIRS.flatMap((d) => walk(root, d, ['.mjs', '.js', '.ts']))) {
    const text = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(/(?:^|[\s'"`(])\/wf ([a-z][a-z-]*)/gm)) {
      const why = checkForm(reg, m[1], { keyOnly: true });
      if (why) findings.push({ check: 'forms', file: rel, line: lineOf(text, m.index), message: why });
    }
  }
  return findings;
}

// ---------------------------------------------------------------- links

export function headingSlugs(text) {
  const slugs = new Set();
  const seen = new Map();
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = m[1].toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n ? `${base}-${n}` : base);
  }
  return slugs;
}

/**
 * A file has Step N when a heading holds `Step N`, a `Steps A–B` heading covers N, a bold
 * `**Step N` starts a line, or a numbered bold item `N. **` / `N **` starts a line.
 */
export function hasStep(text, step) {
  const s = step.replace(/\./g, '\\.');
  const end = '(?![0-9]|\\.[0-9])';
  if (new RegExp(`^#{1,6}\\s.*\\bStep ${s}${end}`, 'm').test(text)) return true;
  if (new RegExp(`^\\s*(?:-\\s+)?\\*\\*Step ${s}${end}`, 'm').test(text)) return true;
  if (new RegExp(`^\\s*${s}\\.?\\s+\\*\\*`, 'm').test(text)) return true;
  // `Step 0.3` also names item 3 of Step 0.
  const item = /^(\d+)\.(\d+)$/.exec(step);
  if (item && hasStep(text, item[1]) && new RegExp(`^\\s*${item[2]}\\.\\s`, 'm').test(text)) return true;
  const n = Number.parseFloat(step);
  for (const m of text.matchAll(/^#{1,6}\s.*\bSteps (\d+)\s*[–-]\s*(\d+)\b/gm)) {
    if (n >= Number(m[1]) && n <= Number(m[2]) + 0.999) return true;
  }
  return false;
}

function lintLinks(root) {
  const findings = [];
  const cache = new Map();
  const textOf = (rel) => {
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(root, rel), 'utf8'));
    return cache.get(rel);
  };
  for (const rel of proseFiles(root)) {
    const text = textOf(rel).replace(/\r\n/g, '\n');
    const prose = text.replace(/```[\s\S]*?```/g, (b) => b.replace(/[^\n]/g, ' '));
    for (const m of prose.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#$)/.test(target) || target.includes('<')) continue;
      const [path, anchor] = target.split('#');
      const file = path ? toPosix(relative(root, resolve(root, dirname(rel), path))) : rel;
      if (path && (!existsSync(join(root, file)) || file.startsWith('../../..'))) {
        findings.push({ check: 'links', file: rel, line: lineOf(text, m.index), message: `link target ${target} does not exist` });
        continue;
      }
      if (anchor && file.endsWith('.md') && statSync(join(root, file)).isFile() && !headingSlugs(textOf(file)).has(anchor.toLowerCase())) {
        findings.push({ check: 'links', file: rel, line: lineOf(text, m.index), message: `${file} has no heading #${anchor}` });
      }
    }
    for (const m of prose.matchAll(/\[?`?([A-Za-z0-9_./-]+\.md)`?\]?(?:\([^)]*\))? Step (\d+(?:\.\d+)?[a-z]?)\b/g)) {
      const name = m[1];
      const candidates = [resolve(root, dirname(rel), name), resolve(root, 'skills', 'wf', 'reference', name), resolve(root, 'skills', 'wf', name), resolve(root, 'skills', name)];
      const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile());
      if (!hit) continue;
      if (!hasStep(readFileSync(hit, 'utf8'), m[2])) {
        findings.push({ check: 'links', file: rel, line: lineOf(text, m.index), message: `${name} has no Step ${m[2]}` });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------- config

function lintConfig(root) {
  const schema = JSON.parse(readFileSync(join(root, 'schemas', 'sdlc-config.schema.json'), 'utf8'));
  const top = new Set(Object.keys(schema.properties ?? {}).filter((k) => !k.startsWith('$')));
  const retiredRoots = new Set(RETIRED_CONFIG_KEYS.map((k) => k.split('.')[0]));
  const resolvePath = (parts) => {
    let node = schema;
    for (const p of parts) {
      node = node?.properties?.[p] ?? (node?.additionalProperties && typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined);
      if (!node) return false;
    }
    return true;
  };
  const findings = [];
  for (const rel of proseFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(/`([a-z][A-Za-z]*(?:\.[a-zA-Z][A-Za-z0-9]*)+)(?:\s*:\s*[^`]*)?`/g)) {
      const parts = m[1].split('.');
      if (/\.(md|mjs|js|json|ya?ml|ts|html|css|txt|sh|py)$/.test(m[1])) continue;
      const retired = RETIRED_CONFIG_KEYS.some((k) => m[1] === k || m[1].startsWith(`${k}.`));
      if (retired) findings.push({ check: 'config', file: rel, line: lineOf(text, m.index), message: `\`${m[1]}\` is a retired setting` });
      else if (top.has(parts[0]) && !resolvePath(parts)) findings.push({ check: 'config', file: rel, line: lineOf(text, m.index), message: `\`${m[1]}\` is not a setting of the config schema` });
      else if (!top.has(parts[0]) && retiredRoots.has(parts[0]) && /sdlc-config|setting|config/.test(text.slice(Math.max(0, m.index - 200), m.index + 200))) {
        findings.push({ check: 'config', file: rel, line: lineOf(text, m.index), message: `\`${m[1]}\` is a retired setting` });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------- fields

/** The fields a writer writes: the properties of the frontmatter schema, and the keys of the templates in the references. */
function writtenFields(root) {
  const schema = JSON.parse(readFileSync(join(root, 'schemas', 'frontmatter.schema.json'), 'utf8'));
  const fields = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) for (const k of Object.keys(node.properties)) fields.add(k);
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v);
  };
  visit(schema);
  for (const rel of proseFiles(root)) {
    for (const block of readFileSync(join(root, rel), 'utf8').matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
      for (const m of block[1].matchAll(/^\s*(?:-\s+)?([a-z][a-z0-9]*(?:-[a-z0-9]+)+):/gm)) fields.add(m[1]);
    }
  }
  return fields;
}

const FM_READ = /\b(?:fm|frontmatter|data|index|idx|meta)\??\.?\[\s*['"]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['"]\s*\]/g;

function lintFields(root) {
  const fields = writtenFields(root);
  const findings = [];
  for (const rel of ['hooks', 'lib', 'scripts'].flatMap((d) => walk(root, d, ['.mjs', '.js']))) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const m of text.matchAll(FM_READ)) {
      if (!fields.has(m[1])) findings.push({ check: 'fields', file: rel, line: lineOf(text, m.index), message: `reads frontmatter field ${m[1]}, which no schema type or reference template writes` });
    }
  }
  return findings;
}

// ---------------------------------------------------------------- main

// ---------------------------------------------------------------- cards

/** Every stage key of the registry has a `## Card` section in its reference: the brief reads it. */
export function lintCards(root, reg) {
  const out = [];
  for (const k of reg.keys.filter((x) => x.stage)) {
    const file = `skills/wf/${k.reference}`;
    const text = existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null;
    if (text == null) continue; // the links check names a missing reference
    if (cardOf(dirname(join(root, file)), k.name) == null) out.push({ check: 'cards', file, line: 1, message: `the stage ${k.name} has no ## Card section` });
  }
  return out;
}

// ---------------------------------------------------------------- public

/**
 * The ids of internal plans and reviews: the name of a plan or a review, a section mark, a part,
 * a wave, a lettered item, and a letter-number item id. An acceptance criterion id (AC and a
 * number), a heading tag, an ECMAScript edition and the V8 engine are product words, not ids.
 */
export const PLAN_ID_RE = new RegExp([
  String.raw`\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-(?:PLAN|AUDIT|REVIEW|FINDINGS|CONSENT|HARDENING|LIFECYCLE|INTEROP|SEMANTIC|FIDELITY|REMEDIATION)\b`,
  String.raw`\bWIDE-VIEW\b`,
  String.raw`§\s?\d+(?:\.\d+)*`,
  String.raw`\bPart [A-Z]\b`,
  String.raw`\bwaves? [A-Z]\d*\b`,
  String.raw`\b(?!AC-)[A-Z]{1,2}-[A-Z]{1,2}-?\d+\b`,
  String.raw`(?<![\w.-])(?!AC\d|ES\d|H[1-6]\b|V8\b)[A-Z]{1,2}\d+(?:\.\d+)*[a-z]?\b`,
].join('|'), 'g');

/**
 * Files that another change rewrites now. Each entry is TEMPORARY: remove it when that change
 * lands and its comments are clean.
 */
export const PUBLIC_SKIP = new Set([
  'lib/design-check.mjs',
  'lib/design-cli.mjs',
  'tests/integration/design-approve.test.mjs',
  'tests/unit/lib/design-audit.test.mjs',
  'tests/unit/lib/design-check.test.mjs',
]);

/** The comments of a script, one entry for each line: `//` comments and block comments. */
export function commentsOf(text) {
  const out = [];
  let inBlock = false;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (inBlock) {
      out.push({ line: i + 1, text: line.trim() });
      if (line.includes('*/')) inBlock = false;
      return;
    }
    const block = /(?:^|\s)\/\*(.*)$/.exec(line);
    if (block) {
      out.push({ line: i + 1, text: block[1] });
      if (!block[1].includes('*/')) inBlock = true;
      return;
    }
    const lineComment = /(?:^|[\s;,(){}[\]])\/\/(.*)$/.exec(line);
    if (lineComment) out.push({ line: i + 1, text: lineComment[1] });
  });
  return out;
}

const TEST_TITLE_RE = /\b(?:test|it|describe|suite)(?:\.(?:skip|only|todo))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** The titles of the tests of a test file: the first string of each test(), it(), describe() and suite(). */
export function testTitlesOf(text) {
  return [...text.matchAll(TEST_TITLE_RE)].map((m) => ({ line: lineOf(text, m.index), text: m[2] }));
}

/** The plan ids in one piece of text. */
export const planIdsIn = (text) => [...String(text).matchAll(PLAN_ID_RE)].map((m) => m[0]);

/** The files of the public-text check. */
export function publicFiles(root = PLUGIN_ROOT) {
  const dir = join(root, 'skills/wf/workflows');
  const drivers = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => `skills/wf/workflows/${f}`) : [];
  return [...drivers, ...['lib', 'scripts', 'hooks'].flatMap((d) => walk(root, d, ['.mjs'])), ...walk(root, 'tests', ['.mjs', '.js'])]
    .filter((rel) => !PUBLIC_SKIP.has(rel)).sort();
}

/** No comment, test title or test file name names an internal plan or review id. */
export function lintPublic(root = PLUGIN_ROOT) {
  const findings = [];
  for (const rel of publicFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8');
    const parts = commentsOf(text).map((c) => ({ ...c, what: 'comment' }));
    if (rel.startsWith('tests/')) {
      parts.push(...testTitlesOf(text).map((c) => ({ ...c, what: 'test title' })));
      parts.push({ line: 1, text: rel.split('/').pop(), what: 'file name' });
    }
    for (const p of parts) {
      const ids = [...new Set(planIdsIn(p.text))];
      if (ids.length) findings.push({ check: 'public', file: rel, line: p.line, message: `the ${p.what} names the internal id ${ids.join(', ')}; say the reason in plain words` });
    }
  }
  return findings;
}

// ---------------------------------------------------------------- wfdir

/**
 * The card that defines the local folder of a workflow (`<root>/.ai/workflows/<slug>/`), and the
 * files that another change rewrites now. Each entry after the first is TEMPORARY: remove it
 * when that change lands.
 */
export const WFDIR_SKIP = new Set([
  'skills/wf/reference/_records.md',
  'skills/wf/reference/design/stage.md',
]);

/**
 * The cards and the drivers name the folder of a workflow as `<wf-dir>/`, the absolute folder
 * that the dispatch and the brief print. A path `.ai/workflows/<...>` is the old form: in a
 * linked project it names the wrong folder.
 */
export function lintWfDir(root = PLUGIN_ROOT) {
  const out = [];
  for (const rel of walk(root, 'skills', ['.md', '.js', '.mjs'])) {
    if (WFDIR_SKIP.has(rel)) continue;
    const text = readFileSync(join(root, rel), 'utf8');
    for (const m of text.matchAll(/\.ai\/workflows\/(?:<|\$\{)/g)) {
      out.push({ check: 'wfdir', file: rel, line: lineOf(text, m.index), message: 'names the workflow folder as `.ai/workflows/<slug>/`; write `<wf-dir>/` (the dispatch prints `wf-dir:`)' });
    }
  }
  return out;
}

export function lintDrift(root = PLUGIN_ROOT) {
  const reg = loadRegistry(root);
  const findings = [
    ...registryErrors(reg, root).map((message) => ({ check: 'hosts', file: 'skills/wf/keys.json', line: 1, message })),
    ...generate({ root, write: false }).map((file) => ({ check: 'generated', file, line: 1, message: 'out of date; run npm run generate' })),
    ...lintForms(root, reg),
    ...lintLinks(root),
    ...lintConfig(root),
    ...lintFields(root),
    ...lintCards(root, reg),
    ...lintPublic(root),
    ...lintWfDir(root),
  ];
  return findings;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv.includes('--root') ? resolve(process.argv[process.argv.indexOf('--root') + 1]) : PLUGIN_ROOT;
  const findings = lintDrift(root);
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  else {
    for (const f of findings) console.error(`[drift] ${f.check} ${f.file}:${f.line} ${f.message}`);
    console.log(findings.length ? `[drift] ${findings.length} finding(s)` : '[drift] OK — no drift');
  }
  process.exit(findings.length ? 1 : 0);
}
