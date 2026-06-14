import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-3DEOZV6T.mjs";
import "../chunk-YHPMVBRM.mjs";
import "../chunk-WB3CNU66.mjs";
import "../chunk-OOUZYKHP.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/dep-scan.mjs
var render = laneRenderer({
  title: "Deps \xB7 scan",
  metricFields: [
    { key: "total-deps", label: "total", tone: "info" },
    { key: "outdated-count", label: "outdated", tone: "warn" },
    { key: "vulnerable-count", label: "vulnerable", tone: "bad" }
  ]
});
export {
  render
};
