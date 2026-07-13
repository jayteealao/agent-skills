import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  blockerPart,
  countPart,
  sliceCard,
  sliceGridFigure,
  sliceState
} from "../chunk-SAZLVXY3.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-FFKRTRKZ.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  statusBadge
} from "../chunk-KRM5SM5T.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/implement-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const impl = ctx.allArtifacts?.implement ?? [];
  const dependsBySlug = /* @__PURE__ */ new Map();
  for (const s of ctx.allArtifacts?.slice ?? []) {
    const sl = s.frontmatter?.["slice-slug"] ?? s.frontmatter?.slug;
    if (sl) dependsBySlug.set(sl, s.frontmatter?.["depends-on"]);
  }
  const items = impl.map((s) => {
    const f = s.frontmatter ?? {};
    const slug = f["slice-slug"] ?? f.slug ?? s.storageRel ?? "";
    const deps = Array.isArray(f["depends-on"]) ? f["depends-on"] : dependsBySlug.get(slug);
    return { slug, fm: deps ? { ...f, "depends-on": deps } : f };
  });
  const done = items.filter((s) => sliceState(s.fm.status) === "complete").length;
  const sumFiles = items.reduce((a, s) => a + (Number(s.fm["metric-files-changed"] ?? s.fm["files-changed"]) || 0), 0);
  const sumFixes = items.reduce((a, s) => a + (Number(s.fm["metric-review-fixes-applied"] ?? s.fm["review-fixes-applied"]) || 0), 0);
  const sliceFm = (ctx.allArtifacts?.["slice-index"] ?? [])[0]?.frontmatter ?? {};
  const rosterTotal = Number(sliceFm["total-slices"]);
  const total = (Number.isFinite(rosterTotal) && rosterTotal > 0 ? rosterTotal : 0) || (Array.isArray(sliceFm.slices) ? sliceFm.slices.length : 0) || (ctx.allArtifacts?.slice ?? []).length || items.length;
  const showTotal = total > items.length;
  const sliceCount = showTotal ? `${items.length}/${total}` : String(items.length);
  const plural = (showTotal ? total : items.length) === 1 ? "" : "s";
  const lede = items.length || showTotal ? `${sliceCount} slice${plural} implemented \xB7 ${done} complete` : "No implementation logs yet.";
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Implementation"),
    lede: escapeHtml(lede),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${sliceCount} slice${plural}</span>`
    ]
  }) + metricRow([
    { label: "slices", value: sliceCount },
    { label: "complete", value: done, tone: "ok" },
    { label: "files changed", value: sumFiles },
    { label: "fixes applied", value: sumFixes }
  ]);
  const figureHtml = figureCanvas({
    figureNumber: 5,
    title: `${items.length} slice${items.length === 1 ? "" : "s"}, depends-on arrows \xB7 implementation dependency graph`,
    svgInner: sliceGridFigure(items, "impl-arrow"),
    legend: [
      { state: "complete", label: "complete" },
      { state: "review", label: "in review" },
      { state: "blocked", label: "blocked" },
      { state: "queued", label: "queued" }
    ]
  });
  const cards = items.map(({ slug, fm: f }) => sliceCard({
    slug,
    fm: f,
    meta: [
      countPart(f["metric-files-changed"] ?? f["files-changed"], "file"),
      countPart(f["metric-review-fixes-applied"] ?? f["review-fixes-applied"], "review"),
      blockerPart(f["blocker-count"] ?? (sliceState(f.status) === "blocked" ? 1 : 0))
    ]
  })).join("");
  const proseHtml = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyHtml = `
    <div class="d-only">${figureHtml}</div>
    ${proseHtml}
    <section class="slice-grid">${cards}</section>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
export {
  render
};
