import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-ROVMXBFT.mjs";
import "../chunk-QE5TEMRX.mjs";
import "../chunk-LYWZLVEZ.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/verify.mjs
function render(artifact, ctx) {
  return renderSimple(artifact, ctx, {
    title: `Verify \xB7 ${artifact.frontmatter?.["slice-slug"] ?? ""}`,
    metricFields: [
      { key: "metric-test-count", label: "tests" },
      { key: "metric-pass-count", label: "passing", tone: "ok" },
      { key: "metric-fail-count", label: "failing", tone: "bad" }
    ]
  });
}
export {
  render
};
