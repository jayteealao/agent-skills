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
import { validateFrontmatterFile, formatValidationErrors } from '../lib/schema-validator.mjs';
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
// also render rich — `sync-report` (/wf-meta sync) and `docs-index` (/wf-docs) —
// are intentionally NOT gated: they are rewritten by automation each run, so a
// hard block would wedge the regenerator rather than prompt an author.
const RICH_TIER_TYPES = new Set([
  'review', 'plan', 'design', 'ship-run', 'rca',
  'benchmark', 'experiment', 'instrument', 'profile', 'simplify-run',
  'review-command', 'design-audit', 'design-critique',
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

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;

  const schemaPath = join(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json');
  const paths = collectToolInputPaths(input)
    .filter((path) => isManagedArtifactMarkdownPath(path))
    .map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) }))
    .filter(({ absolute }) => absolute && existsSync(absolute));

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
    // Schema is clean — enforce sibling fragments (blocks on a missing rich-tier
    // .yaml, nudges on a missing .html.fragment). May exit(2).
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
