// renderers/dep-scan.mjs — /wf-quick update-deps step 1 inventory.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Deps · scan',
  metricFields: [
    { key: 'total-deps', label: 'total', tone: 'info' },
    { key: 'outdated-count', label: 'outdated', tone: 'warn' },
    { key: 'vulnerable-count', label: 'vulnerable', tone: 'bad' },
  ],
});
