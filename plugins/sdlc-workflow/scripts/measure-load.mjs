#!/usr/bin/env node
// scripts/measure-load.mjs — words the model loads per /wf key
// (WIDE-VIEW-REPAIR-PLAN §1.1 and §3.4, wave W0).
//
// Three numbers per key, because one number cannot say what is certain and
// what is optional:
//
//   core        SKILL.md + reference/<key>.md. Always in context.
//   instructed  core + every file a sentence ORDERS the model to read ("Load
//               `intake/default.md`", "Read `review/_stage.md` in full", "Apply
//               the rule in [_output-boundary.md]"), followed transitively.
//               Sibling alternatives in one directory (17 intake modes, 3 design
//               homes, 3 augmentations) are one branch: the largest counts once.
//   referenced  instructed + every "per X" / "see X" citation, followed
//               transitively. The upper bound if the model opens everything.
//
// A load verb in the SAME SENTENCE as the citation makes it an order: load,
// read, follow, apply, open, consult. "per X" and "see X" are references.
// Backticked names of OTHER key bodies ("see `verify.md`") are mentions and are
// never followed; a backticked path counts only under the key's own directory
// or when the sentence orders it. Placeholder paths (`review/<key>.md`) skip.
//
// The numbers are a measure only; no gate reads them.
//
// Usage:
//   node scripts/measure-load.mjs            # table to stdout
//   node scripts/measure-load.mjs --json

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'skills/wf/SKILL.md';
const REFERENCE = 'skills/wf/reference';

const RE_LINK = /\[[^\]]*\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g;
const RE_TICKED_PATH = /`([A-Za-z0-9_./-]+\.md)`/g;
// An order: a load verb whose object is the citation — the verb stands at most
// 60 characters before it in the same sentence with no other citation between
// ("Load `intake/default.md`", "Apply the boundary rule in [_output-boundary.md]"),
// or the citation is followed by "in full" / "verbatim". A negated verb
// ("do not load `reference/yolo.md`") is not an order.
const RE_VERB_BEFORE = /\b(load|loads|read|reads|follow|follows|apply|applies|open|opens|consult)\b[^`\[\]()]{0,60}$/i;
const RE_NEGATED = /\b(do not|don't|never|not|without)\s+(load|loads|read|reads|follow|follows|apply|applies|open|opens|consult)\b[^`\[\]()]{0,60}$/i;
const RE_AFTER = /^[^`\[\]().]{0,40}\b(in full|verbatim)\b/i;
// "Read that file first" orders the citation of the sentence before it.
const RE_ANAPHORA = /\b(read|load|apply|follow)\s+(that|this|the)\s+(file|reference|contract)\b/i;

const toPosix = (p) => p.split(sep).join('/');

export function listKeys(root = PLUGIN_ROOT) {
  const dir = join(root, REFERENCE);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'runtime-adapters.md' && statSync(join(dir, f)).isFile())
    .map((f) => f.slice(0, -3))
    .sort();
}

function sentencesOf(text) {
  const out = [];
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    const flat = para.replace(/\s+/g, ' ').trim();
    for (const s of flat.split(/(?<=[.!?])\s+(?=[A-Z`*(\[>-])/)) if (s) out.push(s);
  }
  return out;
}

/**
 * Citations of one file, each tagged `ordered` (a load verb in its sentence) or
 * not, resolved to plugin-relative posix paths. Unresolvable paths are dropped.
 */
export function citations(rel, root = PLUGIN_ROOT, { keyDir = null } = {}) {
  const text = readFileSync(join(root, rel), 'utf8');
  const resolveRaw = (raw) => {
    if (raw.includes('<') || /^https?:/.test(raw)) return null;
    const candidates = [resolve(root, dirname(rel), raw), resolve(root, REFERENCE, raw), resolve(root, raw)];
    for (const abs of candidates) {
      if (existsSync(abs) && statSync(abs).isFile()) {
        const r = toPosix(relative(root, abs));
        // Only plugin prose counts. "Read `README.md`" names the TARGET repo's
        // README, not the plugin's; a plugin-root file is never a load.
        if (r.startsWith('..') || !r.includes('/')) return null;
        if (!(r.startsWith('skills/') || r.startsWith('reference/'))) return null;
        return r;
      }
    }
    return null;
  };
  const found = new Map(); // target → ordered
  const isOrdered = (sentence, start, end) => {
    const before = sentence.slice(0, start);
    const after = sentence.slice(end);
    if (RE_NEGATED.test(before)) return false;
    return RE_VERB_BEFORE.test(before) || RE_AFTER.test(after);
  };
  let lastCitations = [];
  for (const sentence of sentencesOf(text)) {
    const here = [];
    const add = (target, ordered) => {
      if (!target || target === rel) return;
      found.set(target, Boolean(found.get(target)) || ordered);
      here.push(target);
    };
    for (const m of sentence.matchAll(RE_LINK)) {
      add(resolveRaw(m[1]), isOrdered(sentence, m.index, m.index + m[0].length));
    }
    for (const m of sentence.matchAll(RE_TICKED_PATH)) {
      const r = resolveRaw(m[1]);
      if (!r) continue;
      const ordered = isOrdered(sentence, m.index, m.index + m[0].length);
      // A backticked path outside the key's own directory is a mention unless ordered.
      if (ordered || (keyDir && r.startsWith(keyDir))) add(r, ordered);
    }
    if (here.length === 0 && RE_ANAPHORA.test(sentence) && !RE_NEGATED.test(sentence.slice(0, sentence.search(RE_ANAPHORA) + 1))) {
      for (const t of lastCitations) found.set(t, true);
    }
    if (here.length) lastCitations = here;
  }
  return [...found.entries()].map(([target, ordered]) => ({ target, ordered })).sort((a, b) => a.target.localeCompare(b.target));
}

