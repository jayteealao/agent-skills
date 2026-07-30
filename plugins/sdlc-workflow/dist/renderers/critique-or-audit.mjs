import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-U2F5J56L.mjs";
import "../chunk-ZPAJFEHE.mjs";
import "../chunk-XMEPKXBI.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/critique-or-audit.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `${artifact.frontmatter?.["sub-command"] ?? "Design audit"}`
  });
}
export {
  render
};
