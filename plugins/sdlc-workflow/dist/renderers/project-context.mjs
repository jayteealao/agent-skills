import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-NAZGYNON.mjs";
import "../chunk-ZX5ID3SE.mjs";
import "../chunk-QUZHLY62.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
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
