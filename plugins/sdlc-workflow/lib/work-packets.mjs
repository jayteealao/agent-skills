// Work packets (BRAINSTORM-WORK-PACKETS-PLAN). A brainstorm's `done` writes one
// packet per resulting workflow slug, generated from brainstorm-board.json. The
// board stays the single truth; this module checks a work set and renders the
// packets, so a carried decision reaches its packet word for word (I1).
//
// Pure functions first (checkWorkSet, renderPacket, renderWorkIndex, ...), then
// writeWorkSet, the one function that touches the disk.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { safeParseFrontmatter } from './frontmatter.mjs';
import { validateBrainstormBoard, validateFrontmatter } from './schema-validator.mjs';

// The forms that open or extend a workflow slug get a packet (K1).
export const PACKET_FORMS = Object.freeze(['intake', 'investigate', 'discover', 'rca', 'fix', 'hotfix', 'task', 'extension']);
// Forms that target an existing workflow slug.
export const TARGETED_FORMS = Object.freeze(['extension', 'fix', 'hotfix']);
// A packet in one of these states is never rewritten (K4, V3).
export const STARTED_STATES = Object.freeze(['prepared', 'routed']);
// Size limits count carried decisions (Q5): more than SOFT is large, more than HARD is too-large.
export const SIZE_SOFT_LIMIT = 25;
export const SIZE_HARD_LIMIT = 40;
const SIZE_SMALL_LIMIT = 10;

// A citation of a gitignored scratch path (F4). `.scratch/` is the plugin's own
// scratch folder; a citation of it breaks on another machine and in a worktree.
const SCRATCH_RE = /(?:^|[\s`'"(/\\])\.scratch[/\\]/;

const SIGNATURE_LINE_RE = /^(?:revision|generated-at):.*$/gm;

// The board a work set is generated from, and the lead document beside it. A brainstorm's
// board is brainstorm-board.json; an ideate run's board is ideate-work.json, in the same
// shape (WF-IDEATE-SOURCES-PLAN 8.1). Packet links name the board they came from.
export const DEFAULT_FILES = Object.freeze({ board: 'brainstorm-board.json', lead: '01-brainstorm.md' });
export const IDEATE_FILES = Object.freeze({ board: 'ideate-work.json', lead: '01-ideate.md' });
export function filesFor(boardFile = DEFAULT_FILES.board) {
  if (boardFile === IDEATE_FILES.board) return IDEATE_FILES;
  return { board: boardFile, lead: DEFAULT_FILES.lead };
}

export function isPacketPiece(piece) {
  return PACKET_FORMS.includes(piece?.shape);
}

export function isWriteNowPiece(piece) {
  return piece?.shape === 'write-now';
}

export function isStartedState(state) {
  return STARTED_STATES.includes(state);
}

function byKey(list = []) {
  const map = new Map();
  for (const entry of list) if (entry?.key) map.set(entry.key, entry);
  return map;
}

function ordered(pieces) {
  return [...pieces].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.key).localeCompare(String(b.key)));
}

function isLive(item) {
  return item && !item['replaced-by'] && item.scope !== 'cut' && item.scope !== 'later';
}

/** The kept decisions a piece carries, in the piece's own order. */
export function carriedDecisionItems(board, piece) {
  const items = byKey(board.items);
  return (piece.items ?? [])
    .map((key) => items.get(key))
    .filter((item) => item?.kind === 'decision' && isLive(item));
}

export function sizeOf(count) {
  if (count > SIZE_HARD_LIMIT) return 'too-large';
  if (count > SIZE_SOFT_LIMIT) return 'large';
  if (count > SIZE_SMALL_LIMIT) return 'medium';
  return 'small';
}

/** The packet file name for a piece: its slug, or its key when it has none. */
export function packetFileName(piece) {
  return `${piece.slug ?? piece.key}.md`;
}

/** Every path a board cites: item evidence, piece references, brief sources. */
export function boardCitations(board) {
  const out = [];
  for (const item of board.items ?? []) {
    if (typeof item.evidence === 'string') out.push({ where: `items.${item.key}.evidence`, text: item.evidence });
  }
  for (const piece of board.work ?? []) {
    for (const ref of piece.references ?? []) out.push({ where: `work.${piece.key}.references`, text: ref });
  }
  for (const brief of board.briefs ?? []) {
    if (typeof brief.source === 'string') out.push({ where: `briefs.${brief.key}.source`, text: brief.source });
  }
  return out;
}

/** Citations of `.scratch/` and, with `isIgnored`, of any other gitignored path (F4). */
export function findIgnoredCitations(board, { isIgnored = null } = {}) {
  const hits = [];
  for (const citation of boardCitations(board)) {
    if (SCRATCH_RE.test(citation.text) || citation.text.startsWith('.scratch/')) {
      hits.push(citation);
      continue;
    }
    if (isIgnored) {
      const path = citation.text.replace(/[#:].*$/, '').trim();
      if (path && !/^[a-z]+:\/\//i.test(path) && !/^F\d+$/.test(path) && isIgnored(path)) hits.push(citation);
    }
  }
  return hits;
}

/**
 * The sequence of the pieces (WF-CAMPAIGN-ORDER-PLAN 4.1): every piece has an
 * `order`, the orders are 1 to n with no gap and no repeat, and each piece after
 * order 1 has a `why-here` note. The brainstorm agrees no dependency graph: the
 * campaign owns it. Returns the errors.
 */
export function sequenceErrors(pieces) {
  const errors = [];
  const seen = new Map();
  for (const piece of pieces) {
    if (!Number.isInteger(piece.order) || piece.order < 1) {
      errors.push(`piece ${piece.key}: no order. Agree its place in the sequence with the person (3.3).`);
      continue;
    }
    if (seen.has(piece.order)) errors.push(`pieces ${seen.get(piece.order)} and ${piece.key} have the same order ${piece.order}: the sequence is strict.`);
    else seen.set(piece.order, piece.key);
    if (piece.order > 1 && !String(piece['why-here'] ?? '').trim()) errors.push(`piece ${piece.key} (order ${piece.order}): no why-here. Record why it comes after the pieces before it, in the person's words (3.3).`);
  }
  const n = pieces.length;
  for (let i = 1; i <= n; i++) if (!seen.has(i) && seen.size) errors.push(`the sequence has no piece with order ${i}: the orders are 1 to ${n}, each used once.`);
  return errors;
}

