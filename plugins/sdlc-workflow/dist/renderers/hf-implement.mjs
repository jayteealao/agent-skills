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

// renderers/hf-implement.mjs
var render = laneRenderer({
  title: "Hotfix \xB7 implement",
  metricFields: [
    { key: "lines-changed", label: "lines changed", tone: "info" },
    { key: "test-result", label: "tests", tone: "info" },
    { key: "commit-sha", label: "commit", tone: "info" }
  ]
});
export {
  render
};
