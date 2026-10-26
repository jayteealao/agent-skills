// lib/ideate.mjs — the pure side of /wf intake ideate (WF-IDEATE-SOURCES-PLAN, WF-IDEATE-TRIAGE-PLAN).
//
// Four jobs, each with a test:
//   classifyArgs        Step 0: give each argument a kind from its shape (section 3);
//                       after a slug, the mode: resume, refresh, steer, or pick.
//   sourceItemProblems  Step 6: every source item has exactly one result (section 4.2).
//   triageProblems      the loop: triage states, links between ideas, and rounds resolve.
//   redactIssue         section 5.3: an issue reference copy keeps no author, body, or comment.
// scripts/ideate-sources.mjs owns the disk and `gh`; this module reads nothing.

export const LENSES = Object.freeze(['quality', 'performance', 'security', 'dx', 'feature', 'architecture']);
export const RESERVED = Object.freeze(['research', 'issues']);
// The words after an ideate slug that run a round (intake/ideate/_rounds.md).
export const STEER_WORDS = Object.freeze(['deeper', 'similar', 'lens', 'direction', 'surprise']);
export const TRIAGE_STATES = Object.freeze(['open', 'take', 'later', 'drop', 'brainstorm']);
export const ROUND_KINDS = Object.freeze(['initial', 'deeper', 'similar', 'lens', 'direction']);
export const RESULTS = Object.freeze(['applies', 'already-used', 'not-applicable', 'blocked-by-version', 'needs-verification', 'already-fixed', 'duplicate-of', 'withdrawn']);
// Results that only an issue item can have.
const ISSUE_ONLY = new Set(['already-fixed', 'duplicate-of']);
export const MAX_ISSUES = 100;
export const MAX_AGENT_RESEARCH = 8;

/**
 * Split an argument string on whitespace. A quoted run ("…" or '…') is one token and
 * is always a topic word: quotes are how a topic says `research` or `issues`.
 */
export function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(text ?? '')))) {
    if (m[1] !== undefined || m[2] !== undefined) out.push({ token: m[1] ?? m[2], quoted: true });
    else out.push({ token: m[3], quoted: false });
  }
  return out;
}

