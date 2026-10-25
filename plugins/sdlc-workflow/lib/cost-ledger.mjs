// lib/cost-ledger.mjs — the exact cost ledger (WIDE-VIEW-REPAIR-PLAN §10).
//
// Every integer written here is copied from a record the host wrote: a Claude
// Code transcript line, a Codex rollout `token_count` event, or a pi session
// entry. Nothing is estimated, sampled, or priced; the ledger records tokens,
// never currency. The Stop hook (hooks/cost-ledger.mjs) drives this module once
// per turn; the renderers, `/wf status`, and the eval comparison read the rows.
//
// One file per slug: `.ai/workflows/<slug>/cost.jsonl`, one JSON row per turn:
//   { ts, host, session, turn, key, slug, slice,
//     main: { model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } | null,
//     subagents: [{ agent_id, model, …usage }],
//     external:  [{ provider, model, …usage }] }
// Codex rows carry the rollout's own field names (`cached_input_tokens`,
// `cache_write_input_tokens`, `reasoning_output_tokens`) under `fields: "codex"`,
// so the copied integers stay verbatim; aggregateCost maps them onto the four
// display columns (input / output / cache read / cache write).
//
// The hook keeps a cursor per session ({ mainOffset, files:{path: state},
// agentOrd:{id: n}, turn, last:{slug,key,slice,root}, codexTotal }) so each Stop
// reads only the new bytes. A sub-agent is booked once, however many transcript
// files hold it (WF-SYSTEM-REVIEW-2026-10-21 A1): the offsets are kept for each
// file, and each agent keeps the count of its messages already booked, so a
// copy of an agent's transcript in a second folder books nothing again. A row is written only when the turn has usage AND a slug is known
// (written this turn, or inherited from the last attributed turn). A missing row
// shows in `/wf status` as a turn gap; a wrong number never would, so every
// parser prefers no row to a guessed row.

import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync,
  renameSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const COST_FILE = 'cost.jsonl';
export const CLAUDE_USAGE_FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
export const CODEX_USAGE_FIELDS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);      // Claude Code
export const PI_WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'multiedit', 'notebook_edit']); // pi
export const PI_SUBAGENT_USAGE_TYPE = 'sdlc:subagent-usage';

// Artifact number → /wf key. `01-<mode>` is always intake; intake also writes the shape
// (02), and ship also writes the PR package (08). `02b-` and `02c-` are design files.
const KEY_BY_NUMBER = {
  '01': 'intake', '02': 'intake', '03': 'slice', '04': 'plan', '05': 'implement',
  '06': 'verify', '07': 'review', '08': 'ship', '09': 'ship', '10': 'retro',
};
const DESIGN_LETTERS = new Set(['b', 'c']);
// Keys whose artifacts carry a `-<slice-slug>` suffix.
const SLICED_KEYS = new Set(['slice', 'plan', 'implement', 'verify', 'review']);

const int = (v) => (Number.isInteger(v) ? v : (Number.isFinite(Number(v)) && Number(v) === Math.trunc(Number(v)) ? Number(v) : 0));

/* ───────────────────────── incremental reading ───────────────────────── */

/**
 * Read the complete lines appended to `filePath` since byte `offset`. A trailing
 * partial line (a write in progress) is left for the next call. A file shorter
 * than the offset (rotated or truncated) is read from the start.
 * @returns {{ lines: string[], offset: number }}
 */
export function readNewLines(filePath, offset = 0) {
  if (!filePath || !existsSync(filePath)) return { lines: [], offset };
  const size = statSync(filePath).size;
  if (size < offset) offset = 0;
  if (size === offset) return { lines: [], offset };
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    const n = readSync(fd, buf, 0, buf.length, offset);
    const lastNl = buf.subarray(0, n).lastIndexOf(0x0a);
    if (lastNl === -1) return { lines: [], offset };
    const consumed = lastNl + 1;
    const lines = buf.subarray(0, consumed).toString('utf-8').split('\n').filter((l) => l.length && l !== '\r');
    return { lines: lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)), offset: offset + consumed };
  } finally {
    closeSync(fd);
  }
}

export function parseJsonLines(lines) {
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* a torn line is not a record */ }
  }
  return out;
}

