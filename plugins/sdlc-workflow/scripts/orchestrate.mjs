#!/usr/bin/env node
/**
 * scripts/orchestrate.mjs — the disk side of /wf orchestrate.
 * skills/wf/scripts/orchestrate.mjs runs this script.
 *
 * The lead agent owns the loop of a run (skills/wf/reference/orchestrate.md). This script holds
 * the state of the run and refuses each change that breaks a rule:
 *
 *   contract put <root> <slug> <file>              write the draft contract from a JSON file
 *   contract get <root> <slug>                     the contract
 *   contract design <root> <slug> <id> --checklist <file> --words <w>   the approved design of a design outcome
 *   contract approve <root> <slug> --words <w> [--one-unit yes|no --reason r] [--path full|light]
 *   change propose <root> <slug> <file> --why <w>  propose changes of the approved contract
 *   change approve|refuse <root> <slug> --words <w>
 *   path <root> <slug> up --reason <r>             move a light-path contract to the full path
 *   hold <root> <slug> <id> --question <q> [--evidence e]
 *   answer <root> <slug> <id> --words <w> [--drop]
 *   unproven <root> <slug> <id> --command <c> --output <o> --why <w>
 *   milestones <root> <slug> <file>                write the milestones from a JSON file
 *   unit <root> <slug> <file>                      add one unit from a JSON file
 *   dispatch <root> <slug> <n> --agent <id> --task <file> [--effort e] [--continue <n>]
 *   wait <root> <slug> <n>                         wait for the agent of a unit (hc wait)
 *   screen <root> <slug> <n>                       the last lines of the screen of the agent
 *   send <root> <slug> <n> --text <t>              answer a blocked agent
 *   keys <root> <slug> <n> <key>...                answer a start dialog of an agent that has not started
 *   end <root> <slug> <n> [--abandon]              end and remove the terminal of a unit
 *   result <root> <slug> <n> <file>                record the result file of a unit
 *   measure <root> <slug> [<id>]                   run the measure outcomes
 *   scenario-wrong <root> <slug> <id> --commit <c> --reason <r>
 *   state <root> <slug> [--live]                   the whole state of the run, compact
 *   roster <root> <slug> [--host h]                the agents that this machine can run
 *   agents <root> <slug> allow --ids a,b --words <w>   the agents that the person allows for this run
 *   agents <root> <slug> get                       the allowed agents
 *   holdout <root> <slug> init|path --role <r>     the folder of the hidden scenarios
 *   helpers <root> <slug>                          the terminals of the run that no unit owns
 *   evidence <root> <slug>                         write the evidence page
 *   scrub <root> <slug> <file>                     remove the secrets of a log, in place
 *   take-over <root> <slug> <source>               take a list from the campaign walk
 *   hand-back <root> <slug> start|finish           give the list back to the walk
 *
 * Every command prints one JSON object.
 */
import { isMainModule, runShell } from '../lib/proc.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFileAtomic } from '../lib/atomic-write.mjs';
import { addDecision, decisionsOf, isLive } from '../lib/decisions.mjs';
import { withFileLock } from '../lib/file-lock.mjs';
import { OPEN_STATUSES, readLedger } from '../lib/findings.mjs';
import { agentFix, failureOf, fixLines, personFix, refuse, withFix } from '../lib/fix.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { sdlcHomeDir } from '../lib/home.mjs';
import { STALE_FLOOR_MS, parseJsonLines } from '../lib/live-events.mjs';
import {
  ROLES, SCENARIO_KINDS, answerHeld, approveContract, checkDispatch, designApproved, draftContract, holdOutcome, isStanding, markUnproven,
  openProposal, packetsView, pathUp, proposeChanges, renderEvidence, runView, scrubSecrets, settleProposal, startBlock, stateAfterVerdicts,
  verdictView, voidRound, REFUSED_MODEL_RE, VERDICTS, SETS, modelEntry,
} from '../lib/orchestrate.mjs';
import { endTerminal, launch, rosterOf, screenOf, sendText, sendTurn, terminalOf, terminalsOf, waitFor, exec } from '../lib/orchestrate-runner.mjs';
import { readWorkFiles } from '../lib/packets.mjs';
import { runDir, workflowDir } from '../lib/records-root.mjs';
import { commitRecords } from '../lib/records-sync.mjs';
import { ensureRunDir } from '../lib/run-files.mjs';
import { parse, stringify } from '../lib/yaml.mjs';

/** The commands of this script, in the order of USAGE. */
export const COMMANDS = Object.freeze(['contract', 'change', 'path', 'hold', 'answer', 'unproven', 'milestones', 'unit', 'dispatch', 'wait', 'screen', 'send', 'keys', 'end', 'result', 'measure', 'scenario-wrong', 'state', 'roster', 'agents', 'holdout', 'helpers', 'evidence', 'scrub', 'take-over', 'hand-back']);
const USAGE = `Usage: orchestrate.mjs <${COMMANDS.join('|')}> <projectRoot> <slug> ...`;
const USAGE_FIX = fixLines(agentFix('Run the command again with a sub-command and the arguments that the usage line names.')).join('\n');
// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRAPPER = join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'orchestrate.mjs');
const WF_WRAPPER = join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'wf.mjs');
const TIERS_FILE = join(PLUGIN_ROOT, 'skills', 'wf', 'reference', 'orchestrate', 'tiers.json');
/** The file in the folder of a list that names the run that owns the list. The walk refuses a list that has it. */
export const OWNER_FILE = 'orchestrate-owner.json';
const MEASURE_TIMEOUT_MS = 60 * 60_000;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const str = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : []);
const posix = (p) => String(p).split('\\').join('/');
/** One command line of this script, for the fix of a failure. */
const line = (root, slug, sub, rest = '') => `node "${WRAPPER}" ${sub} "${root}" ${slug}${rest ? ` ${rest}` : ''}`;

// ---------------------------------------------------------------- the files

const odir = (root, slug) => join(workflowDir(root, slug), 'orchestrate');
const contractPath = (root, slug) => join(odir(root, slug), 'contract.yaml');
const runPath = (root, slug) => join(odir(root, slug), 'run.yaml');
const evidencePath = (root, slug) => join(odir(root, slug), 'evidence.html');
/** The task files and the result files of a run: local to this machine, never a record. */
const workDir = (root, slug) => {
  const dir = join(ensureRunDir(root, slug), 'orchestrate');
  mkdirSync(dir, { recursive: true });
  return dir;
};

function readYaml(file) {
  if (!existsSync(file)) return null;
  try { return parse(readFileSync(file, 'utf8')) ?? null; } catch (e) {
    throw refuse(`${file} does not parse: ${String(e?.message ?? e).split('\n')[0]}`, personFix(`Repair the file ${file} so that it parses. A script writes it; an edit by hand broke it.`));
  }
}
const writeYaml = (file, value) => writeFileAtomic(file, `${stringify(value)}\n`);

function readJsonFile(file, what) {
  const p = resolve(file ?? '');
  if (!file || !existsSync(p)) throw refuse(`${what}: no file ${file ?? ''}`, agentFix(`Write the ${what} as JSON to a file under the .draft folder of the workflow, then run the command again with its path.`));
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) {
    throw refuse(`${what}: ${p} is not JSON: ${String(e.message).split('\n')[0]}`, agentFix(`Correct the JSON of ${p}, then run the command again.`));
  }
}

const loadContract = (root, slug) => readYaml(contractPath(root, slug));
function needContract(root, slug, { approved = false } = {}) {
  const c = loadContract(root, slug);
  if (!c) throw refuse(`${slug} has no contract`, agentFix('Write the outcomes of the interview to a JSON file, then run contract put.', line(root, slug, 'contract put', '<file>')));
  if (approved && c.status !== 'approved') throw refuse('the contract is not approved', agentFix('Show the contract to the person in chat, then record the approval.', line(root, slug, 'contract approve', '--words "<the person\'s words>"')));
  return c;
}
const emptyRun = () => ({ schema: 'sdlc/v1', type: 'orchestrate-run', milestones: [], units: [], verdicts: [], measures: [] });
const loadRun = (root, slug) => ({ ...emptyRun(), ...(readYaml(runPath(root, slug)) ?? {}) });

