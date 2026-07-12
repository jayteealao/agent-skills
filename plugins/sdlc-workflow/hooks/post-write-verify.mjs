#!/usr/bin/env node
/**
 * PostToolUse deep validator for .ai/workflows/ artifacts:
 * - Skip when no artifact markdown path is present.
 * - Validate markdown under .ai/workflows/, .ai/simplify/, and .ai/profiles/.
 * - Skip paths that do not exist on disk.
 * - Exempt the po-answers.md prose log (see isProseLogPath).
 * - Run deep schema validation against tests/frontmatter.schema.json (native Ajv).
 * - Enforce sibling fragments: a rich-tier artifact `.md` written without its
 *   mandatory sibling `.yaml` BLOCKS (exit 2); see enforceSiblingFragments.
 * - Silent exit 0 on success.
 * - Exit 2 + stderr when validation fails or a mandatory sibling .yaml is absent.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { logError } from '../lib/error-log.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { validateFrontmatterFile, validateSiblingYamlFile, formatValidationErrors } from '../lib/schema-validator.mjs';
import { findUncitedLimitationClaims, findUnmarkedSuppressions, findUnownedMechanisms } from '../lib/limitation-lexicon.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isManagedArtifactMarkdownPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  outputSystemMessage,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath,
} from '../lib/hook-utils.mjs';

// S-1 (2026-06-04): a fragment-owning artifact drives its structured +
// interactive output from a sibling `.yaml` and `.html.fragment` co-located with
// the artifact `.md`. Those siblings are easy to forget at write-time, and
// nothing previously surfaced their absence — so in practice they were never
// authored and every rich page fell back to plain prose.
//
// v9.41 (Gap B): v9.39.0 made fragment authoring MANDATORY for benchmark /
// experiment / instrument / profile / simplify-run whenever their sibling YAML
// is written, but this reminder still nudged only the original 5 rich-tier
// types — so a skipped now-required fragment got no runtime signal (the S-1
// failure, reintroduced). The set below is the effective *fragment* type for
// every artifact that owns a contract. benchmark / experiment / instrument ride
// `type: augmentation` with an `augmentation-type:` discriminator, which
// `fragmentOwningType()` resolves below, so they are listed here by fragment
// name rather than by their literal `type:`.
//
// v9.48 (coverage): added the three remaining agent-authored fragment-owning
// types whose renderers degrade to renderSimple without a sibling but which the
// gate previously ignored — `review-command` (the per-dimension review files
// rendered by `review-dimension.mjs`), `design-audit`, and `design-critique`.
// Entries are the literal frontmatter `type:` value (so review-dimension is
// listed as `review-command`). The two automation-regenerable snapshots that
// also render rich — `sync-report` (/wf status deep) and `docs-index` (/wf docs) —
// are intentionally NOT gated: they are rewritten by automation each run, so a
// hard block would wedge the regenerator rather than prompt an author.
const RICH_TIER_TYPES = new Set([
  'review', 'plan', 'design', 'ship-run', 'rca',
  'benchmark', 'experiment', 'instrument', 'profile', 'simplify-run',
  'review-command', 'design-audit', 'design-critique',
  // v9.71 — craft's visual contract gains its own rich layer (02c-craft.yaml +
  // .html.fragment, type: design-contract). Reverses the Gap-D "no interactive
  // layer" call now that craft authors a coverage-grid fragment. Reminder-gated
  // only; NOT in SIBLING_YAML_VALIDATED_TYPES (no real corpus to hard-validate yet).
  'design-contract',
]);

// Types whose siblingYamlSchemas.<type> is reconciled to the live convention
// AND validated against the real artifact corpus, so a present `.yaml` can be
// hard-validated at write time without false-positives. CRITICAL: this hook
// keys the schema by the `.md`'s `type:` (fragmentOwningType), NOT by the
// `.yaml`'s own `artifact:` field — so a type belongs here only if some real
// `.md` actually carries that `type:` AND its sibling `.yaml` validates against
// that schema across the WHOLE corpus (never n=1). Per-dimension reviews are
// `type: review-command` with an `artifact: review-dimension` sibling, so the
// hook can never reach the review-dimension schema and it is intentionally
// absent (its schema is still reconciled for other consumers, just not enforced
// here).
//
// Validated against the real corpus across the registered repos (v9.66.0): plan
// 12/12, review 3/3, design 1/1, simplify-run 1/1, ship-run 2/2. The other
// types — description, rca, design-critique, design-audit, profile, benchmark,
// experiment, instrument, sync-report — have no validatable sibling corpus (no
// `.md`, or `.md` with zero siblings), so a guessed schema would arm a
// write-time BLOCK on the first author. They join only when a real sibling
// proves the schema. Gated by config.hooks.validateSiblingYaml.
const SIBLING_YAML_VALIDATED_TYPES = new Set([
  'plan', 'review', 'design', 'simplify-run', 'ship-run',
]);

/**
 * Cheap frontmatter fragment-type read (avoids a full YAML parse for the
 * reminder). Returns the effective fragment type: the literal `type:`, except
 * for `type: augmentation` artifacts where the fragment is named by the
 * `augmentation-type:` discriminator (benchmark / experiment / instrument / rca).
 */
