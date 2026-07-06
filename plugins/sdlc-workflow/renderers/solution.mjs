// renderers/solution.mjs — durable cross-workflow learning (.ai/solutions/<category>/<slug>.md).
// Distilled by /wf retro (feedback-loops W1) and read by /wf plan's learnings scan.
// Body is Problem / Learning / How to apply. Rendered as a frontmatter card +
// promoted category/status metric row + the markdown narrative.
import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  // source-workflow is a slug, or a list once later workflows refresh the learning.
  const src = Array.isArray(fm['source-workflow'])
    ? fm['source-workflow'].join(', ')
    : fm['source-workflow'];
  return renderSimple(artifact, ctx, {
    title: fm.title ?? 'Durable learning',
    lede: src ? escapeHtml(`from ${src}`) : '',
    metricFields: [
      { key: 'category', label: 'category', tone: 'info' },
      { key: 'status', label: 'status', tone: fm.status === 'superseded' ? 'warn' : 'ok' },
    ],
  });
}
