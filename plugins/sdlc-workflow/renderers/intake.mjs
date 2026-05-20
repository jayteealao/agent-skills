// renderers/intake.mjs — captured problem statement and acceptance criteria
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Intake' });
}
