import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-2UKTWYFF.mjs";
import "../chunk-4NXBU6PL.mjs";
import "../chunk-GMBXSSP4.mjs";
import "../chunk-LZJF4RCQ.mjs";
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
