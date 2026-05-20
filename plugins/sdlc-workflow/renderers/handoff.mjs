// renderers/handoff.mjs — pre-ship handoff doc
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Handoff' });
}
