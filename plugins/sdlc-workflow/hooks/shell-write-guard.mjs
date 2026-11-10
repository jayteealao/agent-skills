#!/usr/bin/env node
/**
 * PreToolUse(Bash|PowerShell) shell-write guard.
 *
 * The write check of pre-write-validate sees Write, Edit and MultiEdit only. A shell command
 * writes files too: a redirect (`>`, `>>`, `>|`, `&>`, `&>>`), `tee`, `cp`, `mv`, `sed -i`,
 * `dd of=`, and in PowerShell `Out-File`, `Set-Content`, `Add-Content`, `New-Item`, `Copy-Item`,
 * `Move-Item` and `[IO.File]::WriteAllText(...)`. This guard reads the targets of those writes
 * and refuses:
 * - a target that is a local workflow path of a linked project (the file belongs in the wf-dir
 *   in the records repo clone, as the Write check says), and
 * - a target that is the answer log `po-answers.md` or `steer.md` of a workflow: answers go
 *   through `wf.mjs decide add`.
 * The command is read as words: a heredoc body and the inside of a quoted string are text, not
 * commands, so a command that only mentions a guarded path passes. A `cd <dir>` earlier in the
 * command moves the folder that later relative targets resolve against.
 * A command whose targets this guard cannot read passes: a target that holds a variable (`$f`,
 * `"$dir/x"`), or a relative target after a `cd` to a folder this guard cannot read.
 *
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */

import { isAbsolute, resolve } from 'node:path';
import { checksModeOf } from '../lib/config.mjs';
import { hookConfig, hookProjectRoot, isEntry, refuseWrite, runStandalone } from '../lib/hook-runner.mjs';
import { linkedLocalTarget } from '../lib/records-root.mjs';

const NOT_A_FILE = /^(?:&\d*|\/dev\/null|nul|\$null|NUL)$/i;

/** The command with its heredoc bodies and PowerShell here-string bodies taken out. */
function withoutHeredocBodies(s) {
  const text = s.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "''");
  const lines = text.split('\n');
  const out = [];
  const waiting = [];
  for (const line of lines) {
    if (waiting.length) {
      if (line.replace(/\r$/, '').trim() === waiting[0]) waiting.shift();
      continue;
    }
    out.push(line);
    for (const m of line.matchAll(/(?<!<)<<-?(?!<)\s*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][\w.-]*))/g)) waiting.push(m[1] ?? m[2] ?? m[3]);
  }
  return out.join('\n');
}

/**
 * The command as segments of words. Each word is `{ text, quoted, variable }`; a redirect target
 * is a word with `redirect: true`. `;`, `&&`, `||`, `|`, `&` and a newline end a segment.
 */
