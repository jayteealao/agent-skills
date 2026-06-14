import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  render as render4
} from "../chunk-B2AQNFTZ.mjs";
import {
  render as render3
} from "../chunk-ZXM7OQTD.mjs";
import {
  render as render2
} from "../chunk-X2XLS4J7.mjs";
import {
  render
} from "../chunk-OEEMV4AG.mjs";
import "../chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "../chunk-YHPMVBRM.mjs";
import "../chunk-WB3CNU66.mjs";
import "../chunk-SBZWMVZN.mjs";
import "../chunk-OOUZYKHP.mjs";
import {
  escapeHtml
} from "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/augmentation.mjs
function render5(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const type = fm["augmentation-type"] ?? fm.augmentation_type ?? artifact.siblingYaml?.artifact ?? null;
  if (type === "benchmark") return render(artifact, ctx);
  if (type === "experiment") return render2(artifact, ctx);
  if (type === "instrument") return render3(artifact, ctx);
  if (type === "rca") return render4(artifact, ctx);
  return renderSimple(artifact, ctx, {
    title: `Augmentation \xB7 ${escapeHtml(type ?? fm.title ?? "")}`
  });
}
export {
  render5 as render
};