/** One read-modify-write of the contract and the run, under the lock of the contract file. */
function update(root, slug, fn) {
  mkdirSync(odir(root, slug), { recursive: true });
  return withFileLock(contractPath(root, slug), () => {
    const state = { contract: loadContract(root, slug), run: loadRun(root, slug) };
    const out = fn(state);
    if (state.contract) writeYaml(contractPath(root, slug), state.contract);
    writeYaml(runPath(root, slug), state.run);
    return out;
  });
}

function headOf(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function journal(root, slug, entry) {
  try {
    const file = join(workflowDir(root, slug), '.driver-journal.jsonl');
    let seq = 1;
    try { seq = (parseJsonLines(readFileSync(file, 'utf8')).lines.at(-1)?.seq ?? 0) + 1; } catch { /* the first line */ }
    appendFileSync(file, `${JSON.stringify({ at: nowIso(), run: `orchestrate-${slug}`, seq, phase: 'Orchestrate', ...entry })}\n`);
  } catch { /* the journal is a diagnostic, not a gate */ }
}

/** The tier data: the file of the plugin, with the models that the machine file names replaced. */
export function loadTiers() {
  const base = JSON.parse(readFileSync(TIERS_FILE, 'utf8'));
  const machine = join(sdlcHomeDir(), 'orchestrate-tiers.json');
  if (!existsSync(machine)) return base;
  try {
    const over = JSON.parse(readFileSync(machine, 'utf8'));
    return { ...base, models: { ...base.models, ...(over.models ?? {}) }, from: machine };
  } catch (e) {
    throw refuse(`${machine} is not JSON: ${String(e.message).split('\n')[0]}`, personFix(`Correct the JSON of ${machine}, or delete the file to use the tier data of the plugin.`));
  }
}

// ---------------------------------------------------------------- the holdout

/** The folder of the hidden scenarios of a run: under the machine folder of the plugin, outside the repo and the records. */
export function holdoutDir(root, slug) {
  const key = `${basename(resolve(root)).replace(/[^A-Za-z0-9._-]/g, '-')}-${createHash('sha1').update(posix(resolve(root)).toLowerCase()).digest('hex').slice(0, 8)}`;
  return join(sdlcHomeDir(), 'holdout', key, slug);
}
const mentionsHoldout = (text, root, slug) => posix(text).toLowerCase().includes(posix(holdoutDir(root, slug)).toLowerCase());

function holdoutCmd(root, slug, [action], f) {
  const c = needContract(root, slug, { approved: true });
  if (c.path === 'light') throw refuse('a light-path contract has no holdout', agentFix('Run the one validator of each outcome with no scenario. When the work is larger than one unit, move the contract up first.', line(root, slug, 'path', 'up --reason "<why>"')));
  const dir = holdoutDir(root, slug);
  if (action === 'init') {
    for (const set of ['working', 'reserve']) mkdirSync(join(dir, set), { recursive: true });
    return { ok: true, made: true, sets: ['working', 'reserve'], note: 'The path is given only by holdout path, to a role that may read the holdout.' };
  }
  if (action === 'path') {
    const role = str(f.role);
    if (!ROLES[role]?.holdout) throw refuse(`the role ${role || '(none)'} does not get the path of the holdout`, agentFix('Only the scenario agent and the product validator read the holdout. Write the task of any other role with no scenario in it.'));
    return { ok: true, role, path: posix(dir), working: posix(join(dir, 'working')), reserve: posix(join(dir, 'reserve')) };
  }
  return null;
}

// ---------------------------------------------------------------- the contract

function contractCmd(root, slug, [action, a], f) {
  if (action === 'get') {
    const c = loadContract(root, slug);
    return c ? { ok: true, contract: c } : { ok: false, error: `${slug} has no contract`, fix: agentFix('Write the outcomes of the interview to a JSON file, then run contract put.', line(root, slug, 'contract put', '<file>')) };
  }
  if (action === 'put') {
    const input = readJsonFile(a, 'contract');
    return update(root, slug, (s) => {
      if (s.contract?.status === 'approved') throw refuse('the contract is approved: no agent edits an approved outcome', agentFix('Propose the change, and let the person approve it.', line(root, slug, 'change propose', '<file> --why "<why>"')));
      const source = input.source ?? { kind: 'instruction' };
      const outcomes = list(input.outcomes).map((o) => ({ ...o }));
      // An outcome is passed at the start only when it comes from a done work packet of the list.
      if (outcomes.some((o) => o.state === 'passed')) {
        const done = new Set(source.kind === 'list' && source.slug ? readPackets(root, source.slug).packets.filter((p) => p.state === 'done').map((p) => p.key) : []);
        const bad = outcomes.filter((o) => o.state === 'passed' && !done.has(str(o.packet)));
        if (bad.length) throw refuse(`${bad.map((o) => o.id).join(', ')}: an outcome starts as passed only when its packet is a done work packet of the list`, agentFix('Leave state out of each outcome that the error names, then run contract put again.'));
      }
      const draft = draftContract({ slug, source, outcomes, commands: input.commands ?? {}, now: nowIso() });
      draft.outcomes = draft.outcomes.map((o) => (o.state === 'passed' ? { ...o, 'passed-by': 'walk' } : o));
      // A design approval survives a new put of the same outcome.
      for (const o of draft.outcomes) {
        const old = s.contract?.outcomes?.find((x) => x.id === o.id);
        if (o.kind === 'design' && old?.proof?.['design-approved'] && old.proof.record === o.proof.record) o.proof = { ...o.proof, checklist: old.proof.checklist, 'design-approved': true, 'design-words': old.proof['design-words'] };
      }
      s.contract = draft;
      return { ok: true, status: 'draft', outcomes: draft.outcomes.length, design: draft.outcomes.filter((o) => o.kind === 'design' && !o.proof['design-approved']).map((o) => o.id), next: 'Run the design phase for each outcome of `design`, then show the contract to the person and record the approval.' };
    });
  }
  if (action === 'design') {
    const checklist = readJsonFile(f.checklist, 'match checklist');
    return update(root, slug, (s) => {
      if (!s.contract) throw refuse(`${slug} has no contract`, agentFix('Run contract put first.'));
      if (s.contract.status === 'approved') throw refuse('the contract is approved: a design changes through a contract change', agentFix('Propose a rewrite of the design outcome.', line(root, slug, 'change propose', '<file> --why "<why>"')));
      s.contract = designApproved(s.contract, a, { checklist: list(checklist.checklist ?? checklist), words: f.words });
      return { ok: true, id: a, 'design-approved': true };
    });
  }
  if (action === 'approve') {
    const oneUnit = f['one-unit'] == null ? null : /^(yes|true)$/i.test(str(f['one-unit']));
    const out = update(root, slug, (s) => {
      if (!s.contract) throw refuse(`${slug} has no contract`, agentFix('Run contract put first.'));
      s.contract = approveContract(s.contract, { words: f.words, oneUnit, oneUnitReason: f.reason, choice: f.path ?? null, now: nowIso() });
      return { ok: true, status: 'approved', path: s.contract.path, why: s.contract['path-why'], outcomes: s.contract.outcomes.length, standing: s.contract.outcomes.filter(isStanding).map((o) => o.id) };
    });
    addDecision(workflowDir(root, slug), { kind: 'approval', key: 'orchestrate-contract', by: 'person', question: 'Approve the vision contract of this run?', answer: str(f.words), stage: 'orchestrate' });
    return out;
  }
  return null;
}

function changeCmd(root, slug, [action, a], f) {
  if (action === 'propose') {
    const input = readJsonFile(a, 'changes');
    return update(root, slug, (s) => {
      if (!s.contract) throw refuse(`${slug} has no contract`, agentFix('Run contract put first.'));
      if (openProposal(s.contract)) throw refuse('the contract has an open proposal already', agentFix('Ask the person about the open proposal first, then record the answer.', line(root, slug, 'change approve', '--words "<the person\'s words>"')));
      s.contract = proposeChanges(s.contract, list(input.changes ?? input), { why: f.why, now: nowIso() });
      if (input['list-revision'] != null) s.contract['pending-list-revision'] = input['list-revision'];
      const p = openProposal(s.contract);
      return { ok: true, proposal: p.n, changes: p.changes.length, ask: 'Show these changes to the person in chat as one numbered list, and ask one question. Until the person answers, the contract stays as it is.' };
    });
  }
  if (action === 'approve' || action === 'refuse') {
    const accept = action === 'approve';
    const out = update(root, slug, (s) => {
      if (!s.contract) throw refuse(`${slug} has no contract`, agentFix('Run contract put first.'));
      const before = s.contract.path;
      s.contract = settleProposal(s.contract, { accept, words: f.words, now: nowIso() });
      if (accept && s.contract['pending-list-revision'] != null) s.contract.source = { ...s.contract.source, 'list-revision': s.contract['pending-list-revision'] };
      delete s.contract['pending-list-revision'];
      const rewritten = s.contract.outcomes.filter((o) => o.state === 'open' && o.rewritten).map((o) => o.id);
      return { ok: true, accepted: accept, revision: s.contract.revision, path: s.contract.path, ...(before !== s.contract.path ? { moved: 'the contract moved to the full path' } : {}), ...(accept ? { holdout: 'The scenario agent writes scenarios for each new or rewritten outcome, and retires the scenarios of each dropped outcome.', rewritten } : {}) };
    });
    addDecision(workflowDir(root, slug), { kind: 'approval', key: `orchestrate-change-${out.revision}-${accept ? 'approved' : 'refused'}`, by: 'person', question: 'Approve the proposed changes of the vision contract?', answer: str(f.words), stage: 'orchestrate' });
    return out;
  }
  return null;
}

function pathCmd(root, slug, [action], f) {
  if (action !== 'up') return null;
  return update(root, slug, (s) => {
    needApproved(s, root, slug);
    s.contract = pathUp(s.contract, { reason: f.reason });
    return { ok: true, path: s.contract.path, next: 'Tell the person in one chat line. Then start the scenario agent and write the milestones.' };
  });
}

function needApproved(s, root, slug) {
  if (!s.contract || s.contract.status !== 'approved') throw refuse('the contract is not approved', agentFix('Show the contract to the person in chat, then record the approval.', line(root, slug, 'contract approve', '--words "<the person\'s words>"')));
}

function holdCmd(root, slug, [id], f) {
  return update(root, slug, (s) => {
    needApproved(s, root, slug);
    s.contract = holdOutcome(s.contract, id, { question: f.question, evidence: f.evidence, now: nowIso() });
    return { ok: true, id, state: 'held', next: `Publish the question for the person: ${heldCommand(root, slug, id, f.question)}. Go on with each outcome that does not depend on this one.` };
  });
}
const heldCommand = (root, slug, id, question) => `node "${WF_WRAPPER}" decide hold "${root}" ${slug} --key ${id} --question "${str(question).replace(/"/g, '\\"')}" --stage orchestrate`;

function answerCmd(root, slug, [id], f) {
  const out = update(root, slug, (s) => {
    needApproved(s, root, slug);
    s.contract = answerHeld(s.contract, id, { words: f.words, drop: Boolean(f.drop), now: nowIso() });
    return { ok: true, id, state: s.contract.outcomes.find((o) => o.id === id).state };
  });
  addDecision(workflowDir(root, slug), { kind: 'answer', key: id, by: 'person', question: `The held outcome ${id}`, answer: str(f.words), stage: 'orchestrate' });
  return out;
}

function unprovenCmd(root, slug, [id], f) {
  return update(root, slug, (s) => {
    needApproved(s, root, slug);
    s.contract = markUnproven(s.contract, id, { command: f.command, output: f.output, why: f.why, now: nowIso() });
    return { ok: true, id, state: 'unproven', next: `Record it as a runtime-evidence deferral of the workflow, so that ship waits for the person: node "${WF_WRAPPER}" record set "${root}" ${slug} index 'runtime-evidence-deferrals+={ac: ${id}, reason: "${str(f.why).replace(/"/g, '\\"')}"}'` };
  });
}

// ---------------------------------------------------------------- milestones and units

function milestonesCmd(root, slug, [file]) {
  const input = readJsonFile(file, 'milestones');
  return update(root, slug, (s) => {
    needApproved(s, root, slug);
    if (s.contract.path === 'light') throw refuse('a light-path contract has no milestones', agentFix('Add the one unit of the contract with unit.', line(root, slug, 'unit', '<file>')));
    const ids = new Set(s.contract.outcomes.map((o) => o.id));
    const ms = list(input.milestones ?? input).map((m) => ({ key: str(m.key), title: str(m.title), outcomes: list(m.outcomes).map(str) }));
    const errors = [];
    for (const m of ms) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(m.key)) errors.push(`a milestone has the key "${m.key}": a key is lower-case letters, digits and hyphens`);
      for (const id of m.outcomes) if (!ids.has(id)) errors.push(`${m.key}: ${id} is not an outcome of the contract`);
    }
    const placed = ms.flatMap((m) => m.outcomes);
    const missing = s.contract.outcomes.filter((o) => !isStanding(o) && o.state !== 'dropped' && !placed.includes(o.id)).map((o) => o.id);
    if (missing.length) errors.push(`no milestone holds ${missing.join(', ')}`);
    if (errors.length) throw refuse(`the milestones have ${errors.length} error(s):\n${errors.join('\n')}`, agentFix('Correct the milestones file, then run milestones again.'));
    s.run.milestones = ms;
    return { ok: true, milestones: ms.map((m) => m.key), next: 'Write the units of the first milestone only. Write the units of a later milestone when it starts.' };
  });
}