/**
 * Check a board's work set before its packets are written (3.4 step 1).
 * Errors stop the write; warnings go to the person as proposals.
 */
export function checkWorkSet(board, { isIgnored = null } = {}) {
  const errors = [];
  const warnings = [];
  const pieces = board.work ?? [];
  const items = byKey(board.items);

  const shape = validateBrainstormBoard(board);
  if (!shape.valid) {
    for (const e of shape.errors) errors.push(`board schema: ${e.path || '/'} ${e.message}`);
  }

  // Slugs: every packet piece names the slug it opens, and no two share one.
  const slugs = new Map();
  for (const piece of pieces.filter(isPacketPiece)) {
    if (!piece.slug) errors.push(`piece ${piece.key}: no slug. Agree the slug that the packet opens (3.3).`);
    else if (slugs.has(piece.slug)) errors.push(`pieces ${slugs.get(piece.slug)} and ${piece.key} open the same slug ${piece.slug}.`);
    else slugs.set(piece.slug, piece.key);
    if (TARGETED_FORMS.includes(piece.shape) && !piece['target-slug']) {
      errors.push(`piece ${piece.key}: form ${piece.shape} needs target-slug, the existing workflow it changes.`);
    }
  }

  // The sequence (WF-CAMPAIGN-ORDER-PLAN 4.1). The dependency graph is the campaign's.
  errors.push(...sequenceErrors(pieces));

  // Coverage (I6, K10): every kept decision lands in exactly one piece, or is shared.
  const homes = new Map();
  for (const piece of pieces) {
    for (const key of piece.items ?? []) {
      if (!items.has(key)) {
        errors.push(`piece ${piece.key} names item ${key}, which is not on the board.`);
        continue;
      }
      if (!homes.has(key)) homes.set(key, []);
      homes.get(key).push(piece);
    }
  }
  for (const item of board.items ?? []) {
    if (item.kind !== 'decision' || item.scope !== 'keep' || item['replaced-by']) continue;
    const owners = homes.get(item.key) ?? [];
    if (!owners.length) {
      errors.push(`kept decision ${item.key} ("${item.text}") lands in no piece of work.`);
    } else if (owners.length > 1) {
      const unshared = owners.filter((p) => !(p.shared ?? []).includes(item.key));
      if (unshared.length) {
        errors.push(`kept decision ${item.key} lands in ${owners.map((p) => p.key).join(', ')}: mark it shared on each, or keep one.`);
      }
    }
  }

  // Size (Q5): count carried decisions. A started piece is never split (M3b).
  for (const piece of pieces.filter(isPacketPiece)) {
    const count = carriedDecisionItems(board, piece).length;
    const size = sizeOf(count);
    if (size === 'too-large' && !isStartedState(piece.state)) {
      errors.push(`piece ${piece.key} carries ${count} decisions, more than ${SIZE_HARD_LIMIT}: split it with the person before 3.4 confirms.`);
    } else if (size === 'large' && !isStartedState(piece.state)) {
      warnings.push(`piece ${piece.key} carries ${count} decisions, more than ${SIZE_SOFT_LIMIT}: propose a split; the person may keep it whole.`);
    }
    // WF-SYSTEM-REVIEW D5: intake shows the person how old each carried decision is.
    const undated = carriedDecisionItems(board, piece).filter((i) => i.session == null || !i['decided-at']);
    if (undated.length && !isStartedState(piece.state)) {
      warnings.push(`piece ${piece.key}: ${undated.length} carried decision(s) have no session or decided-at (${undated.slice(0, 3).map((i) => i.key).join(', ')}${undated.length > 3 ? ', …' : ''}): write both on each decision.`);
    }
    // D3: a piece with decisions and no finding gives its unit no evidence.
    if (count && !isStartedState(piece.state) && !touchingItems(board, piece, 'finding').length) {
      warnings.push(`piece ${piece.key} carries ${count} decisions and no finding: put the findings that bear on them in its items or on its threads, or say why there are none.`);
    }
  }

  // Write-now pieces (K5-K8).
  for (const piece of pieces.filter(isWriteNowPiece)) {
    if (piece.state === 'written' && !(piece['written-files'] ?? []).length) {
      errors.push(`write-now piece ${piece.key} is written but records no written-files.`);
    }
    if (piece.state !== 'written' && piece.state !== 'proposed') {
      errors.push(`write-now piece ${piece.key} has state ${piece.state}; it is proposed or written.`);
    }
  }

  // Sources (F4): no citation of a gitignored path.
  for (const hit of findIgnoredCitations(board, { isIgnored })) {
    errors.push(`${hit.where} cites ${hit.text}, a gitignored path: copy it into references/ or record a pointer row, then cite the reference id.`);
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------- rendering

function dump(data) {
  return yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' }).trimEnd();
}

function itemLine(item, { withWhy = false, boardFile = DEFAULT_FILES.board } = {}) {
  const parts = [`- **${item.key}** — ${item.text}`];
  if (withWhy && item.why) parts.push(` Why: ${item.why}`);
  if (item['accepted-risk']) parts.push(` Accepted risk: ${item['accepted-risk']}`);
  if (item.evidence) parts.push(` Evidence: \`${item.evidence}\`.`);
  parts.push(` ([board](../${boardFile}#${item.key}))`);
  return parts.join('');
}

function itemsOfKind(board, piece, kinds, predicate = () => true) {
  const items = byKey(board.items);
  return (piece.items ?? []).map((k) => items.get(k)).filter((i) => i && kinds.includes(i.kind) && predicate(i));
}

function threadItems(board, piece, predicate) {
  const threads = new Set(piece.threads ?? []);
  const own = new Set(piece.items ?? []);
  return (board.items ?? []).filter((i) => threads.has(i.thread) && !own.has(i.key) && predicate(i));
}

/**
 * WF-SYSTEM-REVIEW D3: the items of one kind that touch a piece: in its items, on its
 * threads, or (a tension) naming one of its carried decisions in `between`. A finding or
 * a tension that bears on a decision reaches the unit, not only the ones listed by hand.
 */
export function touchingItems(board, piece, kind, predicate = isLive) {
  const own = itemsOfKind(board, piece, [kind], predicate);
  const seen = new Set(own.map((i) => i.key));
  const threads = new Set(piece.threads ?? []);
  const decisions = new Set(carriedDecisionItems(board, piece).map((i) => i.key));
  const more = (board.items ?? []).filter((i) => i && i.kind === kind && !seen.has(i.key) && predicate(i)
    && (threads.has(i.thread) || (Array.isArray(i.between) && i.between.some((k) => decisions.has(k)))));
  return [...own, ...more];
}

const liveAssumption = (i) => isLive(i) && i.state !== 'rejected';
const openTension = (i) => i.state === 'open' && !i['replaced-by'];

function researchLink(id, researchFiles) {
  const file = researchFiles.find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
  return file ? `[${id}](../research/${file})` : id;
}

function referenceLink(ref) {
  return /^F\d+$/.test(ref) ? `[${ref}](../references/index.md#${ref.toLowerCase()})` : `\`${ref}\``;
}

function startCommand(slug, piece) {
  return `/wf intake .ai/workflows/${slug}/work/${packetFileName(piece)}`;
}

/**
 * The carried sketches of a piece (DESIGN-BOARDS-PLAN W5b): each key with its
 * file under the board's `design/sketches/`, its canvas link, and its caption.
 * A board path that does not start with `.ai/` is relative to the board folder.
 */
export function packetSketches(board, piece) {
  const sketches = byKey(board.sketches);
  return (piece.sketches ?? []).map((key) => {
    const s = sketches.get(key) ?? {};
    const path = s.path ? (String(s.path).startsWith('.ai/') ? s.path : `.ai/workflows/${board.slug}/${s.path}`) : null;
    return { key, path, link: s.link ?? null, ...(s.caption ? { caption: s.caption } : {}) };
  });
}

/** The frontmatter object of a piece's packet. */
export function packetFrontmatter(board, piece, { revision = 1, generatedAt = null } = {}) {
  const decisions = carriedDecisionItems(board, piece);
  const shared = new Set(piece.shared ?? []);
  const keysOf = (list) => list.map((i) => i.key);
  return {
    schema: 'sdlc/v1',
    type: 'work-packet',
    slug: board.slug,
    key: piece.key,
    'work-slug': piece.slug ?? piece.key,
    title: piece.title,
    form: piece.shape,
    'target-slug': piece['target-slug'] ?? null,
    amends: piece.amends ?? null,
    urgency: piece.urgency ?? 'normal',
    revision,
    'origin-brainstorm': board.slug,
    order: piece.order ?? 1,
    // WF-CAMPAIGN-ORDER-PLAN 4.1: the packet carries its place in the sequence, not a dependency graph.
    ...(piece['why-here'] ? { 'why-here': piece['why-here'] } : {}),
    'carried-decisions': decisions.map((i) => ({
      key: i.key,
      text: i.text,
      ...(i.why ? { why: i.why } : {}),
      session: i.session ?? null,
      'decided-at': i['decided-at'] ?? null,
      ...(shared.has(i.key) ? { shared: true } : {}),
    })),
    'open-ideas': keysOf([
      ...itemsOfKind(board, piece, ['idea', 'question'], isLive),
      ...threadItems(board, piece, (i) => i.kind === 'question' && (i.state === 'open' || i.state === 'for-plan')),
      ...touchingItems(board, piece, 'tension', openTension),
    ]),
    findings: keysOf(touchingItems(board, piece, 'finding')),
    assumptions: keysOf(touchingItems(board, piece, 'assumption', liveAssumption)),
    later: keysOf(threadItems(board, piece, (i) => i.scope === 'later')),
    research: piece.research ?? [],
    references: piece.references ?? [],
    'ux-impact': piece['ux-impact'] ?? 'none',
    design: piece['design-form'] ?? 'none',
    ...(piece.sketches?.length ? { sketches: packetSketches(board, piece) } : {}),
    size: sizeOf(decisions.length),
    state: isStartedState(piece.state) ? piece.state : 'proposed',
    'routed-to': piece['routed-to'] ?? null,
    ...(generatedAt ? { 'generated-at': generatedAt } : {}),
  };
}

/** The full text of a piece's packet (section 5.2). */
export function renderPacket(board, piece, { revision = 1, generatedAt = null, researchFiles = [], files = DEFAULT_FILES } = {}) {
  const fm = packetFrontmatter(board, piece, { revision, generatedAt });
  const pieces = board.work ?? [];
  const pieceKeys = byKey(pieces);
  const decisions = carriedDecisionItems(board, piece);
  const open = itemsOfKind(board, piece, ['idea', 'question'], isLive);
  const openTensions = touchingItems(board, piece, 'tension', openTension);
  const openQuestions = threadItems(board, piece, (i) => i.kind === 'question' && (i.state === 'open' || i.state === 'for-plan'));
  const findings = touchingItems(board, piece, 'finding');
  const assumptions = touchingItems(board, piece, 'assumption', liveAssumption);
  const risks = decisions.filter((i) => i['accepted-risk']);
  const later = threadItems(board, piece, (i) => i.scope === 'later');
  const cut = threadItems(board, piece, (i) => i.scope === 'cut');
  const linkTo = (key) => {
    const other = pieceKeys.get(key);
    if (!other) return `\`${key}\``;
    if (isWriteNowPiece(other)) return `${other.title} (written in the brainstorm session; state ${other.state})`;
    return `[${other.title}](${packetFileName(other)})`;
  };
  const none = '- None.';
  const lines = [];
  lines.push('---', dump(fm), '---', '');
  lines.push(`# ${piece.title}`, '');
  lines.push(`The board wins where this packet and the board differ: [${files.board}](../${files.board}), [${files.lead}](../${files.lead}). The work set: [index.md](index.md).`, '');

  lines.push('## Start', '');
  lines.push(`Form: \`${piece.shape}\`${piece['target-slug'] ? ` on \`${piece['target-slug']}\`` : ''}. Order: ${piece.order ?? 1}. Size: ${fm.size}, carried decisions: ${decisions.length}.`, '');
  // 4.1: the piece before it in the sequence, and why this piece comes after it.
  const before = (piece.order ?? 1) > 1 ? pieces.find((p) => p.order === piece.order - 1) : null;
  if (before) lines.push(`Comes after: ${linkTo(before.key)}, because ${String(piece['why-here'] ?? '').trim().replace(/\.$/, '')}.`, '');
  lines.push('```', startCommand(board.slug, piece), '```', '');

  lines.push('## What the person decided', '');
  lines.push('Intake shows these decisions with their dates, and the person confirms or changes each group. Intake does not re-word them.', '');
  if (decisions.length) {
    for (const item of decisions) {
      const when = [item.session ? `session ${item.session}` : null, item['decided-at'] ?? null].filter(Boolean).join(', ');
      lines.push(`${itemLine(item, { withWhy: true, boardFile: files.board })}${when ? ` (${when})` : ''}${(piece.shared ?? []).includes(item.key) ? ' Shared with another packet.' : ''}`);
    }
  } else lines.push(none);
  lines.push('');

  lines.push('## What is still open', '');
  const openAll = [...open, ...openQuestions, ...openTensions];
  lines.push(...(openAll.length ? openAll.map((i) => itemLine(i, { boardFile: files.board })) : [none]), '');

  lines.push('## What we found', '');
  lines.push('Intake re-verifies each finding against the current code. A contradicted finding becomes a known unknown.', '');
  lines.push(...(findings.length ? findings.map((i) => itemLine(i, { boardFile: files.board })) : [none]), '');

  lines.push('## What we assume', '');
  const assumeLines = [...assumptions.map((i) => itemLine(i, { boardFile: files.board })), ...risks.map((i) => `- Accepted risk with **${i.key}**: ${i['accepted-risk']}`)];
  lines.push(...(assumeLines.length ? assumeLines : [none]), '');

  lines.push('## Left for later and cut', '');
  const leftLines = [
    ...later.map((i) => `${itemLine(i, { boardFile: files.board })} Left for later.`),
    ...cut.map((i) => `${itemLine(i, { boardFile: files.board })} Cut${i.reason ? `: ${i.reason}` : ''}.`),
  ];
  lines.push(...(leftLines.length ? leftLines : [none]), '');

  lines.push('## Sources', '');
  const sources = [
    ...(piece.research ?? []).map((id) => `- Research: ${researchLink(id, researchFiles)}`),
    ...(piece.references ?? []).map((ref) => `- Reference: ${referenceLink(ref)}`),
    ...(fm.sketches ?? []).map((sk) => `- Sketch \`${sk.key}\`: ${sk.path ? `\`${sk.path}\`` : 'no file'}${sk.link ? ` ([canvas](${sk.link}))` : ''}${sk.caption ? ` — ${sk.caption}` : ''}`),
  ];
  lines.push(...(sources.length ? sources : [none]), '');
  return lines.join('\n');
}

/** The text of work/index.md (K2). */
export function renderWorkIndex(board, { revision = 1, generatedAt = null, files = DEFAULT_FILES } = {}) {
  const pieces = ordered(board.work ?? []);
  const packets = pieces.filter(isPacketPiece);
  const writeNow = pieces.filter(isWriteNowPiece);
  const fm = {
    schema: 'sdlc/v1',
    type: 'work-set',
    slug: board.slug,
    'work-set': packets.length > 1 ? 'multi' : packets.length === 1 ? 'single' : 'none',
    'work-revision': revision,
    slugs: packets.map((p) => p.slug ?? p.key),
    written: writeNow.filter((p) => p.state === 'written').map((p) => p.key),
    ...(generatedAt ? { 'generated-at': generatedAt } : {}),
  };
  const lines = ['---', dump(fm), '---', ''];
  lines.push(`# Work set: ${board.topic ?? board.slug}`, '');
  lines.push(`The board wins where this file and the board differ: [${files.board}](../${files.board}). Changes by revision: [changes.md](changes.md).`, '');

  lines.push('## Packets', '');
  if (packets.length) {
    lines.push('| Order | Packet | Form | Size | State | Why here |', '|---|---|---|---|---|---|');
    for (const p of packets) {
      const size = sizeOf(carriedDecisionItems(board, p).length);
      lines.push(`| ${p.order ?? ''} | [${p.title}](${packetFileName(p)}) | ${p.shape}${p['target-slug'] ? ` on \`${p['target-slug']}\`` : ''} | ${size} | ${isStartedState(p.state) ? p.state : 'proposed'} | ${String(p['why-here'] ?? '').trim() || '—'} |`);
    }
  } else lines.push('- None.');
  lines.push('');

  lines.push('## Written in the brainstorm session', '');
  if (writeNow.length) {
    for (const p of writeNow) {
      const files = (p['written-files'] ?? []).map((f) => `\`${f.path}\`${f.section ? ` (${f.section})` : ''}`).join(', ');
      lines.push(`- **${p.key}** — ${p.title}. State: ${p.state}.${files ? ` Files: ${files}.` : ''}`);
    }
  } else lines.push('- None.');
  lines.push('');

  lines.push('## Start commands', '');
  if (packets.length) {
    // 4.1: the serial path follows the sequence; the campaign plans the parallel waves.
    lines.push(packets.length > 1
      ? `In order. Start a packet after every packet above it is done. To build them in parallel waves, run \`/wf campaign ${board.slug}\`.`
      : 'One packet. Start it with its command.', '');
    for (const p of packets) lines.push(`${p.order ?? ''}. \`${startCommand(board.slug, p)}\``);
  } else lines.push('- None.');
  lines.push('');
  return lines.join('\n');
}

