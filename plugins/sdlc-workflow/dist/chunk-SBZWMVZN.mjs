import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  escapeHtml
} from "./chunk-BTT5W62B.mjs";

// renderers/_figure.mjs
function figureCanvas({ figureNumber, title, svgInner, legend = [] }) {
  const legendHtml = legend.length ? `<span class="figure-legend" aria-hidden="true">${legend.map(legendEntry).join("")}</span>` : "";
  return `<figure class="figure-canvas">
  <figcaption class="figure-meta">
    <span class="figure-title"><b>Figure ${figureNumber}</b> \xB7 ${escapeHtml(title)}</span>
    ${legendHtml}
  </figcaption>
  ${svgInner}
</figure>`;
}
function legendEntry(e) {
  const swatch = e.state ? `<span class="sw ${escapeHtml(e.state)}"></span>` : e.swatch ? `<span class="sw" style="background:${escapeHtml(e.swatch)}"></span>` : "";
  return `<span class="legend-entry">${swatch}${escapeHtml(e.label)}</span>`;
}
function evenX(width, pad, count) {
  if (count <= 1) return [width / 2];
  const inner = width - 2 * pad;
  const step = inner / (count - 1);
  return Array.from({ length: count }, (_, i) => pad + i * step);
}

export {
  figureCanvas,
  evenX
};
