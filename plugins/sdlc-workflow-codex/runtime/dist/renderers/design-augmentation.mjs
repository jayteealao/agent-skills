import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-WCQRDIZJ.mjs";
import "../chunk-BC2BE3GY.mjs";
import "../chunk-Q7XQ77PQ.mjs";
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
