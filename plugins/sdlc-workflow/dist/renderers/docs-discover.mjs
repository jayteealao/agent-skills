import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-RSMWNTMS.mjs";
import "../chunk-LNEBA2PL.mjs";
import "../chunk-M6CLINUL.mjs";
import "../chunk-MTP3SXLH.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/docs-discover.mjs
var render = laneRenderer({
  title: "Docs \xB7 discover",
  lede: (fm) => fm.scope,
  metricFields: [
    { key: "doc-files-found", label: "docs found", tone: "info" },
    { key: "gaps-found", label: "gaps", tone: "warn" },
    { key: "has-docs-folder", label: "docs folder", tone: "info" }
  ]
});
export {
  render
};
