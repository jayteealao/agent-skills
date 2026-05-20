// renderers/design-augmentation.mjs — design sub-command artifact
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Design · ${artifact.frontmatter?.['sub-command'] ?? ''}`,
  });
}
