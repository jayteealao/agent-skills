// renderers/investigate.mjs — /wf-quick investigate option sketches.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Investigation',
  lede: (fm) => fm['problem-statement'],
  metricFields: [
    { key: 'option-count', label: 'options', tone: 'info' },
  ],
});
