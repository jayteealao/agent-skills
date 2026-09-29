// components/explainer/_prepare.mjs — data preparers for the explainer snippets.
//
// The explainer snippets (sequence, comparison, cycle, dependency, layout,
// trend, states, steps) are logic-free templates. Each preparer here turns the author's JSON payload into
// the values the template substitutes: step numbers, bar widths, node
// coordinates, SVG path strings. Every preparer is a pure function (no clock,
// no random), so the same payload expands to the same bytes.
//
// Colours are never literals: every preparer emits CSS custom properties of the
// view's theme (var(--accent), var(--ink), …), so a visual follows whichever
// theme token set the page defines, light or dark.
//
// Template keys are lower-case snake_case: the snippet placeholder grammar
// ({{key}}) accepts only [a-z0-9_.-].

// Tone → theme token. Unknown tones fall back to the accent colour.
const TONES = {
  accent: 'var(--accent)',
  ok: 'var(--low)',
  good: 'var(--low)',
  warn: 'var(--med)',
  bad: 'var(--high)',
  risk: 'var(--blocker)',
  muted: 'var(--ink-3)',
};

function tone(t) {
  return TONES[String(t ?? '').toLowerCase()] ?? TONES.accent;
}

// Tone → the soft background token that pairs with it (layout regions).
const TONE_BGS = {
  accent: 'var(--accent-soft)',
  ok: 'var(--low-bg)',
  good: 'var(--low-bg)',
  warn: 'var(--med-bg)',
  bad: 'var(--high-bg)',
  risk: 'var(--blocker-bg)',
  muted: 'var(--paper-2)',
};

