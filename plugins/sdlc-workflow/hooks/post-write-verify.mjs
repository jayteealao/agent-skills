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
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath,
} from '../lib/hook-utils.mjs';

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

  if (!failures.length) return;

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
