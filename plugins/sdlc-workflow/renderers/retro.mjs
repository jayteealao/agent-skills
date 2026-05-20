// renderers/retro.mjs — retrospective for a shipped slug
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Retrospective' });
}
