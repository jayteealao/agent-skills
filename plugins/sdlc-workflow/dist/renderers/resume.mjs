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

// renderers/resume.mjs
function render(artifact, ctx) {
  const result = renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Resume" });
  const badge = `<aside class="warn-banner" role="status"><strong>regenerable</strong> \u2014 this artifact is rewritten by automation; edits don't persist.</aside>`;
  return { ...result, bodyHtml: badge + result.bodyHtml };
}
export {
  render
};
