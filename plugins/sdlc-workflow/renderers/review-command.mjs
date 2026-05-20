// renderers/review-command.mjs — per-dimension review (security, correctness, …)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Review · ${artifact.frontmatter?.dimension ?? artifact.frontmatter?.command ?? ''}`,
    metricFields: [
      { key: 'metric-finding-count', label: 'findings' },
      { key: 'metric-blocker-count', label: 'blockers', sev: 'blocker' },
    ],
  });
}
