// lib/ideate.mjs — the pure side of /wf intake ideate: its sources and its triage.
//
// Five jobs, each with a test:
//   classifyArgs        Step 0: give each argument a kind from its shape (section 3);
//                       after a slug, the mode: resume, refresh, steer, or pick.
//   sourceItemProblems  Step 6: every source item has exactly one result (section 4.2).
//   triageProblems      the loop: triage states, links between ideas, and rounds resolve.
//   redactIssue         section 5.3: an issue reference copy keeps no author, body, or comment.
//   buildPickBoard      the pick: the board of ideate-work.json, from the ideas roster and
//                       what the person agreed.
// scripts/ideate-sources.mjs owns the disk and `gh`; this module reads nothing.
import { BUILD_FORMS, PACKET_FORMS, TARGETED_FORMS, UX_IMPACTS } from './packets.mjs';

export const LENSES = Object.freeze(['quality', 'performance', 'security', 'dx', 'feature', 'architecture']);
export const RESERVED = Object.freeze(['research', 'issues']);
// The words after an ideate slug that run a round (intake/ideate/_rounds.md).
export const STEER_WORDS = Object.freeze(['deeper', 'similar', 'lens', 'direction', 'surprise']);
export const TRIAGE_STATES = Object.freeze(['open', 'take', 'later', 'drop', 'brainstorm']);
export const ROUND_KINDS = Object.freeze(['initial', 'deeper', 'similar', 'lens', 'direction']);
export const RESULTS = Object.freeze(['applies', 'already-used', 'not-applicable', 'blocked-by-version', 'needs-verification', 'already-fixed', 'duplicate-of', 'withdrawn']);
// Results that only an issue item can have.
const ISSUE_ONLY = new Set(['already-fixed', 'duplicate-of']);
// The key that each result needs. `withdrawn` needs none.
const REQUIRED_KEYS = Object.freeze({
  applies: ['idea'], 'already-used': ['evidence'], 'not-applicable': ['reason'], 'blocked-by-version': ['installed', 'ships-in'],
  'needs-verification': ['check'], 'already-fixed': ['evidence'], 'duplicate-of': ['duplicate-of'],
});
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
    // Each result needs its key (intake/ideate/_sources.md, "Every item gets a result").
    const need = REQUIRED_KEYS[it.result] ?? [];
    const missing = need.filter((k) => it[k] === undefined || it[k] === null || String(it[k]).trim() === '');
    if (missing.length) out.push(`source item ${id}: ${it.result} needs ${missing.join(' and ')}`);
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
 * The triage check. A record with no triage key, no
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

// ---------------------------------------------------------------- the pick

const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ROUTED_FORMS = Object.freeze(['rca', 'investigate', 'discover', 'task']);
const kebab = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
const strings = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/**
 * The form of an idea's `entry:` invocation, with its slug suggestion and its target slug when
 * the entry names them. `isWorkflow(slug)` says whether a workflow of that slug exists.
 *   /wf intake <slug-suggestion>                  intake
 *   /wf intake <existing-slug> <scope> (extension) extension of <existing-slug>
 *   /wf intake fix|hotfix [<existing-slug>] <text> fix or hotfix
 *   /wf intake rca|investigate|discover|task <text>
 */
export function entryForm(entry, { isWorkflow = () => false } = {}) {
  const m = /^\/wf\s+intake\s+(.*)$/is.exec(String(entry ?? '').trim());
  if (!m) return { form: null };
  let rest = m[1].trim();
  const marked = /\(extension\)\s*$/i.test(rest);
  rest = rest.replace(/\(extension\)\s*$/i, '').replace(/\s+from\s+\S+\s*$/i, '').trim();
  const tokens = splitArgs(rest).map((t) => t.token);
  const [first, ...after] = tokens;
  if (!first) return { form: 'intake', text: '' };
  if (ROUTED_FORMS.includes(first)) return { form: first, text: after.join(' ') };
  if (first === 'fix' || first === 'hotfix') {
    const target = after[0] && KEY_RE.test(after[0]) && isWorkflow(after[0]) ? after[0] : null;
    return { form: first, target, text: (target ? after.slice(1) : after).join(' ') };
  }
  if (KEY_RE.test(first) && (marked || (after.length && isWorkflow(first)))) return { form: 'extension', target: first, text: after.join(' ') };
  if (KEY_RE.test(first) && !after.length) return { form: 'intake', slug: first };
  return { form: 'intake', text: tokens.join(' ') };
}

