import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Announcement · ${ctx.slug}`,
    metricFields: [
      { key: 'audiences-count', label: 'audiences', tone: 'info' },
      { key: 'channels-count', label: 'channels', tone: 'info' },
    ],
  });
}
