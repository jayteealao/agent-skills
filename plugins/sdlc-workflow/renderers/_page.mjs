// renderers/_page.mjs — the four-part human page (ARTIFACT-SPLIT-PLAN W5).
//
// Every stage page with an explainer fragment has the same four parts, in this
// order. The renderer fills parts 2–4 from agent data, so the page cannot
// contradict the contract:
//
//   1. Explainer          — `<stem>.explainer.html.fragment`, verbatim.
//   2. Waiting for you    — frontmatter: open questions, gates, verdict, next.
//   3. The contract       — a stage-specific table from the contract sections,
//                           the frontmatter and the sibling YAML (STAGE_RECIPES).
//   4. Evidence & history — collapsed: evidence files, related records, prior
//                           revisions, and the full agent record (the stage
//                           renderer's own output).
//
// The orchestrator (scripts/render-sunflower.mjs) calls composeStagePage after
// the stage renderer has run, so the stage renderers stay unchanged. An
// artifact without an explainer (an old slug, D5) never reaches this module:
// it keeps today's page (story lifted, full body).

import { md2html, mdInline } from './_markdown.mjs';
import { escapeHtml } from './_validator.mjs';
import { splitSections } from './_story.mjs';
import { posix } from 'node:path';
import { pageHref } from './_paths.mjs';

/** Relative href between two view-relative page paths (both end in INDEX.html). */
export function viewHref(fromViewRel, toViewRel) {
  const rel = posix.relative(posix.dirname(String(fromViewRel || 'INDEX.html')), String(toViewRel));
  return rel || 'INDEX.html';
}

/* ─────────────────────────── stage identification ─────────────────────────── */

/**
 * The page recipe key for an artifact, or null when the artifact keeps its
 * current page (brainstorm, review dimension files, off-pipeline types).
 */
export function stageKeyFor({ type, frontmatter = {}, path = '' }) {
  const base = String(path).replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '');
  if (type === 'brainstorm') return null;              // keeps its current page
  if (base === '01-task') return 'task';
  if (type === 'slice' && frontmatter['slice-type'] === 'probe') return 'probe';
  if (type === 'slice' && frontmatter['slice-type'] === 'task') return 'task';
  const map = {
    intake: 'intake',
    shape: 'shape',
    design: 'design',
    'design-contract': 'design',
    slice: 'slice',
    'slice-index': 'slice',
    plan: 'plan',
    implement: 'implement',
    verify: 'verify',
    review: 'review',
    handoff: 'handoff',
    'ship-run': 'ship',
    ship: 'ship',
    retro: 'retro',
    recap: 'recap',
    'close-record': 'close',
  };
  return map[type] ?? null;
}

/* ─────────────────────────────── section lookup ─────────────────────────────── */

