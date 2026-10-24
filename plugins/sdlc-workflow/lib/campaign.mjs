// lib/campaign.mjs — the pure helpers that outlive the wave campaign (WF-PIECES-PLAN 6.5).
// The wave driver, the ledger and the dependency graph are gone; the walk's disk side is
// scripts/campaign.mjs over lib/packets.mjs. scripts/stage-yolo-driver.mjs still reads the
// stage models of a project from here.

/** WF-SYSTEM-REVIEW C1: the stages whose model the project sets in `models` of `.ai/sdlc-config.json`. */
export const MODEL_STAGES = Object.freeze(['plan', 'implement', 'verify', 'review', 'update-deps']);

/**
 * C1 (SQ1): the `models` block of a project config, kept to the known stages and
 * the models a stage may use. A stage that is not named runs on Opus, the default.
 */
export function modelsOf(cfg) {
  const m = cfg?.models;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  return Object.fromEntries(MODEL_STAGES.filter((s) => ['opus', 'sonnet'].includes(m[s])).map((s) => [s, m[s]]));
}