function toneBg(t) {
  return TONE_BGS[String(t ?? '').toLowerCase()] ?? TONE_BGS.accent;
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function str(v) {
  return v == null ? '' : String(v);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** FNV-1a 32-bit hash → base36: a deterministic id suffix for SVG markers. */
function hashId(value) {
  const text = JSON.stringify(value ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** A 0- or 1-element list: the template's only conditional ({{#each}}). */
function opt(v) {
  return v == null || v === '' ? [] : [v];
}

/** Split a label into at most `maxLines` lines of about `width` characters. */
function wrapLabel(label, width = 16, maxLines = 2) {
  const words = str(label).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, width - 1)}…`;
    return kept;
  }
  return lines.length ? lines : [''];
}

/** `<tspan>` line data centred on (x, y) for a wrapped label. */
function labelLines(label, x, y, width) {
  const lines = wrapLabel(label, width);
  const lineH = 14;
  const first = y - ((lines.length - 1) * lineH) / 2 + 4;
  return lines.map((t, i) => ({ t, x: round1(x), y: round1(first + i * lineH) }));
}

/* ───────────────────────────── sequence ───────────────────────────── */

/**
 * explainer/sequence
 *   { "title": "…", "steps": [ { "label": "…", "text": "…", "lane": "…" } ] }
 * `lane` (optional) names the actor or system that does the step.
 */
export function prepareSequence(data = {}) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  return {
    title: str(data.title),
    title_list: opt(data.title),
    steps: steps.map((s, i) => {
      const o = typeof s === 'object' && s ? s : { label: s };
      return {
        n: i + 1,
        label: str(o.label),
        text_list: opt(o.text),
        lane_list: opt(o.lane),
      };
    }),
  };
}

/* ──────────────────────────── comparison ──────────────────────────── */

/**
 * explainer/comparison
 *   { "title": "…", "unit": "ms", "max": 200,
 *     "bars": [ { "label": "…", "value": 120, "tone": "ok|warn|bad|accent|muted", "note": "…" } ] }
 * `max` is optional (default: the largest value). Widths are percentages of it.
 */
export function prepareComparison(data = {}) {
  const bars = Array.isArray(data.bars) ? data.bars : [];
  const values = bars.map((b) => Number(b?.value) || 0);
  const max = Number(data.max) > 0 ? Number(data.max) : Math.max(0, ...values);
  const unit = str(data.unit);
  return {
    title: str(data.title),
    title_list: opt(data.title),
    bars: bars.map((b, i) => {
      const v = values[i];
      const pct = max > 0 ? Math.max(0, Math.min(100, round1((v / max) * 100))) : 0;
      return {
        label: str(b?.label),
        pct,
        color: tone(b?.tone),
        value_text: `${str(b?.value ?? v)}${unit ? ` ${unit}` : ''}`,
        note_list: opt(b?.note),
      };
    }),
  };
}

/* ─────────────────────────────── cycle ─────────────────────────────── */

/**
 * explainer/cycle
 *   { "title": "…", "states": [ { "label": "…", "note": "…", "tone": "…" } ] }
 * The states sit on a circle in order; arrows run from each state to the next,
 * and the last arrow closes the loop back to the first state.
 */
export function prepareCycle(data = {}) {
  const raw = Array.isArray(data.states) ? data.states : [];
  const states = raw.map((s) => (typeof s === 'object' && s ? s : { label: s }));
  const n = states.length;
  const R = Math.max(90, n * 26);
  const nodeW = 120;
  const nodeH = 40;
  const W = 2 * R + nodeW + 40;
  const H = 2 * R + nodeH + 40;
  const cx = W / 2;
  const cy = H / 2;
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
  const nodes = states.map((s, i) => {
    const a = angle(i);
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    return {
      n: i + 1,
      label: str(s.label),
      rx: round1(x - nodeW / 2),
      ry: round1(y - nodeH / 2),
      w: nodeW,
      h: nodeH,
      stroke: tone(s.tone),
      lines: labelLines(s.label, x, y, 15),
      note_list: s.note ? [{ n: i + 1, label: str(s.label), text: str(s.note) }] : [],
    };
  });
  // Arcs along the circle, trimmed so they start and end outside the nodes.
  const trim = Math.min(((2 * Math.PI) / Math.max(n, 1)) * 0.3, 70 / R);
  const arcs = n < 2 ? [] : states.map((_, i) => {
    const a0 = angle(i) + trim;
    const a1 = angle(i + 1) - trim;
    const x0 = round1(cx + R * Math.cos(a0));
    const y0 = round1(cy + R * Math.sin(a0));
    const x1 = round1(cx + R * Math.cos(a1));
    const y1 = round1(cy + R * Math.sin(a1));
    return { d: `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}` };
  });
  return {
    title: str(data.title),
    title_list: opt(data.title),
    id: `xpl-cyc-${hashId(data)}`,
    width: round1(W),
    height: round1(H),
    nodes,
    arcs,
  };
}

/* ───────────────────────────── dependency ───────────────────────────── */

/**
 * Longest-path layering over the forward edges (edges that follow the input
 * order of a DFS); back-edges are drawn but do not move a node. Shared by the
 * dependency and states snippets. `edges` must hold no self-edge.
 * Returns { columns: [[id, …], …], back: Set<"from->to"> }.
 */
function layerColumns(nodes, edges) {
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from).push(e.to);
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const to of out.get(id)) {
      if (state.get(to) === 1) back.add(`${id}->${to}`);
      else if (!state.get(to)) visit(to);
    }
    state.set(id, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (back.has(`${e.from}->${e.to}`)) continue;
      const want = layer.get(e.from) + 1;
      if (layer.get(e.to) < want) { layer.set(e.to, want); changed = true; }
    }
    if (!changed) break;
  }
  const columns = [];
  for (const n of nodes) {
    const l = layer.get(n.id);
    (columns[l] ??= []).push(n.id);
  }
  for (const col of columns) col?.sort((a, b) => order.get(a) - order.get(b));
  return { columns, back };
}

/**
 * explainer/dependency
 *   { "title": "…",
 *     "nodes": [ { "id": "api", "label": "API", "tone": "…", "note": "…" } ],
 *     "edges": [ { "from": "api", "to": "db", "label": "reads" } ] }
 * An edge may also be a pair: ["api", "db"]. Columns follow the longest path
 * from a source node, so an edge points left to right; a back-edge (a cycle)
 * curves below the nodes.
 */
export function prepareDependency(data = {}) {
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const nodes = rawNodes.map((n) => (typeof n === 'object' && n ? n : { id: n, label: n }))
    .map((n) => ({ ...n, id: str(n.id ?? n.label), label: str(n.label ?? n.id) }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(data.edges) ? data.edges : [])
    .map((e) => (Array.isArray(e) ? { from: e[0], to: e[1] } : e))
    .filter((e) => e && ids.has(str(e.from)) && ids.has(str(e.to)) && str(e.from) !== str(e.to))
    .map((e) => ({ from: str(e.from), to: str(e.to), label: str(e.label) }));

  const { columns, back } = layerColumns(nodes, edges);

  const nodeW = 140;
  const nodeH = 44;
  const gapX = 70;
  const gapY = 22;
  const pad = 20;
  const rows = Math.max(1, ...columns.map((c) => c?.length ?? 0));
  const cols = Math.max(1, columns.length);
  const W = pad * 2 + cols * nodeW + (cols - 1) * gapX;
  const hasBack = back.size > 0;
  const H = pad * 2 + rows * nodeH + (rows - 1) * gapY + (hasBack ? 40 : 0);
  const pos = new Map();
  columns.forEach((col, ci) => (col ?? []).forEach((id, ri) => {
    pos.set(id, { x: pad + ci * (nodeW + gapX), y: pad + ri * (nodeH + gapY) });
  }));

  const outNodes = nodes.map((n) => {
    const p = pos.get(n.id);
    return {
      id: n.id,
      label: n.label,
      rx: p.x,
      ry: p.y,
      w: nodeW,
      h: nodeH,
      stroke: tone(n.tone),
      lines: labelLines(n.label, p.x + nodeW / 2, p.y + nodeH / 2, 18),
      note_list: n.note ? [{ label: n.label, text: str(n.note) }] : [],
    };
  });
  const outEdges = edges.map((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    const isBack = back.has(`${e.from}->${e.to}`) || b.x <= a.x;
    let d;
    let lx;
    let ly;
    if (!isBack) {
      const x0 = a.x + nodeW;
      const y0 = a.y + nodeH / 2;
      const x1 = b.x - 4;
      const y1 = b.y + nodeH / 2;
      const mx = round1((x0 + x1) / 2);
      d = `M ${x0} ${y0} C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
      lx = mx;
      ly = round1((y0 + y1) / 2 - 6);
    } else {
      const x0 = a.x + nodeW / 2;
      const y0 = a.y + nodeH;
      const x1 = b.x + nodeW / 2;
      const y1 = b.y + nodeH + 4;
      const low = H - pad / 2;
      d = `M ${x0} ${y0} C ${x0} ${low} ${x1} ${low} ${x1} ${y1}`;
      lx = round1((x0 + x1) / 2);
      ly = round1(low - 4);
    }
    return { d, label_list: e.label ? [{ t: e.label, x: lx, y: ly }] : [], dash: isBack ? '5 4' : 'none' };
  });
  return {
    title: str(data.title),
    title_list: opt(data.title),
    id: `xpl-dep-${hashId(data)}`,
    width: W,
    height: H,
    nodes: outNodes,
    edges: outEdges,
  };
}

