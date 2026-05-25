import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Estimate · ${ctx.slug}`,
    metricFields: [
      { key: 'estimate-points', label: 'points', tone: 'info' },
      { key: 'confidence', label: 'confidence', tone: 'info' },
      { key: 'uncertainty-count', label: 'uncertainties', tone: 'warn' },
    ],
  });
}