/** The text of research/index.md (R5). `notes` are { file, data } from research/. */
export function renderResearchIndex(board, notes) {
  const lines = ['# Research notes', '', 'Each line: the note, its question, and the board items that cite it.', ''];
  if (!notes.length) lines.push('- None.');
  for (const note of notes) {
    const id = note.data?.id ?? note.file.replace(/-.*$/, '').replace(/\.md$/, '');
    const citing = (board.items ?? [])
      .filter((i) => typeof i.evidence === 'string' && i.evidence.includes(`research/${note.file}`))
      .map((i) => i.key);
    const pieces = (board.work ?? []).filter((p) => (p.research ?? []).includes(id)).map((p) => p.key);
    const cites = [...citing, ...pieces.map((k) => `work:${k}`)];
    lines.push(`- [${id}](${note.file}) — ${note.data?.question ?? '(no question recorded)'} — cited by: ${cites.length ? cites.join(', ') : 'nothing yet'}`);
  }
  lines.push('');
  return lines.join('\n');
}

function signature(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(SIGNATURE_LINE_RE, '').trim();
}

/**
 * WF-SYSTEM-REVIEW D2: what a packet says, without its revision, its time, and the
 * link-back fields that intake writes (state, routed-to, decision-changed). A history
 * copy of a started packet is written only when this changes.
 */
