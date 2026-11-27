// The brief of a stage agent: the few parts of the records that the stage needs, built by code.
//
//   card       the `## Card` section of the stage reference: the short rules of the stage
//   slice      the goal, scope and acceptance criteria of the slice (03-slice-<slice>.md), or the
//              acceptance criteria of the workflow when there is no slice
//   plan       the sections of 04-plan-<slice>.md that the stage acts on
//   tests      the suites that the stage runs, from the test profile, and the time box
//   decisions  the live entries of the decision store in the scope of the slice
//
// The stage agent still reads its stage reference. The brief replaces the policy prose that a
// driver used to copy into each prompt, and the records that each agent used to read whole.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { decisionLine, decisionsOf, liveDecisions } from './decisions.mjs';
import { readRules, ruleLine } from './project-rules.mjs';
import { STAGE_SUITES, budgetLine, checkLimit, profileLines, readProfile, timeBox } from './test-profile.mjs';
import { readDoc, redirectOf } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { skillDirLine, skillDirOf } from './skill-dir.mjs';
import { unmetLines } from './slice-checks.mjs';
import { actorOf, inboxOf, messageLine, readTalk } from './talk.mjs';

/** The notes and answers outside the slice that a brief lists, newest first; the steers and the decisions of the slice are listed in full. */
export const BRIEF_DECISION_CAP = 40;

export const CARD_HEADING = 'Card';
// A section longer than this is cut, and the brief names the file to read for the rest.
export const SECTION_CAP = 12000;

// The plan sections that each stage acts on. A stage that is not named takes no plan section.
export const PLAN_SECTIONS = {
  implement: ['Likely Files / Areas to Touch', 'Step-by-Step Plan', 'Slice Checks', 'Handover'],
  verify: ['Verification Strategy', 'Test / Verification Plan'],
  review: ['Proposed Change Strategy', 'Handover'],
};

