// renderers/simplify-run.mjs — off-pipeline simplify output.
//
// Phase 3 (v9.22.0): when the run ships a sibling .yaml the renderer emits a
// review-shaped finding table (smaller scale — no verdict block, categorical
// chips instead of severity) plus an optional code-deltas summary. The
// _simple.mjs fallback still handles runs that haven't been upgraded.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { findingListItem } from './_icons.mjs';
import { escapeHtml } from './_validator.mjs';
import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const runId = sy?.run_id ?? fm['run-id'] ?? '';

  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Simplify · ${escapeHtml(runId)}`,
      metricFields: [
        { key: 'metric-loc-removed', label: 'LOC removed', tone: 'ok' },
        { key: 'metric-step-count',  label: 'steps' },
      ],
    });
  }

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Simplify · <code>${escapeHtml(runId)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('simplify'),
      sy.scope && `<span class="meta">scope <strong>${escapeHtml(sy.scope)}</strong></span>`,
      sy.target && `<span class="meta">target <code>${escapeHtml(sy.target)}</code></span>`,
      sy.rev != null && `<span class="meta">rev ${escapeHtml(sy.rev)}</span>`,
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const counts = sy.counts ?? {};
  const metricsHtml = metricRow([
    { label: 'reuse',      value: counts.reuse      ?? 0, tone: 'info' },
    { label: 'quality',    value: counts.quality    ?? 0, tone: 'info' },
    { label: 'efficiency', value: counts.efficiency ?? 0, tone: 'info' },
    { label: 'accepted',   value: counts.accepted   ?? 0, tone: 'ok' },
    { label: 'skipped',    value: counts.skipped    ?? 0 },
    { label: 'deferred',   value: counts.deferred   ?? 0, tone: 'warn' },
  ]);

  const summary = sy.summary
    ? `<aside class="simplify-summary"><p>${escapeHtml(sy.summary)}</p></aside>`
    : '';

  const findings = sy.findings ?? [];
  const findingsHtml = findings.length
    ? `<section class="simplify-findings">
        <h2 class="sdlc-h2">findings</h2>
        <ol class="finding-list finding-list-compact">
          ${findings.map(findingItem).join('')}
        </ol>
       </section>`
    : '';

  const deltas = sy.deltas ?? [];
  const deltasHtml = deltas.length
    ? `<section class="simplify-deltas">
        <h2 class="sdlc-h2">proposed deltas</h2>
        <table class="delta-table">
          <thead><tr><th>file</th><th>+</th><th>−</th><th>summary</th></tr></thead>
          <tbody>${deltas.map(deltaRow).join('')}</tbody>
        </table>
       </section>`
    : '';

  // v9.24.0: markdown body always rendered alongside fragment (if present).
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const bodyContent = `${fragmentBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${summary}${findingsHtml}${deltasHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}

function findingItem(f) {
  const cat = f.category ?? 'reuse';
  return findingListItem({
    chip:     `<span class="finding-cat is-${escapeHtml(cat)}">${escapeHtml(cat)}</span>`,
    file:     f.file,
    line:     f.line,
    action:   f.action,
    msg:      f.msg,
    fix:      f.fix,
    id:       f.id,
    variant:  'finding-compact',
    dataAttr: { name: 'category', value: cat },
  });
}

function deltaRow(d) {
  const add = d.add != null ? `+${escapeHtml(d.add)}` : '';
  const rem = d.rem != null ? `−${escapeHtml(d.rem)}` : '';
  return `<tr>
    <td><code>${escapeHtml(d.file ?? '')}</code></td>
    <td class="delta-add">${add}</td>
    <td class="delta-rem">${rem}</td>
    <td>${escapeHtml(d.summary ?? '')}</td>
  </tr>`;
}
