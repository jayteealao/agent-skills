import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-ZVJXREMW.mjs";
import "../chunk-U5DXOZ5H.mjs";
import "../chunk-Y7H4JJAK.mjs";
import "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
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
