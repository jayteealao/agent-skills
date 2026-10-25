#!/usr/bin/env node
/**
 * PostToolUse deep validator for .ai/workflows/ artifacts:
 * - Skip when no artifact markdown path is present.
 * - Validate markdown under .ai/workflows/, .ai/simplify/, and .ai/profiles/.
 * - Skip paths that do not exist on disk.
 * - Exempt the po-answers.md prose log (see isProseLogPath) and the
 *   probe-evidence/ + verify-evidence/ folders (see isEvidencePath).
 * - Lint 00-index.md (warn only, never blocks): over 20 KB, YAML comment prose
 *   in the frontmatter, `current-stage:` outside the first 4000 characters.
 * - Run deep schema validation against schemas/frontmatter.schema.json (native Ajv).
 * - Silent exit 0 on success.
 * - Exit 2 + stderr when validation fails.
 *
 * Exports `run(input)` for the folded `post-tool-use-all` entry (WIDE-VIEW
 * §14.2.6). A check refuses a write with refuseWrite(), as the checks mode says; the
 * standalone entry below stays one release.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksModeOf, loadConfig } from '../lib/config.mjs';
import { logError } from '../lib/error-log.mjs';
import { isEntry, refuseWrite, runStandalone } from '../lib/hook-runner.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { frontmatterOfDoc } from '../lib/records.mjs';
import { workflowDirOf } from '../lib/records-root.mjs';
import { validateBrainstormBoardFile, validateFrontmatterFile, validatePrototypeLedgerFile, formatValidationErrors } from '../lib/schema-validator.mjs';
import { ledgerProblems } from '../lib/prototype.mjs';
import { designModesOf } from '../lib/design-boards.mjs';
import { sourceItemProblems } from '../lib/ideate.mjs';
import { findUncitedLimitationClaims, findUnmarkedSuppressions, findUnownedMechanisms } from '../lib/limitation-lexicon.mjs';
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isBrainstormBoardPath,
  isPrototypeLedgerPath,
  isManagedArtifactMarkdownPath,
  isFreeFormWorkflowPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  isShipPlanAuditPath,
  normalizePathForMatch,
  outputSystemMessage,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath,
} from '../lib/hook-utils.mjs';

/**
 * Cheap frontmatter type read (avoids a full YAML parse for the lints).
 * Returns the effective type: the literal `type:`, except for
 * `type: augmentation` artifacts, which the `augmentation-type:`
 * discriminator names (benchmark / experiment / instrument / rca).
 */
function artifactType(text) {
  if (!text) return null;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return null;
  const block = fence[1];
  const typeMatch = /(?:^|\n)\s*type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  const type = typeMatch ? typeMatch[1] : null;
  if (type !== 'augmentation') return type;
  const augMatch = /(?:^|\n)\s*augmentation-type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  return augMatch ? augMatch[1] : type;
}

// Shadow-deferral vocabulary (AC-VERIFIABILITY R7 prose-deferral lint). When a
// `verify` body carries one of these AND the frontmatter says `result: pass`,
// the slice likely passed a user-observable AC on a prose-only deferral the
// structured gate can't see. Heuristic → WARN, never block (a body can
// legitimately quote the phrase while explaining it was AVOIDED).
const SHADOW_DEFERRAL_RE = /(deferred to (?:the )?(?:user|manual|operator)\b|deferred to manual user|UNVERIFIED[ -]INTERACTIVE|will be verified (?:interactively )?(?:during|in|at)\b|decidable by static reasoning|deferred to user verification)/i;

function blockVerifyResultGate(config, rel, message) {
  refuseWrite(checksModeOf(config),
    `wf-postwrite-verify: verify result gate BLOCKED ${rel}\n\n${message}\n\n` +
    'This gate blocks a pass that the acceptance evidence does not support.\n' +
    'Re-Edit the frontmatter to reconcile result\n' +
    'with the acceptance evidence, then continue.\n',
  );
}

