import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-XXUYOMF5.mjs";
import "../chunk-SHBLRTUO.mjs";
import "../chunk-QBSCHSFO.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

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