/* ─────────────────────────────── layout ─────────────────────────────── */

/**
 * explainer/layout
 *   { "title": "…", "cols": 4, "rows": 3,
 *     "regions": [ { "label": "…", "col": 1, "row": 1, "w": 4, "h": 1, "tone": "…", "note": "…" } ],
 *     "caption": "…" }
 * `col` and `row` are 1-based grid lines; `w` and `h` (default 1) are spans.
 * `cols`/`rows` default to the extent the regions need. Out-of-range values
 * clamp into the grid, so a bad number never breaks the page.
 */
export function prepareLayout(data = {}) {
  const raw = Array.isArray(data.regions) ? data.regions : [];
  const regs = raw.map((r) => (typeof r === 'object' && r ? r : { label: r }));
  const need = (pos, span, cap) => Math.max(1, ...regs.map((r) => clampInt(r[pos], 1, cap, 1) + clampInt(r[span], 1, cap, 1) - 1));
  const cols = clampInt(data.cols, 1, 24, Math.min(24, need('col', 'w', 24)));
  const rows = clampInt(data.rows, 1, 48, Math.min(48, need('row', 'h', 48)));
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    aria: title || 'Layout',
    cols,
    rows,
    regions: regs.map((r) => {
      const col = clampInt(r.col, 1, cols, 1);
      const row = clampInt(r.row, 1, rows, 1);
      const w = clampInt(r.w, 1, cols - col + 1, 1);
      const h = clampInt(r.h, 1, rows - row + 1, 1);
      return {
        label: str(r.label),
        area: `${row} / ${col} / span ${h} / span ${w}`,
        stroke: tone(r.tone),
        bg: toneBg(r.tone),
        note_list: opt(r.note),
      };
    }),
    caption_list: opt(data.caption),
  };
}

