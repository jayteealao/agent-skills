import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-76JFDSWK.mjs";
import "../chunk-JFIFDBVI.mjs";
import "../chunk-SUJ36R7O.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-EQC6XDOG.mjs";
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
