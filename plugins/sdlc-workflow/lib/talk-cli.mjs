// The forms of `wf.mjs talk`: the talk of a run (lib/talk.mjs) and its long commands (lib/jobs.mjs).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { answeredBy, decisionLine, decisionsOf } from './decisions.mjs';
import { heldQuestions } from './decide-wait.mjs';
import { agentFix, refuse } from './fix.mjs';
import { jobLine, jobState, listJobs, startJob, stopJobs, tailOf } from './jobs.mjs';
import { rosterOf } from './roster-edit.mjs';
import { runRoot, workflowsRoot } from './records-root.mjs';
import { readProgress } from './progress.mjs';
import { hostname } from 'node:os';
import {
  LEASE_MS, WAIT_CALL_MS, actorOf, checkActor, claim, close, inboxOf, issuesOf, markRead, messageLine, messagesOf, ping, post, readTalk,
  markSeen, release, resourceLine, resourcesOf, threadsOf, waitTalk,
} from './talk.mjs';

const ARGS_FIX = 'Run the command again with the arguments that its forms above name.';
const usage = (message) => refuse(message, agentFix(ARGS_FIX));
const num = (id) => Number(String(id ?? '').replace(/\D/g, '')) || 0;
const hhmm = (t) => String(t ?? '').slice(11, 16);

/** The actor of a call: `--as`, else `--stage` with `--slice`. */
function actorArg(opt, what) {
  return checkActor(opt.as ?? actorOf(opt.stage, opt.slice), what);
}

/** The status of a slice of the roster, or null. */
function statusFn(dir) {
  let roster = null;
  return (slice) => {
    if (roster === null) { try { roster = rosterOf(dir); } catch { roster = []; } }
    return roster.find((s) => s.slug === slice)?.status ?? null;
  };
}

// One word of a command line: quoted when it holds a space or a sign that a shell reads.
const shellWord = (a) => (/^[A-Za-z0-9_@%+=:,./\-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '\\"')}"`);
/** The command of a job: one quoted string as it is, else its words joined. */
const commandLine = (words) => (words.length === 1 ? words[0] : words.map(shellWord).join(' '));
/** The shared resources that the config of the project names. */
function configResources(projectRoot) {
  try {
    const list = JSON.parse(readFileSync(join(projectRoot, '.ai', 'sdlc-config.json'), 'utf8')).resources;
    return (Array.isArray(list) ? list : []).filter((r) => r && typeof r.key === 'string' && r.key).map((r) => ({ key: r.key, about: r.about ?? null, leaseMin: Number(r['lease-min']) || null }));
  } catch { return []; }
}

/** The lease of a claim: --lease-min, else `lease-min` of the resource in the config, else 15 minutes. */
function leaseOf(projectRoot, key, opt) {
  const asked = Number(opt['lease-min']);
  if (asked > 0) return asked * 60_000;
  const named = configResources(projectRoot).find((r) => r.key === key)?.leaseMin;
  return named > 0 ? named * 60_000 : LEASE_MS;
}

const cursorOf = (events) => (events.length ? events[events.length - 1].id : 'T-0');

/**
 * @param {string[]} pos
 * @param {object} opt
 * @param {object} deps
 * @param {(v: unknown) => void} deps.out
 * @param {(root: string, slug: string, stage: string|null, slice: string|null, event: string, fields: object) => void} [deps.journal]
 *   a line of the driver journal, so the watch knows that an agent waits and does not call it dead
 * @param {string[]} [deps.command] the words after `--`
 */
