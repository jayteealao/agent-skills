// renderers/plan.mjs — Figure 3 (File-change topology) + plan body.
// When a sibling .yaml + .html.fragment land, hands the body off to the
// fragment (rich files-touched cards, risk callouts, prior-revisions).

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Plan · <code>${escapeHtml(fm['slice-slug'] ?? '')}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('plan'),
      fm['revision-count'] != null && `<span class="meta">rev ${escapeHtml(fm['revision-count'])}</span>`,
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  }) + metricRow([
    fm['metric-files-to-touch'] != null && { label: 'files to touch', value: fm['metric-files-to-touch'] },
    fm['metric-step-count'] != null      && { label: 'steps',          value: fm['metric-step-count'] },
    { label: 'blockers', value: fm['has-blockers'] ? 'yes' : 'none', tone: fm['has-blockers'] ? 'warn' : 'ok' },
  ].filter(Boolean));

  // Figure 3 — file-change topology from sibling YAML. Phase 2 (v9.21.0)
  // swaps in a swim-lane projection when the plan declares cross-service
  // structure (either via a `lanes:` block or a `crosses-service` edge).
  let figureHtml = '';
  if (sy?.files?.length) {
    const dataFlow = hasDataFlowLanes(sy);
    if (dataFlow) {
      figureHtml = figureCanvas({
        figureNumber: 3,
        title: 'Data-flow lanes',
        svgInner: dataFlowLaneSvg(sy),
        legend: [
          { swatch: '#e9eef4', label: 'modified' },
          { swatch: '#ecf3e7', label: 'new' },
          { swatch: '#fbeaf0', label: 'deleted' },
          { swatch: '#f0ece1', label: 'external' },
        ],
      }) + dataFlowLegendExtra();
    } else {
      figureHtml = figureCanvas({
        figureNumber: 3,
        title: 'File-change topology',
        svgInner: fileTopologySvg(sy),
        legend: [
          { swatch: '#e9eef4', label: 'modified' },
          { swatch: '#ecf3e7', label: 'new' },
          { swatch: '#fbeaf0', label: 'deleted' },
          { swatch: '#f0ece1', label: 'external' },
        ],
      });
    }
  }

  // v9.24.0: markdown body always rendered alongside fragment (if present).
  // The figure (file-topology SVG) renders in either case.
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const bodyHtml = `${figureHtml}${fragmentBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [], children: [],
  };
}

function fileTopologySvg(sy) {
  const modules = sy.modules ?? [];
  const files   = sy.files ?? [];
  const edges   = sy.edges ?? [];

  const W = 980;
  const moduleByFile = new Map();
  // Bucket files by their module prefix
  const buckets = new Map();
  for (const m of modules) buckets.set(m, []);
  for (const f of files) {
    const mod = modules.find((m) => f.path?.startsWith(m)) ?? modules[0] ?? '';
    moduleByFile.set(f.path, mod);
    if (!buckets.has(mod)) buckets.set(mod, []);
    buckets.get(mod).push(f);
  }

  const moduleEntries = [...buckets.entries()];
  const cols = Math.min(3, Math.max(1, moduleEntries.length));
  const colW = (W - 40) / cols;
  const padTop = 30;
  const fileH = 26;
  const fileGap = 6;
  const modPad = 16;

  let H = padTop;
  const filePos = new Map();
  const modBoxes = [];

  moduleEntries.forEach(([mod, list], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 20 + col * colW;
    const fileBlockH = list.length * (fileH + fileGap) + modPad;
    const boxH = fileBlockH + 28;
    const yStart = padTop + row * (boxH + 24);
    modBoxes.push({ x, y: yStart, w: colW - 12, h: boxH, mod });
    list.forEach((f, j) => {
      filePos.set(f.path, {
        x: x + 12,
        y: yStart + 28 + j * (fileH + fileGap),
        w: colW - 36,
      });
    });
    H = Math.max(H, yStart + boxH + 20);
  });

  const moduleSvg = modBoxes.map((b) =>
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="none" stroke="#cbc4b1" stroke-dasharray="4 3" stroke-width="1"/>
     <text x="${b.x + 10}" y="${b.y + 18}" font-size="10" font-weight="600" fill="#8a8377" letter-spacing="0.8">${escapeHtml(b.mod.toUpperCase())}</text>`,
  ).join('');

  const fileSvg = files.map((f) => {
    const p = filePos.get(f.path);
    if (!p) return '';
    const role = f.role ?? 'modified';
    const fill = role === 'new' ? '#ecf3e7'
               : role === 'deleted' ? '#fbeaf0'
               : role === 'external' ? '#f0ece1'
               : '#e9eef4';
    const stroke = role === 'new' ? '#3e7d4a'
                 : role === 'deleted' ? '#b5305f'
                 : role === 'external' ? '#cbc4b1'
                 : '#4a6c8c';
    const short = escapeHtml(String(f.path).split('/').slice(-1)[0]);
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${fileH - 2}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${p.x + 8}" y="${p.y + 17}" font-size="11" fill="#1f1b16" font-family="ui-monospace, monospace">${short}</text>`;
  }).join('');

  const edgeSvg = edges.map((e) => {
    const from = filePos.get(e.from);
    const to   = filePos.get(e.to);
    if (!from || !to) return '';
    const fx = from.x + from.w, fy = from.y + fileH / 2;
    const tx = to.x,            ty = to.y + fileH / 2;
    const dash = e.kind === 'replaces' ? ' stroke-dasharray="3 3"' : '';
    const stroke = e.kind === 'replaces' ? '#b5305f' : '#8a8377';
    const cpx = (fx + tx) / 2;
    return `<path d="M ${fx} ${fy} C ${cpx} ${fy}, ${cpx} ${ty}, ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="1.2"${dash} marker-end="url(#arrow)"/>`;
  }).join('');

  const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/>
    </marker>
  </defs>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="File-change topology">
    ${defs}${moduleSvg}${fileSvg}${edgeSvg}
  </svg>`;
}

/** Phase 2 (v9.21.0): true when the plan should render as data-flow lanes.
 *  Triggered by an explicit `lanes:` block or any `crosses-service` edge. */
function hasDataFlowLanes(sy) {
  if (Array.isArray(sy.lanes) && sy.lanes.length >= 2) return true;
  return (sy.edges ?? []).some((e) => e.kind === 'crosses-service');
}

function dataFlowLegendExtra() {
  return `<div class="plan-lanes-legend">
    <span class="crosses">cross-service edge</span>
  </div>`;
}

/** Phase 2 (v9.21.0): swim-lane projection for cross-service plans.
 *  Each lane is a horizontal track of one service; cross-service edges
 *  are dashed long-haul arcs to make the data flow legible. */
function dataFlowLaneSvg(sy) {
  const lanes = inferLanes(sy);
  const edges = sy.edges ?? [];

  const W = 980;
  const padX = 28, padTop = 18;
  const laneH = 110;
  const laneGap = 22;
  const fileW = 150, fileH = 30, fileGap = 12;

  const filePos = new Map();
  const laneBoxes = [];

  lanes.forEach((lane, li) => {
    const y = padTop + li * (laneH + laneGap);
    laneBoxes.push({ y, lane });
    const labelX = padX;
    const filesStartX = padX + 130;
    lane.files.forEach((path, fi) => {
      const x = filesStartX + fi * (fileW + fileGap);
      filePos.set(path, { x, y: y + (laneH - fileH) / 2, w: fileW, h: fileH });
    });
    lane._labelX = labelX;
  });

  const H = padTop + lanes.length * (laneH + laneGap) + 10;

  // File role lookup for fill colours
  const roleByPath = new Map();
  for (const f of sy.files ?? []) roleByPath.set(f.path, f.role ?? 'modified');

  const laneSvg = laneBoxes.map(({ y, lane }) => {
    const banner = `<rect x="${padX}" y="${y}" width="${W - 2 * padX}" height="${laneH}" rx="6" fill="none" stroke="#cbc4b1" stroke-dasharray="4 3" stroke-width="1"/>`;
    const label = `<text x="${lane._labelX + 6}" y="${y + 22}" font-size="10" font-weight="700" letter-spacing="0.8" fill="#8a8377">${escapeHtml((lane.label ?? lane.service).toUpperCase())}</text>`;
    const sub = `<text x="${lane._labelX + 6}" y="${y + 38}" font-size="9" fill="#a07417">service</text>`;
    return banner + label + sub;
  }).join('');

  const fileSvg = lanes.flatMap((lane) => lane.files.map((path) => {
    const p = filePos.get(path);
    if (!p) return '';
    const role = roleByPath.get(path) ?? 'modified';
    const fill = role === 'new' ? '#ecf3e7'
               : role === 'deleted' ? '#fbeaf0'
               : role === 'external' ? '#f0ece1'
               : '#e9eef4';
    const stroke = role === 'new' ? '#3e7d4a'
                 : role === 'deleted' ? '#b5305f'
                 : role === 'external' ? '#cbc4b1'
                 : '#4a6c8c';
    const short = escapeHtml(String(path).split('/').slice(-1)[0]);
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${p.x + 10}" y="${p.y + 19}" font-size="11" fill="#1f1b16" font-family="ui-monospace, monospace">${short}</text>`;
  })).join('');

  const edgeSvg = edges.map((e) => {
    const from = filePos.get(e.from);
    const to   = filePos.get(e.to);
    if (!from || !to) return '';
    const cross = e.kind === 'crosses-service' || from.y !== to.y;
    const fx = from.x + from.w, fy = from.y + from.h / 2;
    const tx = to.x,            ty = to.y + to.h / 2;
    const stroke = cross ? '#b5305f' : '#8a8377';
    const dash = cross ? ' stroke-dasharray="4 4"' : '';
    const mid = (fy + ty) / 2;
    const sway = Math.abs(ty - fy) > 10 ? Math.max(40, Math.abs(ty - fy) * 0.6) : 0;
    const cpx1 = fx + sway, cpx2 = tx - sway;
    return `<path d="M ${fx} ${fy} C ${cpx1} ${fy}, ${cpx2} ${ty}, ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="1.4"${dash} marker-end="url(#lane-arrow)"/>
      ${cross ? `<text x="${(fx + tx) / 2}" y="${mid - 6}" text-anchor="middle" font-size="9" fill="#b5305f">${escapeHtml(e.kind)}</text>` : ''}`;
  }).join('');

  const defs = `<defs>
    <marker id="lane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/>
    </marker>
  </defs>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Data-flow lanes">
    ${defs}${laneSvg}${fileSvg}${edgeSvg}
  </svg>`;
}

/** Derive lanes when the plan only declares cross-service edges without an
 *  explicit `lanes:` block. Each file's first path segment is taken as the
 *  service hint, which is enough for the common case of `service-a/...`,
 *  `service-b/...` paths. */
function inferLanes(sy) {
  if (Array.isArray(sy.lanes) && sy.lanes.length >= 2) {
    return sy.lanes.map((l) => ({
      service: l.service,
      label: l.label ?? l.service,
      files: (l.files ?? []).filter((p) => p),
    }));
  }
  const byService = new Map();
  for (const f of sy.files ?? []) {
    const seg = String(f.path ?? '').split('/')[0] || '(root)';
    if (!byService.has(seg)) byService.set(seg, []);
    byService.get(seg).push(f.path);
  }
  return [...byService.entries()].map(([service, files]) => ({
    service, label: service, files,
  }));
}
