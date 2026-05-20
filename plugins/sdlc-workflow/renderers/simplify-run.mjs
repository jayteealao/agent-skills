// renderers/simplify-run.mjs — off-pipeline simplify output
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Simplify · ${artifact.frontmatter?.['run-id'] ?? ''}`,
    metricFields: [
      { key: 'metric-loc-removed', label: 'LOC removed', tone: 'ok' },
      { key: 'metric-step-count',  label: 'steps' },
    ],
  });
}
