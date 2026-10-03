/**
 * lib/live-events.mjs — the event rules of a yolo run, shared by the watch
 * script (`scripts/yolo-watch.mjs`) and the live view of the Claude mod
 * (`hooks/mod/live/`). WF-LIVE-VIEWS-PLAN.md M2: the watch and the view name
 * the same events with the same rules.
 *
 * Pure: no imports, no file system, no clock. The mod runs in an environment
 * with no Node, so every read is the caller's. A caller hands in the journal
 * lines it read and, for a stage end, what the stage's artifact says.
 */

export const STAGE_KINDS = Object.freeze(['plan', 'implement', 'verify', 'review', 'update-deps-exec']);
/** The artifact prefix of each stage kind. */
export const STAGE_FILE = Object.freeze({ plan: '04-plan', implement: '05-implement', verify: '06-verify', review: '07-review', 'update-deps-exec': '06-verify' });
/** The liveness floor: a silence under 20 minutes is never stale (_control-file-ownership.md). */
export const STALE_FLOOR_MS = 20 * 60 * 1000;

const iso = (ms) => new Date(ms).toISOString();

/**
 * The JSON lines of a text. A last line with no newline is still being
 * written: it stays unread. `consumed` is the length of the text read, so the
 * caller keeps it as the offset of the next read.
 *
 * @param {string} text
 * @returns {{ lines: Array<Record<string, unknown>>, consumed: number }}
 */
export function parseJsonLines(text) {
  const source = String(text || '');
  const lastNl = source.lastIndexOf('\n');
  if (lastNl === -1) return { lines: [], consumed: 0 };
  const lines = [];
  for (const raw of source.slice(0, lastNl + 1).split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    try {
      const value = JSON.parse(t);
      if (value && typeof value === 'object' && !Array.isArray(value)) lines.push(value);
    } catch {
      // A torn or hand-edited line: skip it.
    }
  }
  return { lines, consumed: lastNl + 1 };
}

/**
 * The stage and slice of a heartbeat line. An agent-end line may carry no
 * "stage" field, so the label ("verify:auth", "update-deps:exec") decides.
 * Only stage agents have a stage kind; a scout or a classifier is noise.
 */
export function stageOf(line) {
  if (!line) return { stage: null, slice: null };
  const label = String(line.agent || '');
  const cut = label.indexOf(':');
  const head = cut === -1 ? label : label.slice(0, cut);
  const rest = cut === -1 ? null : label.slice(cut + 1) || null;
  let stage = line.stage || null;
  if (!stage) {
    if (head === 'update-deps' && rest === 'exec') stage = 'update-deps-exec';
    else if (STAGE_KINDS.includes(head)) stage = head;
  }
  if (!STAGE_KINDS.includes(stage)) return { stage: null, slice: null };
  if (!(STAGE_KINDS.includes(head) || label === 'update-deps:exec')) return { stage: null, slice: null };
  const slice = line.slice || (stage === 'update-deps-exec' ? null : rest);
  return { stage, slice };
}

/** One frontmatter field of a markdown text, or null. */
export function frontmatterField(text, field) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return null;
  const re = new RegExp(`^${field}:\\s*["']?([^"'\\r\\n#]*?)["']?\\s*(?:#.*)?$`, 'm');
  const f = re.exec(m[1]);
  return f ? f[1].trim() : null;
}

/**
 * A decision that needs the person: the artifact waits for input, or a record
 * in it (or its sibling .yaml) carries class: intent-bearing.
 *
 * @param {string} text the artifact
 * @param {string} [yaml] its sibling .yaml, when one exists
 */
