// renderers/skip-record.mjs — skip explanation for a missed stage
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Skip · ${artifact.frontmatter?.['stage-skipped'] ?? ''}`,
  });
}
