// renderers/_figure.mjs
// Page-opening figure-canvas helper. Every canonical page (dashboard, slug
// overview, plan, review, slice-grid) opens with a captioned inline SVG. The
// SVG content is built by 1k page-specific builders; this helper wraps them
// in the shared figure-canvas chrome.

import { escapeHtml } from './_validator.mjs';

/**
 * Wrap a builder-produced SVG string inside the shared `.figure-canvas` chrome.
 *
 * @param {object} params
 * @param {number} params.figureNumber
 * @param {string} params.title — figure caption text
 * @param {string} params.svgInner — raw SVG content (full <svg>…</svg>)
 * @param {Array<{ swatch?, label }>} [params.legend] — optional legend entries
 */
export function figureCanvas({ figureNumber, title, svgInner, legend = [] }) {
  const legendHtml = legend.length
    ? `<span class="figure-legend" aria-hidden="true">${legend.map(legendEntry).join('')}</span>`
    : '';

  return `<figure class="figure-canvas">
  <figcaption class="figure-meta">
    <span class="figure-title"><b>Figure ${figureNumber}</b> · ${escapeHtml(title)}</span>
    ${legendHtml}
  </figcaption>
  ${svgInner}
</figure>`;
}

function legendEntry(e) {
  const swatch = e.swatch
    ? `<span class="sw" style="background:${escapeHtml(e.swatch)}"></span>`
    : '';
  return `<span class="legend-entry">${swatch}${escapeHtml(e.label)}</span>`;
}

/**
 * Layout helper: derive an evenly-spaced x-coordinate set inside an SVG canvas
 * of width `width`, leaving `pad` on each side, for `count` items.
 */
export function evenX(width, pad, count) {
  if (count <= 1) return [width / 2];
  const inner = width - 2 * pad;
  const step = inner / (count - 1);
  return Array.from({ length: count }, (_, i) => pad + i * step);
}

/** Linear interpolation between two values for SVG positioning. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
