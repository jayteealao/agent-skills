// lib/orchestrate.mjs — the rules of /wf orchestrate, with no disk and no process in them.
//
// The lead agent owns the loop of a run. This module holds what the lead must not decide alone:
// the states of the vision contract, the model rules of a dispatch, how verdicts of validators
// become the state of an outcome, the size check, and the changes of an approved contract.
// scripts/orchestrate.mjs reads and writes the files, and calls these functions.

import { agentFix, personFix, refuse } from './fix.mjs';

const str = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- the contract

export const KINDS = Object.freeze(['behaviour', 'measure', 'design', 'artifact']);
export const STATES = Object.freeze(['open', 'passed', 'held', 'unproven', 'dropped']);
export const PATHS = Object.freeze(['full', 'light']);
/** The kinds that a hidden scenario can prove: a product runs. */
export const SCENARIO_KINDS = Object.freeze(['behaviour', 'design']);
/** The failed validation rounds after which an outcome becomes a contract question. */
export const ROUND_LIMIT = 3;
/** The outcomes of a small contract, the standing ones left out. */
export const LIGHT_MAX = 2;
export const ID_RE = /^OUT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const STAND = 'OUT-STAND-';
/** The measure of CI when the contract names none: the checks of the PR of the checked-out branch. */
export const DEFAULT_CI = 'gh pr checks --watch --fail-fast';

/** True for a standing outcome: the script adds it, the interview does not. */
export const isStanding = (o) => str(o?.id).startsWith(STAND);

/**
 * The standing outcomes of a contract. `commands` gives the measure commands of the project:
 * { tests, rules, ci }. A light-path contract gets the tests, the rules and CI only.
 */
export function standingOutcomes({ commands = {}, path = 'full' } = {}) {
  const measure = (cmd) => (str(cmd) && str(cmd).toLowerCase() !== 'none' ? { kind: 'measure', proof: { command: str(cmd) } } : null);
  const all = [
    { id: `${STAND}TESTS`, says: 'The build and the test suite of the repo pass.', ...(measure(commands.tests) ?? { kind: 'measure', proof: { command: '' } }), checked: 'each milestone, and the end proof' },
    { id: `${STAND}CHARTER`, says: 'Each charter commitment and each live steer holds in the running product.', kind: 'behaviour', proof: { surface: 'the product', evidence: 'one observation for each commitment and each steer' }, checked: 'each milestone', full: true },
    { id: `${STAND}RULES`, says: 'The rules of the instruction files of the repo hold, and the design system check passes where the repo has one.', ...(measure(commands.rules) ?? { kind: 'behaviour', proof: { surface: 'the diff of the run', evidence: 'the findings of the code validator about a written project rule' } }), checked: 'each milestone' },
    { id: `${STAND}REST`, says: 'The main paths of the product that the contract does not name work as before the run.', kind: 'behaviour', proof: { surface: 'the main paths of the product', evidence: 'the same observation before the run and at the end proof' }, checked: 'the first milestone records the paths; the end proof walks them again', full: true },
    { id: `${STAND}CI`, says: 'CI passes on the PR of the run.', ...(measure(commands.ci) ?? { kind: 'measure', proof: { command: '' } }), checked: 'after each push' },
  ];
  // `none` for the tests or for CI means that the repo has none: the outcome is left out.
  const none = (v) => str(v).toLowerCase() === 'none';
  return all.filter((o) => path !== 'light' || !o.full)
    .filter((o) => !(o.id === `${STAND}TESTS` && none(commands.tests)) && !(o.id === `${STAND}CI` && none(commands.ci)))
    // The light path has no code validator, so the rules outcome needs a command there.
    .filter((o) => !(o.id === `${STAND}RULES` && path === 'light' && o.kind !== 'measure'))
    .map(({ full, ...o }) => ({ ...o, needs: [], source: 'standing', state: 'open' }));
}

