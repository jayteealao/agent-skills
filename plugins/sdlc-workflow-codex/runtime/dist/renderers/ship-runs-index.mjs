import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock
} from "../chunk-35VBJOMK.mjs";
import {
  artifactHeader,
  metricRow,
  pageHref,
  statusBadge
} from "../chunk-VNXGJD4X.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/ship-runs-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const runs = ctx.allArtifacts?.["ship-run"] ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Ship runs"),
    badges: [statusBadge(fm.status)]
  }) + metricRow([
    { label: "runs", value: runs.length },
    { label: "shipped", value: runs.filter((r) => r.frontmatter?.status === "shipped").length, tone: "ok" },
    { label: "rolled back", value: runs.filter((r) => r.frontmatter?.["rolled-back"]).length, tone: "bad" }
  ]);
  const rows = runs.map((r) => {
    const id = r.frontmatter?.["run-id"] ?? r.frontmatter?.release ?? "";
    return `<a class="slice-card" href="${escapeHtml(pageHref(id))}">
      <span class="slice-slug"><code>${escapeHtml(id)}</code></span>
      <span class="slice-title">${escapeHtml(r.frontmatter?.title ?? "")}</span>
      ${statusBadge(r.frontmatter?.status)}
    </a>`;
  }).join("");
  return {
    headerHtml,
    bodyHtml: `<section class="slice-grid">${rows}</section><div class="prose">${md2html(artifact.body ?? "")}</div>${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
export {
  render
};
