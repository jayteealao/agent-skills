import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-UV62IXF2.mjs";
import "../chunk-LNLILMTK.mjs";
import "../chunk-ASUVWO6I.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
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
