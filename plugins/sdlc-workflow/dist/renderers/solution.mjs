import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-ZK5JDD5G.mjs";
import "../chunk-554SLPZT.mjs";
import "../chunk-I6ACAWA5.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/solution.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const src = Array.isArray(fm["source-workflow"]) ? fm["source-workflow"].join(", ") : fm["source-workflow"];
  return renderSimple(artifact, ctx, {
    title: fm.title ?? "Durable learning",
    lede: src ? escapeHtml(`from ${src}`) : "",
    metricFields: [
      { key: "category", label: "category", tone: "info" },
      { key: "status", label: "status", tone: fm.status === "superseded" ? "warn" : "ok" }
    ]
  });
}
export {
  render
};