function fragmentOwningType(text) {
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

/**
 * Cheap frontmatter `fragment:` escape read. A rich-tier artifact that
 * legitimately has no structured data to project (e.g. a profile that found no
 * hotspots, a no-op ship-run) can set `fragment: none` (also `skip` / `n/a`) in
 * its frontmatter to opt that one file out of the sibling requirement.
 */
function fragmentEscaped(text) {
  if (!text) return false;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return false;
  return /(?:^|\n)\s*fragment:\s*["']?(none|skip|n\/a)["']?\s*(?:#.*)?$/im.test(fence[1]);
}

/**
 * Write-time sibling-fragment enforcement. When a rich-tier artifact `.md` lands:
 *   - missing its sibling `.yaml` — the load-bearing structured data the renderer
 *     gates the ENTIRE rich tier on — BLOCK (exit 2). Without it the page
 *     silently degrades to plain prose, so a soft reminder (shipped through
 *     v9.46) was empirically ignored and the rich tier stayed dark in
 *     production. The block forces authoring while the artifact is in context.
 *   - `.yaml` present but `.html.fragment` missing — non-blocking nudge. The
 *     fragment is the optional interactive layer; the page already renders rich
 *     from the YAML, so this stays a reminder, not a gate.
 * Opt out globally with `hooks.remindMissingFragments: false`; opt out a single
 * artifact with `fragment: none` in its frontmatter. A contract-compliant agent
 * writes the `.yaml` before the `.md`, so it never trips the block.
 */
async function enforceSiblingFragments(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const blocking = [];   // missing the mandatory .yaml — hard gate
  const nudges = [];     // .yaml present, only .html.fragment missing — soft
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    if (fragmentEscaped(text)) continue;
    const stem = path.absolute.replace(/\.md$/, '');
    const fileStem = path.original.replace(/\\/g, '/').split('/').at(-1).replace(/\.md$/, '');
    const hasYaml = existsSync(`${stem}.yaml`);
    const hasFragment = existsSync(`${stem}.html.fragment`);
    if (!hasYaml) {
      const missing = [`${fileStem}.yaml`];
      if (!hasFragment) missing.push(`${fileStem}.html.fragment`);
      blocking.push({ rel: path.original, type, missing });
    } else if (!hasFragment) {
      nudges.push({ rel: path.original, type, missing: [`${fileStem}.html.fragment`] });
    }
  }

  if (blocking.length) {
    const lines = blocking.map((r) => `  - ${r.rel} (type: ${r.type}) — missing ${r.missing.join(' + ')}`);
    process.stderr.write(
      `wf-postwrite-verify: rich-tier artifact written without its mandatory sibling .yaml:\n\n${lines.join('\n')}\n\n` +
      'The sunflower view GATES the whole rich page (file-change topology, files-touched\n' +
      'table, verdict heatmap, risk callouts, etc.) on the sibling .yaml — without it the\n' +
      'page silently degrades to plain prose. Author the siblings NOW, while this artifact\n' +
      'is still in context:\n' +
      '  1. Write <stem>.yaml — the structured data (schema: siblingYamlSchemas.<type> in\n' +
      '     plugins/sdlc-workflow/tests/frontmatter.schema.json).\n' +
      '  2. Write <stem>.html.fragment — the body-only interactive layer.\n' +
      'Full contract: plugins/sdlc-workflow/reference/fragment-author-contract.md.\n' +
      'If this artifact legitimately has no structured data to project, set\n' +
      '`fragment: none` in its frontmatter to opt out.\n',
    );
    process.exit(2);
  }

  if (nudges.length) {
    const lines = nudges.map((r) => `  - ${r.rel} (type: ${r.type}) — missing ${r.missing.join(' + ')}`);
    outputSystemMessage(
      `wf: rich-tier artifact(s) have their sibling .yaml but no .html.fragment:\n${lines.join('\n')}\n` +
      'The page already renders rich from the .yaml; the .html.fragment only adds the ' +
      'interactive layer (collapsible rows, filters, copy controls). Author it per ' +
      'reference/fragment-author-contract.md if this artifact warrants interactivity.',
    );
  }
}

/**
 * Write-time sibling-YAML shape validation. When a rich-tier artifact `.md`
 * lands with a present sibling `.yaml` AND its type's schema is reconciled
 * (SIBLING_YAML_VALIDATED_TYPES), validate the YAML against
 * siblingYamlSchemas.<type> and BLOCK (exit 2) on a violation. This is the
 * shift-left guard: the sunflower view reads this file to build the rich page,
 * so a malformed shape degrades the figure (now gracefully, post-v9.61.0) and
 * should be caught while the author is still in context. Opt out globally with
 * `hooks.validateSiblingYaml: false`.
 */
async function validateSiblingYamls(paths, config, schemaPath) {
  if (config.hooks?.validateSiblingYaml === false) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !SIBLING_YAML_VALIDATED_TYPES.has(type)) continue;
    const yamlPath = `${path.absolute.replace(/\.md$/, '')}.yaml`;
    if (!existsSync(yamlPath)) continue;   // absence is enforceSiblingFragments' job
    const result = await validateSiblingYamlFile(yamlPath, { schemaPath, artifact: type });
    if (!result.valid) {
      failures.push({ rel: `${path.original.replace(/\.md$/, '')}.yaml`, result });
    }
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: sibling YAML validation FAILED for ${f.rel}\n\n`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}\n\n`);
  }
  process.stderr.write('The sibling .yaml does not conform to siblingYamlSchemas.<type>\n');
  process.stderr.write('(see plugins/sdlc-workflow/tests/frontmatter.schema.json). The sunflower view\n');
  process.stderr.write('reads this file to build the rich page; a malformed shape degrades the figure.\n');
  process.stderr.write('Fix the issues above, then continue.\n');
  process.exit(2);
}

