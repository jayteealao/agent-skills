import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  blockerPart,
  countPart,
  sliceCard,
  sliceGridFigure,
  sliceState
} from "../chunk-OGG5RQKN.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-EAW62FCU.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  statusBadge
} from "../chunk-MYOFDXHA.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/slice-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const rosterStatus = new Map(
    (Array.isArray(fm.slices) ? fm.slices : []).filter((s) => s && s.slug).map((s) => [s.slug, s.status])
  );
  const slices = (ctx.allArtifacts?.slice ?? []).map((s) => {
    const slug = s.frontmatter?.["slice-slug"] ?? s.frontmatter?.slug ?? s.storageRel;
    const f = s.frontmatter ?? {};
    return { slug, fm: rosterStatus.has(slug) ? { ...f, status: rosterStatus.get(slug) } : f };
  });
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Slice index"),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${slices.length} slice${slices.length === 1 ? "" : "s"}</span>`
    ]
  }) + metricRow([
    { label: "total", value: slices.length },
    { label: "complete", value: slices.filter((s) => sliceState(s.fm.status) === "complete").length, tone: "ok" },
    { label: "in progress", value: slices.filter((s) => sliceState(s.fm.status) === "in-progress").length },
    { label: "blocked", value: slices.filter((s) => sliceState(s.fm.status) === "blocked").length, tone: "bad" }
  ]);
  const figureHtml = figureCanvas({
    figureNumber: 5,
    title: `${slices.length} slice${slices.length === 1 ? "" : "s"}, depends-on arrows \xB7 slice dependency graph`,
    svgInner: sliceGridFigure(slices),
    legend: [
      { state: "complete", label: "complete" },
      { state: "review", label: "in review" },
      { state: "blocked", label: "blocked" },
      { state: "queued", label: "queued" }
    ]
  });
  const cards = slices.map(({ slug, fm: f }) => {
    const blockers = Number(f.blockers ?? f["blocker-count"] ?? (sliceState(f.status) === "blocked" ? 1 : 0)) || 0;
    return sliceCard({
      slug,
      fm: f,
      meta: [
        countPart(f["files-touched"] ?? f["metric-files-to-touch"] ?? f.files, "file"),
        countPart(f["review-count"] ?? f.reviews, "review"),
        blockerPart(blockers)
      ]
    });
  }).join("");
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