/** Read only the first line of a file (host detection). */
export function readFirstLine(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString('utf-8');
    const nl = text.indexOf('\n');
    return nl === -1 ? text : text.slice(0, nl);
  } finally {
    closeSync(fd);
  }
}

/**
 * Which host wrote this transcript? pi session files open with
 * `{"type":"session","version":N,…}`; Codex rollouts open with a `session_meta`
 * record (and are named `rollout-*.jsonl`); everything else is Claude Code.
 * @returns {'claude'|'codex'|'pi'}
 */
export function detectTranscriptHost(filePath) {
  if (/^rollout-.*\.jsonl$/i.test(basename(filePath ?? ''))) return 'codex';
  let first = null;
  try { first = JSON.parse(readFirstLine(filePath) ?? ''); } catch { first = null; }
  if (first?.type === 'session' && first.version !== undefined) return 'pi';
  if (first?.type === 'session_meta') return 'codex';
  return 'claude';
}

/* ───────────────────────── per-host parsers (pure) ───────────────────────── */

function toolInputPaths(input) {
  const out = [];
  if (!input || typeof input !== 'object') return out;
  if (typeof input.file_path === 'string') out.push(input.file_path);
  if (typeof input.notebook_path === 'string') out.push(input.notebook_path);
  if (Array.isArray(input.edits)) for (const e of input.edits) if (typeof e?.file_path === 'string') out.push(e.file_path);
  return out;
}

function claudeUsage(u) {
  const out = {};
  for (const f of CLAUDE_USAGE_FIELDS) out[f] = int(u?.[f]);
  return out;
}

/**
 * The identity of one API response: the message id, then the request id. One
 * response spans several `apiBlockIndex` lines that repeat the same usage, and a
 * copied transcript can lack `requestId`, so the message id comes first.
 */
export function claudeMessageKey(e) {
  return e?.message?.id ?? e?.requestId ?? e?.uuid ?? `${e?.timestamp}`;
}

/**
 * Claude Code transcript entries → assistant usages (deduped by message, last
 * line wins) and the artifact writes the turn made.
 */
export function parseClaudeEntries(entries) {
  const byRequest = new Map();
  const writes = [];
  for (const e of entries) {
    if (e?.type !== 'assistant' || !e.message || typeof e.message !== 'object') continue;
    const u = e.message.usage;
    if (u && typeof u === 'object') {
      byRequest.set(claudeMessageKey(e), { model: e.message.model ?? null, usage: claudeUsage(u), ts: e.timestamp ?? null });
    }
    for (const c of Array.isArray(e.message.content) ? e.message.content : []) {
      if (c?.type === 'tool_use' && WRITE_TOOLS.has(c.name)) {
        for (const p of toolInputPaths(c.input)) writes.push({ path: p, ts: e.timestamp ?? null });
      }
    }
  }
  return { usages: [...byRequest.values()], writes };
}

/** `*** Add File: path` / `*** Update File: path` / `*** Delete File: path` lines of an apply_patch envelope. */
export function applyPatchPaths(patchText) {
  const out = [];
  const re = /^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/gm;
  let m;
  while ((m = re.exec(String(patchText ?? '')))) out.push(m[1]);
  return out;
}

function codexPatchText(payload) {
  if (payload.type === 'custom_tool_call') return String(payload.input ?? '');
  let args = payload.arguments;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return args; } }
  return String(args?.input ?? args?.patch ?? '');
}

/**
 * Codex rollout entries → the LATEST cumulative `total_token_usage` (the hook
 * subtracts the cursor's previous total to get this turn's exact spend), the
 * turn's model when a `turn_context` names one, and apply_patch writes.
 */
export function parseCodexEntries(entries) {
  let latestTotal = null;
  let model = null;
  const writes = [];
  for (const e of entries) {
    const p = e?.payload;
    if (!p || typeof p !== 'object') continue;
    if (e.type === 'turn_context' && typeof p.model === 'string') model = p.model;
    if (e.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
      const t = p.info.total_token_usage;
      latestTotal = {};
      for (const f of CODEX_USAGE_FIELDS) latestTotal[f] = int(t[f]);
    }
    if (e.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call') && p.name === 'apply_patch') {
      for (const path of applyPatchPaths(codexPatchText(p))) writes.push({ path, ts: e.timestamp ?? null });
    }
  }
  return { latestTotal, model, writes };
}

