// The placement of an issue that a run found: the rung of the ladder, as code.
//
// An agent of the run posts an issue on the talk (`talk post --issue`). A read-only investigate
// agent writes the facts of it into the record `05i-issue-<key>.md`: the cause and its proof,
// the slice that owns it, whether the confirmed scope covers it, and for each open slice whether
// its scope covers it. `placeIssue` reads those facts and picks the lowest rung that holds. The
// agent cannot choose a rung: it can only fail to show that a lower rung holds, and a higher rung
// costs more proof. `wf.mjs issue place` applies the result (lib/issue-apply.mjs).
//
// The rungs:
//   1   the stage of the owner slice that runs now, by a talk request to it
//   2   the next stage of the owner slice, by a talk request that it reads when it starts
//   3   the next slice that has not started, when its scope covers the issue and it has room
//   4   a later slice that has not started, by the same rule
//   4b  the slug-wide review, when no slice is left to take it and the review has not run
//   5   a new slice in this workflow, only with the proof gate
//   6   the next packet of a campaign list, when its scope covers the issue
//   7   a new packet: always a question to the person
// An issue outside the confirmed scope is never placed: it is a question to the person.

/** The step limit of a slice, as slicing writes it: a slice that would pass it is full. */
export const SLICE_STEP_LIMIT = 20;

/** The record of the investigation of an issue, by its talk id: `T-12` → `05i-issue-t12.md`. */
export const issueKeyOf = (talkId) => `t${String(talkId ?? '').replace(/\D/g, '')}`;
export const issueRecordOf = (key) => `05i-issue-${key}.md`;
/** The key of the question to the person about an issue. */
export const issueQuestionKey = (key) => `issue-${key}`;

const DONE_ROSTER = new Set(['complete', 'deferred', 'skipped', 'dropped']);
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const numOr = (v, d = null) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

/**
 * The state of each slice for the placer, from the slice rows of `wf.mjs status --json`
 * (`{ slice, roster, plan, implement, verify, review }`, each stage the status of its record).
 * A slice is `done` when its roster says so or its verify is complete; `started` when its
 * implement record exists; an open slice that has not started can take a carried issue.
 * `running` names the stages that run now (`implement:api`): the driver knows them before
 * their records exist.
 */
export function sliceStates(rows = [], running = []) {
  const now = new Map((Array.isArray(running) ? running : String(running ?? '').split(','))
    .map((a) => String(a).trim()).filter((a) => a.includes(':')).map((a) => [a.slice(a.indexOf(':') + 1), a.slice(0, a.indexOf(':'))]));
  return rows.filter((r) => r && r.slice).map((r, order) => {
    const name = String(r.slice);
    const done = DONE_ROSTER.has(str(r.roster)) || r.verify === 'complete';
    const runningStage = now.get(name) ?? null;
    const started = !done && (Boolean(r.implement) || ['implement', 'verify', 'review'].includes(runningStage));
    const stage = done ? null : runningStage && runningStage !== 'plan' ? runningStage : !r.implement || r.implement !== 'complete' ? 'implement' : 'verify';
    return { slice: name, order, roster: r.roster ?? null, done, started, stage };
  });
}

/** The facts of an investigation that the rungs need, and the ones that are missing. */
export function missingFacts(inv, states) {
  const missing = [];
  if (!inv || typeof inv !== 'object') return ['the investigation'];
  if (!str(inv.cause?.summary) && !str(inv.cause?.file)) missing.push('cause');
  if (typeof inv.scope?.inside !== 'boolean') missing.push('scope.inside');
  const covered = new Set((Array.isArray(inv.coverage) ? inv.coverage : []).filter((c) => c && typeof c.covers === 'boolean').map((c) => String(c.slice)));
  for (const s of states) if (!s.done && !s.started && !covered.has(s.slice)) missing.push(`coverage of ${s.slice}`);
  return missing;
}

