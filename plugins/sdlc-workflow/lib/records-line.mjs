// The one records line of the dispatch. The dispatch commits nothing and fetches nothing: it
// reads the records log, the state file of this machine and the owner file of the workflow. It
// asks for a claim only when `.machines/` of the clone lists two or more computers, and for a
// take-over when another computer owns the workflow. The line has three forms:
//
//   records: ok                                        the dispatch prints nothing
//   records: ask "<question>" yes=`<command>` no=`<command>`
//   records: stop <reason>
//
// The script writes the question and the two commands. A command that exits 0 lets the key run;
// a command that exits 1 stops it. `wf.mjs` in a command means the wf.mjs of the skill.
import { layerOf, readOutbox } from './github-layer.mjs';
import { hasLiveBranch, lastLogged, machineBlocked, machineCount, machineName, readState, recordsLogTail } from './records-sync.mjs';
import { ownerFacts, ownerOf } from './records-owners.mjs';
import { linkedProject, recordsHome } from './records-root.mjs';
import { syncLine } from './records-committer.mjs';

const DAY_MS = 24 * 60 * 60_000;
const quote = (s) => `"${String(s).replace(/"/g, "'")}"`;
const command = (s) => `\`wf.mjs ${s}\``;
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const askLine = (question, yes, no) => `records: ask ${quote(question)} yes=${command(yes)} no=${command(no)}`;
export const stopLine = (reason) => `records: stop ${reason}`;

/**
 * The records line of a call, or null for `records: ok`. `target` is the workflow that the call
 * acts on (null for a read). Returns `{ line, pulled }`; `pulled` stays false, since the dispatch
 * fetches nothing.
 */
export function recordsLine(root, { target = null, host = null, now = Date.now(), claim = true } = {}) {
  const project = linkedProject(root);
  const layer = layerOf(root);
  if (!project && !layer) return { line: null, pulled: false };
  const r = quote(root);
  let pulled = false;

  if (project && target) {
    const second = machineBlocked(recordsHome());
    if (second) return { line: stopLine(`${second}.`), pulled };
    if (hasLiveBranch(recordsHome(), `${project}/${target}`)) return { line: stopLine(`${target} has a live branch of an older version, so its commits are refused. Show the person \`wf.mjs records migrate --dry-run\`: the move takes the copy of the branch. Run \`wf.mjs records migrate\` only after a yes.`), pulled };
  }

  // The owner of the workflow. The dispatch reads it and claims nothing: a claim and a take-over
  // are commands that the person's answer runs.
  if (project && target) {
    const owner = ownerOf(root, target);
    const me = machineName();
    if (owner && owner.machine !== me) {
      const f = ownerFacts(root, target);
      return { line: askLine(`${target} is owned by ${owner.machine}${f.lastPush ? `, which last sent it at ${f.lastPush}` : ''}${f.stage ? `, at the stage ${f.stage}` : ''}. Take it over on this computer? The other computer's later work is then parked, not lost`, `records take ${r} ${target}`, `records decline ${r} ${target}`), pulled };
    }
    if (!owner && claim && machineCount(recordsHome()) >= 2) {
      return { line: askLine(`${target} has no owner, and ${machineCount(recordsHome())} computers use the records. Claim it for this computer?`, `records claim ${r} ${target}`, `records decline ${r} ${target}`), pulled };
    }
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
    // With the compose sync: a sync that failed, a parked unit, or changes that wait over 5 minutes.
    const sync = syncLine(now);
    if (sync) facts.push(sync.replace(/^records:\s*/, ''));
  }
  if (layer) {
    const flush = lastLogged(['flush']);
    // A queue alone asks nothing: the dispatch that reads it starts the flush itself.
    if (flush?.error && newer(flush.at)) {
      facts.push(`the last send of the GitHub issue edits failed at ${flush.at}: ${flush.error}`);
      const queue = readOutbox();
      const oldest = Date.parse(queue[0]?.at ?? '');
      if (oldest && now - oldest > DAY_MS) facts.push(`${queue.length} GitHub issue edit(s) wait since ${queue[0].at}`);
    }
  }
  if (!facts.length) return { line: null, pulled };
  return { line: askLine(`${upper(facts.join('; '))}. Retry in the background?`, `records retry ${r}${target ? ` ${target}` : ''}`, `records dismiss ${r}`), pulled };
}
