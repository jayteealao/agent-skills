#!/usr/bin/env node
/**
 * PreToolUse(Bash|PowerShell) shell-write guard.
 *
 * The write check of pre-write-validate sees Write, Edit and MultiEdit only. A shell command
 * writes files too: a redirect (`>`, `>>`), `tee`, `cp`, `mv`, and in PowerShell `Out-File`,
 * `Set-Content`, `Add-Content`, `Copy-Item` and `Move-Item`. This guard reads the targets of
 * those writes and refuses:
 * - a target that is a local workflow path of a linked project (the file belongs in the wf-dir
 *   in the records repo clone, as the Write check says), and
 * - a target that is the answer log `po-answers.md` or `steer.md` of a workflow: answers go
 *   through `wf.mjs decide add`.
 * A command whose targets this guard cannot read passes.
 *
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */

import { isAbsolute, resolve } from 'node:path';
import { checksModeOf } from '../lib/config.mjs';
import { hookConfig, hookProjectRoot, isEntry, refuseWrite, runStandalone } from '../lib/hook-runner.mjs';
import { linkedLocalTarget } from '../lib/records-root.mjs';

const WORD = String.raw`("[^"]*"|'[^']*'|[^\s;&|<>()]+)`;
const unquote = (t) => (/^(["']).*\1$/.test(t) ? t.slice(1, -1) : t);
const NOT_A_FILE = /^(?:&\d*|\/dev\/null|nul|\$null|NUL)$/i;

/** The file targets that a shell command writes, as written in the command. */
export function shellWriteTargets(command) {
  const s = String(command ?? '');
  const out = [];
  const add = (t) => { const v = unquote(t); if (v && !NOT_A_FILE.test(v)) out.push(v); };
  // Redirects: `> f`, `>> f`, `1> f`, `2>> f`; not `2>&1` and not a heredoc `<<`.
  for (const m of s.matchAll(new RegExp(String.raw`(?:^|[^<>&\d])\d?>>?(?!&)\s*${WORD}`, 'g'))) add(m[1]);
  // tee [-a] f...
  for (const m of s.matchAll(new RegExp(String.raw`\btee\s+(?:-{1,2}[a-z-]+\s+)*${WORD}`, 'gi'))) add(m[1]);
  // PowerShell writers: -FilePath / -Path, or the first positional argument.
  for (const m of s.matchAll(new RegExp(String.raw`\b(?:Out-File|Set-Content|Add-Content)\b(?:\s+-(?:FilePath|Path|LiteralPath))?\s+${WORD}`, 'gi'))) add(m[1]);
  // cp / mv / Copy-Item / Move-Item: the last argument of the segment is the destination.
  for (const seg of s.split(/\|\||&&|[;|\n]/)) {
    const words = [...seg.trim().matchAll(new RegExp(WORD, 'g'))].map((m) => m[1]);
    const at = words.findIndex((w) => /^(?:cp|mv|copy|move|Copy-Item|Move-Item)$/i.test(w));
    if (at < 0) continue;
    const args = words.slice(at + 1).filter((w) => !/^-/.test(w));
    const dest = words.slice(at + 1).find((w, i, all) => /^-Destination$/i.test(all[i - 1] ?? ''));
    if (dest) add(dest); else if (args.length >= 2) add(args.at(-1));
  }
  return out;
}

const ANSWER_LOG = /(?:^|[\\/])\.ai[\\/]workflows[\\/][^\\/]+[\\/](?:po-answers|steer)\.md$/i;

/** The refusal of a shell command, or null when it writes no guarded file. */
export function shellWriteRefusal(command, cwd, projectRoot) {
  for (const t of shellWriteTargets(command)) {
    const abs = isAbsolute(t) ? t : resolve(cwd, t);
    if (ANSWER_LOG.test(abs.replace(/\\/g, '/'))) {
      return `shell-write-guard: blocked a shell write to ${t}. The answers of the person go into the decision store: ` +
        '`node <plugin root>/skills/wf/scripts/wf.mjs decide add <root> <slug> --answer "<answer>" --key <key> --question "<question>"`, ' +
        'or `decide add <root> <slug> --file <answers.json>` for several. `decide list` reads them.\n';
    }
    const target = linkedLocalTarget(projectRoot, abs);
    if (target) {
      return `shell-write-guard: blocked a shell write to ${abs}. This project keeps its workflows in the records repo clone, not in .ai/workflows/. ` +
        `A draft goes to <wf-dir>/.draft/.\nfix: write the file at ${target}.\n`;
    }
  }
  return null;
}

export async function run(input) {
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return;
  // A command that writes no file has nothing to guard: no project root, no config.
  if (!shellWriteTargets(command).length) return;
  const projectRoot = hookProjectRoot(input);
  const mode = checksModeOf(await hookConfig(input));
  if (mode === 'off') return;
  const refusal = shellWriteRefusal(command, input?.cwd ?? projectRoot, projectRoot);
  if (refusal) refuseWrite(mode, refusal);
}

if (isEntry('shell-write-guard')) runStandalone('shell-write-guard', run);