function unitCmd(root, slug, [file]) {
  const input = readJsonFile(file, 'unit');
  return update(root, slug, (s) => {
    const role = str(input.role);
    if (!ROLES[role]) throw refuse(`${role || '(no role)'} is not a role: the roles are ${Object.keys(ROLES).join(', ')}`, agentFix('Correct role in the unit file, then run unit again.'));
    // The design phase runs before the approval; every other unit needs the approved contract.
    if (role !== 'design') needApproved(s, root, slug);
    else if (!s.contract) throw refuse(`${slug} has no contract`, agentFix('Run contract put first.'));
    const ids = new Set(s.contract.outcomes.map((o) => o.id));
    const serves = list(input.serves).map(str);
    const bad = serves.filter((id) => !ids.has(id));
    if (bad.length) throw refuse(`the unit serves ${bad.join(', ')}, which the contract does not hold`, agentFix('Correct serves in the unit file, then run unit again.'));
    if (ROLES[role].builds && !serves.length && !input.harness) throw refuse('a unit of a builder serves at least one outcome, or is a harness unit', agentFix('Name the outcomes in serves, or set harness to true for a unit that builds the means to run and observe the product.'));
    if (s.contract.path === 'light' && role === 'scenario') throw refuse('a light-path contract has no scenario agent', agentFix('Run the one validator of each outcome with no scenario.'));
    if (s.contract['hand-back']) {
      const untouched = new Set(packetsView(s.contract, s.run.units).filter((p) => p.state === 'untouched').map((p) => p.packet));
      const hit = s.contract.outcomes.filter((o) => serves.includes(o.id) && untouched.has(o.packet)).map((o) => o.id);
      if (hit.length && ROLES[role].builds) throw refuse(`a hand-back is in progress: ${hit.join(', ')} belongs to a work packet that is not started, and nothing new starts`, agentFix('Write units only for the work packets that are started: state lists them.', line(root, slug, 'state')));
    }
    const fixOf = input['fix-of'] == null ? null : Number(input['fix-of']);
    const n = s.run.units.reduce((m, u) => Math.max(m, u.n), 0) + 1;
    s.run.units.push({
      n, role, title: str(input.title), milestone: str(input.milestone) || null, serves, files: list(input.files).map(posix),
      ...(input.harness ? { harness: true } : {}), ...(fixOf ? { 'fix-of': fixOf } : {}), state: 'planned', 'added-at': nowIso(),
    });
    return { ok: true, unit: n, role, dirs: { task: posix(join(workDir(root, slug), `task-${n}.md`)), result: posix(join(workDir(root, slug), `result-${n}.json`)) } };
  });
}

const unitOf = (run, n) => {
  const u = run.units.find((x) => x.n === Number(n));
  if (!u) throw refuse(`${n} is not a unit of the run`, agentFix('Name a unit by its number: state lists the units.'));
  return u;
};

