import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-D4YORFGD.mjs";
import "../chunk-46VHMONS.mjs";
import "../chunk-YVOPQ7Y3.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
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
