// renderers/review-command.mjs — per-dimension review (security, correctness, …).
//
// Phase 2 (v9.21.0) split: a per-dimension review page is now its own
// scoped fragment. When the per-dimension MD ships a sibling .yaml (and
// optionally a .html.fragment) the renderer emits a focused verdict block,
// a severity tally row, and a finding list narrowed to this dimension. The
// `_simple.mjs` fallback still handles dimensions that haven't been
// upgraded to sibling-YAML yet.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { verdictBlock, severityChip, findingListItem } from './_icons.mjs';
import { escapeHtml } from './_validator.mjs';
import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const dimension = sy?.dimension ?? fm.dimension ?? fm.command ?? '';

  // No sibling YAML → keep the existing simple fallback.
  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Review · ${escapeHtml(dimension)}`,
      metricFields: [
        { key: 'metric-finding-count', label: 'findings' },
        { key: 'metric-blocker-count', label: 'blockers', sev: 'blocker' },
      ],
    });
  }

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Review · <code>${escapeHtml(dimension)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('review'),
      sy.verdict && `<span class="meta">verdict <strong>${escapeHtml(sy.verdict)}</strong></span>`,
      sy.rev != null && `<span class="meta">rev ${escapeHtml(sy.rev)}</span>`,
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const counts = sy.counts ?? deriveCounts(sy.findings ?? []);
  const metricsHtml = metricRow([
    { label: 'blocker', value: counts.blocker ?? 0, sev: 'blocker' },
    { label: 'high',    value: counts.high    ?? 0, sev: 'high' },
    { label: 'med',     value: counts.med     ?? 0, sev: 'med' },
    { label: 'low',     value: counts.low     ?? 0, sev: 'low' },
    { label: 'nit',     value: counts.nit     ?? 0, sev: 'nit' },
  ]);

  const verdictHtml = sy.verdict
    ? verdictBlock(sy.verdict, sy.verdict_label ?? sy.verdict, sy.summary ?? '')
    : '';

  const findings = (sy.findings ?? [])
    .filter((f) => !f.dimension || f.dimension === dimension);
  const findingsHtml = findings.length
    ? `<section class="findings findings-${escapeHtml(dimension)}">
        <h2 class="sdlc-h2">findings</h2>
        <ol class="finding-list">
          ${findings.map(findingItem).join('')}
        </ol>
       </section>`
    : '';

  // v9.24.0: markdown body always rendered. The renderer's findings list
  // (derived from YAML) is suppressed when a fragment ships its own.
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const findingsBlock = artifact.fragment ? '' : findingsHtml;
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const bodyContent = `${fragmentBlock}${findingsBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: `${verdictHtml}${metricsHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}

function deriveCounts(findings) {
  const out = { blocker: 0, high: 0, med: 0, low: 0, nit: 0 };
  for (const f of findings) {
    if (out[f.severity] != null) out[f.severity]++;
  }
  return out;
}

function findingItem(f) {
  return findingListItem({
    chip:     severityChip(f.severity, f.severity),
    file:     f.file,
    line:     f.line,
    action:   f.action,
    msg:      f.msg,
    fix:      f.fix,
    id:       f.id,
    dataAttr: { name: 'severity', value: f.severity ?? '' },
  });
}
