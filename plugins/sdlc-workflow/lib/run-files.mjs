// The run files and the large evidence of a workflow, out of the records folder.
//
// A workflow folder holds only the files that git commits. Two other kinds of file live in the
// project, on this machine only:
//
//   <root>/.ai/run/<slug>/        the run files (RUN_FILES): the stop request, the watch
//                                 offsets, the outcome of the last driver run, the script log;
//                                 the answer log sits at the top of <root>/.ai/run/
//   <root>/.ai/evidence/<slug>/   traces, videos and other files over the size cap
//
// A writer writes the new place. A reader reads the new place first, then the old place in the
// workflow folder, so a run that an older plugin started still works. Each records commit of a
// workflow folder first moves the old files out (sweepRunFiles): it moves, never deletes, and
// keeps the name. The record lists each evidence file in `local-evidence.jsonl` (path, size,
// sha256, machine), so another computer sees that the file exists and where it was made.
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { readMachineConfig } from './home.mjs';
import { resolveProjectRoot } from './project-root.mjs';
import { splitCostLedger } from './cost-ledger.mjs';
import {
  AI_DIR, EVIDENCE_DIR, RUN_FILES, evidenceDir, linkedProject, recordsRel, runDir, runRoot, workflowDir,
} from './records-root.mjs';

/** The record of the evidence that stays on one machine: one JSON line per file. */
export const EVIDENCE_LOG = 'local-evidence.jsonl';

const slash = (p) => String(p ?? '').replace(/\\/g, '/');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The size above which a file stays out of the records, in bytes: `records.max-file-mb` of
 * ~/.sdlc/config.json, else 5 MB.
 */
export function maxFileBytes() {
  const mb = Number(readMachineConfig().records?.['max-file-mb']);
  return Math.round((Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024);
}

// A folder of this machine: its own .gitignore keeps it out of the product repo.
function ensureLocalFolder(top, dir) {
  mkdirSync(dir, { recursive: true });
  const ignore = join(top, '.gitignore');
  if (!existsSync(ignore)) {
    try { writeFileSync(ignore, '# The files of this machine: never committed.\n*\n'); } catch { /* the ignore file is a help, not the write */ }
  }
  return dir;
}

/** Make a run folder of a workflow, <root>/.ai/run/<slug>/, given its path, and return it. */
export const ensureRunFolder = (dir) => ensureLocalFolder(dirname(dir), dir);

/** Make <root>/.ai/run/<slug>/ and return it. */
export const ensureRunDir = (root, slug) => ensureLocalFolder(runRoot(root), runDir(root, slug));

/** Make <root>/.ai/evidence/<slug>/ and return it. */
export const ensureEvidenceDir = (root, slug) => ensureLocalFolder(join(root, AI_DIR, EVIDENCE_DIR), evidenceDir(root, slug));

/** The path that a writer writes a run file of the workflow to; the folder exists. */
export const runFileFor = (root, slug, name) => join(ensureRunDir(root, slug), name);

/** The place of a run file in the workflow folder, where an older plugin wrote it. */
export const oldRunFile = (root, slug, name) => join(workflowDir(root, slug), name);

/** The run file a reader reads: the new place, else the old place, else null. */
export function findRunFile(root, slug, name) {
  for (const f of [join(runDir(root, slug), name), oldRunFile(root, slug, name)]) if (existsSync(f)) return f;
  return null;
}

/**
 * The run folder of a workflow folder, or null. `root` names the project when the caller knows
 * it. Else a local workflow folder (<root>/.ai/workflows/<slug>) names its own project, and a
 * folder of the records clone names the project of the working directory when that project is
 * linked to it.
 */
export function runDirOf(slugDir, root = null) {
  if (!slugDir) return null;
  const slug = basename(resolve(slugDir));
  if (root) return runDir(resolve(root), slug);
  const n = slash(resolve(slugDir));
  const m = (process.platform === 'win32' ? /^(.*)\/\.ai\/workflows\/[^/]+$/i : /^(.*)\/\.ai\/workflows\/[^/]+$/).exec(n);
  if (m) return runDir(m[1], slug);
  const rel = recordsRel(n)?.split('/');
  if (!rel || rel.length !== 2) return null;
  const here = resolveProjectRoot(process.cwd());
  return linkedProject(here) === rel[0] ? runDir(here, slug) : null;
}

export function sha256Of(file) {
  const h = createHash('sha256');
  h.update(readFileSync(file));
  return h.digest('hex');
}

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// Move one file. A move to another drive copies, checks the copy and then removes the source.
// A target that exists keeps its place: the same bytes drop the copy in the folder, a log
// (.jsonl) takes the lines it lacks, and any other file stays where it is.
function moveFile(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  if (existsSync(dst)) {
    if (sha256Of(src) === sha256Of(dst)) { rmSync(src, { force: true }); return 'moved'; }
    if (!src.endsWith('.jsonl')) return 'kept';
    const have = new Set(readFileSync(dst, 'utf8').split(/\r?\n/).filter(Boolean));
    const add = readFileSync(src, 'utf8').split(/\r?\n/).filter((l) => l && !have.has(l));
    if (add.length) {
      const text = readFileSync(dst, 'utf8');
      appendFileSync(dst, `${text && !text.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`);
    }
    const now = new Set(readFileSync(dst, 'utf8').split(/\r?\n/).filter(Boolean));
    if (readFileSync(src, 'utf8').split(/\r?\n/).some((l) => l && !now.has(l))) return 'kept';
    rmSync(src, { force: true });
    return 'moved';
  }
  try {
    renameSync(src, dst);
    return 'moved';
  } catch (e) {
    if (!['EXDEV', 'EPERM'].includes(e.code)) return 'kept';
  }
  try {
    copyFileSync(src, dst);
    if (sha256Of(src) !== sha256Of(dst)) { rmSync(dst, { force: true }); return 'kept'; }
    rmSync(src, { force: true });
    return 'moved';
  } catch { return 'kept'; }
}

const COST_RE = /^cost(?:-\d{4}-\d{2})?\.jsonl$/;

// The files over the cap under `dir`, relative to it. A draft and a cost ledger stay: the drafts
// leave with the put, and the cost rows must stay readable.
function overCap(dir, limit) {
  const out = [];
  const walk = (abs, rel) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== '.draft' && e.name !== '.git') walk(join(abs, e.name), r); continue; }
      if (!e.isFile() || (!rel && (COST_RE.test(e.name) || e.name === EVIDENCE_LOG))) continue;
      try { if (statSync(join(abs, e.name)).size > limit) out.push(r); } catch { /* gone */ }
    }
  };
  walk(dir, '');
  return out;
}

