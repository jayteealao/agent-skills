import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Risk register · ${ctx.slug}`,
    metricFields: [
      { key: 'risks-total', label: 'risks', tone: 'warn' },
      { key: 'risks-high', label: 'high', sev: 'high' },
      { key: 'risks-open', label: 'open', tone: 'warn' },
    ],
  });
}
