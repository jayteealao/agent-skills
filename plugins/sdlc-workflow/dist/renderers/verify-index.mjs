import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-7HCDUW4D.mjs";
import "../chunk-MVFNADH4.mjs";
import "../chunk-DWQ5ETI7.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/verify-index.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Verify index" });
}
export {
  render
};