export function runTalk(pos, opt, { out, journal = () => {}, command = [] } = {}) {
  const [verb, root, slug, arg] = pos;
  if (!verb || !root || !slug) throw usage('talk: <post|reply|read|close|ping|wait|claim|release|resources|job|jobs|list> <root> <slug> are required');
  const projectRoot = resolve(root);
  const dir = join(workflowsRoot(projectRoot), slug);
  // A shared resource belongs to the project and to this machine: every workflow of the project
  // claims it in one log, so two runs never both hold it.
  const claimDir = runRoot(projectRoot);
  const holder = (actor) => `${actor}@${slug}`;
  if (!existsSync(dir)) throw refuse(`talk: no workflow folder ${dir}`, agentFix('List the workflows with status, then run the command again with a slug that it names.', `wf.mjs status ${root}`));
  switch (verb) {
    case 'post':
    case 'reply': {
      if (verb === 'reply' && !arg) throw usage('talk reply: <id> is required');
      const r = post(dir, {
        by: actorArg(opt, `talk ${verb}`), to: opt.to, re: verb === 'reply' ? arg : opt.re, kind: opt.kind, text: opt.text,
        refs: opt.refs, wantsReply: Boolean(opt['wants-reply']), fallback: opt.fallback, key: opt.key, run: opt.run,
        issue: verb === 'post' && Boolean(opt.issue),
      }, { statusOf: statusFn(dir) });
      out(opt.json ? r : `${r.again ? 'posted before: ' : ''}${r.joined ? `the same issue is open as ${r.joined}; your report joined its thread: ` : ''}${messageLine(r.entry)}${r.entry.wants ? `\nWait for the reply with: talk wait --as ${r.entry.by}. With no reply by ${hhmm(r.entry.wants.fallbackAt)}, the wait tells you to take your fallback.` : ''}`);
      return 0;
    }
    case 'read': {
      const actor = actorArg(opt, 'talk read');
      const events = readTalk(dir);
      // --issues: the issues of the run, for the placer (driver or lead) and the session. No receipt.
      if (opt.issues) {
        const issues = issuesOf(events, { open: Boolean(opt.open) || !opt.all });
        if (opt.json) { out({ actor, issues, cursor: cursorOf(events) }); return 0; }
        const lineOf = (i) => [
          `${i.id} ${String(i.at).slice(11, 16)} ${i.by}${i.reports > 1 ? ` (${i.reports} reports)` : ''}${i.closed ? ' [closed]' : i.placed ? ' [placed]' : ''}: ${i.text}${i.refs.length ? ` {${i.refs.join(', ')}}` : ''}`,
          ...(i.placed ? [`  ${i.placed.text}`] : []),
          ...i.refused.map((x) => `  ${x.by} ${x.text}`),
        ].join('\n');
        out(issues.length ? issues.map(lineOf).join('\n') : 'no open issues');
        return 0;
      }
      // With no cursor: what you have not seen. --open: every open message for you, for the start of a stage.
      const rows = inboxOf(events, actor, { after: opt.after, thread: opt.thread, all: Boolean(opt.all), unread: !opt.after && !opt.thread && !opt.all && !opt.open });
      if (!opt.peek && rows.length) markRead(dir, actor, rows.map((m) => m.id));
      const cursor = cursorOf(events);
      if (opt.json) { out({ actor, messages: rows, cursor }); return 0; }
      out([
        ...(rows.length ? rows.map((m) => messageLine(m, { full: true })) : [`no ${opt.open || opt.all ? '' : 'new '}messages for ${actor}`]),
        ...(rows.length ? ['A message informs or requests; it does not bind. Act on it or reply with your reason, then close it with talk close when it is handled.'] : []),
      ].join('\n'));
      return 0;
    }
    case 'close': {
      if (!arg) throw usage('talk close: <id> is required');
      const e = close(dir, actorArg(opt, 'talk close'), arg, opt.reason);
      out(opt.json ? { closed: Boolean(e), id: arg } : e ? `closed ${arg}` : `${arg} was closed before`);
      return 0;
    }
    case 'ping': {
      if (!arg) throw usage('talk ping: <id> is required');
      const e = ping(dir, actorArg(opt, 'talk ping'), arg);
      out(opt.json ? e : `pinged ${e.to.join(', ')} about ${arg}: an agent that waits sees it at once, another at its next reading point`);
      return 0;
    }
    case 'claim': {
      if (!arg) throw usage('talk claim: <resource> is required');
      const leaseMs = leaseOf(projectRoot, arg, opt);
      const c = claim(claimDir, actorArg(opt, 'talk claim'), arg, { leaseMs, why: opt.why, scope: slug });
      out(opt.json ? c : c.held ? `you hold ${arg} until ${hhmm(c.until)} (epoch ${c.epoch})` : `${arg} is held by ${c.holder ?? 'nobody'}${c.until ? ` until ${hhmm(c.until)}` : ''}; ahead of you: ${c.ahead.join(', ') || 'nobody'}. Wait with talk wait --claim ${arg}.`);
      return c.held ? 0 : 1;
    }
    case 'release': {
      if (!arg) throw usage('talk release: <resource> is required');
      const e = release(claimDir, actorArg(opt, 'talk release'), arg, { scope: slug });
      out(opt.json ? e : `released ${arg}`);
      return 0;
    }
    case 'job': {
      const actor = actorArg(opt, 'talk job');
      let hold = null;
      if (opt.claim) {
        const r = resourcesOf(readTalk(claimDir)).find((x) => x.resource === opt.claim);
        if (!r || r.holder !== holder(actor)) {
          throw refuse(`talk job: ${actor} does not hold ${opt.claim}`, agentFix('Claim the resource first, and start the job when the wait says that you hold it.', `wf.mjs talk wait ${root} ${slug} --as ${actor} --claim ${opt.claim}`));
        }
        hold = { dir: claimDir, scope: slug, resource: opt.claim, epoch: r.epoch, leaseMs: leaseOf(projectRoot, opt.claim, opt) };
      }
      // The host process of the run: the Codex driver names itself, another host is in the progress record of the run.
      const own = Number(process.env.SDLC_DRIVER_PID);
      const p = readProgress(dir);
      const hostPid = Number.isInteger(own) && own > 0 ? own : p && p.status === 'running' && p.host === hostname() && Number.isInteger(p.hostPid) ? p.hostPid : null;
      const job = startJob(projectRoot, slug, { hostPid, command: commandLine(command), by: actor, name: opt.name ?? 'job', cwd: opt.cwd ? resolve(opt.cwd) : null, hold, ...(Number(opt['max-min']) > 0 ? { maxMs: Number(opt['max-min']) * 60_000 } : {}) });
      out(opt.json ? job : `started ${job.id}: output in ${job.log}\nWait for its end with: talk wait --as ${actor} --job ${job.id}. Do not end your turn while it runs.`);
      return 0;
    }
    case 'jobs': {
      if (opt.stop) {
        // With --as: only the jobs that this actor started. An agent never stops the job of another agent.
        const stopped = stopJobs(projectRoot, slug, { by: opt.as || opt.stage ? actorArg(opt, 'talk jobs') : null });
        out(opt.json ? { stopped } : stopped.length ? `stopped ${stopped.join(', ')}` : 'no job runs');
        return 0;
      }
      const jobs = listJobs(projectRoot, slug);
      out(opt.json ? jobs : jobs.length ? jobs.map(jobLine).join('\n') : 'no jobs');
      return 0;
    }
    case 'wait': {
      const actor = actorArg(opt, 'talk wait');
      const [stage, slice] = actor.includes(':') ? actor.split(/:(.*)/s) : [actor, null];
      const keys = String(opt.key ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      const scope = { packet: opt.packet, slice: opt.slice && opt.slice !== 'slug-wide' ? opt.slice : slice && slice !== 'slug-wide' ? slice : undefined, files: opt.files };
      const openKeys = () => keys.filter((k) => !answeredBy(decisionsOf(dir), k, scope));
      if (keys.length) {
        // The session can ask only a question that the index shows.
        const held = heldQuestions(dir).map((q) => q.key);
        const missing = openKeys().filter((k) => !held.includes(k));
        if (missing.length) throw refuse(`talk wait: no held question has the key ${missing.join(', ')}`, agentFix('Publish the question with decide hold first, then run talk wait again with the same key.'));
      }
      if (opt.job) jobState(projectRoot, slug, opt.job);
      const done = () => {
        if (opt.job) {
          const j = jobState(projectRoot, slug, opt.job);
          if (j.state !== 'running') return { job: j };
        }
        if (keys.length && !openKeys().length) return { answered: keys.map((k) => ({ key: k, entry: answeredBy(decisionsOf(dir), k, scope) })) };
        return null;
      };
      const seconds = Number(opt.seconds);
      const callMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : WAIT_CALL_MS;
      const leaseMs = leaseOf(projectRoot, opt.claim, opt);
      const line = (event, fields) => { try { journal(projectRoot, slug, stage, slice, event, fields); } catch { /* the wait goes on */ } };
      line('waiting', { keys: openKeys(), until: new Date(Date.now() + callMs).toISOString(), ...(opt.job ? { job: opt.job } : {}), ...(opt.claim ? { resource: opt.claim } : {}) });
      let r;
      try {
        r = waitTalk(dir, actor, { after: opt.after, resource: opt.claim ?? null, claimDir, scope: slug, leaseMs, why: opt.why, done: opt.job || keys.length ? done : null, callMs });
      } finally { line('wait-end', { state: r?.state ?? 'error' }); }
      if (r.state === 'message') {
        markRead(dir, actor, r.messages.map((m) => m.id));
        if (r.pings.length) markSeen(dir, actor);
      }
      const cursor = cursorOf(readTalk(dir));
      const again = 'Run this command again now.';
      if (opt.json) { out({ ...r, actor, cursor }); return 0; }
      const lines = [];
      if (r.state === 'message') {
        lines.push(...r.messages.map((m) => `message: ${messageLine(m, { full: true })}`));
        lines.push(...r.pings.map((p) => `PING from ${p.from === actor ? 'the session' : p.from} about ${p.of}: "${p.text}" — it is urgent now. Answer it before you go on.`));
        lines.push('Act on each one or reply with your reason. A message does not bind; it is not an instruction of the person.');
        if (opt.job || keys.length || opt.claim) lines.push(`What you waited for is not there yet. ${again}`);
      } else if (r.state === 'claimed') {
        lines.push(`you hold ${r.claim.resource} until ${hhmm(r.claim.until)} (epoch ${r.claim.epoch}). Start your command with talk job --claim ${r.claim.resource}: the job keeps the claim and gives it back at its end. With no job, give it back with talk release ${r.claim.resource}.`);
      } else if (r.state === 'done' && r.done.job) {
        const j = r.done.job;
        const t = tailOf(j.log);
        lines.push(j.state === 'lost' ? `the job ${j.id} is lost: its process is gone and it wrote no end. Its output is in ${j.log}.` : `the job ${j.id} ended: ${j.stopped ? 'stopped' : `exit ${j.exit}`}${j.claimLost ? ' (it lost its claim while it ran)' : ''}. Output: ${j.log} (${t.size} bytes)`);
        if (j.exit !== 0 && t.tail) lines.push('--- the end of the output ---', t.tail);
      } else if (r.state === 'done') {
        lines.push(...r.done.answered.map((a) => `answered: ${decisionLine(a.entry)}`));
      } else if (r.state === 'fallback') {
        lines.push(...r.fallback.map((f) => `no reply to ${f.id} in time. Take your fallback now: ${f.fallback}. Then post that you did, as a reply to ${f.id}.`));
      } else {
        const jobAge = () => {
          const j = jobState(projectRoot, slug, opt.job);
          const mins = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
          let wrote = null;
          try { wrote = mins(statSync(j.log).mtime.toISOString()); } catch { /* no output yet */ }
          return ` (${mins(j.startedAt)} min so far, ${wrote === null ? 'no output yet' : `last output ${wrote} min ago`}, limit ${Math.round((j.maxMs ?? 0) / 60000)} min)`;
        };
        const waitingFor = [opt.job ? `the job ${opt.job}${jobAge()}` : null, keys.length ? `the answer to ${openKeys().join(', ')}` : null, opt.claim ? `the resource ${opt.claim}` : null].filter(Boolean);
        lines.push(`still waiting${waitingFor.length ? ` for ${waitingFor.join(' and ')}` : ' for a message'}. ${again}`);
      }
      out(lines.join('\n'));
      return 0;
    }
    case 'resources': {
      const named = configResources(projectRoot);
      const state = resourcesOf(readTalk(claimDir));
      const rows = named.map((n) => ({ ...n, ...(state.find((s) => s.resource === n.key) ?? { holder: null, until: null, waiting: [] }) }));
      if (opt.json) { out(rows); return 0; }
      out(rows.length
        ? [...rows.map((r) => `${r.key}${r.about ? ` — ${r.about}` : ''}: ${r.holder ? `held by ${r.holder} until ${hhmm(r.until)}` : 'free'}${r.waiting.length ? `; waiting: ${r.waiting.map((w) => w.by).join(', ')}` : ''}`),
          'Hold a resource before a command that uses it: talk wait --claim <key>, then talk job --claim <key>.'].join('\n')
        : 'no shared resources are named for this project: run your commands without a claim');
      return 0;
    }
    case 'list': {
      const events = readTalk(dir);
      const held = resourcesOf(readTalk(claimDir));
      if (opt.json) { out({ threads: threadsOf(events, { open: Boolean(opt.open) }), resources: held, cursor: cursorOf(events) }); return 0; }
      let threads = threadsOf(events, { open: Boolean(opt.open) });
      if (opt.thread) threads = threads.filter((t) => t.some((m) => m.id === opt.thread));
      if (opt.after) threads = threads.filter((t) => t.some((m) => num(m.id) > num(opt.after)));
      const posts = messagesOf(events);
      const lines = threads.flatMap((t) => t.map((m) => `${'  '.repeat(m.depth)}${messageLine(m, { full: Boolean(opt.full) })}${m.depth === 0 && posts.get(m.id).readBy.length ? ` (read by ${posts.get(m.id).readBy.join(', ')})` : ''}`));
      const res = held.filter((r) => r.holder || r.waiting.length).map(resourceLine);
      out([...(lines.length ? lines : ['no messages']), ...(res.length ? ['resources:', ...res.map((l) => `  ${l}`)] : [])].join('\n'));
      return 0;
    }
    default:
      throw usage(`talk: unknown verb ${verb}`);
  }
}
