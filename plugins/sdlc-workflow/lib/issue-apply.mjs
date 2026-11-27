// `wf.mjs issue place`: place one issue of the talk, and apply the placement.
//
// The investigate agent wrote the facts into `05i-issue-<key>.md`. This reads them with the
// state of the slices, runs the placer (lib/issue-place.mjs), writes the placement into the
// record, and with `apply` does what the rung says:
//   deliver  a talk request in the issue thread to the stage that takes it (rungs 1, 2, 4b)
//   carry    `slice carry` into the slice, then the thread closes (rungs 3, 4)
//   add      `slice add` from the proposal of the investigation, then the thread closes (rung 5)
//   packet   the issue goes to the next packet of the campaign list, then the thread closes (rung 6)
//   hold     a held question to the person (out of scope, rung 7, an incomplete investigation)
// A placement that was applied is not applied again: the record says so, and the call prints
// `already`. An answer of the person to the held question is applied the same way.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { answeredBy, decisionsOf } from './decisions.mjs';
import { issueKeyOf, issueQuestionKey, issueRecordOf, placeIssue, placementLine, sliceStates } from './issue-place.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from './records.mjs';
import { addSlice, carrySlice } from './slice-ops.mjs';
import { close, issuesOf, post, readTalk } from './talk.mjs';
import { sliceRows } from './wf-status.mjs';
import { holdQuestion } from './wf-ops.mjs';
import { writeFileAtomic } from './atomic-write.mjs';
import { safeParseFrontmatter } from './frontmatter.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The next packet of the campaign list of a packet workflow: `{ key, slug, file, workDir }`, or null. */
export function nextPacketOf(projectRoot, index) {
  const origin = index?.['origin-packet'];
  if (!origin) return null;
  const file = resolve(projectRoot, String(origin));
  const workDir = dirname(file);
  if (!existsSync(file) || !existsSync(workDir)) return null;
  const read = (f) => { try { return safeParseFrontmatter(readFileSync(f, 'utf8')).data ?? null; } catch { return null; } };
  const own = read(file);
  if (!own) return null;
  const packets = readdirSync(workDir).filter((f) => f.endsWith('.md') && !['index.md', 'changes.md', 'migration.md'].includes(f))
    .map((f) => ({ f, d: read(join(workDir, f)) })).filter((x) => x.d?.type === 'packet');
  const next = packets.filter((x) => Number(x.d.order ?? 0) > Number(own.order ?? 0) && ['written', 'open'].includes(String(x.d.state ?? 'written')))
    .sort((a, b) => Number(a.d.order) - Number(b.d.order))[0];
  return next ? { key: String(next.d.key), slug: String(next.d['packet-slug'] ?? next.d.key), file: join(workDir, next.f), workDir } : null;
}

/** The issues carried into a packet that has no workflow yet: `work/<packet-slug>.issues.json`, written only here and by campaign.mjs. */
export const packetIssuesFile = (packet) => join(packet.workDir, `${packet.slug}.issues.json`);
export function readPacketIssues(file) {
  try { const d = JSON.parse(readFileSync(file, 'utf8')); return Array.isArray(d.issues) ? d.issues : []; } catch { return []; }
}
export function carryToPacket(packet, row) {
  const file = packetIssuesFile(packet);
  const issues = readPacketIssues(file);
  if (issues.some((i) => i.placement === row.placement)) return { packet: packet.key, carried: false, already: true };
  writeFileAtomic(file, `${JSON.stringify({ packet: packet.key, issues: [...issues, row] }, null, 2)}\n`);
  return { packet: packet.key, carried: true, file };
}

const ANSWERS = { add: /add a slice/i, later: /later|packet|workflow/i, park: /park/i };

/**
 * Place the issue `issueId` of the workflow folder `dir`.
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {boolean} [o.apply] do what the rung says
 * @param {string[]|string} [o.running] the stages that run now (`implement:api`)
 * @param {boolean} [o.reviewOpen] the slug-wide review has not run
 * @param {boolean} [o.final] the second investigation: missing facts go to the person
 * @param {string} [o.as] the placer: driver (default) or session
 */
