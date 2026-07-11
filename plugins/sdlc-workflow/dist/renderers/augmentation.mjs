import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  render as render4
} from "../chunk-L72FG4J2.mjs";
import {
  render as render3
} from "../chunk-RF5XU32X.mjs";
import {
  render as render2
} from "../chunk-SDR6IFK5.mjs";
import {
  render
} from "../chunk-MJZH4SYY.mjs";
import "../chunk-EG7S7OJR.mjs";
import "../chunk-PDBKNARE.mjs";
import {
  renderSimple
} from "../chunk-DGHQ4D4V.mjs";
import "../chunk-XV4QYX6S.mjs";
import "../chunk-SWU6HFSL.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
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
