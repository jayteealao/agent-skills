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

// renderers/docs-generate.mjs
var render = laneRenderer({
  title: "Docs \xB7 generate",
  metricFields: [
    { key: "actions-completed", label: "completed", tone: "ok" },
    { key: "actions-skipped", label: "skipped", tone: "info" }
  ]
});
export {
  render
};
