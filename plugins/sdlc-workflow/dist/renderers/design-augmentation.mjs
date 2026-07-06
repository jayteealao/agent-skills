import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-3CIDQ7BG.mjs";
import "../chunk-NL2NIEAK.mjs";
import "../chunk-TRN7RGXO.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/design-augmentation.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Design \xB7 ${artifact.frontmatter?.["sub-command"] ?? ""}`
  });
}
export {
  render
};
