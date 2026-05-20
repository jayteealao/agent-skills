// renderers/profile.mjs — off-pipeline benchmark/profiling run
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Profile · ${artifact.frontmatter?.['run-id'] ?? ''}`,
  });
}
