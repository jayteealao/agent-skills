#!/usr/bin/env node
/**
 * PreToolUse(Bash) External Output Boundary leak guard
 * (HOOKS-SEMANTIC Phase 1, hooks #1 + #3).
 *
 * Scans the OUTWARD-FACING text arguments of publishing commands — `git commit`
 * / `git tag` messages, `gh pr create` titles/bodies, `gh release create`
 * titles/notes — against the leak lexicon derived from _output-boundary.md.
 * Only the message-bearing arguments are scanned, never the whole command, so
 * `cat .ai/workflows/...` and friends never trigger it.
 *
 * Default OFF (`semantic.enabled: false` in .ai/sdlc-config.json). Advisory
 * first: `semantic.mode: "advisory"` emits a systemMessage; `"enforce"` denies
 * (exit 2). Promote to enforce only after the advisory false-positive rate is
 * ~0 across real workflows. Body-file flags (`-F`, `--body-file`) are NOT read
 * in Phase 1 — the file path itself is still scanned as text.
 * Never fires inside external-model dispatch (SDLC_DISPATCH_ACTIVE).
 */

import { loadConfig } from '../lib/config.mjs';
import { buildLexicon, scanText, formatFindings } from '../lib/leak-lexicon.mjs';
import { logError } from '../lib/error-log.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { outputSystemMessage, projectRootFromInput } from '../lib/hook-utils.mjs';

const PUBLISH_COMMANDS = /\bgit\s+commit\b|\bgit\s+tag\b|\bgh\s+pr\s+create\b|\bgh\s+release\s+(?:create|edit)\b/;
// Flags whose value is outward-facing text.
const TEXT_FLAGS = /(?:^|\s)(?:-m|-t|-b|-n|--message|--title|--body|--notes)(?:=|\s+)("(?:[^"\\]|\\.)*"|'[^']*'|\$'(?:[^'\\]|\\.)*'|\S+)/g;

export function extractOutwardText(command) {
  const s = String(command ?? '');
  if (!PUBLISH_COMMANDS.test(s)) return [];
  const texts = [];
  let m;
  TEXT_FLAGS.lastIndex = 0;
  while ((m = TEXT_FLAGS.exec(s))) {
    let value = m[1];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (value.startsWith("$'")) {
      value = value.slice(2, -1);
    }
    texts.push(value);
  }
  // Heredoc bodies (the house commit style: -m "$(cat <<'EOF' ... EOF)").
  const heredoc = s.match(/<<-?\s*'?EOF'?\n([\s\S]*?)\nEOF/);
  if (heredoc) texts.push(heredoc[1]);
  return texts;
}

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const input = await readStdinJson();
  const command = input?.tool_input?.command;
  if (!command || !PUBLISH_COMMANDS.test(String(command))) return;

  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.semantic?.enabled !== true) return;

  const texts = extractOutwardText(command);
  if (!texts.length) return;

  const lexicon = buildLexicon();
  const findings = texts.flatMap((t) => scanText(t, lexicon));
  if (!findings.length) return;

  const summary = formatFindings(findings);
  const message =
    `External Output Boundary: outward-facing text in this command contains internal workflow ` +
    `vocabulary — ${summary}. Translate to product language (user-visible change, rationale, ` +
    `verification, risk) before publishing; the rule lives in skills/wf/reference/_output-boundary.md.`;

  if (config.semantic?.mode === 'enforce') {
    console.error(message);
    process.exit(2);
  }
  outputSystemMessage(message);
}

main().catch((err) => {
  logError('leak-guard-bash', err);
  process.exit(0); // advisory infrastructure must never break the tool call
});
