import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-BHUAUYVV.mjs";
import "../chunk-V35JPU6V.mjs";
import "../chunk-T5KRRFZB.mjs";
import "../chunk-3RXHOXIK.mjs";
import "../chunk-EQC6XDOG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/implement.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Implement \xB7 ${artifact.frontmatter?.["slice-slug"] ?? ""}`,
    metricFields: [
      { key: "metric-loc-touched", label: "LOC touched" },
      { key: "metric-file-count", label: "files" }
    ]
  });
}
export {
  render
};
