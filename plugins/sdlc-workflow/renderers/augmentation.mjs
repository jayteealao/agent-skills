// renderers/augmentation.mjs — transition dispatcher for augmentation subtypes.
//
// Concrete renderers now live at benchmark.mjs, experiment.mjs, instrument.mjs,
// and rca.mjs. This file keeps existing `type: augmentation` artifacts working
// while producers migrate toward concrete renderer ownership.

import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';
import { render as renderBenchmark } from './benchmark.mjs';
import { render as renderExperiment } from './experiment.mjs';
import { render as renderInstrument } from './instrument.mjs';
import { render as renderRca } from './rca.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const type = fm['augmentation-type'] ?? fm.augmentation_type ?? artifact.siblingYaml?.artifact ?? null;

  if (type === 'benchmark') return renderBenchmark(artifact, ctx);
  if (type === 'experiment') return renderExperiment(artifact, ctx);
  if (type === 'instrument') return renderInstrument(artifact, ctx);
  if (type === 'rca') return renderRca(artifact, ctx);

  return renderSimple(artifact, ctx, {
    title: `Augmentation · ${escapeHtml(type ?? fm.title ?? '')}`,
  });
}
