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

  // so-hd two-column identity block (D4.1): pg-title + restored lede on the
  // left, branch badge + status/stage chips on the right.
  const lede = fm.description ?? fm.lede ?? fm.summary ?? '';
  const headerHtml = `<header class="so-hd">
    <div class="so-hd-main">
      <h1 class="pg-title">${escapeHtml(fm.title ?? fm.slug ?? 'untitled')}</h1>
      ${lede ? `<p class="sdlc-lede">${escapeHtml(lede)}</p>` : ''}
    </div>
    <aside class="so-hd-aside">
      ${fm.branch ? `<span class="badge">⎇ ${escapeHtml(fm.branch)}</span>` : ''}
      ${statusBadge(fm.status)}
      ${stageBadge(current)}
      ${fm['pr-number'] ? `<span class="meta">PR #${escapeHtml(fm['pr-number'])}</span>` : ''}
      ${fm['updated-at'] ? `<span class="meta">updated ${escapeHtml(fm['updated-at'])}</span>` : ''}
    </aside>
  </header>`;

  const metrics = [
    fm.progress && { label: 'progress', value: typeof fm.progress === 'object' ? `${fm.progress.done ?? 0}/${fm.progress.total ?? 0}` : fm.progress },
    fm['selected-slice'] && { label: 'slice', value: fm['selected-slice'] },
    fm['review-scope'] && { label: 'review', value: fm['review-scope'] },
  ].filter(Boolean);

  const metricsHtml = metrics.length ? metricRow(metrics) : '';

  // Figure 2 — Stage stripe (slug-overview canonical figure)
  const figureSvg = stageStripeSvg({ current, allArtifacts: ctx.allArtifacts, fm });
  const figureHtml = figureCanvas({
    figureNumber: 2,
    title: `Slug stage stripe — ${fm.slug ?? ''}`,
    svgInner: figureSvg,
    legend: [
      { state: 'done',    label: 'done' },
      { state: 'current', label: 'current' },
      { state: 'queued',  label: 'queued' },
    ],
  });

  // Activity feed + jump rail (D4.9 / D4.10). so-grid roles: activity left,
  // jump rail right (D4.11). Stages grid + slices + prose move below (D4.14).
  const activity = buildActivityList(ctx.allArtifacts);
  const railHtml = jumpRail(current, ctx.allArtifacts);
  const proseHtml = artifact.body ? md2html(artifact.body) : '';
  const stagesGridHtml = stagesGrid(current, ctx.allArtifacts);
  const slicesHtml = slicesPreview(ctx.allArtifacts);

  const bodyHtml = `
    ${figureHtml}
    ${metricsHtml}
    <section class="so-grid">
      <div class="so-main">
        <h2 class="sec">recent activity</h2>
        ${activity}
      </div>
      <aside class="so-side">
        ${railHtml}
      </aside>
    </section>
    ${proseHtml ? `<section class="so-prose"><div class="prose">${proseHtml}</div></section>` : ''}
    ${stagesGridHtml}
    ${slicesHtml}
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

const SVG_SERIF = 'Iowan Old Style, Palatino, Georgia, serif';

// Count the artifacts belonging to a stage by mapping the stage to its member
// types (STAGE_NAV), since ctx.allArtifacts is keyed by frontmatter.type — not
// by stage name. Returns { count, latest } for date + annotation rendering.
function stageArtifacts(stage, allArtifacts) {
  const cfg = STAGE_NAV[stage] ?? { types: [stage] };
  const list = (cfg.types ?? [stage]).flatMap((t) => allArtifacts?.[t] ?? []);
  const dates = list.map((a) => a.frontmatter?.['updated-at']).filter(Boolean).sort();
  return { count: list.length, latest: dates[dates.length - 1] ?? '' };
}

function stationAnnotation(stage, count) {
  if (stage === 'slice')  return `${count} slice${count === 1 ? '' : 's'}`;
  if (stage === 'review') return `${count} review${count === 1 ? '' : 's'}`;
  if (stage === 'ship')   return `${count} run${count === 1 ? '' : 's'}`;
  return `${count} artifact${count === 1 ? '' : 's'}`;
}

