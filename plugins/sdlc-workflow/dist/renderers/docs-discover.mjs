import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-F274WY7Z.mjs";
import "../chunk-7ET6WARA.mjs";
import "../chunk-64CJF4MS.mjs";
import "../chunk-CCRPAYHH.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-EQC6XDOG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
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
