// renderers/dep-research.mjs — /wf-quick update-deps step 2 per-package research.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Deps · research',
  metricFields: [
    { key: 'packages-researched', label: 'researched', tone: 'info' },
    { key: 'packages-update-now', label: 'update now', tone: 'ok' },
    { key: 'packages-migration-needed', label: 'migration', tone: 'warn' },
    { key: 'packages-hold', label: 'hold', tone: 'warn' },
  ],
});
