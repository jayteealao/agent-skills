// The page of a brainstorm: one HTML file that shows the board and every decision to the
// person, in the workflow's records folder (`page/index.html`).
//
// A medium-tier sub-agent writes the page from a brief that this module builds. It writes the
// page as the draft `.draft/page.html`, and `wf.mjs page put` checks the draft and moves it into
// place. The checks are mechanical: every area, thread, decision and work packet of the board,
// and every live entry of the decision store, has an element with its key; the page loads
// nothing from the network; it has a light and a dark scheme and a phone layout; and it names
// the board version that it shows, so a stale page is found.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { DRAFT_DIR } from './records.mjs';
import { localWorkflowsRoot, workflowDir } from './records-root.mjs';

export const BOARD_FILE = 'brainstorm-board.json';
export const PAGE_REL = 'page/index.html';
export const PAGE_DRAFT = 'page.html';

function readBoard(dir) {
  const file = join(dir, BOARD_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The version of what the page shows: a hash of the board and the decision store. */
export function boardVersion(dir) {
  const h = createHash('sha1');
  for (const f of [BOARD_FILE, 'decisions.yaml']) {
    const p = join(dir, f);
    h.update(existsSync(p) ? readFileSync(p) : '');
  }
  return h.digest('hex').slice(0, 16);
}

const keysOf = (list) => (Array.isArray(list) ? list.map((x) => x?.key).filter(Boolean) : []);

/** The keys that the page must show, by group. */
export function requiredKeys(dir) {
  const board = readBoard(dir) ?? {};
  const items = Array.isArray(board.items) ? board.items : [];
  return {
    areas: keysOf(board.areas),
    threads: keysOf(board.threads),
    decisions: items.filter((i) => i.kind === 'decision').map((i) => i.key),
    work: keysOf(board.work),
    ledger: liveDecisions(readDecisions(dir)).map((d) => d.id).filter(Boolean),
  };
}

/** The brief of the page agent: what to read, what to show, where to write. */
export function pageBrief(root, slug) {
  const dir = workflowDir(root, slug);
  const board = readBoard(dir);
  if (!board) return { ok: false, reason: `${slug} has no ${BOARD_FILE}` };
  return {
    ok: true,
    slug,
    board: join(dir, BOARD_FILE),
    decisions: join(dir, 'decisions.yaml'),
    document: '01-brainstorm.md',
    draft: join(dir, DRAFT_DIR, PAGE_DRAFT),
    page: join(dir, PAGE_REL),
    version: boardVersion(dir),
    keys: requiredKeys(dir),
  };
}

const VERSION_RE = /<meta\s+name=["']wf:board["']\s+content=["']([0-9a-f]+)["']/i;

/** The problems of a page text against the board of `dir`. An empty list is a good page. */
export function pageProblems(html, dir) {
  const problems = [];
  if (!/<title>[^<]+<\/title>/i.test(html)) problems.push('the page has no <title>');
  if (!/<meta\s+name=["']viewport["']/i.test(html)) problems.push('the page has no viewport meta, so a phone shows it at desktop width');
  if (!/prefers-color-scheme\s*:\s*dark/i.test(html)) problems.push('the page has no dark scheme (prefers-color-scheme: dark)');
  if (/<(script|link|img|iframe|source|video|audio)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html) || /@import\s+url\(\s*["']?(https?:)?\/\//i.test(html)) {
    problems.push('the page loads a file from the network; it must hold everything inline');
  }
  const v = VERSION_RE.exec(html)?.[1];
  if (!v) problems.push('the page has no <meta name="wf:board" content="<version>">');
  else if (v !== boardVersion(dir)) problems.push(`the page shows board version ${v}, not ${boardVersion(dir)}`);
  const keys = requiredKeys(dir);
  for (const [group, list] of Object.entries(keys)) {
    const missing = list.filter((k) => !new RegExp(`data-key=["']${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html));
    if (missing.length) problems.push(`no element with data-key for these ${group}: ${missing.join(', ')}`);
  }
  return problems;
}

/** Check the page in place: `{ ok, exists, stale, problems }`. */
export function checkPage(root, slug) {
  const dir = workflowDir(root, slug);
  const file = join(dir, PAGE_REL);
  if (!existsSync(file)) return { ok: false, exists: false, stale: true, problems: ['no page yet'] };
  const html = readFileSync(file, 'utf8');
  const problems = pageProblems(html, dir);
  return { ok: !problems.length, exists: true, stale: VERSION_RE.exec(html)?.[1] !== boardVersion(dir), problems };
}

/** Check the draft and move it into place. A draft with a problem stays where it is. */
export function putPage(root, slug) {
  const dir = workflowDir(root, slug);
  // The draft is in <wf-dir>/.draft/; the local folder of the old layout is read second, for one release.
  const draft = [join(dir, DRAFT_DIR, PAGE_DRAFT), join(localWorkflowsRoot(root), slug, DRAFT_DIR, PAGE_DRAFT)].find(existsSync);
  if (!draft) return { ok: false, problems: [`no draft ${DRAFT_DIR}/${PAGE_DRAFT}`] };
  const problems = pageProblems(readFileSync(draft, 'utf8'), dir);
  if (problems.length) return { ok: false, draft, problems };
  mkdirSync(join(dir, 'page'), { recursive: true });
  const target = join(dir, PAGE_REL);
  // The draft folder and the records home can be on two drives: copy, then delete.
  copyFileSync(draft, target);
  rmSync(draft, { force: true });
  return { ok: true, page: target };
}