// Shadow-deferral vocabulary (AC-VERIFIABILITY R7 prose-deferral lint). When a
// `verify` body carries one of these AND the frontmatter says `result: pass`,
// the slice likely passed a user-observable AC on a prose-only deferral the
// structured gate can't see. Heuristic → WARN, never block (a body can
// legitimately quote the phrase while explaining it was AVOIDED).
const SHADOW_DEFERRAL_RE = /(deferred to (?:the )?(?:user|manual|operator)\b|deferred to manual user|UNVERIFIED[ -]INTERACTIVE|will be verified (?:interactively )?(?:during|in|at)\b|decidable by static reasoning|deferred to user verification)/i;

function blockVerifyResultGate(rel, message) {
  process.stderr.write(
    `wf-postwrite-verify: verify result gate BLOCKED ${rel}\n\n${message}\n\n` +
    'This gate (AC-VERIFIABILITY recommendations R7) makes the "verified but actually\n' +
    'broken" pass mechanically impossible. Re-Edit the frontmatter to reconcile result\n' +
    'with the acceptance evidence, then continue. Opt out with hooks.verifyResultGate: false.\n',
  );
  process.exit(2);
}

/**
 * Write-time `verify` result gate (AC-VERIFIABILITY R7). Closes the
 * "verified but actually broken" leak at the artifact boundary.
 *
 * HARD BLOCK (exit 2), gated by config.hooks.verifyResultGate — frontmatter
 * cross-field contradictions with no false-positive surface (a true pass meets
 * every AC and defers none):
 *   G1: result: pass while metric-acceptance-met < metric-acceptance-total.
 *   G2: result: pass while interactive-verification: deferred.
 *
 * WARN (non-blocking systemMessage), gated by config.hooks.verifyDeferralLint —
 * heuristic prose-deferral lint: shadow vocabulary in the body co-occurring
 * with result: pass.
 *
 * Only `verify` per-slice artifacts are inspected; everything else is skipped.
 */
