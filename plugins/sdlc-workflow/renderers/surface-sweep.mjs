// renderers/surface-sweep.mjs
// The slug-less probe sweep report (`.ai/surface-sweep-<date>.md`, written by
// `/wf probe sweep`). A project page: frontmatter card and the body. When the
// report has an explainer (`.ai/surface-sweep-<date>.explainer.html.fragment`),
// the orchestrator puts it at the top of the page and this output below it.

import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Surface sweep — ${fm['scope-path'] ?? 'repo root'}`,
    lede: fm['environment-class'] ? `environment ${escapeHtml(fm['environment-class'])}` : '',
    metricFields: [{ key: 'findings-count', label: 'findings' }],
  });
}
