// renderers/dep-implement.mjs — /wf-quick update-deps step 4 update log.
// `updated`/`blocked` are arrays; the frontmatter card lists them in full, so the
// metric row just surfaces their counts via the body card.
import { laneRenderer } from './_lane.mjs';

export const render = laneRenderer({
  title: 'Deps · implement',
});
