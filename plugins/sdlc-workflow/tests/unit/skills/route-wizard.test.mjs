// WF-ROUTE-WIZARD-PLAN guard tests: the Arguments column of SKILL.md is the dispatch
// grammar (D1, section 4.2), Step 0 sends every command that does not resolve to
// reference/route.md, the disk check never takes free text (D10), the router's rules
// (D2, D3, D5, D6), the plan.md gaps G1 and G2, and the tail readers of G3.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, doesNotMatch, equal, match, ok } from 'node:assert/strict';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
const REF = 'skills/wf/reference';

const skill = read('skills/wf/SKILL.md');
const route = read(`${REF}/route.md`);

const ENTRY_MODES = ['fix', 'rca', 'investigate', 'discover', 'audit', 'hotfix', 'refactor', 'update-deps', 'ideate',
  'brainstorm', 'adopt', 'optimize', 'simplify', 'task'];

/** The Arguments cell of each key row: key → the backticked alternatives. */
function grammar() {
  const out = {};
  for (const m of skill.matchAll(/^\| `([a-z-]+)` \| (.+?) \| .+ \| .+ \|$/gm)) {
    out[m[1]] = [...m[2].matchAll(/`([^`]+)`/g)].map((a) => a[1].replace(/\\\|/g, '|'));
  }
  return out;
}

// ── a matcher for the cell notation: `[ ]` optional, `a|b` a choice of adjacent atoms,
//    `text` the rest of the tokens, `<class>` one token of that class, a word itself ──

function parse(src) {
  let i = 0;
  const atoms = [];
  const atom = () => {
    if (src[i] === '[') {
      i++;
      const inner = seq(']');
      i++;
      return { opt: inner };
    }
    let w = '';
    while (i < src.length && !' |[]'.includes(src[i])) w += src[i++];
    return { word: w };
  };
  function seq(end) {
    const items = [];
    while (i < src.length && src[i] !== end) {
      if (src[i] === ' ') { i++; continue; }
      const choice = [atom()];
      while (src[i] === '|') { i++; choice.push(atom()); }
      items.push(choice.length > 1 ? { choice } : choice[0]);
    }
    return items;
  }
  atoms.push(...seq(undefined));
  return atoms;
}

/** All the token counts that `items` can consume from `toks` at `at`. */
function fits(items, toks, at, disk) {
  if (!items.length) return [at];
  const [head, ...rest] = items;
  const ends = [];
  for (const e of one(head, toks, at, disk)) ends.push(...fits(rest, toks, e, disk));
  return ends;
}

function one(node, toks, at, disk) {
  if (node.opt) return [at, ...fits(node.opt, toks, at, disk)];
  if (node.choice) return node.choice.flatMap((n) => one(n, toks, at, disk));
  const t = toks[at];
  const w = node.word;
  if (w === 'text') return t === undefined ? [] : [toks.length];
  if (t === undefined) return [];
  if (w === '<slug>') return disk.slugs.includes(t) ? [at + 1] : [];
  if (w === '<slice>') return Object.values(disk.slices).flat().includes(t) ? [at + 1] : [];
  if (w === '<branch>') return disk.branches.includes(t) ? [at + 1] : [];
  if (w === 'pr#N') return /^pr#\d+$/.test(t) ? [at + 1] : [];
  if (w === '<mode>') return ENTRY_MODES.includes(t) ? [at + 1] : [];
  // The key's reference checks these classes (Step 0 item 7).
  if (['<dimension>', '<aggregate>', '<env>', '<path>', '<run-id>'].includes(w)) return [at + 1];
  return t === w ? [at + 1] : [];
}

/** Step 0 items 3 and 7: `dispatch` when one alternative takes every token, else `route`. */
function resolveCommand(line, disk) {
  const [key, ...toks] = line.split(/\s+/).filter(Boolean);
  const g = grammar();
  if (!key || !g[key]) return 'route';
  return g[key].some((alt) => fits(parse(alt), toks, 0, disk).includes(toks.length)) ? 'dispatch' : 'route';
}

const DISK = { slugs: ['export', 'login'], slices: { export: ['api-client', 'ui'] }, branches: ['main', 'feat/login'] };

test('D1: the rows of the plan table resolve or route as the plan says (section 4.1)', () => {
  const rows = [
    ['plan export', 'dispatch'],
    ['plan export api-client use the cache', 'dispatch'],
    ['plan export the API slice first', 'route'],
    ['plan export api-clinet use the cache', 'route'],
    ['plan the migration', 'route'],
    ['plan exprot', 'route'],
    ['plan export all', 'dispatch'],
    ['implemnt export', 'route'],
    ['implement', 'route'],
    ['implement export reviews', 'dispatch'],
    // Step 0 dispatches; review.md checks the dimension and routes a miss (section 4.3 as built).
    ['review security', 'dispatch'],
    ['review sweep security', 'dispatch'],
    ['status', 'dispatch'],
    ['status export deep', 'dispatch'],
    ['status advise', 'dispatch'],
    ['status of the export', 'route'],
    ['intake the dashboard is blank', 'dispatch'],
    ['intake', 'dispatch'],
    ['the dashboard is blank', 'route'],
    ['help', 'route'],
    ['handoff pr#42', 'dispatch'],
    ['handoff feat/login', 'dispatch'],
    ['ship export rollback', 'dispatch'],
    ['probe export does search work', 'dispatch'],
    ['probe the dashboard', 'route'],
    ['probe sweep', 'dispatch'],
    ['campaign export now', 'route'],
    ['docs', 'dispatch'],
    ['docs tutorial getting started', 'dispatch'],
    ['shape export only the api part', 'dispatch'],
  ];
  for (const [line, want] of rows) equal(resolveCommand(line, DISK), want, `/wf ${line}`);
});

test('D1: every Arguments cell parses, and names only known token classes', () => {
  const known = new Set(['<slug>', '<slice>', '<branch>', '<mode>', '<dimension>', '<aggregate>', '<env>', '<path>', '<run-id>', 'pr#N', 'text']);
  const g = grammar();
  equal(Object.keys(g).length, 19);
  for (const [key, alts] of Object.entries(g)) {
    ok(alts.length > 0, `${key} has an Arguments cell`);
    for (const alt of alts) {
      const words = alt.replace(/[[\]|]/g, ' ').split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (w.startsWith('<') || w === 'pr#N' || w === 'text') ok(known.has(w), `${key}: unknown class ${w} in \`${alt}\``);
        else match(w, /^(--)?[a-z-]+$/, `${key}: ${w} is a literal word`);
      }
      ok((alt.match(/\[/g) ?? []).length === (alt.match(/]/g) ?? []).length, `${key}: brackets balance in \`${alt}\``);
    }
  }
});

