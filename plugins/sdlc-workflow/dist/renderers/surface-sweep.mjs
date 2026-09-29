import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-ZVJXREMW.mjs";
import "../chunk-U5DXOZ5H.mjs";
import "../chunk-Y7H4JJAK.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/surface-sweep.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Surface sweep \u2014 ${fm["scope-path"] ?? "repo root"}`,
    lede: fm["environment-class"] ? `environment ${escapeHtml(fm["environment-class"])}` : "",
    metricFields: [{ key: "findings-count", label: "findings" }]
  });
}
export {
  render
};
