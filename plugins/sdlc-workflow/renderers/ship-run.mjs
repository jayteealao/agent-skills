// renderers/ship-run.mjs — single deploy run (one of many under ship/).
//
// Phase 4 (v9.23.0): when the ship-run MD ships a sibling .yaml the renderer
// emits a horizontal stages timeline (build → test → stage → canary → prod),
// a checks table grouped by kind with per-env status cells, and a rollback
// metadata panel. The `_simple.mjs` fallback still handles ship runs that
// haven't been upgraded to sibling-YAML yet.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { renderSimple } from './_simple.mjs';

const SHIP_STAGE_ORDER = ['build', 'test', 'stage', 'canary', 'prod'];

const STAGE_STATUS_COLOR = {
  ok:      { fill: '#3e7d4a', stroke: '#3e7d4a' },
  flake:   { fill: '#d4a72c', stroke: '#a07b1b' },
  fail:    { fill: '#b5305f', stroke: '#b5305f' },
  running: { fill: '#4a6c8c', stroke: '#4a6c8c' },
  pending: { fill: '#fbfaf6', stroke: '#cbc4b1' },
};

const CHECK_RESULT_TONE = {
  pass: 'ok', fail: 'bad', flake: 'warn',
  skip: 'skip', running: 'warn', pending: 'warn',
};

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const release = sy?.release ?? fm.release ?? fm['run-id'] ?? '';

  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Ship run · ${escapeHtml(release)}`,
      metricFields: [
        { key: 'metric-test-count',     label: 'tests' },
        { key: 'metric-canary-status',  label: 'canary' },
        { key: 'metric-rollback-window-min', label: 'rollback (min)' },
      ],
    });
  }

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Ship run · <code>${escapeHtml(release)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('ship'),
      sy.run_at && `<span class="meta">run ${escapeHtml(sy.run_at)}</span>`,
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const counts = countStageStatuses(sy.stages ?? []);
  const checkCount = (sy.checks ?? []).reduce(
    (n, c) => n + Object.keys(c.results ?? {}).length, 0,
  );
  const metricsHtml = metricRow([
    { label: 'ok',      value: counts.ok,      tone: 'ok' },
    { label: 'flake',   value: counts.flake,   tone: 'warn' },
    { label: 'fail',    value: counts.fail,    tone: 'bad' },
    { label: 'running', value: counts.running },
    { label: 'pending', value: counts.pending },
    { label: 'checks',  value: checkCount },
    sy.rollback?.window_minutes != null && { label: 'rollback (min)', value: sy.rollback.window_minutes },
  ].filter(Boolean));

  const timelineHtml = stagesTimeline(sy.stages ?? []);
  const checksHtml = checksTable(sy.checks ?? []);
  const rollbackHtml = rollbackPanel(sy.rollback);

  // v9.24.0: markdown body always rendered alongside fragment (if present).
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const bodyContent = `${fragmentBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${timelineHtml}${checksHtml}${rollbackHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}

function countStageStatuses(stages) {
  const out = { ok: 0, flake: 0, fail: 0, running: 0, pending: 0 };
  for (const s of stages) {
    if (out[s.status] != null) out[s.status]++;
  }
  return out;
}

function stagesTimeline(stages) {
  if (!stages.length) return '';
  // Build a lookup so we can place any subset/order onto the canonical order.
  const byName = new Map(stages.map((s) => [s.name, s]));
  const present = SHIP_STAGE_ORDER.filter((n) => byName.has(n));
  if (!present.length) return '';

  const W = 760, H = 130, padX = 40;
  const xs = evenX(W, padX, present.length);
  const cy = 60;

  const rail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;

  const stations = present.map((name, i) => {
    const s = byName.get(name);
    const c = STAGE_STATUS_COLOR[s.status] ?? STAGE_STATUS_COLOR.pending;
    const x = xs[i];
    const label = `<text x="${x}" y="${cy + 28}" text-anchor="middle" font-size="11" fill="#1f1b16" font-weight="500">${escapeHtml(name)}</text>`;
    const stat  = `<text x="${x}" y="${cy + 44}" text-anchor="middle" font-size="10" fill="#8a8377">${escapeHtml(s.status)}</text>`;
    return `<circle cx="${x}" cy="${cy}" r="9" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>${label}${stat}`;
  }).join('');

  return `<section class="ship-stages">
    <h2 class="sdlc-h2">stages</h2>
    <svg class="ship-timeline" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Ship stages timeline">
      ${rail}
      ${stations}
    </svg>
   </section>`;
}

function checksTable(checks) {
  if (!checks.length) return '';
  // Compute the union of env names so the table has stable columns.
  const envs = new Set();
  for (const c of checks) {
    for (const env of Object.keys(c.results ?? {})) envs.add(env);
  }
  const envList = Array.from(envs);

  const heads = ['name', 'kind', ...envList].map((h) =>
    `<th>${escapeHtml(h)}</th>`).join('');

  const rows = checks.map((c) => {
    const envCells = envList.map((env) => {
      const r = c.results?.[env];
      if (!r) return '<td class="meta">—</td>';
      const tone = CHECK_RESULT_TONE[r.status] ?? '';
      const dur  = r.duration_s != null ? ` <span class="meta">${escapeHtml(r.duration_s)}s</span>` : '';
      return `<td><span class="check-status is-${tone}">${escapeHtml(r.status)}</span>${dur}</td>`;
    }).join('');
    return `<tr>
      <td><code>${escapeHtml(c.name ?? '')}</code></td>
      <td><span class="check-kind">${escapeHtml(c.kind ?? '')}</span></td>
      ${envCells}
    </tr>`;
  }).join('');

  return `<section class="ship-checks">
    <h2 class="sdlc-h2">checks</h2>
    <div class="table-scroll"><table class="checks-table">
      <thead><tr>${heads}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
   </section>`;
}

function rollbackPanel(rollback) {
  if (!rollback || typeof rollback !== 'object') return '';
  const win = rollback.window_minutes != null
    ? `<span class="meta">window <strong>${escapeHtml(rollback.window_minutes)} min</strong></span>`
    : '';
  const tgt = rollback.target_release
    ? `<span class="meta">target <code>${escapeHtml(rollback.target_release)}</code></span>`
    : '';
  const apv = Array.isArray(rollback.approvers) && rollback.approvers.length
    ? `<div class="meta">approvers: ${rollback.approvers.map((a) =>
        `<code>${escapeHtml(a)}</code>`).join(', ')}</div>`
    : '';
  return `<section class="ship-rollback">
    <h2 class="sdlc-h2">rollback</h2>
    <div class="rollback-meta">${win}${tgt}</div>
    ${apv}
   </section>`;
}