/** The thread key of an idea: IDEA-007 → idea-007. */
export const ideaThread = (id) => `idea-${String(id).replace(/^idea-/i, '').toLowerCase()}`;

/** An evidence path as the board cites it: a reference copy of the workflow is `references/…`; any other `.ai/` path is refused. */
function boardEvidence(ev, slug) {
  const s = String(ev ?? '').trim().replace(/\\/g, '/');
  const own = `.ai/workflows/${slug}/`;
  if (s.startsWith(own)) return s.slice(own.length);
  if (s.startsWith('.ai/')) return null;
  return s;
}

const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Build the board of an ideate pick (intake/ideate.md, Pick): the shape of a brainstorm board
 * (`$defs.brainstormBoard`), so campaign.mjs reads it and the write hook accepts it.
 *
 *   slug      the ideate workflow slug
 *   lead      the frontmatter of 01-ideate.md: its `ideas:` roster and its `focus`
 *   input     what the person agreed: { stack, pick: { reason, at }, packets: [ { ideas: [IDEA-NNN, …],
 *             why-here, goal, in-scope, out-of-scope, acceptance-criteria, constraints, risks, measures,
 *             ux-impact, try-out, estimated-slices, and only when the person changed it: title, slug,
 *             form, target-slug } ] }. The order of `packets` is the order of the list.
 *   existing  the board of an earlier pick, or null: a later pick appends after its last packet
 *
 * Returns { ok: true, board, packets, invocations, warnings } or { ok: false, errors }.
 */
