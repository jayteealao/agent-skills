// renderers/hf-verify.mjs — /wf-quick hotfix verification result.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Hotfix · verify',
  metricFields: [
    { key: 'result', label: 'result', tone: 'info' },
    { key: 'symptom-confirmed-fixed', label: 'symptom fixed', tone: 'ok' },
    { key: 'tests-pass', label: 'tests', tone: 'info' },
  ],
});
