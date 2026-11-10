#!/usr/bin/env node
/**
 * PreToolUse(Bash) External Output Boundary leak guard: the commit and the
 * publish checks.
 *
 * Scans the OUTWARD-FACING text arguments of publishing commands — `git commit`
 * / `git tag` messages (git global options such as `-C <dir>` allowed before the
 * subcommand), `gh pr|issue create|edit|comment` titles/bodies, `gh release
 * create|edit` titles/notes — against the leak lexicon derived from
 * _output-boundary.md. Only the message-bearing arguments of the command parts
 * that publish are scanned, never the whole command, so `cat .ai/workflows/...`
 * and `grep ... && git commit -m ok` never trigger it. A message can come from a
 * flag (`-m`, `-am`, `-m"…"`, `--body`, a PowerShell here-string), from a heredoc
 * with any delimiter, or from a file (`-F <path>`, `--file`, `--body-file`,
 * `--notes-file`): the file is read when it exists.
 *
 * Default OFF (`semantic.enabled: false` in .ai/sdlc-config.json). Advisory
 * first: `semantic.mode: "advisory"` emits a systemMessage; `"enforce"` denies
 * (exit 2). Promote to enforce only after the advisory false-positive rate is
 * ~0 across real workflows.
 * Never fires inside external-model dispatch (SDLC_DISPATCH_ACTIVE).
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { buildLexicon, scanText, formatFindings } from '../lib/leak-lexicon.mjs';
import { blockToolCall, hookConfig, isEntry, runStandalone } from '../lib/hook-runner.mjs';
import { outputSystemMessage } from '../lib/hook-utils.mjs';

const PUBLISH_COMMANDS = /\bgit(?:\s+-[cC]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+(?:commit|tag)\b|\bgh\s+(?:pr|issue)\s+(?:create|edit|comment)\b|\bgh\s+release\s+(?:create|edit)\b/;
// Flags whose value is outward-facing text: `-m`, combined short flags that end in m (`-am`),
// and the long forms; the value may follow with `=`, a space, or straight after `-m`.
const TEXT_FLAGS = /(?:^|\s)(?:-[a-zA-Z]*m|-t|-b|-n|--message|--title|--body|--notes)(?:=|\s+|(?=["']))(@'[\s\S]*?'@|@"[\s\S]*?"@|"(?:[^"\\]|\\.)*"|'[^']*'|\$'(?:[^'\\]|\\.)*'|\S+)/g;
// Flags whose value is a file that holds the outward-facing text.
const FILE_FLAGS = /(?:^|\s)(?:-F|--file|--body-file|--notes-file)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/g;
const HEREDOC = /((?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2[^\n]*)\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/g;
const MARK = /\u0001(\d+)\u0001/g;

/** The command split on `&&`, `||`, `;`, `|` and newlines outside quotes. */
function segmentsOf(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (quote === '@\'' || quote === '@"') { if (c === quote[1] && s[i + 1] === '@') { cur += '@'; i += 1; quote = null; } continue; }
      if (c === '\\' && quote === '"') { cur += s[i + 1] ?? ''; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '@' && (s[i + 1] === "'" || s[i + 1] === '"')) { quote = `@${s[i + 1]}`; cur += c + s[i + 1]; i += 1; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '\n' || c === ';' || c === '|' || (c === '&' && s[i + 1] === '&')) {
      out.push(cur); cur = '';
      if ((c === '|' && s[i + 1] === '|') || c === '&') i += 1;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

const unwrap = (value) => {
  if (/^@(['"])[\s\S]*\1@$/.test(value)) return value.slice(2, -2).replace(/^\r?\n|\r?\n$/g, '');
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value.startsWith("$'")) return value.slice(2, -1);
  return value;
};

function readMessageFile(path, cwd) {
  if (!path || path === '-') return null;
  const abs = isAbsolute(path) ? path : resolve(cwd ?? process.cwd(), path);
  try {
    if (!existsSync(abs) || !statSync(abs).isFile()) return null;
    return readFileSync(abs, 'utf8');
  } catch { return null; }
}

/** The outward-facing texts of a command; `cwd` resolves a message file. */
export function extractOutwardText(command, cwd) {
  const raw = String(command ?? '');
  if (!PUBLISH_COMMANDS.test(raw)) return [];
  const bodies = [];
  const s = raw.replace(HEREDOC, (_, head, _q, _d, body) => { bodies.push(body); return `${head}\u0001${bodies.length - 1}\u0001`; });
  const texts = [];
  for (const seg of segmentsOf(s)) {
    if (!PUBLISH_COMMANDS.test(seg)) continue;
    for (const m of seg.matchAll(MARK)) texts.push(bodies[Number(m[1])]);
    const plain = seg.replace(MARK, '');
    for (const m of plain.matchAll(TEXT_FLAGS)) texts.push(unwrap(m[1]));
    for (const m of plain.matchAll(FILE_FLAGS)) {
      const text = readMessageFile(unwrap(m[1]), cwd);
      if (text != null) texts.push(text);
    }
  }
  return texts;
}

export async function run(input) {
  const command = input?.tool_input?.command;
  if (!command || !PUBLISH_COMMANDS.test(String(command))) return;

  const config = await hookConfig(input);
  if (config.semantic?.enabled !== true) return;

  const texts = extractOutwardText(command, input?.cwd);
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
    blockToolCall();
  }
  outputSystemMessage(message);
}

if (isEntry('leak-guard-bash')) runStandalone('leak-guard-bash', run);