function dispatchCmd(root, slug, [n], f) {
  const taskFile = resolve(str(f.task));
  if (!f.task || !existsSync(taskFile)) throw refuse(`dispatch: no task file ${f.task ?? ''}`, agentFix('Write the task of the unit to its task file, then run dispatch again with --task.'));
  const tiers = loadTiers();
  const roster = rosterOf(tiers, { host: f.host ?? null });
  const agent = roster.agents.find((a) => a.id === str(f.agent));
  // The model rule is checked first, so a model outside the roster is refused by its own reason.
  const modelName = agent?.model ?? str(f.agent).split(':').slice(1).join(':');
  const plan = update(root, slug, (s) => {
    const u = unitOf(s.run, n);
    if (u.role !== 'design') needApproved(s, root, slug);
    if (u.state === 'running') throw refuse(`the unit ${u.n} has a live agent`, agentFix('Wait for it. Never start a second agent for one unit.', line(root, slug, 'wait', String(u.n))));
    const model = checkDispatch(tiers, { role: u.role, model: modelName });
    if (!agent) throw refuse(`${f.agent || '(no agent)'} is not an agent of the roster of this machine`, agentFix('Pick an agent id that roster lists.', line(root, slug, 'roster')));
    if (!s.run.agents) throw refuse('the person has not said which agents this run may use', agentFix('Show the roster to the person and ask which agents the run may use, with the host question tool. Then record the answer.', line(root, slug, 'agents allow', '--ids <id,id> --words "<the person\'s words>"')));
    if (!s.run.agents.allowed.includes(agent.id)) throw refuse(`${agent.id} is not an agent that the person allowed for this run: ${s.run.agents.allowed.join(', ')}`, agentFix('Pick an allowed agent. To use another one, ask the person, and record the new answer with agents allow.'));
    const text = readFileSync(taskFile, 'utf8');
    if (mentionsHoldout(text, root, slug) && !ROLES[u.role].holdout) throw refuse(`the task of a ${u.role} names the folder of the hidden scenarios`, agentFix('Remove the path of the holdout and every step of a scenario from the task. A fix unit is written from the outcome and from what the validator observed.'));
    const block = startBlock(s.run.units, u);
    if (block) throw refuse(`the unit ${u.n} cannot start now: ${block}`, agentFix('Wait for the unit that the error names, then run dispatch again.'));
    let cont = null;
    if (f.continue != null) {
      cont = unitOf(s.run, f.continue);
      if (ROLES[u.role].validator || ROLES[u.role].judge) throw refuse('a validator or a scenario agent always gets a fresh agent', agentFix('Run dispatch again with no --continue.'));
      if (!ROLES[cont.role].builds || !cont.agent?.terminal) throw refuse(`the unit ${cont.n} has no live builder to continue`, agentFix('Run dispatch again with no --continue: the unit gets a fresh agent.'));
    }
    Object.assign(u, { state: 'running', 'started-at': nowIso(), agent: { id: agent.id, program: agent.program, model: model.model, tier: model.tier, vendor: model.vendor, launch: agent.launch, ...(cont ? { terminal: cont.agent.terminal, continues: cont.n } : {}) }, task: posix(taskFile) });
    return { n: u.n, role: u.role, model, cont };
  });
  journal(root, slug, { event: 'agent-start', agent: `${plan.role}:${plan.n}`, stage: plan.role, model: plan.model.model });
  const resultFile = posix(join(workDir(root, slug), `result-${plan.n}.json`));
  if (agent.launch === 'host-subagent') {
    return { ok: true, unit: plan.n, launch: 'host-subagent', model: agent.alias ?? plan.model.model, do: `Start one subagent of your host on the model ${agent.alias ?? plan.model.model}, with this prompt: "Read the file ${posix(taskFile)} now and do exactly what it says. It is your whole task." It writes ${resultFile}.`, then: line(root, slug, 'result', `${plan.n} "${resultFile}"`) };
  }
  let launched;
  try {
    launched = plan.cont
      ? { launch: 'hc', ...sendTurn(plan.cont.agent.terminal, posix(taskFile)) }
      : launch({ hc: roster.hc, slug, role: plan.role, n: plan.n, cwd: root, program: agent.program, model: agent['run-as'] ?? plan.model.model, provider: agent.provider, effort: str(f.effort) || 'high', taskFile: posix(taskFile), dirs: ROLES[plan.role].holdout ? [posix(holdoutDir(root, slug))] : [] });
  } catch (e) {
    update(root, slug, (s) => { Object.assign(unitOf(s.run, plan.n), { state: 'planned', agent: null }); });
    throw e;
  }
  if (launched.terminal) update(root, slug, (s) => { unitOf(s.run, plan.n).agent.terminal = launched.terminal; });
  if (launched.launch === 'direct') return { ok: true, unit: plan.n, ...launched, then: line(root, slug, 'result', `${plan.n} "${resultFile}"`) };
  return { ok: true, unit: plan.n, ...launched, then: line(root, slug, 'wait', String(plan.n)), note: 'The agent works in a terminal that outlives this session. Do other work that does not depend on it, then wait.' };
}

function terminalOfUnit(root, slug, n) {
  const u = unitOf(loadRun(root, slug), n);
  if (!u.agent?.terminal) throw refuse(`the unit ${u.n} has no terminal`, agentFix('A host subagent and a direct launch have no terminal: read the result file of the unit.', line(root, slug, 'result', `${u.n} <file>`)));
  return { u, name: u.agent.terminal };
}

function waitCmd(root, slug, [n], f) {
  const { u, name } = terminalOfUnit(root, slug, n);
  const w = waitFor(name, { seconds: Number(f.timeout) || undefined });
  const resultFile = posix(join(workDir(root, slug), `result-${u.n}.json`));
  const has = existsSync(resultFile);
  if (w.status === 'blocked') {
    return { ok: true, unit: u.n, status: 'blocked', screen: scrubSecrets(screenOf(name)).text, do: 'The agent asks a person. Read the screen. A plain question that the contract or the decision store answers: answer it with send, and record the answer with --by delegate. A permission prompt: never pass it; end the agent with --abandon, and the unit fails. A question about the contract: hold the outcome.' };
  }
  // Some agent programs report no status at all, and an idle agent can show no counted turn:
  // for those, the result file says that the agent is done.
  if ((w.status === 'starting' || w.idle) && has) return { ok: true, unit: u.n, status: 'done', result: resultFile, then: line(root, slug, 'result', `${u.n} "${resultFile}"`) };
  if (w.status === 'starting') {
    return { ok: true, unit: u.n, status: 'starting', screen: scrubSecrets(screenOf(name)).text, do: 'The agent reports no status: it has not started its task, or its program reports none. Read the screen. When the agent works, wait again. A start dialog of the program about this checkout (trust this folder, an update notice) is answered with keys: read which option is selected first, since the first option can be the one that exits (then the keys are: down enter). Any other dialog: end the agent with --abandon, and the unit fails. With no dialog on the screen, wait again.', then: line(root, slug, 'keys', `${u.n} <the keys>`) };
  }
  if (['done', 'idle', 'exited', 'gone'].includes(w.status) && has) return { ok: true, unit: u.n, status: w.status, result: resultFile, then: line(root, slug, 'result', `${u.n} "${resultFile}"`) };
  if (['exited', 'gone', 'error'].includes(w.status)) return { ok: true, unit: u.n, status: w.status, result: null, screen: w.status === 'gone' ? '' : scrubSecrets(screenOf(name)).text, do: 'The agent ended with no result file. Read the screen. On a usage limit, give the unit to an agent of the same tier from another vendor, or wait for the reset. Else the unit failed: record it with result and no file.' };
  if (['done', 'idle'].includes(w.status)) return { ok: true, unit: u.n, status: w.status, result: null, do: 'The agent stopped with no result file. Read its screen, then send it one line that asks for the result file.', then: line(root, slug, 'screen', String(u.n)) };
  return { ok: true, unit: u.n, status: 'working', ...(w.note ? { note: w.note } : {}), do: 'The agent still works. This is a check-in, not a failure. Wait again.', then: line(root, slug, 'wait', String(u.n)) };
}

