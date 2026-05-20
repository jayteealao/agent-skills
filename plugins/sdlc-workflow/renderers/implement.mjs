// renderers/implement.mjs — per-slice implementation log
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Implement · ${artifact.frontmatter?.['slice-slug'] ?? ''}`,
    metricFields: [
      { key: 'metric-loc-touched', label: 'LOC touched' },
      { key: 'metric-file-count',  label: 'files' },
    ],
  });
}
