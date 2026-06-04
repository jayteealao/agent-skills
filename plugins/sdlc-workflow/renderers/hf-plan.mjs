// renderers/hf-plan.mjs — /wf-quick hotfix execution plan.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Hotfix · plan',
  metricFields: [
    { key: 'step-count', label: 'steps', tone: 'info' },
    { key: 'data-remediation-needed', label: 'data remediation', tone: 'warn' },
  ],
});
