// renderers/fix-plan.mjs — /wf-quick fix compressed brief+shape+plan.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Quick fix',
  lede: (fm) => fm.intent,
  metricFields: [
    { key: 'estimated-steps', label: 'steps', tone: 'info' },
  ],
});
