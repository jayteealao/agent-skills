// The one records line of the dispatch. The dispatch commits nothing and fetches nothing: it
// reads the records log and the state file of this machine, and it claims the lease only when
// `.machines/` of the clone lists two or more computers. The line has three forms:
//
//   records: ok                                        the dispatch prints nothing
//   records: ask "<question>" yes=`<command>` no=`<command>`
//   records: stop <reason>
//
// The script writes the question and the two commands. A command that exits 0 lets the key run;
// a command that exits 1 stops it. `wf.mjs` in a command means the wf.mjs of the skill.
import { claimAndPull, heldBefore, leasesOn } from './leases.mjs';
import { layerOf, readOutbox } from './github-layer.mjs';
import { lastLogged, readState, recordsLogTail } from './records-sync.mjs';
import { linkedProject, recordsHome } from './records-root.mjs';

const DAY_MS = 24 * 60 * 60_000;
const quote = (s) => `"${String(s).replace(/"/g, "'")}"`;
const command = (s) => `\`wf.mjs ${s}\``;
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const by = (lease) => `${lease.machine}${lease.host ? ` (${lease.host})` : ''}`;

export const askLine = (question, yes, no) => `records: ask ${quote(question)} yes=${command(yes)} no=${command(no)}`;
export const stopLine = (reason) => `records: stop ${reason}`;

/**
 * The records line of a call, or null for `records: ok`. `target` is the workflow that the call
 * acts on (null for a read). Returns `{ line, pulled }`: `pulled` is true when the claim of the
 * lease pulled commits of another computer, so the caller rebuilds the registry.
 */
export function recordsLine(root, { target = null, host = null, now = Date.now() } = {}) {
  const project = linkedProject(root);
  const layer = layerOf(root);
  if (!project && !layer) return { line: null, pulled: false };
  const r = quote(root);
  let pulled = false;

  if (project && target && leasesOn(recordsHome())) {
    const before = heldBefore(root, target);
    const c = claimAndPull(root, target, { host });
    if (!c.ok) {
      if (c.held && before) return { line: stopLine(`${target}: another computer, ${by(c.lease)}, took the lease until ${c.lease.expires}. Stop the stage: that computer writes the workflow now.`), pulled };
      if (c.held) return { line: stopLine(`${target} runs on ${by(c.lease)} until ${c.lease.expires}. The work continues here after \`wf.mjs lease release ${r} ${target}\` runs on that computer, or after that time.`), pulled };
      if (c.expired) return { line: askLine(`The lease of ${c.lease.machine} on ${target} expired at ${c.lease.expires}. Take the workflow over on this computer?`, `lease claim ${r} ${target} --take`, `lease decline ${r} ${target}`), pulled };
      if (c.offline) return { line: askLine(`The records repo cannot be reached, so no other computer knows that ${target} runs here. Continue?`, `lease show ${r} ${target}`, `lease decline ${r} ${target}`), pulled };
      return { line: stopLine(`${target}: another computer claimed the lease at the same time (${c.reason ?? 'a race'}). Run the call again.`), pulled };
    }
    if (c.pull?.conflict) return { line: stopLine(`the pull of the records stopped at a conflict in ${c.pull.files.join(', ') || 'a file'}. Run \`wf.mjs records status ${r} --problems\`.`), pulled };
    pulled = Boolean(c.pull?.ok && c.pull.to !== c.pull.from);
  }

  const state = readState();
  const newer = (at) => !state.dismissed || Date.parse(at) > Date.parse(state.dismissed);
  const facts = [];
  if (project) {
    const conflict = (state.pushConflict?.files ?? []).filter((f) => target && f.startsWith(`${project}/${target}/`));
    if (conflict.length) return { line: stopLine(`the last push of the records stopped at a conflict in ${conflict.join(', ')}. Run \`wf.mjs records status ${r} --problems\`.`), pulled };
    const log = recordsLogTail();
    const push = lastLogged(['push'], log);
    if (push?.error && newer(push.at)) facts.push(`the last push of the records failed at ${push.at}: ${push.error}`);
    const commit = target ? state.failures?.[`${project}/${target}`] : null;
    if (commit?.step === 'commit' && newer(commit.at)) facts.push(`the last records commit of ${target} failed at ${commit.at}: ${commit.error}`);
  }
  if (layer) {
    const flush = lastLogged(['flush']);
    if (flush?.error && newer(flush.at)) facts.push(`the last send of the GitHub issue edits failed at ${flush.at}: ${flush.error}`);
    const queue = readOutbox();
    const oldest = Date.parse(queue[0]?.at ?? '');
    if (oldest && now - oldest > DAY_MS && newer(new Date(oldest + DAY_MS).toISOString())) facts.push(`${queue.length} GitHub issue edit(s) wait since ${queue[0].at}`);
  }
  if (!facts.length) return { line: null, pulled };
  return { line: askLine(`${upper(facts.join('; '))}. Retry in the background?`, `records retry ${r}${target ? ` ${target}` : ''}`, `records dismiss ${r}`), pulled };
}
