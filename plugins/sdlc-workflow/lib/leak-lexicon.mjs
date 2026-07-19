/**
 * Internal-vocabulary lexicon for the External Output Boundary leak guards
 * (HOOKS-SEMANTIC Phase 1, hooks #1–#3).
 *
 * The path roots are derived FROM the canonical
 * skills/wf/reference/_output-boundary.md predicate, so the prose rule and the
 * hooks can never disagree about what counts as internal — adding a root to the
 * predicate file automatically extends the lexicon. The vocabulary patterns are
 * the concrete, low-false-positive tokens of that predicate: internal paths,
 * `/wf <key>` command strings, `wf-<stage>` skill tokens, NN-stage artifact
 * stems, and the sdlc/v1 schema tag. Bare English words that happen to be stage
 * names ("plan", "review", "ship") are deliberately NOT matched — the
 * graduation gate for enforce mode requires a ~0 false-positive rate.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BOUNDARY_PATH = resolve(
  __dirname, '..', 'skills', 'wf', 'reference', '_output-boundary.md',
);
const DEFAULT_ROOTS = ['.ai/', '.claude/'];

// The 20 live /wf keys + retired skill suffixes that may still leak from
// prompts or old artifacts.
const WF_KEYS =
  'intake|shape|slice|plan|implement|verify|review|handoff|ship-plan|ship|retro|' +
  'design|probe|simplify|auto|yolo|status|recap|close|docs';
const SKILL_SUFFIXES = `${WF_KEYS}|meta|quick|next|resume|amend|extend|announce`;
// Stage tokens that appear in NN-stage artifact stems (06-verify-core.md, 02b-design.md…).
const STAGE_NAMES =
  'intake|quick|shape|design|craft|slice|plan|implement|verify|review|handoff|' +
  'ship-run|ship-runs|ship|rollback|retro|recap|resume|rca|investigate|fix|hotfix|' +
  'refactor|instrument|experiment|benchmark|close|index|docs';

/** Extract the internal roots (`.ai/**`, `.claude/**` / `.codex/**`) from the predicate text. */
export function parseBoundaryRoots(text) {
  const roots = new Set();
  const re = /`\.([a-z][\w-]*)\/\*\*`/g;
  let m;
  while ((m = re.exec(String(text ?? '')))) roots.add(`.${m[1]}/`);
  return roots.size ? [...roots] : [...DEFAULT_ROOTS];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildLexicon({ boundaryPath = BOUNDARY_PATH } = {}) {
  let text = '';
  try {
    text = readFileSync(boundaryPath, 'utf8');
  } catch {
    // Predicate file unreadable (unusual install layout) — fall back to the
    // default roots so the guard still covers the invariant part.
  }
  const roots = parseBoundaryRoots(text);
  const rootAlt = roots.map(escapeRe).join('|');
  return {
    roots,
    patterns: [
      // A concrete internal path: .ai/workflows/foo/06-verify.md, .claude/settings…
      { kind: 'internal-path', re: new RegExp(`(?:^|[^\\w./\\\\-])((?:${rootAlt})[\\w./-]+)`, 'g') },
      // A workflow command string: "/wf verify", "/wf ship-plan init".
      { kind: 'wf-command', re: new RegExp(`(?:^|[^\\w])(/wf\\s+(?:${WF_KEYS})\\b)`, 'g') },
      // A skill/stage token: wf-verify, wf-meta.
      { kind: 'skill-token', re: new RegExp(`\\b(wf-(?:${SKILL_SUFFIXES}))\\b`, 'g') },
      // A stage-artifact stem: 06-verify-core.md, 02b-design.yaml, 09-rollback-….md.
      {
        kind: 'artifact-stem',
        re: new RegExp(
          `\\b(\\d{2}[a-z]?-(?:${STAGE_NAMES})(?:-[\\w-]+)?\\.(?:md|yaml|html\\.fragment))\\b`,
          'g',
        ),
      },
      // The artifact schema tag.
      { kind: 'schema-tag', re: /\b(sdlc\/v1)\b/g },
    ],
  };
}

/**
 * Scan a text for lexicon matches. Returns deduped findings
 * [{ kind, match, index }] — empty array when the text is clean.
 */
export function scanText(text, lexicon = buildLexicon()) {
  const findings = [];
  const seen = new Set();
  const s = String(text ?? '');
  for (const { kind, re } of lexicon.patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const match = m[1] ?? m[0];
      const key = `${kind}:${match}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({ kind, match, index: m.index });
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return findings;
}

/** One-line advisory summary for hook output. */
export function formatFindings(findings, { limit = 5 } = {}) {
  const shown = findings.slice(0, limit).map((f) => `\`${f.match}\` (${f.kind})`);
  const more = findings.length > limit ? ` (+${findings.length - limit} more)` : '';
  return shown.join(', ') + more;
}
