// renderers/_cards.mjs — shared slice-card anatomy + dependency-graph figure.
//
// Extracted from slice-index.mjs so the implement-index and plan-index pages can
// emit the same full sc-hd/sc-name/sc-pill/sc-meta/sc-bar/sc-foot card the CSS
// already defines (S-8) instead of a bare slug + status badge. One source of
// truth for the four slice states, the progress percent, recency formatting, the
// card markup, and Figure 5 — so the three index renderers can't drift apart.

import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

// Map a raw status to the design's four slice states (D7.6).
export function sliceState(status) {
  const s = String(status ?? '').trim().toLowerCase();
  if (['complete', 'completed', 'done', 'shipped'].includes(s)) return 'complete';
  if (s === 'blocked') return 'blocked';
  if (['active', 'in-progress', 'in progress', 'wip', 'review', 'in-review'].includes(s)) return 'in-progress';
  return 'not-started';
}

// Progress percent: prefer an explicit progress {done,total} or percent field,
// else derive a representative value from the state.
export function slicePct(fm, st) {
  const p = fm.progress;
  if (p && typeof p === 'object' && Number(p.total)) return Math.round((100 * (Number(p.done) || 0)) / Number(p.total));
  if (typeof fm.percent === 'number') return Math.max(0, Math.min(100, fm.percent));
  return st === 'complete' ? 100 : st === 'in-progress' ? 50 : st === 'blocked' ? 35 : 0;
}

// The design's pill copy: "in progress" / "queued" / the state verbatim.
export function pillLabel(st) {
  return st === 'in-progress' ? 'in progress' : st === 'not-started' ? 'queued' : st;
}

// One "3 files" / "2 reviews" meta fragment; null when the value is absent so
// callers can drop it from the meta line via .filter(Boolean).
export function countPart(value, singular, plural = `${singular}s`) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return `${escapeHtml(String(value))} ${n === 1 ? singular : plural}`;
}

// A blocker count in the --blocker tone; null when there are none. Pass a falsy
// count to omit it; the label pluralises on the count.
export function blockerPart(count, label = 'blocker') {
  const n = Number(count) || 0;
  if (!n) return null;
  return `<span class="blocker-cnt">${n} ${label}${n === 1 ? '' : 's'}</span>`;
}

// ISO timestamp → "12 min ago". Returns raw text (escaped at call site).
export function humanRelative(iso) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = Date.now() - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return `${Math.round(d / 30)} mo ago`;
}

// A full slice card: serif name + tinted status pill (sc-hd), quantitative meta
// (sc-meta), a state-coloured progress bar (sc-bar), and a recency + percent
// footer (sc-foot). The caller supplies the slug, the frontmatter (drives
// state/pct/recency/title), and a pre-built `meta` array of count fragments so
// each index page maps its own per-card counts. State classes drive the colours
// (D7.2–D7.6); the always-empty .slice-title span is dropped (D7.10).
export function sliceCard({ slug, fm = {}, meta = [], href }) {
  const st = sliceState(fm.status);
  const pct = slicePct(fm, st);
  const recency = fm['updated-at'] ? humanRelative(fm['updated-at']) : '';
  const parts = meta.filter(Boolean);
  const hasTitle = fm.title && fm.title !== slug;
  return `<a class="slice-card ${st}" href="${escapeHtml(href ?? pageHref(slug))}">
    <div class="sc-hd">
      <span class="sc-name">${escapeHtml(fm.title || slug)}</span>
      <span class="sc-pill ${st}">${escapeHtml(pillLabel(st))}</span>
    </div>
    ${hasTitle ? `<code class="slice-slug">${escapeHtml(slug)}</code>` : ''}
    ${parts.length ? `<div class="sc-meta">${parts.join(' · ')}</div>` : ''}
    <div class="sc-bar"><i style="width:${pct}%"></i></div>
    <div class="sc-foot"><span>${recency ? escapeHtml(recency) : escapeHtml(st)}</span><span class="pct">${pct}%</span></div>
  </a>`;
}

