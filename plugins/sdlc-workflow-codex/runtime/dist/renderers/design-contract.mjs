import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  frontmatterCard
} from "../chunk-TOB7I5DX.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-H6E3LPBK.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-OJDSJJI5.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/design-contract.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const data = sy ?? fm;
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `${fm.component ?? data.component ?? "Design"} visual contract`),
    badges: [
      statusBadge(fm.status),
      stageBadge("design-contract"),
      (fm.component ?? data.component) && `<span class="meta">${escapeHtml(fm.component ?? data.component)}</span>`,
      (fm["based-on"] ?? data["based-on"]) && `<span class="meta">based on ${escapeHtml(fm["based-on"] ?? data["based-on"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "tokens", value: (data.tokens ?? []).length },
    { label: "states", value: (data.states ?? []).length },
    { label: "sizes", value: (data.sizes ?? []).length },
    { label: "themes", value: (data.themes ?? []).length }
  ]);
  const summaryHtml = sy?.summary ? `<p class="sdlc-lede">${escapeHtml(sy.summary)}</p>` : "";
  const matrixHtml = !artifact.fragment ? `<section class="design-contract-matrix">
        <h2 class="sdlc-h2">contract coverage</h2>
        ${listBlock("tokens", data.tokens)}
        ${listBlock("states", data.states)}
        ${listBlock("sizes", data.sizes)}
        ${listBlock("themes", data.themes)}
      </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
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
    bodyHtml: `${metricsHtml}${summaryHtml}${fragmentBlock}${matrixHtml}${frontmatterBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
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
