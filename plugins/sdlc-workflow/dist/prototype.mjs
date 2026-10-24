#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  DOC_FILE,
  LEDGER_FILE,
  MAX_COMMIT_FILE_BYTES,
  REPORT_FILE,
  SCRATCH_DIR,
  branchFor,
  buildReport,
  commitPlan,
  ledgerProblems,
  mediaKind,
  newLedger,
  openProofs,
  reportProblems
} from "./chunk-CI2GKFZ3.mjs";
import {
  validatePrototypeLedger
} from "./chunk-LJCAG37B.mjs";
import {
  safeParseFrontmatter
} from "./chunk-R35WUHOB.mjs";
import "./chunk-DS4JUPRY.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/prototype.mjs
import { spawnSync } from "node:child_process";
import { existsSync as existsSync2, lstatSync, mkdirSync, readdirSync, readFileSync as readFileSync2, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join as join2, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// scripts/prototype.mjs
var USAGE = "Usage: prototype.mjs <start|status|check|report|decide|exit|cleanup> <projectRoot> <slug> ...";
var PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
var toPosix = (p) => p.split("\\").join("/");
var wfRel = (slug) => `.ai/workflows/${slug}`;
function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || i >= 19) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}
function git(cwd, args) {
  const r = spawnSync("git", ["-c", "core.longpaths=true", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
var gitOk = (cwd, args, what) => {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`${what}: git ${args.join(" ")} failed: ${r.err || r.out}`);
  return r.out;
};
var samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
function mainCheckout(dir) {
  const list = worktrees(dir);
  return list[0]?.path ?? dir;
}
function worktrees(dir) {
  const r = git(dir, ["worktree", "list", "--porcelain"]);
  if (!r.ok) return [];
  const out = [];
  let cur = null;
  for (const line of r.out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: resolve(line.slice(9)), branch: null };
      out.push(cur);
    } else if (line.startsWith("branch ") && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
  }
  return out;
}
function locate(root, slug) {
  const ledgerIn = (dir) => existsSync2(join2(dir, wfRel(slug), LEDGER_FILE));
  if (ledgerIn(root)) return root;
  const list = worktrees(root);
  const branch = indexRow(mainCheckout(root), slug)?.branch || branchFor(slug);
  const byBranch = list.find((w) => w.branch === branch && ledgerIn(w.path));
  if (byBranch) return byBranch.path;
  const any = list.find((w) => ledgerIn(w.path));
  return any?.path ?? null;
}
function needWorktree(root, slug) {
  const wt = locate(root, slug);
  if (!wt) throw new Error(`no prototype ${slug}: start one with /wf loop prototype <idea>`);
  return wt;
}
var ledgerPath = (wt, slug) => join2(wt, wfRel(slug), LEDGER_FILE);
function readLedger(wt, slug) {
  const p = ledgerPath(wt, slug);
  try {
    return JSON.parse(readFileSync2(p, "utf8"));
  } catch (e) {
    throw new Error(`${LEDGER_FILE} does not parse: ${e.message}`);
  }
}
var saveLedger = (wt, slug, ledger) => writeAtomic(ledgerPath(wt, slug), `${JSON.stringify(ledger, null, 2)}
`);
var INDEX_HEADER = "# .ai/workflows/INDEX.md \u2014 global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.";
function indexRow(main2, slug) {
  const p = join2(main2, ".ai", "workflows", "INDEX.md");
  if (!existsSync2(p)) return null;
  for (const line of readFileSync2(p, "utf8").split(/\r?\n/)) {
    const cols = line.split("	");
    if (cols[0] === slug) return { slug, status: cols[1], type: cols[2], branch: cols[3], updatedAt: cols[4] };
  }
  return null;
}
function upsertIndexRow(main2, { slug, status: status2, branch, at }) {
  const p = join2(main2, ".ai", "workflows", "INDEX.md");
  const lines = existsSync2(p) ? readFileSync2(p, "utf8").split(/\r?\n/).filter((l) => l.length) : [INDEX_HEADER];
  const header = lines.filter((l) => l.startsWith("#"));
  const rows = lines.filter((l) => !l.startsWith("#") && l.split("	")[0] !== slug);
  rows.push([slug, status2, "prototype", branch, at].join("	"));
  rows.sort((a, b) => a.split("	")[0].localeCompare(b.split("	")[0]));
  writeAtomic(p, `${[...header.length ? header : [INDEX_HEADER], ...rows].join("\n")}
`);
}
function indexFile({ slug, idea, branch, baseBranch, worktree, status: status2, at, next }) {
  return [
    "---",
    "schema: sdlc/v1",
    "type: workflow-index",
    `slug: ${slug}`,
    `title: ${JSON.stringify(`Prototype: ${idea}`)}`,
    "workflow-type: prototype",
    "current-stage: prototype",
    `status: ${status2}`,
    "branch-strategy: dedicated",
    `branch: ${branch}`,
    `base-branch: ${baseBranch ?? "null"}`,
    `worktree: ${JSON.stringify(toPosix(worktree))}`,
    "open-questions: []",
    "next-command: wf-prototype",
    `next-invocation: ${JSON.stringify(next)}`,
    "progress:",
    `  prototype: ${status2 === "open" ? "in-progress" : status2}`,
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    "---",
    "",
    `# Prototype: ${idea}`,
    "",
    `The person steers this prototype one round at a time. The proof ledger is \`${LEDGER_FILE}\`; the accepted pipeline is \`${DOC_FILE}\`; the rolling report is \`${REPORT_FILE}\`.`,
    ""
  ].join("\n");
}
function docFile({ slug, idea, at }) {
  return [
    "---",
    "schema: sdlc/v1",
    "type: prototype",
    `slug: ${slug}`,
    `idea: ${JSON.stringify(idea)}`,
    "status: open",
    `ledger: ${LEDGER_FILE}`,
    `report: ${REPORT_FILE}`,
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    "---",
    "",
    `# ${idea}`,
    "",
    "## The accepted pipeline",
    "",
    "No component is accepted yet.",
    "",
    "## Known limits",
    "",
    "None recorded yet.",
    ""
  ].join("\n");
}
function setIndexStatus(wt, slug, status2, next) {
  const p = join2(wt, wfRel(slug), "00-index.md");
  if (!existsSync2(p)) return;
  let text = readFileSync2(p, "utf8");
  const at = nowIso();
  text = text.replace(/^status: .*$/m, `status: ${status2}`).replace(/^ {2}prototype: .*$/m, `  prototype: ${status2 === "open" ? "in-progress" : status2}`).replace(/^updated-at: .*$/m, `updated-at: "${at}"`);
  if (next) text = text.replace(/^next-invocation: .*$/m, `next-invocation: ${JSON.stringify(next)}`);
  writeAtomic(p, text);
}
function start(root, slug, f) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`slug ${slug}: use lower-case words joined by dashes`);
  const idea = String(f.idea ?? "").trim();
  if (!idea || idea === "true") throw new Error(`start needs --idea "<the open question, in the person's words>"`);
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new Error("not a git repository: a prototype runs in a worktree on its own branch");
  const main2 = mainCheckout(resolve(top.out));
  if (existsSync2(join2(main2, wfRel(slug), "00-index.md"))) throw new Error(`.ai/workflows/${slug} exists in the main checkout: pick another slug`);
  const existing = locate(main2, slug);
  if (existing) return { ok: true, resumed: true, slug, worktree: existing, ...summary(existing, slug) };
  const branch = String(f.branch && f.branch !== true ? f.branch : branchFor(slug));
  const baseBranch = f.base && f.base !== true ? String(f.base) : git(main2, ["rev-parse", "--abbrev-ref", "HEAD"]).out || null;
  const wt = f.worktree && f.worktree !== true ? resolve(main2, String(f.worktree)) : join2(dirname(main2), `${basename(main2)}.poc`, slug);
  if (existsSync2(wt)) throw new Error(`the worktree path ${wt} exists: name another with --worktree`);
  const local = git(main2, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok;
  const remote = !local && git(main2, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).ok;
  mkdirSync(dirname(wt), { recursive: true });
  if (local) gitOk(main2, ["worktree", "add", "-q", wt, branch], "worktree add");
  else if (remote) gitOk(main2, ["worktree", "add", "-q", "-b", branch, wt, `origin/${branch}`], "worktree add");
  else gitOk(main2, ["worktree", "add", "-q", "-b", branch, wt, baseBranch || "HEAD"], "worktree add");
  const at = nowIso();
  const dir = join2(wt, wfRel(slug));
  mkdirSync(dir, { recursive: true });
  mkdirSync(join2(wt, SCRATCH_DIR), { recursive: true });
  if (!existsSync2(join2(wt, ".scratch", ".gitignore"))) writeFileSync(join2(wt, ".scratch", ".gitignore"), "*\n");
  const next = `/wf loop prototype ${slug} <request>`;
  if (!existsSync2(join2(dir, "00-index.md"))) writeFileSync(join2(dir, "00-index.md"), indexFile({ slug, idea, branch, baseBranch, worktree: wt, status: "open", at, next }));
  if (!existsSync2(ledgerPath(wt, slug))) saveLedger(wt, slug, newLedger({ slug, idea, branch, baseBranch, worktree: toPosix(wt), at }));
  if (!existsSync2(join2(dir, DOC_FILE))) writeFileSync(join2(dir, DOC_FILE), docFile({ slug, idea, at }));
  upsertIndexRow(main2, { slug, status: "open", branch, at });
  return { ok: true, resumed: false, slug, branch, reusedBranch: local || remote, baseBranch, worktree: wt, workflowDir: dir, scratch: join2(wt, SCRATCH_DIR), next };
}
function problemsOf(wt, slug, ledger) {
  const schema = validatePrototypeLedger(ledger);
  const problems = schema.valid ? [] : schema.errors.map((e) => `${e.path || "/"}: ${e.message}`);
  problems.push(...ledgerProblems(ledger));
  for (const p of ledger.proofs ?? []) {
    for (const file of [...p.files ?? [], ...p.media ?? []]) {
      if (!existsSync2(join2(wt, file))) problems.push(`proof ${p.id}: file ${file} does not exist in the worktree`);
    }
  }
  return problems;
}
function summary(wt, slug) {
  const ledger = readLedger(wt, slug);
  const rounds = ledger.rounds ?? [];
  const reportAbs = join2(wt, wfRel(slug), REPORT_FILE);
  const tracked = new Set(git(wt, ["ls-files", "--", wfRel(slug)]).out.split(/\r?\n/).filter(Boolean));
  const recorded = [.../* @__PURE__ */ new Set([...(ledger.proofs ?? []).flatMap((p) => p.files ?? []), ...rounds.flatMap((r) => r.files ?? [])])];
  return {
    status: ledger.status,
    branch: ledger.branch,
    rounds: rounds.length,
    lastRound: rounds[rounds.length - 1] ?? null,
    pipeline: ledger.pipeline ?? [],
    decisions: (ledger.decisions ?? []).map((d) => ({ id: d.id, component: d.component, generalized: d.generalized === true, commit: d.commit ?? null })),
    openProofs: openProofs(ledger).map((p) => ({ id: p.id, question: p.question, verdict: p.verdict })),
    report: { file: reportAbs, exists: existsSync2(reportAbs), url: ledger.report?.url ?? null },
    uncommitted: recorded.filter((p) => !git(wt, ["ls-files", "--error-unmatch", "--", p]).ok).slice(0, 50),
    recordsTracked: tracked.size > 0,
    problems: problemsOf(wt, slug, ledger)
  };
}
function status(root, slug) {
  const wt = needWorktree(root, slug);
  return { ok: true, slug, worktree: wt, ...summary(wt, slug) };
}
function check(root, slug) {
  const wt = needWorktree(root, slug);
  const problems = problemsOf(wt, slug, readLedger(wt, slug));
  return { ok: problems.length === 0, slug, worktree: wt, problems };
}
function mediaReader(wt) {
  return (p) => {
    const abs = join2(wt, p);
    if (!existsSync2(abs)) return { exists: false };
    const kind = mediaKind(p);
    if (kind.kind !== "image") return { exists: true };
    const buf = readFileSync2(abs);
    return { exists: true, bytes: buf.length, dataUri: `data:${kind.mime};base64,${buf.toString("base64")}` };
  };
}
function buildAndWrite(wt, slug) {
  const ledger = readLedger(wt, slug);
  const docPath = join2(wt, wfRel(slug), DOC_FILE);
  const doc = existsSync2(docPath) ? safeParseFrontmatter(readFileSync2(docPath, "utf8")).content ?? "" : "";
  const html = buildReport(ledger, {
    expand: (h) => expand(h, { componentsRoot: join2(PLUGIN_ROOT, "components"), maxDepth: 4 }),
    mediaFor: mediaReader(wt),
    doc
  });
  const file = join2(wt, wfRel(slug), REPORT_FILE);
  writeAtomic(file, html);
  const { bytes, problems } = reportProblems(html);
  const heaviest = (ledger.proofs ?? []).flatMap((p) => p.media ?? []).filter((m) => existsSync2(join2(wt, m))).map((m) => ({ path: m, bytes: statSync(join2(wt, m)).size })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  return { file, bytes, problems, heaviest, url: ledger.report?.url ?? null };
}
function report(root, slug) {
  const wt = needWorktree(root, slug);
  const r = buildAndWrite(wt, slug);
  return { ok: r.problems.length === 0, slug, worktree: wt, ...r };
}
function decide(root, slug, decisionId, f) {
  if (!decisionId) throw new Error("decide needs the decision id, for example D-01");
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const problems = problemsOf(wt, slug, ledger);
  if (problems.length) return { ok: false, slug, error: "the ledger has problems: repair them before the commit", problems };
  const plan = commitPlan(ledger, decisionId, wfRel(slug));
  if (plan.error) return { ok: false, slug, error: plan.error };
  const built = buildAndWrite(wt, slug);
  const refused = [];
  for (const p of plan.paths) {
    const abs = join2(wt, p);
    if (!existsSync2(abs)) {
      refused.push(`${p}: does not exist`);
      continue;
    }
    if (git(wt, ["check-ignore", "-q", "--", p]).ok) refused.push(`${p}: git ignores it`);
    else if (statSync(abs).isFile() && statSync(abs).size > MAX_COMMIT_FILE_BYTES) refused.push(`${p}: ${statSync(abs).size} bytes, over ${MAX_COMMIT_FILE_BYTES}; a large file stays out of the commit`);
  }
  if (refused.length) return { ok: false, slug, error: "some paths cannot be committed: remove them from the proof files, or fix them", refused };
  const before = git(wt, ["diff", "--cached", "--name-only"]).out.split(/\r?\n/).filter(Boolean).map(toPosix);
  const extra = before.filter((p) => !plan.paths.includes(p));
  if (extra.length) return { ok: false, slug, error: "the index already holds staged files that this decision does not name: unstage them first", staged: extra };
  gitOk(wt, ["add", "--", ...plan.paths], "stage");
  const message = f.message && f.message !== true ? `${plan.message}

${f.message}` : plan.message;
  const staged = git(wt, ["diff", "--cached", "--name-only"]).out.split(/\r?\n/).filter(Boolean);
  if (!staged.length) return { ok: false, slug, error: "nothing changed since the last commit: there is nothing to commit" };
  gitOk(wt, ["commit", "-q", "-m", message], "commit");
  const sha = gitOk(wt, ["rev-parse", "HEAD"], "rev-parse");
  const after = readLedger(wt, slug);
  const d = after.decisions.find((x) => x.id === decisionId);
  d.commit = sha;
  after["updated-at"] = nowIso();
  saveLedger(wt, slug, after);
  return { ok: true, slug, worktree: wt, commit: sha, message: plan.message, paths: staged, skipped: plan.skipped, warning: plan.warning, report: { bytes: built.bytes, problems: built.problems } };
}
function exitPrototype(root, slug, how) {
  if (!["park", "graduate", "close"].includes(how)) throw new Error("exit needs park, graduate, or close");
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const statusOf = { park: "parked", graduate: "graduated", close: "closed" }[how];
  ledger.status = statusOf;
  ledger["updated-at"] = nowIso();
  saveLedger(wt, slug, ledger);
  const next = how === "graduate" ? `/wf intake ${ledger.idea} from ${slug}` : how === "close" ? `/wf intake ${slug} close` : `/wf loop prototype ${slug} <request>`;
  setIndexStatus(wt, slug, statusOf, next);
  upsertIndexRow(mainCheckout(wt), { slug, status: statusOf, branch: ledger.branch, at: ledger["updated-at"] });
  const out = { ok: true, slug, status: statusOf, worktree: wt, branch: ledger.branch, next };
  if (how === "graduate") out.brief = join2(wt, wfRel(slug), DOC_FILE);
  if (how === "close") out.links = linksUnder(wt);
  return out;
}
function linksUnder(dir, limit = 20, maxDirs = 2e4) {
  const found = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length && found.length < limit && seen < maxDirs) {
    const d = stack.pop();
    seen++;
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === ".git") continue;
      const p = join2(d, e.name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) found.push(toPosix(relative(dir, p)));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}
