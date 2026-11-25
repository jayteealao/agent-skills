// The talk of a run: one log per workflow where the agents of a run, the driver and the session
// post, reply, wait and hold a shared resource (`wf.mjs talk`).
//
// The log is `talk.jsonl` in the folder of the workflow: one event per line, append-only, written
// under the file lock. It is part of the record, so it is the audit trail of what the agents told
// each other.
//
// A message informs or requests. It never binds: only a steer or a rule of the project binds, and
// a decision of the person is never asked or given here. A receiver that declines a request
// replies with its reason.
//
// A running agent cannot be interrupted. It reads its messages at fixed points (before a step,
// before a fix round, before it returns), and every long block of an agent is one call of
// `waitTalk`, which also returns when a message arrives. So a ping reaches an agent that waits on
// a long command, on an answer of the person, or on a shared resource.
import { registerWatch } from './records-committer.mjs';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withFileLock } from './file-lock.mjs';
import { agentFix, refuse } from './fix.mjs';
import { appendRecord } from './atomic-write.mjs';

export const TALK_FILE = 'talk.jsonl';
/** What a message is: news, a request, work handed over (for example fix commits), or an end. */
export const KINDS = ['info', 'request', 'handover', 'done'];
/** A sender that wants a reply pings after this time with no receipt. */
export const PING_MS = 10 * 60 * 1000;
/** A sender that wants a reply takes its fallback after this time with no reply. */
export const FALLBACK_MS = 20 * 60 * 1000;
/** The lease of a claim that names none. */
export const LEASE_MS = 15 * 60 * 1000;
/** A waiter that did not ask for this long has left the queue. */
export const QUEUE_STALE_MS = 3 * 60 * 1000;
/** A waiter writes its place in the queue again after this time. */
export const QUEUE_BEAT_MS = 60 * 1000;
/** The longest block of one call of the wait: under the 5 minutes of a prompt cache. */
export const WAIT_CALL_MS = 4 * 60 * 1000;
export const WAIT_POLL_MS = 2000;

const ACTOR_RE = /^(session|driver|[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = (id) => Number(String(id ?? '').replace(/\D/g, '')) || 0;
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);
const redo = (message, fix) => refuse(message, agentFix(fix));

export const talkPath = (dir) => join(dir, TALK_FILE);

/** The events of the log, oldest first. A line that does not parse is left out. */
export function readTalk(dir) {
  const file = talkPath(dir);
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn line of a crash: the rest still reads */ }
  }
  return out;
}

/**
 * One read-modify-append of the log. `make(events)` returns the new events with no id and no
 * time, or an empty list. Returns the events as written.
 */
function append(dir, make, now = Date.now()) {
  const file = talkPath(dir);
  mkdirSync(dirname(file), { recursive: true });
  return withFileLock(file, () => {
    const events = readTalk(dir);
    let n = events.reduce((m, e) => Math.max(m, num(e.id)), 0);
    const added = (make(events) ?? []).map((e) => ({ id: `T-${++n}`, at: iso(now), ...e }));
    if (added.length) appendRecord(file, added.map((e) => `${JSON.stringify(e)}\n`).join(''));
    return added;
  });
}

/** The actor of a stage agent: `verify:api`. A stage with no slice names the slug-wide scope. */
export function actorOf(stage, slice) {
  if (!stage) return null;
  return `${stage}:${slice && slice !== 'slug-wide' ? slice : 'slug-wide'}`;
}

/** Refuse an actor that is not `session`, `driver` or `<stage>:<slice>`. The person never posts here. */
export function checkActor(actor, what = 'talk') {
  const a = String(actor ?? '').trim();
  if (a === 'person') throw redo(`${what}: the person does not post here`, 'Post as yourself: --as session, --as driver, or --as <stage>:<slice>. Words of the person are a steer (decide add --kind steer), and only the person gives them.');
  if (!ACTOR_RE.test(a)) throw redo(`${what}: --as must be session, driver or <stage>:<slice>${a ? `, not ${a}` : ''}`, 'Run the command again with --as, the name that your prompt gives you.');
  return a;
}

/**
 * The name of a holder in the claim log. A resource belongs to the project, and two workflows can
 * each have an agent `verify:api`: with `scope` (the slug) the holder is `verify:api@<slug>`.
 */
