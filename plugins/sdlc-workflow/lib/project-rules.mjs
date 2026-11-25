// The standing rules of a project: the `rules` setting of .ai/sdlc-config.json.
//
// A steer is a rule of one workflow. A rule that holds for every workflow of the project (how a
// test runs, what a design must never do) was written again as a steer of each new workflow, and
// each list grew until no agent could read it. A project rule is written once, and each brief of
// each workflow prints the rules. Only the person sets a rule.
//
//   rules: [ { key, text, at } ]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { withFileLock } from './file-lock.mjs';
import { endDecision, readDecisions } from './decisions.mjs';
import { projectConfigPath, workflowsRoot } from './records-root.mjs';
import { agentFix, refuse } from './fix.mjs';
import { STANDING_KEYS } from './standing.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const isRule = (r) => r && typeof r === 'object' && typeof r.text === 'string' && r.text.trim();

function readConfigText(root) {
  const file = projectConfigPath(root);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!text.trim()) return { file, text, cfg: {} };
  let cfg;
  try { cfg = JSON.parse(text.replace(/^﻿/, '')); } catch (e) {
    throw refuse(`${file} does not parse (${e.message}): repair it first`, agentFix('Repair the JSON of the file that the error names, then run the command again.'));
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw refuse(`${file} is not a JSON object: repair it first`, agentFix('Repair the file that the error names so that it holds one JSON object, then run the command again.'));
  return { file, text, cfg };
}

/** The live rules of a project, in the order of writing; [] when it has none or the config does not read. */
export function readRules(root) {
  try {
    const { cfg } = readConfigText(root);
    return (Array.isArray(cfg.rules) ? cfg.rules : []).filter((r) => isRule(r) && !r.ended);
  } catch { return []; }
}

/**
 * True when a write of the config changes the rules of the project. Only `wf.mjs rule` writes them,
 * on the words of the person: a rule binds every stage of every workflow.
 */
export function rulesChanged(priorText, nextText) {
  const of = (text) => {
    if (text == null) return '[]';
    try { return JSON.stringify(JSON.parse(String(text).replace(/^\uFEFF/, ''))?.rules ?? []); } catch { return null; }
  };
  const before = of(priorText);
  const after = of(nextText);
  return before !== null && after !== null && before !== after;
}

function writeRules(root, mutate) {
  const file = projectConfigPath(root);
  return withFileLock(file, () => {
    const { text, cfg } = readConfigText(root);
    const rules = (Array.isArray(cfg.rules) ? cfg.rules : []).filter(isRule);
    const result = mutate(rules);
    if (rules.length) cfg.rules = rules; else delete cfg.rules;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    writeFileAtomic(file, `${JSON.stringify(cfg, null, 2).replace(/\n/g, eol)}${eol}`);
    return result;
  });
}

const keyOf = (rules, key) => {
  if (key) return String(key).trim();
  let n = rules.length + 1;
  while (rules.some((r) => r.key === `rule-${n}`)) n += 1;
  return `rule-${n}`;
};

/** Add a rule. A rule with the same key is replaced. Returns { rule, replaced }. */
export function addRule(root, { key = null, text }, { now = nowIso() } = {}) {
  if (!String(text ?? '').trim()) throw refuse('a rule needs its text', agentFix('Run the command again with --text "<the rule, in the words of the person>".'));
  if (key && !/^[a-z0-9][a-z0-9-]{0,60}$/.test(String(key))) throw refuse(`the key ${key} is not a short name`, agentFix('Run the command again with a --key of lowercase letters, digits and dashes.'));
  return writeRules(root, (rules) => {
    const rule = { key: keyOf(rules, key), text: String(text).trim(), at: now };
    const at = rules.findIndex((r) => r.key === rule.key);
    if (at >= 0) rules[at] = rule; else rules.push(rule);
    return { rule, replaced: at >= 0 };
  });
}

/** End a rule: it leaves the config. Returns the rule that was ended. */
export function endRule(root, key, why) {
  if (!key) throw refuse('rule end: <key> is required', agentFix('Run rule list to see the keys, then run the command again with one of them.'));
  if (!String(why ?? '').trim()) throw refuse('an end needs its reason', agentFix('Run the command again with --reason "<why the rule no longer holds>".'));
  return writeRules(root, (rules) => {
    const at = rules.findIndex((r) => r.key === key);
    if (at < 0) throw refuse(`no rule ${key}`, agentFix('Run rule list to see the keys, then run the command again with one of them.'));
    return rules.splice(at, 1)[0];
  });
}

/** One line per rule, for a brief or a list. */
export const ruleLine = (r) => `[${r.key}] ${r.text}`;

// ---------------------------------------------------------------- from steers

const sameText = (s) => String(s ?? '').replace(/\(carried from[^)]*\)/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The workflow folders of a project: [{ slug, dir }]. */
function workflowDirs(root) {
  const base = workflowsRoot(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => ({ slug: e.name, dir: join(base, e.name) }));
}

/** The live steers of the person with no slice, in every workflow of the project. */
function liveSteers(root) {
  const out = [];
  for (const w of workflowDirs(root)) {
    let list = [];
    try { list = readDecisions(w.dir); } catch { continue; }
    for (const e of list) {
      // A steer whose key the run reads from the store of the workflow (run-decisions) stays there.
      // A question that the brainstorm left to the build is an answer to one named question of one packet, not a rule.
      if (e.stage === 'brainstorm' && e.key && /^The person left this to the build./.test(String(e.answer ?? ''))) continue;
      if (e.kind === 'steer' && !e['superseded-by'] && !e.scope?.slice && !Object.hasOwn(STANDING_KEYS, String(e.key ?? ''))) out.push({ ...w, id: e.id, key: e.key ?? null, text: String(e.answer ?? '') });
    }
  }
  return out;
}

/**
 * The steers that say the same thing in `min` or more workflows: each one is a rule of the
 * project that was copied into its workflows. Returns [{ key, text, workflows, entries }], the
 * most copied first.
 */
export function ruleCandidates(root, { min = 3 } = {}) {
  const groups = new Map();
  for (const s of liveSteers(root)) {
    const k = sameText(s.text);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return [...groups.values()]
    .map((g) => ({ key: g.find((s) => s.key)?.key ?? null, text: g[0].text, workflows: new Set(g.map((s) => s.slug)).size, entries: g.map((s) => ({ slug: s.slug, id: s.id })) }))
    .filter((g) => g.workflows >= min)
    .sort((a, b) => b.workflows - a.workflows);
}

/**
 * Make one steer a rule of the project, and end each live steer of any workflow that says the
 * same thing. `from` is `<slug>:<id>`. Returns { rule, ended: [{ slug, id }] }.
 */
export function adoptRule(root, { from, key = null }, { now = nowIso() } = {}) {
  const [slug, id] = String(from ?? '').split(':');
  const all = liveSteers(root);
  const src = all.find((s) => s.slug === slug && s.id === id);
  if (!src) throw refuse(`no live steer ${from}`, agentFix('Run rule candidates to see the steers, then run the command again with --from <slug>:<id> of one of them.'));
  const same = all.filter((s) => sameText(s.text) === sameText(src.text));
  const { rule } = addRule(root, { key: key ?? src.key ?? null, text: src.text.replace(/\s*\(carried from[^)]*\)/gi, '') }, { now });
  const ended = [];
  for (const s of same) {
    endDecision(s.dir, s.id, `it is the project rule ${rule.key} now`, { now });
    ended.push({ slug: s.slug, id: s.id });
  }
  return { rule, ended };
}
