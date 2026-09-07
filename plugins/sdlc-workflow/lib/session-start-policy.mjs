// lib/session-start-policy.mjs — what a SessionStart may do (WIDE-VIEW-REPAIR-PLAN
// §14.2.3, wave W11.3).
//
// Before this file every SessionStart in every directory created `.ai/_view`,
// enqueued a bootstrap render, and spawned hub-ensure — so a session opened in
// ~/Documents/dev, in a repository with no workflows, or on a context
// compaction left a `.ai/_view` directory and a queue record behind. The
// operator machine carried eight of them. The decision is pure so the guard
// tests run without spawning the hook.

/** Sources that earn a hub-ensure spawn. `clear` re-enqueues but does not spawn. */
export const HUB_ENSURE_SOURCES = Object.freeze(new Set(['startup', 'resume']));

/**
 * @param {object} o
 * @param {string|null} o.source           payload `source` (startup, resume, clear, compact) or null when the host sends none
 * @param {boolean}     o.hasWorkflows     `.ai/workflows` exists under the project root
 * @param {boolean}     o.insideGit        the project root is inside a git checkout
 * @param {boolean}     [o.bootstrapDisabled]  env or config switched bootstrap off
 * @param {boolean}     [o.ensureHubEnabled]   config allows the hub-ensure spawn
 * @returns {{enqueue:boolean, ensureHub:boolean, reason:string}}
 */
export function sessionStartDecision({
  source = null, hasWorkflows, insideGit, bootstrapDisabled = false, ensureHubEnabled = true,
} = {}) {
  if (bootstrapDisabled) return { enqueue: false, ensureHub: false, reason: 'bootstrap disabled' };
  if (source === 'compact') return { enqueue: false, ensureHub: false, reason: 'source compact' };
  if (!hasWorkflows) return { enqueue: false, ensureHub: false, reason: 'no .ai/workflows' };
  if (!insideGit) return { enqueue: false, ensureHub: false, reason: 'not inside a git checkout' };
  const ensureHub = ensureHubEnabled && (source == null || HUB_ENSURE_SOURCES.has(source));
  return { enqueue: true, ensureHub, reason: ensureHub ? 'session start' : `source ${source}: enqueue only` };
}