function normHeading(h) {
  return String(h ?? '')
    .replace(/[*_`]/g, '')
    .replace(/^\s*\d+[.)]\s*/, '')      // "6. Revival instructions" → "Revival instructions"
    .trim()
    .toLowerCase();
}

/** First section whose normalised heading matches one of `patterns`. */
export function findSection(sections, patterns) {
  for (const re of patterns) {
    const hit = sections.find((s) => re.test(normHeading(s.heading)));
    if (hit && hit.markdown) return hit;
  }
  return null;
}

/* ─────────────────────────────── recipe rows ─────────────────────────────── */

// A row source is one of:
//   { sections: [RegExp…] }  — the first matching contract section, rendered
//   { fm: [key…] }           — the first present frontmatter key
//   { fn: (ctx) => html }    — a computed cell (sibling YAML, roster, …)
// A row renders only when a source yields content; sources are tried in order.

const S = (...patterns) => ({ sections: patterns });
const F = (...keys) => ({ fm: keys });
const C = (fn) => ({ fn });

export const STAGE_RECIPES = {
  intake: [
    { label: 'Restated request', from: [S(/^restated request/, /^problem statement/)] },
    { label: 'Charter', from: [F('charter'), S(/^charter/)] },
    { label: 'Success criteria', from: [S(/^success criteria/, /^intended outcome/)] },
    { label: 'Out of scope', from: [S(/^out of scope/)] },
  ],
  shape: [
    { label: 'Acceptance criteria', from: [S(/^acceptance criteria/)] },
    { label: 'Non-functional requirements', from: [S(/^non-functional requirements/)] },
    { label: 'Edge cases', from: [S(/^edge cases/)] },
    { label: 'Out of scope', from: [S(/^out of scope/)] },
  ],
  design: [
    { label: 'Direction confirmed', from: [F('direction', 'design-direction'), S(/^direction/, /^visual direction/, /^design direction/)] },
    { label: 'North-star mock', from: [F('north-star', 'north-star-mock'), S(/north[- ]star/)] },
    { label: 'Mock fidelity list', from: [S(/^mock fidelity inventory/, /^mock fidelity/)] },
  ],
  slice: [
    { label: 'Slices', from: [C(sliceRosterCell)] },
    { label: 'Order', from: [F('order', 'slice-order'), S(/^recommended order/)] },
    { label: 'Status', from: [F('status')] },
    { label: 'Acceptance criteria', from: [S(/^acceptance criteria/)] },
  ],
  plan: [
    { label: 'Steps', from: [S(/^step-by-step plan/, /^proposed change strategy/, /^steps/), C(yamlStepsCell)] },
    { label: 'Files to touch', from: [C(yamlFilesCell), S(/^likely files/, /^files to touch/)] },
    { label: 'Risks', from: [S(/^risks/), C(yamlListCell('risks'))] },
    { label: 'Blockers', from: [S(/^blockers/), C(blockersFlagCell)] },
  ],
  implement: [
    { label: 'What changed', from: [S(/^summary of changes/, /^what changed/), F('files-modified')] },
    { label: 'Files changed', from: [F('files-modified'), S(/^files changed/)] },
    { label: 'Deviations from the plan', from: [S(/^deviations from plan/, /^deviations/)] },
    { label: 'Deferred', from: [S(/^anything deferred/, /^deferred/)] },
  ],
  verify: [
    { label: 'Result', from: [C(verdictCell(['result', 'verdict', 'recommendation'])), S(/^verification summary/, /^recommendation/)] },
    { label: 'Acceptance criteria status', from: [S(/^acceptance criteria status/, /^acceptance criteria/)] },
    { label: 'Gaps', from: [S(/^gaps/, /unverified areas/)] },
    { label: 'Issues', from: [S(/^issues found/, /^issues/)] },
  ],
  review: [
    { label: 'Verdict', from: [C(verdictCell(['verdict', 'result'])), S(/^verdict/)] },
    { label: 'Open findings by severity', from: [C(openFindingsCell), S(/must fix/, /^all findings/)] },
    { label: 'Triage decisions', from: [S(/^triage decisions/, /^triage/)] },
  ],
  probe: [
    { label: 'What was probed', from: [S(/^what was probed/, /^scope/, /^targets/)] },
    { label: 'Findings', from: [S(/^findings/)] },
    { label: 'Recommended next command', from: [C(nextCommandCell), S(/^recommended next command/)] },
  ],
  handoff: [
    { label: 'Readiness verdict', from: [C(verdictCell(['readiness-verdict', 'pr-readiness-verdict', 'verdict']))] },
    { label: 'Pull request', from: [C(prLinkCell)] },
    { label: 'Reviewer focus', from: [S(/^reviewer focus/)] },
    { label: 'Rollout notes', from: [S(/rollout notes/, /^migration/, /^rollout/)] },
  ],
  ship: [
    { label: 'Go / No-Go', from: [C(verdictCell(['go-nogo', 'go-no-go', 'decision'])), S(/^go \/ no-go/, /^go\/no-go/)] },
    { label: 'Version', from: [F('version', 'release-version', 'target-version', 'tag')] },
    { label: 'Release steps', from: [C(yamlStagesCell), S(/^release steps/, /^pre-flight/)] },
    { label: 'Rollback state', from: [C(rollbackCell), S(/^rollout decision/, /^rollback/, /^recovery actions/)] },
  ],
  retro: [
    { label: 'What went well', from: [S(/^what went well/)] },
    { label: 'Friction', from: [S(/^friction/, /^what went wrong/)] },
    { label: 'Root causes', from: [S(/^root causes/)] },
    { label: 'Recommended improvements', from: [S(/^recommended improvements/)] },
  ],
  close: [
    { label: 'Reason', from: [F('close-reason', 'reason'), S(/reason/)] },
    { label: 'Revival steps', from: [S(/reviv/)] },
  ],
  task: [
    { label: 'Steps', from: [S(/^steps/, /^plan/, /^the work/)] },
    { label: 'Evidence per acceptance criterion', from: [S(/evidence/, /^acceptance criteria/)] },
  ],
};

/* ───────────────────────────── computed cells ───────────────────────────── */

function scalar(v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.length ? `<ul>${v.map((x) => `<li>${cellValue(x)}</li>`).join('')}</ul>` : '';
  if (typeof v === 'object') return `<code>${escapeHtml(JSON.stringify(v))}</code>`;
  return mdInline(String(v));
}

function cellValue(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const label = v.path ?? v.file ?? v.title ?? v.name ?? v.id ?? v.slug;
    const extra = v.status ?? v.role ?? v.state;
    if (label != null) return `<code>${escapeHtml(label)}</code>${extra ? ` <span class="meta">${escapeHtml(extra)}</span>` : ''}`;
    return `<code>${escapeHtml(JSON.stringify(v))}</code>`;
  }
  return mdInline(String(v ?? ''));
}

function verdictCell(keys) {
  return ({ fm, sy }) => {
    for (const k of keys) {
      const v = sy?.[k] ?? fm?.[k];
      if (v != null && v !== '') return `<strong>${escapeHtml(v)}</strong>`;
    }
    return '';
  };
}

function yamlFilesCell({ sy }) {
  const files = Array.isArray(sy?.files) ? sy.files : null;
  if (!files?.length) return '';
  return `<ul>${files.map((f) => `<li>${cellValue(typeof f === 'string' ? f : { path: f.path ?? f.file ?? f.id, status: f.status ?? f.role })}</li>`).join('')}</ul>`;
}

function yamlStepsCell({ sy }) {
  const steps = Array.isArray(sy?.steps) ? sy.steps : null;
  if (!steps?.length) return '';
  return `<ol>${steps.map((s) => `<li>${typeof s === 'object' ? mdInline(String(s.title ?? s.text ?? s.summary ?? s.name ?? JSON.stringify(s))) : mdInline(String(s))}</li>`).join('')}</ol>`;
}

function yamlListCell(key) {
  return ({ sy }) => {
    const list = Array.isArray(sy?.[key]) ? sy[key] : null;
    if (!list?.length) return '';
    return `<ul>${list.map((r) => `<li>${typeof r === 'object' ? mdInline(String(r.title ?? r.risk ?? r.summary ?? r.text ?? JSON.stringify(r))) : mdInline(String(r))}</li>`).join('')}</ul>`;
  };
}

function yamlStagesCell({ sy }) {
  const stages = Array.isArray(sy?.stages) ? sy.stages : Array.isArray(sy?.steps) ? sy.steps : null;
  if (!stages?.length) return '';
  const rows = stages.map((s) => `<tr><td>${escapeHtml(s?.name ?? s?.label ?? s?.id ?? '')}</td><td>${escapeHtml(s?.status ?? s?.state ?? '')}</td></tr>`).join('');
  return `<table class="prose-table"><thead><tr><th>Step</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function rollbackCell({ fm, sy }) {
  const r = sy?.rollback;
  if (r && typeof r === 'object') {
    const state = r.state ?? r.status ?? (r.ready === true ? 'ready' : r.ready === false ? 'not ready' : '');
    const how = r.command ?? r.plan ?? r.how ?? '';
    if (state || how) return `${state ? `<strong>${escapeHtml(state)}</strong>` : ''}${how ? ` <code>${escapeHtml(how)}</code>` : ''}`;
  }
  const keys = Object.keys(fm ?? {}).filter((k) => /^rollback/.test(k)).sort();
  if (!keys.length) return '';
  return keys.map((k) => `<code>${escapeHtml(k)}</code>: ${escapeHtml(fm[k])}`).join('<br>');
}

function blockersFlagCell({ fm }) {
  if (fm?.['has-blockers'] === true) return '<strong>Yes</strong> — see the full record.';
  if (fm?.['has-blockers'] === false) return 'None.';
  return '';
}

function prLinkCell({ fm }) {
  const url = fm?.['pr-url'] ?? fm?.['pr-link'];
  const num = fm?.['pr-number'];
  if (url) return `<a href="${escapeHtml(url)}">${escapeHtml(num ? `#${num}` : url)}</a>`;
  if (num != null && num !== '') return `#${escapeHtml(num)}`;
  return '';
}

function nextCommandCell({ fm, sections }) {
  const routes = nextRoutes(fm, sections);
  const def = routes.find((r) => r.default) ?? routes[0];
  return def?.invocation ? `<code>${escapeHtml(def.invocation)}</code>${def.reason ? ` — ${escapeHtml(def.reason)}` : ''}` : '';
}

const OPEN_FINDING_CLOSED = new Set(['fixed', 'resolved', 'closed', 'dismissed', 'wontfix', 'accepted', 'done']);
const SEVERITIES = ['blocker', 'high', 'med', 'low', 'nit'];

function openFindingsCell({ fm, sy }) {
  const findings = Array.isArray(sy?.findings) ? sy.findings : null;
  if (findings) {
    const open = findings.filter((f) => !OPEN_FINDING_CLOSED.has(String(f?.status ?? 'open').toLowerCase()));
    if (!open.length) return 'No open findings.';
    const by = new Map();
    for (const f of open) {
      let sev = String(f?.severity ?? 'unrated').toLowerCase();
      if (sev === 'medium') sev = 'med';
      if (!by.has(sev)) by.set(sev, []);
      by.get(sev).push(f);
    }
    const order = [...SEVERITIES, ...[...by.keys()].filter((k) => !SEVERITIES.includes(k)).sort()];
    return `<ul>${order.filter((s) => by.has(s)).map((s) => {
      const items = by.get(s).map((f) => escapeHtml(f?.id ? `${f.id} ${f.title ?? ''}`.trim() : (f?.title ?? f?.summary ?? ''))).join('; ');
      return `<li><span class="sev severity-${escapeHtml(s)}">${escapeHtml(s)}</span> ${by.get(s).length} — ${items}</li>`;
    }).join('')}</ul>`;
  }
  const counts = sy?.counts ?? fm?.counts;
  if (counts && typeof counts === 'object') {
    const parts = SEVERITIES.filter((s) => counts[s]).map((s) => `<span class="sev severity-${s}">${s}</span> ${escapeHtml(counts[s])}`);
    return parts.length ? parts.join(' · ') : 'No open findings.';
  }
  return '';
}

function sliceRosterCell({ fm, allArtifacts, viewRel }) {
  // 03-slice.md (the index) lists every slice; a per-slice file shows only itself.
  const roster = Array.isArray(fm?.slices) ? fm.slices.filter((s) => s && typeof s === 'object') : [];
  if (!roster.length) return '';
  const leaves = new Map((allArtifacts?.slice ?? []).map((a) => [a.frontmatter?.['slice-slug'] ?? a.frontmatter?.slug, a]));
  const rows = roster.map((s, i) => {
    const leaf = leaves.get(s.slug);
    const name = leaf?.viewRel
      ? `<a href="${escapeHtml(viewHref(viewRel, leaf.viewRel))}">${escapeHtml(s.slug)}</a>`
      : escapeHtml(s.slug ?? '');
    const ac = s['acceptance-criteria'] ?? s.ac ?? leaf?.frontmatter?.['acceptance-criteria'];
    const acText = Array.isArray(ac) ? `${ac.length}` : ac != null ? escapeHtml(ac) : '';
    return `<tr><td>${escapeHtml(s.order ?? i + 1)}</td><td>${name}</td><td>${escapeHtml(s.status ?? leaf?.frontmatter?.status ?? '')}</td><td>${acText}</td></tr>`;
  }).join('');
  return `<table class="prose-table"><thead><tr><th>Order</th><th>Slice</th><th>Status</th><th>Acceptance criteria</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ─────────────────────────── part 2: waiting for you ─────────────────────────── */

/**
 * The next-step options for an artifact (S3). Prefers the `recommended-routes`
 * frontmatter list; falls back to `next-invocation` / `next-command`, the old
 * `recommended-next-*` keys, then the old `## Recommended Next Stage` section.
 *
 * @returns {Array<{ invocation: string, reason?: string, default?: boolean, markdown?: string }>}
 */
export function nextRoutes(fm = {}, sections = null) {
  const rr = fm?.['recommended-routes'];
  if (Array.isArray(rr) && rr.length) {
    const list = rr
      .map((r) => (typeof r === 'string' ? { invocation: r } : r && typeof r === 'object'
        ? { invocation: String(r.invocation ?? r.command ?? ''), reason: r.reason ? String(r.reason) : '', default: r.default === true }
        : null))
      .filter((r) => r && r.invocation);
    if (list.length) {
      if (!list.some((r) => r.default)) list[0].default = true;
      return list;
    }
  }
  // Old workflow-index shape: { primary, alternates: [...] }.
  if (rr && typeof rr === 'object' && !Array.isArray(rr) && (rr.primary || rr.alternates)) {
    const list = [];
    if (rr.primary) list.push({ invocation: String(rr.primary), default: true });
    for (const a of Array.isArray(rr.alternates) ? rr.alternates : []) list.push({ invocation: String(a) });
    if (list.length) return list;
  }
  const inv = fm?.['next-invocation'] ?? fm?.['recommended-next-invocation']
    ?? fm?.['next-command'] ?? fm?.['recommended-next-command'];
  if (inv) return [{ invocation: String(inv), default: true }];
  const sec = sections ? findSection(sections, [/^recommended next stage/, /^recommended next/]) : null;
  if (sec) return [{ invocation: '', markdown: sec.markdown, default: true }];
  return [];
}

function asList(v) {
  if (v == null || v === '' || v === false) return [];
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '');
  if (typeof v === 'number') return v > 0 ? [`${v} open question${v === 1 ? '' : 's'}`] : [];
  if (v === true) return ['Yes'];
  return [v];
}

function itemText(x) {
  if (x && typeof x === 'object') return mdInline(String(x.question ?? x.text ?? x.title ?? x.summary ?? JSON.stringify(x)));
  return mdInline(String(x));
}

const AWAITING_STATUS = /^(awaiting|blocked|needs-|pending-(input|approval|decision))/;
const GATE_KEYS = ['image-gate', 'gate', 'awaiting', 'awaiting-input', 'live-review-decision', 'approval-required', 'blocked', 'blocker'];
const VERDICT_KEYS = ['readiness-verdict', 'pr-readiness-verdict', 'go-nogo', 'verdict', 'result', 'recommendation'];
const GATE_CLEAR = /^(pass|passed|clear|cleared|resolved|none|n\/a|approved|complete|done|false)$/i;

// Stages only a person runs; no driver (`/wf auto`, `/wf yolo`) runs them.
// design: skills/wf/reference/design/_lane.md ("only a person runs it").
// brainstorm: a talk with the person, which only the person ends.
const HUMAN_ONLY_STAGES = Object.freeze({
  design: 'to confirm the drawn surfaces',
  brainstorm: 'to talk the idea through',
});

/**
 * The human-only stage an invocation routes to (`/wf design <slug>`,
 * `/wf brainstorm …`, `/wf intake brainstorm …`), or null.
 * @returns {{ key: string, ask: string } | null}
 */
export function humanOnlyStage(invocation) {
  const m = /^\s*\/?wf\s+(?:intake\s+)?([a-z][a-z0-9-]*)\b/i.exec(String(invocation ?? ''))
    ?? /^\s*([a-z][a-z0-9-]*)\s*$/i.exec(String(invocation ?? ''));
  if (!m) return null;
  const key = m[1].toLowerCase();
  return Object.hasOwn(HUMAN_ONLY_STAGES, key) ? { key, ask: HUMAN_ONLY_STAGES[key] } : null;
}

/**
 * Part 2 — what waits for a person. Reads only frontmatter (and the old next
 * section as a fallback for the next step). Says "Nothing waits for you." when
 * no question, gate or awaiting status is open, unless the default next route
 * is a human-only stage: then it says that the next step needs the person.
 */
export function waitingForYou(fm = {}, sections = null) {
  const items = [];
  const questions = asList(fm['open-questions']);
  if (questions.length) {
    items.push(`<li><strong>Open questions</strong><ul>${questions.map((q) => `<li>${itemText(q)}</li>`).join('')}</ul></li>`);
  }
  const status = String(fm.status ?? '').toLowerCase();
  if (AWAITING_STATUS.test(status)) {
    items.push(`<li><strong>Status</strong> <code>${escapeHtml(fm.status)}</code> — this stage waits for your input.</li>`);
  }
  for (const k of GATE_KEYS) {
    const v = fm[k];
    if (v == null || v === '' || v === false) continue;
    if (typeof v === 'string' && GATE_CLEAR.test(v.trim())) continue;
    items.push(`<li><strong>${escapeHtml(k)}</strong> ${Array.isArray(v) ? v.map(itemText).join('; ') : itemText(v)}</li>`);
  }
  const verdictKey = VERDICT_KEYS.find((k) => fm[k] != null && fm[k] !== '');
  const verdictHtml = verdictKey
    ? `<p class="waiting-verdict"><span class="meta">${escapeHtml(verdictKey)}</span> <strong>${escapeHtml(fm[verdictKey])}</strong></p>`
    : '';
  const routes = nextRoutes(fm, sections);
  let nextHtml = '';
  if (routes.length) {
    const def = routes.find((r) => r.default) ?? routes[0];
    if (def.invocation) {
      const others = routes.filter((r) => r !== def);
      nextHtml = `<p class="waiting-next"><span class="meta">next</span> <code>${escapeHtml(def.invocation)}</code>${def.reason ? ` — ${escapeHtml(def.reason)}` : ''}</p>`
        + (others.length ? `<ul class="route-alts">${others.map((r) => `<li><code>${escapeHtml(r.invocation)}</code>${r.reason ? ` — ${escapeHtml(r.reason)}` : ''}</li>`).join('')}</ul>` : '');
    } else if (def.markdown) {
      nextHtml = `<div class="waiting-next">${md2html(def.markdown)}</div>`;
    }
  }
  let body;
  if (items.length) {
    body = `<ul class="waiting-list">${items.join('')}</ul>`;
  } else {
    const def = routes.find((r) => r.default) ?? routes[0];
    const human = def?.invocation ? humanOnlyStage(def.invocation) : null;
    body = human
      ? `<p class="waiting-none waiting-human">Next: the ${escapeHtml(human.key)} stage needs you${def.reason ? `: ${escapeHtml(def.reason.replace(/\.\s*$/, ''))}` : ` ${escapeHtml(human.ask)}`}.</p>`
      : '<p class="waiting-none">Nothing waits for you.</p>';
  }
  return `<section class="page-part part-waiting" aria-label="Waiting for you">
<h2 class="sdlc-h2">Waiting for you</h2>
${body}${verdictHtml}${nextHtml}
</section>`;
}

/* ─────────────────────────── part 3: the contract ─────────────────────────── */

/**
 * Part 3 — the stage-specific contract table. Each recipe row renders the first
 * source that yields content; rows with no content are left out.
 */
export function contractTable(stage, { fm = {}, sy = null, sections = [], allArtifacts = {}, viewRel = 'INDEX.html' } = {}) {
  const recipe = STAGE_RECIPES[stage];
  if (!recipe) return '';
  const ctx = { fm, sy, sections, allArtifacts, viewRel };
  const rows = [];
  for (const row of recipe) {
    let html = '';
    for (const src of row.from) {
      if (src.sections) {
        const sec = findSection(sections, src.sections);
        if (sec) html = md2html(sec.markdown);
      } else if (src.fm) {
        const k = src.fm.find((key) => fm[key] != null && fm[key] !== '');
        if (k) html = scalar(fm[k]);
      } else if (src.fn) {
        html = src.fn(ctx) || '';
      }
      if (html) break;
    }
    if (html) rows.push(`<tr><th scope="row" style="text-align:left;vertical-align:top;white-space:nowrap">${escapeHtml(row.label)}</th><td style="vertical-align:top">${html}</td></tr>`);
  }
  const table = rows.length
    ? `<table class="prose-table contract-table"><tbody>${rows.join('')}</tbody></table>`
    : '<p class="meta">The agent file has no contract sections to show.</p>';
  return `<section class="page-part part-contract" aria-label="The contract">
<h2 class="sdlc-h2">The contract</h2>
${table}
</section>`;
}

/* ─────────────────────── part 4: evidence and history ─────────────────────── */

/**
 * Part 4 — collapsed. `evidence` and `related` are `[{ label, href }]` lists the
 * orchestrator builds (evidence files, review dimension pages). `history` is the
 * snapshot list from loadHistory. `recordHtml` is the stage renderer's output.
 */
export function evidenceAndHistory({ evidence = [], related = [], history = [], recordHtml = '' } = {}) {
  const linkList = (list) => `<ul>${list.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.label)}</a></li>`).join('')}</ul>`;
  const blocks = [];
  if (evidence.length) blocks.push(`<h3 class="sdlc-h3">Evidence files</h3>${linkList(evidence)}`);
  if (related.length) blocks.push(`<h3 class="sdlc-h3">Related records</h3>${linkList(related)}`);
  if (history.length) {
    const revs = history.map((h) => {
      const when = h.snapshotFrontmatter?.['updated-at'] ?? '';
      return { label: `Rev ${h.rev}${when ? ` — ${when}` : ''}`, href: pageHref(`history/${h.rev}`) };
    });
    blocks.push(`<h3 class="sdlc-h3">Earlier revisions</h3>${linkList(revs)}`);
  }
  if (recordHtml) {
    blocks.push(`<details class="full-record"><summary>The full agent record</summary>\n${recordHtml}\n</details>`);
  }
  const count = evidence.length + related.length + history.length;
  const summary = `Evidence and history${count ? ` · ${count} link${count === 1 ? '' : 's'}` : ''}`;
  return `<details class="page-part part-evidence history">
<summary>${escapeHtml(summary)}</summary>
${blocks.join('\n') || '<p class="meta">No evidence files or earlier revisions.</p>'}
</details>`;
}

/* ─────────────────────────────── composition ─────────────────────────────── */

/**
 * Wrap the explainer HTML as part 1. The explainer is agent-authored raw HTML
 * (a free fragment); `scopeCss` confines its `<style>` rules to this wrapper.
 */
export function explainerPart(explainerHtml, { scopeCss = (h) => h } = {}) {
  return `<section class="page-part part-explainer story explainer nfrag" data-label="explainer" aria-label="Explainer">
${scopeCss(explainerHtml, 'explainer')}
</section>`;
}

/**
 * Compose the full page body for an artifact that has an explainer.
 *
 * @param {object} p
 * @param {string} p.stage         stageKeyFor(...) result (may be null)
 * @param {object} p.frontmatter
 * @param {string} p.body          the full markdown body
 * @param {object} [p.siblingYaml]
 * @param {Array}  [p.history]
 * @param {string} p.explainerHtml the expanded explainer fragment
 * @param {string} p.recordHtml    the stage renderer's bodyHtml
 * @param {Array}  [p.evidence]    [{ label, href }]
 * @param {Array}  [p.related]     [{ label, href }]
 * @param {object} [p.allArtifacts]
 * @param {string} [p.viewRel]     this page's view-relative path
 * @param {Function} [p.scopeCss]
 * @returns {string}
 */
export function composeStagePage(p) {
  const fm = p.frontmatter ?? {};
  const sections = splitSections(p.body ?? '');
  const part1 = explainerPart(p.explainerHtml ?? '', { scopeCss: p.scopeCss });
  // Recap is the slug's story page: the explainer and the recap body, in full.
  if (p.stage === 'recap' || !STAGE_RECIPES[p.stage]) {
    return `<div class="stage-page stage-page-story">${part1}\n<div class="story-record">${p.recordHtml ?? ''}</div></div>`;
  }
  return `<div class="stage-page stage-page-${escapeHtml(p.stage)}">
${part1}
${waitingForYou(fm, sections)}
${contractTable(p.stage, { fm, sy: p.siblingYaml, sections, allArtifacts: p.allArtifacts, viewRel: p.viewRel })}
${evidenceAndHistory({ evidence: p.evidence, related: p.related, history: p.history, recordHtml: p.recordHtml })}
</div>`;
}

/**
 * The storage folder that holds an artifact's evidence, relative to the slug
 * root, or null. Reads `evidence-dir` from frontmatter first (verify and probe
 * templates write it), then derives the default from the stage and the slice.
 */
export function evidenceDirFor({ stage, frontmatter = {}, path = '' }) {
  const declared = frontmatter['evidence-dir'];
  if (typeof declared === 'string' && declared.trim()) {
    const m = declared.replace(/\\/g, '/').match(/(?:^|\/)((?:probe|verify)-evidence(?:\/.*)?)$/);
    if (m) return m[1].replace(/\/+$/, '');
  }
  const base = String(path).replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '');
  if (stage === 'verify') {
    const slice = frontmatter['slice-slug'] ?? base.match(/^06-verify-(.+)$/)?.[1];
    return slice ? `verify-evidence/${slice}` : 'verify-evidence';
  }
  if (stage === 'probe') {
    const d = frontmatter.descriptor ?? base.match(/^03-slice-probe-(.+)$/)?.[1];
    return d ? `probe-evidence/${d}` : 'probe-evidence';
  }
  if (stage === 'task') return 'verify-evidence';
  return null;
}

/**
 * The slug's story link (W5: recap becomes the slug's story page). Returns a
 * prominent card linking `90-recap.md`'s page from the slug overview, or ''
 * when the slug has no recap. `fromViewRel` is the overview's view path.
 */
export function storyLink(allArtifacts, fromViewRel = 'INDEX.html') {
  const recap = (allArtifacts?.recap ?? []).find((x) => x?.viewRel
    && String(x.storageRel ?? '').replace(/\\/g, '/') === '90-recap.md');
  if (!recap) return '';
  const fm = recap.frontmatter ?? {};
  const lede = fm.summary ?? fm.lede ?? fm.description ?? '';
  return `<section class="story-link" aria-label="The story of this workflow">
<a class="slice-card story-card" href="${escapeHtml(viewHref(fromViewRel, recap.viewRel))}">
<span class="slice-slug"><code>story</code></span>
<span class="slice-title">${escapeHtml(fm.title ?? 'Read the story of this workflow')}</span>
${lede ? `<span class="meta">${escapeHtml(lede)}</span>` : ''}
</a>
</section>`;
}
