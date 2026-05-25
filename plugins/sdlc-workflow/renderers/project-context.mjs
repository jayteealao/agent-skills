import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? projectTitle(artifact.path),
    lede: fm.source ? `source ${fm.source}` : '',
  });
}

function projectTitle(path) {
  if (String(path).endsWith('PRODUCT.md')) return 'Product context';
  if (String(path).endsWith('DESIGN.md')) return 'Design context';
  return 'Project context';
}
