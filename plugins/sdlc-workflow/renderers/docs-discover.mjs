// renderers/docs-discover.mjs — /wf-docs step 1 inventory.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Docs · discover',
  lede: (fm) => fm.scope,
  metricFields: [
    { key: 'doc-files-found', label: 'docs found', tone: 'info' },
    { key: 'gaps-found', label: 'gaps', tone: 'warn' },
    { key: 'has-docs-folder', label: 'docs folder', tone: 'info' },
  ],
});
