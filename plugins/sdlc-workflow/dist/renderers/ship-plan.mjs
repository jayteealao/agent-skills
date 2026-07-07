import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-KYLB7WKC.mjs";
import "../chunk-MGTWQJEG.mjs";
import "../chunk-SHLVL5XH.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/ship-plan.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? "Ship plan",
    lede: fm.source ? `source ${escapeHtml(fm.source)}` : ""
  });
}
export {
  render
};