/**
 * Place one issue.
 *
 * @param {object} inv the investigation: `{ cause: { file, line, commit, summary, confidence },
 *   reproduction: { command, tail }, owner: { slice, insideCriteria }, scope: { inside, cites },
 *   coverage: [{ slice, covers, cites, reason, stepsLeft }], size: { steps },
 *   proposal: { slice, title, scope, ac: [] }, packetFit: { packet, fits, cites, reason } }`
 * @param {object} ctx
 * @param {object[]} ctx.slices the slice states (sliceStates)
 * @param {string|null} [ctx.reporter] the actor that posted the issue (`implement:api`)
 * @param {boolean} [ctx.reviewOpen] the slug-wide review has not run yet
 * @param {string|null} [ctx.nextPacket] the key of the next packet of a campaign list, when the workflow is one
 * @param {number} [ctx.above] place above this rung only (a target refused, or it ended without the issue)
 * @param {boolean} [ctx.final] a second investigation: missing facts go to the person, not to a new investigation
 * @returns {{ status: 'placed'|'ask'|'incomplete', rung: number|string|null, target: string|null, action: string,
 *   why: string, lower: { rung: number|string, failed: string }[], gate: { pass: boolean, failed: string[] } | null,
 *   ask?: { reason: string, question: string, options: string[], recommended: string } , missing?: string[] }}
 */
