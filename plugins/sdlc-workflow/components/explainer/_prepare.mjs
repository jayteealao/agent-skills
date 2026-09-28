// components/explainer/_prepare.mjs — data preparers for the explainer snippets.
//
// The four explainer snippets (sequence, comparison, cycle, dependency) are
// logic-free templates. Each preparer here turns the author's JSON payload into
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

  // Longest-path layering over the forward edges (edges that follow the input
  // order of a DFS); back-edges are drawn but do not move a node.
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
