import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-5NE4YMCZ.mjs";
import "../chunk-PMTY73GW.mjs";
import "../chunk-GZJHNQLO.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/announce.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? `Announcement \xB7 ${ctx.slug}`,
    metricFields: [
      { key: "audiences-count", label: "audiences", tone: "info" },
      { key: "channels-count", label: "channels", tone: "info" }
    ]
  });
}
export {
  render
};
