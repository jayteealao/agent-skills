// renderers/docs-plan.mjs — /wf-docs step 3 prioritized action plan.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Docs · plan',
  metricFields: [
    { key: 'total-actions', label: 'actions', tone: 'info' },
    { key: 'p0-count', label: 'P0', tone: 'bad' },
    { key: 'p1-count', label: 'P1', tone: 'warn' },
    { key: 'audit-only', label: 'audit only', tone: 'info' },
  ],
});
