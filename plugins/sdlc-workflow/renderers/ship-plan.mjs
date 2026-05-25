import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? 'Ship plan',
    lede: fm.source ? `source ${fm.source}` : '',
  });
}
