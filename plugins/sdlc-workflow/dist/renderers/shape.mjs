import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-DHJ4OL62.mjs";
import "../chunk-6UA62V5D.mjs";
import "../chunk-S43YD6UF.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/shape.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: artifact.frontmatter?.title ?? "Shape",
    metricFields: [
      { key: "metric-slice-count", label: "slices" },
      { key: "metric-risk-count", label: "risks" }
    ]
  });
}
export {
  render
};
