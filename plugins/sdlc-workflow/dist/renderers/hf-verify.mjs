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

// renderers/hf-verify.mjs
var render = laneRenderer({
  title: "Hotfix \xB7 verify",
  metricFields: [
    { key: "result", label: "result", tone: "info" },
    { key: "symptom-confirmed-fixed", label: "symptom fixed", tone: "ok" },
    { key: "tests-pass", label: "tests", tone: "info" }
  ]
});
export {
  render
};
