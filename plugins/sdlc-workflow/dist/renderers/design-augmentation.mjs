import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-NAZGYNON.mjs";
import "../chunk-ZX5ID3SE.mjs";
import "../chunk-QUZHLY62.mjs";
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
