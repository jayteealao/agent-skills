// The test profile of a project: the `testProfile` setting of .ai/sdlc-config.json.
//
// Four suites, each with a command, an estimate that intake writes without a run, and the time
// of the last real run. The measured time replaces the estimate. A slice runs the fast and
// affected suites; the full and heavy suites run once per packet, after the review fixes. The
// time box of a stage agent is computed from these times.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUITES = ['fast', 'affected', 'full', 'heavy'];
export const SLICE_SUITES = ['fast', 'affected'];
export const PACKET_SUITES = ['full', 'heavy'];
// The time box is this many times the expected suite time, and never less than the floor.
export const TIME_BOX_FACTOR = 3;
export const TIME_BOX_FLOOR_SECONDS = 600;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const configFile = (root) => join(root, '.ai', 'sdlc-config.json');

function readConfig(root) {
  const file = configFile(root);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The testProfile setting of a project, or {}. */
export function readProfile(root) {
  const p = readConfig(root).testProfile;
  return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
}

/** The expected seconds of a suite: the measured time, else the estimate, else null. */
export function suiteSeconds(profile, suite) {
  const s = profile?.[suite];
  if (!s) return null;
  if (Number.isInteger(s.measuredSeconds)) return s.measuredSeconds;
  if (Number.isInteger(s.estimateSeconds)) return s.estimateSeconds;
  return null;
}

/**
 * The time box of an agent that runs some suites, in seconds: the factor times their expected
 * time, plus the work time that the caller adds, and never less than the floor.
 * Returns { seconds, from } where `from` names the suites that had a time.
 */
export function timeBox(profile, suites, { workSeconds = 0, factor = TIME_BOX_FACTOR, floor = TIME_BOX_FLOOR_SECONDS } = {}) {
  const from = suites.filter((s) => suiteSeconds(profile, s) != null);
  const tests = from.reduce((sum, s) => sum + suiteSeconds(profile, s), 0);
  return { seconds: Math.max(floor, Math.round(factor * tests + workSeconds)), from };
}

// Read the config, let `mutate` change the test profile in place, and write the config back.
// It keeps the other settings, the two-space indent and the line endings. Returns what
// `mutate` returns.
function writeProfile(root, mutate) {
  const file = configFile(root);
  const cfg = readConfig(root);
  const profile = cfg.testProfile && typeof cfg.testProfile === 'object' ? cfg.testProfile : {};
  const result = mutate(profile);
  cfg.testProfile = profile;
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(`${file}.tmp`, `${JSON.stringify(cfg, null, 2).replace(/\n/g, eol)}${eol}`);
  renameSync(`${file}.tmp`, file);
  return result;
}

/** The command that sets a suite, with `<root>` for the project root. */
export const setSuiteFix = (suite) => `wf.mjs profile set <root> ${suite} --command "<command>" --estimate <seconds>`;

/** The refusal for a suite that has no command; its `fix` names the command that sets one. */
export function noCommand(suite, prefix = '') {
  return Object.assign(new Error(`${prefix}the test profile has no command for the ${suite} suite`), { fix: setSuiteFix(suite) });
}

// Change one suite of the profile and write the config back. Returns the suite entry.
function updateSuite(root, suite, change) {
  if (!SUITES.includes(suite)) throw new Error(`suite must be one of ${SUITES.join(', ')}`);
  return writeProfile(root, (profile) => (profile[suite] = change(profile[suite] ?? {})));
}

/** Set the command and the estimate of a suite. A measured time stays. Returns the suite entry. */
export function setSuite(root, suite, { command, estimateSeconds }) {
  if (!command || !String(command).trim()) throw new Error('a suite needs a command');
  if (!Number.isInteger(estimateSeconds) || estimateSeconds < 0) throw new Error('the estimate must be a whole number of seconds');
  return updateSuite(root, suite, (s) => ({ ...s, command: String(command).trim(), estimateSeconds }));
}

/** Record a real run of a suite: its time replaces the estimate. Returns the suite entry. */
// `passedAt` is the commit that a passing run checked: a later reader runs the suite again only
// when a file that the suite reads changed after it.
export function recordRun(root, suite, seconds, { now = nowIso(), passedAt = null } = {}) {
  if (!SUITES.includes(suite)) throw new Error(`suite must be one of ${SUITES.join(', ')}`);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('seconds must be a number of 0 or more');
  if (!readProfile(root)[suite]?.command) throw noCommand(suite);
  return updateSuite(root, suite, (s) => ({ ...s, measuredSeconds: Math.round(seconds), measuredAt: now, ...(passedAt ? { passedAt } : {}) }));
}

// The suites that each stage runs. Verify reuses the implement results at the same commit.
export const STAGE_SUITES = { implement: SLICE_SUITES, verify: SLICE_SUITES, review: PACKET_SUITES, 'update-deps': ['full'] };

// The check budget of a project: `testProfile.budget`. The person chooses it once per repo.
//   slice     the longest check that a slice stage may run, in seconds; a longer command is a
//             long run. Without it, the time box of the stage is the limit.
//   long      the longest single long run (a fit, a proof, a calibration, a coverage pass)
//             before the agent must offer the faster paths; null is no limit
//   machines  the machines that the person allows for split runs, by name
export const BUDGET_PRESETS = {
  'fast-loop': { slice: 120, long: 3600 },
  balanced: { slice: 600, long: 3600 },
  thorough: { slice: null, long: null },
};

/** The budget of a profile, or null when the person did not choose one. */
export function readBudget(profile) {
  const b = profile?.budget;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

/**
 * The longest check that a stage may run, in seconds: `budget.slice` for a slice stage when it
 * is set, else the time box of the stage. Returns { seconds, from }.
 */
export function checkLimit(profile, stage) {
  const b = readBudget(profile);
  if (b && Number.isInteger(b.slice) && (stage === 'implement' || stage === 'verify')) return { seconds: b.slice, from: 'budget' };
  const box = timeBox(profile, STAGE_SUITES[stage] ?? []);
  return { seconds: box.seconds, from: 'time box' };
}

/** True when a long run of this many seconds is over `budget.long`. No budget or no limit is never over. */
export function overLongBudget(profile, seconds) {
  const b = readBudget(profile);
  return Boolean(b && Number.isInteger(b.long) && Number.isFinite(seconds) && seconds > b.long);
}

/**
 * Set the budget. A preset gives slice and long; --slice, --long and --machines change one
 * field. A slice or long value that differs from the preset drops the preset label. Keeps the
 * suites and the other settings. Returns the budget.
 */
export function setBudget(root, { preset = null, slice, long, machines } = {}) {
  if (preset != null && !BUDGET_PRESETS[preset]) throw new Error(`the preset must be one of ${Object.keys(BUDGET_PRESETS).join(', ')}`);
  const secs = (v, name) => {
    if (v === undefined) return undefined;
    if (v === null || v === 'none') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number of seconds, or none`);
    return n;
  };
  return writeProfile(root, (profile) => {
    const next = { ...(readBudget(profile) ?? {}), ...(preset ? { preset, ...BUDGET_PRESETS[preset] } : {}) };
    delete next.setAt;
    const s = secs(slice, 'slice'); if (s !== undefined) next.slice = s;
    const l = secs(long, 'long'); if (l !== undefined) next.long = l;
    if (machines !== undefined) next.machines = String(machines).split(',').map((m) => m.trim()).filter(Boolean);
    if (!Array.isArray(next.machines)) next.machines = [];
    // The preset label names its slice and long values. When one of them differs, drop the label.
    const named = BUDGET_PRESETS[next.preset];
    if (next.preset != null && (!named || named.slice !== next.slice || named.long !== next.long)) delete next.preset;
    profile.budget = next;
    return next;
  });
}

/** One line for the budget, or null when the person did not choose one. */
export function budgetLine(profile) {
  const b = readBudget(profile);
  if (!b) return null;
  const t = (v) => (Number.isInteger(v) ? `${v}s` : 'no limit');
  return `budget${b.preset ? ` (${b.preset})` : ''}: slice checks up to ${t(b.slice)}; one long run up to ${t(b.long)}; machines: ${(b.machines ?? []).join(', ') || 'this one'}`;
}

/** One line per suite, and the budget, for a brief or a status. */
export function profileLines(profile) {
  const lines = SUITES.filter((s) => profile[s]).map((s) => {
    const p = profile[s];
    const t = Number.isInteger(p.measuredSeconds) ? `${p.measuredSeconds}s measured` : Number.isInteger(p.estimateSeconds) ? `${p.estimateSeconds}s estimated` : 'no time';
    return `${s}: \`${p.command}\` (${t})`;
  });
  const b = budgetLine(profile);
  return b ? [...lines, b] : lines;
}
