// renderers/slice-amendment.mjs — append-only amendment to a slice
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Slice amendment' });
}
