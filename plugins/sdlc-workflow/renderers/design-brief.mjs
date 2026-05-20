// renderers/design-brief.mjs — design brief (02c-craft.md)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Design brief' });
}
