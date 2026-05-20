// renderers/shape.mjs — feature shaping doc (problem space, constraints, slices)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: artifact.frontmatter?.title ?? 'Shape',
    metricFields: [
      { key: 'metric-slice-count', label: 'slices' },
      { key: 'metric-risk-count',  label: 'risks' },
    ],
  });
}
