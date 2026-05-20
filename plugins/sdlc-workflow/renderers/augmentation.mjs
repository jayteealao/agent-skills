// renderers/augmentation.mjs — generic augmentation (benchmark | experiment |
// instrument | rca). Branches internally on augmentation-type.

import { renderSimple } from './_simple.mjs';
import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas } from './_figure.mjs';
import { callout } from './_icons.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const type = fm['augmentation-type'] ?? fm['augmentation_type'] ?? null;

  // For rca augmentations carrying a sibling .yaml, render the rich figure-pair
  // (incident timeline + causal chain). Body offloads to .html.fragment if present.
  if (type === 'rca' && artifact.siblingYaml) {
    return renderRca(artifact, ctx);
  }

  return renderSimple(artifact, ctx, {
    title: `Augmentation · ${escapeHtml(type ?? fm.title ?? '')}`,
  });
}

function renderRca(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(sy.title ?? fm.title ?? 'Incident'),
    badges: [
      statusBadge(fm.status),
      stageBadge('rca'),
      sy.incident && `<span class="meta">${escapeHtml(sy.incident)}</span>`,
      sy.resolved_at && `<span class="meta">resolved ${escapeHtml(sy.resolved_at)}</span>`,
    ],
  });

  const m = sy.metrics ?? {};
  const metricsHtml = metricRow([
    m.duration         && { label: 'duration',    value: m.duration },
    m.time_to_detect   && { label: 'detect',      value: m.time_to_detect },
    m.time_to_mitigate && { label: 'mitigate',    value: m.time_to_mitigate },
    m.user_failures    && { label: 'failures',    value: m.user_failures, tone: 'warn' },
    m.revenue_impact_usd && { label: 'revenue',   value: `$${Number(m.revenue_impact_usd).toLocaleString()}`, tone: 'warn' },
  ].filter(Boolean));

  const timelineSvg = sy.timeline?.length ? timelineFigure(sy) : '';
  const chainSvg = sy.chain?.length ? causalChainFigure(sy) : '';
  const figs = [
    timelineSvg && figureCanvas({ figureNumber: 1, title: 'Incident timeline', svgInner: timelineSvg }),
    chainSvg    && figureCanvas({ figureNumber: 2, title: 'Causal chain',      svgInner: chainSvg }),
  ].filter(Boolean).join('');

  const causes = (sy.contributing_causes ?? []).map((c) =>
    callout('warn', escapeHtml(c.title), `<p>${escapeHtml(c.body ?? '')}</p>`)).join('');
  const mitigations = (sy.mitigations ?? []).map((mi) =>
    callout('info', `${escapeHtml(mi.at ?? '')} · ${escapeHtml(mi.title)}`, `<p>${escapeHtml(mi.body ?? '')}</p>`)).join('');

  const bodyContent = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body ?? '')}</div>`;

  const bodyHtml = `
    ${metricsHtml}${figs}${bodyContent}
    ${causes ? `<section class="rca-causes"><h2 class="sdlc-h2">contributing causes</h2>${causes}</section>` : ''}
    ${mitigations ? `<section class="rca-mitigations"><h2 class="sdlc-h2">mitigations applied</h2>${mitigations}</section>` : ''}
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function timelineFigure(sy) {
  const events = sy.timeline ?? [];
  const W = 980, H = 130, padX = 60, cy = 65;
  const xs = events.map((_, i) => padX + (i * (W - 2 * padX)) / Math.max(1, events.length - 1));
  const KIND_COLOR = {
    alert: '#b5305f', escalation: '#a07417', deploy: '#4a6c8c',
    mitigation: '#6b4a8a', resolution: '#3e7d4a',
  };
  const rail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  const dots = events.map((e, i) => {
    const x = xs[i];
    const c = KIND_COLOR[e.kind] ?? '#4a6c8c';
    return `<g><circle cx="${x}" cy="${cy}" r="9" fill="${c}"/>
      <text x="${x}" y="${cy - 18}" text-anchor="middle" font-size="10" fill="#4a443c">${escapeHtml(e.at ?? '')}</text>
      <text x="${x}" y="${cy + 26}" text-anchor="middle" font-size="10" font-weight="600" fill="${c}">${escapeHtml((e.kind ?? '').toUpperCase())}</text>
      <text x="${x}" y="${cy + 40}" text-anchor="middle" font-size="9" fill="#1f1b16">${escapeHtml((e.title ?? '').slice(0, 22))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Incident timeline">${rail}${dots}</svg>`;
}

function causalChainFigure(sy) {
  const steps = sy.chain ?? [];
  const W = 980, padX = 30;
  const cellW = (W - 2 * padX) / steps.length - 16;
  const H = 110;
  const cells = steps.map((s, i) => {
    const x = padX + i * (cellW + 16);
    const isRoot = s.step === 'ROOT_CAUSE';
    const fill = isRoot ? '#fbeaf0' : '#f3f1ea';
    const stroke = isRoot ? '#b5305f' : '#cbc4b1';
    const arrow = i < steps.length - 1
      ? `<line x1="${x + cellW + 2}" y1="55" x2="${x + cellW + 14}" y2="55" stroke="#8a8377" stroke-width="1.5" marker-end="url(#chain-arrow)"/>`
      : '';
    return `<g>
      <rect x="${x}" y="20" width="${cellW}" height="70" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${x + 12}" y="40" font-size="10" font-weight="700" letter-spacing="1" fill="${isRoot ? '#b5305f' : '#8a8377'}">${escapeHtml(s.step)}</text>
      <text x="${x + 12}" y="62" font-size="11" fill="#1f1b16">${escapeHtml((s.body ?? '').slice(0, 50))}</text>
      ${arrow}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Causal chain">
    <defs><marker id="chain-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/></marker></defs>
    ${cells}
  </svg>`;
}
