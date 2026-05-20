// renderers/slice.mjs — single slice detail page
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Slice · ${artifact.frontmatter?.['slice-slug'] ?? artifact.frontmatter?.slug ?? ''}`,
    metricFields: [
      { key: 'metric-loc-touched', label: 'LOC' },
      { key: 'metric-step-count',  label: 'steps' },
    ],
  });
}