export function placeAndApply(dir, issueId, { projectRoot, apply = false, running = [], reviewOpen = false, final = false, as = 'driver' } = {}) {
  const issue = issuesOf(readTalk(dir)).find((i) => i.id === issueId);
  if (!issue) throw new Error(`issue place: ${issueId} is no issue of the talk; list them with talk read --issues`);
  const key = issueKeyOf(issueId);
  const record = issueRecordOf(key);
  const fm = frontmatterOfDoc(dir, record);
  if (!fm) throw new Error(`issue place: no investigation ${record}; the investigate agent writes it first`);
  if (issue.closed) return { issue: issueId, record, already: true, closed: issue.closed, placement: fm.placement ?? null };
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const states = sliceStates(sliceRows(dir), running);
  const packet = nextPacketOf(projectRoot, index);
  // A refusal, or a target that ended without the issue, places it one rung higher.
  const prior = fm.placement ?? null;
  const priorTargetDone = prior?.action === 'deliver' && prior.applied && String(prior.target) !== 'review:slug-wide'
    && states.find((s) => s.slice === String(prior.target).split(':')[1])?.done;
  const refused = issue.refused.length > 0 || priorTargetDone;
  if (prior?.applied && !refused && prior.status !== 'ask') return { issue: issueId, record, already: true, placement: prior };
  const decisions = decisionsOf(dir);
  const answer = prior?.status === 'ask' ? answeredBy(decisions, issueQuestionKey(key)) : null;
  if (prior?.status === 'ask' && prior.applied && !answer) return { issue: issueId, record, already: true, waiting: issueQuestionKey(key), placement: prior };

  let p = answer ? fromAnswer(fm, answer, states, packet) : placeIssue(fm, {
    slices: states, reporter: issue.by, reviewOpen, nextPacket: packet?.key ?? null, final,
    above: refused && prior?.rung ? prior.rung : 0,
  });
  const placement = { ...p, at: nowIso(), applied: false, ...(answer ? { answer: answer.id } : {}), ...(prior ? { previous: { rung: prior.rung, target: prior.target } } : {}) };
  setFields(dir, record, { placement });
  if (!apply || p.status === 'incomplete') return { issue: issueId, record, placement, applied: false };

  const line = placementLine(p);
  let result = null;
  const text = `${issue.text}${issue.refs.length ? ` {${issue.refs.join(', ')}}` : ''}`;
  if (p.action === 'deliver') {
    result = post(dir, { by: as, to: [p.target], re: issueId, kind: 'request', text: `${line}. Take this issue into your stage: ${text}. Investigation: ${record}. Close the thread when it is handled; when you cannot take it, reply "cannot: <why>".`, refs: issue.refs }).entry;
  } else if (p.action === 'carry') {
    result = carrySlice(dir, p.target, { issue: issueId, text: fm.cause?.summary ? `${fm.cause.summary} (${issue.text})` : issue.text, placement: record }, { decisions });
  } else if (p.action === 'add') {
    const prop = fm.proposal ?? {};
    const owner = String(fm.owner?.slice ?? '');
    const after = [...new Set([...(Array.isArray(prop.after) ? prop.after : []), ...(owner && states.some((s) => s.slice === owner && s.roster !== 'dropped') ? [owner] : [])])];
    result = addSlice(dir, {
      slice: p.target, title: prop.title, scope: prop.scope, ac: prop.ac, after, before: prop.before ?? [], files: prop.files ?? [],
      complexity: prop.complexity, uxImpact: prop.uxImpact ?? 'none', madeFor: key,
      ...(answer ? { by: 'person', decision: answer.id } : { placement: record }),
    }, { decisions });
  } else if (p.action === 'packet') {
    result = carryToPacket(packet, { issue: `${index.slug ?? ''}:${issueId}`, text: fm.cause?.summary ?? issue.text, record: `${index.slug ?? ''}/${record}`, placement: `${index.slug ?? ''}/${record}`, at: nowIso() });
  } else if (p.action === 'hold') {
    result = holdQuestion(dir, { key: issueQuestionKey(key), question: p.ask.question, stage: 'yolo', options: p.ask.options, recommended: p.ask.recommended });
  } else if (p.action === 'park') {
    result = { parked: true };
  }
  const closes = ['carry', 'add', 'packet', 'park'].includes(p.action);
  if (p.action !== 'deliver') post(dir, { by: as, to: [issue.by], re: issueId, kind: 'info', text: `${line}. Investigation: ${record}.` });
  if (closes) close(dir, as, issueId, `${line}; ${record}`);
  setFields(dir, record, { placement: { ...placement, applied: true, 'applied-at': nowIso() } });
  return { issue: issueId, record, placement: { ...placement, applied: true }, applied: true, result, closed: closes };
}

/** The placement that an answer of the person to the held question of an issue gives. */
function fromAnswer(fm, answer, states, packet) {
  const a = String(answer.answer ?? '');
  const lower = [{ rung: 'person', failed: `the person answered: ${a}` }];
  if (ANSWERS.add.test(a)) {
    const name = String(fm.proposal?.slice ?? '').trim();
    if (!name) return { status: 'ask', rung: null, target: null, action: 'park', why: `the person chose a new slice, but the investigation proposes none (${answer.id}); add it with slice add --by person`, lower, gate: null };
    return { status: 'placed', rung: 5, target: name, action: 'add', why: `the person chose a new slice (${answer.id})`, lower, gate: { pass: true, failed: [], by: 'person' } };
  }
  if (ANSWERS.later.test(a) && packet) return { status: 'placed', rung: 6, target: packet.key, action: 'packet', why: `the person sent it to a later packet (${answer.id})`, lower, gate: null };
  return { status: 'placed', rung: null, target: null, action: 'park', why: `the person ${ANSWERS.park.test(a) ? 'parked it' : `answered "${a}"`} (${answer.id})`, lower, gate: null };
}
