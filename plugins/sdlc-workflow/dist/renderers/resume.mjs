import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-DGHQ4D4V.mjs";
import "../chunk-XV4QYX6S.mjs";
import "../chunk-SWU6HFSL.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
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
