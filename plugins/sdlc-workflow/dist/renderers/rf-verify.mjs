import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-VTSIYY3H.mjs";
import "../chunk-JR76U6AX.mjs";
import "../chunk-GHAL7GD5.mjs";
import "../chunk-KVPDAGUS.mjs";
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
