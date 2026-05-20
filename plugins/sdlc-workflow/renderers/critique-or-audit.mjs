// renderers/critique-or-audit.mjs — design critique / audit sub-command
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `${artifact.frontmatter?.['sub-command'] ?? 'Design audit'}`,
  });
}
