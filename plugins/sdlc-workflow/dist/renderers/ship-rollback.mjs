import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-BHUAUYVV.mjs";
import "../chunk-V35JPU6V.mjs";
import "../chunk-T5KRRFZB.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-EQC6XDOG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/ship-rollback.mjs
var STATUS_TONE = { complete: "ok", failed: "bad", aborted: "bad", "awaiting-input": "warn" };
var VERIFY_TONE = { pass: "ok", fail: "bad", skipped: "warn" };
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? "Ship rollback",
    lede: fm.reason ? escapeHtml(String(fm.reason)) : "",
    metricFields: [
      { key: "run-id", label: "reverses run", tone: "info" },
      { key: "go-nogo", label: "decision", tone: fm["go-nogo"] === "no-go" ? "bad" : "ok" },
      { key: "status", label: "status", tone: STATUS_TONE[fm.status] ?? "info" },
      { key: "rollback-verify-result", label: "verify", tone: VERIFY_TONE[fm["rollback-verify-result"]] ?? "info" },
      { key: "steps-executed", label: "steps executed", tone: "info" },
      { key: "steps-irreversible", label: "irreversible", tone: Number(fm["steps-irreversible"]) > 0 ? "warn" : "ok" }
    ]
  });
}
export {
  render
};
