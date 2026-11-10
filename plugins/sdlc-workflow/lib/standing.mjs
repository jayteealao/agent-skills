// Standing answers of a project: the `standing` setting of .ai/sdlc-config.json.
//
// A standing answer answers one kind of question in every workflow of the project, so the
// question is not asked again. A kind of question is a stable decision key. Only the keys of
// STANDING_KEYS qualify: each one has a closed set of options, and its answer is a preference
// of the person, not a judgement of one case. The person sets each standing answer; an agent
// never does. The workflow offers a standing answer once, after the person gave the same
// answer to the same key the last three times. A declined offer is not made again.
//
//   standing: {
//     rules:    { <key>: { answer, question, by: person, at } },
//     declined: { <key>: { at } }
//   }
//
// The setting lives in the project config because the config holds the other project-level
// choices of the person (the artifact tracking, the test profile and its budget). The decision
// store of a workflow (decisions.yaml) is per workflow, so it cannot hold a rule of the project.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { decisionsOf } from './decisions.mjs';
import { withFileLock } from './file-lock.mjs';
import { projectConfigPath, workflowsRoot } from './records-root.mjs';
import { agentFix, personFix, refuse } from './fix.mjs';

/**
 * The keys that may have a standing answer, each with the kind of its decision entry and the
 * question it stands for. Keep the list small: a key joins it only when its question repeats
 * in every workflow, has a closed set of options, and asks for a preference.
 */
export const STANDING_KEYS = Object.freeze({
  'run-decisions': { kind: 'steer', about: 'how a yolo or campaign run settles your decisions: stop and wait, or take the recommended option' },
  'ship-merge': { kind: 'answer', about: 'how ship merges the branch, and whether the branch is kept after the merge' },
  'pr-wanted': { kind: 'answer', about: 'whether a change of the small path gets a PR' },
});

/** The `by` of a decision entry that a standing answer settled. */
export const STANDING_RULE_BY = 'standing rule';

/** The number of equal answers in a row after which the workflow offers a standing answer. */
export const SUGGEST_AFTER = 3;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** An answer as it compares: the case, the "(Recommended)" mark, the spaces and the end marks aside. */
export function sameAnswerKey(answer) {
  return String(answer ?? '').toLowerCase().replace(/\(recommended\)/g, '').replace(/[\s—–-]+/g, ' ').replace(/[\s.!]+$/, '').trim();
}

function readConfig(root) {
  const file = projectConfigPath(root);
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return isMap(value) ? value : {};
  } catch { return {}; }
}

/** The standing setting of a project: { rules, declined }, each a map by key. */
export function readStanding(root) {
  const s = readConfig(root).standing;
  return { rules: isMap(s?.rules) ? s.rules : {}, declined: isMap(s?.declined) ? s.declined : {} };
}

// Read the config, change the standing setting in place, and write the config back, under the
// lock of the config. The other settings, the indent and the line endings stay.
function writeStanding(root, mutate) {
  const file = projectConfigPath(root);
  return withFileLock(file, () => {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    let cfg = {};
    if (text.trim()) {
      try { cfg = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw refuse(`${file} does not parse (${e.message}): repair it first`, agentFix('Repair the JSON of the file that the error names, then run the command again.')); }
    }
    if (!isMap(cfg)) throw refuse(`${file} is not a JSON object: repair it first`, agentFix('Repair the file that the error names so that it holds one JSON object, then run the command again.'));
    const standing = { rules: isMap(cfg.standing?.rules) ? cfg.standing.rules : {}, declined: isMap(cfg.standing?.declined) ? cfg.standing.declined : {} };
    const result = mutate(standing);
    if (!Object.keys(standing.rules).length && !Object.keys(standing.declined).length) delete cfg.standing;
    else cfg.standing = standing;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    writeFileAtomic(file, `${JSON.stringify(cfg, null, 2).replace(/\n/g, eol)}${eol}`);
    return result;
  });
}

function knownKey(key, verb) {
  if (!key) throw refuse(`standing ${verb}: <key> is required; the keys are: ${Object.keys(STANDING_KEYS).join(', ')}`, agentFix('Run the command again with one of the keys that the error lists.'));
  if (!Object.hasOwn(STANDING_KEYS, key)) {
    throw refuse(`standing ${verb}: ${key} cannot have a standing answer; the keys are: ${Object.keys(STANDING_KEYS).join(', ')}`, agentFix('Run the command again with one of the keys that the error lists.'));
  }
}

/** The live standing answer of a key, or null. */
export function standingRule(root, key) {
  if (!Object.hasOwn(STANDING_KEYS, String(key ?? ''))) return null;
  return readStanding(root).rules[key] ?? null;
}

