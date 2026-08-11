// renderers/observability-plan.mjs — .ai/observability.md, the project-level
// observability contract authored by /wf observability init. Same shape as the
// ship-plan renderer: a titled simple page (the contract body is the content;
// the frontmatter blocks render as structured sections via renderSimple).
import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const version = fm['plan-version'] ? `plan v${fm['plan-version']}` : '';
  const project = fm['project-name'] ? escapeHtml(fm['project-name']) : '';
  return renderSimple(artifact, ctx, {
    title: fm.title ?? 'Observability plan',
    lede: [project, version].filter(Boolean).join(' · '),
  });
}
