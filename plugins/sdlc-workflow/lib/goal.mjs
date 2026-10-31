// lib/goal.mjs — the goal contract of /wf loop goal, pure parts.
//
// The host carries the loop (Claude Code `/goal`, Codex goals). /wf owns the
// evidence: `scripts/goal.mjs check` runs the rule of the contract's `kind` and
// prints the evidence, then one last line, `GOAL: MET`, `GOAL: NOT-MET <reason>` or
// `GOAL: BLOCKED <reason>`. The condition tells the host judge to trust only that
// line. Nothing here asks a model: the check is a rule, not a judgment.

export const KINDS = Object.freeze(['lifecycle', 'optimize', 'proofs']);
export const HOSTS = Object.freeze(['claude-code', 'codex', 'pi']);
export const STATES = Object.freeze(['armed', 'met', 'blocked', 'cleared']);
export const VERDICTS = Object.freeze(['MET', 'NOT-MET', 'BLOCKED']);
export const DEFAULT_MAX_CHECKS = 30;
/** Claude Code accepts a condition of up to 4,000 characters. */
export const CONDITION_LIMIT = 4000;
/** The evidence lines that `check` prints for each proof command. */
export const EVIDENCE_TAIL = 20;

const str = (v) => String(v ?? '').trim();

/** The errors of a contract; an empty list means the contract is valid. */
export function contractErrors(c) {
  const errors = [];
  if (!c || typeof c !== 'object') return ['the contract has no frontmatter'];
  if (!str(c.objective)) errors.push('objective is empty');
  if (!KINDS.includes(c.kind)) errors.push(`kind must be one of ${KINDS.join(', ')}`);
  if (c.kind === 'proofs') {
    if (!Array.isArray(c.proofs) || !c.proofs.length || c.proofs.some((p) => !str(p))) errors.push('kind proofs needs at least one proof command');
  }
  const max = Number(c['max-checks']);
  if (!Number.isInteger(max) || max < 1) errors.push('max-checks must be a positive integer');
  if (c.host !== undefined && c.host !== null && !HOSTS.includes(c.host)) errors.push(`host must be one of ${HOSTS.join(', ')}`);
  if (c.state !== undefined && !STATES.includes(c.state)) errors.push(`state must be one of ${STATES.join(', ')}`);
  return errors;
}

/** The last line of every check. A reason never spans lines. */
export function goalLine(verdict, reason = '') {
  if (!VERDICTS.includes(verdict)) throw new Error(`unknown verdict ${verdict}`);
  const r = str(reason).replace(/\s+/g, ' ');
  return verdict === 'MET' || !r ? `GOAL: ${verdict}` : `GOAL: ${verdict} ${r}`;
}

/** Parse a `GOAL:` line back; null when the text holds none. Used by the tests and the mod. */
export function lastGoalLine(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^GOAL: (MET|NOT-MET|BLOCKED)(?: (.*))?$/.exec(lines[i]);
    if (m) return { verdict: m[1], reason: m[2] ?? '' };
  }
  return null;
}

/** Quote a path for the condition: forward slashes, double quotes. */
const quotePath = (p) => `"${String(p).replace(/\\/g, '/')}"`;

/**
 * The condition text of section 4.4, the same for every host. `script` is the path of
 * skills/wf/scripts/goal.mjs; `root` the project root.
 */
export function conditionText({ script, root, slug, maxChecks }) {
  const check = `node ${quotePath(script)} check ${quotePath(root)} ${slug}`;
  const text =
    `The goal is met only when the most recent output of \`${check}\` in this conversation ends with the line ` +
    '`GOAL: MET`. If that line is `GOAL: BLOCKED`, the goal is impossible. A claim without that output is not ' +
    `evidence. Stop after ${maxChecks} checks.`;
  if (text.length > CONDITION_LIMIT) throw new Error(`the condition is ${text.length} characters, above the limit of ${CONDITION_LIMIT}`);
  return text;
}

/** How each host arms the goal (section 4.4). The spelling of the host commands lives here and in _host-invocation.md. */
export function armPlan(host, condition) {
  if (host === 'codex') {
    return {
      how: 'create_goal',
      instruction: 'Call the create_goal tool with the condition as the objective. Call update_goal to complete the goal only in a turn whose check printed GOAL: MET. When features.goals is off, tell the person to run `codex features enable goals`, then stop. /goal clear removes the goal.',
      condition,
    };
  }
  if (host === 'pi') {
    return { how: 'in-session', instruction: 'pi has no host goal. Run the auto loop in this session and run check after each stage.', condition };
  }
  return {
    how: 'goal-command',
    command: `/goal ${condition}`,
    instruction: 'The model cannot type /goal. On Claude Code Desktop the mod submits the command after this turn. On the CLI, the mod puts it into the prompt box; when it cannot, the person pastes it. Headless: claude -p "/goal <condition>". /goal clear (or /clear) removes the goal.',
    condition,
  };
}

