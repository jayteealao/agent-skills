// renderers/index.mjs — slug overview ("00-index.md")
// This is the gate renderer (per SUNFLOWER-VIEW-PLAN line 1400). Building this
// first end-to-end validates every helper's contract before 29 more renderers
// depend on them.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas, evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

const STAGES = [
  'intake', 'shape', 'slice', 'plan', 'implement',
  'verify', 'review', 'handoff', 'ship', 'retro',
];

// Map each stage to the artifact `type` values that count as a member of
// that stage, plus the canonical sub-path under the slug root (which is the
// href emitted by the stages-grid cards on the slug overview).
const STAGE_NAV = {
  intake:    { types: ['intake'],                                       dir: 'intake' },
  shape:     { types: ['shape', 'design', 'design-contract', 'design-brief'], dir: 'shape' },
  slice:     { types: ['slice-index', 'slice'],                         dir: 'slice' },
  plan:      { types: ['plan-index', 'plan'],                           dir: 'plan' },
  implement: { types: ['implement-index', 'implement'],                 dir: 'implement' },
  verify:    { types: ['verify-index', 'verify'],                       dir: 'verify' },
  review:    { types: ['review', 'review-command'],                     dir: 'review' },
  handoff:   { types: ['handoff'],                                      dir: 'handoff' },
  ship:      { types: ['ship-runs-index', 'ship-run'],                  dir: 'ship' },
  retro:     { types: ['retro'],                                        dir: 'retro' },
};

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const current = fm['current-stage'] ?? 'intake';

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? fm.slug ?? 'untitled'),
    lede: '',
    badges: [
      statusBadge(fm.status),
      stageBadge(current),
      fm.branch && `<span class="meta">branch <code>${escapeHtml(fm.branch)}</code></span>`,
      fm['pr-number'] && `<span class="meta">PR #${escapeHtml(fm['pr-number'])}</span>`,
      fm['updated-at'] && `<span class="meta">updated ${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const metrics = [
    fm.progress && { label: 'progress', value: typeof fm.progress === 'object' ? `${fm.progress.done ?? 0}/${fm.progress.total ?? 0}` : fm.progress },
    fm['selected-slice'] && { label: 'slice', value: fm['selected-slice'] },
    fm['review-scope'] && { label: 'review', value: fm['review-scope'] },
  ].filter(Boolean);

  const metricsHtml = metrics.length ? metricRow(metrics) : '';

  // Figure 2 — Stage stripe (slug-overview canonical figure)
  const figureSvg = stageStripeSvg({ current, allArtifacts: ctx.allArtifacts });
  const figureHtml = figureCanvas({
    figureNumber: 2,
    title: `Slug stage stripe — ${escapeHtml(fm.slug ?? '')}`,
    svgInner: figureSvg,
    legend: [
      { swatch: '#3e7d4a', label: 'done' },
      { swatch: '#4a6c8c', label: 'current' },
      { swatch: '#cbc4b1', label: 'upcoming' },
    ],
  });

  // Activity feed — list of recently-touched artifacts
  const activity = buildActivityList(ctx.allArtifacts);

  const proseHtml = artifact.body ? md2html(artifact.body) : '';

  const stagesGridHtml = stagesGrid(current, ctx.allArtifacts);
  const slicesHtml = slicesPreview(ctx.allArtifacts);

  const bodyHtml = `
    ${figureHtml}
    ${metricsHtml}
    ${stagesGridHtml}
    ${slicesHtml}
    <section class="so-grid">
      <div class="so-rail prose">
        ${proseHtml || '<p class="sdlc-lede">Slug overview pulls together every artifact in this workflow.</p>'}
      </div>
      <aside class="activity">
        <h2 class="sdlc-h2">recent activity</h2>
        ${activity}
      </aside>
    </section>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function stageStripeSvg({ current, allArtifacts }) {
  const W = 980, H = 130, padX = 40;
  const xs = evenX(W, padX, STAGES.length);
  const cy = 60;
  const currentIdx = STAGES.indexOf(current);

  const rail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;

  const stations = STAGES.map((stage, i) => {
    const x = xs[i];
    const done    = currentIdx > i;
    const isCur   = currentIdx === i;
    const fill    = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#fbfaf6';
    const stroke  = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#cbc4b1';
    const r       = isCur ? 11 : 7;
    const ring    = isCur ? `<circle cx="${x}" cy="${cy}" r="${r + 5}" fill="none" stroke="#4a6c8c" stroke-width="1.5" opacity="0.5"/>` : '';
    const label   = `<text x="${x}" y="${cy + 28}" text-anchor="middle" font-size="11" fill="#1f1b16" font-weight="${isCur ? 600 : 500}">${stage}</text>`;
    const youHere = isCur ? `<text x="${x}" y="${cy - 22}" text-anchor="middle" font-size="10" fill="#4a6c8c" font-style="italic">← you are here</text>` : '';
    const list = allArtifacts?.[stage] ?? [];
    const count = list.length;
    const annotation = count > 0
      ? `<text x="${x}" y="${cy + 44}" text-anchor="middle" font-size="10" fill="#8a8377">${count} artifact${count === 1 ? '' : 's'}</text>`
      : '';
    return `${ring}<circle cx="${x}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${label}${youHere}${annotation}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slug stage stripe">
    ${rail}
    ${stations}
  </svg>`;
}

function buildActivityList(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    for (const a of list) {
      const viewRel = a.viewRel ?? '';
      const href = viewRel || '';
      flat.push({
        type:  a.frontmatter?.type ?? a.type,
        updated: a.frontmatter?.['updated-at'] ?? '',
        path: a.storageRel ?? a.path ?? '',
        href,
      });
    }
  }
  flat.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const top = flat.slice(0, 8);
  if (!top.length) return '<p class="sdlc-lede">No artifacts yet.</p>';
  return `<ol class="activity-list">${top.map((a) => {
    const head = `<span class="stage-badge">${escapeHtml(a.type)}</span> <span class="meta">${escapeHtml(a.updated)}</span>`;
    const ref  = `<code>${escapeHtml(a.path)}</code>`;
    return a.href
      ? `<li><a class="activity-link" href="${escapeHtml(a.href)}">${head}<br>${ref}</a></li>`
      : `<li>${head}<br>${ref}</li>`;
  }).join('')}</ol>`;
}

/**
 * Emit a clickable stages grid. Each card links to the canonical phase
 * sub-directory under the slug root (e.g. `plan/`, `slice/`). Stages with
 * zero artifacts render as a non-clickable "not started" placeholder so
 * the user can see the overall shape of progress.
 */
function stagesGrid(current, allArtifacts) {
  const cards = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage];
    const count = (cfg.types ?? [stage]).reduce(
      (n, t) => n + ((allArtifacts?.[t] ?? []).length),
      0,
    );
    const isCurrent = stage === current;
    const present = count > 0;
    const cls = ['slice-card'];
    if (isCurrent) cls.push('is-current');
    if (!present) cls.push('is-missing');
    const inner = `<span class="slice-slug"><code>${escapeHtml(stage)}</code></span>
      ${present
        ? `<span class="meta">${count} artifact${count === 1 ? '' : 's'}</span>`
        : '<span class="meta">not started</span>'}`;
    if (!present) {
      return `<div class="${cls.join(' ')}">${inner}</div>`;
    }
    return `<a class="${cls.join(' ')}" href="${escapeHtml(pageHref(cfg.dir))}">${inner}</a>`;
  }).join('');
  return `<section class="slug-stages">
    <h2 class="sdlc-h2">stages</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}

/**
 * If the slug has slices, surface them inline so the slug page links into
 * each one (in addition to the `slice/` phase card above). Without this
 * the only path into a slice from the slug overview is one extra hop
 * through the slice-index.
 */
function slicesPreview(allArtifacts) {
  const slices = allArtifacts?.slice ?? [];
  if (!slices.length) return '';
  const cards = slices.map((s) => {
    const fm = s.frontmatter ?? {};
    const slug = fm['slice-slug'] ?? fm.slug ?? '';
    const tone = fm.status === 'complete' ? 'is-ok'
               : fm.status === 'blocked'  ? 'is-bad'
               : fm.status === 'active'   ? 'is-current'
               : '';
    return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(`slice/${slug}`))}">
      <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
      <span class="slice-title">${escapeHtml(fm.title ?? '')}</span>
      <span class="slice-status">${statusBadge(fm.status)}</span>
    </a>`;
  }).join('');
  return `<section class="slug-slices">
    <h2 class="sdlc-h2">slices · ${slices.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
