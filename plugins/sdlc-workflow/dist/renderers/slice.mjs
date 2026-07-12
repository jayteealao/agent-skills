import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  frontmatterCard
} from "../chunk-KHD3KL3N.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-WPE3YO27.mjs";
import {
  artifactHeader,
  metricRow,
  pageHref,
  stageBadge,
  statusBadge
} from "../chunk-YKFHAL6B.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/slice.mjs
var STAGES = [
  { type: "plan", label: "plan", dir: "plan" },
  { type: "implement", label: "implement", dir: "implement" },
  { type: "verify", label: "verify", dir: "verify" }
];
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sliceSlug = fm["slice-slug"] ?? fm.slug ?? "";
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Slice \xB7 <code>${escapeHtml(sliceSlug)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("slice"),
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  }) + metricRow([
    fm["metric-loc-touched"] != null && { label: "LOC", value: fm["metric-loc-touched"] },
    fm["metric-step-count"] != null && { label: "steps", value: fm["metric-step-count"] }
  ].filter(Boolean));
  const stagesHtml = renderStageNav(sliceSlug, ctx);
  const reviewsHtml = renderSliceReviewNav(sliceSlug, ctx);
  const fmCard = frontmatterCard(fm);
  const bodyHtml = `
    ${stagesHtml}
    ${reviewsHtml}
    ${fmCard}
    <div class="prose">${md2html(artifact.body ?? "")}</div>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function renderStageNav(sliceSlug, ctx) {
  const cards = STAGES.map(({ type, label, dir }) => {
    const match = (ctx.allArtifacts?.[type] ?? []).find((a) => (a.frontmatter?.["slice-slug"] ?? "") === sliceSlug);
    if (!match) return stageCard({ label, slice: sliceSlug, dir, status: null, present: false });
    return stageCard({
      label,
      slice: sliceSlug,
      dir,
      status: match.frontmatter?.status ?? "",
      present: true
    });
  }).join("");
  return `<section class="slice-stages">
    <h2 class="sdlc-h2">stages</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
function stageCard({ label, slice, dir, status, present }) {
  const href = escapeHtml(pageHref(`../../${dir}/${slice}`));
  const inner = `<span class="slice-slug"><code>${escapeHtml(label)}</code></span>
    ${present ? statusBadge(status) : '<span class="meta">not started</span>'}`;
  if (!present) {
    return `<div class="slice-card is-missing">${inner}</div>`;
  }
  return `<a class="slice-card" href="${href}">${inner}</a>`;
}
function renderSliceReviewNav(sliceSlug, ctx) {
  const reviews = (ctx.allArtifacts?.["review-command"] ?? []).filter((a) => {
    const fm = a.frontmatter ?? {};
    return (fm["slice-slug"] ?? "") === sliceSlug || /* review may be slug-wide; surface if it references the slice */
    Array.isArray(fm["slices"]) && fm["slices"].includes(sliceSlug);
  });
  if (!reviews.length) return "";
  const cards = reviews.map((r) => {
    const dim = r.frontmatter?.dimension ?? r.frontmatter?.command ?? r.frontmatter?.["review-command"] ?? "";
    return `<a class="slice-card" href="${escapeHtml(pageHref(`../../review/${dim}`))}">
      <span class="slice-slug"><code>${escapeHtml(dim)}</code></span>
      ${statusBadge(r.frontmatter?.status ?? "")}
    </a>`;
  }).join("");
  return `<section class="slice-reviews">
    <h2 class="sdlc-h2">reviews</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
export {
  render
};