async function enforceVerifyResultGate(paths, config) {
  const resultGate = config.hooks?.verifyResultGate !== false;
  const proseLint = config.hooks?.verifyDeferralLint !== false;
  const mockGate = config.hooks?.mockEvidenceGate !== false;
  if (!resultGate && !proseLint && !mockGate) return;

  const warnings = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (fragmentOwningType(text) !== 'verify') continue;
    const { data, content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || data.result !== 'pass') continue;

    // Mock-evidence gate (INTENT-FIDELITY W5.2/W9.1 + YOLO F5; EVIDENCE-SCHEMA-CONTRACT §5).
    // A user-observable AC evidenced only by a mock / static rung is NOT met. The verify
    // stage records the count in metric-acceptance-mock-rung (the machine-readable projection
    // of the per-AC evidence-rung labels). result: pass with any such AC is a hard block.
    if (mockGate) {
      const mock = data['metric-acceptance-mock-rung'];
      if (typeof mock === 'number' && mock > 0) {
        blockVerifyResultGate(path.original,
          `result: pass but metric-acceptance-mock-rung (${mock}) > 0. At least one user-observable AC's ` +
          'highest evidence-rung is cited-mock / uncited-mock / static — a mock or static analysis does not ' +
          'evidence user-observable behaviour. Climb the constraint-resolution ladder to a live/headless/' +
          'emulator rung, or take the deferral path (interactive-verification: deferred + a 00-index ' +
          'runtime-evidence-deferrals entry), then set result: partial. Opt out with hooks.mockEvidenceGate: false.');
      }
    }

    if (resultGate) {
      const met = data['metric-acceptance-met'];
      const total = data['metric-acceptance-total'];
      if (typeof met === 'number' && typeof total === 'number' && total > 0 && met < total) {
        blockVerifyResultGate(path.original,
          `result: pass but metric-acceptance-met (${met}) < metric-acceptance-total (${total}). ` +
          'A passing slice must meet EVERY acceptance criterion. Either evidence the unmet AC(s) and ' +
          `raise metric-acceptance-met to ${total}, or set result to \`partial\` / \`fail\`. If an unmet ` +
          'AC is user-observable and this environment cannot evidence it, set interactive-verification: ' +
          'deferred (result becomes `partial`) and register a 00-index runtime-evidence-deferrals entry.');
      }
      if (data['interactive-verification'] === 'deferred') {
        blockVerifyResultGate(path.original,
          'result: pass but interactive-verification: deferred. A deferred user-observable AC has no ' +
          'runtime evidence, so the slice cannot pass — set result: partial. (`/wf ship` then hard-blocks ' +
          'until a probe/re-verify run clears the deferral.)');
      }
    }

    if (proseLint) {
      const hit = SHADOW_DEFERRAL_RE.exec(content || '');
      if (hit) warnings.push({ rel: path.original, phrase: hit[0].trim() });
    }
  }

  if (warnings.length) {
    const lines = warnings.map((w) => `  - ${w.rel}: found "${w.phrase}" while result: pass`);
    outputSystemMessage(
      `wf: possible prose-only deferral in a passing verify artifact:\n${lines.join('\n')}\n` +
      'A user-observable AC that was "deferred to user/manual", left "UNVERIFIED-INTERACTIVE", punted to a ' +
      'later slice, or "decided by static reasoning" is NOT met by a runtime drive. If that is what ' +
      'happened, set result: partial + interactive-verification: deferred (with the rungs tried in the ' +
      'defer-reason) and register the deferral in 00-index runtime-evidence-deferrals — do not leave it as ' +
      'a silent pass. Disable this lint with hooks.verifyDeferralLint: false.',
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
  const limitationLint = config.hooks?.limitationClaimLint !== false;
  const debtLint = config.hooks?.suppressionDebtLint !== false;
  if (!limitationLint && !debtLint) return;

  const artifactSet = new Set((artifactPaths ?? []).map((p) => p.original));
  const paths = collectToolInputPaths(input).filter(
    (p) => !artifactSet.has(p) && !isManagedArtifactMarkdownPath(p) && !isProseLogPath(p),
  );
  if (!paths.length) return;
  const text = newTextFromInput(input);
  if (!text.trim()) return;

  const lines = [];
  if (limitationLint) {
    for (const hit of findUncitedLimitationClaims(text)) {
      lines.push(`  - limitation claim without a citation (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (debtLint) {
    for (const hit of findUnmarkedSuppressions(text)) {
      lines.push(`  - suppression without an sdlc-debt: marker (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (!lines.length) return;
  outputSystemMessage(
    `wf: intent-fidelity code lints (advisory) on ${paths.join(', ')}:\n${lines.join('\n')}\n` +
    'A "does not exist / not exposed / was removed" comment is a HYPOTHESIS — cite the installed source ' +
    '(a study-sources read of node_modules/, a repro, an issue, or a URL) within ±3 lines, or delete it; ' +
    'never replicate an in-repo limitation comment into new code without re-verifying it. A new `as any` / ' +
    '`@ts-ignore` / `eslint-disable` needs an `sdlc-debt:` marker so the debt lifecycle (verify/retro/simplify) ' +
    'inherits it. Opt out: hooks.limitationClaimLint / hooks.suppressionDebtLint.',
  );
}

// Named-mechanism artifact lint (INTENT-FIDELITY W7.2). On a shape/slice artifact, a
// mechanism noun that appears in an AC / verification line but in NO decision section of
// the body is a design decision smuggled past adjudication. Warn-only.
async function enforceNamedMechanismLint(paths, config) {
  if (config.hooks?.namedMechanismLint === false) return;
  const warns = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
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
      'what it replaces, why) and adjudicate it if it touches a RIM or PO directive, or drop it from the AC. ' +
      'Opt out: hooks.namedMechanismLint: false.',
    );
  }
}

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  // Defense-in-depth: a dispatched sub-agent (consult skill) must not have its
  // writes schema-verified as SDLC artifacts. See EXTERNAL-MODEL-DISPATCH-PLAN §3.1.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;

  const schemaPath = join(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json');
  const paths = collectToolInputPaths(input)
    .filter((path) => isManagedArtifactMarkdownPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));

  // Code-file advisory lints run even when this write touched no managed artifact
  // (they target source files, not artifacts) — so they precede the early return.
  enforceCodeFileLints(input, config, paths);

  if (!paths.length) return;

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
    // (may exit 2; warns on prose-only deferrals). Then validate present sibling
    // YAML shape (reconciled types only; may exit 2), then enforce sibling
    // presence (blocks on a missing rich-tier .yaml, nudges on a missing
    // .html.fragment; may exit 2).
    await enforceVerifyResultGate(paths, config);
    await enforceNamedMechanismLint(paths, config);
    await validateSiblingYamls(paths, config, schemaPath);
    await enforceSiblingFragments(paths, config);
    return;
  }

  for (const failure of failures) {
    process.stderr.write(`wf-postwrite-verify: frontmatter validation FAILED for ${failure.path.original}\n\n`);
    process.stderr.write(`${formatValidationErrors(failure.result.errors)}\n\n`);
  }
  process.stderr.write('The file was written but does not conform to the sdlc/v1 schema\n');
  process.stderr.write('(see plugins/sdlc-workflow/tests/frontmatter.schema.json).\n');
  process.stderr.write('Re-Edit the frontmatter to fix the issues above, then continue.\n');
  process.exit(2);
}

main().catch(async (err) => {
  try {
    await logError('post-write-verify', err);
  } catch {
    // ignore logging failures
  }
  process.exit(0);
});
