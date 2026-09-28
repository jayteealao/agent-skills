import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-N4FWWIMJ.mjs";
import "../chunk-YVS5HJJI.mjs";
import "../chunk-M4L3PWUR.mjs";
import "../chunk-U4XWDSQ3.mjs";
import "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/close-record.mjs
var render = laneRenderer({
  title: "Workflow closed",
  lede: (fm) => fm["superseded-by"] && fm["superseded-by"] !== "n/a" ? `superseded by ${fm["superseded-by"]}` : "",
  metricFields: [
    { key: "close-reason", label: "reason", tone: "warn" },
    { key: "last-stage-reached", label: "last stage", tone: "info" },
    { key: "unmerged-commits", label: "unmerged commits", tone: "warn" }
  ]
});
export {
  render
};