/** The errors of one outcome as the lead wrote it. An empty list means that it is well-formed. */
export function outcomeErrors(o) {
  const errors = [];
  const id = str(o?.id);
  if (!ID_RE.test(id)) errors.push(`${id || '(no id)'}: an id is OUT-<AREA>-<n> in capitals, for example OUT-AUTH-001`);
  if (!str(o?.says)) errors.push(`${id}: says is empty; write one sentence that is true when the outcome is met`);
  if (!KINDS.includes(o?.kind)) errors.push(`${id}: kind is one of ${KINDS.join(', ')}`);
  const p = o?.proof ?? {};
  if (o?.kind === 'behaviour' && (!str(p.surface) || !str(p.evidence))) errors.push(`${id}: a behaviour proof names surface and evidence`);
  if (o?.kind === 'measure' && !isStanding(o) && !str(p.command)) errors.push(`${id}: a measure proof names command`);
  if (o?.kind === 'design' && (!str(p.record) || !list(p.screens).length)) errors.push(`${id}: a design proof names record and screens`);
  if (o?.kind === 'artifact' && (!str(p.deliverable) || !list(p['must-answer']).length || !list(p.sources).length)) errors.push(`${id}: an artifact proof names deliverable, must-answer and sources`);
  if (!str(o?.source)) errors.push(`${id}: source is empty; name the answer, the acceptance criterion or the carried decision that it comes from`);
  return errors;
}

/** One outcome in its stored shape. */
export function normalizeOutcome(o) {
  return {
    id: str(o.id), says: str(o.says), kind: o.kind, proof: o.proof ?? {}, needs: list(o.needs).map(str).filter(Boolean),
    source: str(o.source), ...(str(o.packet) ? { packet: str(o.packet) } : {}), ...(str(o.area) ? { area: str(o.area) } : {}),
    ...(o.checked ? { checked: o.checked } : {}), state: STATES.includes(o.state) ? o.state : 'open',
  };
}

/** The errors of a set of outcomes: each outcome, the ids, and the needs. */
export function contractErrors(outcomes) {
  const errors = outcomes.flatMap(outcomeErrors);
  const ids = outcomes.map((o) => str(o.id));
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errors.push(`${id}: two outcomes have this id`);
  for (const o of outcomes) for (const n of list(o.needs)) if (!ids.includes(str(n))) errors.push(`${o.id}: needs ${n}, which is not an outcome of the contract`);
  return errors;
}

/** A draft contract from the outcomes of the interview. The standing outcomes are added at the approval. */
export function draftContract({ slug, source, outcomes, commands = {}, now }) {
  const own = outcomes.filter((o) => !isStanding(o));
  const errors = contractErrors(own);
  if (errors.length) throw refuse(`the contract has ${errors.length} error(s):\n${errors.join('\n')}`, agentFix('Correct each outcome that the error names in the contract file, then run contract put again.'));
  if (!str(commands.tests)) throw refuse('the contract names no test command', agentFix('Write the command that builds and tests the repo into commands.tests of the contract file, or the word none when the repo has no tests, then run contract put again.'));
  if (!own.length) throw refuse('the contract has no outcome', agentFix('Write at least one outcome from the interview into the contract file, then run contract put again.'));
  return {
    schema: 'sdlc/v1', type: 'contract', slug, status: 'draft', path: null, revision: 0,
    source: { kind: source?.kind ?? 'instruction', ...(source?.slug ? { slug: source.slug } : {}), ...(source?.['list-revision'] != null ? { 'list-revision': source['list-revision'] } : {}) },
    commands: { tests: str(commands.tests), rules: str(commands.rules), ci: str(commands.ci) || DEFAULT_CI },
    'created-at': now, 'approved-at': null, outcomes: own.map(normalizeOutcome), changes: [],
  };
}

/** The outcomes of a contract that the interview wrote, with no standing outcome and no dropped one. */
export const ownOutcomes = (c) => list(c?.outcomes).filter((o) => !isStanding(o) && o.state !== 'dropped');

/**
 * The size of a contract: `light` when it has at most LIGHT_MAX own outcomes, none of kind
 * design, and the lead says that one builder can do the work in one unit. The person's word
 * (`choice`) outranks the check.
 */
export function sizeOf(contract, { oneUnit = null, choice = null } = {}) {
  if (PATHS.includes(choice)) return { path: choice, why: `the person chose ${choice}` };
  const own = ownOutcomes(contract);
  if (own.length > LIGHT_MAX) return { path: 'full', why: `${own.length} outcomes, more than ${LIGHT_MAX}` };
  if (own.some((o) => o.kind === 'design')) return { path: 'full', why: 'an outcome of kind design' };
  if (oneUnit !== true) return { path: 'full', why: 'the lead did not say that one builder can do the work in one unit' };
  return { path: 'light', why: `${own.length} outcome(s), no design, one unit` };
}