const holderOf = (actor, scope, what) => { const a = checkActor(actor, what); return scope ? `${a}@${scope}` : a; };

const sliceOf = (actor) => (actor.includes(':') ? actor.slice(actor.indexOf(':') + 1) : null);

/** True when a message with the addresses `to`, written by `by`, is for `actor`. */
export function isFor(actor, to, by) {
  if (by === actor) return false;
  const slice = sliceOf(actor);
  return (to ?? []).some((t) => t === 'all' || t === actor || (slice !== null && t === slice));
}

/**
 * The messages of the log, each with its replies, its receipts, its pings and its close.
 * @returns {Map<string, object>}
 */
export function messagesOf(events) {
  const posts = new Map();
  for (const e of events) {
    if (e.ev === 'post') posts.set(e.id, { ...e, replies: [], readBy: [], pings: [], closed: null, fallback: null });
  }
  for (const e of events) {
    if (e.ev === 'post' && e.re && posts.has(e.re)) posts.get(e.re).replies.push(e.id);
    else if (e.ev === 'read') for (const id of e.ids ?? []) { const m = posts.get(id); if (m && !m.readBy.includes(e.by)) m.readBy.push(e.by); }
    else if (e.ev === 'ping' && posts.has(e.of)) posts.get(e.of).pings.push({ id: e.id, at: e.at, by: e.by });
    else if (e.ev === 'close' && posts.has(e.of)) posts.get(e.of).closed = { at: e.at, by: e.by, why: e.why ?? null };
    else if (e.ev === 'fallback' && posts.has(e.of)) posts.get(e.of).fallback = { at: e.at };
  }
  return posts;
}

/** The root of the thread of a message. */
export function rootOf(posts, id) {
  let m = posts.get(id);
  const seen = new Set();
  while (m && m.re && posts.has(m.re) && !seen.has(m.id)) { seen.add(m.id); m = posts.get(m.re); }
  return m ?? null;
}

/**
 * Post a message, or a reply when `re` names one.
 *
 * @param {string} dir the folder of the workflow
 * @param {object} m `{ by, to, re, kind, text, refs, wantsReply, fallback, key, run }`
 * @param {object} [o]
 * @param {(slice: string) => string | null} [o.statusOf] the status of a slice of the roster
 * @returns {{ entry: object, again: boolean }} `again`: the key was posted before, and nothing was written
 */
export function post(dir, m, { now = Date.now(), statusOf = () => null, pingMs = PING_MS, fallbackMs = FALLBACK_MS } = {}) {
  const by = checkActor(m.by, 'talk post');
  const text = String(m.text ?? '').trim();
  if (!text) throw redo('talk post: --text is required', 'Run the command again with --text, the message in one or two plain sentences.');
  const kind = m.kind ?? (m.wantsReply ? 'request' : 'info');
  if (!KINDS.includes(kind)) throw redo(`talk post: --kind must be one of ${KINDS.join(', ')}`, 'Run the command again with one of those kinds.');
  if (m.wantsReply && !String(m.fallback ?? '').trim()) {
    throw redo('talk post: a message that wants a reply needs --fallback', 'Run the command again with --fallback, what you do when no reply comes in time. Nobody waits without an end.');
  }
  let again = false;
  const [entry] = append(dir, (events) => {
    const posts = messagesOf(events);
    if (m.key) {
      const old = [...posts.values()].find((p) => p.key === m.key && p.by === by);
      if (old) { again = true; return []; }
    }
    let to = list(m.to);
    if (m.re) {
      const parent = posts.get(m.re);
      if (!parent) throw redo(`talk reply: no message ${m.re}`, 'Run talk read to see the ids of the messages for you, then reply to one of them.');
      if (!to.length) to = [parent.by];
    }
    if (!to.length) throw redo('talk post: --to is required', 'Run the command again with --to: a slice, <stage>:<slice>, driver, session or all.');
    for (const t of to) {
      if (t === 'person') throw redo('talk post: a question for the person is not a message', 'Hold the question with decide hold and wait for the answer. The person does not read the talk for questions.');
      const slice = t.includes(':') ? sliceOf(t) : ['all', 'driver', 'session'].includes(t) ? null : t;
      const status = slice ? statusOf(slice) : null;
      if (status === 'complete' || status === 'skipped' || status === 'dropped') {
        throw redo(`talk post: the slice ${slice} is ${status}, so nobody reads a message to it`, 'Fix the matter in your own slice, or post to the slice that owns the area now. When no open slice owns it, post to driver.');
      }
    }
    return [{
      ev: 'post', by, to, ...(m.re ? { re: m.re } : {}), kind, text,
      ...(list(m.refs).length ? { refs: list(m.refs) } : {}),
      ...(m.wantsReply ? { wants: { fallback: String(m.fallback).trim(), pingAt: iso(now + pingMs), fallbackAt: iso(now + fallbackMs) } } : {}),
      ...(m.key ? { key: String(m.key) } : {}), ...(m.run ? { run: String(m.run) } : {}),
    }];
  }, now);
  if (again) {
    const old = [...messagesOf(readTalk(dir)).values()].find((p) => p.key === m.key && p.by === by);
    return { entry: old, again: true };
  }
  return { entry, again: false };
}

