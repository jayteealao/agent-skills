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

// renderers/rf-brief.mjs
var render = laneRenderer({
  title: "Refactor \xB7 brief",
  lede: (fm) => fm.goal,
  metricFields: [
    { key: "existing-coverage", label: "coverage", tone: "info" }
  ]
});
export {
  render
};