/** Exact per-turn Codex usage = latest cumulative total − the total at the previous Stop. */
export function codexDelta(latestTotal, previousTotal) {
  if (!latestTotal) return null;
  const out = {};
  let any = false;
  for (const f of CODEX_USAGE_FIELDS) {
    const d = int(latestTotal[f]) - int(previousTotal?.[f]);
    out[f] = d < 0 ? int(latestTotal[f]) : d;   // a reset counter (new rollout) starts over
    if (out[f] > 0) any = true;
  }
  return any ? out : null;
}

function piUsage(u) {
  return {
    input_tokens: int(u?.input),
    output_tokens: int(u?.output),
    cache_read_input_tokens: int(u?.cacheRead),
    cache_creation_input_tokens: int(u?.cacheWrite),
  };
}

/**
 * pi session entries → assistant usages (`type: "message"`, `stopReason: "error"`
 * entries skipped: they carry all-zero usage and no content), sub-agent usage
 * from `type: "custom"` / `customType: "sdlc:subagent-usage"` entries (never
 * from tool-result usage, which pi-subagents `reportUsage` copies into the
 * parent), and the writes pi's `write`/`edit` tools made.
 */
export function parsePiEntries(entries) {
  const usages = [];
  const subagents = [];
  const writes = [];
  const seen = new Set();
  for (const e of entries) {
    if (e?.type === 'message' && e.message?.role === 'assistant') {
      if (e.message.stopReason === 'error') continue;
      const key = e.id ?? `${e.timestamp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usages.push({ model: e.message.model ?? null, provider: e.message.provider ?? null, usage: piUsage(e.message.usage), ts: e.timestamp ?? null });
      for (const c of Array.isArray(e.message.content) ? e.message.content : []) {
        if (c?.type === 'toolCall' && PI_WRITE_TOOLS.has(String(c.name ?? '').toLowerCase())) {
          const p = c.arguments?.path ?? c.arguments?.file_path;
          if (typeof p === 'string') writes.push({ path: p, ts: e.timestamp ?? null });
        }
      }
    } else if (e?.type === 'custom' && e.customType === PI_SUBAGENT_USAGE_TYPE && e.data?.usage) {
      subagents.push({
        agent_id: e.data.id ?? null,
        type: e.data.type ?? null,
        status: e.data.status ?? null,
        model: null,   // the pi-subagents event carries no model
        ...piUsage(e.data.usage),
      });
    }
  }
  return { usages, subagents, writes };
}

/* ───────────────────────── attribution ───────────────────────── */

/** `.ai/workflows/<slug>/<file>` → { slug, filename, root } or null. */
export function workflowPathParts(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/');
  const m = normalized.match(/^(.*?)(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { root: m[1] ? `${m[1]}/.ai/workflows` : '.ai/workflows', slug: m[2], filename: m[3].split('/').at(-1) };
}

/** `04-plan-cli-json.md` → { key: 'plan', slice: 'cli-json' }; `01-rca.md` → { key: 'intake', slice: null }; other names → null. */
export function keyFromArtifactName(filename) {
  const m = /^(\d{2})([a-z]?)-([a-z][a-z0-9]*)(?:-(.+))?\.md$/i.exec(filename ?? '');
  if (!m) return null;
  const key = m[1] === '02' && DESIGN_LETTERS.has(m[2].toLowerCase()) ? 'design' : KEY_BY_NUMBER[m[1]];
  if (!key) return null;
  return { key, slice: SLICED_KEYS.has(key) && m[4] ? m[4] : null };
}

/**
 * Fold this turn's writes into the session's last attribution. The last write
 * under `.ai/workflows/<slug>/` wins; a non-artifact file in a slug dir (the
 * index, po-answers) names the slug and keeps the key when the slug is the
 * same; a turn with no artifact write inherits `prev` unchanged.
 */
export function attributeWrites(writes, prev = null) {
  let last = prev ? { ...prev } : null;
  for (const w of writes) {
    const parts = workflowPathParts(w.path);
    if (!parts) continue;
    const k = keyFromArtifactName(parts.filename);
    if (k) last = { slug: parts.slug, key: k.key, slice: k.slice, root: parts.root };
    else last = { slug: parts.slug, key: last?.slug === parts.slug ? last.key : null, slice: last?.slug === parts.slug ? last.slice : null, root: parts.root };
  }
  return last;
}

/* ───────────────────────── summing ───────────────────────── */

function sumInto(acc, usage, fields) {
  for (const f of fields) acc[f] = int(acc[f]) + int(usage?.[f]);
  return acc;
}

/** Per-model sums of a turn's main usages → the row's `main` (null when nothing). */
export function sumMain(usages, fields = CLAUDE_USAGE_FIELDS) {
  if (!usages?.length) return null;
  const byModel = new Map();
  for (const u of usages) {
    const m = u.model ?? '(unknown)';
    if (!byModel.has(m)) byModel.set(m, { model: u.model ?? null, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    sumInto(byModel.get(m), u.usage, fields);
  }
  const models = [...byModel.values()];
  if (models.length === 1) return models[0];
  // Several models in one turn: `main` sums them; `models` keeps each exact.
  const total = { model: models.map((m) => m.model ?? '(unknown)').join('+'), ...Object.fromEntries(fields.map((f) => [f, 0])) };
  for (const m of models) sumInto(total, m, fields);
  return { ...total, models };
}

/**
 * Per-(agent, model) sums of sub-agent usages. A usage that carries the agent's
 * `label` (a Workflow agent) gives the entry `label`, `stage` and `slice`; a
 * usage with `ts` gives `start` and `end`, the first and last response booked.
 */
export function sumSubagents(list, fields = CLAUDE_USAGE_FIELDS) {
  const byKey = new Map();
  for (const s of list ?? []) {
    const k = `${s.agent_id ?? ''}|${s.model ?? ''}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        agent_id: s.agent_id ?? null, model: s.model ?? null,
        ...(s.label ? { label: s.label, ...stageOfLabel(s.label) } : {}),
        ...Object.fromEntries(fields.map((f) => [f, 0])),
      });
    }
    const acc = byKey.get(k);
    sumInto(acc, s, fields);
    if (s.ts) {
      if (!acc.start || s.ts < acc.start) acc.start = s.ts;
      if (!acc.end || s.ts > acc.end) acc.end = s.ts;
    }
  }
  return [...byKey.values()];
}