/**
 * The open messages for an actor, oldest first: addressed to it, not closed, newer than `after`.
 * A reply in a thread that the actor started is for the actor too.
 */
export function inboxOf(events, actor, { after = null, thread = null, all = false, unread = false } = {}) {
  const posts = messagesOf(events);
  const mine = [];
  for (const m of posts.values()) {
    if (num(m.id) <= num(after)) continue;
    const root = rootOf(posts, m.id);
    if (thread && root?.id !== thread && m.id !== thread) continue;
    const forMe = isFor(actor, m.to, m.by) || (m.re && root && root.by === actor && m.by !== actor);
    if (!forMe) continue;
    if (!all && (m.closed || root?.closed)) continue;
    if (unread && m.readBy.includes(actor)) continue;
    mine.push(m);
  }
  return mine;
}

/**
 * What an actor has not seen: the open messages for it that it wrote no receipt for, and the
 * pings of its messages that are newer than its own last entry. An agent needs no cursor for this.
 */
export function unreadFor(events, actor) {
  const posts = messagesOf(events);
  const lastOwn = events.reduce((n, e) => (e.by === actor ? Math.max(n, num(e.id)) : n), 0);
  const pings = events.filter((e) => e.ev === 'ping' && num(e.id) > lastOwn && posts.has(e.of) && !posts.get(e.of).closed && isFor(actor, posts.get(e.of).to, posts.get(e.of).by))
    .map((e) => ({ id: e.id, of: e.of, text: posts.get(e.of).text, from: posts.get(e.of).by, by: e.by }));
  return { messages: inboxOf(events, actor, { unread: true }), pings };
}

/** Write the receipt of an actor for the messages `ids`. A message that it read before is left out. */
export function markRead(dir, actor, ids, { now = Date.now() } = {}) {
  const by = checkActor(actor, 'talk read');
  return append(dir, (events) => {
    const posts = messagesOf(events);
    const fresh = [...new Set(ids)].filter((id) => posts.has(id) && !posts.get(id).readBy.includes(by));
    return fresh.length ? [{ ev: 'read', by, ids: fresh }] : [];
  }, now)[0] ?? null;
}

/** Write that an actor saw the pings up to now, so the same ping is not news twice. */
export function markSeen(dir, actor, { now = Date.now() } = {}) {
  const by = checkActor(actor, 'talk');
  return append(dir, () => [{ ev: 'seen', by }], now)[0];
}

/** Close a thread: the matter of the message is handled. Its receiver, its sender or the session closes it. */
export function close(dir, actor, id, why, { now = Date.now() } = {}) {
  const by = checkActor(actor, 'talk close');
  const [e] = append(dir, (events) => {
    const posts = messagesOf(events);
    const m = posts.get(id);
    if (!m) throw redo(`talk close: no message ${id}`, 'Run talk read to see the ids of the messages for you.');
    if (m.closed) return [];
    if (!(by === 'session' || by === 'driver' || m.by === by || isFor(by, m.to, m.by))) {
      throw redo(`talk close: ${id} is not a message of ${by}`, 'Close only a message that you sent or that is for you.');
    }
    return [{ ev: 'close', by, of: id, ...(why ? { why: String(why) } : {}) }];
  }, now);
  return e ?? null;
}

