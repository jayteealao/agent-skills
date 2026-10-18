import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  render as render4
} from "../chunk-NHFXQMGX.mjs";
import {
  render as render3
} from "../chunk-SG63XMCA.mjs";
import {
  render as render2
} from "../chunk-GJO3YIIH.mjs";
import {
  render
} from "../chunk-FGB3D43B.mjs";
import "../chunk-VQ7FT7IB.mjs";
import {
  renderSimple
} from "../chunk-JET75J73.mjs";
import "../chunk-PRVWQLUM.mjs";
import "../chunk-RFW2L66D.mjs";
import "../chunk-G57PRACS.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

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
