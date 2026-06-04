// renderers/rf-brief.mjs — /wf-quick refactor brief.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Refactor · brief',
  lede: (fm) => fm.goal,
  metricFields: [
    { key: 'existing-coverage', label: 'coverage', tone: 'info' },
  ],
});
