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

// Change one suite of the profile and write the config back. It keeps the other settings,
// the two-space indent and the line endings.
function updateSuite(root, suite, change) {
  if (!SUITES.includes(suite)) throw new Error(`suite must be one of ${SUITES.join(', ')}`);
  const file = configFile(root);
  const cfg = readConfig(root);
  const profile = cfg.testProfile && typeof cfg.testProfile === 'object' ? cfg.testProfile : {};
  profile[suite] = change(profile[suite] ?? {});
  cfg.testProfile = profile;
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(`${file}.tmp`, `${JSON.stringify(cfg, null, 2).replace(/\n/g, eol)}${eol}`);
  renameSync(`${file}.tmp`, file);
  return profile[suite];
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
  if (!readProfile(root)[suite]?.command) throw new Error(`the test profile has no command for the ${suite} suite`);
  return updateSuite(root, suite, (s) => ({ ...s, measuredSeconds: Math.round(seconds), measuredAt: now, ...(passedAt ? { passedAt } : {}) }));
}

// The suites that each stage runs. Verify reuses the implement results at the same commit.
export const STAGE_SUITES = { implement: SLICE_SUITES, verify: SLICE_SUITES, review: PACKET_SUITES, 'update-deps': ['full'] };

/** One line per suite, for a brief or a status. */
export function profileLines(profile) {
  return SUITES.filter((s) => profile[s]).map((s) => {
    const p = profile[s];
    const t = Number.isInteger(p.measuredSeconds) ? `${p.measuredSeconds}s measured` : Number.isInteger(p.estimateSeconds) ? `${p.estimateSeconds}s estimated` : 'no time';
    return `${s}: \`${p.command}\` (${t})`;
  });
}
