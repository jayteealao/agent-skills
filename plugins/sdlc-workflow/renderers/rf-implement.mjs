// renderers/rf-implement.mjs — /wf-quick refactor implementation log.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Refactor · implement',
  metricFields: [
    { key: 'steps-completed', label: 'completed', tone: 'ok' },
    { key: 'steps-failed', label: 'failed', tone: 'bad' },
    { key: 'api-surface-changed', label: 'api changed', tone: 'warn' },
  ],
});
