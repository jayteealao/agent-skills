// The wait of a running stage for the answer to a question that it holds (`decide wait`).
// The stage blocks in this command and keeps its context, so the answer needs no new run of
// the stage.
//
// One call blocks for a short time, and the stage calls it again until each question has an
// answer. A call is shorter than the 5 minutes that the prompt cache of a stage agent lives, so
// each new call reads the context of the agent from the cache. The wait has no limit of its
// own: the main session asks the person, or answers for a person who is away.
import { registerWatch } from './records-committer.mjs';
import { answeredBy, decisionsOf } from './decisions.mjs';
import { agentFix, refuse } from './fix.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';

/** The longest block of one call. */
export const WAIT_CALL_MS = 4 * 60 * 1000;
/** The time between two reads of the decision store. */
export const WAIT_POLL_MS = 2000;

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The held questions of the index, as objects. */
export function heldQuestions(dir) {
  const open = frontmatterOfDoc(dir, INDEX_NAME)?.['open-questions'];
  return Array.isArray(open) ? open.filter((q) => q && typeof q === 'object' && q.key) : [];
}

/**
 * Block until each key has a live answer, or the call runs out of time.
 *
 * @param {string} dir the folder of the workflow
 * @param {object} o
 * @param {string[]} o.keys the keys of the held questions
 * @param {object} [o.scope] the scope of the answers (`scopeOf` of the CLI)
 * @param {number} [o.callMs] the longest block of this call
 * @param {number} [o.pollMs]
 * @param {() => number} [o.now]
 * @param {(ms: number) => void} [o.sleep]
 * @param {(info: { until: number, questions: object[] }) => void} [o.onStart] called once before the block
 * @param {(info: { state: string }) => void} [o.onEnd] called once after the block
 * @param {() => any} [o.interrupt] asked at each poll: a value that is not null ends this call early, with the
 *   questions still open, and comes back as `interrupt` (a message of another agent for the stage that waits)
 * @returns {{ state: 'answered' | 'waiting', answered: Array<{ key: string, entry: object }>, open: string[], waitedMs: number }}
 *   `waiting`: this call ended with a question still open, so the stage calls again.
 */
/**
 * The wait for the answers, with a watch of the records sync while it runs: with the compose
 * sync, an answer given on another computer arrives only when the committer fetches.
 */
export function waitForAnswers(dir, opts = {}) {
  const end = registerWatch('decide wait');
  try { return waitForAnswersHere(dir, opts); } finally { end(); }
}

function waitForAnswersHere(dir, { keys, scope = {}, callMs = WAIT_CALL_MS, pollMs = WAIT_POLL_MS, now = Date.now, sleep = pause, onStart = () => {}, onEnd = () => {}, interrupt = null } = {}) {
  const want = [...new Set((keys ?? []).map((k) => String(k).trim()).filter(Boolean))];
  if (!want.length) throw refuse('decide wait: --key is required', agentFix('Run decide wait again with --key, the key of each question that you hold, with commas between the keys.'));
  const read = () => {
    // A note of a stage is not an answer: a wait for the person does not end on it.
    const list = decisionsOf(dir).filter((e) => e.kind !== 'note');
    const answered = [];
    const open = [];
    for (const key of want) {
      const entry = answeredBy(list, key, scope);
      if (entry) answered.push({ key, entry }); else open.push(key);
    }
    return { answered, open };
  };
  const startMs = now();
  let cur = read();
  const result = () => ({ state: cur.open.length ? 'waiting' : 'answered', ...cur, waitedMs: now() - startMs });
  if (!cur.open.length) return result();

  // The session can ask only a question that the index shows.
  const waiting = heldQuestions(dir).filter((q) => cur.open.includes(q.key));
  const missing = cur.open.filter((k) => !waiting.some((q) => q.key === k));
  if (missing.length) {
    throw refuse(`decide wait: no held question has the key ${missing.join(', ')}`,
      agentFix('Publish the question with decide hold first, then run decide wait again with the same key.'));
  }
  const until = startMs + callMs;
  onStart({ until, questions: waiting });
  let broke = null;
  while (cur.open.length && now() < until) {
    broke = interrupt ? interrupt() ?? null : null;
    if (broke !== null) break;
    sleep(Math.max(1, Math.min(pollMs, until - now())));
    cur = read();
  }
  const r = { ...result(), ...(broke !== null ? { interrupt: broke } : {}) };
  onEnd({ state: r.state });
  return r;
}