function screenCmd(root, slug, [n]) {
  const { u, name } = terminalOfUnit(root, slug, n);
  return { ok: true, unit: u.n, terminal: name, state: terminalOf(name), screen: scrubSecrets(screenOf(name)).text };
}

function sendCmd(root, slug, [n], f) {
  const { u, name } = terminalOfUnit(root, slug, n);
  if (!str(f.text)) throw refuse('send needs --text', agentFix('Run send again with the answer in --text.'));
  const r = sendText(name, str(f.text));
  return { ok: true, unit: u.n, ...r, then: line(root, slug, 'wait', String(u.n)) };
}

/**
 * Press keys in the terminal of an agent that has not started: the answer to a start dialog.
 * Refused once the agent runs, so it is never the way past a permission prompt.
 */
function keysCmd(root, slug, [n, ...keys]) {
  const { u, name } = terminalOfUnit(root, slug, n);
  if (!keys.length) throw refuse('keys needs at least one key name', agentFix('Run keys again with the key names, for example: enter, or: down enter.'));
  const t = terminalOf(name);
  if (!t) throw refuse(`the terminal of the unit ${u.n} is gone`, agentFix('Record the unit as failed: run result with no file.', line(root, slug, 'result', String(u.n))));
  if (t.status != null) throw refuse(`the agent of the unit ${u.n} has started (${t.status}): keys answers a start dialog only`, agentFix('Answer a plain question of a blocked agent with send. Never pass a permission prompt: end the agent, and the unit fails.', line(root, slug, 'wait', String(u.n))));
  const r = exec('hc', ['keys', name, ...keys, '--json'], { timeoutMs: 30_000 });
  if (r.status !== 0) throw refuse(`hc keys did not reach the unit ${u.n}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`, agentFix('Read the screen of the unit, then decide again.', line(root, slug, 'screen', String(u.n))));
  return { ok: true, unit: u.n, pressed: keys, then: line(root, slug, 'wait', String(u.n)) };
}

function endCmd(root, slug, [n], f = {}) {
  const { u, name } = terminalOfUnit(root, slug, n);
  // The agent of a unit with no result is not ended by mistake. The result file is the test,
  // not the status: an agent that is idle before its first turn has not started yet.
  if (u.state === 'running' && !f.abandon && !existsSync(join(workDir(root, slug), `result-${u.n}.json`))) {
    throw refuse(`the unit ${u.n} has no result file yet`, agentFix('Wait for the agent. To give the unit up, run end again with --abandon, and then record the unit as failed with result and no file.', line(root, slug, 'wait', String(u.n))));
  }
  const r = endTerminal(slug, name);
  return { ok: true, unit: u.n, ...r };
}

// ---------------------------------------------------------------- results

function recordVerdicts(s, entries, { head, unit = null, now }) {
  for (const v of entries) {
    const o = s.contract.outcomes.find((x) => x.id === v.outcome);
    s.run.verdicts.push({ ...v, unit, commit: head, at: now, epoch: (o['rounds-reset'] ?? 0) + (o.rewritten ?? 0) });
  }
  const touched = new Set(entries.map((v) => v.outcome));
  s.contract.outcomes = s.contract.outcomes.map((o) => (touched.has(o.id) ? stateAfterVerdicts(o, s.run.verdicts, { head, now }) : o));
  return s.contract.outcomes.filter((o) => touched.has(o.id)).map((o) => {
    const view = verdictView(o, s.run.verdicts);
    return { id: o.id, state: o.state, rounds: view.rounds, ...(view.last && !view.last.decision ? { need: view.last.need } : {}), ...(view.flaky ? { flaky: true } : {}), ...(o.state === 'held' ? { question: o.held.question } : {}) };
  });
}

/**
 * Commit the files of one unit, by path. Some agent programs may not write to .git, so their
 * builder leaves its change in the working tree and lists the files. Only the listed paths are
 * staged: a commit of one unit never takes the work of another.
 */
function commitUnit(root, files, message) {
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', windowsHide: true });
  const paths = files.map(posix).filter(Boolean);
  const changed = git('status', '--porcelain', '--', ...paths).stdout.trim();
  if (!changed) return null;
  const add = git('add', '--', ...paths);
  const commit = add.status === 0 ? git('commit', '-m', message, '--', ...paths) : add;
  if (commit.status !== 0) {
    throw refuse(`the files of the unit could not be committed: ${(commit.stderr || commit.stdout).trim().split('\n')[0]}`, agentFix('Read the git error and remove its cause. Then run result again. Never stage with a sweep.'));
  }
  return headOf(root);
}