/**
 * Write-time `verify` result gate (AC-VERIFIABILITY R7). Closes the
 * "verified but actually broken" leak at the artifact boundary.
 *
 * HARD BLOCK (exit 2) under `checks: strict` — frontmatter
 * cross-field contradictions with no false-positive surface (a true pass meets
 * every AC and defers none):
 *   G1: result: pass while metric-acceptance-met < metric-acceptance-total.
 *   G2: result: pass while interactive-verification: deferred.
 *
 * WARN (non-blocking systemMessage) —
 * heuristic prose-deferral lint: shadow vocabulary in the body co-occurring
 * with result: pass.
 *
 * Only `verify` per-slice artifacts are inspected; everything else is skipped.
 */
async function enforceVerifyResultGate(paths, config) {
  const warnings = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (artifactType(text) !== 'verify') continue;
    const { data, content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || data.result !== 'pass') continue;

    // Mock-evidence gate (INTENT-FIDELITY W5.2/W9.1 + YOLO F5; EVIDENCE-SCHEMA-CONTRACT §5).
    // A user-observable AC evidenced only by a mock / static rung is NOT met. The verify
    // stage records the count in metric-acceptance-mock-rung (the machine-readable projection
    // of the per-AC evidence-rung labels). result: pass with any such AC is a hard block.
    const mock = data['metric-acceptance-mock-rung'];
    if (typeof mock === 'number' && mock > 0) {
      blockVerifyResultGate(config, path.original,
        `result: pass but metric-acceptance-mock-rung (${mock}) > 0. At least one user-observable AC's ` +
        'highest evidence-rung is cited-mock / uncited-mock / static / asserted — a mock, a static ' +
        'analysis, or an unverified claim of success does not evidence user-observable behaviour. ' +
        'Climb the constraint-resolution ladder to a live/headless/emulator rung (for a task AC: ' +
        're-read the system of record — live — or record a cited attestation — attested), or take ' +
        'the deferral path (interactive-verification: deferred + a 00-index ' +
        'runtime-evidence-deferrals entry), then set result: partial.');
    }

    const met = data['metric-acceptance-met'];
    const total = data['metric-acceptance-total'];
    if (typeof met === 'number' && typeof total === 'number' && total > 0 && met < total) {
      blockVerifyResultGate(config, path.original,
        `result: pass but metric-acceptance-met (${met}) < metric-acceptance-total (${total}). ` +
        'A passing slice must meet EVERY acceptance criterion. Either evidence the unmet AC(s) and ' +
        `raise metric-acceptance-met to ${total}, or set result to \`partial\` / \`fail\`. If an unmet ` +
        'AC is user-observable and this environment cannot evidence it, set interactive-verification: ' +
        'deferred (result becomes `partial`) and register a 00-index runtime-evidence-deferrals entry.');
    }
    if (data['interactive-verification'] === 'deferred') {
      blockVerifyResultGate(config, path.original,
        'result: pass but interactive-verification: deferred. A deferred user-observable AC has no ' +
        'runtime evidence, so the slice cannot pass — set result: partial. (`/wf ship` then hard-blocks ' +
        'until a probe/re-verify run clears the deferral.)');
    }

    const hit = SHADOW_DEFERRAL_RE.exec(content || '');
    if (hit) warnings.push({ rel: path.original, phrase: hit[0].trim() });
  }

  if (warnings.length) {
    const lines = warnings.map((w) => `  - ${w.rel}: found "${w.phrase}" while result: pass`);
    outputSystemMessage(
      `wf: possible prose-only deferral in a passing verify artifact:\n${lines.join('\n')}\n` +
      'A user-observable AC that was "deferred to user/manual", left "UNVERIFIED-INTERACTIVE", punted to a ' +
      'later slice, or "decided by static reasoning" is NOT met by a runtime drive. If that is what ' +
      'happened, set result: partial + interactive-verification: deferred (with the rungs tried in the ' +
      'defer-reason) and register the deferral in 00-index runtime-evidence-deferrals — do not leave it as ' +
      'a silent pass.',
    );
  }
}