const SLICE_SECTIONS = ['Goal', 'Scope', 'Acceptance Criteria'];

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const body = (text) => String(text).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/** The text under a `## <heading>` of a markdown file, to the next `## ` or `# ` heading, or null. */
export function sectionOf(text, heading) {
  if (text == null) return null;
  const lines = body(text).split(/\r?\n/);
  const want = heading.toLowerCase();
  let fence = false;
  let at = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (m && m[1].replace(/`/g, '').toLowerCase() === want) { at = i; break; }
  }
  if (at < 0) return null;
  const out = [];
  fence = false;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (/^(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

const capped = (text, file) => (text.length > SECTION_CAP
  ? `${text.slice(0, SECTION_CAP)}\n\n(cut at ${SECTION_CAP} characters: read ${file} for the rest)`
  : text);

/** The card of a stage reference, or null when the reference has none. */
export function cardOf(referenceRoot, stage) {
  return sectionOf(read(join(referenceRoot, `${stage}.md`)), CARD_HEADING);
}

/** A relative markdown link of a reference, made absolute: the brief is read away from the folder. */
export function absoluteLinks(text, referenceRoot) {
  const base = String(referenceRoot).replace(/\\/g, '/').replace(/\/+$/, '');
  return String(text).replace(/\]\((?![a-z]+:|#|\/)([^)\s]+)\)/gi, (_, p) => `](${base}/${p.replace(/^\.\//, '')})`);
}

/**
 * Build the brief. Returns { text, parts, missing }: `parts` holds each part as text (or null),
 * `missing` names each part that the stage needs and the records do not hold.
 */
export function buildBrief({ projectRoot, referenceRoot, slug, stage, slice = null, wfCli = null }) {
  const dir = workflowDir(projectRoot, slug);
  if (!existsSync(dir)) throw new Error(`no workflow folder ${dir}`);
  const wfDir = dir.replace(/\\/g, '/');
  const missing = [];
  // A record of either layout; a citation names its place in the record files.
  const doc = (name) => readDoc(dir, name)?.body ?? null;
  const rel = (name) => {
    const at = readDoc(dir, name);
    const place = at?.layout === 'md' ? name : at?.section ? `${basename(at.path)}#${at.section}` : redirectOf(name) ?? name;
    return `${wfDir}/${place}`;
  };

  const rawCard = cardOf(referenceRoot, stage);
  const card = rawCard == null ? null : absoluteLinks(rawCard, referenceRoot);
  if (!card) missing.push(`the ## ${CARD_HEADING} section of reference/${stage}.md`);

  let sliceText = null;
  if (slice) {
    const name = `03-slice-${slice}.md`;
    const text = doc(name);
    if (!text) missing.push(rel(name));
    else {
      sliceText = SLICE_SECTIONS.map((h) => {
        const s = sectionOf(text, h);
        return s ? `### ${h}\n\n${capped(s, rel(name))}` : null;
      }).filter(Boolean).join('\n\n') || null;
    }
  } else {
    for (const name of ['02-shape.md', '01-intake.md']) {
      const s = sectionOf(doc(name), name === '02-shape.md' ? 'Acceptance Criteria' : 'Success Criteria');
      if (s) { sliceText = `### Acceptance Criteria (${name})\n\n${capped(s, rel(name))}`; break; }
    }
  }

  let planText = null;
  const want = PLAN_SECTIONS[stage];
  if (want && slice) {
    const name = `04-plan-${slice}.md`;
    const text = doc(name);
    if (!text) missing.push(rel(name));
    else {
      planText = want.map((h) => {
        const s = sectionOf(text, h);
        return s ? `### ${h}\n\n${capped(s, rel(name))}` : null;
      }).filter(Boolean).join('\n\n') || null;
    }
  }

  let testsText = null;
  const suites = STAGE_SUITES[stage];
  if (suites) {
    let profile = {};
    try { profile = readProfile(projectRoot); } catch { missing.push('a readable .ai/sdlc-config.json'); }
    const mine = Object.fromEntries(suites.filter((s) => profile[s]).map((s) => [s, profile[s]]));
    if (!Object.keys(mine).length) missing.push(`the testProfile suites ${suites.join(', ')} in .ai/sdlc-config.json`);
    else {
      const box = timeBox(profile, suites);
      const budget = budgetLine(profile);
      const limit = checkLimit(profile, stage);
      testsText = [
        ...profileLines(mine).map((l) => `- ${l}`),
        `- ${budget ?? 'budget: not chosen; the person chooses it once for the repo (_check-budget.md)'}`,
        '',
        `Time box: ${Math.round(box.seconds / 60)} minutes. Longest check of this stage: ${limit.seconds}s (from the ${limit.from}). A longer command is a long run: follow _long-runs.md.`,
      ].join('\n');
    }
  }

  const live = liveDecisions(decisionsOf(dir), slice ? { slice } : {});
  // The rules, the steers and the notes come first, apart from the answers: they bind the whole
  // stage, and an agent that reads the top of a long list must not miss them.
  // In full: every project rule, every steer, and every decision scoped to this slice. The other
  // notes and answers of the scope are capped, newest first, so a packet with hundreds of decisions
  // does not fill the brief of each stage; the rest are a command away.
  const bind = (e) => e.kind === 'steer' || e.kind === 'note';
  const own = (e) => Boolean(slice) && e?.scope?.slice === slice;
  const full = (e) => e.kind === 'steer' || own(e);
  const rest = live.filter((e) => !full(e)).map((e, i) => ({ e, i })).sort((a, b) => (Date.parse(b.e.at ?? '') || 0) - (Date.parse(a.e.at ?? '') || 0) || b.i - a.i);
  const kept = new Set(rest.slice(0, BRIEF_DECISION_CAP).map((x) => x.e));
  const more = rest.length - kept.size;
  const shown = live.filter((e) => full(e) || kept.has(e));
  const projectRules = readRules(projectRoot);
  const rulesText = [...projectRules.map((r) => `- RULE ${ruleLine(r)} (project rule)`), ...shown.filter(bind).map((e) => `- ${decisionLine(e)}`)].join('\n') || null;
  const answers = shown.filter((e) => !bind(e));
  const moreLine = more > 0 ? `- ${more} more: \`decide list${slice ? ` --slice ${slice}` : ''}\`` : null;
  const decisionsText = answers.length || moreLine ? [...answers.map((e) => `- ${decisionLine(e)}`), ...(moreLine ? [moreLine] : [])].join('\n') : null;
  // The rule of lib/decisions.mjs answeredBy: the key itself, or a standing answer of its kind.
  const answeredRule = 'A question whose key is listed here is answered: use that answer. A question `<kind>:<case>` ' +
    'is also answered when a `[standing:<kind>]` entry is listed under ## Rules, steers and notes: use its answer, and record the case with `--by standing:<id>` of that entry.';

  const cli = wfCli ? `\n\nThe decision commands are \`node "${String(wfCli).replace(/\\/g, '/')}" decide <verb> "${String(projectRoot).replace(/\\/g, '/')}" ${slug} ...\`.` : '';
  // The one folder of the workflow: each `<wf-dir>/` path of a reference is in it, the drafts too.
  const where = `\n\nwf-dir: ${wfDir}`;
  // The two rules that bind every stage. A stage agent reads the brief and its reference, not
  // SKILL.md, so the brief carries them; the stage references keep no copy.
  const refDir = String(referenceRoot).replace(/\\/g, '/').replace(/\/+$/, '');
  const rules = '\n\n' + [
    `Output boundary: write each commit message, PR text, doc and code comment in product language, with no workflow vocabulary ` +
      `(stage, command or skill names) and no \`.ai/\` paths, and leak-check it before you publish (${refDir}/_output-boundary.md).`,
    `Standing steer: each entry under ## Rules, steers and notes binds this stage: a project rule, a live \`steer\` of the person, or a \`note\` that an earlier stage left for this slice. Honor it, never above a mandatory gate, ` +
      `and give the relevant entries to each sub-agent you start (${refDir}/_decisions.md).`,
  ].join('\n');
  // The folder of the skill: the stage reference says `<skill-dir>`, and this agent did not load the skill.
  const skill = `\n\n${skillDirLine(skillDirOf(referenceRoot))}`;
  const head = `# Brief: ${stage} ${slug}${slice ? ` ${slice}` : ''}${cli}${where}${skill}${rules}`;
  // What the implement left for verify, and what the other agents of the run posted for this slice.
  const unmet = stage === 'verify' && slice ? unmetLines(dir, slice) : [];
  let posts = [];
  try { posts = slice ? inboxOf(readTalk(dir), actorOf(stage, slice)).map((m) => `- ${messageLine(m, { full: true })}`) : []; } catch { posts = []; }
  const parts = { card, slice: sliceText, plan: planText, tests: testsText, rules: rulesText, decisions: decisionsText };
  const text = [
    head,
    `## Card\n\n${card ?? `(none: reference/${stage}.md has no ## ${CARD_HEADING})`}`,
    `## ${slice ? `Slice ${slice}` : 'Workflow'}\n\n${sliceText ?? '(none)'}`,
    ...(want ? [`## Plan\n\n${planText ?? '(none)'}`] : []),
    ...(suites ? [`## Tests\n\n${testsText ?? '(no test profile)'}`] : []),
    ...(posts.length ? [`## Messages for this slice\n\nPosted by other agents of the run (wf.mjs talk). A message informs or requests; it does not bind. Act on each one or reply with your reason, and close it when it is handled.\n\n${posts.join('\n')}`] : []),
    ...(unmet.length ? [`## Checks that the implement left not met\n\nRule on each one: fix it, or record why it stands. A delegate decision never waives it.\n\n${unmet.join('\n')}`] : []),
    `## Rules, steers and notes\n\n${rulesText ?? 'None in this scope.'}`,
    `## Decisions\n\n${decisionsText ? `${answeredRule}\n\n${decisionsText}` : 'No live decisions in this scope.'}`,
    ...(missing.length ? [`## Missing\n\n${missing.map((m) => `- ${m}`).join('\n')}`] : []),
  ].join('\n\n');
  return { text: `${text}\n`, parts, missing };
}