/** The command that clears the host goal (section 4.2 clear). */
export function clearPlan(host) {
  if (host === 'codex') return 'Run /goal clear in Codex, or ask the model to stop the goal.';
  if (host === 'pi') return 'pi has no host goal: nothing more to clear.';
  return 'Run /goal clear in Claude Code. /clear also removes the goal.';
}

/**
 * The verdict of one check, before the rule of the kind runs. `count` is the number of
 * checks of this arming before this one.
 */
export function precheck(contract, count) {
  if (!contract) return { verdict: 'BLOCKED', reason: 'no goal contract: run /wf loop goal <slug> first' };
  if (contract.state === 'cleared') return { verdict: 'BLOCKED', reason: 'the goal is cleared: run /wf loop goal <slug> resume to arm it again' };
  const parked = contract.parked;
  if (parked && str(parked.gate)) return { verdict: 'BLOCKED', reason: `gate ${str(parked.gate)}${str(parked.reason) ? `: ${str(parked.reason)}` : ''}` };
  const max = Number(contract['max-checks']) || DEFAULT_MAX_CHECKS;
  if (count + 1 > max) return { verdict: 'BLOCKED', reason: `budget: ${max} checks used. Run /wf loop goal <slug> resume, with a new max-checks when more are needed` };
  return null;
}

/** Map the lifecycle verdict (lib/lifecycle-done.mjs) to a goal verdict. */
export function fromLifecycle(l) {
  if (l.verdict === 'met') return { verdict: 'MET', reason: '' };
  if (l.verdict === 'blocked') return { verdict: 'BLOCKED', reason: l.reason };
  const next = l.next ? `next: ${l.next.stage}${l.next.slice ? ` ${l.next.slice}` : ''}. ` : '';
  return { verdict: 'NOT-MET', reason: `${next}${l.reason}` };
}

/** Map `optimize.mjs status` to a goal verdict: complete is MET, stopped is BLOCKED (section 4.1). */
export function fromOptimize(s) {
  if (!s || s.ok === false) return { verdict: 'BLOCKED', reason: s?.error ? `optimize: ${s.error}` : 'optimize: no state' };
  if (s.state === 'complete' || s.state === 'finished') return { verdict: 'MET', reason: '' };
  if (s.state === 'stopped') return { verdict: 'BLOCKED', reason: `optimize stopped: ${s.reason}` };
  return { verdict: 'NOT-MET', reason: `optimize: next ${s.next?.action ?? 'trial'}${s.next?.on ? ` on ${s.next.on}` : ''}` };
}

/** Map the proof runs to a goal verdict. */
export function fromProofs(runs) {
  const failed = runs.filter((r) => r.code !== 0);
  if (!failed.length) return { verdict: 'MET', reason: '' };
  return { verdict: 'NOT-MET', reason: `${failed.length} of ${runs.length} proof(s) fail: ${failed.map((r) => r.command).join('; ')}` };
}

/** The YAML frontmatter of goal.md, in a fixed key order. */
export function renderGoalMd(c, prose = '') {
  const lines = ['---', 'schema: sdlc/v1', 'type: goal', `slug: ${JSON.stringify(c.slug)}`, `objective: ${JSON.stringify(c.objective)}`, `kind: ${c.kind}`];
  if (c.kind === 'proofs') {
    lines.push('proofs:');
    for (const p of c.proofs) lines.push(`  - ${JSON.stringify(p)}`);
  }
  lines.push(`max-checks: ${c['max-checks']}`);
  lines.push(`arming: ${c.arming ?? 0}`);
  lines.push(`armed-at: ${c['armed-at'] ? JSON.stringify(c['armed-at']) : 'null'}`);
  lines.push(`host: ${c.host ?? 'claude-code'}`);
  lines.push(`state: ${c.state ?? 'armed'}`);
  if (c.parked && str(c.parked.gate)) {
    lines.push('parked:');
    lines.push(`  gate: ${JSON.stringify(c.parked.gate)}`);
    lines.push(`  reason: ${JSON.stringify(c.parked.reason ?? '')}`);
    lines.push(`  at: ${JSON.stringify(c.parked.at ?? '')}`);
  } else {
    lines.push('parked: null');
  }
  lines.push('---', '');
  const body = str(prose) || `# Goal\n\n${c.objective}\n\nThe worker follows skills/wf/reference/goal.md. Only \`goal.mjs check\` decides that the goal is met.`;
  return `${lines.join('\n')}\n${body}\n`;
}