const ISSUE_URL = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues(?:[/?#]|$)/i;
const URL_RE = /^https?:\/\//i;
const DEP_RE = /^(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)@(v?\d[\w.+-]*|latest|next)$/i;

/**
 * Give each argument a kind (section 3). The first rule that matches wins.
 * `isIdeateSlug(token)` and `isFile(token)` are the two disk checks; the caller supplies them.
 * Rule 1 (an existing ideate slug) applies to the first token only: the tokens after it are
 * a resume (none), `refresh`, a steer (a word of STEER_WORDS, with the rest as `target`), or
 * the pick, and stay unclassified in `rest`. A quoted first token is never a steer word.
 */
export function classifyArgs(input, { isIdeateSlug = () => false, isFile = () => false } = {}) {
  const tokens = Array.isArray(input) ? input.map((t) => (typeof t === 'string' ? { token: t, quoted: false } : t)) : splitArgs(input);
  const kinds = [];
  const out = { mode: 'new', slug: null, rest: [], steer: null, target: null, sources: [], research: false, count: null, lenses: [], topic: [], kinds };
  if (tokens.length && !tokens[0].quoted && isIdeateSlug(tokens[0].token)) {
    out.mode = 'resume';
    out.slug = tokens[0].token;
    const after = tokens.slice(1);
    out.rest = after.map((t) => t.token);
    kinds.push({ token: tokens[0].token, kind: 'slug' });
    const first = after[0];
    if (!first) return out;
    if (!first.quoted && first.token === 'refresh') out.mode = 'refresh';
    else if (!first.quoted && STEER_WORDS.includes(first.token.toLowerCase())) {
      out.mode = 'steer';
      out.steer = first.token.toLowerCase();
      out.target = after.slice(1).map((t) => t.token).join(' ');
    } else out.mode = 'pick';
    return out;
  }
  for (const { token, quoted } of tokens) {
    let kind;
    if (quoted) kind = 'topic';
    else if (ISSUE_URL.test(token)) kind = 'issues';
    else if (URL_RE.test(token)) kind = 'web';
    else if (isFile(token)) kind = 'document';
    else if (DEP_RE.test(token)) kind = 'dependency';
    else if (token === 'issues' || token.startsWith('issues:')) kind = 'issues';
    else if (token === 'research') kind = 'research';
    else if (/^\d+$/.test(token)) kind = 'count';
    else if (LENSES.includes(token.toLowerCase())) kind = 'lens';
    else kind = 'topic';
    kinds.push({ token, kind });
    if (['issues', 'web', 'document', 'dependency'].includes(kind)) out.sources.push({ kind, origin: token });
    else if (kind === 'research') out.research = true;
    else if (kind === 'count') out.count = Number(token);
    else if (kind === 'lens') out.lenses.push(token.toLowerCase());
    else out.topic.push(token);
  }
  return out;
}

const slugWord = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** The `<focus-slug>` of `ideate-<focus-slug>-<YYYYMMDD>`. */
export function focusSlug(parsed) {
  if (parsed.lenses.length) return parsed.lenses.join('-');
  if (parsed.topic.length) return slugWord(parsed.topic.join(' ')) || 'all';
  if (parsed.sources.length || parsed.research) return 'sources';
  return 'all';
}

/**
 * The coverage guarantee (section 4.2) and the references between ids. Each problem
 * names the item, so the write step can refuse the artifact and say which items to finish.
 */
export function sourceItemProblems(fm) {
  const out = [];
  if (!fm || typeof fm !== 'object') return out;
  const sources = Array.isArray(fm.sources) ? fm.sources : [];
  const items = Array.isArray(fm['source-items']) ? fm['source-items'] : [];
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const sourceIds = new Set(sources.map((s) => s?.id));
  const kindOf = new Map(sources.map((s) => [s?.id, s?.kind]));
  const ideaIds = new Set(ideas.map((i) => i?.id));
  const itemIds = new Set();
  for (const it of items) {
    const id = it?.id ?? '<no id>';
    if (itemIds.has(id)) out.push(`source item ${id}: the id is used twice`);
    itemIds.add(id);
    const src = String(id).split('-')[0];
    if (!sourceIds.has(src)) out.push(`source item ${id}: names source ${src}, which is not in sources`);
    if (!it?.result) { out.push(`source item ${id}: has no result. Give it one of ${RESULTS.join(', ')}`); continue; }
    if (!RESULTS.includes(it.result)) { out.push(`source item ${id}: result ${it.result} is not one of ${RESULTS.join(', ')}`); continue; }
    if (ISSUE_ONLY.has(it.result) && kindOf.get(src) !== 'issues') out.push(`source item ${id}: ${it.result} is for issue items only`);
    if (it.result === 'applies' && it.idea && !ideaIds.has(it.idea)) out.push(`source item ${id}: names idea ${it.idea}, which is not in ideas`);
    if (it.result === 'duplicate-of' && it['duplicate-of'] && !items.some((x) => x.id === it['duplicate-of'])) out.push(`source item ${id}: duplicate-of names ${it['duplicate-of']}, which is not a source item`);
  }
  for (const s of sources) {
    if (s?.state !== 'read') continue;
    const n = items.filter((it) => String(it?.id).startsWith(`${s.id}-`)).length;
    if (Number.isInteger(s.items) && s.items !== n) out.push(`source ${s.id}: items is ${s.items}, but the roster holds ${n} items of it`);
  }
  for (const idea of ideas) {
    for (const ref of idea?.['source-items'] ?? []) if (!itemIds.has(ref)) out.push(`idea ${idea.id}: names source item ${ref}, which is not in source-items`);
  }
  return out;
}

/**
 * The triage check (WF-IDEATE-TRIAGE-PLAN 9.3). A record with no triage key, no
 * links, and no rounds is a run from before the loop, and passes.
 */
export function triageProblems(fm) {
  const out = [];
  if (!fm || typeof fm !== 'object') return out;
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const culled = Array.isArray(fm.culled) ? fm.culled : [];
  const rounds = Array.isArray(fm.rounds) ? fm.rounds : [];
  const ideaIds = new Set(ideas.map((i) => i?.id));
  const allIds = new Set([...ideaIds, ...culled.map((c) => c?.id)]);
  const roundNs = new Set([1, ...rounds.map((r) => r?.n)]);
  const merged = new Map();
  for (const idea of ideas) {
    const id = idea?.id ?? '<no id>';
    const t = idea?.triage;
    if (t === 'drop' && !idea['triage-reason']) out.push(`idea ${id}: a drop needs triage-reason (the person's words, or "no reason given")`);
    if (t === 'brainstorm' && !idea['routed-to']) out.push(`idea ${id}: triage brainstorm needs routed-to, the brainstorm slug`);
    if (idea?.parent && !allIds.has(idea.parent)) out.push(`idea ${id}: parent ${idea.parent} is not in ideas or culled`);
    if (idea?.['merged-into'] !== undefined) {
      if (!ideaIds.has(idea['merged-into'])) out.push(`idea ${id}: merged-into ${idea['merged-into']} is not in ideas`);
      else merged.set(id, idea['merged-into']);
    }
    if (idea?.round !== undefined && !roundNs.has(idea.round)) out.push(`idea ${id}: round ${idea.round} is not in rounds`);
  }
  for (const start of merged.keys()) {
    const seen = new Set([start]);
    let at = merged.get(start);
    while (merged.has(at)) {
      if (seen.has(at)) { out.push(`idea ${start}: the merged-into chain loops`); break; }
      seen.add(at);
      at = merged.get(at);
    }
  }
  for (const c of culled) {
    const id = c?.id ?? '<no id>';
    if (c?.source === 'person' && !c.reason) out.push(`culled ${id}: a person's drop needs reason`);
    if (c?.round !== undefined && !roundNs.has(c.round)) out.push(`culled ${id}: round ${c.round} is not in rounds`);
  }
  for (const r of rounds) {
    if ((r?.kind === 'deeper' || r?.kind === 'similar') && r.target && !allIds.has(r.target)) out.push(`round ${r.n}: target ${r.target} is not in ideas or culled`);
  }
  return out;
}

/**
 * The reference copy of one issue (section 5.3): no author, no body, no comment text.
 * The summary is the agent's own two sentences; it starts empty.
 */
export function redactIssue(issue) {
  const reactions = Array.isArray(issue?.reactionGroups)
    ? issue.reactionGroups.reduce((n, g) => n + (Number(g?.users?.totalCount ?? g?.totalCount ?? 0) || 0), 0)
    : Number(issue?.reactions ?? 0) || 0;
  const comments = Array.isArray(issue?.comments) ? issue.comments.length : Number(issue?.comments ?? 0) || 0;
  return {
    number: issue?.number ?? null,
    title: String(issue?.title ?? ''),
    labels: (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
    state: issue?.state ?? null,
    url: issue?.url ?? null,
    'created-at': issue?.createdAt ?? null,
    'updated-at': issue?.updatedAt ?? null,
    comments,
    reactions,
    summary: null,
  };
}

/** The `gh` form of one issue argument (section 5.1), or null when the argument is not an issue source. */
export function issueQuery(origin, remoteRepo = null) {
  const s = String(origin ?? '');
  if (s === 'issues') return { kind: 'list', repo: remoteRepo, search: null };
  if (s.startsWith('issues:')) return { kind: 'list', repo: remoteRepo, search: s.slice(7) };
  const m = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+)\/issues(?:\/(\d+))?(?:\?(.*))?/i);
  if (!m) return null;
  const repo = `${m[1]}/${m[2]}`;
  if (m[3]) return { kind: 'view', repo, number: Number(m[3]) };
  const q = new URLSearchParams(m[4] ?? '').get('q');
  return { kind: 'list', repo, search: q ? q.replace(/\bis:issue\b/g, '').trim() || null : null };
}