export function decisionSignalOf(text, yaml = '') {
  const reasons = [];
  if (frontmatterField(text, 'status') === 'awaiting-input') reasons.push('awaiting-input');
  const ib = /class:\s*["']?intent-bearing/g;
  const count = (String(text || '').match(ib) || []).length + (String(yaml || '').match(ib) || []).length;
  if (count) reasons.push('intent-bearing');
  return reasons.length ? { reasons, intentBearing: count } : null;
}

/**
 * The ids and titles of the intent-bearing records in an artifact: a decision
 * table row or a YAML record with `class: intent-bearing`. Best effort: an id
 * is the first `D<n>` or `id:` near the class mark.
 *
 * @returns {Array<{ id: string, text: string }>}
 */
export function intentRecordsOf(text, yaml = '') {
  const out = [];
  const seen = new Set();
  const take = (id, body) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, text: body.replace(/\s+/g, ' ').trim().slice(0, 160) });
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!/intent-bearing/.test(line)) continue;
    const id = /\b(D\d+)\b/.exec(line)?.[1] ?? null;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c && !/intent-bearing/.test(c) && !/^D\d+$/.test(c));
    if (id) take(id, cells.sort((a, b) => b.length - a.length)[0] ?? '');
  }
  const blocks = String(yaml || '').split(/\n\s*-\s+(?=id:)/);
  for (const block of blocks) {
    if (!/class:\s*["']?intent-bearing/.test(block)) continue;
    const id = /id:\s*["']?([\w.-]+)/.exec(block)?.[1] ?? null;
    const body = /(?:text|decision|title):\s*["']?([^\n"']+)/.exec(block)?.[1] ?? '';
    if (id) take(id, body);
  }
  return out;
}

/** The state of one run's journal that the event rules keep between polls. */
export function freshRunState() {
  return { run: null, lastLineAt: null, prevLineAt: null, longestGapMs: 0, newest: null, ended: false, staleFor: null, decisionsSeen: [], openStages: {} };
}

/** The liveness limit: the run's own longest gap, never under the 20-minute floor. */
export const liveLimitMs = (st) => Math.max(STALE_FLOOR_MS, st.longestGapMs || 0);

/**
 * The events of new journal lines, with the state updated in place.
 *
 * @param {string} slug
 * @param {object} st the run state (freshRunState)
 * @param {Array<Record<string, unknown>>} lines the new lines, in order
 * @param {object} [options]
 * @param {{ run: string, seq: number } | null} [options.emitFrom] emit only lines after this one
 * @param {(stage: string, slice: string | null) => ({ rel: string, status: string | null, signal: { reasons: string[], intentBearing: number } | null, mtime: number } | null)} [options.artifactOf]
 *   what the stage's artifact says now; absent, a stage end carries no artifact
 */
export function applyLines(slug, st, lines, { emitFrom = null, artifactOf = () => null } = {}) {
  const events = [];
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const at = Date.parse(line.at || '');
    if (line.run && line.run !== st.run) {
      // A new run: its gaps are its own, and the old run's end does not end it.
      st.run = line.run; st.longestGapMs = 0; st.prevLineAt = null; st.ended = false; st.openStages = {};
    }
    if (Number.isFinite(at)) {
      if (st.prevLineAt !== null) st.longestGapMs = Math.max(st.longestGapMs, at - st.prevLineAt);
      st.prevLineAt = at; st.lastLineAt = at;
    }
    st.newest = { event: line.event || null, agent: line.agent || null, status: line.status || null, at: line.at || null };
    st.staleFor = null;
    const emit = emitFrom === null || (line.run === emitFrom.run && Number(line.seq) > emitFrom.seq);
    if (line.event === 'run-end') {
      st.ended = true;
      if (emit) events.push({ event: 'run-end', slug, run: line.run || st.run, stoppedAt: line.stoppedAt || null, inferred: false, at: line.at || null });
      continue;
    }
    const { stage, slice } = stageOf(line);
    if (!stage) continue;
    if (line.event === 'agent-start') {
      st.openStages[line.agent] = line.at || null;
      if (emit) events.push({ event: 'stage-start', slug, run: line.run || st.run, stage, slice, agent: line.agent, at: line.at || null });
      continue;
    }
    if (line.event !== 'agent-end') continue;
    const startedAt = st.openStages[line.agent] || null;
    delete st.openStages[line.agent];
    if (!emit) continue;
    const artifact = artifactOf(stage, slice);
    events.push({
      event: 'stage-end', slug, run: line.run || st.run, stage, slice, agent: line.agent, parallel: 1,
      status: line.status || null, errors: Number.isFinite(Number(line.errors)) ? Number(line.errors) : null,
      startedAt, at: line.at || null, artifact: artifact ? artifact.rel : null, artifactStatus: artifact ? artifact.status : null,
    });
    if (line.status === 'hard-stop' || line.status === 'stopped') {
      events.push({
        event: 'stop', slug, run: line.run || st.run, stage, slice,
        kind: line.status === 'stopped' ? 'stop-request' : 'hard-stop', at: line.at || null,
        resume: `/wf yolo ${slug}`,
      });
    }
    if (artifact && artifact.signal) {
      const key = `${artifact.rel}@${artifact.mtime}`;
      if (!st.decisionsSeen.includes(key)) {
        st.decisionsSeen = [...st.decisionsSeen, key].slice(-200);
        events.push({ event: 'decision', slug, run: line.run || st.run, stage, slice, artifact: artifact.rel, reasons: artifact.signal.reasons, intentBearing: artifact.signal.intentBearing, at: line.at || null });
      }
    }
  }
  return events;
}

/**
 * Silence, judged against the run's own cadence. A silence whose newest line
 * is an agent-start is a stale driver; one whose newest line is an agent-end
 * means every agent returned, so the run ended.
 */
export function judgeSilence(slug, st, nowMs, watchStartMs) {
  if (st.ended || st.lastLineAt === null) return [];
  // A re-arm resets `ended` for a relaunch; a run whose newest line is its end is silent by design.
  if (st.newest && st.newest.event === 'run-end') return [];
  const since = Math.max(st.lastLineAt, watchStartMs);
  const silentMs = nowMs - since;
  const limit = liveLimitMs(st);
  if (silentMs <= limit) return [];
  if (st.newest && st.newest.event === 'agent-end') {
    st.ended = true;
    return [{ event: 'run-end', slug, run: st.run, stoppedAt: null, inferred: true, lastAgent: st.newest.agent, lastStatus: st.newest.status, at: iso(nowMs) }];
  }
  const key = String(st.lastLineAt);
  if (st.staleFor === key) return [];
  st.staleFor = key;
  return [{
    event: 'stale', slug, run: st.run, lastAgent: st.newest && st.newest.agent, lastLineAt: iso(st.lastLineAt),
    silentMinutes: Math.round(silentMs / 60000), limitMinutes: Math.round(limit / 60000), at: iso(nowMs),
  }];
}

/**
 * The liveness of a run at a moment: `live` inside half the limit, `quiet`
 * past half of it, `stale` past it, `ended` after the run's end or a clean
 * stop, `none` before any line (WF-LIVE-VIEWS-PLAN.md 3.3).
 */
export function livenessOf(st, nowMs) {
  if (st.lastLineAt === null) return { state: 'none', silentMs: null, limitMs: liveLimitMs(st) };
  const silentMs = Math.max(0, nowMs - st.lastLineAt);
  const limitMs = liveLimitMs(st);
  if (st.ended || (st.newest && st.newest.event === 'run-end')) return { state: 'ended', silentMs, limitMs };
  if (silentMs > limitMs) return { state: st.newest && st.newest.event === 'agent-end' ? 'ended' : 'stale', silentMs, limitMs };
  if (silentMs > limitMs / 2) return { state: 'quiet', silentMs, limitMs };
  return { state: 'live', silentMs, limitMs };
}

/** The usage level of a reading against the budget lines: ok, slow, pause, or unknown. */
export function usageLevelOf(fivePercent, sevenPercent, budget) {
  const five = Number(fivePercent);
  const seven = Number(sevenPercent);
  if (!Number.isFinite(five) && !Number.isFinite(seven)) return 'unknown';
  if (five >= budget.fiveHourPause || seven >= 100 - budget.sevenDayReserve) return 'pause';
  if (five >= budget.fiveHourSlow) return 'slow';
  return 'ok';
}