/** The lines of the evidence record of a workflow folder. */
export function readEvidenceLog(dir) {
  const file = join(dir, EVIDENCE_LOG);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/**
 * List in the evidence record of `dir` each file of <root>/.ai/evidence/<slug>/ that the record
 * does not name yet with its size: one line of path, size, sha256 and machine. Returns the new lines.
 */
export function noteEvidence(root, slug, dir, { machine = null } = {}) {
  const base = evidenceDir(root, slug);
  if (!existsSync(base) || !existsSync(dir)) return [];
  const known = new Set(readEvidenceLog(dir).map((e) => `${e.path}\0${e.bytes}`));
  const lines = [];
  const walk = (abs) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(abs, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile()) continue;
      const path = slash(relative(root, p));
      const bytes = statSync(p).size;
      if (known.has(`${path}\0${bytes}`)) continue;
      lines.push({ path, bytes, sha256: sha256Of(p), machine: machine ?? hostname().toLowerCase(), at: nowIso() });
    }
  };
  walk(base);
  if (lines.length) appendFileSync(join(dir, EVIDENCE_LOG), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  return lines;
}

/**
 * Move the run files and the files over the cap out of a workflow folder (`dir`, a folder of the
 * records clone) to <root>/.ai/run/<slug>/ and <root>/.ai/evidence/<slug>/, keep each name, and
 * list the evidence in the record. An old `cost.jsonl` is split into its monthly files first. A
 * file whose move cannot be checked stays where it is. Returns `{ moved, evidence, kept, split }`.
 */
export function sweepRunFiles(root, slug, dir, { machine = null } = {}) {
  const out = { moved: [], evidence: [], kept: [], split: null };
  if (!root || !slug || !dir || !existsSync(dir)) return out;
  try {
    if (existsSync(join(dir, 'cost.jsonl'))) out.split = splitCostLedger(dir);
  } catch (e) { out.split = { split: false, reason: e.message }; }
  for (const name of RUN_FILES) {
    const src = join(dir, name);
    if (!isFile(src)) continue;
    const r = moveFile(src, join(ensureRunDir(root, slug), name));
    (r === 'moved' ? out.moved : out.kept).push(name);
  }
  const limit = maxFileBytes();
  for (const rel of overCap(dir, limit)) {
    const r = moveFile(join(dir, rel), join(ensureEvidenceDir(root, slug), rel));
    (r === 'moved' ? out.evidence : out.kept).push(rel);
  }
  try { noteEvidence(root, slug, dir, { machine }); } catch { /* the record line waits for the next commit */ }
  return out;
}
