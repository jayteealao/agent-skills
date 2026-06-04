// renderers/rf-baseline.mjs — /wf-quick refactor pre-change baseline snapshot.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Refactor · baseline',
  metricFields: [
    { key: 'tests-passing', label: 'passing', tone: 'ok' },
    { key: 'tests-failing', label: 'failing', tone: 'bad' },
    { key: 'tests-skipped', label: 'skipped', tone: 'info' },
    { key: 'caller-count', label: 'callers', tone: 'info' },
  ],
});
