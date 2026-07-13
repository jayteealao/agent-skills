import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-MDT7H6MX.mjs";
import "../chunk-IH7U7ACB.mjs";
import "../chunk-NIZCHEPD.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/retro.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Retrospective" });
}
export {
  render
};