export function packetContent(text) {
  const p = safeParseFrontmatter(String(text ?? ''));
  if (!p.data) return signature(text);
  const d = { ...p.data };
  for (const k of ['revision', 'generated-at', 'state', 'routed-to', 'decision-changed']) delete d[k];
  return `${JSON.stringify(d)}\n${signature(p.content)}`;
}

/** D2: the text of the newest history copy of a packet (`history/work-<key>.r<n>.md`), or null. */
function latestHistoryCopy(historyDir, key) {
  let names = [];
  try { names = readdirSync(historyDir); } catch { return null; }
  const prefix = `work-${key}.r`;
  let best = null;
  for (const n of names) {
    if (!n.startsWith(prefix) || !n.endsWith('.md')) continue;
    const r = Number(n.slice(prefix.length, -3));
    if (Number.isInteger(r) && (!best || r > best.r)) best = { r, n };
  }
  return best ? readFileSync(join(historyDir, best.n), 'utf8') : null;
}

/**
 * Refuse a rewrite of a started packet (V3). A write may change only the
 * link-back fields that intake owns (state, routed-to, decision-changed).
 * Returns an error string, or null when the write is allowed.
 */
export function startedPacketRewriteError(oldText, newText) {
  const before = safeParseFrontmatter(oldText);
  if (!before.data || !isStartedState(before.data.state)) return null;
  const after = safeParseFrontmatter(newText);
  if (!after.data) return null;
  const strip = (data) => {
    const copy = { ...data };
    for (const k of ['state', 'routed-to', 'decision-changed', 'generated-at']) delete copy[k];
    return JSON.stringify(copy);
  };
  if (strip(before.data) !== strip(after.data) || signature(before.content) !== signature(after.content)) {
    return `packet ${before.data.key ?? ''} is ${before.data.state}: a started packet is never rewritten. A new decision about its slug becomes a new packet (extension, fix, or hotfix) with amends: ${before.data.key ?? '<key>'}.`;
  }
  return null;
}

