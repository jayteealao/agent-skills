import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "./chunk-CZS6UY5J.mjs";

// renderers/ship-legacy.mjs
function render(artifact, ctx) {
  const result = renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? "Ship (legacy)" });
  const banner = `<aside class="warn-banner" role="status"><strong>deprecated</strong> \u2014 this artifact type predates v9.2.0. Consider re-running <code>/wf ship</code>.</aside>`;
  return { ...result, bodyHtml: banner + result.bodyHtml };
}

export {
  render
};
