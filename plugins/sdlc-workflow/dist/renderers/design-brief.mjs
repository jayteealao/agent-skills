import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-D4YORFGD.mjs";
import "../chunk-46VHMONS.mjs";
import "../chunk-YVOPQ7Y3.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/design-brief.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Design brief" });
}
export {
  render
};
