// Unit tests for the External Output Boundary leak lexicon (HOOKS-SEMANTIC
// Phase 1). The lexicon derives its internal roots from the canonical
// _output-boundary.md predicate; the pattern set must catch concrete workflow
// vocabulary while staying ~0-false-positive on plain product English (the
// graduation gate for enforce mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildLexicon, parseBoundaryRoots, scanText, formatFindings, BOUNDARY_PATH } from '../../../lib/leak-lexicon.mjs';

test('parseBoundaryRoots extracts roots from the predicate wording', () => {
  assert.deepEqual(
    parseBoundaryRoots('Any file under `.ai/**` or `.claude/**`.').sort(),
    ['.ai/', '.claude/'],
  );
  // The codex twin declares .codex/** instead — the lexicon follows the file.
  assert.deepEqual(
    parseBoundaryRoots('Any file under `.ai/**` or `.codex/**`.').sort(),
    ['.ai/', '.codex/'],
  );
  // Unreadable/empty predicate → safe defaults.
  assert.deepEqual(parseBoundaryRoots('').sort(), ['.ai/', '.claude/']);
});

test('buildLexicon reads the live canonical predicate file', () => {
  assert.ok(existsSync(BOUNDARY_PATH), 'canonical _output-boundary.md missing');
  const lexicon = buildLexicon();
  assert.ok(lexicon.roots.includes('.ai/'));
  assert.ok(lexicon.roots.includes('.claude/'));
  assert.ok(lexicon.patterns.length >= 5);
});

test('scanText catches concrete workflow vocabulary', () => {
  const lexicon = buildLexicon();
  const leaky =
    'Implements the fix from .ai/workflows/demo/06-verify-core.md after running ' +
    '/wf verify demo; see also 04-plan-core.yaml and the sdlc/v1 frontmatter ' +
    'written by wf-verify.';
  const kinds = new Set(scanText(leaky, lexicon).map((f) => f.kind));
  assert.ok(kinds.has('internal-path'), 'internal path not caught');
  assert.ok(kinds.has('wf-command'), '/wf command not caught');
  assert.ok(kinds.has('artifact-stem'), 'artifact stem not caught');
  assert.ok(kinds.has('schema-tag'), 'schema tag not caught');
  assert.ok(kinds.has('skill-token'), 'skill token not caught');
});

test('scanText stays silent on plain product English using stage-name words', () => {
  const lexicon = buildLexicon();
  const clean =
    'Ship the new review flow: the plan is to verify the design with users, ' +
    'implement the intake form, and close the docs gap. Status: on track. ' +
    'See docs/how-to/setup.md and README.md for details.';
  assert.deepEqual(scanText(clean, lexicon), []);
});

test('scanText dedupes repeated matches and formatFindings caps the list', () => {
  const lexicon = buildLexicon();
  const findings = scanText('.ai/x.md and .ai/x.md and .ai/y.md', lexicon);
  assert.equal(findings.length, 2);
  const summary = formatFindings(findings, { limit: 1 });
  assert.match(summary, /\+1 more/);
});