function stageStripeSvg({ current, allArtifacts, fm = {} }) {
  const W = 920, H = 230, padX = 60;
  const xs = evenX(W, padX, STAGES.length);
  const cy = 96;
  const currentIdx = Math.max(0, STAGES.indexOf(current));

  const baseRail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  // Solid ink-strong progress overlay from the first station to current (D4.4).
  const progress = currentIdx > 0
    ? `<line x1="${xs[0]}" y1="${cy}" x2="${xs[currentIdx]}" y2="${cy}" stroke="#1f1b16" stroke-width="2.5"/>`
    : '';

  const stations = STAGES.map((stage, i) => {
    const x = xs[i];
    const done  = currentIdx > i;
    const isCur = currentIdx === i;
    const fill   = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#fbfaf6';
    const stroke = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#cbc4b1';
    const { count, latest } = stageArtifacts(stage, allArtifacts);

    // Current station is an enlarged disc (r=22) with an inner dashed ring (D4.7).
    const dot = isCur
      ? `<circle cx="${x}" cy="${cy}" r="22" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
        `<circle cx="${x}" cy="${cy}" r="14" fill="none" stroke="#fbfaf6" stroke-width="1.2" stroke-dasharray="3 3"/>`
      : done
        ? `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
        : `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;

    const date  = latest
      ? `<text x="${x}" y="${cy - 44}" text-anchor="middle" font-size="9" fill="#8a8377" font-family="ui-monospace, monospace">${escapeHtml(String(latest).slice(5, 10))}</text>`
      : '';
    const youHere = isCur ? `<text x="${x}" y="${cy - 30}" text-anchor="middle" font-size="10" fill="#4a6c8c" font-style="italic">you are here</text>` : '';
    const label = `<text x="${x}" y="${cy + 42}" text-anchor="middle" font-size="11" fill="#1f1b16" font-weight="${isCur ? 600 : 500}">${stage}</text>`;
    const ann = count > 0
      ? `<text x="${x}" y="${cy + 56}" text-anchor="middle" font-size="9" fill="#8a8377">${escapeHtml(stationAnnotation(stage, count))}</text>`
      : '';
    return `${date}${youHere}${dot}${label}${ann}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slug stage stripe">
    ${baseRail}${progress}${stations}
    ${metricCalloutBand(W, 186, fm, allArtifacts)}
  </svg>`;
}

// Bottom metric-callout band (D4.8): a second hairline rule and five summary
// groups. Values come from index frontmatter where available, else from
// derived artifact counts, else an em-dash placeholder (filled by Slice 6 data).
function metricCalloutBand(W, y, fm, allArtifacts) {
  const sliceCount  = (allArtifacts?.slice ?? []).length;
  const reviewCount = (allArtifacts?.review ?? []).length + (allArtifacts?.['review-command'] ?? []).length;
  const groups = [
    { lbl: 'LOC TOUCHED', val: fm['loc-touched'] ?? fm['metric-loc'] ?? '—' },
    { lbl: 'SLICES',      val: sliceCount || '—' },
    { lbl: 'REVIEWS',     val: reviewCount || '—' },
    { lbl: 'BLOCKERS',    val: fm.blockers ?? fm['blocker-count'] ?? 0 },
    { lbl: 'TESTS',       val: fm['tests-passed'] ?? fm['metric-tests'] ?? '—' },
  ];
  const rule = `<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" stroke="#e0dbcd" stroke-width="1"/>`;
  const gx = evenX(W, 110, groups.length);
  const cells = groups.map((g, i) => {
    const x = gx[i];
    return `<text x="${x}" y="${y + 18}" text-anchor="middle" font-size="9" letter-spacing="1" fill="#8a8377">${g.lbl}</text>` +
      `<text x="${x}" y="${y + 38}" text-anchor="middle" font-size="18" font-weight="600" fill="#1f1b16" font-family="${SVG_SERIF}">${escapeHtml(String(g.val))}</text>`;
  }).join('');
  return `${rule}${cells}`;
}

// Jump rail (D4.10): one link per lifecycle stage with a per-stage artifact
// count. Stages with no artifacts render as a non-clickable muted entry.
function jumpRail(current, allArtifacts) {
  const items = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage] ?? { types: [stage], dir: stage };
    const { count } = stageArtifacts(stage, allArtifacts);
    const cur = stage === current ? ' aria-current="true"' : '';
    const inner = `<span class="lbl">${escapeHtml(stage)}</span><span class="count">${count || '·'}</span>`;
    return count > 0
      ? `<a href="${escapeHtml(pageHref(cfg.dir))}"${cur}>${inner}</a>`
      : `<span class="rail-empty"${cur}>${inner}</span>`;
  }).join('');
  return `<nav class="so-rail" aria-label="jump to stage"><h2 class="sec">jump to</h2>${items}</nav>`;
}

// Activity feed (D4.9): each row is a human-relative `when` paired with a
// `what` block (the touched file + the actor/type), inside the clickable
// activity-link. Structure mirrors the design's 88px / 1fr two-column rows.
function buildActivityList(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      flat.push({
        type:  a.frontmatter?.type ?? a.type,
        updated: a.frontmatter?.['updated-at'] ?? '',
        who: a.frontmatter?.author ?? a.frontmatter?.['updated-by'] ?? '',
        file: a.storageRel ?? a.path ?? '',
        href: a.viewRel ?? '',
      });
    }
  }
  flat.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const top = flat.slice(0, 8);
  if (!top.length) return '<p class="sdlc-lede">No artifacts yet.</p>';
  return `<ol class="activity-list">${top.map((a) => {
    const when = a.updated ? humanRelative(a.updated) : a.type;
    const who  = a.who || a.type;
    const inner = `<span class="when">${escapeHtml(when)}</span>` +
      `<span class="what"><span class="file"><code>${escapeHtml(a.file)}</code></span><span class="who">${escapeHtml(who)}</span></span>`;
    return a.href
      ? `<li><a class="activity-link" href="${escapeHtml(a.href)}">${inner}</a></li>`
      : `<li>${inner}</li>`;
  }).join('')}</ol>`;
}

// Map a raw slice status to a slice-card tone class, mirroring slice-index's
// sliceState() vocabulary so the slug-overview preview and the slice grid agree.
function sliceTone(status) {
  const s = String(status ?? '').trim().toLowerCase();
  if (['complete', 'completed', 'done', 'shipped'].includes(s)) return 'is-ok';
  if (s === 'blocked') return 'is-bad';
  if (['active', 'in-progress', 'in progress', 'wip', 'review', 'in-review'].includes(s)) return 'is-current';
  return '';
}

// ISO timestamp → "12 min ago". Returns raw text (escaped at call site).
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
  return `${Math.round(d / 30)} mo ago`;
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
    // Route through the same status→state vocabulary the slice-index cards use,
    // so 'done'/'shipped'/'wip'/etc. get the right tone (not a blank card).
    const tone = sliceTone(fm.status);
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