export function wordCount(rel, root = PLUGIN_ROOT) {
  return readFileSync(join(root, rel), 'utf8').split(/\s+/).filter(Boolean).length;
}

/**
 * Collapse sibling alternatives: within one directory, `_`-prefixed files always
 * count; other files are one branch and the largest counts once.
 */
function collapseBranches(files, root, pinned = new Set()) {
  const byDir = new Map();
  for (const f of files) {
    const d = posix.dirname(f);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  const kept = [];
  const branches = [];
  for (const [dir, members] of byDir) {
    const always = members.filter((f) => pinned.has(f) || posix.basename(f).startsWith('_') || !dir.startsWith(`${REFERENCE}/`) || dir === REFERENCE || dir === posix.dirname(SKILL));
    const alternatives = members.filter((f) => !always.includes(f));
    kept.push(...always);
    // A branch already chosen by the instructed set stays chosen in the referenced set.
    const branchTaken = always.some((f) => pinned.has(f) && !posix.basename(f).startsWith('_') && dir.startsWith(`${REFERENCE}/`) && dir !== REFERENCE);
    if (branchTaken) continue;
    if (alternatives.length > 1) {
      const chosen = alternatives.map((f) => ({ f, w: wordCount(f, root) })).sort((a, b) => b.w - a.w)[0].f;
      kept.push(chosen);
      branches.push({ dir, chosen, alternatives: alternatives.length });
    } else {
      kept.push(...alternatives);
    }
  }
  return { files: [...new Set(kept)].sort(), branches };
}

function closure(seeds, root, { orderedOnly, keyDir }) {
  const seen = new Set(seeds);
  let frontier = [...seeds];
  while (frontier.length) {
    const next = [];
    for (const f of frontier) {
      // SKILL.md's dispatcher table names every key body; only its links count.
      const opts = { keyDir: f === SKILL ? null : keyDir };
      for (const c of citations(f, root, opts)) {
        if (orderedOnly && !c.ordered) continue;
        if (!seen.has(c.target)) {
          seen.add(c.target);
          next.push(c.target);
        }
      }
    }
    frontier = next;
  }
  return [...seen].sort();
}

function summarize(files, root) {
  return { files: files.length, words: files.reduce((n, f) => n + wordCount(f, root), 0), fileList: files };
}

export function measureLoad(root = PLUGIN_ROOT) {
  const keys = {};
  for (const key of listKeys(root)) {
    const body = `${REFERENCE}/${key}.md`;
    const keyDir = `${REFERENCE}/${key}/`;
    const core = [SKILL, body];
    const instructedAll = closure(core, root, { orderedOnly: true, keyDir });
    const { files: instructedFiles, branches } = collapseBranches(instructedAll, root);
    const referencedAll = closure(instructedFiles, root, { orderedOnly: false, keyDir });
    const { files: referencedFiles } = collapseBranches(referencedAll, root, new Set(instructedFiles));

    keys[key] = {
      core: summarize(core, root),
      instructed: { ...summarize(instructedFiles, root), branches, allFiles: instructedAll.length },
      referenced: summarize(referencedFiles, root),
    };
  }
  return { keys };
}

export function renderTable(result) {
  const fmt = (n) => n.toLocaleString('en-US');
  const rows = Object.entries(result.keys).sort((a, b) => b[1].instructed.words - a[1].instructed.words);
  const lines = [
    '| Key | Core files | Core words | Instructed files | Instructed words | Referenced files | Referenced words |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const [k, v] of rows) {
    lines.push(`| ${k} | ${v.core.files} | ${fmt(v.core.words)} | ${v.instructed.files} | ${fmt(v.instructed.words)} | ${v.referenced.files} | ${fmt(v.referenced.words)} |`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  // --root <dir>: measure another checkout (a `git archive HEAD` export).
  const rootArg = argv.indexOf('--root');
  const result = measureLoad(rootArg >= 0 ? resolve(argv[rootArg + 1]) : PLUGIN_ROOT);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderTable(result));
    for (const [k, v] of Object.entries(result.keys)) {
      for (const b of v.instructed.branches) console.log(`  ${k}: branch ${b.dir} → ${posix.basename(b.chosen)} (largest of ${b.alternatives})`);
    }
  }
}
