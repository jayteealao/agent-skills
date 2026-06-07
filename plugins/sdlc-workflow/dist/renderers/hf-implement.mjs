import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-WX6YPCVZ.mjs";
import "../chunk-UV62IXF2.mjs";
import "../chunk-LNLILMTK.mjs";
import "../chunk-ASUVWO6I.mjs";
import "../chunk-LFGT2BKG.mjs";
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
