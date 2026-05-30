// renderers/workflow-index.mjs — overview page for quick / investigative
// workflows (/wf-quick rca|fix|probe|investigate).
//
// These don't walk the 10-stage pipeline that index.mjs assumes. Their
// lifecycle is a short routed sequence captured in the 00-index.md frontmatter
// (workflow-type, recommended-routes, a free-form progress map) plus a handful
// of artifacts (01-rca.md, 02-shape.md, …). Rendering them through index.mjs
// produced a mostly-empty 10-stage grid, so they get their own renderer that
// surfaces the routing/progress model instead and links every sibling artifact.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas, evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const wfType = fm['workflow-type'] ?? 'quick';
  const stage  = fm['current-stage'] ?? '';

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? fm.slug ?? 'untitled'),
    lede: escapeHtml(fm.description ?? fm.lede ?? fm.summary ?? ''),   // D4.1 (was hard-coded '')
    badges: [
      statusBadge(fm.status),
      `<span class="stage-badge">${escapeHtml(wfType)}</span>`,
      stage && stageBadge(stage),
      fm.branch && `<span class="meta">branch <code>${escapeHtml(fm.branch)}</code></span>`,
      fm['updated-at'] && `<span class="meta">updated ${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const metrics = [
    { label: 'type', value: wfType },
    fm['selected-slice'] && { label: 'target', value: fm['selected-slice'] },
    stage && { label: 'stage', value: stage },
  ].filter(Boolean);
  const metricsHtml = metrics.length ? metricRow(metrics) : '';

  // Figure 2 for quick/investigative slugs (D4.12) — a routing stripe derived
  // from the free-form progress map (falling back to the sibling artifacts).
  const figureHtml   = quickFigure(fm, ctx.allArtifacts);
  const routesHtml    = routesSection(fm);
  const artifactsHtml = artifactsSection(ctx.allArtifacts);
  const progressHtml  = progressSection(fm.progress);
  const questionsHtml = openQuestionsSection(fm['open-questions']);
  const tagsHtml      = tagsSection(fm.tags);
  const proseHtml     = artifact.body ? md2html(artifact.body) : '';

  const bodyHtml = `
    ${figureHtml}
    ${metricsHtml}
    ${routesHtml}
    ${artifactsHtml}
    ${progressHtml}
    <section class="so-grid">
      <div class="so-rail prose">
        ${proseHtml || '<p class="sdlc-lede">Quick workflow overview.</p>'}
      </div>
      <aside class="activity">
        ${questionsHtml}
        ${tagsHtml}
      </aside>
    </section>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

// Recommended next route(s). Quick workflows end by recommending a follow-up
// command (operator action, /wf-quick fix, …) rather than advancing a stage.
function routesSection(fm) {
  const rr = (fm['recommended-routes'] && typeof fm['recommended-routes'] === 'object') ? fm['recommended-routes'] : {};
  const primary    = rr.primary ?? fm['next-command'] ?? '';
  const invocation = fm['next-invocation'] ?? '';
  const alternates = Array.isArray(rr.alternates) ? rr.alternates : [];
  if (!primary && !invocation && !alternates.length) return '';
  const alts = alternates.length
    ? `<ul class="route-alts">${alternates.map((a) => `<li><code>${escapeHtml(String(a))}</code></li>`).join('')}</ul>`
    : '';
  return `<section class="next-route">
    <h2 class="sdlc-h2">recommended next</h2>
    ${primary ? `<p class="route-primary"><code>${escapeHtml(String(primary))}</code></p>` : ''}
    ${invocation ? `<p class="meta">${escapeHtml(String(invocation))}</p>` : ''}
    ${alts}
  </section>`;
}

// Every sibling artifact (rca/fix/probe/shape/…) as a clickable card. Reads
// ctx.allArtifacts (keyed by type), each entry carrying the view-relative href
// the orchestrator assigned. Skips the workflow-index page itself.
function artifactsSection(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      if (a?.frontmatter?.type === 'workflow-index') continue;
      if (!a?.viewRel) continue;
      flat.push(a);
    }
  }
  if (!flat.length) return '';
  flat.sort((a, b) => String(a.storageRel ?? '').localeCompare(String(b.storageRel ?? '')));
  const cards = flat.map((a) => {
    const t = a.frontmatter?.type ?? 'artifact';
    const title = a.frontmatter?.title ?? a.storageRel ?? t;
    return `<a class="slice-card" href="${escapeHtml(pageHref(a.viewRel))}">
      <span class="slice-slug"><code>${escapeHtml(t)}</code></span>
      <span class="slice-title">${escapeHtml(title)}</span>
    </a>`;
  }).join('');
  return `<section class="slug-artifacts">
    <h2 class="sdlc-h2">artifacts · ${flat.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}

// Free-form progress map: { rca: complete, shape-synthesized: complete, … }.
function progressSection(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return '';
  const entries = Object.entries(progress);
  if (!entries.length) return '';
  const items = entries.map(([k, v]) => {
    const done = v === true || String(v).toLowerCase() === 'complete';
    return `<li class="${done ? 'is-ok' : ''}"><code>${escapeHtml(k)}</code> <span class="meta">${escapeHtml(String(v))}</span></li>`;
  }).join('');
  return `<section class="slug-progress">
    <h2 class="sdlc-h2">progress</h2>
    <ul class="progress-list">${items}</ul>
  </section>`;
}

function openQuestionsSection(questions) {
  if (!Array.isArray(questions) || !questions.length) return '';
  const items = questions.map((q) => `<li>${escapeHtml(String(q))}</li>`).join('');
  return `<h2 class="sdlc-h2">open questions</h2><ul class="open-questions">${items}</ul>`;
}

function tagsSection(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  const chips = tags.map((t) => `<span class="stage-badge">${escapeHtml(String(t))}</span>`).join(' ');
  return `<h2 class="sdlc-h2">tags</h2><div class="meta-row">${chips}</div>`;
}

// Figure 2 for quick/investigative workflows (D4.12). Quick workflows don't
// walk the 10-stage pipeline, so the stripe is built from the routing progress
// map (ordered steps with done flags) or, absent that, the sibling artifacts.
function quickFigure(fm, allArtifacts) {
  const progress = (fm.progress && typeof fm.progress === 'object' && !Array.isArray(fm.progress)) ? fm.progress : null;
  let steps;
  if (progress) {
    steps = Object.entries(progress).map(([k, v]) => ({
      label: k,
      done: v === true || String(v).toLowerCase() === 'complete',
    }));
  } else {
    steps = [];
    for (const list of Object.values(allArtifacts ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (a?.frontmatter?.type === 'workflow-index') continue;
        steps.push({ label: a.frontmatter?.type ?? 'step', done: true });
      }
    }
  }
  if (!steps.length) return '';
  return figureCanvas({
    figureNumber: 2,
    title: `Routing — ${fm['workflow-type'] ?? 'quick'}`,
    svgInner: quickStripeSvg(steps),
    legend: [
      { state: 'done',    label: 'done' },
      { state: 'current', label: 'current' },
      { state: 'queued',  label: 'queued' },
    ],
  });
}

function quickStripeSvg(steps) {
  const W = 920, padX = 60, cy = 70, H = 130;
  const xs = evenX(W, padX, steps.length);
  const rail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);
  // >= 0 (not > 0): a single done step at index 0 should still anchor the
  // overlay — same clamp/sentinel edge as the dashboard shipped-dot fix.
  const progress = lastDone >= 0
    ? `<line x1="${xs[0]}" y1="${cy}" x2="${xs[lastDone]}" y2="${cy}" stroke="#1f1b16" stroke-width="2.5"/>`
    : '';
  const nodes = steps.map((s, i) => {
    const x = xs[i];
    const isCur = !s.done && i === lastDone + 1;
    const fill   = s.done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#fbfaf6';
    const stroke = s.done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#cbc4b1';
    const dot = isCur
      ? `<circle cx="${x}" cy="${cy}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="2"/><circle cx="${x}" cy="${cy}" r="8" fill="none" stroke="#fbfaf6" stroke-width="1.2" stroke-dasharray="3 3"/>`
      : s.done
        ? `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
        : `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
    const label = `<text x="${x}" y="${cy + 28}" text-anchor="middle" font-size="10" fill="#1f1b16">${escapeHtml(String(s.label).slice(0, 16))}</text>`;
    return `${dot}${label}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Routing stripe">${rail}${progress}${nodes}</svg>`;
}
