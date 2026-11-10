// lib/fix.mjs — the repair that every failure of a script names.
//
// A failure prints `{ ok: false, error, fix }`. `fix` says who repairs it and how:
//
//   { who: 'agent',  do: '<one plain sentence>', command?: '<the exact next command>', then?: '<what runs after it>' }
//   { who: 'person', do: '<one plain sentence for the person>' }
//
// `agent` is a repair that the agent makes alone: a missing argument, a wrong key whose valid
// values are known, a command run in the wrong order. `person` is a repair that only the
// person makes: a sign-in, a merge conflict, a gate, a branch move, a broken install, and every
// destructive step (a delete of a branch, a force, a reset, a remove of a worktree). A person
// fix never carries a command: the agent does not run it.
//
// A lib throws `refuse(message, fix)`; a script's top-level handler prints it with
// `failureOf(e, script)`. An error that carries no fix is a defect of the plugin: the handler
// writes it to the machine error log and the fix says to report it.

import { appendLogLine, errorsLogPath } from './home.mjs';

export const FIX_WHO = Object.freeze(['agent', 'person']);

/** The repair of a failure that the agent makes alone. */
export function agentFix(doText, command = null, then = null) {
  return { who: 'agent', do: doText, ...(command ? { command } : {}), ...(then ? { then } : {}) };
}

/** The repair of a failure that only the person makes. */
export function personFix(doText) {
  return { who: 'person', do: doText };
}

/** An error that names its repair. `fields` go into the printed result beside `error`. */
export class Refusal extends Error {
  constructor(message, fix, fields = null) {
    super(message);
    this.name = 'Refusal';
    this.fix = fix;
    if (fields) this.fields = fields;
  }
}

/** A refusal to throw: `throw refuse('no baseline', agentFix('run baseline first', cmd))`. */
export const refuse = (message, fix, fields = null) => new Refusal(message, fix, fields);

/**
 * The fix of an error in its printed shape. A string is the command of an older refusal of
 * wf.mjs (`fix: <command>`): the agent runs it.
 */
export function asFix(fix) {
  if (!fix) return null;
  if (typeof fix === 'string') return agentFix('Run this command, then the first command again.', fix);
  return fix;
}

/** One failure result: `{ ok: false, ...fields, error, fix }`. */
export function failure(error, fix, fields = {}) {
  return { ok: false, ...fields, error, fix: asFix(fix) };
}

/**
 * The fix of an error that carries none: a defect of the plugin. The error and its stack go to
 * the machine error log, which the fix names. It never invents a repair.
 */
export function defectFix(script, err) {
  const log = errorsLogPath();
  try {
    appendLogLine(log, JSON.stringify({
      at: new Date().toISOString(), label: `script:${script}`, repoRoot: process.cwd(),
      message: err?.message ?? String(err), stack: err?.stack ?? null, context: {},
    }));
  } catch { /* the fix still names the log */ }
  return personFix(`Report this error: it is a defect of the plugin. The error and its stack are in ${log}.`);
}

/** The printed result of a thrown error: its own fix, or the defect fix. */
export function failureOf(e, script) {
  const fix = asFix(e?.fix) ?? defectFix(script, e);
  return { ok: false, ...(e?.fields ?? {}), error: e?.message ?? String(e), fix };
}

/** A result that failed with no fix gets the defect fix; any other result stays as it is. */
export function withFix(out, script) {
  if (out && typeof out === 'object' && out.ok === false && !out.fix) {
    out.fix = defectFix(script, new Error(out.error ?? out.reason ?? 'a failure with no error text'));
  } else if (out && typeof out === 'object' && out.ok === false) {
    out.fix = asFix(out.fix);
  }
  return out;
}

/** The lines of a fix on stderr, for a script that prints text. The command keeps its `fix: <command>` line. */
export function fixLines(fix) {
  const f = asFix(fix);
  if (!f) return [];
  return [
    `fix.who: ${f.who}`,
    `fix.do: ${f.do}`,
    ...(f.command ? [`fix: ${f.command}`] : []),
    ...(f.then ? [`fix.then: ${f.then}`] : []),
  ];
}

/** True when `fix` has the printed shape. */
export function isFix(fix) {
  if (!fix || typeof fix !== 'object' || !FIX_WHO.includes(fix.who)) return false;
  if (typeof fix.do !== 'string' || !fix.do.trim()) return false;
  if (fix.who === 'person' && fix.command) return false;
  if (fix.command != null && (typeof fix.command !== 'string' || !fix.command.trim())) return false;
  if (fix.then != null && (typeof fix.then !== 'string' || !fix.then.trim())) return false;
  return true;
}