/**
 * Approve a draft contract. A design outcome needs its approved design and its match checklist
 * first. The standing outcomes are added for the path.
 */
export function approveContract(contract, { words, oneUnit = null, oneUnitReason = '', choice = null, now }) {
  if (contract.status === 'approved') throw refuse('the contract is approved already', agentFix('Propose a change of the approved contract with change propose; do not approve it again.'));
  if (!str(words)) throw refuse('the approval has no words of the person', agentFix('Show the contract to the person in chat, then run contract approve again with the person\'s words in --words.'));
  const noDesign = contract.outcomes.filter((o) => o.kind === 'design' && (!o.proof?.['design-approved'] || !list(o.proof?.checklist).length));
  if (noDesign.length) {
    throw refuse(`${noDesign.map((o) => o.id).join(', ')}: a design outcome needs an approved design and a match checklist before the contract is approved`,
      agentFix('Run the design phase for each outcome that the error names, then record the approval of the person with contract design.'));
  }
  if (oneUnit === true && !str(oneUnitReason)) throw refuse('--one-unit yes needs --reason', agentFix('Run contract approve again with the reason that one builder can do the work in one unit, in --reason.'));
  const size = sizeOf(contract, { oneUnit, choice });
  const standing = standingOutcomes({ commands: contract.commands, path: size.path });
  return {
    ...contract, status: 'approved', path: size.path, 'path-why': oneUnit === true ? `${size.why}: ${str(oneUnitReason)}` : size.why, revision: 1,
    'approved-at': now, 'approved-words': str(words), outcomes: [...contract.outcomes.filter((o) => !isStanding(o)), ...standing],
  };
}

/** The contract moved from the light path to the full path. It never goes down. */
export function pathUp(contract, { reason }) {
  if (contract.path === 'full') return contract;
  if (!str(reason)) throw refuse('path up needs --reason', agentFix('Run path up again with the reason that the work is larger than one unit, in --reason.'));
  const have = new Set(contract.outcomes.map((o) => o.id));
  const added = standingOutcomes({ commands: contract.commands, path: 'full' }).filter((o) => !have.has(o.id));
  return { ...contract, path: 'full', 'path-why': `moved up: ${str(reason)}`, outcomes: [...contract.outcomes, ...added] };
}

const outcomeOf = (contract, id) => {
  const o = contract.outcomes.find((x) => x.id === id);
  if (!o) throw refuse(`${id} is not an outcome of the contract`, agentFix('Name an outcome of the contract by its id: state lists them.'));
  return o;
};
const withOutcome = (contract, id, fn) => ({ ...contract, outcomes: contract.outcomes.map((o) => (o.id === id ? fn(o) : o)) });

/** Record the approved design and the match checklist of a design outcome. */
export function designApproved(contract, id, { checklist, words }) {
  const o = outcomeOf(contract, id);
  if (o.kind !== 'design') throw refuse(`${id} is not an outcome of kind design`, agentFix('Name an outcome of kind design.'));
  if (!list(checklist).length) throw refuse('the match checklist is empty', agentFix('Write what must match for each screen (the layout, the tokens, the states, the copy) into the checklist file, then run contract design again.'));
  if (!str(words)) throw refuse('the design approval has no words of the person', agentFix('Show the design to the person, then run contract design again with the person\'s words in --words.'));
  return withOutcome(contract, id, (x) => ({ ...x, proof: { ...x.proof, checklist: list(checklist).map(str).filter(Boolean), 'design-approved': true, 'design-words': str(words) } }));
}

// ---------------------------------------------------------------- changes of an approved contract

export const CHANGE_KINDS = Object.freeze(['add', 'rewrite', 'drop']);

/**
 * Propose changes of an approved contract. Nothing changes until the person approves them.
 * A change is { kind: add|rewrite, outcome } or { kind: drop, id }.
 */
