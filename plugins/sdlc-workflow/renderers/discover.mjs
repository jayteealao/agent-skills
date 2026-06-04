// renderers/discover.mjs — /wf-quick discover hypothesis-adjudication verdict.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Discovery',
  lede: (fm) => fm.hypothesis,
  metricFields: [
    { key: 'verdict', label: 'verdict', tone: 'info' },
    { key: 'confidence', label: 'confidence', tone: 'info' },
    { key: 'recommended-next', label: 'next', tone: 'info' },
  ],
});