// The NEW text a Write/Edit/MultiEdit introduced (so the lints flag added lines, not
// pre-existing code). Write → content; Edit → new_string; MultiEdit → joined new_strings.
function newTextFromInput(input) {
  const ti = input?.tool_input ?? {};
  if (typeof ti.content === 'string') return ti.content;
  if (typeof ti.new_string === 'string') return ti.new_string;
  if (Array.isArray(ti.edits)) return ti.edits.map((e) => e?.new_string ?? '').join('\n');
  return '';
}

// Code-file advisory lints (INTENT-FIDELITY W3.2 limitation-claim + W9.3 suppression-debt).
// Runs on the NEW text of any Write/Edit to a NON-artifact file — warn-only, never blocks.
// A limitation comment with no citation is a hypothesis; a suppression with no sdlc-debt:
// marker is untracked debt. Emits one systemMessage per lint class.
function enforceCodeFileLints(input, config, artifactPaths) {

  const artifactSet = new Set((artifactPaths ?? []).map((p) => p.original));
  const paths = collectToolInputPaths(input).filter(
    (p) => !artifactSet.has(p) && !isManagedArtifactMarkdownPath(p) && !isProseLogPath(p),
  );
  if (!paths.length) return;
  const text = newTextFromInput(input);
  if (!text.trim()) return;

  const lines = [];
  for (const hit of findUncitedLimitationClaims(text)) {
    lines.push(`  - limitation claim without a citation (line ${hit.line}): "${hit.text}"`);
  }
  for (const hit of findUnmarkedSuppressions(text)) {
    lines.push(`  - suppression without an sdlc-debt: marker (line ${hit.line}): "${hit.text}"`);
  }
  if (!lines.length) return;
  outputSystemMessage(
    `wf: intent-fidelity code lints (advisory) on ${paths.join(', ')}:\n${lines.join('\n')}\n` +
    'A "does not exist / not exposed / was removed" comment is a HYPOTHESIS — cite the installed source ' +
    '(a study-sources read of node_modules/, a repro, an issue, or a URL) within ±3 lines, or delete it; ' +
    'never replicate an in-repo limitation comment into new code without re-verifying it. A new `as any` / ' +
    '`@ts-ignore` / `eslint-disable` needs an `sdlc-debt:` marker so the debt lifecycle (verify/retro/simplify) ' +
    'inherits it.',
  );
}

// Intake ledger lint (INTAKE-SHAPE-HARDENING W2.1). A default-mode intake (the artifact
// literally named 01-intake.md with type: intake — compressed modes write 01-fix.md /
// 01-hotfix.md / … and are exempt) may never be SILENTLY ledger-less: zero RIMs / zero
// charter commitments is legal only as the explicit `intent-risks: none-declared` /
// `charter: none-declared` declaration on the sibling 00-index.md. Warn-only — shape's
// Step 9a backfill is the hard consequence; this lint just surfaces the gap at write time
// while the author is still in context.
async function enforceIntakeLedgerLint(paths, config) {
  const warns = [];
  for (const path of paths) {
    const base = path.original.replace(/\\/g, '/').split('/').at(-1);
    if (base !== '01-intake.md') continue;
    const text = await readTextIfExists(path.absolute);
    if (artifactType(text) !== 'intake') continue;
    // No index → not a default-mode intake in flight (Step 2 creates the index before
    // Step 9 writes the brief). Skip rather than guess. The brief may be a draft.
    const dir = workflowDirOf(path.absolute);
    const idx = dir ? frontmatterOfDoc(dir, '00-index.md') : null;
    if (!idx) continue;
    const missing = [];
    const bodyHasRims = /(^|\n)\s*-\s*\*\*RIM-\d+/.test(text || '');
    const idxRisks = idx?.['intent-risks'];
    const risksDeclared = Array.isArray(idxRisks) ? idxRisks.length > 0 : idxRisks === 'none-declared';
    if (!bodyHasRims && !risksDeclared) missing.push('intent-risks (RIM ledger)');
    const bodyHasCharter = /(^|\n)\s*-\s*\*\*C\d+\*\*/.test(text || '');
    const idxCharter = idx?.charter;
    const charterDeclared = Array.isArray(idxCharter) ? idxCharter.length > 0 : idxCharter === 'none-declared';
    if (!bodyHasCharter && !charterDeclared) missing.push('charter');
    if (missing.length) warns.push({ rel: path.original, missing });
  }
  if (warns.length) {
    const lines = warns.map((w) => `  - ${w.rel}: missing ${w.missing.join(' + ')}`);
    outputSystemMessage(
      `wf: intake ledger lint (advisory) — a default-mode intake landed without its intent ledger:\n${lines.join('\n')}\n` +
      'A default intake may not be SILENTLY ledger-less: author RIM entries (## Risks if Misunderstood, ' +
      'the Step 6a misreading pass) and 3-7 charter commitments into 00-index.md, or declare the explicit ' +
      'escape `intent-risks: none-declared` / `charter: none-declared` with a one-line reason in the body. ' +
      "Otherwise shape's Step 9a will STOP and backfill the ledger before adjudicating.",
    );
  }
}

