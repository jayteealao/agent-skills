import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-3DEOZV6T.mjs";
import "../chunk-YHPMVBRM.mjs";
import "../chunk-WB3CNU66.mjs";
import "../chunk-OOUZYKHP.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

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
