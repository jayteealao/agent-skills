// renderers/design-brief.mjs — the legacy `design-brief` type (an old 02c-craft.md; scripts/migrate-design-types.mjs)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Design brief' });
}