/* ─────────────────────────────── trend ─────────────────────────────── */

// Series without a tone take the next colour here; each also takes a dash
// pattern, so two lines differ by more than colour alone.
const SERIES_TONES = ['accent', 'ok', 'warn', 'risk', 'bad', 'muted'];
const SERIES_DASH = ['none', '7 4', '2 3'];
const SERIES_BORDER = ['solid', 'dashed', 'dotted'];

/** A round step (1, 2, 2.5, 5 × 10^k) that splits `span` into about `count` parts. */
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * mag;
}

/** A number as short text without float noise (0.30000000000000004 → 0.3). */
function numText(v) {
  return String(Math.round(v * 1e6) / 1e6);
}

function numOrNull(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * explainer/trend
 *   { "title": "…", "unit": "ms", "x": ["Mon", "Tue", …],
 *     "series": [ { "label": "p95", "values": [120, 110, …], "tone": "…" } ],
 *     "min": 0, "max": 200 }
 * A line chart. `min`/`max` are optional; by default the y-axis spans the data,
 * rounded out to a tick. A missing or non-number value leaves a gap in its
 * line. Two or more series get a legend and a dash pattern each.
 */
export function prepareTrend(data = {}) {
  const xs = (Array.isArray(data.x) ? data.x : []).map(str);
  const rawSeries = (Array.isArray(data.series) ? data.series : [])
    .map((s) => (typeof s === 'object' && s ? s : {}));
  const n = Math.max(xs.length, 0, ...rawSeries.map((s) => (Array.isArray(s.values) ? s.values.length : 0)));
  const labels = Array.from({ length: n }, (_, i) => xs[i] ?? String(i + 1));
  const unit = str(data.unit);
  const series = rawSeries.map((s, si) => ({
    label: str(s.label ?? `Series ${si + 1}`),
    values: Array.from({ length: n }, (_, i) => numOrNull(Array.isArray(s.values) ? s.values[i] : null)),
    tone: s.tone ?? SERIES_TONES[si % SERIES_TONES.length],
  }));

  // y range: explicit min/max win; otherwise the data, rounded out to a tick.
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const autoLo = numOrNull(data.min) == null;
  const autoHi = numOrNull(data.max) == null;
  let lo = autoLo ? (all.length ? Math.min(...all) : 0) : numOrNull(data.min);
  let hi = autoHi ? (all.length ? Math.max(...all) : 1) : numOrNull(data.max);
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) {
    const padV = Math.abs(hi) * 0.1 || 1;
    if (autoLo) lo -= padV;
    if (autoHi) hi += padV;
    if (hi === lo) hi = lo + 1;
  }
  const step = niceStep(hi - lo, 4);
  if (autoLo) lo = Math.floor(lo / step + 1e-9) * step;
  if (autoHi) hi = Math.ceil(hi / step - 1e-9) * step;

  // A compact viewBox keeps the text legible when the chart scales down to a
  // phone column (the snippet also sets a 300px min-width with side scroll).
  const W = 460;
  const H = 260;
  const padL = 50;
  const padR = 24;
  const padT = 28;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  // Points sit 18px in from each end, so a first or last value label never
  // meets the y-axis tick labels.
  const inset = 18;
  const xAt = (i) => round1(padL + (n <= 1 ? plotW / 2 : inset + (i * (plotW - 2 * inset)) / (n - 1)));
  const yAt = (v) => round1(padT + plotH - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotH);

  const ticks = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) {
    const v = k * step;
    ticks.push({ y: yAt(v), ty: round1(yAt(v) + 4), x: padL - 8, text: numText(v) });
  }
  const every = Math.max(1, Math.ceil(n / 10));
  const xTicks = labels.map((t, i) => ({ t, i }))
    .filter(({ i }) => i % every === 0)
    .map(({ t, i }) => ({ x: xAt(i), y: padT + plotH + 18, t }));

  const totalPoints = series.reduce((acc, s) => acc + s.values.filter((v) => v != null).length, 0);
  const labelAll = totalPoints <= 24;
  const unitSuffix = unit ? ` ${unit}` : '';
  const outSeries = series.map((s, si) => {
    const color = tone(s.tone);
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${d ? ' ' : ''}${pen ? 'L' : 'M'} ${xAt(i)} ${yAt(v)}`;
      pen = true;
    });
    const present = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
    const lastI = present.length ? present[present.length - 1].i : -1;
    const dash = SERIES_DASH[si % SERIES_DASH.length];
    const points = present.map(({ v, i }) => ({
      cx: xAt(i),
      cy: yAt(v),
      color,
      tip: `${s.label}: ${labels[i]} = ${numText(v)}${unitSuffix}`,
      label_list: labelAll || i === lastI
        ? [{ x: xAt(i), y: round1(yAt(v) - 9), t: numText(v) }]
        : [],
    }));
    return {
      label: s.label,
      color,
      dash,
      border: SERIES_BORDER[si % SERIES_BORDER.length],
      d_list: d ? [{ d, color, dash }] : [],
      points,
    };
  });
  const desc = series.map((s) => {
    const present = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
    if (!present.length) return `${s.label}: no data`;
    const a = present[0];
    const b = present[present.length - 1];
    return `${s.label}: ${numText(a.v)}${unitSuffix} at ${labels[a.i]} to ${numText(b.v)}${unitSuffix} at ${labels[b.i]}`;
  }).join('; ');
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    svg_title: title || 'Trend chart',
    desc: desc || 'No data',
    id: `xpl-trd-${hashId(data)}`,
    width: W,
    height: H,
    axis_x0: padL,
    axis_x1: padL + plotW,
    axis_y0: padT,
    axis_y1: padT + plotH,
    unit_list: unit ? [{ x: padL, y: padT - 12, t: unit }] : [],
    ticks,
    x_ticks: xTicks,
    series: outSeries,
    legend_list: outSeries.length >= 2 ? [{ items: outSeries }] : [],
  };
}

/* ─────────────────────────────── states ─────────────────────────────── */

/**
 * explainer/states
 *   { "title": "…",
 *     "states": [ { "id": "draft", "label": "Draft", "tone": "…", "note": "…" } ],
 *     "transitions": [ { "from": "draft", "to": "review", "label": "submit" } ] }
 * A transition may also be a pair: ["draft", "review"]. Columns follow the
 * longest path from the first state (the dependency layout); a transition that
 * goes back left curves below the states, and a transition from a state to
 * itself loops above it.
 */
export function prepareStates(data = {}) {
  const raw = Array.isArray(data.states) ? data.states : [];
  const states = raw.map((s) => (typeof s === 'object' && s ? s : { id: s, label: s }))
    .map((s) => ({ ...s, id: str(s.id ?? s.label), label: str(s.label ?? s.id) }));
  const ids = new Set(states.map((s) => s.id));
  const all = (Array.isArray(data.transitions) ? data.transitions : [])
    .map((e) => (Array.isArray(e) ? { from: e[0], to: e[1], label: e[2] } : e))
    .filter((e) => e && ids.has(str(e.from)) && ids.has(str(e.to)))
    .map((e) => ({ from: str(e.from), to: str(e.to), label: str(e.label) }));
  const moves = all.filter((e) => e.from !== e.to);
  const selfs = all.filter((e) => e.from === e.to);
  const { columns, back } = layerColumns(states, moves);

  const nodeW = 116;
  const nodeH = 44;
  const gapX = 76;
  const gapY = 50;
  const pad = 20;
  const padTop = selfs.length ? 46 : pad;
  const rows = Math.max(1, ...columns.map((c) => c?.length ?? 0));
  const cols = Math.max(1, columns.length);
  const pos = new Map();
  columns.forEach((col, ci) => (col ?? []).forEach((id, ri) => {
    pos.set(id, { x: pad + ci * (nodeW + gapX), y: padTop + ri * (nodeH + gapY) });
  }));
  const isBack = (e) => back.has(`${e.from}->${e.to}`) || pos.get(e.to).x <= pos.get(e.from).x;
  const backMoves = moves.filter(isBack);
  const nodesBottom = padTop + rows * nodeH + (rows - 1) * gapY;
  const W = pad * 2 + cols * nodeW + (cols - 1) * gapX;
  const H = nodesBottom + pad + (backMoves.length ? 18 * backMoves.length + 8 : 0);

  const outNodes = states.map((s, i) => {
    const p = pos.get(s.id);
    return {
      label: s.label,
      rx: p.x,
      ry: p.y,
      w: nodeW,
      h: nodeH,
      stroke: tone(s.tone),
      bg: toneBg(s.tone),
      width_px: i === 0 ? 2.6 : 1.6,
      lines: labelLines(s.label, p.x + nodeW / 2, p.y + nodeH / 2, 15),
      note_list: s.note ? [{ label: s.label, text: str(s.note) }] : [],
    };
  });

  let backIndex = 0;
  const edges = moves.map((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    let d;
    let lx;
    let ly;
    if (!isBack(e)) {
      const x0 = a.x + nodeW;
      const y0 = a.y + nodeH / 2;
      const x1 = b.x - 4;
      const y1 = b.y + nodeH / 2;
      const mx = round1((x0 + x1) / 2);
      d = `M ${x0} ${y0} C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
      lx = mx;
      ly = round1((y0 + y1) / 2 - 7);
    } else {
      const low = nodesBottom + 18 + 18 * backIndex++;
      const x0 = a.x + nodeW / 2 + 10;
      const y0 = a.y + nodeH;
      const x1 = b.x + nodeW / 2 - 10;
      const y1 = b.y + nodeH + 4;
      d = `M ${x0} ${y0} C ${x0} ${low} ${x1} ${low} ${x1} ${y1}`;
      lx = round1((x0 + x1) / 2);
      ly = round1(low - 2);
    }
    return { d, label_list: e.label ? [{ t: e.label, x: lx, y: ly }] : [] };
  });
  for (const e of selfs) {
    const p = pos.get(e.from);
    const cx = p.x + nodeW / 2;
    edges.push({
      d: `M ${cx - 16} ${p.y} C ${cx - 30} ${p.y - 36} ${cx + 30} ${p.y - 36} ${cx + 16} ${p.y - 4}`,
      label_list: e.label ? [{ t: e.label, x: cx, y: p.y - 32 }] : [],
    });
  }
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    svg_title: title || 'State machine',
    desc: moves.concat(selfs).map((e) => {
      const lab = (id) => states.find((s) => s.id === id)?.label ?? id;
      return `${lab(e.from)} to ${lab(e.to)}${e.label ? ` on ${e.label}` : ''}`;
    }).join('; ') || 'No transitions',
    id: `xpl-sta-${hashId(data)}`,
    width: W,
    height: H,
    nodes: outNodes,
    edges,
  };
}

/* ─────────────────────────────── steps ─────────────────────────────── */

/**
 * explainer/steps
 *   { "title": "…", "steps": [ { "label": "…", "text": "…", "tone": "…" } ] }
 * A step-through: the view's explainer.js runtime shows one step at a time
 * with Previous/Next buttons; without the runtime every step shows as a
 * numbered list.
 */
export function prepareSteps(data = {}) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    aria: title || 'Steps',
    steps: steps.map((s, i) => {
      const o = typeof s === 'object' && s ? s : { label: s };
      return {
        n: i + 1,
        label: str(o.label),
        color: tone(o.tone),
        text_list: opt(o.text),
      };
    }),
  };
}
