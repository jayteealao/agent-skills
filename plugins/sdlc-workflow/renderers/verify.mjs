// renderers/verify.mjs — per-slice verify results
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Verify · ${artifact.frontmatter?.['slice-slug'] ?? ''}`,
    metricFields: [
      { key: 'metric-test-count', label: 'tests' },
      { key: 'metric-pass-count', label: 'passing', tone: 'ok' },
      { key: 'metric-fail-count', label: 'failing', tone: 'bad' },
    ],
  });
}
