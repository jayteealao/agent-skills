// renderers/_lane.mjs
//
// Shared factory for the lightweight "lane" artifact types (wf-quick / wf-meta /
// wf-docs / update-deps steps) whose page is just: frontmatter card + a promoted
// metric row + the markdown body. Wraps renderSimple with a per-type
// title/lede/metricFields config so ~20 lane renderers don't each re-copy (and
// drift from) the renderSimple boilerplate. Richer lanes (e.g. ideation) skip
// this and render bespoke.
//
// title/lede may be a string or a (frontmatter, ctx) => string function. The
// title is escaped by renderSimple; the lede is escaped here.

import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function laneRenderer({ title, lede, metricFields = [] } = {}) {
  return function render(artifact, ctx) {
    const fm = artifact.frontmatter ?? {};
    const resolvedTitle = typeof title === 'function' ? title(fm, ctx) : (fm.title ?? title);
    const rawLede = typeof lede === 'function' ? lede(fm, ctx) : lede;
    return renderSimple(artifact, ctx, {
      title: resolvedTitle,
      lede: rawLede ? escapeHtml(String(rawLede)) : '',
      metricFields,
    });
  };
}
