// renderers/hf-implement.mjs — /wf-quick hotfix implementation record.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Hotfix · implement',
  metricFields: [
    { key: 'lines-changed', label: 'lines changed', tone: 'info' },
    { key: 'test-result', label: 'tests', tone: 'info' },
    { key: 'commit-sha', label: 'commit', tone: 'info' },
  ],
});