function resultCmd(root, slug, [n, file]) {
  const out = update(root, slug, (s) => {
    const head = headOf(root);
    const u = unitOf(s.run, n);
    const role = ROLES[u.role];
    const now = nowIso();
    if (!file) {
      Object.assign(u, { state: 'failed', 'ended-at': now, result: { status: 'failed', why: 'no result file' } });
      // A builder that failed can leave a change in the working tree: the next builder must not get it unseen.
      const paths = list(u.files).map(posix).filter(Boolean);
      const dirty = role.builds && paths.length ? spawnSync('git', ['-C', root, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8', windowsHide: true }).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3)) : [];
      return {
        ok: true, unit: u.n, state: 'failed', next: 'Write a new unit for the same work, for another agent.',
        ...(dirty.length ? { uncommitted: dirty, do: 'The failed agent left changes in these files. Read the diff. Keep it for the next unit and say so in its task, or restore each file with git restore. Never leave it unseen.' } : {}),
      };
    }
    const r = readJsonFile(file, 'result');
    const errors = [];
    if (role.validator && u.role !== 'code-validator') {
      if (!list(r.verdicts).length) errors.push('a validator result has verdicts: a list of { outcome, verdict, set, observed, evidence }');
      const ids = new Set(s.contract.outcomes.map((o) => o.id));
      for (const v of list(r.verdicts)) {
        if (!ids.has(str(v.outcome))) errors.push(`${v.outcome}: not an outcome of the contract`);
        if (!VERDICTS.includes(v.verdict)) errors.push(`${v.outcome}: verdict is pass or fail`);
        if (!str(v.observed)) errors.push(`${v.outcome}: observed is empty; say what was observed, in general words`);
        if (v.set != null && !SETS.includes(v.set)) errors.push(`${v.outcome}: set is working, reserve or none`);
      }
      // A unit never validates its own work: a validator unit that built something is refused at dispatch,
      // and here a verdict by the terminal of a builder of the same outcome is refused.
      const builders = new Set(s.run.units.filter((x) => ROLES[x.role].builds && x.agent?.terminal).map((x) => x.agent.terminal));
      if (u.agent?.terminal && builders.has(u.agent.terminal)) errors.push('this agent also built: an agent never validates its own work');
    } else if (u.role === 'code-validator') {
      if (!Array.isArray(r.findings)) errors.push('a code validator result has findings: a list of { key, dimension, severity, file, issue, fix, rule }');
    } else if (role.builds) {
      if (!['done', 'blocked'].includes(r.status)) errors.push('a builder result has status: done or blocked');
      if (!str(r.did)) errors.push('a builder result says what it did, in did');
      if (!Array.isArray(r.commands)) errors.push('a builder result lists the commands that it ran, each with its exit code, in commands');
    }
    if (errors.length) throw refuse(`the result of the unit ${u.n} has ${errors.length} error(s):\n${errors.join('\n')}`, agentFix('Ask the agent of the unit for a correct result file, or correct the file from what the agent reported, then run result again.'));
    let commits = list(r.commits).map(str);
    let committed = null;
    if (role.builds && r.status === 'done' && !commits.length && list(r.files).length) {
      committed = commitUnit(root, list(r.files), str(r['commit-message']) || u.title || `unit ${u.n}`);
      if (committed) commits = [committed];
    }
    Object.assign(u, { state: r.status === 'blocked' ? 'failed' : 'done', 'ended-at': now, commits, result: { status: r.status ?? 'done', did: str(r.did), left: str(r.left), found: list(r.found), commands: list(r.commands) } });
    const answer = { ok: true, unit: u.n, role: u.role, state: u.state, ...(committed ? { committed, note: 'The builder left its change uncommitted, and the script committed the files that it listed.' } : {}) };
    if (role.validator && u.role !== 'code-validator') {
      if (!head) throw refuse('the checkout has no commit: a verdict is recorded for a commit', personFix('Make the first commit of the repo, then run the validation again.'));
      const entries = list(r.verdicts).map((v) => ({ outcome: str(v.outcome), verdict: v.verdict, set: v.set ?? 'none', observed: scrubSecrets(str(v.observed)).text, evidence: list(v.evidence).map(posix) }));
      answer.outcomes = recordVerdicts(s, entries, { head, unit: u.n, now });
    }
    if (u.role === 'code-validator') {
      const found = list(r.findings);
      const rules = found.filter((x) => x.rule === true);
      const stand = s.contract.outcomes.find((o) => o.id === 'OUT-STAND-RULES' && o.kind === 'behaviour');
      if (stand && head) answer.outcomes = recordVerdicts(s, [{ outcome: stand.id, verdict: rules.length ? 'fail' : 'pass', ...(rules.length ? { confirmed: true } : {}), set: 'none', observed: rules.length ? `${rules.length} breach(es) of a written project rule: ${rules.map((x) => x.key).join(', ')}` : 'no breach of a written project rule in the diff', evidence: [] }], { head, unit: u.n, now });
      if (found.length) {
        const ff = join(workflowDir(root, slug), '.draft', `found-${u.n}.json`);
        mkdirSync(join(workflowDir(root, slug), '.draft'), { recursive: true });
        writeFileSync(ff, `${JSON.stringify({ findings: found.map(({ rule, ...x }) => x) }, null, 2)}\n`);
        const dims = [...new Set(found.map((x) => str(x.dimension)).filter(Boolean))];
        answer.findings = { count: found.length, command: `node "${WF_WRAPPER}" findings add "${root}" ${slug} "${posix(ff)}" --source review --dimensions ${dims.join(',')}` };
      }
    }
    return answer;
  });
  const u = unitOf(loadRun(root, slug), n);
  // A task file is deleted when its agent ends: the task of a validator names the holdout.
  if (u.task) rmSync(u.task, { force: true });
  rmSync(join(runDir(root, slug), 'orchestrate', `task-${u.n}.md`), { force: true });
  journal(root, slug, { event: 'agent-end', agent: `${u.role}:${u.n}`, status: u.state === 'done' ? 'complete' : 'failed', errors: 0 });
  return out;
}

function measureCmd(root, slug, [id]) {
  const c = needContract(root, slug, { approved: true });
  const head = headOf(root);
  if (!head) throw refuse('the checkout has no commit: a verdict is recorded for a commit', personFix('Make the first commit of the repo, then run the measure again.'));
  const targets = c.outcomes.filter((o) => o.kind === 'measure' && !['dropped', 'held', 'unproven'].includes(o.state) && (!id || o.id === id));
  if (id && !targets.length) throw refuse(`${id} is not a measure outcome that can run now`, agentFix('Name a measure outcome that is open or passed: state lists them.', line(root, slug, 'state')));
  const runs = [];
  const entries = [];
  for (const o of targets) {
    const command = str(o.proof?.command);
    if (!command) { runs.push({ id: o.id, skipped: 'the outcome names no command' }); continue; }
    const once = () => {
      const r = runShell(command, { cwd: root, timeoutMs: MEASURE_TIMEOUT_MS });
      const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const expect = str(o.proof?.expect);
      const pass = !r.error && r.status === 0 && (!expect || text.includes(expect));
      return { pass, code: r.status, tail: scrubSecrets(text.slice(-1500)).text };
    };
    // A failure is confirmed: a second run, and a third when the first two do not agree.
    const tries = [once()];
    if (!tries[0].pass) tries.push(once());
    if (tries.length === 2 && tries[0].pass !== tries[1].pass) tries.push(once());
    for (const t of tries) entries.push({ outcome: o.id, verdict: t.pass ? 'pass' : 'fail', set: 'none', observed: `\`${command}\` exited ${t.code}${t.pass ? '' : `: ${t.tail.slice(-400)}`}`, evidence: [] });
    runs.push({ id: o.id, command, runs: tries.map((t) => ({ pass: t.pass, code: t.code })), tail: tries.at(-1).tail.slice(-600) });
  }
  const outcomes = update(root, slug, (s) => recordVerdicts(s, entries, { head, now: nowIso() }));
  return { ok: true, commit: head, measured: runs, outcomes };
}

function scenarioWrongCmd(root, slug, [id], f) {
  const head = headOf(root);
  const out = update(root, slug, (s) => {
    needApproved(s, root, slug);
    const commit = str(f.commit) || head;
    s.run.verdicts = voidRound(s.run.verdicts, id, commit, { reason: f.reason, now: nowIso() });
    s.contract.outcomes = s.contract.outcomes.map((o) => (o.id === id && o.state === 'held' && o.held?.auto ? { ...o, state: 'open', held: undefined } : o));
    return { ok: true, id, voided: commit, next: 'The scenario agent rewrites the scenario. The round does not count. Never put the text of the scenario into a builder task.' };
  });
  addDecision(workflowDir(root, slug), { kind: 'delegate', key: `scenario-wrong:${id}`, by: 'delegate', question: `Is the failed scenario of ${id} wrong?`, answer: `Yes: ${str(f.reason)}`, stage: 'orchestrate' });
  return out;
}

// ---------------------------------------------------------------- the list of a source

function readPackets(root, src) {
  const wd = join(workflowDir(root, src), 'work');
  const idxFile = join(wd, 'index.md');
  const index = existsSync(idxFile) ? (safeParseFrontmatter(readFileSync(idxFile, 'utf8')).data ?? {}) : null;
  if (index?.type !== 'list') throw refuse(`${src} has no list of work packets`, agentFix('Name a brainstorm or an ideate workflow whose work/index.md is a list. A brainstorm done writes it.'));
  const { packets } = readWorkFiles(wd);
  const all = [...packets.values()].map((p) => ({ ...p.data, file: p.file, path: join(wd, p.file) })).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  return { index, packets: all, dir: workflowDir(root, src) };
}

function sectionList(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*$`, 'm').exec(text);
  if (!m) return [];
  return text.slice(m.index + m[0].length).split(/\n## /)[0].split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('- ') && l !== '- None.').map((l) => l.slice(2));
}

function driverLive(root, slug) {
  const file = join(workflowDir(root, slug), '.driver-journal.jsonl');
  try {
    const last = parseJsonLines(readFileSync(file, 'utf8')).lines.at(-1);
    return Boolean(last) && last.event !== 'run-end' && !String(last.run ?? '').startsWith('orchestrate-') && Date.now() - statSync(file).mtimeMs < STALE_FLOOR_MS;
  } catch { return false; }
}

const ownerPath = (root, src) => join(workflowDir(root, src), OWNER_FILE);
/** The run that owns a list, or null. scripts/campaign.mjs reads it: the walk refuses a list that has an owner. */
export function ownerOf(root, src) {
  try { return JSON.parse(readFileSync(ownerPath(root, src), 'utf8')); } catch { return null; }
}

function takeOverCmd(root, slug, [src]) {
  if (!src) return null;
  const { index, packets } = readPackets(root, src);
  const owner = ownerOf(root, src);
  if (owner && owner.owner !== slug) throw refuse(`the list ${src} is owned by the run ${owner.owner}`, personFix(`Decide which run owns the list ${src}. The run ${owner.owner} gives it back with a hand-back.`));
  const live = packets.find((p) => driverLive(root, p['packet-slug']));
  if (live) throw refuse(`a driver of the walk is live on ${live['packet-slug']}`, personFix(`Stop the run of ${live['packet-slug']} first, or wait for it to end. Then take the list over.`));
  const proposed = [];
  for (const p of packets) {
    if (p.state === 'dropped') continue;
    const acs = sectionList(readFileSync(p.path, 'utf8'), 'Acceptance criteria');
    const area = str(p.key).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    acs.forEach((text, i) => {
      // A criterion of a packet file reads `**AC-1** — text`: the label goes into the source.
      const m = /^\*\*([A-Za-z]+-\d+)\*\*\s*[—-]\s*(.*)$/.exec(text);
      proposed.push({
        id: `OUT-${area}-${String(i + 1).padStart(3, '0')}`, says: m ? m[2] : text, kind: null, proof: null, needs: [], packet: p.key, area: p.title ?? p.key,
        source: `${src}/work/${p.file}#${m ? m[1] : `acceptance-criteria-${i + 1}`}`, ...(p.state === 'done' ? { state: 'passed' } : {}),
      });
    });
  }
  writeFileAtomic(ownerPath(root, src), `${JSON.stringify({ owner: slug, at: nowIso() }, null, 2)}\n`);
  return {
    ok: true, source: { kind: 'list', slug: src, 'list-revision': index['list-revision'] ?? null },
    packets: packets.map((p) => ({ key: p.key, slug: p['packet-slug'], state: p.state, form: p.form, skipped: Boolean(p.skipped) })),
    outcomes: proposed,
    next: 'Give each outcome its kind and its proof, interview the person on what the list left open, and write the contract file with this source. An outcome of a done work packet keeps state passed; the end proof runs it again.',
    owner: `The walk now refuses the list ${src} and names this run. A hand-back gives the list back.`,
  };
}

