// renderers/ship.mjs — dispatch alias for `type: ship` artifacts.
//
// The orchestrator loads renderers/<frontmatter.type>.mjs. Live artifacts use
// `type: ship`, but the implementation lives in ship-legacy.mjs. Without this
// alias they fall through to the generic fallback renderer and lose the
// deprecation banner ship-legacy emits.
export { render } from './ship-legacy.mjs';
