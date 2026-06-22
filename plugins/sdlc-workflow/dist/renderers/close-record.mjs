import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-UT5UESQ2.mjs";
import "../chunk-GPRHP2YJ.mjs";
import "../chunk-43DNF3XR.mjs";
import "../chunk-O3755V4W.mjs";
import "../chunk-4WRIEOIP.mjs";
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
