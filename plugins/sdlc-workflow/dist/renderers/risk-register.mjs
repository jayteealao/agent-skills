import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-WSLT3R6C.mjs";
import "../chunk-ULKKJGJ3.mjs";
import "../chunk-MSJ2NCHW.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

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
