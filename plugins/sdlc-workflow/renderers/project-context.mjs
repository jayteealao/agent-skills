import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? projectTitle(artifact.path),
    lede: fm.source ? `source ${escapeHtml(fm.source)}` : '',
  });
}

function projectTitle(path) {
  if (String(path).endsWith('PRODUCT.md')) return 'Product context';
  if (String(path).endsWith('DESIGN.md')) return 'Design context';
  return 'Project context';
}
