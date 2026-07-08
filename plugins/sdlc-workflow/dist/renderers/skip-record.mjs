import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-D7FZACIL.mjs";
import "../chunk-VUK443PJ.mjs";
import "../chunk-ZOE2XJQU.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/skip-record.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Skip \xB7 ${artifact.frontmatter?.["stage-skipped"] ?? ""}`
  });
}
export {
  render
};