// Named-mechanism artifact lint (INTENT-FIDELITY W7.2). On a shape/slice artifact, a
// mechanism noun that appears in an AC / verification line but in NO decision section of
// the body is a design decision smuggled past adjudication. Warn-only.
async function enforceNamedMechanismLint(paths, config) {
  const warns = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = artifactType(text);
    if (type !== 'shape' && type !== 'slice') continue;
    const { content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!content) continue;
    // AC/verification region = lines under Acceptance Criteria / Verification headings;
    // decision text = everything else (the body's prose where a mechanism must be owned).
    const acLines = [];
    const decisionLines = [];
    let inAc = false;
    for (const line of content.split(/\r?\n/)) {
      if (/^#{1,4}\s/.test(line)) inAc = /acceptance criteria|verification|test/i.test(line);
      (inAc ? acLines : decisionLines).push(line);
    }
    const unowned = findUnownedMechanisms(acLines.join('\n'), decisionLines.join('\n'));
    if (unowned.length) warns.push({ rel: path.original, nouns: unowned });
  }
  if (warns.length) {
    const lines = warns.map((w) => `  - ${w.rel}: ${w.nouns.join(', ')}`);
    outputSystemMessage(
      `wf: named-mechanism lint (advisory) — a mechanism named in an AC/verification line has no owning ` +
      `decision in the artifact body:\n${lines.join('\n')}\n` +
      'A test may not name a machine the design does not own. State the mechanism in the body (what it is, ' +
      'what it replaces, why) and adjudicate it if it touches a RIM or PO directive, or drop it from the AC.',
    );
  }
}

// Ship-plan audit triage gate (ship-plan/audit.md Step 5). The ledger is
// kind-keyed, so it never reaches the schema validator; this is its only gate.
// Transcript evidence (Aperture, 2026-09-05): two audit runs wrote
// `triage-status: pending` and ended the turn without asking the Step 5 gate
// question, leaving 13 open findings untriaged. The rule is cross-field and
// false-positive-free:
//   - no open BLOCKER/HIGH finding -> nothing to triage, the write passes;
//   - `triage-status: complete` -> every open BLOCKER/HIGH must carry
//     `triage: accept` (acknowledged findings changed status; rejected ones are
//     dropped), else BLOCK;
//   - `triage-status: awaiting-user` -> the turn asked the gate and is waiting;
//     the write passes only while `awaiting-since` equals `last-run`. The escape
//     lasts one run: a later run that still carries the stale marker BLOCKS, so a
//     ledger cannot sit in `awaiting-user` forever without re-asking the gate;
//   - anything else (missing, `pending`, ...) with an open BLOCKER/HIGH -> BLOCK.
const TRIAGE_SEVERITIES = new Set(['BLOCKER', 'HIGH']);

