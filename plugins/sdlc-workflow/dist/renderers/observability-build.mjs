import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-5PQU5MRD.mjs";
import "../chunk-L2O55KIF.mjs";
import "../chunk-PCCTLKQ6.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/observability-build.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const planV = fm["plan-version-at-run"] ? `realizes plan v${fm["plan-version-at-run"]}` : "";
  const backend = fm.backend ? `backend ${escapeHtml(fm.backend)}` : "";
  return renderSimple(artifact, ctx, {
    title: fm.title ?? "Observability build",
    lede: [planV, backend].filter(Boolean).join(" \xB7 ")
  });
}
export {
  render
};
