import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-G2ZSY6WC.mjs";
import "../chunk-6F3J7CCL.mjs";
import "../chunk-VGNHSPZH.mjs";
import "../chunk-6MTQED5X.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/rf-baseline.mjs
var render = laneRenderer({
  title: "Refactor \xB7 baseline",
  metricFields: [
    { key: "tests-passing", label: "passing", tone: "ok" },
    { key: "tests-failing", label: "failing", tone: "bad" },
    { key: "tests-skipped", label: "skipped", tone: "info" },
    { key: "caller-count", label: "callers", tone: "info" }
  ]
});
export {
  render
};
