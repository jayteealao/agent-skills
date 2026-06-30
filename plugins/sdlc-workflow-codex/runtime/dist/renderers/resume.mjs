import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-PTUD22OW.mjs";
import "../chunk-PU6XVNUZ.mjs";
import "../chunk-BFWZBB4T.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/resume.mjs
function render(artifact, ctx) {
  const result = renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Resume" });
  const badge = `<aside class="warn-banner" role="status"><strong>regenerable</strong> \u2014 this artifact is rewritten by automation; edits don't persist.</aside>`;
  return { ...result, bodyHtml: badge + result.bodyHtml };
}
export {
  render
};
