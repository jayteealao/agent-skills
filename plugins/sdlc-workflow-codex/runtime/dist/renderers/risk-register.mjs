import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-MFSM3VF5.mjs";
import "../chunk-XSOGKCYI.mjs";
import "../chunk-4ZFSWP2U.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/risk-register.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Risk register \xB7 ${ctx.slug}`,
    metricFields: [
      { key: "risks-total", label: "risks", tone: "warn" },
      { key: "risks-high", label: "high", sev: "high" },
      { key: "risks-open", label: "open", tone: "warn" }
    ]
  });
}
export {
  render
};
