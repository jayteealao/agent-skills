import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-TP65SZMX.mjs";
import "../chunk-GHS5B24L.mjs";
import "../chunk-ZN7MNSO3.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/recap.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Recap" });
}
export {
  render
};
