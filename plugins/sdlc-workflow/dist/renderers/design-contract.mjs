import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  frontmatterCard
} from "../chunk-FNQZRWAV.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-CKNVJRRA.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-NVOREQYI.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/design-contract.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `${fm.component ?? "Design"} visual contract`),
    badges: [
      statusBadge(fm.status),
      stageBadge("design-contract"),
      fm.component && `<span class="meta">${escapeHtml(fm.component)}</span>`,
      fm["based-on"] && `<span class="meta">based on ${escapeHtml(fm["based-on"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "tokens", value: (fm.tokens ?? []).length },
    { label: "states", value: (fm.states ?? []).length },
    { label: "sizes", value: (fm.sizes ?? []).length },
    { label: "themes", value: (fm.themes ?? []).length }
  ]);
  const matrixHtml = `<section class="design-contract-matrix">
    <h2 class="sdlc-h2">contract coverage</h2>
    ${listBlock("tokens", fm.tokens)}
    ${listBlock("states", fm.states)}
    ${listBlock("sizes", fm.sizes)}
    ${listBlock("themes", fm.themes)}
  </section>`;
  const frontmatterBlock = frontmatterCard(fm, [
    "component",
    "based-on",
    "register",
    "image-gate",
    "north-star-mock",
    "references-loaded",
    "refs"
  ]);
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${matrixHtml}${frontmatterBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function listBlock(label, values = []) {
  const items = Array.isArray(values) ? values : [];
  return `<div class="contract-list">
    <h3>${escapeHtml(label)}</h3>
    ${items.length ? `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>` : '<p class="muted">none recorded</p>'}
  </div>`;
}
export {
  render
};
