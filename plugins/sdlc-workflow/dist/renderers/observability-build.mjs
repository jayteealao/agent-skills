import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-DHJ4OL62.mjs";
import "../chunk-6UA62V5D.mjs";
import "../chunk-S43YD6UF.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
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
