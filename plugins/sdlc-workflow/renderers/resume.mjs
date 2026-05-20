// renderers/resume.mjs — regenerable session-resume artifact
import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';
export function render(artifact, ctx) {
  const result = renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Resume' });
  // Prepend a regenerable badge
  const badge = `<aside class="warn-banner" role="status"><strong>regenerable</strong> — this artifact is rewritten by automation; edits don't persist.</aside>`;
  return { ...result, bodyHtml: badge + result.bodyHtml };
}
