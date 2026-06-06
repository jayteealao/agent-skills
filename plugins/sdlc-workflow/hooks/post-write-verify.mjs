#!/usr/bin/env node
/**
 * PostToolUse deep validator for .ai/workflows/ artifacts:
 * - Skip when no artifact markdown path is present.
 * - Validate markdown under .ai/workflows/, .ai/simplify/, and .ai/profiles/.
 * - Skip paths that do not exist on disk.
 * - Exempt the po-answers.md prose log (see isProseLogPath).
 * - Run deep schema validation against tests/frontmatter.schema.json (native Ajv).
 * - Silent exit 0 on success.
 * - Exit 2 + stderr when validation fails.
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
const RICH_TIER_TYPES = new Set([
  'review', 'plan', 'design', 'ship-run', 'rca',
  'benchmark', 'experiment', 'instrument', 'profile', 'simplify-run',
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
 * Non-blocking write-time reminder: when a rich-tier artifact `.md` lands
 * without its sibling `.yaml` / `.html.fragment`, surface a systemMessage so the
 * agent authors them while it still has context. Fail-open — never blocks.
 */
async function remindMissingFragments(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const reminders = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    const stem = path.absolute.replace(/\.md$/, '');
    const fileStem = path.original.replace(/\\/g, '/').split('/').at(-1).replace(/\.md$/, '');
    const missing = [];
    if (!existsSync(`${stem}.yaml`)) missing.push(`${fileStem}.yaml`);
    if (!existsSync(`${stem}.html.fragment`)) missing.push(`${fileStem}.html.fragment`);
    if (missing.length) reminders.push({ rel: path.original, type, missing });
  }
  if (!reminders.length) return;
  const lines = reminders.map((r) => `  - ${r.rel} (type: ${r.type}) - missing ${r.missing.join(' + ')}`);
  outputSystemMessage(
    `wf: fragment-owning artifact(s) written without their sibling fragment files:\n${lines.join('\n')}\n` +
    'The sunflower view renders these pages as plain prose until you author the sibling ' +
    '.yaml (structured data) and .html.fragment (interactive markup) next to each .md. ' +
    'If an artifact has structured data to project, author its siblings now per ' +
    'reference/fragment-author-contract.md while you still have the context. ' +
    '(If it legitimately has none — e.g. a profile that found no hotspots — you can ignore this.)',
  );
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
    // Schema is clean — nudge for any missing rich-tier sibling fragments.
    await remindMissingFragments(paths, config);
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
