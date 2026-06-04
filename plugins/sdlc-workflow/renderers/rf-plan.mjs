// renderers/rf-plan.mjs — /wf-quick refactor step plan.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Refactor · plan',
  metricFields: [
    { key: 'step-count', label: 'steps', tone: 'info' },
    { key: 'pattern-used', label: 'pattern', tone: 'info' },
    { key: 'api-surface-changes', label: 'api changes', tone: 'warn' },
  ],
});
