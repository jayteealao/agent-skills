import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// components/_components.mjs
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// components/explainer/_prepare.mjs
var TONES = {
  accent: "var(--accent)",
  ok: "var(--low)",
  good: "var(--low)",
  warn: "var(--med)",
  bad: "var(--high)",
  risk: "var(--blocker)",
  muted: "var(--ink-3)"
};
function tone(t) {
  return TONES[String(t ?? "").toLowerCase()] ?? TONES.accent;
}
var TONE_BGS = {
  accent: "var(--accent-soft)",
  ok: "var(--low-bg)",
  good: "var(--low-bg)",
  warn: "var(--med-bg)",
  bad: "var(--high-bg)",
  risk: "var(--blocker-bg)",
  muted: "var(--paper-2)"
};
function toneBg(t) {
  return TONE_BGS[String(t ?? "").toLowerCase()] ?? TONE_BGS.accent;
}
function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function str(v) {
  return v == null ? "" : String(v);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function hashId(value) {
  const text = JSON.stringify(value ?? null);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
function opt(v) {
  return v == null || v === "" ? [] : [v];
}
function wrapLabel(label, width = 16, maxLines = 2) {
  const words = str(label).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, width - 1)}\u2026`;
    return kept;
  }
  return lines.length ? lines : [""];
}
function labelLines(label, x, y, width) {
  const lines = wrapLabel(label, width);
  const lineH = 14;
  const first = y - (lines.length - 1) * lineH / 2 + 4;
  return lines.map((t, i) => ({ t, x: round1(x), y: round1(first + i * lineH) }));
}
function prepareSequence(data = {}) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  return {
    title: str(data.title),
    title_list: opt(data.title),
    steps: steps.map((s, i) => {
      const o = typeof s === "object" && s ? s : { label: s };
      return {
        n: i + 1,
        label: str(o.label),
        text_list: opt(o.text),
        lane_list: opt(o.lane)
      };
    })
  };
}
function prepareComparison(data = {}) {
  const bars = Array.isArray(data.bars) ? data.bars : [];
  const values = bars.map((b) => Number(b?.value) || 0);
  const max = Number(data.max) > 0 ? Number(data.max) : Math.max(0, ...values);
  const unit = str(data.unit);
  return {
    title: str(data.title),
    title_list: opt(data.title),
    bars: bars.map((b, i) => {
      const v = values[i];
      const pct = max > 0 ? Math.max(0, Math.min(100, round1(v / max * 100))) : 0;
      return {
        label: str(b?.label),
        pct,
        color: tone(b?.tone),
        value_text: `${str(b?.value ?? v)}${unit ? ` ${unit}` : ""}`,
        note_list: opt(b?.note)
      };
    })
  };
}
function prepareCycle(data = {}) {
  const raw = Array.isArray(data.states) ? data.states : [];
  const states = raw.map((s) => typeof s === "object" && s ? s : { label: s });
  const n = states.length;
  const R = Math.max(90, n * 26);
  const nodeW = 120;
  const nodeH = 40;
  const W = 2 * R + nodeW + 40;
  const H = 2 * R + nodeH + 40;
  const cx = W / 2;
  const cy = H / 2;
  const angle = (i) => -Math.PI / 2 + 2 * Math.PI * i / Math.max(n, 1);
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
      note_list: s.note ? [{ n: i + 1, label: str(s.label), text: str(s.note) }] : []
    };
  });
  const trim = Math.min(2 * Math.PI / Math.max(n, 1) * 0.3, 70 / R);
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
    arcs
  };
}
function layerColumns(nodes, edges) {
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from).push(e.to);
  const state = /* @__PURE__ */ new Map();
  const back = /* @__PURE__ */ new Set();
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
      if (layer.get(e.to) < want) {
        layer.set(e.to, want);
        changed = true;
      }
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
function prepareDependency(data = {}) {
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const nodes = rawNodes.map((n) => typeof n === "object" && n ? n : { id: n, label: n }).map((n) => ({ ...n, id: str(n.id ?? n.label), label: str(n.label ?? n.id) }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(data.edges) ? data.edges : []).map((e) => Array.isArray(e) ? { from: e[0], to: e[1] } : e).filter((e) => e && ids.has(str(e.from)) && ids.has(str(e.to)) && str(e.from) !== str(e.to)).map((e) => ({ from: str(e.from), to: str(e.to), label: str(e.label) }));
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
  const pos = /* @__PURE__ */ new Map();
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
      note_list: n.note ? [{ label: n.label, text: str(n.note) }] : []
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
    return { d, label_list: e.label ? [{ t: e.label, x: lx, y: ly }] : [], dash: isBack ? "5 4" : "none" };
  });
  return {
    title: str(data.title),
    title_list: opt(data.title),
    id: `xpl-dep-${hashId(data)}`,
    width: W,
    height: H,
    nodes: outNodes,
    edges: outEdges
  };
}
function prepareLayout(data = {}) {
  const raw = Array.isArray(data.regions) ? data.regions : [];
  const regs = raw.map((r) => typeof r === "object" && r ? r : { label: r });
  const need = (pos, span, cap) => Math.max(1, ...regs.map((r) => clampInt(r[pos], 1, cap, 1) + clampInt(r[span], 1, cap, 1) - 1));
  const cols = clampInt(data.cols, 1, 24, Math.min(24, need("col", "w", 24)));
  const rows = clampInt(data.rows, 1, 48, Math.min(48, need("row", "h", 48)));
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    aria: title || "Layout",
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
        note_list: opt(r.note)
      };
    }),
    caption_list: opt(data.caption)
  };
}
var SERIES_TONES = ["accent", "ok", "warn", "risk", "bad", "muted"];
var SERIES_DASH = ["none", "7 4", "2 3"];
var SERIES_BORDER = ["solid", "dashed", "dotted"];
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * mag;
}
function numText(v) {
  return String(Math.round(v * 1e6) / 1e6);
}
function numOrNull(v) {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function prepareTrend(data = {}) {
  const xs = (Array.isArray(data.x) ? data.x : []).map(str);
  const rawSeries = (Array.isArray(data.series) ? data.series : []).map((s) => typeof s === "object" && s ? s : {});
  const n = Math.max(xs.length, 0, ...rawSeries.map((s) => Array.isArray(s.values) ? s.values.length : 0));
  const labels = Array.from({ length: n }, (_, i) => xs[i] ?? String(i + 1));
  const unit = str(data.unit);
  const series = rawSeries.map((s, si) => ({
    label: str(s.label ?? `Series ${si + 1}`),
    values: Array.from({ length: n }, (_, i) => numOrNull(Array.isArray(s.values) ? s.values[i] : null)),
    tone: s.tone ?? SERIES_TONES[si % SERIES_TONES.length]
  }));
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const autoLo = numOrNull(data.min) == null;
  const autoHi = numOrNull(data.max) == null;
  let lo = autoLo ? all.length ? Math.min(...all) : 0 : numOrNull(data.min);
  let hi = autoHi ? all.length ? Math.max(...all) : 1 : numOrNull(data.max);
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
  const W = 460;
  const H = 260;
  const padL = 50;
  const padR = 24;
  const padT = 28;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const inset = 18;
  const xAt = (i) => round1(padL + (n <= 1 ? plotW / 2 : inset + i * (plotW - 2 * inset) / (n - 1)));
  const yAt = (v) => round1(padT + plotH - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * plotH);
  const ticks = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) {
    const v = k * step;
    ticks.push({ y: yAt(v), ty: round1(yAt(v) + 4), x: padL - 8, text: numText(v) });
  }
  const every = Math.max(1, Math.ceil(n / 10));
  const xTicks = labels.map((t, i) => ({ t, i })).filter(({ i }) => i % every === 0).map(({ t, i }) => ({ x: xAt(i), y: padT + plotH + 18, t }));
  const totalPoints = series.reduce((acc, s) => acc + s.values.filter((v) => v != null).length, 0);
  const labelAll = totalPoints <= 24;
  const unitSuffix = unit ? ` ${unit}` : "";
  const outSeries = series.map((s, si) => {
    const color = tone(s.tone);
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${d ? " " : ""}${pen ? "L" : "M"} ${xAt(i)} ${yAt(v)}`;
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
      label_list: labelAll || i === lastI ? [{ x: xAt(i), y: round1(yAt(v) - 9), t: numText(v) }] : []
    }));
    return {
      label: s.label,
      color,
      dash,
      border: SERIES_BORDER[si % SERIES_BORDER.length],
      d_list: d ? [{ d, color, dash }] : [],
      points
    };
  });
  const desc = series.map((s) => {
    const present = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
    if (!present.length) return `${s.label}: no data`;
    const a = present[0];
    const b = present[present.length - 1];
    return `${s.label}: ${numText(a.v)}${unitSuffix} at ${labels[a.i]} to ${numText(b.v)}${unitSuffix} at ${labels[b.i]}`;
  }).join("; ");
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    svg_title: title || "Trend chart",
    desc: desc || "No data",
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
    legend_list: outSeries.length >= 2 ? [{ items: outSeries }] : []
  };
}
function prepareStates(data = {}) {
  const raw = Array.isArray(data.states) ? data.states : [];
  const states = raw.map((s) => typeof s === "object" && s ? s : { id: s, label: s }).map((s) => ({ ...s, id: str(s.id ?? s.label), label: str(s.label ?? s.id) }));
  const ids = new Set(states.map((s) => s.id));
  const all = (Array.isArray(data.transitions) ? data.transitions : []).map((e) => Array.isArray(e) ? { from: e[0], to: e[1], label: e[2] } : e).filter((e) => e && ids.has(str(e.from)) && ids.has(str(e.to))).map((e) => ({ from: str(e.from), to: str(e.to), label: str(e.label) }));
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
  const pos = /* @__PURE__ */ new Map();
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
      note_list: s.note ? [{ label: s.label, text: str(s.note) }] : []
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
      label_list: e.label ? [{ t: e.label, x: cx, y: p.y - 32 }] : []
    });
  }
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    svg_title: title || "State machine",
    desc: moves.concat(selfs).map((e) => {
      const lab = (id) => states.find((s) => s.id === id)?.label ?? id;
      return `${lab(e.from)} to ${lab(e.to)}${e.label ? ` on ${e.label}` : ""}`;
    }).join("; ") || "No transitions",
    id: `xpl-sta-${hashId(data)}`,
    width: W,
    height: H,
    nodes: outNodes,
    edges
  };
}
function prepareSteps(data = {}) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const title = str(data.title);
  return {
    title,
    title_list: opt(data.title),
    aria: title || "Steps",
    steps: steps.map((s, i) => {
      const o = typeof s === "object" && s ? s : { label: s };
      return {
        n: i + 1,
        label: str(o.label),
        color: tone(o.tone),
        text_list: opt(o.text)
      };
    })
  };
}

