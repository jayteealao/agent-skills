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

// renderers/rf-plan.mjs
var render = laneRenderer({
  title: "Refactor \xB7 plan",
  metricFields: [
    { key: "step-count", label: "steps", tone: "info" },
    { key: "pattern-used", label: "pattern", tone: "info" },
    { key: "api-surface-changes", label: "api changes", tone: "warn" }
  ]
});
export {
  render
};
