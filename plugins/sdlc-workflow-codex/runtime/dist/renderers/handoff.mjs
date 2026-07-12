import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-UJSIDOGL.mjs";
import "../chunk-W6ROBDIP.mjs";
import "../chunk-4BKAPEVK.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/handoff.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Handoff" });
}
export {
  render
};
