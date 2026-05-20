// renderers/dashboard.mjs — cross-slug dashboard at .ai/_view/INDEX.html
// Figure 1 of the design handoff: workflow swimlanes — rows = projects,
// columns = 8 stages (intake → retro), bullets mark completed stages, accent
// ring marks current, dashed line marks not-yet-reached. Blocked = --blocker.

import { artifactHeader } from './_shell.mjs';
import { figureCanvas, evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';

const STAGES = [
  'intake', 'shape', 'slice', 'plan', 'implement',
  'verify', 'review', 'handoff', 'ship', 'retro',
];

export function render(artifact, ctx) {
  const slugs = (ctx.allArtifacts?.__summary__ ?? []).map((s) => ({
    slug: s.slug,
    fm:   s.frontmatter ?? {},
  }));

  const active = slugs.filter((s) => s.fm.status === 'active');
  const complete = slugs.filter((s) => s.fm.status === 'complete' || s.fm.status === 'shipped');
  const closed = slugs.filter((s) => s.fm.status === 'closed');

  const headerHtml = artifactHeader({
    h1: 'sdlc dashboard',
    lede: `${slugs.length} workflow${slugs.length === 1 ? '' : 's'} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  });

  const figureSvg = swimlanesSvg(slugs);
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
    ${figureHtml}
    ${slugSection('Active', active)}
    ${slugSection('Complete', complete)}
    ${slugSection('Closed', closed)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function slugSection(label, list) {
  if (!list.length) return '';
  const rows = list.map((s) => projectRow(s)).join('');
  return `<section class="project-list">
    <h2 class="sdlc-h2">${label} <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}

function projectRow({ slug, fm }) {
  const stage = fm['current-stage'] ?? 'intake';
  const title = fm.title ?? slug;
  const updated = fm['updated-at'] ?? '';
  return `<a class="project-row" href="${escapeHtml(slug)}/">
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
