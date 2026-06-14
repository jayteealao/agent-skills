import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-7DOGBY6G.mjs";
import "../chunk-5NE4YMCZ.mjs";
import "../chunk-PMTY73GW.mjs";
import "../chunk-GZJHNQLO.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

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