/** Ping the receivers of a message: it is urgent now. */
export function ping(dir, actor, id, { now = Date.now() } = {}) {
  const by = actor === 'talk' ? 'talk' : checkActor(actor, 'talk ping');
  const [e] = append(dir, (events) => {
    const m = messagesOf(events).get(id);
    if (!m) throw redo(`talk ping: no message ${id}`, 'Run talk list to see the ids of the messages.');
    return [{ ev: 'ping', by, of: id, to: m.to }];
  }, now);
  return e;
}

/**
 * The messages of `actor` that want a reply and have none from another actor, with what is due
 * now: `ping` (no receipt of a receiver at the first limit, and no ping yet) or `fallback`
 * (no reply at the second limit).
 */
export function dueOf(events, actor, now = Date.now()) {
  const posts = messagesOf(events);
  const out = [];
  for (const m of posts.values()) {
    if (!m.wants || m.closed || m.fallback || (actor && m.by !== actor)) continue;
    if (m.replies.some((id) => posts.get(id)?.by !== m.by)) continue;
    const t = iso(now);
    if (t >= m.wants.fallbackAt) out.push({ id: m.id, by: m.by, to: m.to, due: 'fallback', fallback: m.wants.fallback });
    else if (t >= m.wants.pingAt && !m.pings.length && !m.readBy.some((r) => r !== m.by)) out.push({ id: m.id, by: m.by, to: m.to, due: 'ping' });
    else out.push({ id: m.id, by: m.by, to: m.to, due: null, pingAt: m.wants.pingAt, fallbackAt: m.wants.fallbackAt });
  }
  return out;
}

// ---------------------------------------------------------------- claims

/**
 * The state of each resource at `now`: its holder (when a claim is live), its epoch, and the
 * actors that wait for it, the first in line first.
 */
export function resourcesOf(events, now = Date.now()) {
  const t = iso(now);
  const stale = iso(now - QUEUE_STALE_MS);
  const res = new Map();
  const of = (key) => res.get(key) ?? res.set(key, { resource: key, epoch: 0, holder: null, until: null, why: null, queue: new Map() }).get(key);
  for (const e of events) {
    if (!e.resource) continue;
    const r = of(e.resource);
    if (e.ev === 'claim') { r.epoch = e.epoch; r.holder = e.by; r.until = e.until; r.why = e.why ?? null; r.queue.delete(e.by); }
    else if (e.ev === 'renew' && e.epoch === r.epoch && r.holder === e.by) r.until = e.until;
    else if (e.ev === 'release' && e.epoch === r.epoch) { r.holder = null; r.until = null; }
    else if (e.ev === 'queue') { const q = r.queue.get(e.by); r.queue.set(e.by, { first: q?.first ?? e.at, last: e.at }); }
  }
  return [...res.values()].map((r) => {
    const live = r.holder && r.until > t;
    const waiting = [...r.queue].filter(([, q]) => q.last >= stale).sort((a, b) => (a[1].first < b[1].first ? -1 : 1)).map(([by, q]) => ({ by, since: q.first, last: q.last }));
    return { resource: r.resource, epoch: r.epoch, holder: live ? r.holder : null, until: live ? r.until : null, why: live ? r.why : null, expired: Boolean(r.holder && !live), waiting };
  });
}

/**
 * Ask for a resource. The call never blocks: it returns `{ held: true, epoch, until }`, or
 * `{ held: false, holder, until, ahead }` and writes the place of the actor in the queue.
 * A free resource goes to the first actor in line.
 */