test('G3: every free-text tail of the grammar has a reference that reads it', () => {
  const READERS = {
    intake: [`${REF}/intake.md`, /description/],
    shape: [`${REF}/shape.md`, /Text after the slug is a \*\*focus hint\*\*/],
    design: [`${REF}/design.md`, /\[instructions\]/],
    slice: [`${REF}/slice.md`, /Text after the slug is a \*\*focus hint\*\*/],
    plan: [`${REF}/plan.md`, /Supplemental text is \*\*planning guidance\*\*/],
    review: [`${REF}/review/_ad-hoc.md`, /the scope, target, and paths come from the ad-hoc tokens/],
    probe: [`${REF}/probe.md`, /`<target>` \(single positional\)/],
    loop: [`${REF}/goal.md`, /objective/],
    project: [`${REF}/ship-plan.md`, /`\$ARGUMENTS` to the sub-reference as its arguments/],
    docs: [`${REF}/docs.md`, /Remaining tokens become the primitive's `\$ARGUMENTS`/],
  };
  const g = grammar();
  const withTail = Object.keys(g).filter((k) => g[k].some((a) => /(^|[\s|[])text\b/.test(a)));
  deepEqual(withTail.sort(), Object.keys(READERS).sort());
  for (const [key, [file, re]] of Object.entries(READERS)) match(read(file), re, `${key}: ${file} reads the tail`);
});

test('Step 0: no arguments and a word that is not a key load route.md; Step 0.5 and the error texts are gone', () => {
  match(skill, /2\. If `\$ARGUMENTS` is empty, the reference is \[route\.md\]\(reference\/route\.md\), reason `empty`\./);
  match(skill, /3\. If the key candidate is not one of the 19 keys, the reference is `reference\/route\.md` with every token, reason `not a key`\./);
  match(skill, /When a token does not fit, or a required position is empty, the reference is `reference\/route\.md` with every token, the key included, and the reason\./);
  doesNotMatch(skill, /is not a known wf key/);
  doesNotMatch(skill, /# Step 0\.5/);
  doesNotMatch(skill, /Unknown slug `/);
  match(skill, /Skip this step while the reference is `route\.md`; the router runs it after the yes\./);
  ok(existsSync(join(PLUGIN_ROOT, REF, 'route.md')));
  ok(!/^\| `(route|help)` \|/m.test(skill), 'route and help are not keys');
});

test('D10: the disk check takes only safe tokens, in one call, and never free text', () => {
  match(skill, /all in one Bash call: `grep -P "\^<slug>\\t" \.ai\/workflows\/INDEX\.md`, a `grep` of the roster rows of `\.ai\/workflows\/<slug>\/03-slice\.md`, and `git branch --list <branch>`/);
  match(skill, /Put a token into the call only when it matches `\^\[A-Za-z0-9#\._\/-\]\+\$`; any other token is a miss\./);
  match(skill, /Never put a `text` token into a shell command\./);
  match(route, /Never put a word of the person's text into a shell command\./);
});

test('the router: targets, near matches, intake keeps its classifier (D2), and the intake skip (D5)', () => {
  for (const target of ['help (Step 4)', 'the corrected key with the same tokens', "that workflow's `next-invocation`",
    '`/wf status advise`', '`/wf status <slug>`', '`/wf probe sweep`', '`/wf intake <text>`']) {
    ok(route.includes(target), `route.md names ${target}`);
  }
  match(route, /A near match is a Levenshtein distance of 2 or less, or a substring in either direction\./);
  match(route, /Never choose an intake mode from the text\./);
  match(route, /the route is `\/wf intake <mode> <the rest of the text>`/);
  match(route, /When the only route is `\/wf intake <text>` with no mode word, ask no question\. Go to Step 6\./);
  match(route, /When the route names a mode word, or intake is one of two routes, ask the confirm question\./);
});

test('the router asks at most two questions, never runs without a yes, and writes nothing', () => {
  match(route, /Ask at most two questions before you run a route or end the run\./);
  match(route, /The router never runs a command without the person's yes\./);
  match(route, /The router never writes an artifact\./);
  match(route, /The router never creates or renames a slug\./);
  match(route, /rung 3 of the gate ladder never settles them/);
  match(route, /In a headless run, print the question with its options/);
  match(route, /When the command starts a driver \(`auto`, `yolo`, `campaign`\) or an outward act \(`handoff`, `ship`\), say so in its option\./);
});

test('the bare /wf question lists at most three open workflows, newest first', () => {
  match(route, /one option for each of the three open workflows with the newest `updated-at`, newest first/);
  match(route, /\*\*Ask a question about \/wf\*\* — only when fewer than three Continue options exist\./);
  match(route, /\*\*Show all keys\*\*/);
});

test('D3/D6: help is read-only, cites its sources, and never reads the docs site', () => {
  match(route, /Never read a file under `docs\/site\/`\./);
  match(route, /Help is read-only\. It writes nothing/);
  match(route, /Name the source file of each fact in the answer\./);
  match(route, /the first line is `wf help: <topic>`, and `Artifacts:` is `none`/);
  match(route, /"Why does the export fail" is new work/);
});

test('review and docs send a first token that does not fit to the router', () => {
  match(read(`${REF}/review.md`), /\*\*Neither a slug nor a known dimension\/sweep\*\* → load \[route\.md\]\(route\.md\)/);
  match(read(`${REF}/docs.md`), /Argument is none of the above → load \[route\.md\]\(route\.md\)/);
});

test('G1 and G2: plan.md checks the slice name and keeps the guidance text of a new plan', () => {
  const plan = read(`${REF}/plan.md`);
  match(plan, /When `03-slice\.md` exists and the second argument is neither `all` nor a slice of its roster, STOP: \*"Unknown slice `<name>` in `<slug>`\. Did you mean `<best-match>`\? Retry: `\/wf plan <slug> <best-match> <text>`"\*\./);
  match(plan, /Write no plan file\./);
  match(plan, /write it to `po-answers\.md` with `stage: plan` and `kind: guidance`, give it to every research sub-agent as a PO directive, ask no discovery question that it answers/);
});

test('the evals: unknown-key expects a route question, and the five route and help cases exist', () => {
  const unknown = JSON.parse(read('tests/evals/cases/unknown-key.json'));
  ok(unknown.assertions.some((a) => a.pattern === '/wf intake fix the list command'));
  ok(!JSON.stringify(unknown).includes('is not a known wf key'));
  for (const name of ['route-description', 'route-typo-key', 'route-slug-miss', 'help-key', 'help-task']) {
    const c = JSON.parse(read(`tests/evals/cases/${name}.json`));
    equal(c.name, name);
  }
});
