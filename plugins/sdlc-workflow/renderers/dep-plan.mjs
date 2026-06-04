// renderers/dep-plan.mjs — /wf-quick update-deps step 3 tiered plan.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Deps · plan',
  metricFields: [
    { key: 'p0-count', label: 'P0 security', tone: 'bad' },
    { key: 'p1-count', label: 'P1 major', tone: 'warn' },
    { key: 'p2-count', label: 'P2 safe', tone: 'info' },
    { key: 'hold-count', label: 'hold', tone: 'info' },
  ],
});
