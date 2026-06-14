import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-YHPMVBRM.mjs";
import "../chunk-WB3CNU66.mjs";
import "../chunk-OOUZYKHP.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/estimate.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Estimate \xB7 ${ctx.slug}`,
    metricFields: [
      { key: "estimate-points", label: "points", tone: "info" },
      { key: "confidence", label: "confidence", tone: "info" },
      { key: "uncertainty-count", label: "uncertainties", tone: "warn" }
    ]
  });
}
export {
  render
};
