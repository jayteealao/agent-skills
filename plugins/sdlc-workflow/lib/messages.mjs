// Messages between machines, sessions and projects: one file each, in the `inbox/` folder of a
// workflow, named `<time>-<machine>-<kind>.md`.
//
// A message is never a decision: it informs, and the person decides. Each reader records the
// messages that it read in its own state (the machine facts of a linked project, else a file on
// this machine). A project may post into another project's workflow; it reads that project's
// records but never writes them otherwise. A project that is not linked on this machine is read
// from git objects, and a post to it pushes one commit with the message file. Agents post and read
// messages only through
// `wf.mjs msg`. The GitHub layer mirrors each message as a comment on the issue, and imports the
// person's issue comments as messages.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sdlcHomeDir } from './home.mjs';
import { linkedProject, recordsHome, workflowDir } from './records-root.mjs';
import { commitPaths, liveRef, machineName, mainBranch, namesAt, otherProjectSource, postFileTo, readMachineFacts, textAt, writeMachineFacts } from './records-sync.mjs';

export const KINDS = ['handoff', 'review-request', 'question-for-project', 'note'];
export const INBOX = 'inbox';
const NAME_RE = /^(\d{8}T\d{6}Z)-([a-z0-9._-]+?)-(handoff|review-request|question-for-project|note)(?:-\d+)?\.md$/;
const stampOf = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/**
 * The workflow folder of a message: this project's, or another project's in the records home.
 * The folder of another project that has no live branch here is a commit: `ref` names it, and
 * `missing` is true when no commit has the workflow.
 */
function folderOf(root, slug, project = null) {
  const own = linkedProject(root);
  if (!project || project === own) return { dir: workflowDir(root, slug), project: own, ref: null };
  const home = recordsHome();
  const src = otherProjectSource(project, slug, home);
  return { dir: join(home, project, slug), project, ref: src?.ref ?? null, missing: !src };
}

/** The message files of an inbox: on disk, or in the commit `ref`. */
const inboxNames = ({ dir, project, ref }, slug) => (ref ? namesAt(ref, `${project}/${slug}/${INBOX}`) : existsSync(join(dir, INBOX)) ? readdirSync(join(dir, INBOX)) : []);

const localReadsPath = () => join(sdlcHomeDir(), 'message-reads.json');
function readsOf(root) {
  if (linkedProject(root)) return readMachineFacts().reads ?? {};
  try { return JSON.parse(readFileSync(localReadsPath(), 'utf8')); } catch { return {}; }
}
function addRead(root, key, id) {
  const reads = readsOf(root);
  const list = new Set(reads[key] ?? []);
  if (list.has(id)) return;
  list.add(id);
  const change = { [key]: [...list].sort() };
  if (linkedProject(root)) writeMachineFacts(root, { reads: change });
  else {
    mkdirSync(sdlcHomeDir(), { recursive: true });
    writeFileSync(localReadsPath(), `${JSON.stringify({ ...reads, ...change }, null, 2)}\n`);
  }
}

// The comments that the GitHub layer writes carry this mark (lib/github-layer.mjs).
const LAYER_MARK = '<!-- wf-layer -->';

/** The number of a comment: the digits of its `#issuecomment-<n>` URL, else a number from its id. */
function commentNumber(c) {
  const n = /issuecomment-(\d+)/.exec(String(c?.url ?? ''))?.[1];
  if (n) return n;
  return String(parseInt(createHash('sha1').update(String(c?.id ?? c?.body ?? '')).digest('hex').slice(0, 12), 16));
}

/** Post one message. Returns `{ id, file, project }`; the commit goes on the workflow's live branch. */
export function postMessage(root, slug, { kind, text, to = null, from = machineName(), now = new Date() }) {
  if (!KINDS.includes(kind)) throw new Error(`msg: the kind must be one of ${KINDS.join(', ')}`);
  if (!String(text ?? '').trim()) throw new Error('msg: the text is empty');
  const where = folderOf(root, slug, to);
  const { dir, project, ref } = where;
  if (where.missing || (!ref && !existsSync(dir))) throw new Error(`msg: no workflow ${to ? `${to}/` : ''}${slug}`);
  const inbox = join(dir, INBOX);
  const taken = new Set(inboxNames(where, slug));
  const base = `${stampOf(now)}-${from}-${kind}`;
  let id = `${base}.md`;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}.md`;
  const at = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const body = `---\nkind: ${kind}\nfrom: ${from}\nproject: ${linkedProject(root) ?? 'local'}\nat: ${at}\n---\n\n${String(text).trim()}\n`;
  if (ref) {
    // Only the message file goes onto the other project's live branch; nothing else is written.
    const p = postFileTo(project, slug, { path: `${INBOX}/${id}`, text: body, message: `${project}/${slug}: ${kind} from ${from}` });
    if (!p.pushed) throw new Error(`msg: the post to ${project}/${slug} needs the records remote: ${p.reason}`);
    return { id, file: null, project, pushed: true };
  }
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, id), body);
  if (project) {
    const home = recordsHome();
    commitPaths(home, { ref: liveRef(project, slug), base: `refs/heads/${mainBranch(home)}`, paths: [`${project}/${slug}/${INBOX}/${id}`], message: `${project}/${slug}: ${kind} from ${from}` });
  }
  return { id, file: join(inbox, id), project };
}

/** The messages of a workflow, oldest first, each with `read` for this reader. */
export function listMessages(root, slug, { to = null } = {}) {
  const where = folderOf(root, slug, to);
  const read = new Set(readsOf(root)[`${where.project ?? 'local'}/${slug}`] ?? []);
  return inboxNames(where, slug).filter((f) => NAME_RE.test(f)).sort().map((id) => {
    const [, at, from, kind] = NAME_RE.exec(id);
    return { id, at, from, kind, read: read.has(id) };
  });
}

/** Read one message and record the read. */
export function readMessage(root, slug, id, { to = null } = {}) {
  const { dir, project, ref } = folderOf(root, slug, to);
  const file = join(dir, INBOX, id);
  const text = !NAME_RE.test(id) ? null : ref ? textAt(ref, `${project}/${slug}/${INBOX}/${id}`) : existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (text === null) throw new Error(`msg: no message ${id}`);
  addRead(root, `${project ?? 'local'}/${slug}`, id);
  return { id, text: text.replace(/^---\n[\s\S]*?\n---\n\n?/, '') };
}

/**
 * Write the person's issue comments as messages from `github`. A comment that the layer wrote
 * itself is skipped; a comment already written is not written again.
 */
export function importComments(root, slug, comments) {
  const { dir } = folderOf(root, slug);
  const inbox = join(dir, INBOX);
  const added = [];
  for (const c of comments ?? []) {
    const body = String(c?.body ?? '').trim();
    // The layer marks each comment that it writes; every other comment is the person's.
    if (!body || body.includes(LAYER_MARK)) continue;
    const at = new Date(c.createdAt ?? Date.now());
    // The file is named by the comment, so two comments in one second are two files.
    const id = `${stampOf(at)}-github-note-${commentNumber(c)}.md`;
    if (existsSync(join(inbox, id))) continue;
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, id), `---\nkind: note\nfrom: github\nauthor: ${c.author?.login ?? 'unknown'}\nat: ${at.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n---\n\n${body}\n`);
    added.push(id);
  }
  return added;
}
