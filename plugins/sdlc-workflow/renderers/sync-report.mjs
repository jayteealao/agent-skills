// renderers/sync-report.mjs — branch-sync report (regenerable)
import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Sync report' });
}
