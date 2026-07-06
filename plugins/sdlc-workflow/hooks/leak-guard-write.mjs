#!/usr/bin/env node
/**
 * PreToolUse(Write|Edit) External Output Boundary leak guard
 * (HOOKS-SEMANTIC Phase 1, hook #2).
 *
 * When a write targets a PUBLIC documentation path — README*, CHANGELOG*,
 * CONTRIBUTING*, or anything under a docs/ directory outside the internal
 * roots — the written content is scanned against the leak lexicon derived from
 * _output-boundary.md. Internal-root paths (.ai/**, .claude/**) are never
 * scanned: workflow vocabulary belongs there.
 *
 * Default OFF (`semantic.enabled: false`); advisory-first (`semantic.mode`).
 * Never fires inside external-model dispatch (SDLC_DISPATCH_ACTIVE).
 */

import { loadConfig } from '../lib/config.mjs';
import { buildLexicon, scanText, formatFindings } from '../lib/leak-lexicon.mjs';
import { logError } from '../lib/error-log.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { normalizePathForMatch, outputSystemMessage, projectRootFromInput } from '../lib/hook-utils.mjs';

export function isPublicDocPath(filePath, roots) {
  const n = normalizePathForMatch(filePath);
  if (!n) return false;
  // Anything under an internal root is internal by definition.
  for (const root of roots) {
    if (n.includes(`/${root}`) || n.startsWith(root)) return false;
  }
  const base = n.split('/').at(-1);
  if (/^(README|CHANGELOG|CONTRIBUTING)[^/]*$/i.test(base)) return true;
  // A docs/ tree outside the internal roots is user-facing documentation.
  if (/(?:^|\/)docs\//.test(n)) return true;
  return false;
}

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const input = await readStdinJson();
  const filePath = input?.tool_input?.file_path;
  // Write carries full content; Edit carries the replacement text; MultiEdit
  // carries an edits[] array of replacements — scan them all.
  const parts = [
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...(Array.isArray(input?.tool_input?.edits)
      ? input.tool_input.edits.map((e) => e?.new_string)
      : []),
  ].filter((t) => typeof t === 'string' && t.length);
  if (!filePath || !parts.length) return;
  const content = parts.join('\n');

  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.semantic?.enabled !== true) return;

  const lexicon = buildLexicon();
  if (!isPublicDocPath(filePath, lexicon.roots)) return;

  const findings = scanText(content, lexicon);
  if (!findings.length) return;

  const summary = formatFindings(findings);
  const message =
    `External Output Boundary: \`${filePath}\` is a public documentation path but the written ` +
    `content contains internal workflow vocabulary — ${summary}. Translate to product language ` +
    `before publishing; the rule lives in skills/wf/reference/_output-boundary.md.`;

  if (config.semantic?.mode === 'enforce') {
    console.error(message);
    process.exit(2);
  }
  outputSystemMessage(message);
}

main().catch((err) => {
  logError('leak-guard-write', err);
  process.exit(0); // advisory infrastructure must never break the tool call
});
