import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-47ZXYFXZ.mjs";
import "../chunk-UXQM6CG6.mjs";
import "../chunk-MPP6TV4P.mjs";
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