export function claim(dir, actor, resource, { leaseMs = LEASE_MS, why = null, now = Date.now(), scope = null } = {}) {
  const by = holderOf(actor, scope, 'talk claim');
  const key = String(resource ?? '').trim();
  if (!key) throw redo('talk claim: <resource> is required', 'Run the command again with the key of the resource, as the config of the project names it.');
  let result = null;
  append(dir, (events) => {
    const r = resourcesOf(events, now).find((x) => x.resource === key) ?? { epoch: 0, holder: null, waiting: [] };
    const until = iso(now + leaseMs);
    if (r.holder === by) { result = { held: true, resource: key, epoch: r.epoch, until }; return [{ ev: 'renew', by, resource: key, epoch: r.epoch, until }]; }
    const others = r.waiting.filter((w) => w.by !== by);
    const me = r.waiting.find((w) => w.by === by);
    const first = !others.length || (me && me.since <= others[0].since);
    if (!r.holder && first) {
      result = { held: true, resource: key, epoch: r.epoch + 1, until };
      return [{ ev: 'claim', by, resource: key, epoch: r.epoch + 1, until, ...(why ? { why: String(why) } : {}) }];
    }
    const ahead = [...(r.holder ? [r.holder] : []), ...others.filter((w) => !me || w.since < me.since).map((w) => w.by)];
    result = { held: false, resource: key, holder: r.holder, until: r.until ?? null, ahead };
    const beat = !me || iso(now - QUEUE_BEAT_MS) >= me.last;
    return beat ? [{ ev: 'queue', by, resource: key }] : [];
  }, now);
  return result;
}

function holderWrite(dir, actor, resource, epoch, ev, extra, now, scope = null) {
  const by = holderOf(actor, scope, `talk ${ev}`);
  const [e] = append(dir, (events) => {
    const r = resourcesOf(events, now).find((x) => x.resource === resource);
    if (!r || r.holder !== by || (epoch != null && Number(epoch) !== r.epoch)) {
      throw redo(`talk ${ev}: ${by} does not hold ${resource}${r?.holder ? ` (${r.holder} holds it)` : ''}: the lease ran out, or the claim was released`,
        'Stop using the resource. Claim it again with talk wait --claim before you use it again.');
    }
    return [{ ev, by, resource, epoch: r.epoch, ...extra }];
  }, now);
  return e;
}

/** Extend the lease of the holder. A claim that is over is refused. */
export const renew = (dir, actor, resource, { epoch = null, leaseMs = LEASE_MS, now = Date.now(), scope = null } = {}) => holderWrite(dir, actor, resource, epoch, 'renew', { until: iso(now + leaseMs) }, now, scope);

/** Give the resource back. A claim that is over is refused. */
export const release = (dir, actor, resource, { epoch = null, now = Date.now(), scope = null } = {}) => holderWrite(dir, actor, resource, epoch, 'release', {}, now, scope);

// ---------------------------------------------------------------- wait

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Block until something is there for the actor, or the call runs out of time. One call serves
 * every long wait of an agent, and each of them ends at once when a message or a ping arrives:
 *
 *   messages   new messages for the actor (always)
 *   resource   a claim on a shared resource
 *   done       a check of the caller, for example a long command that ended or an answer of the
 *              person: `done()` returns a value that is not null when the wait is over
 *
 * The call also keeps the promises of the actor's own messages that want a reply: it writes the
 * ping at the first limit, and returns `fallback` at the second.
 *
 * @returns {{ state: 'message'|'claimed'|'done'|'fallback'|'waiting', messages: object[], pings: object[], claim?: object, done?: any, fallback?: object[], waitedMs: number }}
 */
/** The wait of the talk, with a watch of the records sync while it runs (see waitForAnswers). */
export function waitTalk(dir, actor, opts = {}) {
  const end = registerWatch('talk wait');
  try { return waitTalkHere(dir, actor, opts); } finally { end(); }
}

