// renderers/hf-brief.mjs — /wf-quick hotfix incident brief.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Hotfix · brief',
  lede: (fm) => fm.symptom,
  metricFields: [
    { key: 'impact', label: 'impact', tone: 'warn' },
    { key: 'affected-scope', label: 'scope', tone: 'info' },
  ],
});