/**
 * The stage and the slice of a driver label: `implement:s1@alpha` gives
 * `{ stage: 'implement', slice: 's1' }`; `waiter#3` gives `{ stage: 'waiter', slice: null }`.
 */
export function stageOfLabel(label) {
  const base = String(label ?? '').replace(/@[^@]*$/, '').replace(/#\d+$/, '');
  const parts = base.split(':').filter(Boolean);
  return { stage: parts[0] ?? null, slice: parts.length > 1 ? parts[parts.length - 1] : null };
}

/* ───────────────────────── collect one turn ───────────────────────── */

/**
 * Read everything appended since the cursor and build the turn's usage +
 * attribution. Mutates `cursor` (offsets, codexTotal, last). Pure with respect
 * to the ledger: the caller decides whether to write a row.
 *
 * @param {object} o
 * @param {string} o.transcriptPath   main transcript (Claude / pi) or Codex rollout
 * @param {string} [o.subagentsDir]   Claude: `<dirname(transcript)>/<session_id>/subagents`
 * @param {object} o.cursor           mutable cursor (see newCursor)
 * @returns {{ host:string, main:(object|null), subagents:object[], attributed:(object|null), hadUsage:boolean, fields:string[], groups:object[] }}
 */
export function collectTurn({ transcriptPath, subagentsDir = null, cursor }) {
  const host = detectTranscriptHost(transcriptPath);
  const read = readNewLines(transcriptPath, cursor.mainOffset ?? 0);
  const entries = parseJsonLines(read.lines);
  let main = null;
  let subagents = [];
  let writes = [];
  let agents = [];
  let fields = CLAUDE_USAGE_FIELDS;

  if (host === 'codex') {
    const r = parseCodexEntries(entries);
    writes = r.writes;
    fields = CODEX_USAGE_FIELDS;
    if (r.latestTotal) {
      const delta = codexDelta(r.latestTotal, cursor.codexTotal);
      cursor.codexTotal = r.latestTotal;
      if (delta) main = { model: r.model ?? cursor.codexModel ?? null, fields: 'codex', ...delta };
    }
    if (r.model) cursor.codexModel = r.model;
  } else if (host === 'pi') {
    const r = parsePiEntries(entries);
    writes = r.writes;
    main = sumMain(r.usages);
    subagents = sumSubagents(r.subagents);
  } else {
    const r = parseClaudeEntries(entries);
    writes = r.writes;
    main = sumMain(r.usages);
    agents = subagentsDir ? readClaudeAgents(subagentsDir, cursor) : [];
    subagents = sumSubagents(agents.flatMap((a) => a.usages));
  }
  cursor.mainOffset = read.offset;

  const attributed = attributeWrites(writes, cursor.last ?? null);
  if (attributed) cursor.last = attributed;
  const hadUsage = Boolean(main) || subagents.length > 0;
  const turnAttr = cursor.last ?? null;
  return { host, main, subagents, attributed: turnAttr, hadUsage, fields, groups: groupBySlug(host === 'claude' ? agents : null, { main, subagents, attributed: turnAttr }) };
}

/** Every sub-agent transcript of a Claude session: `subagents/agent-*.jsonl`, and one level down for each Workflow run (`subagents/workflows/<run>/agent-*.jsonl`). */
export function listClaudeAgentFiles(subagentsDir) {
  const out = [];
  const agentsIn = (dir, workflow) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names.filter((n) => /^agent-.+\.jsonl$/.test(n)).sort()) {
      out.push({ id: name.replace(/^agent-/, '').replace(/\.jsonl$/, ''), file: join(dir, name), workflow });
    }
  };
  if (!subagentsDir || !existsSync(subagentsDir)) return out;
  agentsIn(subagentsDir, null);
  const wfRoot = join(subagentsDir, 'workflows');
  let runs = [];
  try { runs = readdirSync(wfRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { runs = []; }
  for (const run of runs) agentsIn(join(wfRoot, run), run);
  return out;
}

/**
 * The label of a Workflow sub-agent: the `description` of `agent-<id>.meta.json`
 * beside its transcript, or null.
 */
export function agentLabelOf(file) {
  try {
    const meta = JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return typeof meta?.description === 'string' ? meta.description : null;
  } catch {
    return null;
  }
}

/** The `<slug>` of a driver label `<stage>:<slice>@<slug>`, or null. */
export function labelSlugOf(label) {
  const m = /@([a-z0-9][a-z0-9._-]*)$/i.exec(String(label ?? ''));
  return m ? m[1] : null;
}

/**
 * Read the new lines of every sub-agent and give each one its own slug: the last
 * `.ai/workflows/<slug>/` it wrote (kept in the cursor across Stops). An agent
 * that never wrote takes the `@<slug>` of its label; any other silent agent takes the
 * slug of its Workflow run, and outside a run it stays with the turn.
 */
function readClaudeAgents(subagentsDir, cursor) {
  cursor.agentLast ??= {};
  cursor.workflowLast ??= {};
  cursor.slugRoot ??= {};
  cursor.agentLabel ??= {};
  const files = listClaudeAgentFiles(subagentsDir);
  migrateAgentOffsets(cursor, files);
  cursor.files ??= {};
  cursor.agentOrd ??= {};
  const read = [];
  for (const f of files) {
    const rel = agentFileKey(f);
    const st = (cursor.files[rel] ??= { off: 0, ord: 0, last: null, used: null, mine: false });
    const rr = readNewLines(f.file, st.off);
    st.off = rr.offset;
    const entries = parseJsonLines(rr.lines);
    const pr = parseClaudeEntries(entries);
    pr.usages = bookAgentLines(entries, st, cursor.agentOrd, f.id);
    const own = attributeWrites(pr.writes, cursor.agentLast[f.id] ?? null);
    if (own) {
      cursor.agentLast[f.id] = own;
      cursor.slugRoot[own.slug] = own.root;
      if (f.workflow && pr.writes.length) cursor.workflowLast[f.workflow] = own;
    }
    if (f.workflow && !(f.id in cursor.agentLabel)) cursor.agentLabel[f.id] = agentLabelOf(f.file);
    const label = cursor.agentLabel[f.id] ?? null;
    read.push({ ...f, usages: pr.usages.map((u) => ({ agent_id: f.id, model: u.model, ...u.usage, ...(u.ts ? { ts: u.ts } : {}), ...(label ? { label } : {}) })) });
  }
  // Second pass: a silent agent read before its run's writer still gets the run's slug.
  const silent = (a) => {
    if (!a.workflow) return null;
    const runLast = cursor.workflowLast[a.workflow] ?? null;
    const slug = labelSlugOf(cursor.agentLabel[a.id]);
    if (slug) {
      const root = cursor.slugRoot[slug] ?? runLast?.root ?? null;
      return root ? { slug, key: null, slice: null, root } : runLast;
    }
    return runLast;
  };
  return read.filter((a) => a.usages.length).map((a) => ({
    ...a,
    attributed: cursor.agentLast[a.id] ?? silent(a),
  }));
}

/** The cursor key of one agent transcript: its Workflow run (if any) and its file name. */
function agentFileKey(f) {
  return `${f.workflow ?? ''}/${f.id}`;
}

/**
 * A1: a cursor of the old form keeps one offset for each agent id, and two
 * files of one id (a Workflow transcript and its copy in `subagents/`) then
 * reset each other's offset on every Stop. Move it to the new form once: each
 * file that the old cursor knew counts as booked up to its present size, so the
 * migration books nothing again. A file of an agent that the old cursor did not
 * know is read from its start, as before.
 */
function migrateAgentOffsets(cursor, files) {
  if (!cursor.agents || cursor.files) return;
  cursor.files = {};
  for (const f of files) {
    if (!(f.id in cursor.agents)) continue;
    let size = 0;
    try { size = statSync(f.file).size; } catch { continue; }
    cursor.files[agentFileKey(f)] = { off: size, ord: null, last: null, used: null, mine: false };
  }
  delete cursor.agents;
}

/**
 * Book the new response lines of one agent file. A response counts once for the
 * agent: its message key starts a new ordinal in this file, and only an ordinal
 * above the agent's `agentOrd` is booked (a copy of the transcript in another
 * folder repeats the same responses in the same order). A later line of the same
 * response books only its growth over the earlier line (the last line wins). A
 * file migrated from the old cursor (`ord: null`) books each new response.
 */
function bookAgentLines(entries, st, agentOrd, id) {
  const out = [];
  const fields = CLAUDE_USAGE_FIELDS;
  for (const e of entries) {
    if (e?.type !== 'assistant' || !e.message?.usage || typeof e.message.usage !== 'object') continue;
    const usage = claudeUsage(e.message.usage);
    const model = e.message.model ?? null;
    const ts = e.timestamp ?? null;
    const key = claudeMessageKey(e);
    if (key === st.last) {
      if (!st.mine) continue;
      const grow = Object.fromEntries(fields.map((f) => [f, Math.max(0, usage[f] - int(st.used?.[f]))]));
      st.used = usage;
      if (fields.some((f) => grow[f] > 0)) out.push({ model, usage: grow, ts });
      continue;
    }
    st.last = key;
    st.used = usage;
    if (st.ord === null) { st.mine = true; out.push({ model, usage, ts }); continue; }
    st.ord += 1;
    st.mine = st.ord > (agentOrd[id] ?? 0);
    if (!st.mine) continue;
    agentOrd[id] = st.ord;
    out.push({ model, usage, ts });
  }
  return out;
}

/**
 * The turn's rows: the turn's own group first (main usage + the sub-agents of
 * the turn's slug or of no slug), then one group per other slug a sub-agent
 * worked in (main: null). Hosts other than Claude Code have one group.
 */
function groupBySlug(agents, turn) {
  const first = { attributed: turn.attributed, main: turn.main, subagents: turn.subagents };
  if (!agents) return [first];
  const same = (a, b) => a && b && a.slug === b.slug && a.root === b.root;
  const other = new Map();
  const mine = [];
  for (const a of agents) {
    if (!a.attributed || same(a.attributed, turn.attributed)) { mine.push(...a.usages); continue; }
    const k = `${a.attributed.root}|${a.attributed.slug}`;
    if (!other.has(k)) other.set(k, { attributed: a.attributed, usages: [] });
    other.get(k).usages.push(...a.usages);
  }
  first.subagents = sumSubagents(mine);
  return [first, ...[...other.values()].map((g) => ({ attributed: g.attributed, main: null, subagents: sumSubagents(g.usages) }))];
}

/* ───────────────────────── cursor + ledger files ───────────────────────── */

export function newCursor() {
  return { mainOffset: 0, files: {}, agentOrd: {}, agentLast: {}, workflowLast: {}, turn: 0, last: null, codexTotal: null, codexModel: null };
}

export function cursorPath(cursorDir, sessionId) {
  return join(cursorDir, `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

export function readCursor(cursorDir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath(cursorDir, sessionId), 'utf-8'));
    const cursor = { ...newCursor(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    // A cursor of the old form (`agents`, no `files`) migrates on its next read (A1).
    if (parsed?.agents && !parsed.files) { delete cursor.files; delete cursor.agentOrd; }
    return cursor;
  } catch {
    return newCursor();
  }
}

function writeAtomic(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  renameSync(tmp, filePath);
}

export function writeCursor(cursorDir, sessionId, cursor) {
  writeAtomic(cursorPath(cursorDir, sessionId), `${JSON.stringify(cursor)}\n`);
}

/** True when the file is empty, absent, or ends with a newline (one-byte read). */
function endsWithNewline(file) {
  try {
    const size = statSync(file).size;
    if (size === 0) return true;
    const fd = openSync(file, 'r');
    try {
      const b = Buffer.alloc(1);
      readSync(fd, b, 0, 1, size - 1);
      return b[0] === 0x0a;
    } finally { closeSync(fd); }
  } catch { return true; }
}

/**
 * Append one row to `<slugDir>/cost.jsonl` as one O_APPEND write. Two sessions
 * on one slug each add their own line; a read-modify-write-rename would let
 * the later writer drop the earlier row. A line torn by a crash mid-write is
 * closed with a newline first and skipped by `readCostRows`. Returns the
 * ledger path.
 */
export function appendCostRow(slugDir, row) {
  const file = join(slugDir, COST_FILE);
  mkdirSync(slugDir, { recursive: true });
  appendFileSync(file, `${endsWithNewline(file) ? '' : '\n'}${JSON.stringify(row)}\n`, 'utf-8');
  return file;
}

/** Every well-formed row of a slug's ledger; a torn or foreign line is skipped. */
export function readCostRows(slugDir) {
  const file = join(slugDir ?? '', COST_FILE);
  if (!slugDir || !existsSync(file)) return [];
  return parseJsonLines(readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean))
    .filter((r) => r && typeof r === 'object' && typeof r.slug === 'string');
}

/** Map one usage object (Claude-shaped or Codex-shaped) onto the four display columns. */
export function usageColumns(u) {
  if (!u || typeof u !== 'object') return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (u.fields === 'codex' || 'cached_input_tokens' in u) {
    return { input: int(u.input_tokens), output: int(u.output_tokens), cacheRead: int(u.cached_input_tokens), cacheWrite: int(u.cache_write_input_tokens) };
  }
  return { input: int(u.input_tokens), output: int(u.output_tokens), cacheRead: int(u.cache_read_input_tokens), cacheWrite: int(u.cache_creation_input_tokens) };
}

function emptyAgg() {
  return { turns: 0, subagents: 0, external: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, externalInput: 0, externalOutput: 0 };
}

function addColumns(acc, cols) {
  acc.input += cols.input; acc.output += cols.output; acc.cacheRead += cols.cacheRead; acc.cacheWrite += cols.cacheWrite;
}

/**
 * Aggregate ledger rows per key. `main` and `subagents` land in the token
 * columns; `external` (consult providers) is counted apart so a fan-out's
 * spend is visible without inflating the host's own total.
 * @returns {{ byKey: Record<string, object>, total: object, rows: number }}
 */
export function aggregateCost(rows) {
  const byKey = {};
  const total = emptyAgg();
  for (const r of rows ?? []) {
    const key = r.key ?? '(unattributed)';
    const agg = (byKey[key] ??= emptyAgg());
    for (const a of [agg, total]) {
      if (r.turn != null) a.turns += 1;
      if (r.main) addColumns(a, usageColumns(r.main));
      for (const s of Array.isArray(r.subagents) ? r.subagents : []) { a.subagents += 1; addColumns(a, usageColumns(s)); }
      for (const x of Array.isArray(r.external) ? r.external : []) {
        const c = usageColumns(x);
        a.external += 1; a.externalInput += c.input + c.cacheRead + c.cacheWrite; a.externalOutput += c.output;
      }
    }
  }
  return { byKey, total, rows: (rows ?? []).length };
}

/* ───────────────────────── rebuild an inflated ledger (A1, SQ4) ───────────────────────── */

const weight = (u) => CLAUDE_USAGE_FIELDS.reduce((n, f) => n + int(u?.[f]), 0);

/**
 * The exact total of each sub-agent of the given transcript files, read in full:
 * each response counts once across every file of its agent id (a copy repeats the
 * responses), and the last line of a response wins.
 * @param {Array<{ id: string, file: string }>} files
 * @returns {Map<string, Array<object>>} agent id → one usage object per model
 */
export function agentTotalsFromFiles(files) {
  const byAgent = new Map();
  for (const f of files) {
    let text = '';
    try { text = readFileSync(f.file, 'utf-8'); } catch { continue; }
    const seen = (byAgent.get(f.id) ?? byAgent.set(f.id, new Map()).get(f.id));
    for (const e of parseJsonLines(text.split(/\r?\n/).filter(Boolean))) {
      if (e?.type !== 'assistant' || !e.message?.usage) continue;
      seen.set(claudeMessageKey(e), { model: e.message.model ?? null, ...claudeUsage(e.message.usage) });
    }
  }
  const out = new Map();
  for (const [id, seen] of byAgent) {
    out.set(id, sumSubagents([...seen.values()].map((u) => ({ agent_id: id, ...u }))).map(({ agent_id, ...u }) => u));
  }
  return out;
}

/**
 * Rebuild the sub-agent entries of a project's ledgers. `files` is the rows of
 * each `cost.jsonl`, in file order. An agent whose entries add up to more than
 * its true total (`truth`, from its transcripts) is inflated: all of its entries
 * go, and one entry with the true total goes into the earliest row that held
 * it: the row where the live hook booked it first.
 * An agent with no transcript, or with entries that do not pass its total, stays
 * as it is. A row left with no usage goes. Pure.
 * @param {Array<{ path: string, rows: object[] }>} files
 * @param {Map<string, object[]>} truth
 * @returns {{ files: Array<{ path: string, rows: object[], changed: boolean }>, agents: Array<{ id: string, before: number, after: number }> }}
 */
export function rebuildLedgerRows(files, truth) {
  const sums = new Map();
  // The earliest row of an agent is where the live hook first booked it: the rebuilt total goes there.
  const firstOf = new Map();
  files.forEach((f, fi) => f.rows.forEach((r, ri) => {
    for (const s of Array.isArray(r.subagents) ? r.subagents : []) {
      if (!s?.agent_id) continue;
      sums.set(s.agent_id, (sums.get(s.agent_id) ?? 0) + weight(s));
      const first = firstOf.get(s.agent_id);
      if (!first || (r.ts ?? '') < first.ts) firstOf.set(s.agent_id, { fi, ri, ts: r.ts ?? '' });
    }
  }));
  const inflated = new Map();
  for (const [id, before] of sums) {
    const t = truth.get(id);
    if (!t) continue;
    const after = t.reduce((n, u) => n + weight(u), 0);
    if (before > after * 1.01) inflated.set(id, { before, after });
  }
  const out = files.map((f, fi) => {
    let changed = false;
    const rows = f.rows.map((r, ri) => {
      const subs = Array.isArray(r.subagents) ? r.subagents : [];
      const keep = subs.filter((s) => !inflated.has(s?.agent_id));
      const add = [];
      for (const [id] of inflated) {
        const at = firstOf.get(id);
        if (at.fi === fi && at.ri === ri) {
          const was = subs.find((s) => s.agent_id === id) ?? {};
          const tags = Object.fromEntries(['label', 'stage', 'slice', 'start', 'end'].filter((k) => was[k] != null).map((k) => [k, was[k]]));
          for (const u of truth.get(id)) add.push({ agent_id: id, ...tags, ...u, rebuilt: true });
        }
      }
      if (keep.length === subs.length && !add.length) return r;
      changed = true;
      return { ...r, subagents: [...keep, ...add] };
    }).filter((r) => r.main || (Array.isArray(r.subagents) && r.subagents.length) || (Array.isArray(r.external) && r.external.length));
    if (rows.length !== f.rows.length) changed = true;
    return { path: f.path, rows, changed };
  });
  return { files: out, agents: [...inflated].map(([id, v]) => ({ id, ...v })) };
}
