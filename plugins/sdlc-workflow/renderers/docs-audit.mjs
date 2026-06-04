// renderers/docs-audit.mjs — /wf-docs step 2 per-file audit.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Docs · audit',
  metricFields: [
    { key: 'files-audited', label: 'audited', tone: 'info' },
    { key: 'accuracy-issues', label: 'accuracy issues', tone: 'warn' },
    { key: 'quadrant-violations', label: 'quadrant issues', tone: 'warn' },
    { key: 'gaps-found', label: 'gaps', tone: 'warn' },
  ],
});