export function auditTriageViolation(data) {
  const findings = Array.isArray(data?.findings) ? data.findings : [];
  const severe = findings.filter(
    (f) => f && String(f.status ?? 'open').toLowerCase() === 'open' && TRIAGE_SEVERITIES.has(String(f.severity ?? '').toUpperCase()),
  );
  if (!severe.length) return null;
  const status = String(data?.['triage-status'] ?? '').toLowerCase();
  if (status === 'awaiting-user') {
    const since = Number(data?.['awaiting-since']);
    const lastRun = Number(data?.['last-run']);
    if (Number.isInteger(since) && Number.isInteger(lastRun) && since === lastRun) return null;
    const shownSince = data?.['awaiting-since'] === undefined ? '(missing)' : String(data['awaiting-since']);
    const shownRun = Number.isInteger(lastRun) ? String(lastRun) : '(missing)';
    return {
      reason: `triage-status is \`awaiting-user\` but \`awaiting-since\` is ${shownSince} while \`last-run\` is ${shownRun}: ` +
        `the escape lasts one run. Ask the gate again in this run and set \`awaiting-since: ${Number.isInteger(lastRun) ? lastRun : '<last-run>'}\`, ` +
        'or record the decisions. Open: ' + severe.map((f) => f.id ?? '<no id>').join(', '),
      count: severe.length,
    };
  }
  if (status === 'complete') {
    const untriaged = severe.filter((f) => String(f.triage ?? '').toLowerCase() !== 'accept');
    if (!untriaged.length) return null;
    return {
      reason: `triage-status is \`complete\` but ${untriaged.length} open BLOCKER/HIGH finding(s) carry no \`triage: accept\`: ` +
        untriaged.map((f) => f.id ?? '<no id>').join(', '),
      count: untriaged.length,
    };
  }
  return {
    reason: `${severe.length} open BLOCKER/HIGH finding(s) and triage-status is \`${status || '(missing)'}\`: ` +
      severe.map((f) => f.id ?? '<no id>').join(', '),
    count: severe.length,
  };
}

async function enforceShipPlanAuditTriage(paths, config) {
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (!hasFrontmatterFence(text)) continue;
    const { data } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || String(data.kind ?? '') !== 'ship-plan-audit') continue;
    const violation = auditTriageViolation(data);
    if (!violation) continue;
    refuseWrite(checksModeOf(config),
      `wf-postwrite-verify: ship-plan audit triage gate BLOCKED ${path.original}\n\n${violation.reason}\n\n` +
      'Step 5 of reference/ship-plan/audit.md requires a gate question for every open BLOCKER/HIGH finding\n' +
      'before the ledger is finalized. Ask the gate now (per reference/_gate-question.md), then record each\n' +
      'decision in the ledger: accept -> `triage: accept` on the finding; acknowledge -> `status: acknowledged`\n' +
      '+ the reason; reject -> drop the finding. Then set `triage-status: complete`. If the turn must end while\n' +
      'the user answers, set `triage-status: awaiting-user` and `awaiting-since: <last-run>` instead; that escape\n' +
      'lasts one run.\n',
    );
  }
}

/**
 * Write-time validation of a brainstorm's agent board (brainstorm-board.json).
 * The board is the agent's memory across sessions and compaction, so a file that
 * does not parse or does not match $defs.brainstormBoard BLOCKS (exit 2) while
 * the author is still in context. Opt out with hooks.validateBrainstormBoard: false.
 */
