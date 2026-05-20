// renderers/ship-run.mjs — single deploy run (one of many under ship/)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Ship run · ${artifact.frontmatter?.release ?? artifact.frontmatter?.['run-id'] ?? ''}`,
    metricFields: [
      { key: 'metric-test-count',     label: 'tests' },
      { key: 'metric-canary-status',  label: 'canary' },
      { key: 'metric-rollback-window-min', label: 'rollback (min)' },
    ],
  });
}
