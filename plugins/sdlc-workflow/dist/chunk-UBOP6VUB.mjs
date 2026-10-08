import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  needsPictures
} from "./chunk-5QUQXL7Q.mjs";

// lib/design-lane.mjs
var UX_IMPACT_VALUES = Object.freeze(["none", "visual", "flow", "new-surface"]);
var NEEDS_DESIGN = /* @__PURE__ */ new Set(["visual", "flow", "new-surface"]);
function designNeeded(index, hasBrief) {
  const impact = index?.["ux-impact"];
  if (impact !== void 0 && impact !== null && impact !== "") {
    return NEEDS_DESIGN.has(String(impact).trim());
  }
  return Boolean(hasBrief);
}
function imageGateResolved(value) {
  const v = String(value ?? "").trim();
  if (v === "pass") return true;
  return /^skipped:\s*\S/.test(v);
}
function designReopened(index) {
  const progress = index?.progress;
  return Boolean(progress && typeof progress === "object" && progress.design === "in-progress");
}
function designSettled(index, contract, missingBoards = null) {
  if (designReopened(index)) return false;
  const progress = index?.progress;
  if (progress && typeof progress === "object" && progress.design === "skipped" && String(index?.["design-skip-reason"] ?? "").trim()) {
    return true;
  }
  if (!contract) return false;
  if (!imageGateResolved(contract["image-gate"])) return false;
  if (String(contract["direction-confirmed-by"] ?? "").trim() === "") return false;
  return !boardsMissing(index, contract, missingBoards);
}
function boardsMissing(index, contract, missingBoards) {
  if (!String(contract?.boards ?? "").trim()) return false;
  if (!needsPictures(index)) return false;
  return Array.isArray(missingBoards) && missingBoards.length > 0;
}
function isPlanArtifact(storageRel) {
  return /^04-plan(?:-[^/]+)?\.md$/.test(String(storageRel ?? ""));
}
function planSliceOf(storageRel) {
  const m = /^04-plan-([^/]+)\.md$/.exec(String(storageRel ?? ""));
  return m ? m[1] : null;
}
function sliceHasNoUx(slice) {
  return String(slice?.["ux-impact"] ?? "").trim() === "none";
}
function designGateRefusal({ index, hasBrief, contract, slug, slice = null, sliceSlug = null, missingBoards = null }) {
  if (!index) return null;
  if (!designNeeded(index, hasBrief)) return null;
  if (sliceHasNoUx(slice)) return null;
  if (designSettled(index, contract, missingBoards)) return null;
  const reopened = designReopened(index) && contract;
  const shown = (missingBoards ?? []).slice(0, 5).join(", ");
  const more = (missingBoards?.length ?? 0) > 5 ? ` and ${missingBoards.length - 5} more` : "";
  const why = reopened ? "the design is reopened (progress.design: in-progress)" : !contract ? "02c-craft.md is missing" : boardsMissing(index, contract, missingBoards) ? `the confirmed boards are not on disk: ${shown}${more}. Run the board check (design-boards check ${slug})` : "02c-craft.md exists but carries no resolved image-gate or no direction-confirmed-by";
  const route = reopened ? `/wf design ${slug} amend` : `/wf design ${slug}`;
  const sliceHint = sliceSlug ? ` When slice '${sliceSlug}' changes nothing a person sees, set \`ux-impact: none\` in 03-slice-${sliceSlug}.md instead.` : "";
  return `Design is needed for '${slug}' (ux-impact: ${index["ux-impact"] ?? "unset; 02b-design.md exists"}) but not settled: ${why}. A person confirms the design before planning. Run ${route}.${sliceHint} (Opt out: hooks.designDirectionGate: false.)`;
}

export {
  designNeeded,
  designSettled,
  isPlanArtifact,
  planSliceOf,
  designGateRefusal
};
