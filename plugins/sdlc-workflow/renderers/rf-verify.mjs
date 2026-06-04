// renderers/rf-verify.mjs — /wf-quick refactor parity verification.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Refactor · verify',
  metricFields: [
    { key: 'result', label: 'result', tone: 'info' },
    { key: 'baseline-tests-pass', label: 'baseline pass', tone: 'info' },
    { key: 'post-refactor-tests-pass', label: 'post pass', tone: 'ok' },
    { key: 'api-surface-identical', label: 'api identical', tone: 'ok' },
  ],
});