// ---------------------------------------------------------------- disk

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readResearchNotes(dir) {
  const research = join(dir, 'research');
  if (!existsSync(research)) return [];
  return readdirSync(research)
    .filter((f) => /^R\d+.*\.md$/.test(f))
    .sort()
    .map((file) => ({ file, data: safeParseFrontmatter(readFileSync(join(research, file), 'utf8')).data ?? {} }));
}

function readExistingPackets(workDir) {
  const out = new Map();
  if (!existsSync(workDir)) return out;
  for (const file of readdirSync(workDir)) {
    if (!file.endsWith('.md') || file === 'index.md' || file === 'changes.md') continue;
    const text = readFileSync(join(workDir, file), 'utf8');
    const data = safeParseFrontmatter(text).data;
    if (data?.type === 'work-packet') out.set(data.key ?? file, { file, text, data });
  }
  return out;
}

function stamp(now) {
  return (now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Write the work set of the brainstorm in `dir` from its board (3.4 step 2):
 * each packet, then research/index.md, then work/index.md last. A started
 * packet is kept; its regenerated body goes to history/ (K4). Returns a summary.
 */
export function writeWorkSet(dir, { now = null, isIgnored = null, dryRun = false, boardFile = DEFAULT_FILES.board } = {}) {
  const files = filesFor(boardFile);
  const boardPath = join(dir, files.board);
  const board = readJson(boardPath);
  const check = checkWorkSet(board, { isIgnored });
  if (check.errors.length) return { ok: false, ...check };

  const workDir = join(dir, 'work');
  const historyDir = join(dir, 'history');
  const at = stamp(now);
  const existing = readExistingPackets(workDir);
  const indexPath = join(workDir, 'index.md');
  const oldIndex = existsSync(indexPath) ? safeParseFrontmatter(readFileSync(indexPath, 'utf8')).data ?? {} : {};
  const oldRevision = Number.isInteger(oldIndex['work-revision']) ? oldIndex['work-revision'] : 0;
  const revision = oldRevision + 1;
  const researchFiles = readResearchNotes(dir).map((n) => n.file);

  const added = [];
  const changed = [];
  const kept = [];
  const historyOnly = [];
  const writes = [];
  const packets = ordered((board.work ?? []).filter(isPacketPiece));
  for (const piece of packets) {
    const text = renderPacket(board, piece, { revision, generatedAt: at, researchFiles, files });
    const fm = packetFrontmatter(board, piece, { revision, generatedAt: at });
    const shape = validateFrontmatter(fm);
    if (!shape.valid) return { ok: false, errors: shape.errors.map((e) => `packet ${piece.key}: ${e.path} ${e.message}`), warnings: check.warnings };
    const prior = existing.get(piece.key);
    existing.delete(piece.key);
    if (prior && (isStartedState(prior.data.state) || isStartedState(piece.state))) {
      kept.push(piece.key);
      // D2: compare with the newest history copy when one exists, so an unchanged piece
      // makes no new copy, no changes line, and no new work revision.
      if (packetContent(latestHistoryCopy(historyDir, piece.key) ?? prior.text) !== packetContent(text)) {
        historyOnly.push(piece.key);
        writes.push({ path: join(historyDir, `work-${piece.key}.r${revision}.md`), text });
      }
      continue;
    }
    if (!prior) added.push(piece.key);
    else if (signature(prior.text) !== signature(text)) changed.push(piece.key);
    else continue;
    writes.push({ path: join(workDir, packetFileName(piece)), text, removeFirst: prior && prior.file !== packetFileName(piece) ? join(workDir, prior.file) : null });
  }

  // A packet whose piece is gone: a proposed one moves to history/; a started one stays (V6).
  const cut = [];
  const pendingCut = [];
  for (const [key, prior] of existing) {
    if (isStartedState(prior.data.state)) pendingCut.push(key);
    else cut.push({ key, file: prior.file });
  }

  const priorWritten = new Set(oldIndex.written ?? []);
  const writtenNow = (board.work ?? []).filter((p) => isWriteNowPiece(p) && p.state === 'written' && !priorWritten.has(p.key));

  const changedSet = added.length || changed.length || cut.length || historyOnly.length || writtenNow.length;
  const finalRevision = changedSet || !oldRevision ? revision : oldRevision;
  if (!changedSet && oldRevision) {
    return { ok: true, revision: oldRevision, added, changed, kept, cut: [], pendingCut, writtenNow: [], warnings: check.warnings, unchanged: true };
  }

  if (!dryRun) {
    mkdirSync(workDir, { recursive: true });
    for (const w of writes) {
      mkdirSync(join(w.path, '..'), { recursive: true });
      if (w.removeFirst) mkdirSync(historyDir, { recursive: true });
      if (w.removeFirst && existsSync(w.removeFirst)) renameSync(w.removeFirst, join(historyDir, `work-${w.removeFirst.split(/[\\/]/).pop().replace(/\.md$/, '')}.r${oldRevision || 1}.md`));
      writeFileSync(w.path, w.text);
    }
    for (const c of cut) {
      mkdirSync(historyDir, { recursive: true });
      renameSync(join(workDir, c.file), join(historyDir, `work-${c.key}.r${oldRevision || 1}.md`));
    }
    const notes = readResearchNotes(dir);
    if (notes.length || existsSync(join(dir, 'research'))) {
      mkdirSync(join(dir, 'research'), { recursive: true });
      writeFileSync(join(dir, 'research', 'index.md'), renderResearchIndex(board, notes));
    }
    const entry = [
      `## Revision ${finalRevision} — ${at}`,
      '',
      ...added.map((k) => `- Added: \`${k}\`.`),
      ...changed.map((k) => `- Changed: \`${k}\`.`),
      ...cut.map((c) => `- Cut: \`${c.key}\` (moved to history/).`),
      ...pendingCut.map((k) => `- Pending cut: \`${k}\` is started; the person decides whether to remove the work.`),
      ...historyOnly.map((k) => `- Started, not rewritten: \`${k}\`; the regenerated text is in history/work-${k}.r${finalRevision}.md.`),
      ...writtenNow.map((p) => `- Written in the session: \`${p.key}\` — ${(p['written-files'] ?? []).map((f) => `\`${f.path}\``).join(', ')}.`),
      '',
    ].join('\n');
    const changesPath = join(workDir, 'changes.md');
    if (!existsSync(changesPath)) writeFileSync(changesPath, '# Work set changes\n\nOne entry per revision of the work set. The campaign reads this file.\n\n');
    appendFileSync(changesPath, entry);
    writeFileSync(indexPath, renderWorkIndex(board, { revision: finalRevision, generatedAt: at, files }));
  }

  return { ok: true, revision: finalRevision, added, changed, kept, cut: cut.map((c) => c.key), pendingCut, writtenNow: writtenNow.map((p) => p.key), warnings: check.warnings };
}
