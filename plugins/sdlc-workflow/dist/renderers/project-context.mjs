import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-BHUAUYVV.mjs";
import "../chunk-V35JPU6V.mjs";
import "../chunk-T5KRRFZB.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-EQC6XDOG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/project-context.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? projectTitle(artifact.path),
    lede: fm.source ? `source ${escapeHtml(fm.source)}` : ""
  });
}
function projectTitle(path) {
  if (String(path).endsWith("PRODUCT.md")) return "Product context";
  if (String(path).endsWith("DESIGN.md")) return "Design context";
  return "Project context";
}
export {
  render
};