export function proposeChanges(contract, changes, { why, now }) {
  if (contract.status !== 'approved') throw refuse('the contract is not approved yet: put it again', agentFix('Change the draft with contract put; a change proposal is for an approved contract.'));
  if (!str(why)) throw refuse('change propose needs --why', agentFix('Run change propose again with the reason of the change in --why. The person reads it.'));
  if (!list(changes).length) throw refuse('the proposal has no change', agentFix('Write at least one change into the changes file.'));
  const ids = new Set(contract.outcomes.map((o) => o.id));
  const errors = [];
  for (const ch of changes) {
    if (!CHANGE_KINDS.includes(ch?.kind)) { errors.push(`a change has kind ${ch?.kind}: the kinds are ${CHANGE_KINDS.join(', ')}`); continue; }
    if (ch.kind === 'drop') { if (!ids.has(str(ch.id))) errors.push(`drop ${ch.id}: not an outcome of the contract`); continue; }
    errors.push(...outcomeErrors(ch.outcome ?? {}));
    const id = str(ch.outcome?.id);
    if (isStanding(ch.outcome)) errors.push(`${id}: a standing outcome does not change`);
    if (ch.kind === 'add' && ids.has(id)) errors.push(`add ${id}: the contract has this id already; use rewrite`);
    if (ch.kind === 'rewrite' && !ids.has(id)) errors.push(`rewrite ${id}: not an outcome of the contract; use add`);
  }
  if (errors.length) throw refuse(`the proposal has ${errors.length} error(s):\n${errors.join('\n')}`, agentFix('Correct each change that the error names in the changes file, then run change propose again.'));
  const n = list(contract.changes).length + 1;
  return { ...contract, changes: [...list(contract.changes), { n, at: now, why: str(why), state: 'proposed', changes }] };
}

/** The open proposal of a contract, or null. */
export const openProposal = (contract) => list(contract.changes).find((c) => c.state === 'proposed') ?? null;

/** Apply or refuse the open proposal with the person's words. A rewritten outcome goes back to open. */
export function settleProposal(contract, { accept, words, now }) {
  const p = openProposal(contract);
  if (!p) throw refuse('the contract has no open proposal', agentFix('Run state to see the proposals of the contract.'));
  if (!str(words)) throw refuse('the answer has no words of the person', agentFix('Show the proposed changes to the person in chat, then run the command again with the person\'s words in --words.'));
  let outcomes = contract.outcomes;
  if (accept) {
    for (const ch of p.changes) {
      if (ch.kind === 'drop') outcomes = outcomes.map((o) => (o.id === str(ch.id) ? { ...o, state: 'dropped' } : o));
      else if (ch.kind === 'add') outcomes = [...outcomes, { ...normalizeOutcome(ch.outcome), state: 'open' }];
      else outcomes = outcomes.map((o) => (o.id === str(ch.outcome.id) ? { ...normalizeOutcome(ch.outcome), state: 'open', rewritten: (o.rewritten ?? 0) + 1 } : o));
    }
  }
  const settled = { ...p, state: accept ? 'approved' : 'refused', words: str(words), 'settled-at': now };
  let next = { ...contract, revision: contract.revision + (accept ? 1 : 0), outcomes, changes: contract.changes.map((c) => (c.n === p.n ? settled : c)) };
  if (accept && next.path === 'light' && ownOutcomes(next).length > LIGHT_MAX) next = pathUp(next, { reason: 'a contract change made the contract larger than the light path' });
  return next;
}

/** Hold an outcome as a contract question for the person. */
export function holdOutcome(contract, id, { question, evidence = '', now }) {
  outcomeOf(contract, id);
  if (!str(question)) throw refuse('hold needs --question', agentFix('Run hold again with the question for the person in --question.'));
  return withOutcome(contract, id, (o) => ({ ...o, state: 'held', held: { question: str(question), evidence: str(evidence), at: now } }));
}

/** The answer of the person to a held outcome: it goes back to open, or it is dropped. */
export function answerHeld(contract, id, { words, drop = false, now }) {
  const o = outcomeOf(contract, id);
  if (o.state !== 'held') throw refuse(`${id} is not held`, agentFix('Name a held outcome: state lists them.'));
  if (!str(words)) throw refuse('the answer has no words of the person', agentFix('Ask the person the held question, then run answer again with the person\'s words in --words.'));
  if (isStanding(o) && drop) throw refuse(`${id} is a standing outcome and is never dropped`, personFix('Decide how the standing outcome can hold, or stop the run.'));
  return withOutcome(contract, id, (x) => ({ ...x, state: drop ? 'dropped' : 'open', held: { ...x.held, answer: str(words), 'answered-at': now }, 'rounds-reset': (x['rounds-reset'] ?? 0) + 1 }));
}

