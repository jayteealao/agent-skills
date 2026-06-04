// renderers/docs-generate.mjs — /wf-docs step 4 generation log.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Docs · generate',
  metricFields: [
    { key: 'actions-completed', label: 'completed', tone: 'ok' },
    { key: 'actions-skipped', label: 'skipped', tone: 'info' },
  ],
});
