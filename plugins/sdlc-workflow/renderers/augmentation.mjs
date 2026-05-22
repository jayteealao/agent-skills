// renderers/augmentation.mjs — generic augmentation (benchmark | experiment |
// instrument | rca). Branches internally on augmentation-type.
//
// Phase 2 (v9.21.0) added the rca→sibling-YAML branch with timeline + causal
// chain + optional 5-whys panel. Phase 3 (v9.22.0) extends sibling-YAML
// support to the other three augmentation subtypes — each with its own
// structured-result projection (benchmark = metric comparison, experiment =
// arm allocation + guardrails, instrument = signal table + dark-paths list).

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

  // Rich rendering dispatches on (augmentation-type, sibling-YAML present).
  if (artifact.siblingYaml) {
    if (type === 'rca')        return renderRca(artifact, ctx);
    if (type === 'benchmark')  return renderBenchmark(artifact, ctx);
    if (type === 'experiment') return renderExperiment(artifact, ctx);
    if (type === 'instrument') return renderInstrument(artifact, ctx);
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

  // Phase 2 (v9.21.0) — optional 5-whys drill panel. Sourced from sibling
  // YAML; when absent the panel is omitted. Sits between the causal-chain
  // figure and contributing-causes so the drill reads as the bridge from
  // chain → causes.
  const fiveWhysHtml = renderFiveWhys(sy.five_whys);

  const bodyHtml = `
    ${metricsHtml}${figs}${bodyContent}${fiveWhysHtml}
    ${causes ? `<section class="rca-causes"><h2 class="sdlc-h2">contributing causes</h2>${causes}</section>` : ''}
    ${mitigations ? `<section class="rca-mitigations"><h2 class="sdlc-h2">mitigations applied</h2>${mitigations}</section>` : ''}
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

/** Render the optional 5-whys drill as a collapsible <details> chain. The
 *  last entry is treated as the root cause when explicitly marked, or
 *  inferred when the answer text begins with "ROOT:". */
function renderFiveWhys(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return '';
  const lastIdx = chain.length - 1;
  const rootMarked = chain.some((w) => w.root) ||
    /^\s*ROOT\b/i.test(chain[lastIdx]?.answer ?? '');
  const items = chain.map((w, i) => {
    const isRoot = w.root === true || (rootMarked && i === lastIdx && !chain.some((x, j) => x.root && j !== lastIdx));
    const q = escapeHtml(w.question ?? '');
    const a = escapeHtml((w.answer ?? '').replace(/^\s*ROOT[:\s-]+/i, ''));
    return `<li${isRoot ? ' class="is-root"' : ''}>
      <div>
        <p class="why-q">${q}</p>
        <p class="why-a">${a}</p>
      </div>
    </li>`;
  }).join('');
  const rootCls = rootMarked ? ' is-root' : '';
  return `<details class="rca-five-whys${rootCls}">
    <summary>5 whys</summary>
    <ol class="why-chain">${items}</ol>
  </details>`;
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

/* ───────────────── Phase 3 (v9.22.0) — non-RCA subtypes ───────────────── */

function renderBenchmark(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Benchmark · <code>${escapeHtml(sy.target ?? fm.title ?? '')}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('benchmark'),
      sy.mode && `<span class="meta">mode <strong>${escapeHtml(sy.mode)}</strong></span>`,
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`,
      sy.language && `<span class="meta">${escapeHtml(sy.language)}</span>`,
      sy.measured_at && `<span class="meta">${escapeHtml(sy.measured_at)}</span>`,
    ],
  });

  const metricsHtml = metricRow([
    { label: 'metrics',      value: (sy.metrics ?? []).length },
    sy.improvements?.length && { label: 'improvements', value: sy.improvements.length, tone: 'ok' },
    sy.regressions?.length  && { label: 'regressions',  value: sy.regressions.length,  tone: 'bad' },
  ].filter(Boolean));

  const metricsTable = (sy.metrics ?? []).length
    ? `<section class="aug-result aug-benchmark">
        <h2 class="sdlc-h2">metrics</h2>
        <table class="benchmark-table">
          <thead><tr><th>metric</th><th>before</th><th>after</th><th>Δ</th></tr></thead>
          <tbody>${sy.metrics.map((m) => benchmarkRow(m, sy)).join('')}</tbody>
        </table>
       </section>`
    : '';

  const notes = sy.notes
    ? callout('info', 'notes', `<p>${escapeHtml(sy.notes)}</p>`)
    : '';

  const bodyContent = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body ?? '')}</div>`;

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${metricsTable}${notes}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}

function benchmarkRow(m, sy) {
  const isLower = m.direction !== 'higher-is-better';
  const before = Number(m.before ?? 0);
  const after  = Number(m.after);
  const delta = m.delta_pct != null
    ? Number(m.delta_pct)
    : (before === 0 ? 0 : ((after - before) / before) * 100);
  const improved = isLower ? delta < 0 : delta > 0;
  const tone = improved ? 'is-ok' : (delta === 0 ? '' : 'is-bad');
  const sign = delta > 0 ? '+' : '';
  const unit = m.unit ? ` ${escapeHtml(m.unit)}` : '';
  const beforeCell = m.before != null ? `${before}${unit}` : '—';
  return `<tr>
    <td>${escapeHtml(m.name ?? '')}</td>
    <td>${beforeCell}</td>
    <td>${after}${unit}</td>
    <td class="delta-cell ${tone}">${sign}${delta.toFixed(1)}%</td>
  </tr>`;
}

function renderExperiment(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Experiment · <code>${escapeHtml(sy.flag ?? fm.title ?? '')}</code>`,
    badges: [
      statusBadge(sy.status ?? fm.status),
      stageBadge('experiment'),
      sy.experiment_type && `<span class="meta">${escapeHtml(sy.experiment_type)}</span>`,
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`,
      sy.split && `<span class="meta">split ${escapeHtml(sy.split)}</span>`,
    ],
  });

  const hypoHtml = sy.hypothesis
    ? callout('info', 'hypothesis', `<p>${escapeHtml(sy.hypothesis)}</p>`)
    : '';

  const armsFigure = (sy.arms ?? []).length
    ? figureCanvas({
        figureNumber: 1,
        title: 'Arm allocation',
        svgInner: armsBar(sy.arms),
      })
    : '';

  const armsList = (sy.arms ?? []).length
    ? `<dl class="exp-arms">${
        sy.arms.map((a) =>
          `<dt><code>${escapeHtml(a.id)}</code> · ${escapeHtml(a.allocated_pct)}%</dt>
           <dd>${escapeHtml(a.description ?? '')}</dd>`
        ).join('')
      }</dl>`
    : '';

  const guardrailsHtml = (sy.guardrails ?? []).length
    ? `<section class="aug-result aug-experiment-guardrails">
        <h2 class="sdlc-h2">guardrails</h2>
        <table class="guardrail-table">
          <thead><tr><th>metric</th><th>threshold</th><th>direction</th></tr></thead>
          <tbody>${sy.guardrails.map((g) => `
            <tr>
              <td>${escapeHtml(g.name)}</td>
              <td>${escapeHtml(g.threshold)}${g.unit ? ' ' + escapeHtml(g.unit) : ''}</td>
              <td>${escapeHtml(g.direction)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
       </section>`
    : '';

  const bodyContent = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body ?? '')}</div>`;

  return {
    headerHtml,
    bodyHtml: `${hypoHtml}${armsFigure}${armsList}${guardrailsHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}

function armsBar(arms) {
  const W = 980, padX = 20, H = 60, barY = 18, barH = 28;
  const total = arms.reduce((s, a) => s + Number(a.allocated_pct ?? 0), 0) || 100;
  const COLORS = ['#4a6c8c', '#3e7d4a', '#a07417', '#6b4a8a', '#b5305f'];
  let x = padX;
  const cells = arms.map((a, i) => {
    const pct = Number(a.allocated_pct ?? 0);
    const w = (pct / total) * (W - 2 * padX);
    const color = COLORS[i % COLORS.length];
    const g = `<g>
      <rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${color}"/>
      <text x="${x + 8}" y="${barY + 18}" font-size="11" font-weight="600" fill="#fbf9f3">${escapeHtml(a.id)}</text>
      <text x="${x + 8}" y="${barY + barH + 14}" font-size="10" fill="#4a443c">${pct}%</text>
    </g>`;
    x += w;
    return g;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Experiment arm allocation">${cells}</svg>`;
}

function renderInstrument(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Instrument · <code>${escapeHtml(sy.framework ?? fm.title ?? '')}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('instrument'),
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`,
    ],
  });

  const metricsHtml = metricRow([
    { label: 'signals',    value: (sy.signals ?? []).length },
    { label: 'dark paths', value: (sy.dark_paths ?? []).length, tone: (sy.dark_paths ?? []).length ? 'warn' : 'ok' },
    sy.pii_warnings != null && { label: 'PII warnings', value: sy.pii_warnings, tone: sy.pii_warnings ? 'bad' : 'ok' },
  ].filter(Boolean));

  const signalsHtml = (sy.signals ?? []).length
    ? `<section class="aug-result aug-instrument-signals">
        <h2 class="sdlc-h2">signals</h2>
        <table class="signal-table">
          <thead><tr><th>name</th><th>kind</th><th>PII</th><th>path</th></tr></thead>
          <tbody>${sy.signals.map((s) => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td><span class="signal-kind is-${escapeHtml(s.kind)}">${escapeHtml(s.kind)}</span></td>
              <td>${s.pii ? '<span class="signal-pii">yes</span>' : '—'}</td>
              <td>${s.path ? `<code>${escapeHtml(s.path)}</code>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
       </section>`
    : '';

  const darkHtml = (sy.dark_paths ?? []).length
    ? `<section class="aug-result aug-instrument-dark">
        <h2 class="sdlc-h2">dark paths</h2>
        ${sy.dark_paths.map((d) => callout('warn', d.path, `<p>${escapeHtml(d.reason ?? '')}</p>`)).join('')}
       </section>`
    : '';

  const bodyContent = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body ?? '')}</div>`;

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${signalsHtml}${darkHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
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