async function validateBrainstormBoards(paths, config, schemaPath) {
  const failures = [];
  for (const path of paths) {
    const result = await validateBrainstormBoardFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) return;
  const reason = [];
  for (const f of failures) {
    reason.push(`wf-postwrite-verify: brainstorm board validation FAILED for ${f.path.original}\n\n`);
    reason.push(`${formatValidationErrors(f.result.errors)}\n\n`);
  }
  reason.push('The board does not conform to $defs.brainstormBoard\n');
  reason.push('(see plugins/sdlc-workflow/schemas/frontmatter.schema.json and\n');
  reason.push('skills/wf/reference/intake/brainstorm/_artifact.md). Fix the board, then continue.\n');
  refuseWrite(checksModeOf(config), reason.join(''));
}

/**
 * Write-time validation of a prototype's proof ledger (prototype-ledger.json).
 * The ledger is the prototype's memory across rounds and compaction, so a file that
 * does not parse, does not match $defs.prototypeLedger, or breaks a ledger rule
 * (lib/prototype.mjs) BLOCKS (exit 2). Opt out with hooks.validatePrototypeLedger: false.
 */
async function validatePrototypeLedgers(paths, config, schemaPath) {
  const failures = [];
  for (const path of paths) {
    const result = await validatePrototypeLedgerFile(path.absolute, { schemaPath });
    let rules = [];
    if (result.valid) {
      try { rules = ledgerProblems(JSON.parse(readFileSync(path.absolute, 'utf-8'))); } catch { rules = []; }
    }
    if (!result.valid || rules.length) failures.push({ path, result, rules });
  }
  if (!failures.length) return;
  const reason = [];
  for (const f of failures) {
    reason.push(`wf-postwrite-verify: proof ledger validation FAILED for ${f.path.original}\n\n`);
    if (!f.result.valid) reason.push(`${formatValidationErrors(f.result.errors)}\n\n`);
    for (const r of f.rules) reason.push(`  - ${r}\n`);
  }
  reason.push('The ledger does not conform to $defs.prototypeLedger and the ledger rules\n');
  reason.push('(see plugins/sdlc-workflow/schemas/frontmatter.schema.json and\n');
  reason.push('skills/wf/reference/prototype.md). Fix the ledger, then continue.\n');
  refuseWrite(checksModeOf(config), reason.join(''));
}

/**
 * The coverage guarantee of ideate with sources (WF-IDEATE-SOURCES-PLAN 4.2): every
 * source item of 01-ideate.md has exactly one result, and its ids resolve. A write
 * that leaves an item without a result BLOCKS (exit 2) and names the items.
 * Opt out with hooks.ideateSourceCoverage: false.
 */
async function enforceSourceCoverage(paths, config) {
  const failures = [];
  for (const path of paths) {
    if (!/(?:^|\/)01-ideate\.md$/.test(normalizePathForMatch(path.original))) continue;
    const text = await readTextIfExists(path.absolute);
    if (!text) continue;
    const fm = safeParseFrontmatter(text).data;
    if (fm?.type !== 'ideation' || (!fm.sources && !fm['source-items'])) continue;
    const problems = sourceItemProblems(fm);
    if (problems.length) failures.push({ path, problems });
  }
  if (!failures.length) return;
  const reason = [];
  for (const f of failures) {
    reason.push(`wf-postwrite-verify: source coverage FAILED for ${f.path.original}\n`);
    for (const p of f.problems) reason.push(`  - ${p}\n`);
  }
  reason.push('Every source item needs exactly one result (skills/wf/reference/intake/ideate/_sources.md).\n');
  reason.push('Give each named item its result, then continue.\n');
  refuseWrite(checksModeOf(config), reason.join(''));
}

// Index lint (ARTIFACT-SPLIT-PLAN S4, D7). 00-index.md is read by every stage,
// so history commentary there costs every reader. Warn only, never block.
export const INDEX_SIZE_WARN_BYTES = 20480;
// subagent-start (the Codex-only context hook) reads only this many characters
// of 00-index.md to find `current-stage:`.
export const INDEX_STAGE_HEAD_CHARS = 4000;
// A frontmatter `#` comment with more words than this is prose, not a label.
export const INDEX_COMMENT_PROSE_MAX_WORDS = 8;

function isWorkflowIndexPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/00-index\.md$/.test(normalizePathForMatch(filePath));
}

/**
 * Pure 00-index.md lint. Returns a list of warning strings (empty when clean).
 * `byteSize` is the file size in bytes; it defaults to the UTF-8 length of text.
 */
export function indexLintWarnings(text, byteSize = Buffer.byteLength(String(text ?? ''), 'utf8')) {
  const source = String(text ?? '');
  const warnings = [];
  if (byteSize > INDEX_SIZE_WARN_BYTES) {
    warnings.push(
      `00-index.md is ${byteSize} bytes, over the ${INDEX_SIZE_WARN_BYTES}-byte limit. Keep current state in the index; ` +
      'move YAML comment prose, old next-step commentary and finished sub-pass notes to index-history.jsonl ' +
      '(one JSON object per line: {"at","kind","text","stage"}). Keep the deferral list, intent risks, charter and revisions ledger in the index.',
    );
  }
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (fence) {
    const prose = [];
    for (const line of fence[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('#')) continue;
      const words = trimmed.replace(/^#+/, '').trim().split(/\s+/).filter(Boolean);
      if (words.length > INDEX_COMMENT_PROSE_MAX_WORDS) prose.push(trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed);
    }
    if (prose.length) {
      warnings.push(
        `00-index.md frontmatter carries ${prose.length} YAML comment line(s) of prose (a \`#\` comment of more than ` +
        `${INDEX_COMMENT_PROSE_MAX_WORDS} words), e.g. "${prose[0]}". Move this commentary to index-history.jsonl ` +
        '(kind: note or next-commentary) and keep only structured keys in the index.',
      );
    }
  }
  const stageRe = /^current-stage:\s*\S/m;
  if (!stageRe.test(source.slice(0, INDEX_STAGE_HEAD_CHARS)) && stageRe.test(source)) {
    warnings.push(
      `\`current-stage:\` is not in the first ${INDEX_STAGE_HEAD_CHARS} characters of 00-index.md. The subagent-start ` +
      'hook reads only that many characters, so it cannot see the stage. Move `current-stage:` near the top of the frontmatter.',
    );
  }
  return warnings;
}

// Design mode lint (WF-DESIGN-PLAN Part III 9.1). The design artifacts used to carry one
// `register` (brand or product); a surface now has its own design mode. The validator
// still accepts `register` and reads it as a design mode: brand → persuade, product →
// operate. Warn-only, so an old artifact keeps working and the writer learns the reason.
const DESIGN_MODE_TYPES = new Set(['design', 'design-contract', 'design-augmentation']);

/** The advisory line for one design artifact's frontmatter, or null. */
export function designModeAdvice(fm) {
  if (!fm || !DESIGN_MODE_TYPES.has(fm.type)) return null;
  const { from, modes, register } = designModesOf(fm);
  if (from !== 'register') return null;
  const field = fm.type === 'design-contract' || fm.type === 'design' ? '`surface-modes:` (surface → design mode)' : '`design-mode:`';
  return `carries \`register: ${register}\`, read as design mode \`${modes[0].mode}\`. \`register\` is deprecated: each surface ` +
    `now has its own design mode (persuade, operate, read, or experience). Write ${field} instead.`;
}

async function enforceDesignModeLint(paths, config) {
  const lines = [];
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (!text) continue;
    const { data } = safeParseFrontmatter(text, { filePath: path.absolute });
    const advice = designModeAdvice(data);
    if (advice) lines.push(`  - ${path.original} ${advice}`);
  }
  if (!lines.length) return;
  outputSystemMessage(`wf: design mode (advisory):\n${lines.join('\n')}`);
}