function segmentsOf(command) {
  const s = withoutHeredocBodies(String(command ?? ''));
  const segments = [[]];
  let word = null;
  let pendingRedirect = false;
  let dropNext = false;
  const start = () => { if (!word) word = { text: '', quoted: false, variable: false }; };
  const flush = () => {
    if (!word) return;
    const w = word;
    word = null;
    if (dropNext) { dropNext = false; return; }
    if (pendingRedirect) { w.redirect = true; pendingRedirect = false; }
    segments.at(-1).push(w);
  };
  const endSegment = () => { flush(); pendingRedirect = false; dropNext = false; if (segments.at(-1).length) segments.push([]); };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      start(); word.quoted = true;
      const j = s.indexOf("'", i + 1);
      const end = j < 0 ? s.length : j;
      word.text += s.slice(i + 1, end); i = end + 1; continue;
    }
    if (c === '"') {
      start(); word.quoted = true;
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' && s[j + 1] === '"' ? 2 : 1;
      const inner = s.slice(i + 1, j);
      if (/\$[\w{(]/.test(inner)) word.variable = true;
      word.text += inner.replace(/\\"/g, '"'); i = j + 1; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '(' || c === ')' || c === ',') { flush(); i += 1; continue; }
    if (c === '\n' || c === ';') { endSegment(); i += 1; continue; }
    if (c === '#' && !word) { while (i < s.length && s[i] !== '\n') i += 1; continue; }
    if (c === '|' && s[i + 1] === '|') { endSegment(); i += 2; continue; }
    if (c === '&' && s[i + 1] === '>') {
      flush(); i += s[i + 2] === '>' ? 3 : 2; pendingRedirect = true; continue;
    }
    if (c === '&' && s[i + 1] === '&') { endSegment(); i += 2; continue; }
    if (c === '&') { endSegment(); i += 1; continue; }
    if (c === '|') { endSegment(); i += 1; continue; }
    if (c === '>') {
      // `2>` takes the fd number from the word; `x>f` ends the word x.
      if (word && /^\d+$/.test(word.text) && !word.quoted) word = null; else flush();
      i += 1;
      if (s[i] === '>' || s[i] === '|') i += 1;
      if (s[i] === '&') { i += 1; while (i < s.length && /[\w-]/.test(s[i])) i += 1; continue; }
      pendingRedirect = true; continue;
    }
    if (c === '<') {
      flush();
      while (s[i] === '<') i += 1;
      if (s[i] === '-') i += 1;
      // An input redirect, a heredoc delimiter or a here-string: the next word is not a target.
      if (s[i] !== '(') dropNext = true;
      continue;
    }
    start();
    if (c === '$' && !word.quoted) word.variable = true;
    word.text += c; i += 1;
  }
  flush();
  return segments.filter((seg) => seg.length);
}

const PREFIX = /^(?:sudo|command|builtin|exec|nohup|time|then|do|else|elif|if|while|until|!|\{|\})$/;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;

/** The index of the command word of a segment, after assignments and prefixes. */
function commandAt(words) {
  let i = 0;
  while (i < words.length) {
    const t = words[i].text;
    if (PREFIX.test(t) || (!words[i].quoted && ASSIGNMENT.test(t))) { i += 1; continue; }
    if (t.startsWith('$') && words[i + 1]?.text === '=') { i += 2; continue; }
    break;
  }
  return i;
}

const PS_PATH_FLAG = /^-(?:FilePath|Path|LiteralPath)$/i;
const PS_VALUE_FLAG = /^-(?:Value|Encoding|InputObject|Width|ItemType|Name|Stream)$/i;
const IO_FILE_WRITE = /^\[(?:System\.)?IO\.File\]::(?:WriteAll(?:Text|Lines|Bytes)|AppendAll(?:Text|Lines)|Create|CreateText|AppendText|OpenWrite)$/i;

/** The targets that the command word of a segment writes, as words. */
function commandTargets(cmd, args) {
  const name = cmd.text;
  const plain = args.filter((w) => !w.quoted ? !/^-/.test(w.text) : true);
  if (/^tee$/i.test(name)) return plain;
  if (/^(?:cp|mv|copy|move|Copy-Item|Move-Item)$/i.test(name)) {
    const at = args.findIndex((w) => /^-Destination$/i.test(w.text));
    if (at >= 0) return args[at + 1] ? [args[at + 1]] : [];
    return plain.length >= 2 ? [plain.at(-1)] : [];
  }
  if (/^(?:Out-File|Set-Content|Add-Content|New-Item)$/i.test(name)) {
    if (/^New-Item$/i.test(name)) {
      const type = args.findIndex((w) => /^-ItemType$/i.test(w.text));
      if (type >= 0 && /^(?:Directory|SymbolicLink|Junction|HardLink)$/i.test(args[type + 1]?.text ?? '')) return [];
    }
    let target = null;
    let positional = null;
    let childName = null;
    for (let k = 0; k < args.length; k += 1) {
      const t = args[k].text;
      if (!args[k].quoted && PS_PATH_FLAG.test(t)) { target = args[k + 1] ?? null; k += 1; continue; }
      if (!args[k].quoted && /^-Name$/i.test(t)) { childName = args[k + 1] ?? null; k += 1; continue; }
      if (!args[k].quoted && PS_VALUE_FLAG.test(t)) { k += 1; continue; }
      if (!args[k].quoted && /^-/.test(t)) continue;
      if (!positional) positional = args[k];
    }
    const base = target ?? positional;
    if (!base) return [];
    if (childName && /^New-Item$/i.test(name)) {
      return [{ ...base, text: `${base.text.replace(/[\\/]+$/, '')}/${childName.text}`, variable: base.variable || childName.variable }];
    }
    return [base];
  }
  if (/^sed$/i.test(name)) {
    if (!args.some((w) => !w.quoted && /^(?:-i\S*|--in-place\S*|-[a-zA-Z]*i)$/.test(w.text))) return [];
    const files = [];
    let script = false;
    for (let k = 0; k < args.length; k += 1) {
      const w = args[k];
      if (!w.quoted && /^-(?:e|f)$|^--(?:expression|file)$/.test(w.text)) { script = true; k += 1; continue; }
      if (!w.quoted && /^-i$/.test(w.text) && args[k + 1]?.quoted && args[k + 1].text === '') { k += 1; continue; }
      if (!w.quoted && /^-/.test(w.text)) continue;
      if (!script) { script = true; continue; }
      files.push(w);
    }
    return files;
  }
  if (/^dd$/i.test(name)) {
    return args.filter((w) => w.text.startsWith('of=')).map((w) => ({ ...w, text: w.text.slice(3) }));
  }
  if (IO_FILE_WRITE.test(name)) return args[0] ? [args[0]] : [];
  return [];
}

const join = (dir, t) => (isAbsolute(t) || /^[a-zA-Z]:[\\/]/.test(t) ? t : `${dir.replace(/[\\/]+$/, '')}/${t}`);

/** The file targets that a shell command writes, as written in the command. */
export function shellWriteTargets(command) {
  const out = [];
  // undefined: the folder of the command; null: a folder this guard cannot read.
  let dir;
  const add = (w) => {
    const v = w.text;
    if (!v || NOT_A_FILE.test(v) || w.variable) return;
    const relative = !(isAbsolute(v) || /^[a-zA-Z]:[\\/]/.test(v));
    if (dir === null && relative) return;
    out.push(dir === undefined ? v : join(dir, v));
  };
  for (const seg of segmentsOf(command)) {
    for (const w of seg) if (w.redirect) add(w);
    const words = seg.filter((w) => !w.redirect);
    const at = commandAt(words);
    const cmd = words[at];
    if (!cmd) continue;
    const args = words.slice(at + 1);
    if (/^(?:cd|pushd|chdir|Set-Location|Push-Location|sl)$/i.test(cmd.text)) {
      const to = args.filter((w) => !(!w.quoted && /^(?:-(?:Path|LiteralPath)|\/d)$/i.test(w.text)))[0];
      if (!to || to.variable || /^[~-]/.test(to.text)) dir = null;
      else if (dir !== null) dir = dir === undefined ? to.text : join(dir, to.text);
      else if (isAbsolute(to.text) || /^[a-zA-Z]:[\\/]/.test(to.text)) dir = to.text;
      continue;
    }
    for (const w of commandTargets(cmd, args)) add(w);
  }
  return out;
}

const ANSWER_LOG = /(?:^|[\\/])\.ai[\\/]workflows[\\/][^\\/]+[\\/](?:po-answers|steer)\.md$/i;

/** A Git Bash drive path (`/c/x`) as a Windows path (`C:/x`). */
const nativePath = (t, platform) => (platform === 'win32' ? t.replace(/^\/([a-zA-Z])(?=[\\/]|$)/, (_, d) => `${d.toUpperCase()}:`) : t);

/** The refusal of a shell command, or null when it writes no guarded file. */
export function shellWriteRefusal(command, cwd, projectRoot, platform = process.platform) {
  for (const written of shellWriteTargets(command)) {
    const t = nativePath(written, platform);
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
