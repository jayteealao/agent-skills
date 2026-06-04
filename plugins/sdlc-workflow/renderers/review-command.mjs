// renderers/review-command.mjs
//
// Dispatch entry for the live `type: review-command` frontmatter — the type the
// review command still emits (see resolveViewPath FLAT_REVIEW_RE / REVIEW_RE).
// The focused per-dimension projection itself lives in review-dimension.mjs;
// this module re-exports it so `loadRenderer('review-command')` resolves.
//
// @deprecated in NAME only — retained because `review-command` is still the
// emitted frontmatter type, so this module is load-bearing, NOT dead code.
// Removal is gated on the producer migrating to `type: review-dimension`
// (target: the next major, v10.0.0); deleting it before then breaks rendering
// of every review-dimension artifact. The sunflower + gap-closure suites assert
// the alias stays byte-identical to the delegate.
export { render } from './review-dimension.mjs';