// components/_components.mjs
var INCLUDE_RE = /<!--\s*@include\s+([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)\s+([\s\S]*?)\s*-->/g;
var PREPARERS = {
  "explainer/sequence": prepareSequence,
  "explainer/comparison": prepareComparison,
  "explainer/cycle": prepareCycle,
  "explainer/dependency": prepareDependency,
  "explainer/layout": prepareLayout,
  "explainer/trend": prepareTrend,
  "explainer/states": prepareStates,
  "explainer/steps": prepareSteps
};
function stripDocComments(text) {
  return text.replace(/\{\{!--[\s\S]*?--\}\}\s*/g, "");
}
var snippetCache = /* @__PURE__ */ new Map();
function loadSnippet(componentsRoot, name) {
  const cacheKey = `${componentsRoot}::${name}`;
  if (snippetCache.has(cacheKey)) return snippetCache.get(cacheKey);
  const path = join(componentsRoot, `${name}.html.snippet`);
  if (!existsSync(path)) {
    throw new Error(`@include: snippet not found: ${name}.html.snippet`);
  }
  const text = readFileSync(path, "utf-8");
  snippetCache.set(cacheKey, text);
  return text;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderSnippet(body, data) {
  let out = "";
  let i = 0;
  const eachOpenRe = /\{\{#each\s+([a-z0-9_.-]+)\s*\}\}/g;
  const blockRe = /\{\{(#each\s+[a-z0-9_.-]+\s*|\/each)\}\}/g;
  while (i < body.length) {
    eachOpenRe.lastIndex = i;
    const open = eachOpenRe.exec(body);
    if (!open) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, open.index);
    const innerStart = open.index + open[0].length;
    blockRe.lastIndex = innerStart;
    let depth = 1, innerEnd = -1, blockEnd = -1;
    let m;
    while ((m = blockRe.exec(body)) !== null) {
      if (m[1].startsWith("#each")) depth++;
      else {
        depth--;
        if (depth === 0) {
          innerEnd = m.index;
          blockEnd = blockRe.lastIndex;
          break;
        }
      }
    }
    if (innerEnd < 0) throw new Error("unbalanced {{#each}} \u2026 {{/each}} in snippet");
    const inner = body.slice(innerStart, innerEnd);
    const list = resolvePath(data, open[1]);
    if (Array.isArray(list)) {
      for (const item of list) {
        out += renderSnippet(inner, { ...data, this: item });
      }
    }
    i = blockEnd;
  }
  out = out.replace(/\{\{\{([a-z0-9_.-]+)\}\}\}/g, (_, key) => {
    const v = resolvePath(data, key);
    return v == null ? "" : String(v);
  });
  out = out.replace(/\{\{([a-z0-9_.-]+)\}\}/g, (_, key) => {
    const v = resolvePath(data, key);
    return v == null ? "" : escapeHtml(v);
  });
  return out;
}
function resolvePath(obj, dotted) {
  if (!obj) return void 0;
  return dotted.split(".").reduce((acc, k) => acc == null ? void 0 : acc[k], obj);
}
function expand(html, ctx) {
  if (!html || typeof html !== "string") return html ?? "";
  const componentsRoot = ctx?.componentsRoot;
  if (!componentsRoot) throw new Error("expand: ctx.componentsRoot required");
  const maxDepth = ctx?.maxDepth ?? 4;
  let current = html;
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (!INCLUDE_RE.test(current)) return current;
    INCLUDE_RE.lastIndex = 0;
    if (depth === maxDepth) {
      throw new Error(`@include: expansion exceeded maxDepth=${maxDepth} (possible cycle)`);
    }
    current = current.replace(INCLUDE_RE, (match, name, payloadRaw) => {
      let data;
      try {
        data = payloadRaw.trim() ? JSON.parse(payloadRaw.trim()) : {};
      } catch (err) {
        throw new Error(`@include ${name}: invalid JSON payload \u2014 ${err.message}`);
      }
      const snippet = loadSnippet(componentsRoot, name);
      if (PREPARERS[name]) {
        return renderSnippet(stripDocComments(snippet), PREPARERS[name](data)).trim();
      }
      return renderSnippet(stripDocComments(snippet), data);
    });
  }
  return current;
}

export {
  expand
};
