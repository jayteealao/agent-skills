/**
 * lib/brainstorm-archive.mjs — keep a brainstorm's board and document short.
 *
 * A long brainstorm grows without a limit: every resume reads the whole board, and the
 * person's document repeats it. `archiveBoard` moves the closed part of the board (the
 * items of routed or dropped threads that nothing still names, and the log and stories
 * of older sessions) to an archive that a session reads only on demand. `docCheck`
 * reports a document that is over its caps.
 */
import { isStartedState } from './packets.mjs';

/** The newest sessions whose log and stories stay on the board. */
export const SESSIONS_KEPT = 3;
/** The word cap of the document's `## The Brainstorm` section. */
export const SUMMARY_WORD_CAP = 150;

const CLOSED_THREAD_STATES = new Set(['routed', 'dropped']);
// A written packet stays on the board, and so does a started packet of the old form (prepared, routed).
const DONE_PACKET_STATES = new Set(['written', 'prepared', 'routed']);

function wordCount(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/** The keys that the board names from outside `items`: packets, briefs, budgets, sketches. */
function namedKeys(board) {
  const keys = new Set();
  for (const p of board.work ?? []) for (const k of p.items ?? []) keys.add(k);
  for (const b of board.briefs ?? []) for (const c of b.criteria ?? []) for (const k of c.items ?? []) keys.add(k);
  for (const b of board.budgets ?? []) if (b.decision) keys.add(b.decision);
  for (const s of board.sketches ?? []) for (const k of s.items ?? []) keys.add(k);
  return keys;
}

/** The keys an item names: the two sides of a tension, and the decision that replaced it. */
function itemRefs(item) {
  return [...(Array.isArray(item.between) ? item.between : []), item['replaced-by']].filter(Boolean);
}

/**
 * Split a board into the part that stays and the part that goes to the archive.
 * An item goes when its thread is routed or dropped, no packet, brief, budget, or sketch
 * names it, no open packet lists its thread, and no staying item names it. The log and
 * the stories go when their session is older than the newest `keep` sessions.
 */
export function archiveBoard(board, { keep = SESSIONS_KEPT } = {}) {
  const threads = new Map((board.threads ?? []).map((t) => [t.key, t]));
  const openThreads = new Set();
  for (const p of board.work ?? []) {
    if (isStartedState(p.state) || DONE_PACKET_STATES.has(p.state)) continue;
    for (const t of p.threads ?? []) openThreads.add(t);
  }
  const named = namedKeys(board);
  const items = board.items ?? [];
  const going = new Set(items.filter((i) => {
    const t = threads.get(i.thread);
    return t && CLOSED_THREAD_STATES.has(t.state) && !openThreads.has(i.thread) && !named.has(i.key);
  }).map((i) => i.key));
  // An item that stays keeps every item it names.
  for (let changed = true; changed;) {
    changed = false;
    for (const i of items) {
      if (going.has(i.key)) continue;
      for (const k of itemRefs(i)) if (going.delete(k)) changed = true;
    }
  }
  const sessions = Number(board.sessions) || 0;
  const oldSession = (s) => Number.isFinite(Number(s)) && Number(s) <= sessions - keep;
  const archived = {
    items: items.filter((i) => going.has(i.key)),
    log: (board.log ?? []).filter((e) => oldSession(e.session)),
    stories: (board.stories ?? []).filter((s) => oldSession(s.session)),
  };
  const kept = {
    ...board,
    items: items.filter((i) => !going.has(i.key)),
    log: (board.log ?? []).filter((e) => !oldSession(e.session)),
    stories: (board.stories ?? []).filter((s) => !oldSession(s.session)),
  };
  return { board: kept, archived, count: archived.items.length + archived.log.length + archived.stories.length };
}

/** Merge a new archive part into an earlier archive file's content. */
export function mergeArchive(prior, part) {
  const out = { items: [...(prior?.items ?? [])], log: [...(prior?.log ?? [])], stories: [...(prior?.stories ?? [])] };
  const seen = new Set(out.items.map((i) => i.key));
  for (const i of part.items) if (!seen.has(i.key)) out.items.push(i);
  out.log.push(...part.log);
  out.stories.push(...part.stories);
  return out;
}

/** The text of one `## <name>` section of a markdown body, without its heading. */
function section(markdown, name) {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, n) => n > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n');
}

/** The caps of the person's document. Returns warnings; an empty list passes. */
export function docCheck(markdown, { keep = SESSIONS_KEPT, cap = SUMMARY_WORD_CAP } = {}) {
  const warnings = [];
  const summary = section(markdown, 'The Brainstorm');
  if (summary != null) {
    const words = wordCount(summary.replace(/<!--[\s\S]*?-->/g, ''));
    if (words > cap) warnings.push(`## The Brainstorm has ${words} words, more than ${cap}: rewrite it shorter.`);
  }
  const stories = section(markdown, 'Sessions');
  if (stories != null) {
    const count = stories.split(/\r?\n/).filter((l) => l.startsWith('### ')).length;
    if (count > keep) warnings.push(`## Sessions tells ${count} sessions, more than ${keep}: move the older stories to archive/record.md.`);
  }
  return warnings;
}
