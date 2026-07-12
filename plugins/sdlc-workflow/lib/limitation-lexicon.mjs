/**
 * Limitation / suppression / named-mechanism lexicon (INTENT-FIDELITY W3.2 / W9.3 / W7.2).
 *
 * Three advisory (warn-only) lints share this module so the two hook entrypoints
 * (pre-write-validate on code files, post-write-verify on artifacts) can never
 * disagree about what counts as a limitation claim, an unmarked suppression, or an
 * unowned mechanism:
 *
 *   1. Limitation claims (W3.2). A comment asserting a dependency capability
 *      "does not exist / is not exposed / was removed" is a HYPOTHESIS, not
 *      authority — it needs a citation (a `study-sources` read, a repro, an issue,
 *      a URL) within ±3 lines. The waypoint failure: a stale "getWebRequest() does
 *      not exist" comment mirrored into new code minutes after a grep printed it.
 *   2. Suppression debt (W9.3). A new `as any` / `@ts-ignore` / `eslint-disable`
 *      (and language equivalents) needs an `sdlc-debt:` marker within ±2 lines so
 *      the existing debt lifecycle (verify validates, retro reconciles, simplify
 *      sweeps) inherits the whole class for free.
 *   3. Named mechanisms (W7.2). A mechanism-suggesting noun in an AC / verification
 *      line that appears in NO decision section of the artifact body is a design
 *      decision smuggled past adjudication.
 *
 * Every function is PURE (text in, findings out) so the hook logic is unit-testable
 * without spawning a hook. Line numbers are 1-indexed.
 */

// ── Limitation claims (W3.2) ────────────────────────────────────────────────
export const LIMITATION_RE =
  /does not (exist|ship|expose)|is(n'?t| not) (available|exposed|supported)|no longer (exists|available|exposed|supported)|(API|method|function|field|prop(?:erty)?) is missing|not (?:a )?(?:real|valid) (?:API|method|export)|was removed (?:from|in)\b/i;

// Citation markers that discharge a limitation claim (a recorded ground truth).
export const CITATION_MARKER_RE =
  /source:|node_modules\/|\brepro:|\bissue:\s*#?\d|https?:\/\/|study-sources|\.d\.ts\b/i;

// ── Suppression debt (W9.3) ─────────────────────────────────────────────────
// TS/JS: as any, @ts-ignore, @ts-expect-error, eslint-disable. Python: # type: ignore,
// # noqa. Java/Kotlin: @SuppressWarnings. C#: #pragma warning disable. Go: //nolint.
export const SUPPRESSION_RE =
  /\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable|#\s*type:\s*ignore|#\s*noqa|@SuppressWarnings|#pragma warning disable|\/\/\s*nolint|@Suppress\b/;
export const DEBT_MARKER_RE = /sdlc-debt:/i;

// ── Named mechanisms (W7.2) ─────────────────────────────────────────────────
export const MECHANISM_RE =
  /\b(state[- ]machine|scheduler|queue|cache|pipeline|orchestrator|regex)\b/i;

/** Split into lines once; callers pass the array to the adjacency check. */
function lines(text) {
  return String(text ?? '').split(/\r?\n/);
}

/** True iff `marker` matches any line in the inclusive window [i-window, i+window]. */
function markerWithin(ls, i, window, marker) {
  const lo = Math.max(0, i - window), hi = Math.min(ls.length - 1, i + window);
  for (let j = lo; j <= hi; j++) if (marker.test(ls[j])) return true;
  return false;
}

/**
 * Limitation claims with no citation within ±3 lines (W3.2). `onlyComments` (default
 * true) restricts matches to lines that look like a code comment, so prose docs and
 * string literals don't trip the code-file lint. Returns [{ line, text }].
 */
export function findUncitedLimitationClaims(text, { onlyComments = true } = {}) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (!LIMITATION_RE.test(line)) continue;
    if (onlyComments && !/^\s*(\/\/|\/\*|\*|#|<!--|--)/.test(line) && !/\/\/|\/\*|#\s|<!--/.test(line)) continue;
    if (markerWithin(ls, i, 3, CITATION_MARKER_RE)) continue;
    out.push({ line: i + 1, text: line.trim().slice(0, 200) });
  }
  return out;
}

/**
 * New suppressions with no `sdlc-debt:` marker within ±2 lines (W9.3).
 * Returns [{ line, text }].
 */
export function findUnmarkedSuppressions(text) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (!SUPPRESSION_RE.test(ls[i])) continue;
    if (markerWithin(ls, i, 2, DEBT_MARKER_RE)) continue;
    out.push({ line: i + 1, text: ls[i].trim().slice(0, 200) });
  }
  return out;
}

/**
 * Mechanism nouns that appear in an AC / verification line but in no decision
 * section of the body (W7.2). `acText` is the AC/verification region; `decisionText`
 * is the body's decision prose. Returns the deduped list of unowned mechanism nouns.
 */
export function findUnownedMechanisms(acText, decisionText) {
  const found = new Set();
  const dt = String(decisionText ?? '').toLowerCase();
  for (const line of lines(acText)) {
    let m;
    const re = new RegExp(MECHANISM_RE.source, 'ig');
    while ((m = re.exec(line))) {
      const noun = m[1].toLowerCase().replace(/[- ]/g, ' ');
      // "owned" iff the decision text mentions the mechanism noun at all.
      if (!dt.includes(noun) && !dt.includes(noun.replace(' ', '-')) && !dt.includes(noun.replace(' ', ''))) {
        found.add(m[1].toLowerCase());
      }
    }
  }
  return [...found];
}
