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
// The hook keeps a cursor per session ({ mainOffset, agents:{id: offset}, turn,
// last:{slug,key,slice,root}, codexTotal }) so each Stop reads only the new
// bytes. A row is written only when the turn has usage AND a slug is known
// (written this turn, or inherited from the last attributed turn). A missing row
// shows in `/wf status` as a turn gap; a wrong number never would, so every
// parser prefers no row to a guessed row.

import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync,
  renameSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const COST_FILE = 'cost.jsonl';
export const CLAUDE_USAGE_FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
export const CODEX_USAGE_FIELDS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);      // Claude Code
export const PI_WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'multiedit', 'notebook_edit']); // pi
export const PI_SUBAGENT_USAGE_TYPE = 'sdlc:subagent-usage';

// Artifact number → /wf key (plan §10.3.6). `01-<mode>` is always intake.
const KEY_BY_NUMBER = {
  '01': 'intake', '02': 'shape', '03': 'slice', '04': 'plan', '05': 'implement',
  '06': 'verify', '07': 'review', '08': 'handoff', '09': 'ship', '10': 'retro',
};
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
 * Claude Code transcript entries → assistant usages (deduped by requestId, last
 * line wins — one request spans several `apiBlockIndex` lines that repeat the
 * same usage) and the artifact writes the turn made.
 */
export function parseClaudeEntries(entries) {
  const byRequest = new Map();
  const writes = [];
  for (const e of entries) {
    if (e?.type !== 'assistant' || !e.message || typeof e.message !== 'object') continue;
    const u = e.message.usage;
    if (u && typeof u === 'object') {
      const key = e.requestId ?? e.uuid ?? `${e.timestamp}`;
      byRequest.set(key, { model: e.message.model ?? null, usage: claudeUsage(u), ts: e.timestamp ?? null });
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
  const m = /^(\d{2})[a-z]?-([a-z][a-z0-9]*)(?:-(.+))?\.md$/i.exec(filename ?? '');
  if (!m) return null;
  const key = KEY_BY_NUMBER[m[1]];
  if (!key) return null;
  return { key, slice: SLICED_KEYS.has(key) && m[3] ? m[3] : null };
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

/** Per-(agent, model) sums of sub-agent usages. */
export function sumSubagents(list, fields = CLAUDE_USAGE_FIELDS) {
  const byKey = new Map();
  for (const s of list ?? []) {
    const k = `${s.agent_id ?? ''}|${s.model ?? ''}`;
    if (!byKey.has(k)) byKey.set(k, { agent_id: s.agent_id ?? null, model: s.model ?? null, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    sumInto(byKey.get(k), s, fields);
  }
  return [...byKey.values()];
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
 * @returns {{ host:string, main:(object|null), subagents:object[], attributed:(object|null), hadUsage:boolean, fields:string[] }}
 */
export function collectTurn({ transcriptPath, subagentsDir = null, cursor }) {
  const host = detectTranscriptHost(transcriptPath);
  const read = readNewLines(transcriptPath, cursor.mainOffset ?? 0);
  const entries = parseJsonLines(read.lines);
  let main = null;
  let subagents = [];
  let writes = [];
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
    const collected = [];
    if (subagentsDir && existsSync(subagentsDir)) {
      cursor.agents ??= {};
      for (const name of readdirSync(subagentsDir).filter((n) => n.endsWith('.jsonl')).sort()) {
        const agentId = name.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const rr = readNewLines(join(subagentsDir, name), cursor.agents[agentId] ?? 0);
        cursor.agents[agentId] = rr.offset;
        const pr = parseClaudeEntries(parseJsonLines(rr.lines));
        for (const u of pr.usages) collected.push({ agent_id: agentId, model: u.model, ...u.usage });
      }
    }
    subagents = sumSubagents(collected);
  }
  cursor.mainOffset = read.offset;

  const attributed = attributeWrites(writes, cursor.last ?? null);
  if (attributed) cursor.last = attributed;
  const hadUsage = Boolean(main) || subagents.length > 0;
  return { host, main, subagents, attributed: cursor.last ?? null, hadUsage, fields };
}

/* ───────────────────────── cursor + ledger files ───────────────────────── */

export function newCursor() {
  return { mainOffset: 0, agents: {}, turn: 0, last: null, codexTotal: null, codexModel: null };
}

export function cursorPath(cursorDir, sessionId) {
  return join(cursorDir, `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

export function readCursor(cursorDir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath(cursorDir, sessionId), 'utf-8'));
    return { ...newCursor(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
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

/**
 * Append one row to `<slugDir>/cost.jsonl` atomically: the new content is
 * written to a temp file and renamed over the ledger, so two sessions on one
 * slug never leave a torn line. Returns the ledger path.
 */
export function appendCostRow(slugDir, row) {
  const file = join(slugDir, COST_FILE);
  mkdirSync(slugDir, { recursive: true });
  const prev = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  const sep = prev && !prev.endsWith('\n') ? '\n' : '';
  writeAtomic(file, `${prev}${sep}${JSON.stringify(row)}\n`);
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