/** The workflow folders of a project, sorted: the records clone when the project is linked. */
function workflowDirs(root) {
  const base = workflowsRoot(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => ({ slug: e.name, dir: join(base, e.name) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Every answer of the person to a key, across the workflows of the project, oldest first:
 * [{ slug, id, at, answer }]. A superseded answer counts: it was an answer when it was given.
 */
export function personAnswers(root, key) {
  const rows = [];
  for (const { slug, dir } of workflowDirs(root)) {
    let list = [];
    try { list = decisionsOf(dir); } catch { list = []; }
    for (const e of list) {
      if (e.key !== key || e.by !== 'person' || !['answer', 'steer'].includes(e.kind)) continue;
      rows.push({ slug, id: e.id, at: String(e.at ?? ''), answer: String(e.answer) });
    }
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at) || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id));
}

/**
 * The keys to offer as a standing answer now: the last three answers of the person are the
 * same, no standing answer exists, and the person did not decline the offer.
 * Each is { key, answer, from: [<slug>#<id>], offer }.
 */
export function suggestStanding(root) {
  const { rules, declined } = readStanding(root);
  const out = [];
  for (const key of Object.keys(STANDING_KEYS)) {
    if (rules[key] || declined[key]) continue;
    const last = personAnswers(root, key).slice(-SUGGEST_AFTER);
    if (last.length < SUGGEST_AFTER) continue;
    if (new Set(last.map((r) => sameAnswerKey(r.answer))).size !== 1) continue;
    const answer = last.at(-1).answer;
    out.push({ key, answer, from: last.map((r) => `${r.slug}#${r.id}`), offer: `You chose "${answer}" the last three times. Make it the standing answer?` });
  }
  return out;
}

/** Set a standing answer. Only the person sets one: `by` must be `person`, with the person's answer and the question. */
export function setStanding(root, key, { answer, question, by } = {}) {
  knownKey(key, 'set');
  if (by !== 'person') throw refuse('standing set: --by person is required; only the person sets a standing answer', personFix('Only the person sets a standing answer: ask the person whether the answer stands for every workflow.'));
  if (answer == null || !String(answer).trim()) throw refuse('standing set: --answer is required: the answer of the person, in their words', agentFix('Run standing set again with --answer, the answer of the person in their words.'));
  if (question == null || !String(question).trim()) throw refuse('standing set: --question is required: the question as the person saw it', agentFix('Run standing set again with --question, the question as the person saw it.'));
  const rule = { answer: String(answer), question: String(question), by: 'person', at: nowIso() };
  writeStanding(root, (s) => { s.rules[key] = rule; delete s.declined[key]; });
  return { key, rule };
}

/** Remember that the person declined the offer for a key: it is not offered again. */
export function declineStanding(root, key) {
  knownKey(key, 'decline');
  const at = nowIso();
  writeStanding(root, (s) => { s.declined[key] = { at }; });
  return { key, declined: { at } };
}

/** Remove the standing answer of a key and its declined offer. */
export function clearStanding(root, key) {
  knownKey(key, 'clear');
  return writeStanding(root, (s) => {
    const had = Boolean(s.rules[key] || s.declined[key]);
    delete s.rules[key];
    delete s.declined[key];
    return { key, cleared: had };
  });
}

/** The standing answers, the declined offers and the keys that may have one. */
export function listStanding(root) {
  const { rules, declined } = readStanding(root);
  return { rules, declined, keys: Object.fromEntries(Object.entries(STANDING_KEYS).map(([k, v]) => [k, v.about])) };
}

/** One line for a person: the rule, and how to clear it. */
export const standingLine = (key, rule, root = '<root>') => `${key}: "${rule.answer}" (set ${String(rule.at).slice(0, 10)}); clear it with wf.mjs standing clear ${/\s/.test(root) ? `"${root}"` : root} ${key}`;

/**
 * True when a write of .ai/sdlc-config.json changes the standing setting. The person sets it
 * through `wf.mjs standing`, so the pre-write hook refuses a file write that changes it.
 */
export function standingChanged(priorText, nextText) {
  const of = (text) => {
    if (text == null) return '{}';
    try { return JSON.stringify(JSON.parse(String(text).replace(/^﻿/, ''))?.standing ?? {}); } catch { return null; }
  };
  const before = of(priorText);
  const after = of(nextText);
  return before !== null && after !== null && before !== after;
}

/** The CLI of `wf.mjs standing`: { code, value, text }. */
export function runStanding(pos, opt) {
  const [verb, root, key] = pos;
  const verbs = ['suggest', 'check', 'set', 'list', 'clear', 'decline'];
  if (!verbs.includes(verb) || !root) throw refuse(`standing: <${verbs.join('|')}> <root> are required`, agentFix('Run the command again with one of the verbs that the error lists, then the root.'));
  switch (verb) {
    case 'suggest': {
      const rows = suggestStanding(root);
      return { code: 0, value: rows, text: rows.length ? rows.map((r) => `${r.key}: ${r.offer}`).join('\n') : 'no offer' };
    }
    case 'check': {
      knownKey(key, 'check');
      const rule = standingRule(root, key);
      return { code: rule ? 0 : 1, value: { key, rule }, text: rule ? standingLine(key, rule, root) : `no standing answer for ${key}` };
    }
    case 'set': {
      const r = setStanding(root, key, { answer: opt.answer, question: opt.question, by: opt.by });
      return { code: 0, value: r, text: `set ${standingLine(key, r.rule, root)}` };
    }
    case 'decline': {
      const r = declineStanding(root, key);
      return { code: 0, value: r, text: `declined: ${key} is not offered again` };
    }
    case 'clear': {
      const r = clearStanding(root, key);
      return { code: 0, value: r, text: r.cleared ? `cleared ${key}: the question is asked again` : `no standing answer for ${key}` };
    }
    default: {
      const l = listStanding(root);
      const lines = [
        ...Object.entries(l.rules).map(([k, r]) => standingLine(k, r, root)),
        ...Object.entries(l.declined).map(([k, d]) => `${k}: offer declined ${String(d.at).slice(0, 10)}`),
      ];
      return { code: 0, value: l, text: lines.join('\n') || `no standing answers; the keys that may have one: ${Object.keys(l.keys).join(', ')}` };
    }
  }
}