function waitTalkHere(dir, actor, {
  after = null, resource = null, leaseMs = LEASE_MS, why = null, done = null, claimDir = null, scope = null,
  callMs = WAIT_CALL_MS, pollMs = WAIT_POLL_MS, now = Date.now, sleep = pause,
} = {}) {
  const by = checkActor(actor, 'talk wait');
  const startMs = now();
  const until = startMs + callMs;
  const out = (state, extra = {}) => ({ state, messages: [], pings: [], ...extra, waitedMs: now() - startMs });
  for (;;) {
    const events = readTalk(dir);
    const posts = messagesOf(events);
    // With no cursor, what the actor has not seen. A ping of a message for the actor is news, even when the message is old.
    const fresh = after === null || after === undefined ? unreadFor(events, by) : {
      messages: inboxOf(events, by, { after }),
      pings: events.filter((e) => e.ev === 'ping' && num(e.id) > num(after) && posts.has(e.of) && isFor(by, posts.get(e.of).to, posts.get(e.of).by)
        && !posts.get(e.of).closed).map((e) => ({ id: e.id, of: e.of, text: posts.get(e.of).text, from: posts.get(e.of).by, by: e.by })),
    };
    const { messages, pings } = fresh;
    if (messages.length || pings.length) return out('message', { messages, pings });
    if (done) { const d = done(); if (d != null) return out('done', { done: d }); }
    if (resource) {
      // The claims of a project are in one log, for every workflow of the project.
      const c = claim(claimDir ?? dir, by, resource, { leaseMs, why, now: now(), scope });
      if (c.held) return out('claimed', { claim: c });
    }
    const due = dueOf(events, by, now());
    for (const d of due.filter((x) => x.due === 'ping')) ping(dir, 'talk', d.id, { now: now() });
    const over = due.filter((x) => x.due === 'fallback');
    if (over.length) {
      append(dir, () => over.map((d) => ({ ev: 'fallback', by, of: d.id })), now());
      return out('fallback', { fallback: over });
    }
    if (now() >= until) return out('waiting');
    sleep(Math.max(1, Math.min(pollMs, until - now())));
  }
}

// ---------------------------------------------------------------- lines

const short = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * The events of the watch for the log entries that are newer than `seen`. A post that is not
 * for the session is routine: the watch writes it to the commentary and wakes nobody. A post for
 * the session, a ping and a fallback are news.
 */
export function watchEventsOf(slug, events, seen = 0) {
  const posts = messagesOf(events);
  const out = [];
  for (const e of events) {
    if (num(e.id) <= num(seen)) continue;
    const m = e.of ? posts.get(e.of) : null;
    if (e.ev === 'post') {
      out.push({ event: 'talk', slug, id: e.id, by: e.by, to: e.to, kind: e.kind, re: e.re ?? null, text: short(e.text, 400), wantsReply: Boolean(e.wants), ...(e.to.includes('session') ? {} : { routine: true }), at: e.at });
    } else if (e.ev === 'ping' && m) {
      out.push({ event: 'talk-ping', slug, of: e.of, from: m.by, to: m.to, text: short(m.text, 240), auto: e.by === 'talk', ...(e.by === 'talk' ? { waitedSince: m.at } : { by: e.by }), at: e.at });
    } else if (e.ev === 'fallback' && m) {
      out.push({ event: 'talk-fallback', slug, of: e.of, by: e.by, to: m.to, text: short(m.text, 240), fallback: m.wants?.fallback ?? null, at: e.at });
    }
  }
  return out;
}

/** One line of a message, for a list. */
export function messageLine(m, { full = false } = {}) {
  const flags = [m.kind !== 'info' ? m.kind : null, m.wants ? 'wants a reply' : null, m.closed ? 'closed' : null, m.pings?.length ? 'pinged' : null].filter(Boolean);
  return `${m.id} ${String(m.at).slice(11, 16)} ${m.by} → ${(m.to ?? []).join(', ')}${m.re ? ` (re ${m.re})` : ''}${flags.length ? ` [${flags.join(', ')}]` : ''}: ${full ? m.text : short(m.text)}${m.refs?.length ? ` {${m.refs.join(', ')}}` : ''}`;
}

/** One line of a resource. */
export function resourceLine(r) {
  const wait = r.waiting.length ? `; waiting: ${r.waiting.map((w) => w.by).join(', ')}` : '';
  return r.holder ? `${r.resource}: held by ${r.holder} until ${String(r.until).slice(11, 16)}${r.why ? ` (${r.why})` : ''}${wait}` : `${r.resource}: free${r.expired ? ' (the last lease ran out)' : ''}${wait}`;
}

/** The threads of the log, each root with its replies in order. */
export function threadsOf(events, { open = false } = {}) {
  const posts = messagesOf(events);
  const roots = [...posts.values()].filter((m) => !m.re || !posts.has(m.re));
  const walk = (m, depth, acc) => { acc.push({ ...m, depth }); for (const id of m.replies) walk(posts.get(id), depth + 1, acc); return acc; };
  return roots.filter((m) => !open || !m.closed).map((m) => walk(m, 0, []));
}
