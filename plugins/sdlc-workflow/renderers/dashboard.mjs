// renderers/dashboard.mjs — cross-slug dashboard at .ai/_view/INDEX.html
//
// Synthetic — invoked by the orchestrator after slug renders; no storage
// artifact backs this page. Unlike every other renderer in this directory,
// there is no `frontmatter.type: dashboard` entry in the schema's `oneOf`
// and no `00-dashboard.md` on disk. The orchestrator builds the artifact
// shape in-memory from the cross-slug index, then dispatches here.
//
// Figure 1 of the design handoff: workflow swimlanes — rows = projects,
// columns = the 10-stage lifecycle (intake → retro; D3.1 keeps slice+handoff),
// a solid ink overlay marks done-through-current, dashed queued circles mark
// not-yet-reached, a SHIPPED rule separates active from recently-shipped rows.
// Blocked current dot = --blocker.

import { artifactHeader } from './_shell.mjs';
import { figureCanvas, evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

const STAGES = [
  'intake', 'shape', 'slice', 'plan', 'implement',
  'verify', 'review', 'handoff', 'ship', 'retro',
];

// Terminal status vocabulary (kept in sync with lib/workflow-index.mjs's
// TERMINAL_WORKFLOW_STATUSES). Bucketing below is exhaustive — anything not
// terminal is treated as active — so no workflow is ever silently dropped from
// the dashboard the way the old `status === 'active'` test dropped `ready`,
// `blocked`, `in-progress`, etc.
const TERMINAL_COMPLETE = new Set(['complete', 'completed', 'shipped', 'done']);
const TERMINAL_CLOSED = new Set(['closed', 'abandoned', 'cancelled']);

export function render(artifact, ctx) {
  const slugs = (ctx.allArtifacts?.__summary__ ?? []).map((s) => ({
    slug: s.slug,
    fm:   s.frontmatter ?? {},
  }));
  const project = ctx.allArtifacts?.__project__ ?? [];

  // Two workflow shapes share the dashboard:
  //   • pipeline workflows (type: index) walk the 10-stage lifecycle and map
  //     cleanly onto the swimlanes figure.
  //   • quick / investigative workflows (type: workflow-index — e.g. /wf-quick
  //     rca|fix|probe) use their own routing vocabulary (`routing`,
  //     `fix-routing`, …) and a `ready` status. Forcing them into the 10-stage
  //     swimlane renders a misleading all-empty lane (STAGES.indexOf → -1), so
  //     they get their own list section instead of a swimlane row.
  const pipeline = slugs.filter((s) => s.fm.type !== 'workflow-index');
  const quick    = slugs.filter((s) => s.fm.type === 'workflow-index');

  const statusOf = (s) => String(s.fm.status ?? '').trim().toLowerCase();
  const complete = pipeline.filter((s) => TERMINAL_COMPLETE.has(statusOf(s)));
  const closed   = pipeline.filter((s) => TERMINAL_CLOSED.has(statusOf(s)));
  const active   = pipeline.filter((s) => !TERMINAL_COMPLETE.has(statusOf(s)) && !TERMINAL_CLOSED.has(statusOf(s)));

  const headerHtml = artifactHeader({
    h1: 'sdlc dashboard',
    lede: `${slugs.length} workflow${slugs.length === 1 ? '' : 's'} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  });

  const figureSvg = swimlanesSvg(active, complete);
  const figureHtml = figureCanvas({
    figureNumber: 1,
    title: 'Workflow swimlanes',
    svgInner: figureSvg,
    legend: [
      { state: 'done',     label: 'done' },
      { state: 'current',  label: 'current' },
      { state: 'upcoming', label: 'upcoming' },
      { state: 'queued',   label: 'queued' },
      { state: 'blocked',  label: 'blocked' },
    ],
  });

  const bodyHtml = `
    ${projectSection(project)}
    ${figureHtml}
    ${slugSection('Active', active)}
    ${slugSection('Recently shipped', complete)}
    ${slugSection('Closed', closed)}
    ${quickSection(quick)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function projectSection(list) {
  if (!list.length) return '';
  const rows = list.map((item) => {
    const fm = item.frontmatter ?? {};
    const title = fm.title ?? item.path;
    const href = item.viewRel ?? '';
    const status = fm.status ?? '';
    return `<a class="project-row" href="${escapeHtml(href)}">
      <span class="slug"><code>${escapeHtml(item.path)}</code></span>
      <span class="title">${escapeHtml(title)}</span>
      <span class="stage-pill">${escapeHtml(fm.type ?? 'context')}</span>
      <span class="meta">${escapeHtml(status)}</span>
    </a>`;
  }).join('');
  return `<section class="project-list">
    <h2 class="sdlc-h2">Project context <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}

function slugSection(label, list) {
  if (!list.length) return '';
  const rows = list.map((s) => projectRow(s)).join('');
  return `<section class="project-list">
    <h2 class="sdlc-h2">${label} <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}

// Quick / investigative workflows (type: workflow-index). These don't fit the
// 10-stage swimlane, so they're listed here with their workflow-type (rca /
// fix / probe / investigate) and routing stage. Without this section their
// rendered slug pages — which DO exist on disk via the fallback renderer —
// have no inbound link from the dashboard and are unreachable.
function quickSection(list) {
  if (!list.length) return '';
  const rows = list.map(({ slug, fm }) => {
    const wfType = fm['workflow-type'] ?? 'quick';
    const stage  = fm['current-stage'] ?? '';
    const title  = fm.title ?? slug;
    const status = fm.status ?? '';
    return `<a class="project-row" href="${escapeHtml(pageHref(slug))}">
      <span class="slug"><code>${escapeHtml(slug)}</code></span>
      <span class="title">${escapeHtml(title)}</span>
      <span class="stage-pill">${escapeHtml(wfType)}</span>
      <span class="stage-pill">${escapeHtml(stage)}</span>
      <span class="meta">${escapeHtml(status)}</span>
    </a>`;
  }).join('');
  return `<section class="project-list">
    <h2 class="sdlc-h2">Quick &amp; investigative <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}

// A ledger row is an <article> with a stacked serif name + mono slug, a
// description, the current-stage pill, an at-a-glance health glyph, and a
// human-relative timestamp (D3.7–D3.11). The whole-row link lives on the name.
function projectRow({ slug, fm }) {
  const stage = fm['current-stage'] ?? 'intake';
  const title = fm.title ?? slug;
  const updated = fm['updated-at'] ?? '';
  const desc = fm.description ?? '';
  const h = health(fm);
  const stageVariant = h.tone === 'ok' && h.label === 'shipped' ? 'done' : 'cur';
  return `<article class="project-row ${h.tone}">
    <span class="pr-id">
      <a class="name" href="${escapeHtml(pageHref(slug))}">${escapeHtml(title)}</a>
      <code class="slug">${escapeHtml(slug)}</code>
    </span>
    <span class="desc">${escapeHtml(desc)}</span>
    <span class="stage-pill ${stageVariant}">${escapeHtml(stage)}</span>
    <span class="status ${h.tone}"><span class="glyph" aria-hidden="true">${h.glyph}</span>${escapeHtml(h.label)}</span>
    <span class="time">${escapeHtml(humanRelative(updated))}</span>
  </article>`;
}

// At-a-glance health → { tone, glyph, label }. Glyphs match the design's
// ● bad / ◉ ok / ◐ warn / ◎ idle vocabulary (D3.8).
function health(fm) {
  const status = String(fm.status ?? '').trim().toLowerCase();
  const blocked = status === 'blocked' || fm.blocked === true;
  if (blocked) return { tone: 'bad', glyph: '●', label: 'blocked' };
  if (['complete', 'completed', 'shipped', 'done'].includes(status)) return { tone: 'ok', glyph: '◉', label: 'shipped' };
  if (['closed', 'abandoned', 'cancelled'].includes(status)) return { tone: 'idle', glyph: '◎', label: status };
  if (['paused', 'on-hold', 'waiting'].includes(status)) return { tone: 'warn', glyph: '◐', label: status };
  return { tone: 'ok', glyph: '◉', label: status || 'active' };
}

// ISO timestamp → "12 min ago" style. Returns raw text (escaped at call site).
function humanRelative(iso) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = Date.now() - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.round(d / 30);
  return `${mo} mo ago`;
}

// Exported (was module-private) so the multi-repo hub landing page
// (renderers/hub-dashboard.mjs) can reuse the same swimlane figure per repo.
// Pure helper — depends only on STAGES + _figure/_validator imports, never on
// the per-repo dashboard pass. See MULTI-REPO-REGISTRY-PLAN §5 must-fix #7.
export function swimlanesSvg(active = [], shipped = []) {
  const rows = [...active, ...shipped];
  if (!rows.length) {
    return `<svg viewBox="0 0 600 80" width="100%"><text x="300" y="44" text-anchor="middle" fill="#8a8377" font-size="13">No workflows yet</text></svg>`;
  }
  const W = 980;
  const rowH = 46;
  const top = 46;
  const padX = 150;
  const shippedStart = active.length;
  const sepGap = shipped.length ? 26 : 0;
  const H = top + rows.length * rowH + sepGap + 24;
  const xs = evenX(W, padX, STAGES.length);
  const railTop = top - 14;
  const railBot = top + rows.length * rowH + sepGap - rowH + 14;

  // Stage column headers + faint vertical column rules spanning every row (D3.2).
  const header = STAGES.map((s, i) =>
    `<text x="${xs[i]}" y="${top - 22}" text-anchor="middle" font-size="10" font-weight="600" fill="#8a8377" letter-spacing="1.2">${s.toUpperCase()}</text>`,
  ).join('');
  const colRules = STAGES.map((s, i) =>
    `<line x1="${xs[i]}" y1="${railTop}" x2="${xs[i]}" y2="${railBot}" stroke="#e0dbcd" stroke-width="1"/>`,
  ).join('');

  let separator = '';
  const rowSvg = rows.map((row, ri) => {
    const { slug, fm } = row;
    const isShipped = ri >= shippedStart;
    const extra = isShipped ? sepGap : 0;
    const y = top + ri * rowH + extra;

    // SHIPPED separator rule + mono label before the first shipped row (D3.4).
    if (shipped.length && ri === shippedStart) {
      const sy = y - rowH / 2 - 2;
      separator = `<line x1="20" y1="${sy}" x2="${W - 20}" y2="${sy}" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2 3"/>
        <text x="20" y="${sy + 14}" font-size="9" font-weight="700" letter-spacing="1.5" fill="#8a8377" font-family="ui-monospace, monospace">SHIPPED</text>`;
    }

    const declaredIdx = STAGES.indexOf(fm['current-stage'] ?? 'intake');
    const currentIdx = isShipped ? STAGES.length - 1 : (declaredIdx < 0 ? 0 : declaredIdx);
    const blocked = !isShipped && (fm.status === 'blocked' || fm.blocked === true);

    // Solid ink progress overlay first-station→current (D3.3); dashed tail over
    // the not-yet-reached stages.
    const progress = currentIdx > 0
      ? `<line x1="${xs[0]}" y1="${y}" x2="${xs[currentIdx]}" y2="${y}" stroke="#1f1b16" stroke-width="1.5"/>`
      : '';
    const tailDash = currentIdx < STAGES.length - 1
      ? `<line x1="${xs[currentIdx]}" y1="${y}" x2="${xs[STAGES.length - 1]}" y2="${y}" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2 3"/>`
      : '';

    const slugLabel = `<text x="20" y="${y + 4}" font-size="11" fill="#1f1b16"><tspan font-family="ui-monospace, monospace">${escapeHtml(slug.slice(0, 20))}</tspan></text>`;

    const dots = STAGES.map((s, i) => {
      const x = xs[i];
      const isCur = !isShipped && currentIdx === i;
      // Shipped rows are fully traversed — every station is done (inclusive of
      // the terminal stage), rendered in ink. Active rows go green-done →
      // blue-current → dashed-queued. (Strict `>` on a clamped currentIdx left
      // the shipped terminal dot falling through to the queued branch — P1 #1.)
      const done = isShipped ? true : currentIdx > i;
      if (isCur) {
        const c = blocked ? '#b5305f' : '#4a6c8c';
        return `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${c}" stroke-width="1.2" opacity="0.5"/><circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="${c}" stroke-width="1.5"/>`;
      }
      if (done) {
        const c = isShipped ? '#1f1b16' : '#3e7d4a';
        return `<circle cx="${x}" cy="${y}" r="5" fill="${c}" stroke="${c}" stroke-width="1.5"/>`;
      }
      // queued / not started — dashed open circle (D3.5)
      return `<circle cx="${x}" cy="${y}" r="5" fill="#fbfaf6" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2.5 2"/>`;
    }).join('');

    // Inline annotation beside the current dot: blockers take priority, else rev (D3.6).
    const blockerCount = Number(fm.blockers ?? fm['blocker-count'] ?? (blocked ? 1 : 0)) || 0;
    const rev = fm['revision-count'] ?? fm.rev;
    let annotation = '';
    if (!isShipped && blockerCount) {
      annotation = `<text x="${xs[currentIdx] + 11}" y="${y - 9}" font-size="9" fill="#b5305f">· ${blockerCount} blocker${blockerCount === 1 ? '' : 's'}</text>`;
    } else if (!isShipped && rev != null && rev !== '') {
      annotation = `<text x="${xs[currentIdx] + 11}" y="${y - 9}" font-size="9" fill="#8a8377">· rev ${escapeHtml(String(rev))}</text>`;
    }

    return `${progress}${tailDash}${slugLabel}${dots}${annotation}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Workflow swimlanes">
    ${colRules}
    ${header}
    ${separator}
    ${rowSvg}
  </svg>`;
}
