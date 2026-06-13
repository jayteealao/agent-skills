import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-VQKLE73K.mjs";
import "../chunk-7HCDUW4D.mjs";
import "../chunk-MVFNADH4.mjs";
import "../chunk-DWQ5ETI7.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/rf-verify.mjs
var render = laneRenderer({
  title: "Refactor \xB7 verify",
  metricFields: [
    { key: "result", label: "result", tone: "info" },
    { key: "baseline-tests-pass", label: "baseline pass", tone: "info" },
    { key: "post-refactor-tests-pass", label: "post pass", tone: "ok" },
    { key: "api-surface-identical", label: "api identical", tone: "ok" }
  ]
});
export {
  render
};
