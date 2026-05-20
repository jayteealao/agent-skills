// renderers/ship-legacy.mjs — deprecated ship doc (pre-v9.2.0)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  const result = renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Ship (legacy)' });
  const banner = `<aside class="warn-banner" role="status"><strong>deprecated</strong> — this artifact type predates v9.2.0. Consider re-running <code>/wf ship</code>.</aside>`;
  return { ...result, bodyHtml: banner + result.bodyHtml };
}
