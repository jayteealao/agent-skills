import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-YHPMVBRM.mjs";
import "../chunk-WB3CNU66.mjs";
import "../chunk-OOUZYKHP.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/skip-record.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Skip \xB7 ${artifact.frontmatter?.["stage-skipped"] ?? ""}`
  });
}
export {
  render
};