export function placeIssue(inv, { slices = [], reporter = null, reviewOpen = false, nextPacket = null, above = 0, final = false } = {}) {
  const lower = [];
  const out = (fields) => ({ lower, gate: null, ...fields });
  const rank = (r) => (r === '4b' ? 4.5 : Number(r));
  const allowed = (r) => rank(r) > rank(above || 0);
  const missing = missingFacts(inv, slices);
  if (missing.length) {
    if (!final) return out({ status: 'incomplete', rung: null, target: null, action: 'investigate-again', why: `the investigation lacks: ${missing.join(', ')}`, missing });
    return out({ status: 'ask', rung: null, target: null, action: 'hold', why: `a second investigation still lacks: ${missing.join(', ')}`, missing, ask: askOf(inv, 'incomplete', missing) });
  }
  // The confirmed scope comes first: an issue outside it is the person's to place.
  if (inv.scope.inside === false) {
    return out({ status: 'ask', rung: null, target: null, action: 'hold', why: `outside the confirmed scope${str(inv.scope.cites) ? ` (${str(inv.scope.cites)})` : ''}`, ask: askOf(inv, 'scope') });
  }
  const open = slices.filter((s) => !s.done);
  const owner = str(inv.owner?.slice) ? slices.find((s) => s.slice === str(inv.owner.slice)) ?? null : null;

  // Rungs 1 and 2: the owner slice, while it still runs a stage, inside its own criteria.
  if (owner && !owner.done && owner.started && inv.owner.insideCriteria === true) {
    const actor = `${owner.stage}:${owner.slice}`;
    const rung = reporter === actor ? 1 : 2;
    if (allowed(rung)) return out({ status: 'placed', rung, target: actor, action: 'deliver', why: `the cause is inside the criteria of '${owner.slice}', whose ${owner.stage} ${rung === 1 ? 'runs now' : 'runs next'}` });
    lower.push({ rung, failed: `'${owner.slice}' was given the issue and did not take it` });
  } else if (owner) {
    lower.push({ rung: 1, failed: owner.done ? `the owner slice '${owner.slice}' is done` : !owner.started ? `the owner slice '${owner.slice}' has not started; it is a carry` : `the cause is outside the criteria of '${owner.slice}'` });
  } else {
    lower.push({ rung: 1, failed: 'no slice of the run owns the cause' });
  }

  // Rungs 3 and 4: the first open slice that has not started, covers the issue and has room.
  const steps = numOr(inv.size?.steps);
  const coverage = new Map((inv.coverage ?? []).map((c) => [String(c.slice), c]));
  const waiting = open.filter((s) => !s.started).sort((a, b) => a.order - b.order);
  const full = [];
  waiting.forEach((s, i) => {
    const c = coverage.get(s.slice);
    if (!c?.covers) return;
    const left = numOr(c.stepsLeft, SLICE_STEP_LIMIT);
    if (steps !== null && steps > left) full.push({ slice: s.slice, steps, left, i });
  });
  for (let i = 0; i < waiting.length; i += 1) {
    const s = waiting[i];
    const c = coverage.get(s.slice);
    const rung = i === 0 ? 3 : 4;
    if (!c?.covers) { lower.push({ rung, failed: `'${s.slice}' does not cover it: ${str(c?.reason) || 'no reason given'}` }); continue; }
    const f = full.find((x) => x.slice === s.slice);
    if (f) { lower.push({ rung, failed: `'${s.slice}' covers it but is full: the fix needs ${f.steps} steps and it has ${f.left} left of ${SLICE_STEP_LIMIT}` }); continue; }
    if (!allowed(rung)) { lower.push({ rung, failed: `'${s.slice}' was given the issue and did not take it` }); continue; }
    return out({ status: 'placed', rung, target: s.slice, action: 'carry', why: `the scope of '${s.slice}' covers it${str(c.cites) ? ` (${str(c.cites)})` : ''}` });
  }
  if (!waiting.length) lower.push({ rung: 3, failed: 'no slice that has not started is left' });

  // Rung 4b: no slice is left to take it, and the slug-wide review has not run.
  if (!waiting.length && reviewOpen && allowed('4b')) {
    return out({ status: 'placed', rung: '4b', target: 'review:slug-wide', action: 'deliver', why: 'no slice is left to take it; the slug-wide review has not run' });
  }

  // Rung 5: a new slice, with the proof gate.
  const failed = [];
  if (str(inv.cause?.confidence) !== 'reproduced') failed.push('the cause is not reproduced');
  if (!str(inv.reproduction?.command)) failed.push('no reproduction command');
  for (const s of waiting) {
    const c = coverage.get(s.slice);
    if (c?.covers && !full.some((x) => x.slice === s.slice)) failed.push(`'${s.slice}' covers it and has room`);
    if (c && c.covers === false && !str(c.reason)) failed.push(`'${s.slice}' gives no reason that it does not cover it`);
  }
  const proposal = inv.proposal && str(inv.proposal.slice) && str(inv.proposal.scope) && Array.isArray(inv.proposal.ac) && inv.proposal.ac.length ? inv.proposal : null;
  if (!proposal) failed.push('no proposal of the new slice (slice, scope, ac)');
  const gate = { pass: failed.length === 0, failed };
  if (gate.pass && allowed(5)) {
    return { lower, gate, status: 'placed', rung: 5, target: str(proposal.slice), action: 'add', why: 'no open slice can take it, and the proof gate holds' };
  }
  lower.push({ rung: 5, failed: gate.pass ? 'a new slice was refused' : failed.join('; ') });

  // Rung 6: the next packet of a campaign list.
  if (nextPacket && inv.packetFit?.fits === true && allowed(6)) {
    return { lower, gate, status: 'placed', rung: 6, target: String(nextPacket), action: 'packet', why: `the scope of the next packet covers it${str(inv.packetFit.cites) ? ` (${str(inv.packetFit.cites)})` : ''}` };
  }
  lower.push({ rung: 6, failed: !nextPacket ? 'the workflow is not a packet of a campaign list, or no packet is next' : `the next packet does not cover it: ${str(inv.packetFit?.reason) || 'no reason given'}` });

  // Rung 7, and every other case: the person decides.
  return { lower, gate, status: 'ask', rung: 7, target: null, action: 'hold', why: 'no rung below a new packet holds', ask: askOf(inv, 'rung7', [], gate) };
}

/** The question to the person about an issue that the placer cannot place. */
function askOf(inv, reason, missing = [], gate = null) {
  const what = str(inv?.cause?.summary) || str(inv?.observation) || 'an issue that the run found';
  const options = ['Add a slice in this workflow', 'Leave it to a later packet or workflow', 'Park it'];
  const lead = {
    scope: `The run found an issue outside the confirmed scope of this workflow: ${what}.`,
    incomplete: `The run found an issue that two investigations could not place (${missing.join(', ')}): ${what}.`,
    rung7: `The run found an issue that no open slice and no next packet can take: ${what}.`,
  }[reason];
  const recommended = reason === 'scope' ? options[1] : gate && gate.failed.length === 1 && /proposal/.test(gate.failed[0]) ? options[0] : options[1];
  return { reason, question: `${lead} Where does it go?`, options, recommended };
}

/** One line of a placement, for the talk thread and the log. */
export function placementLine(p) {
  if (p.status === 'ask') return `placed: held for the person — ${p.why}`;
  if (p.status === 'incomplete') return `placed: not yet — ${p.why}`;
  return `placed: rung ${p.rung} → ${p.target} — ${p.why}`;
}