function handBackCmd(root, slug, [action]) {
  const c = needContract(root, slug, { approved: true });
  const src = c.source?.kind === 'list' ? c.source.slug : null;
  if (!src) throw refuse('this contract does not come from a list', agentFix('A hand-back gives a list back to the campaign walk. A contract from an instruction or an intake has no walk.'));
  if (action === 'start') {
    return update(root, slug, (s) => {
      s.contract['hand-back'] = { at: nowIso() };
      const view = packetsView(s.contract, s.run.units);
      return { ok: true, 'hand-back': 'started', packets: view, do: 'Start nothing new. Finish the build, the validation and the fix work of each started work packet until each of its outcomes is passed. Show the person each work packet that blocks, with its question. Then run the end proof over the passed work packets, and finish.', then: line(root, slug, 'hand-back', 'finish') };
    });
  }
  if (action === 'finish') {
    const run = loadRun(root, slug);
    if (!c['hand-back']) throw refuse('no hand-back is in progress', agentFix('Start the hand-back first.', line(root, slug, 'hand-back', 'start')));
    const view = packetsView(c, run.units);
    const started = view.filter((p) => p.state === 'started');
    if (started.length) throw refuse(`${started.map((p) => p.packet).join(', ')}: started and not passed, so the boundary is not clean`, agentFix('Finish each work packet that the error names, or ask the person to answer its held question or to have its commits reverted. state shows what blocks.', line(root, slug, 'state')));
    const head = headOf(root);
    const rv = runView({ ...c, outcomes: c.outcomes.filter((o) => view.some((p) => p.state === 'passed' && p.packet === o.packet)) }, run.verdicts, { head });
    if (rv['passed-at-an-older-commit'].length || rv['no-reserve-pass'].length) throw refuse(`the boundary is not proved: ${[...rv['passed-at-an-older-commit'], ...rv['no-reserve-pass']].join(', ')} has no pass of the end proof at the current commit`, agentFix('Run the end proof over the outcomes of the passed work packets, with the reserve set, then finish again.'));
    const passed = view.filter((p) => p.state === 'passed').map((p) => p.packet);
    writeFileAtomic(ownerPath(root, src), `${JSON.stringify({ ...ownerOf(root, src), owner: slug, 'handing-back': true, accept: passed, evidence: posix(evidencePath(root, slug)), at: nowIso() }, null, 2)}\n`);
    return { ok: true, 'hand-back': 'ready', passed, untouched: view.filter((p) => p.state === 'untouched').map((p) => p.packet), do: 'Run the accept command of the walk. It sets each passed work packet to done with the validation records as its proof, and takes the owner mark off.', command: `node "${join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'campaign.mjs')}" accept "${root}" ${src}`, then: `/wf campaign ${src}` };
  }
  return null;
}

// ---------------------------------------------------------------- state, roster, evidence

function sourceChange(root, c) {
  if (c?.source?.kind !== 'list' || !c.source.slug) return null;
  try {
    const { index } = readPackets(root, c.source.slug);
    const now = index['list-revision'] ?? null;
    if (now == null || now === c.source['list-revision']) return null;
    return { from: c.source['list-revision'] ?? null, to: now, changes: posix(join(workflowDir(root, c.source.slug), 'work', 'changes.md')), do: 'The list changed. Read the new entries of the changes file, write each one as a proposed contract change with this list-revision, and ask the person once. The run does not stop: go on with the outcomes that the change does not touch.' };
  } catch { return null; }
}

function stateCmd(root, slug, _pos, f) {
  const c = loadContract(root, slug);
  if (!c) return { ok: true, contract: null, next: 'Interview the person, then write the contract.', command: line(root, slug, 'contract put', '<file>') };
  const run = loadRun(root, slug);
  const head = headOf(root);
  const view = runView(c, run.verdicts, { head });
  const proposal = openProposal(c);
  const out = {
    ok: true, slug, status: c.status, path: c.path, revision: c.revision, commit: head, ...view,
    outcomes: c.outcomes.map((o) => {
      const v = verdictView(o, run.verdicts);
      return { id: o.id, kind: o.kind, state: o.state, ...(o.packet ? { packet: o.packet } : {}), ...(v.rounds ? { rounds: v.rounds } : {}), ...(v.last && !v.last.decision ? { need: v.last.need } : {}), ...(v.flaky ? { flaky: true } : {}) };
    }),
    milestones: run.milestones.map((m) => ({ key: m.key, outcomes: m.outcomes.length, passed: m.outcomes.filter((id) => c.outcomes.find((o) => o.id === id)?.state === 'passed').length })),
    units: run.units.map((u) => ({ n: u.n, role: u.role, state: u.state, milestone: u.milestone, serves: u.serves, ...(u['fix-of'] ? { 'fix-of': u['fix-of'] } : {}), ...(u.agent ? { agent: u.agent.id, terminal: u.agent.terminal ?? null } : {}) })),
    ...(proposal ? { proposal: { n: proposal.n, why: proposal.why, changes: proposal.changes } } : {}),
    ...(c.source?.kind === 'list' ? { packets: packetsView(c, run.units) } : {}),
    ...(c['hand-back'] ? { 'hand-back': c['hand-back'] } : {}),
    agents: run.agents?.allowed ?? null,
  };
  const changed = sourceChange(root, c);
  if (changed) out['source-changed'] = changed;
  if (f.live) out.terminals = terminalsOf(slug);
  return out;
}

function rosterCmd(_root, _slug, _pos, f) {
  const tiers = loadTiers();
  const r = rosterOf(tiers, { host: f.host ?? null, check: true });
  return {
    ok: true, ...r, tiers: tiers.from ?? posix(TIERS_FILE),
    roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, { tier: v.tier, ...(v.judge ? { judge: true } : {}) }])),
    rules: ['No agent of a run is a Fable-class or Mythos-class model.', 'A judge-only model writes scenarios and validates, and never builds.', 'A validator from another vendor than the builders is preferred, not required.', 'An agent with not-ready has no working sign-in: do not pick it. A ready sign-in can still have no balance; then the first dispatch fails, and the unit goes to another agent.'],
  };
}

/**
 * The agents that the person allows for this run. Only the person chooses them: the lead asks
 * once, with the roster, and records the answer here. A dispatch to any other agent is refused.
 */
