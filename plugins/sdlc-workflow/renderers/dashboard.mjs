// renderers/dashboard.mjs — cross-slug dashboard at .ai/_view/INDEX.html
//
// Synthetic — invoked by the orchestrator after slug renders; no storage
// artifact backs this page. Unlike every other renderer in this directory,
// there is no `frontmatter.type: dashboard` entry in the schema's `oneOf`
// and no `00-dashboard.md` on disk. The orchestrator builds the artifact
// shape in-memory from the cross-slug index, then dispatches here.
//
// Figure 1 of the design handoff: workflow swimlanes — rows = projects,
// columns = 8 stages (intake → retro), bullets mark completed stages, accent
// ring marks current, dashed line marks not-yet-reached. Blocked = --blocker.

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

  const figureSvg = swimlanesSvg(pipeline);
  const figureHtml = figureCanvas({
    figureNumber: 1,
    title: 'Workflow swimlanes',
    svgInner: figureSvg,
    legend: [
      { swatch: '#3e7d4a', label: 'done' },
      { swatch: '#4a6c8c', label: 'current' },
      { swatch: '#cbc4b1', label: 'upcoming' },
      { swatch: '#b5305f', label: 'blocked' },
    ],
  });

  const bodyHtml = `
    ${projectSection(project)}
    ${figureHtml}
    ${slugSection('Active', active)}
    ${slugSection('Complete', complete)}
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

function projectRow({ slug, fm }) {
  const stage = fm['current-stage'] ?? 'intake';
  const title = fm.title ?? slug;
  const updated = fm['updated-at'] ?? '';
  return `<a class="project-row" href="${escapeHtml(pageHref(slug))}">
    <span class="slug"><code>${escapeHtml(slug)}</code></span>
    <span class="title">${escapeHtml(title)}</span>
    <span class="stage-pill">${escapeHtml(stage)}</span>
    <span class="meta">${escapeHtml(updated)}</span>
  </a>`;
}

function swimlanesSvg(slugs) {
  if (!slugs.length) {
    return `<svg viewBox="0 0 600 80" width="100%"><text x="300" y="44" text-anchor="middle" fill="#8a8377" font-size="13">No workflows yet</text></svg>`;
  }
  const W = 980;
  const rowH = 38;
  const top = 40;
  const padX = 130;
  const H = top + slugs.length * rowH + 30;
  const xs = evenX(W, padX, STAGES.length);

  const header = STAGES.map((s, i) =>
    `<text x="${xs[i]}" y="22" text-anchor="middle" font-size="10" font-weight="600" fill="#8a8377" letter-spacing="1.2">${s.toUpperCase()}</text>`,
  ).join('');

  const rows = slugs.map(({ slug, fm }, ri) => {
    const y = top + ri * rowH;
    const currentIdx = STAGES.indexOf(fm['current-stage'] ?? 'intake');
    const blocked = fm.status === 'blocked' || fm.blocked === true;
    const slugLabel = `<text x="20" y="${y + 5}" font-size="11" fill="#1f1b16"><tspan font-family="ui-monospace, monospace">${escapeHtml(slug.slice(0, 18))}</tspan></text>`;
    const dots = STAGES.map((s, i) => {
      const x = xs[i];
      const done = currentIdx > i;
      const isCur = currentIdx === i;
      const fill = blocked && isCur ? '#b5305f' : done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#fbfaf6';
      const stroke = blocked && isCur ? '#b5305f' : done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#cbc4b1';
      const r = isCur ? 7 : 5;
      const ring = isCur ? `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="none" stroke="${stroke}" stroke-width="1.2" opacity="0.5"/>` : '';
      return `${ring}<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    }).join('');
    const tailDash = currentIdx < STAGES.length - 1
      ? `<line x1="${xs[currentIdx + 1] - 12}" y1="${y}" x2="${xs[STAGES.length - 1] + 12}" y2="${y}" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2 3"/>`
      : '';
    return `${tailDash}${slugLabel}${dots}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Workflow swimlanes">
    ${header}
    ${rows}
  </svg>`;
}
