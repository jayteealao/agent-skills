// renderers/observability-build.mjs — .ai/observability-build.md, the run
// record written by /wf observability build when it realizes the contract.
// Sibling of observability-plan.mjs; same titled-simple-page shape.
import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const planV = fm['plan-version-at-run'] ? `realizes plan v${fm['plan-version-at-run']}` : '';
  const backend = fm.backend ? `backend ${escapeHtml(fm.backend)}` : '';
  return renderSimple(artifact, ctx, {
    title: fm.title ?? 'Observability build',
    lede: [planV, backend].filter(Boolean).join(' · '),
  });
}