/** Mark an outcome unproven: the work is built, and this machine cannot produce the evidence. */
export function markUnproven(contract, id, { command, output, why, now }) {
  outcomeOf(contract, id);
  if (!str(command) || !str(output) || !str(why)) throw refuse('unproven needs the probe: --command, --output and --why', agentFix('Run the command that shows that this machine cannot produce the evidence, then run unproven again with the command, the tail of its output and the reason.'));
  return withOutcome(contract, id, (o) => ({ ...o, state: 'unproven', probe: { command: str(command), output: str(output).slice(-2000), why: str(why), at: now } }));
}

// ---------------------------------------------------------------- models, tiers and roles

/** A Fable-class or Mythos-class model name. No agent of a run uses one. */
export const REFUSED_MODEL_RE = /(fable|mythos)/i;
export const TIER_ORDER = Object.freeze({ A: 3, B: 2, C: 1 });

/**
 * The roles of a run. `tier` is the lowest tier that may do the role. `judge` roles decide or
 * write what decides; `builds` roles change the product; `validator` roles get a fresh agent.
 */
export const ROLES = Object.freeze({
  scenario: { tier: 'A', judge: true, holdout: true },
  'product-validator': { tier: 'A', judge: true, validator: true, holdout: true },
  'artifact-validator': { tier: 'A', judge: true, validator: true },
  design: { tier: 'A', builds: true },
  'builder-hard': { tier: 'A', builds: true },
  builder: { tier: 'B', builds: true },
  author: { tier: 'B', builds: true },
  'code-validator': { tier: 'B', validator: true },
  readiness: { tier: 'B' },
});

/** The entry of a model in the tier data, by its id or by an alias. */
export function modelEntry(tiers, model) {
  const id = str(model);
  const models = tiers?.models ?? {};
  if (models[id]) return { id, ...models[id] };
  const byAlias = Object.entries(models).find(([, m]) => list(m.aliases).includes(id));
  return byAlias ? { id: byAlias[0], ...byAlias[1] } : null;
}

/**
 * Check one dispatch against the model rules. Throws a refusal, or returns
 * { model, tier, vendor } of the model that the role may use.
 */
export function checkDispatch(tiers, { role, model }) {
  const r = ROLES[role];
  if (!r) throw refuse(`${role} is not a role of a run: the roles are ${Object.keys(ROLES).join(', ')}`, agentFix('Run dispatch again with a role of the list.'));
  if (REFUSED_MODEL_RE.test(str(model))) {
    throw refuse(`${model} is a Fable-class or Mythos-class model: no agent of a run uses one`, agentFix('Pick another model of the roster for this role: roster lists each model with its tier.'));
  }
  const m = modelEntry(tiers, model);
  if (!m || !TIER_ORDER[m.tier]) throw refuse(`${model || '(no model)'} has no tier in the tier data`, agentFix('Pick a model that roster lists with a tier. Only the person adds a model to the tier data.'));
  if (TIER_ORDER[m.tier] < TIER_ORDER[r.tier]) throw refuse(`${m.id} is tier ${m.tier}, and the role ${role} needs tier ${r.tier}`, agentFix(`Pick a model of tier ${r.tier} or higher for this role: roster lists them.`));
  if (m['judge-only'] && !r.judge) throw refuse(`${m.id} may judge and never builds: it cannot take the role ${role}`, agentFix('Pick another model of the roster for this role. This model takes the scenario and validator roles only.'));
  return { model: m.id, tier: m.tier, vendor: m.vendor ?? null };
}

// ---------------------------------------------------------------- units

export const UNIT_STATES = Object.freeze(['planned', 'running', 'done', 'failed']);
const posix = (p) => str(p).split('\\').join('/').replace(/^\.\//, '');

/** True when two file sets meet: an equal path, or one path is a folder of the other. */
export function filesMeet(a, b) {
  const A = list(a).map(posix).filter(Boolean);
  const B = list(b).map(posix).filter(Boolean);
  return A.some((x) => B.some((y) => x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)));
}

/**
 * The reason that a unit may not start now, or null. A builder never writes while a validator
 * runs or while another builder holds a file that it changes; a validator never runs while a
 * builder writes.
 */
