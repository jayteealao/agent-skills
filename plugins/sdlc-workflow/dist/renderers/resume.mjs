import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-WSLT3R6C.mjs";
import "../chunk-ULKKJGJ3.mjs";
import "../chunk-MSJ2NCHW.mjs";
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
