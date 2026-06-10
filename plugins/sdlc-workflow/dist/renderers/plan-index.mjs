import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  countPart,
  sliceCard
} from "../chunk-YXEXJBJP.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-RHQB6O5G.mjs";
import {
  artifactHeader,
  metricRow,
  statusBadge
} from "../chunk-U7AGHKEY.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/plan-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const plans = ctx.allArtifacts?.plan ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Plan index"),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${plans.length} plan${plans.length === 1 ? "" : "s"}</span>`
    ]
  }) + metricRow((() => {
    const blocked = plans.filter((p) => p.frontmatter?.["has-blockers"]).length;
    return [
      { label: "plans", value: plans.length },
      // PLN-19: only tint amber when there actually are blocked plans.
      { label: "with blockers", value: blocked, tone: blocked ? "warn" : void 0 }
    ];
  })());
  const cards = plans.map((p) => {
    const f = p.frontmatter ?? {};
    const slug = f["slice-slug"] ?? "";
    return sliceCard({
      slug,
      fm: f,
      meta: [
        countPart(f["metric-files-to-touch"], "file"),
        countPart(f["metric-step-count"], "step"),
        f["has-blockers"] ? '<span class="blocker-cnt">blockers</span>' : null
      ]
    });
  }).join("");
  const bodyHtml = `
    <section class="slice-grid">${cards}</section>
    <div class="prose">${md2html(artifact.body ?? "")}</div>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
export {
  render
};
