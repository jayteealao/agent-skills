import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-TP65SZMX.mjs";
import "../chunk-GHS5B24L.mjs";
import "../chunk-ZN7MNSO3.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

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