function cleanup(root, slug) {
  const wt = needWorktree(root, slug);
  const main2 = mainCheckout(wt);
  if (samePath(wt, main2)) throw new Error("the prototype runs in the main checkout: there is no worktree to remove");
  const ledger = readLedger(wt, slug);
  if (ledger.status !== "closed") return { ok: false, slug, error: `the prototype is ${ledger.status}: the person closes it first (exit close)` };
  const links = linksUnder(wt);
  if (links.length) return { ok: false, slug, links, error: `the worktree holds links (${links.slice(0, 3).join(", ")}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
  const r = git(main2, ["worktree", "remove", wt]);
  if (!r.ok) return { ok: false, slug, error: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
  return { ok: true, slug, removed: wt, kept: ledger.branch };
}
function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = rest[i + 1];
      if (v === void 0 || v.startsWith("--")) f[k] = true;
      else {
        f[k] = v;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, f };
}
function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, slug, ...rest] = argv;
  if (!cmd || !rootArg || !slug) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case "start":
        out = start(root, slug, f);
        break;
      case "status":
        out = status(root, slug);
        break;
      case "check":
        out = check(root, slug);
        break;
      case "report":
        out = report(root, slug);
        break;
      case "decide":
        out = decide(root, slug, pos[0], f);
        break;
      case "exit":
        out = exitPrototype(root, slug, pos[0]);
        break;
      case "cleanup":
        out = cleanup(root, slug);
        break;
      default:
        out = null;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  if (out === null) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}
`);
  return out.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
export {
  PLUGIN_ROOT,
  main
};
