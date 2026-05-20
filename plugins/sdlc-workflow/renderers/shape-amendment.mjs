// renderers/shape-amendment.mjs — append-only amendment to a shape doc
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Shape amendment' });
}
