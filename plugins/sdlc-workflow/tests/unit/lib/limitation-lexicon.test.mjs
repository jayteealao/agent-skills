// Unit coverage for the INTENT-FIDELITY W3.2/W9.3/W7.2 lint lexicon — the pure
// text→findings functions the post-write-verify / pre-write-validate hooks share.
// Testing the lexicon directly (not the hook) keeps the citation-adjacency, comment
// scoping, and mechanism-ownership rules pinned without spawning a hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findUncitedLimitationClaims,
  findUnmarkedSuppressions,
  findUnownedMechanisms,
  LIMITATION_RE, SUPPRESSION_RE, MECHANISM_RE,
} from '../../../lib/limitation-lexicon.mjs';

// ── limitation claims (W3.2) ────────────────────────────────────────────────
test('limitation: an uncited comment claim is flagged', () => {
  assert.equal(findUncitedLimitationClaims('// getWebRequest does not exist\nconst x = 1;').length, 1);
  assert.equal(findUncitedLimitationClaims('/* the fetch API is missing here */').length, 1);
});

test('limitation: a citation within +/-3 lines discharges the claim', () => {
  assert.equal(findUncitedLimitationClaims('// getWebRequest does not exist\n// source: node_modules/foo/index.d.ts').length, 0);
  assert.equal(findUncitedLimitationClaims('// repro: see failing test\n//\n//\n// this method does not exist').length, 0);
  assert.equal(findUncitedLimitationClaims('// does not expose getRequest\n// https://github.com/x/y/issues/42').length, 0);
});

test('limitation: prose (non-comment) does not trip the code lint', () => {
  assert.equal(findUncitedLimitationClaims('The sync engine does not exist in v1 by design.').length, 0);
});

test('limitation: distant citation does NOT discharge (window is +/-3)', () => {
  const src = '// getWebRequest does not exist\n1\n2\n3\n4\n// source: node_modules/foo';
  assert.equal(findUncitedLimitationClaims(src).length, 1);
});

// ── suppression debt (W9.3) ─────────────────────────────────────────────────
test('suppression: unmarked as any / ts-ignore / eslint-disable are flagged', () => {
  assert.equal(findUnmarkedSuppressions('const x = y as any;').length, 1);
  assert.equal(findUnmarkedSuppressions('// @ts-ignore\nfoo();').length, 1);
  assert.equal(findUnmarkedSuppressions('/* eslint-disable no-console */').length, 1);
  assert.equal(findUnmarkedSuppressions('x = y  # type: ignore').length, 1);
});

test('suppression: an sdlc-debt marker within +/-2 lines discharges it', () => {
  assert.equal(findUnmarkedSuppressions('const x = y as any; // sdlc-debt: upstream types wrong (issue #12)').length, 0);
  assert.equal(findUnmarkedSuppressions('// sdlc-debt: temporary\n//\n@ts-expect-error\nfoo();').length, 0);
});

// ── named mechanisms (W7.2) ─────────────────────────────────────────────────
test('mechanism: a machine named in an AC but not in the body is unowned', () => {
  assert.deepEqual(
    findUnownedMechanisms('AC-3: verified by interview state-machine unit tests', 'We chose a prompt suite.'),
    ['state-machine'],
  );
});

test('mechanism: a machine owned by a body decision is not flagged', () => {
  assert.deepEqual(
    findUnownedMechanisms('AC-3: state machine drives progression', 'Decision: an app-owned state machine owns control flow.'),
    [],
  );
});

test('mechanism: no mechanism noun ⇒ empty', () => {
  assert.deepEqual(findUnownedMechanisms('AC-1: the button is blue', 'It is a button.'), []);
});

// ── regexes exported for the hooks ──────────────────────────────────────────
test('exported regexes match their canonical tokens', () => {
  assert.match('does not exist', LIMITATION_RE);
  assert.match('as any', SUPPRESSION_RE);
  assert.match('@ts-ignore', SUPPRESSION_RE);
  assert.match('pipeline', MECHANISM_RE);
});