export function startBlock(units, unit) {
  const running = units.filter((u) => u.state === 'running' && u.n !== unit.n);
  const role = ROLES[unit.role] ?? {};
  if (role.builds) {
    const v = running.find((u) => ROLES[u.role]?.validator);
    if (v) return `the validator unit ${v.n} runs: a builder does not write while a validator runs`;
    if (!list(unit.files).length && running.some((u) => ROLES[u.role]?.builds)) return 'the unit names no files, so it cannot run beside another builder';
    const b = running.find((u) => ROLES[u.role]?.builds && (!list(u.files).length || filesMeet(u.files, unit.files)));
    if (b) return `the builder unit ${b.n} runs and its files meet the files of this unit`;
  }
  if (role.validator) {
    const b = running.find((u) => ROLES[u.role]?.builds);
    if (b) return `the builder unit ${b.n} runs: a validator runs only when no builder writes`;
  }
  return null;
}

// ---------------------------------------------------------------- verdicts

export const VERDICTS = Object.freeze(['pass', 'fail']);
export const SETS = Object.freeze(['working', 'reserve', 'none']);

/**
 * The decision of the verdicts of one outcome at one commit. One pass with no fail decides
 * pass. A fail needs a second run: two fails decide fail, and a fail with a pass needs a third
 * run, where two of three decide. A fail that is `confirmed` at its source decides alone: a
 * breach of a written rule quotes the rule, so a second validator adds nothing.
 */
export function decide(verdicts) {
  const live = verdicts.filter((v) => !v.void);
  const pass = live.filter((v) => v.verdict === 'pass').length;
  const fail = live.filter((v) => v.verdict === 'fail').length;
  const flaky = pass > 0 && fail > 0;
  if (!live.length) return { decision: null, flaky: false, need: 'a validation' };
  if (fail === 0) return { decision: 'pass', flaky: false, need: null };
  if (live.some((v) => v.verdict === 'fail' && v.confirmed)) return { decision: 'fail', flaky: false, need: null };
  if (fail >= 2 && fail > pass) return { decision: 'fail', flaky, need: null };
  if (pass >= 2 && pass > fail) return { decision: 'pass', flaky, need: null };
  return { decision: null, flaky, need: fail === 1 && pass === 0 ? 'a second validation by a fresh validator, to confirm the failure' : 'a third validation by a fresh validator: two of three decide' };
}

/**
 * The view of one outcome from all its verdicts, in the order that they were recorded:
 * the decision at the newest commit, the failed rounds, and whether a run was flaky.
 */
export function verdictView(outcome, verdicts) {
  const mine = verdicts.filter((v) => v.outcome === outcome.id && (v.epoch ?? 0) === (outcome['rounds-reset'] ?? 0) + (outcome.rewritten ?? 0));
  const commits = [];
  for (const v of mine) if (!commits.includes(v.commit)) commits.push(v.commit);
  const perCommit = commits.map((c) => ({ commit: c, ...decide(mine.filter((v) => v.commit === c)) }));
  const last = perCommit.at(-1) ?? null;
  const needsReserve = SCENARIO_KINDS.includes(outcome.kind);
  const lastVerdicts = last ? mine.filter((v) => v.commit === last.commit && !v.void) : [];
  return {
    rounds: perCommit.filter((c) => c.decision === 'fail').length,
    flaky: perCommit.some((c) => c.flaky),
    last,
    reservePassed: Boolean(last && last.decision === 'pass' && (!needsReserve || lastVerdicts.some((v) => v.set === 'reserve' && v.verdict === 'pass'))),
  };
}

/**
 * The state of an outcome after its verdicts changed. `head` is the commit of the checkout.
 * `passed` needs a decided pass at the current commit. A decided fail puts it back to open,
 * and ROUND_LIMIT failed rounds hold it as a contract question.
 */