export function buildPickBoard({ slug, lead, input, existing = null, isWorkflow = () => false }) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, errors });
  if (!input || typeof input !== 'object' || Array.isArray(input)) { errors.push('the input is not a JSON object'); return fail(); }
  const ideas = new Map((Array.isArray(lead?.ideas) ? lead.ideas : []).map((i) => [String(i?.id ?? '').toUpperCase(), i]));
  const asked = Array.isArray(input.packets) ? input.packets : [];
  if (!asked.length) errors.push('the input has no packets: give one entry per work packet, in the order of the list');

  const board = existing ? JSON.parse(JSON.stringify(existing)) : {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug, topic: String(lead?.focus ?? 'all'), areas: [], threads: [], items: [], work: [],
  };
  for (const k of ['areas', 'threads', 'items', 'work']) if (!Array.isArray(board[k])) board[k] = [];

  // The pick reason: one decision of the person on the pick thread, carried by the first new packet.
  const reason = String(input.pick?.reason ?? '').trim();
  const at = input.pick?.at;
  if (!reason) errors.push('pick.reason is missing: give the person\'s pick reason in their words');
  if (!isIso(at)) errors.push('pick.at is missing or not an ISO 8601 time: give the chosen-at time of the pick');

  const usedIdeas = new Set(board.work.flatMap((w) => w.threads ?? []));
  const usedSlugs = new Set(board.work.map((w) => w.slug).filter(Boolean));
  const usedKeys = new Set(board.work.map((w) => w.key));
  const lastOrder = board.work.reduce((m, w) => Math.max(m, Number.isInteger(w.order) ? w.order : 0), 0);
  const seenIdeas = new Set();
  const built = [];
  asked.forEach((p, i) => {
    const order = lastOrder + i + 1;
    const where = `packet ${i + 1}`;
    const ids = strings(p?.ideas).map((x) => x.toUpperCase());
    if (!ids.length) { errors.push(`${where}: no ideas. Name the idea ids of the packet, for example ["IDEA-001"]`); return; }
    const picked = [];
    for (const id of ids) {
      const idea = ideas.get(id);
      if (!idea) { errors.push(`${where}: unknown idea id ${id}. It is not in the ideas roster of 01-ideate.md`); continue; }
      if (idea['merged-into']) { errors.push(`${where}: ${id} was merged into ${idea['merged-into']}. Pick ${idea['merged-into']}`); continue; }
      if (seenIdeas.has(id)) { errors.push(`${where}: ${id} is in two packets. Put each idea in one packet`); continue; }
      if (usedIdeas.has(ideaThread(id))) { errors.push(`${where}: ${id} is already in the list of an earlier pick`); continue; }
      if (idea.triage && idea.triage !== 'take') warnings.push(`${id} has triage ${idea.triage}, not take`);
      seenIdeas.add(id);
      picked.push({ id, idea, entry: entryForm(idea.entry, { isWorkflow }) });
    }
    if (picked.length !== ids.length) return;
    const forms = [...new Set(picked.map((x) => x.idea.form ?? x.entry.form))];
    const form = p.form ?? (forms.length === 1 ? forms[0] : null);
    if (!form) { errors.push(`${where}: the ideas ${ids.join(', ')} have different forms (${forms.join(', ')}). Give the form of the packet`); return; }
    if (!PACKET_FORMS.includes(form)) { errors.push(`${where}: form ${form} is not a form of a work packet (${PACKET_FORMS.join(', ')})`); return; }
    const first = picked[0];
    const title = String(p.title ?? '').trim() || picked.map((x) => String(x.idea.title ?? x.id)).join('; ');
    const target = p['target-slug'] ?? first.idea['target-slug'] ?? first.entry.target ?? null;
    const packetSlug = String(p.slug ?? first.idea.slug ?? first.entry.slug ?? (kebab(first.entry.text) && form === 'extension' ? kebab(first.entry.text) : kebab(first.idea.title ?? first.id)));
    if (!KEY_RE.test(packetSlug)) { errors.push(`${where}: slug ${packetSlug} is not lower-case words joined by dashes`); return; }
    if (usedSlugs.has(packetSlug) || usedKeys.has(packetSlug)) { errors.push(`${where}: slug ${packetSlug} is already a packet of the list. Give another slug`); return; }
    usedSlugs.add(packetSlug);
    usedKeys.add(packetSlug);
    if (TARGETED_FORMS.includes(form) && !target) { errors.push(`${where}: form ${form} needs target-slug, the existing workflow it changes. The entry of ${first.id} does not name one`); return; }
    const whyHere = String(p['why-here'] ?? '').trim();
    if (order > 1 && !whyHere) { errors.push(`${where} (order ${order}): no why-here. Give the person's reason why it comes after the packets before it`); return; }

    // The threads, and the evidence of each idea as finding items.
    const threads = [];
    const findings = [];
    for (const { id, idea } of picked) {
      const tk = ideaThread(id);
      threads.push(tk);
      if (!board.threads.some((t) => t.key === tk)) board.threads.push({ key: tk, name: String(idea.title ?? id), state: 'live' });
      const evidence = Array.isArray(idea.evidence) ? idea.evidence : (idea.evidence ? [idea.evidence] : []);
      evidence.forEach((ev, n) => {
        const cited = boardEvidence(ev, slug);
        if (cited === null) { errors.push(`${id}: evidence ${ev} is a .ai/ path. Cite the code, or the reference copy references/<kind>/<file>`); return; }
        if (!cited) return;
        const key = `${tk}-evidence-${n + 1}`;
        findings.push(key);
        if (board.items.some((it) => it.key === key)) return;
        board.items.push({ key, kind: 'finding', thread: tk, text: String(idea.title ?? id), source: cited.startsWith('references/') ? 'research' : 'code', evidence: cited });
      });
    }

    const build = BUILD_FORMS.includes(form);
    const writeUp = {};
    if (build) {
      if (!String(p.goal ?? '').trim()) errors.push(`${where} (${packetSlug}): no goal. Write the goal of the packet`);
      if (!strings(p['acceptance-criteria']).length) errors.push(`${where} (${packetSlug}): no acceptance criteria. Write each checkable criterion`);
      if (!UX_IMPACTS.includes(p['ux-impact'])) errors.push(`${where} (${packetSlug}): ux-impact is missing or not one of ${UX_IMPACTS.join(', ')}`);
      if (!['yes', 'no'].includes(p['try-out'])) errors.push(`${where} (${packetSlug}): try-out is missing; it is yes or no`);
      if (p['estimated-slices'] !== undefined && !Number.isInteger(p['estimated-slices'])) errors.push(`${where} (${packetSlug}): estimated-slices is not a whole number`);
      writeUp.goal = String(p.goal ?? '').trim();
      for (const k of ['in-scope', 'out-of-scope', 'acceptance-criteria', 'constraints', 'risks', 'measures']) {
        const l = strings(p[k]);
        if (l.length) writeUp[k] = l;
      }
      writeUp['ux-impact'] = p['ux-impact'];
      writeUp['ux-impact-confirmed'] = true;
      writeUp['try-out'] = p['try-out'];
      if (Number.isInteger(p['estimated-slices'])) writeUp['estimated-slices'] = p['estimated-slices'];
    }
    built.push({
      ids, form, build, order,
      work: {
        key: packetSlug, slug: packetSlug, title, shape: form,
        ...(target ? { 'target-slug': target } : {}),
        entry: build ? `/wf campaign ${slug}` : `/wf intake ${form} ${packetSlug}`,
        order, ...(order > 1 ? { 'why-here': whyHere } : {}), 'design-form': 'none',
        threads, items: findings, state: 'proposed', ...writeUp,
      },
    });
  });

  // The stack: confirmed once for the list.
  if (input.stack !== undefined && input.stack !== null) {
    if (typeof input.stack !== 'object' || input.stack['user-confirmed'] !== true) errors.push('the stack is not confirmed: confirm it with the person, and give it with user-confirmed: true');
    else board.stack = { ...input.stack };
  }
  if (built.some((b) => b.build) && board.stack?.['user-confirmed'] !== true && !errors.some((e) => e.startsWith('the stack'))) {
    errors.push('the list has a build packet and no confirmed stack: detect the stack, confirm it with the person, and give it with user-confirmed: true');
  }
  if (errors.length) return fail();

  if (!board.threads.some((t) => t.key === 'pick')) board.threads.push({ key: 'pick', name: 'The pick', state: 'live' });
  const n = board.items.filter((it) => it.thread === 'pick' && it.kind === 'decision').length + 1;
  const pickKey = `pick-${n}`;
  board.items.push({ key: pickKey, kind: 'decision', thread: 'pick', text: reason, source: 'person', scope: 'keep', session: n, 'decided-at': at });
  built[0].work.items = [...built[0].work.items, pickKey];
  board.work.push(...built.map((b) => b.work));

  const invocations = [];
  const deps = [...seenIdeas].flatMap((id) => strings([].concat(ideas.get(id)?.['depends-on'] ?? [])));
  if (deps.some((d) => d.includes('/wf intake update-deps'))) invocations.push('/wf intake update-deps');
  if (board.work.some((w) => BUILD_FORMS.includes(w.shape) && !['done', 'dropped'].includes(w.state))) invocations.push(`/wf campaign ${slug}`);
  for (const b of built) if (!b.build) invocations.push(b.work.entry);
  return {
    ok: true,
    board,
    appended: Boolean(existing),
    pick: pickKey,
    packets: built.map((b) => ({ key: b.work.key, slug: b.work.slug, form: b.form, order: b.order, ideas: b.ids, entry: b.work.entry })),
    invocations,
    warnings,
  };
}