// Figure 5 — slice dependency graph (D7.1). Nodes are laid out in columns by
// longest-path depth over the `depends-on` edges; directed bezier paths with
// arrowheads point from each dependency to its dependent. `markerId` keeps the
// SVG <marker> id unique should two graphs ever share a page. Each item is
// { slug, fm } where fm carries `status` (node colour) and `depends-on` (edges).
export function sliceGridFigure(slices, markerId = 'slice-arrow') {
  if (!slices.length) {
    return `<svg viewBox="0 0 600 80" width="100%"><text x="300" y="44" text-anchor="middle" fill="#8a8377" font-size="13">No slices yet</text></svg>`;
  }
  const bySlug = new Map(slices.map((s) => [s.slug, s]));
  const depsOf = (s) => (Array.isArray(s.fm['depends-on']) ? s.fm['depends-on'] : []).filter((d) => bySlug.has(d));

  // Longest-path depth per node (cycle-guarded).
  const depth = new Map();
  const computeDepth = (slug, seen) => {
    if (depth.has(slug)) return depth.get(slug);
    if (seen.has(slug)) return 0;
    seen.add(slug);
    const s = bySlug.get(slug);
    const ds = s ? depsOf(s) : [];
    const d = ds.length ? 1 + Math.max(...ds.map((x) => computeDepth(x, seen))) : 0;
    seen.delete(slug);
    depth.set(slug, d);
    return d;
  };
  for (const s of slices) computeDepth(s.slug, new Set());

  const maxDepth = Math.max(0, ...depth.values());
  const columns = [];
  for (const s of slices) {
    const d = depth.get(s.slug) ?? 0;
    (columns[d] ??= []).push(s);
  }

  const W = 920;
  const colW = W / (maxDepth + 1);
  const nodeW = Math.max(120, Math.min(180, colW - 28));
  const nodeH = 46;
  const rowGap = 26;
  const maxRows = Math.max(1, ...columns.map((c) => (c ? c.length : 0)));
  const H = 24 + maxRows * (nodeH + rowGap);

  const pos = new Map();
  columns.forEach((list, d) => {
    const cx = d * colW + colW / 2;
    (list ?? []).forEach((s, ri) => {
      const x = cx - nodeW / 2;
      const y = 16 + ri * (nodeH + rowGap);
      pos.set(s.slug, { x, y, w: nodeW, cy: y + nodeH / 2 });
    });
  });

  const edgeSvg = slices.flatMap((s) => depsOf(s).map((d) => {
    const from = pos.get(d);
    const to   = pos.get(s.slug);
    if (!from || !to) return '';
    const fx = from.x + from.w, fy = from.cy;
    const tx = to.x,            ty = to.cy;
    const cpx = (fx + tx) / 2;
    return `<path d="M ${fx} ${fy} C ${cpx} ${fy}, ${cpx} ${ty}, ${tx} ${ty}" fill="none" stroke="#8a8377" stroke-width="1.2" marker-end="url(#${markerId})"/>`;
  })).join('');

  const nodeSvg = slices.map((s) => {
    const p = pos.get(s.slug);
    if (!p) return '';
    const st = sliceState(s.fm.status);
    const fill = st === 'complete' ? '#ecf3e7' : st === 'blocked' ? '#fbeaf0' : st === 'in-progress' ? '#e9eef4' : '#fbfaf6';
    const stroke = st === 'complete' ? '#3e7d4a' : st === 'blocked' ? '#b5305f' : st === 'in-progress' ? '#4a6c8c' : '#cbc4b1';
    const dash = st === 'not-started' ? ' stroke-dasharray="3 2"' : '';
    return `<rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${dash}/>
      <text x="${p.x + 12}" y="${p.y + 20}" font-size="11" font-weight="600" fill="#1f1b16">${escapeHtml((s.slug || '').slice(0, 22))}</text>
      <text x="${p.x + 12}" y="${p.y + 36}" font-size="9" fill="#8a8377">${escapeHtml(st === 'in-progress' ? 'in progress' : st)}</text>`;
  }).join('');

  const defs = `<defs>
    <marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/>
    </marker>
  </defs>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slice dependency graph">
    ${defs}${edgeSvg}${nodeSvg}
  </svg>`;
}
