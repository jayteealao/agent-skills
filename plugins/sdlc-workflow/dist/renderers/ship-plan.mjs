import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-7MCD37MP.mjs";
import "../chunk-EQQBEB4F.mjs";
import "../chunk-RXMUMGSA.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
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
