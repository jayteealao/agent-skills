// renderers/design.mjs — design artifact (calm-reader UX/typography/spacing).
// When a sibling .yaml + .html.fragment land, the renderer hands off to the
// fragment (24-cell swatch matrix + token table + annotated specs SVG).

import { renderSimple } from './_simple.mjs';
export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Design' });
}