export function stateAfterVerdicts(outcome, verdicts, { head, now }) {
  if (['dropped', 'held', 'unproven'].includes(outcome.state)) return outcome;
  const view = verdictView(outcome, verdicts);
  if (!view.last) return outcome;
  // A failure that is not confirmed yet still takes a pass back: an outcome is never shown
  // as passed, and a run is never finished, while a failure of the newest commit waits for its confirmation.
  if (!view.last.decision) {
    const pendingFail = verdicts.some((v) => v.outcome === outcome.id && v.commit === view.last.commit && v.verdict === 'fail' && !v.void);
    return pendingFail && outcome.state === 'passed' ? { ...outcome, state: 'open' } : outcome;
  }
  if (view.last.decision === 'pass') return view.last.commit === head ? { ...outcome, state: 'passed', 'passed-at': view.last.commit } : outcome;
  if (view.rounds >= ROUND_LIMIT) {
    return {
      ...outcome, state: 'held',
      held: { question: `${outcome.id} failed ${view.rounds} validation rounds. Should the outcome change, be dropped, or should the run try again?`, evidence: `rounds: ${view.rounds}`, at: now, auto: true },
    };
  }
  return { ...outcome, state: 'open' };
}

/** Void the verdicts of one failed round of an outcome: the scenario was wrong, so the round does not count. */
export function voidRound(verdicts, id, commit, { reason, now }) {
  if (!str(reason)) throw refuse('scenario-wrong needs --reason', agentFix('Run scenario-wrong again with what the scenario asked that the contract does not say, in --reason.'));
  const hit = verdicts.filter((v) => v.outcome === id && v.commit === commit && v.verdict === 'fail' && !v.void);
  if (!hit.length) throw refuse(`${id} has no failed verdict at ${commit}`, agentFix('Name the outcome and the commit of a failed round: state lists the verdicts.'));
  return verdicts.map((v) => (hit.includes(v) ? { ...v, void: { reason: str(reason), at: now } } : v));
}

// ---------------------------------------------------------------- the whole run

/** What is left before the run can end, and whether it is finished. */
export function runView(contract, verdicts, { head } = {}) {
  const live = list(contract?.outcomes).filter((o) => o.state !== 'dropped');
  const open = live.filter((o) => o.state === 'open');
  const held = live.filter((o) => o.state === 'held');
  const unproven = live.filter((o) => o.state === 'unproven');
  const stale = live.filter((o) => o.state === 'passed' && head && o['passed-at'] !== head);
  const noReserve = contract?.path === 'full'
    ? live.filter((o) => o.state === 'passed' && SCENARIO_KINDS.includes(o.kind) && !isStanding(o) && !verdictView(o, verdicts).reservePassed)
    : [];
  const finished = contract?.status === 'approved' && !open.length && !held.length && !stale.length && !noReserve.length;
  return {
    finished,
    counts: { all: live.length, passed: live.filter((o) => o.state === 'passed').length, open: open.length, held: held.length, unproven: unproven.length },
    open: open.map((o) => o.id), held: held.map((o) => ({ id: o.id, question: o.held?.question ?? '' })), unproven: unproven.map((o) => o.id),
    'passed-at-an-older-commit': stale.map((o) => o.id), 'no-reserve-pass': noReserve.map((o) => o.id),
  };
}

/** The work packets of a list contract: each one passed, started or untouched. */
export function packetsView(contract, units) {
  const byPacket = new Map();
  for (const o of list(contract?.outcomes)) {
    if (!o.packet || o.state === 'dropped') continue;
    if (!byPacket.has(o.packet)) byPacket.set(o.packet, []);
    byPacket.get(o.packet).push(o);
  }
  const committed = (id) => list(units).some((u) => list(u.serves).includes(id) && list(u.commits).length);
  return [...byPacket.entries()].map(([packet, outcomes]) => {
    const passed = outcomes.every((o) => o.state === 'passed');
    const started = outcomes.some((o) => o.state === 'passed' || committed(o.id));
    const blocks = outcomes.filter((o) => ['held', 'unproven'].includes(o.state)).map((o) => o.id);
    return { packet, state: passed ? 'passed' : started ? 'started' : 'untouched', outcomes: outcomes.map((o) => o.id), blocks };
  });
}

