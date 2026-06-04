// renderers/close-record.mjs — /wf-meta close closure record (99-close.md).
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Workflow closed',
  lede: (fm) => fm['superseded-by'] && fm['superseded-by'] !== 'n/a' ? `superseded by ${fm['superseded-by']}` : '',
  metricFields: [
    { key: 'close-reason', label: 'reason', tone: 'warn' },
    { key: 'last-stage-reached', label: 'last stage', tone: 'info' },
    { key: 'unmerged-commits', label: 'unmerged commits', tone: 'warn' },
  ],
});
