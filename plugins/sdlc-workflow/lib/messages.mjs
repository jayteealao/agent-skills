// Messages between machines, sessions and projects: one file each, in the `inbox/` folder of a
// workflow, named `<time>-<machine>-<kind>.md`.
//
// A message is never a decision: it informs, and the person decides. Each reader records the
// messages that it read in its own state (the machine facts of a linked project, else a file on
// this machine). A project may post into another project's workflow; it reads that project's
// records but never writes them otherwise. Agents post and read messages only through
// `wf.mjs msg`. The GitHub layer mirrors each message as a comment on the issue, and imports the
// person's issue comments as messages.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sdlcHomeDir } from './home.mjs';
import { linkedProject, recordsHome, workflowDir } from './records-root.mjs';
import { commitPaths, liveRef, machineName, mainBranch, readMachineFacts, writeMachineFacts } from './records-sync.mjs';

export const KINDS = ['handoff', 'review-request', 'question-for-project', 'note'];
export const INBOX = 'inbox';
const NAME_RE = /^(\d{8}T\d{6}Z)-([a-z0-9._-]+?)-(handoff|review-request|question-for-project|note)(?:-\d+)?\.md$/;
const stampOf = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** The workflow folder of a message: this project's, or another linked project's in the records home. */
function folderOf(root, slug, project = null) {
  const own = linkedProject(root);
  if (!project || project === own) return { dir: workflowDir(root, slug), project: own };
  return { dir: join(recordsHome(), project, slug), project };
}

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

/** Post one message. Returns `{ id, file, project }`; the commit goes on the workflow's live branch. */
export function postMessage(root, slug, { kind, text, to = null, from = machineName(), now = new Date() }) {
  if (!KINDS.includes(kind)) throw new Error(`msg: the kind must be one of ${KINDS.join(', ')}`);
  if (!String(text ?? '').trim()) throw new Error('msg: the text is empty');
  const { dir, project } = folderOf(root, slug, to);
  if (!existsSync(dir)) throw new Error(`msg: no workflow ${to ? `${to}/` : ''}${slug}`);
  const inbox = join(dir, INBOX);
  mkdirSync(inbox, { recursive: true });
  const base = `${stampOf(now)}-${from}-${kind}`;
  let id = `${base}.md`;
  for (let n = 2; existsSync(join(inbox, id)); n += 1) id = `${base}-${n}.md`;
  const at = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  writeFileSync(join(inbox, id), `---\nkind: ${kind}\nfrom: ${from}\nproject: ${linkedProject(root) ?? 'local'}\nat: ${at}\n---\n\n${String(text).trim()}\n`);
  if (project) {
    const home = recordsHome();
    commitPaths(home, { ref: liveRef(project, slug), base: `refs/heads/${mainBranch(home)}`, paths: [`${project}/${slug}/${INBOX}/${id}`], message: `${project}/${slug}: ${kind} from ${from}` });
  }
  return { id, file: join(inbox, id), project };
}

/** The messages of a workflow, oldest first, each with `read` for this reader. */
export function listMessages(root, slug, { to = null } = {}) {
  const { dir, project } = folderOf(root, slug, to);
  const inbox = join(dir, INBOX);
  if (!existsSync(inbox)) return [];
  const read = new Set(readsOf(root)[`${project ?? 'local'}/${slug}`] ?? []);
  return readdirSync(inbox).filter((f) => NAME_RE.test(f)).sort().map((id) => {
    const [, at, from, kind] = NAME_RE.exec(id);
    return { id, at, from, kind, read: read.has(id) };
  });
}

/** Read one message and record the read. */
export function readMessage(root, slug, id, { to = null } = {}) {
  const { dir, project } = folderOf(root, slug, to);
  const file = join(dir, INBOX, id);
  if (!NAME_RE.test(id) || !existsSync(file)) throw new Error(`msg: no message ${id}`);
  const text = readFileSync(file, 'utf8');
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
    if (!body || /^\*\*(Answer|handoff|review-request|question-for-project|note)\*\*/.test(body)) continue;
    const at = new Date(c.createdAt ?? Date.now());
    const id = `${stampOf(at)}-github-note.md`;
    if (existsSync(join(inbox, id))) continue;
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, id), `---\nkind: note\nfrom: github\nauthor: ${c.author?.login ?? 'unknown'}\nat: ${at.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n---\n\n${body}\n`);
    added.push(id);
  }
  return added;
}
