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
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const wfType = fm['workflow-type'] ?? 'quick';
  const stage  = fm['current-stage'] ?? '';

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? fm.slug ?? 'untitled'),
    lede: '',
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

  const routesHtml    = routesSection(fm);
  const artifactsHtml = artifactsSection(ctx.allArtifacts);
  const progressHtml  = progressSection(fm.progress);
  const questionsHtml = openQuestionsSection(fm['open-questions']);
  const tagsHtml      = tagsSection(fm.tags);
  const proseHtml     = artifact.body ? md2html(artifact.body) : '';

  const bodyHtml = `
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