// ---------------------------------------------------------------- secrets

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@[^\s]+/gi,
  /\b(?:authorization|bearer)\s*[:=]?\s*(?:bearer\s+)?[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\b[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
];

/** A text with each secret removed, and the count of what was removed. */
export function scrubSecrets(text) {
  let removed = 0;
  let out = String(text ?? '');
  for (const re of SECRET_PATTERNS) out = out.replace(re, () => { removed += 1; return '[removed: a secret]'; });
  return { text: out, removed };
}

// ---------------------------------------------------------------- the evidence page

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The evidence page of a run: each outcome beside its evidence. */
export function renderEvidence({ contract, verdicts, units, decisions = [], findings = [], head = null, at }) {
  const rows = list(contract.outcomes).map((o) => {
    const view = verdictView(o, verdicts);
    const mine = verdicts.filter((v) => v.outcome === o.id && !v.void);
    const lastFew = mine.slice(-3);
    const note = o.state === 'unproven' ? `Unproven on this machine: ${esc(o.probe?.why)}. You must check it. Probe: <code>${esc(o.probe?.command)}</code>`
      : o.state === 'held' ? `Held: ${esc(o.held?.question)}`
        : o.kind === 'artifact' && o.state === 'passed' ? 'Judged, not observed.' : '';
    const ev = lastFew.map((v) => {
      const files = list(v.evidence).map((f) => (/\.(png|jpe?g|gif|webp)$/i.test(f) ? `<a href="${esc(f)}"><img src="${esc(f)}" alt="evidence of ${esc(o.id)}"></a>` : `<a href="${esc(f)}">${esc(f)}</a>`)).join(' ');
      return `<div class="v ${esc(v.verdict)}"><b>${esc(v.verdict)}</b> · ${esc(v.set ?? 'none')} · <code>${esc(String(v.commit ?? '').slice(0, 9))}</code><p>${esc(v.observed)}</p>${files}</div>`;
    }).join('');
    return `<tr class="${esc(o.state)}"><td><code>${esc(o.id)}</code><br><span class="k">${esc(o.kind)}</span></td><td>${esc(o.says)}${note ? `<p class="note">${note}</p>` : ''}${view.flaky ? '<p class="note">Flaky: its runs did not agree.</p>' : ''}</td><td><span class="s">${esc(o.state)}</span></td><td>${ev || '—'}</td></tr>`;
  }).join('\n');
  const view = runView(contract, verdicts, { head });
  const choice = decisions.map((d) => `<li><code>${esc(d.key)}</code>: ${esc(d.answer)}</li>`).join('');
  const found = findings.map((f) => `<li><b>${esc(f.severity)}</b> ${esc(f.issue)}${f.file ? ` <code>${esc(f.file)}</code>` : ''}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidence: ${esc(contract.slug)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mute:#666;--line:#ddd;--pass:#1a7f37;--fail:#b42318;--warn:#9a6700}
@media (prefers-color-scheme: dark){:root{--bg:#161616;--fg:#eee;--mute:#aaa;--line:#333;--pass:#4ac26b;--fail:#ff7b72;--warn:#d29922}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;margin-inline:auto}
table{border-collapse:collapse;width:100%}td,th{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
.k,.note{color:var(--mute);font-size:13px}.s{font-weight:600}tr.passed .s{color:var(--pass)}tr.open .s,tr.held .s{color:var(--fail)}tr.unproven .s{color:var(--warn)}
.v{border-left:3px solid var(--line);padding-left:8px;margin-bottom:8px}.v.pass{border-color:var(--pass)}.v.fail{border-color:var(--fail)}.v p{margin:2px 0}
img{max-width:220px;max-height:160px;display:block;margin-top:4px}code{font-size:13px}@media (max-width:700px){td,th{display:block;border-top:0}tr{border-top:1px solid var(--line);display:block;padding:8px 0}}
</style></head><body>
<h1>Evidence: ${esc(contract.slug)}</h1>
<p>${view.counts.passed} of ${view.counts.all} outcomes passed · ${view.counts.held} held · ${view.counts.unproven} unproven · ${view.counts.open} open · path ${esc(contract.path)} · commit <code>${esc(String(head ?? '').slice(0, 9))}</code> · ${esc(at)}</p>
<p>${view.finished ? 'The run finished.' : 'The run has not finished.'} ${list(units).filter((u) => u['fix-of'] != null).length} fix unit(s) of ${list(units).length} unit(s).</p>
<table><thead><tr><th>Outcome</th><th>Says</th><th>State</th><th>Evidence</th></tr></thead><tbody>
${rows}
</tbody></table>
<h2>Choices of the run</h2><ul>${choice || '<li>None.</li>'}</ul>
<h2>Findings left open</h2><ul>${found || '<li>None.</li>'}</ul>
</body></html>
`;
}