async function enforceIndexLint(paths, config) {
  const lines = [];
  for (const path of paths) {
    if (!isWorkflowIndexPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (text === null) continue;
    let size;
    try { size = statSync(path.absolute).size; } catch { size = undefined; }
    for (const w of indexLintWarnings(text, size)) lines.push(`  - ${path.original}: ${w}`);
  }
  if (!lines.length) return;
  outputSystemMessage(`wf: index lint (advisory):\n${lines.join('\n')}`);
}

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (checksModeOf(config) === 'off') return;

  const schemaPath = join(PLUGIN_ROOT, 'schemas', 'frontmatter.schema.json');
  const paths = collectToolInputPaths(input)
    .filter((path) => isManagedArtifactMarkdownPath(path))
    // probe-evidence/ and verify-evidence/ are free-form evidence — never
    // schema-gated or sibling-checked (mirrors the pre-write-validate carve-out;
    // see isEvidencePath). So are a brainstorm's sources, work/changes.md, and
    // history/ snapshots (isFreeFormWorkflowPath).
    .filter((path) => !isFreeFormWorkflowPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));

  // Code-file advisory lints run even when this write touched no managed artifact
  // (they target source files, not artifacts) — so they precede the early return.
  // They only advise, so an error in them is logged and passes: this stage fails
  // closed for the schema gate only.
  try {
    enforceCodeFileLints(input, config, paths);
  } catch (err) {
    await logError('post-write-verify:code-lints', err, { projectRoot }).catch(() => {});
  }

  // The ship-plan audit ledger is kind-keyed (never schema-gated) but has its own
  // triage gate; it is collected separately so it never enters the Ajv pass.
  const auditPaths = collectToolInputPaths(input)
    .filter((path) => isShipPlanAuditPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));
  if (auditPaths.length) await enforceShipPlanAuditTriage(auditPaths, config);

  const boardPaths = collectToolInputPaths(input)
    .filter((path) => isBrainstormBoardPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));
  if (boardPaths.length) await validateBrainstormBoards(boardPaths, config, schemaPath);

  const ledgerPaths = collectToolInputPaths(input)
    .filter((path) => isPrototypeLedgerPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));
  if (ledgerPaths.length) await validatePrototypeLedgers(ledgerPaths, config, schemaPath);

  if (!paths.length) return;

  // Index lint warns only; it runs before the schema pass so a warning is not
  // lost when the schema check blocks.
  await enforceIndexLint(paths, config);

  const failures = [];
  for (const path of paths) {
    // po-answers.md is a frontmatter-less prose log with no sdlc/v1 type —
    // never schema-validate it (mirrors the pre-write-validate carve-out).
    if (isProseLogPath(path.original)) continue;
    if (isProjectContextMarkdownPath(path.original)) {
      const text = await readTextIfExists(path.absolute);
      if (!hasFrontmatterFence(text)) continue;
    }
    const result = await validateFrontmatterFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }

  if (!failures.length) {
    // Frontmatter is clean. First the verify result gate (R7) — hard-block a
    // `verify` artifact whose `result: pass` contradicts its acceptance evidence
    // (may exit 2; warns on prose-only deferrals). Then the warn-only lints.
    await enforceVerifyResultGate(paths, config);
    await enforceSourceCoverage(paths, config);
    await enforceIntakeLedgerLint(paths, config);
    await enforceNamedMechanismLint(paths, config);
    await enforceDesignModeLint(paths, config);
    return;
  }

  const reason = [];
  for (const failure of failures) {
    reason.push(`wf-postwrite-verify: frontmatter validation FAILED for ${failure.path.original}\n\n`);
    reason.push(`${formatValidationErrors(failure.result.errors)}\n\n`);
  }
  reason.push('The file was written but does not conform to the sdlc/v1 schema\n');
  reason.push('(see plugins/sdlc-workflow/schemas/frontmatter.schema.json).\n');
  reason.push('Re-Edit the frontmatter to fix the issues above, then continue.\n');
  refuseWrite(checksModeOf(config), reason.join(''));
}

if (isEntry('post-write-verify')) runStandalone('post-write-verify', run, { failClosed: true });
