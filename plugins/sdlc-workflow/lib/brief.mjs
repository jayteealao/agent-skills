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
import { STAGE_SUITES, profileLines, readProfile, timeBox } from './test-profile.mjs';
import { readDoc, redirectOf } from './records.mjs';
import { workflowDir, workflowRel } from './records-root.mjs';

export const CARD_HEADING = 'Card';
// A section longer than this is cut, and the brief names the file to read for the rest.
export const SECTION_CAP = 12000;

// The plan sections that each stage acts on. A stage that is not named takes no plan section.
export const PLAN_SECTIONS = {
  implement: ['Likely Files / Areas to Touch', 'Step-by-Step Plan', 'Handover'],
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
  const missing = [];
  // A record of either layout; a citation names its place in the record files.
  const doc = (name) => readDoc(dir, name)?.body ?? null;
  const rel = (name) => {
    const at = readDoc(dir, name);
    const place = at?.layout === 'md' ? name : at?.section ? `${basename(at.path)}#${at.section}` : redirectOf(name) ?? name;
    return `${workflowRel(slug)}/${place}`;
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
      testsText = [...profileLines(mine).map((l) => `- ${l}`), '', `Time box: ${Math.round(box.seconds / 60)} minutes.`].join('\n');
    }
  }

  const live = liveDecisions(decisionsOf(dir), slice ? { slice } : {});
  const decisionsText = live.length ? live.map((e) => `- ${decisionLine(e)}`).join('\n') : null;

  const cli = wfCli ? `\n\nThe decision commands are \`node "${String(wfCli).replace(/\\/g, '/')}" decide <verb> "${String(projectRoot).replace(/\\/g, '/')}" ${slug} ...\`.` : '';
  const head = `# Brief: ${stage} ${slug}${slice ? ` ${slice}` : ''}${cli}`;
  const parts = { card, slice: sliceText, plan: planText, tests: testsText, decisions: decisionsText };
  const text = [
    head,
    `## Card\n\n${card ?? `(none: reference/${stage}.md has no ## ${CARD_HEADING})`}`,
    `## ${slice ? `Slice ${slice}` : 'Workflow'}\n\n${sliceText ?? '(none)'}`,
    ...(want ? [`## Plan\n\n${planText ?? '(none)'}`] : []),
    ...(suites ? [`## Tests\n\n${testsText ?? '(no test profile)'}`] : []),
    `## Decisions\n\n${decisionsText ?? 'No live decisions in this scope.'}`,
    ...(missing.length ? [`## Missing\n\n${missing.map((m) => `- ${m}`).join('\n')}`] : []),
  ].join('\n\n');
  return { text: `${text}\n`, parts, missing };
}
