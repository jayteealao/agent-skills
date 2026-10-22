// WF-DESIGN-PLAN Part II A1–A3, A5b, A8, A9 and Part III sections 7–9 — the design
// stage flow: carried decisions, the brief's viewports, the file as the source,
// the next-step wording, the floor load points, critique heuristics, directions,
// the contract sections, and the design modes.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { doesNotMatch, match, ok } from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const DESIGN = 'skills/wf/reference/design';
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');

test('A1: the carried decisions are one read-only summary, and the stage asks only the ask set', () => {
  const carried = read(`${DESIGN}/_carried.md`);
  match(carried, /Show one read-only summary/);
  match(carried, /The summary asks nothing\./);
  match(carried, /\*\*Find contradictions\.\*\*/);
  match(carried, /Keep the carried direction, or name a change/);
  match(carried, /keep, change \(free text says how\), or drop/);
  doesNotMatch(carried, /Ask about each carried decision/);
});

test('A1: the brief records viewports, and stage Step 4.1 and the boards take them from it', () => {
  match(read(`${DESIGN}/shape.md`), /\*\*Viewports\*\*/);
  match(read(`${DESIGN}/shape.md`), /^viewports: /m);
  const step4 = read(`${DESIGN}/stage.md`).split('## Step 4')[1].split('## Step 5')[0];
  match(step4, /Take the viewports from the brief's `viewports:`\. Ask the person only when the brief has none\./);
  match(read(`${DESIGN}/_boards.md`), /Run `init` with the viewports of the brief's `viewports:`/);
});

test('A2: the brief round shows the carried sketches and skips what the record answers', () => {
  const brief = read(`${DESIGN}/shape.md`);
  match(brief, /give the sketch's local path and caption in the question text/);
  match(brief, /Do not ask a question that `\.ai\/design\/direction\.md`, `DESIGN\.md`, or `PRODUCT\.md` already answers/);
});

test('A3: the stage writes the next step as "Type" and names the campaign order', () => {
  const stage = read(`${DESIGN}/stage.md`);
  match(stage, /Type `\/wf slice <slug>`/);
  match(stage, /Run `campaign\.mjs unit <key> prepared`\./);
  match(stage, /Type `\/wf campaign <board>`\./);
  match(stage, /never write that you run it/);
});

test('A5b: the tracked file is the only source; a canvas is republished from it', () => {
  const boards = read(`${DESIGN}/_boards.md`);
  match(boards, /^## The file is the source$/m);
  match(boards, /canvas-stale/);
  match(boards, /canvas\.previous\[\]/);
  match(boards, /refuses a republish to a link whose live version is newer/);
  match(boards, /\.ai\/workflows\/\*\/design\/sketches\//);
  const carried = read(`${DESIGN}/_carried.md`);
  match(carried, /The tracked sketch file is the design/);
  match(carried, /give its local path first and its canvas link second/);
  const imp = read(`${DESIGN}/import.md`);
  match(imp, /^## Import at the door$/m);
  match(imp, /`state: reference`, no file, never a board/);
  match(read(`${DESIGN}/stage.md`), /run `canvas-stale` per \[_boards\.md\]/);
});

test('A8 and A9: terminal boards and the DESIGN.md write-back at freeze', () => {
  const stage = read(`${DESIGN}/stage.md`);
  match(stage, /for each terminal surface of a flow/);
  match(stage, /write the token roles that `02c-craft\.md` settles into `DESIGN\.md` under `## Colors`/);
  match(read(`${DESIGN}/_boards.md`), /Render it with `ansi` and a named scheme/);
});

test('Release C: the floor loads at Step 4, in import and the move pass, never in Steps 1–3b', () => {
  const stage = read(`${DESIGN}/stage.md`);
  const early = stage.split('## Step 4')[0];
  doesNotMatch(early, /(?<!not )load \[_craft-floor\.md\]/i);
  match(early, /Do not load \[_craft-floor\.md\]\(_craft-floor\.md\) yet/);
  match(early, /Every direction is complete and uses the tokens of DESIGN\.md\./);
  match(stage.split('## Step 4')[1], /^Before you draw or edit UI, load \[_craft-floor\.md\]\(_craft-floor\.md\)\. Check the result against its Refuse and Verify lists\./m);
  match(stage.split('## Move pass')[1], /Load \[_craft-floor\.md\]\(_craft-floor\.md\) as a checklist/);
  match(read(`${DESIGN}/import.md`), /load \[_craft-floor\.md\]\(_craft-floor\.md\)/);
  match(read(`${DESIGN}/contract.md`), /plus the refusals in `_craft-floor\.md`/);
  for (const f of ['audit.md', 'critique.md']) match(read(`${DESIGN}/${f}`), /\[_craft-floor\.md\]\(_craft-floor\.md\)/);
});

test('Release D: critique heuristics, audit integrity, directions, and the contract sections', () => {
  const heur = read(`${DESIGN}/_heuristics.md`);
  for (const h of ["## Nielsen's ten heuristics", '## The cognitive-load check', '## Personas']) ok(heur.includes(h), `_heuristics.md has ${h}`);
  match(heur, /pbakaus\/impeccable/);
  ok(heur.split('\n').length <= 300, '_heuristics.md stays under its line cap');
  const critique = read(`${DESIGN}/critique.md`);
  match(critique, /## Design specificity verdict/);
  match(critique, /## Isolation/);
  match(critique, /## Close with questions/);
  match(critique, /squint test/);
  match(read(`${DESIGN}/audit.md`), /### 5\. Implementation integrity/);
  const stage = read(`${DESIGN}/stage.md`);
  match(stage, /^## Step 3b — Directions/m);
  match(stage, /\*\*Name the rut\.\*\*/);
  match(stage, /\*\*Add the canon\.\*\*/);
  match(stage, /After two rounds with no pick/);
  const contract = read(`${DESIGN}/contract.md`);
  match(contract, /`## Thesis`/);
  match(contract, /`## Own world`/);
  match(contract, /name the one thing a person remembers after five seconds/);
});

test('Release E: design modes per surface replace the register', () => {
  const contract = read(`${DESIGN}/contract.md`);
  match(contract, /^surface-modes:/m);
  doesNotMatch(contract, /^modes:/m);
  doesNotMatch(contract, /register: <brand\|product>/);
  match(read(`${DESIGN}/shape.md`), /List each surface with one design mode/);
  for (const f of ['stage.md', 'contract.md', 'critique.md', 'audit.md']) doesNotMatch(read(`${DESIGN}/${f}`), /\[(brand|product)\.md\]/, `${f} cites no register file`);
  match(read(`${DESIGN}/stage.md`), /\[mode-persuade\.md\]\(mode-persuade\.md\)/);
});
