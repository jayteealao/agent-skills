import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-6DEFLDTT.mjs";
import "../chunk-7NX7OFGE.mjs";
import "../chunk-R24RSNSW.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/observability-plan.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const version = fm["plan-version"] ? `plan v${fm["plan-version"]}` : "";
  const project = fm["project-name"] ? escapeHtml(fm["project-name"]) : "";
  return renderSimple(artifact, ctx, {
    title: fm.title ?? "Observability plan",
    lede: [project, version].filter(Boolean).join(" \xB7 ")
  });
}
export {
  render
};
