import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-YVS5HJJI.mjs";
import "../chunk-M4L3PWUR.mjs";
import "../chunk-U4XWDSQ3.mjs";
import "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
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