function agentsCmd(root, slug, [action], f) {
  if (action === 'get') {
    const a = loadRun(root, slug).agents ?? null;
    return a ? { ok: true, ...a } : { ok: true, allowed: null, next: 'Ask the person which agents of the roster the run may use, then record the answer.', command: line(root, slug, 'agents allow', '--ids <id,id> --words "<the person\'s words>"') };
  }
  if (action !== 'allow') return null;
  const ids = str(f.ids).split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) throw refuse('agents allow needs --ids', agentFix('Run agents allow again with the roster ids that the person chose, with commas between them.', line(root, slug, 'roster')));
  if (!str(f.words)) throw refuse('the answer has no words of the person', agentFix('Ask the person which agents the run may use, with the host question tool. Then run agents allow again with the person\'s words in --words.'));
  const tiers = loadTiers();
  const errors = [];
  for (const id of ids) {
    const [program, ...rest] = id.split(':');
    const model = rest.join(':');
    if (REFUSED_MODEL_RE.test(model)) errors.push(`${id}: a Fable-class or Mythos-class model is never an agent of a run`);
    else if (!['host', 'claude', 'codex', 'pi'].includes(program) || !modelEntry(tiers, model)) errors.push(`${id}: not an id of the roster`);
  }
  if (errors.length) throw refuse(`agents allow has ${errors.length} error(s):\n${errors.join('\n')}`, agentFix('Use the ids that roster prints, then run agents allow again.', line(root, slug, 'roster')));
  const out = update(root, slug, (s) => {
    s.run.agents = { allowed: ids, words: str(f.words), at: nowIso() };
    const tierOf = (id) => modelEntry(tiers, id.split(':').slice(1).join(':')).tier;
    const have = new Set(ids.map(tierOf));
    return { ok: true, allowed: ids, ...(have.has('A') ? {} : { warning: 'No allowed agent is tier A: the scenario, validator and design roles cannot start. Tell the person.' }) };
  });
  addDecision(workflowDir(root, slug), { kind: 'answer', key: 'orchestrate-agents', by: 'person', question: 'Which agents may this run use?', answer: `${ids.join(', ')}: ${str(f.words)}`, stage: 'orchestrate' });
  return out;
}

function helpersCmd(root, slug) {
  const run = loadRun(root, slug);
  const tiers = loadTiers();
  const mine = new Set(run.units.map((u) => u.agent?.terminal).filter(Boolean));
  const helpers = terminalsOf(slug).filter((t) => !mine.has(t.name)).map((t) => {
    const full = exec('hc', ['get', t.name, '--json'], { timeoutMs: 30_000 });
    let argv = [];
    try { argv = JSON.parse(full.stdout).argv ?? []; } catch { /* no argv */ }
    const i = argv.findIndex((a) => a === '--model' || a === '-m');
    const model = i >= 0 ? str(argv[i + 1]) : null;
    const refused = argv.some((a) => REFUSED_MODEL_RE.test(String(a))) || (model && !modelEntry(tiers, model.split('/').pop()));
    return { ...t, model, ...(refused ? { refused: true } : {}) };
  });
  const bad = helpers.filter((h) => h.refused);
  return { ok: bad.length === 0, helpers, ...(bad.length ? { error: `${bad.map((h) => h.name).join(', ')}: a helper of the run uses a model that the tier data does not allow`, fix: agentFix('End each helper that the error names, and count the unit of its parent agent as failed. A harness\'s own subagents are not seen by this check.') } : {}) };
}

function evidenceCmd(root, slug) {
  const c = needContract(root, slug);
  const run = loadRun(root, slug);
  const dir = workflowDir(root, slug);
  let decisions = [];
  try { decisions = decisionsOf(dir).filter((d) => isLive(d) && d.by === 'delegate').map((d) => ({ key: d.key, answer: d.answer })); } catch { /* no store */ }
  let findings = [];
  try { findings = list(readLedger(dir)?.findings).filter((x) => OPEN_STATUSES.has(x.status)).map((x) => ({ severity: x.severity, issue: x.issue, file: x.file })); } catch { /* no ledger */ }
  const head = headOf(root);
  mkdirSync(join(odir(root, slug), 'evidence'), { recursive: true });
  writeFileAtomic(evidencePath(root, slug), renderEvidence({ contract: c, verdicts: run.verdicts, units: run.units, decisions, findings, head, at: nowIso() }));
  const view = runView(c, run.verdicts, { head });
  return { ok: true, page: posix(evidencePath(root, slug)), evidence: posix(join(odir(root, slug), 'evidence')), ...view, choices: decisions, 'open-findings': findings.length };
}

function scrubCmd(_root, _slug, [file]) {
  const p = resolve(file ?? '');
  if (!file || !existsSync(p)) throw refuse(`scrub: no file ${file ?? ''}`, agentFix('Run scrub again with the path of the log.'));
  const r = scrubSecrets(readFileSync(p, 'utf8'));
  if (r.removed) writeFileSync(p, r.text);
  return { ok: true, file: posix(p), removed: r.removed };
}

// ---------------------------------------------------------------- the commands

function flags(args) {
  const BOOLEAN = new Set(['drop', 'live', 'json', 'abandon']);
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && BOOLEAN.has(name)) f[name] = true;
    else if (name) { f[name] = args[i + 1]; i++; } else pos.push(args[i]);
  }
  return { pos, f };
}

/** The commands that write no record: they make no commit in a records clone. */
const READ_ONLY = new Set(['state', 'roster', 'helpers', 'wait', 'screen', 'scrub', 'keys', 'send']);
/**
 * The commands that take an action word, with their actions. The word is accepted before the
 * root or after the slug: `contract put <root> <slug>` and `contract <root> <slug> put` are one command.
 */
const ACTIONS = { agents: ['allow', 'get'], contract: ['put', 'get', 'design', 'approve'], change: ['propose', 'approve', 'refuse'], holdout: ['init', 'path'], 'hand-back': ['start', 'finish'], path: ['up'] };

function dispatch(cmd, argv) {
  const { pos, f } = flags(argv);
  let action = null;
  if (ACTIONS[cmd]) {
    const at = ACTIONS[cmd].includes(pos[0]) ? 0 : ACTIONS[cmd].includes(pos[2]) ? 2 : -1;
    if (at < 0) return null;
    [action] = pos.splice(at, 1);
  }
  const [rootArg, slug, ...rest] = pos;
  if (!rootArg || !slug) return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) throw refuse(`"${slug}" is not a slug`, agentFix('Run the command again with the slug of the workflow: lower-case letters, digits and hyphens.'));
  const root = isAbsolute(rootArg) ? rootArg : resolve(rootArg);
  const args = action ? [action, ...rest] : rest;
  const out = (() => {
    switch (cmd) {
      case 'contract': return contractCmd(root, slug, args, f);
      case 'change': return changeCmd(root, slug, args, f);
      case 'path': return pathCmd(root, slug, args, f);
      case 'hold': return holdCmd(root, slug, args, f);
      case 'answer': return answerCmd(root, slug, args, f);
      case 'unproven': return unprovenCmd(root, slug, args, f);
      case 'milestones': return milestonesCmd(root, slug, args);
      case 'unit': return unitCmd(root, slug, args);
      case 'dispatch': return dispatchCmd(root, slug, args, f);
      case 'wait': return waitCmd(root, slug, args, f);
      case 'screen': return screenCmd(root, slug, args);
      case 'send': return sendCmd(root, slug, args, f);
      case 'keys': return keysCmd(root, slug, args);
      case 'end': return endCmd(root, slug, args, f);
      case 'result': return resultCmd(root, slug, args);
      case 'measure': return measureCmd(root, slug, args);
      case 'scenario-wrong': return scenarioWrongCmd(root, slug, args, f);
      case 'state': return stateCmd(root, slug, args, f);
      case 'roster': return rosterCmd(root, slug, args, f);
      case 'agents': return agentsCmd(root, slug, args, f);
      case 'holdout': return holdoutCmd(root, slug, args, f);
      case 'helpers': return helpersCmd(root, slug);
      case 'evidence': return evidenceCmd(root, slug);
      case 'scrub': return scrubCmd(root, slug, args);
      case 'take-over': return takeOverCmd(root, slug, args);
      case 'hand-back': return handBackCmd(root, slug, args);
      default: return null;
    }
  })();
  if (out && !READ_ONLY.has(cmd)) {
    try { const committed = commitRecords({ root, label: `orchestrate ${cmd}` }); if (committed?.length) out.committed = committed; } catch { /* the next records commit takes the files */ }
  }
  return out;
}

/** One command in this process: its JSON result, or null for a usage error. */
export function run(argv) {
  const [cmd, ...rest] = argv;
  try {
    const out = cmd ? dispatch(cmd, rest) : null;
    return out === null ? null : withFix(out, 'orchestrate.mjs');
  } catch (e) {
    return failureOf(e, 'orchestrate.mjs');
  }
}

export function main(argv = process.argv.slice(2)) {
  const out = run(argv);
  if (out === null) { process.stderr.write(`${USAGE}\n${USAGE_FIX}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
