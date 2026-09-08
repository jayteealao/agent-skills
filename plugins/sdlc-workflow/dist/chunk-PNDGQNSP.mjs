import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/cost-ledger.mjs
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
var COST_FILE = "cost.jsonl";
var CLAUDE_USAGE_FIELDS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
var CODEX_USAGE_FIELDS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens"];
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var PI_WRITE_TOOLS = /* @__PURE__ */ new Set(["write", "edit", "multi_edit", "multiedit", "notebook_edit"]);
var PI_SUBAGENT_USAGE_TYPE = "sdlc:subagent-usage";
var KEY_BY_NUMBER = {
  "01": "intake",
  "02": "shape",
  "03": "slice",
  "04": "plan",
  "05": "implement",
  "06": "verify",
  "07": "review",
  "08": "handoff",
  "09": "ship",
  "10": "retro"
};
var SLICED_KEYS = /* @__PURE__ */ new Set(["slice", "plan", "implement", "verify", "review"]);
var int = (v) => Number.isInteger(v) ? v : Number.isFinite(Number(v)) && Number(v) === Math.trunc(Number(v)) ? Number(v) : 0;
function readNewLines(filePath, offset = 0) {
  if (!filePath || !existsSync(filePath)) return { lines: [], offset };
  const size = statSync(filePath).size;
  if (size < offset) offset = 0;
  if (size === offset) return { lines: [], offset };
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(size - offset);
    const n = readSync(fd, buf, 0, buf.length, offset);
    const lastNl = buf.subarray(0, n).lastIndexOf(10);
    if (lastNl === -1) return { lines: [], offset };
    const consumed = lastNl + 1;
    const lines = buf.subarray(0, consumed).toString("utf-8").split("\n").filter((l) => l.length && l !== "\r");
    return { lines: lines.map((l) => l.endsWith("\r") ? l.slice(0, -1) : l), offset: offset + consumed };
  } finally {
    closeSync(fd);
  }
}
function parseJsonLines(lines) {
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function readFirstLine(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString("utf-8");
    const nl = text.indexOf("\n");
    return nl === -1 ? text : text.slice(0, nl);
  } finally {
    closeSync(fd);
  }
}
function detectTranscriptHost(filePath) {
  if (/^rollout-.*\.jsonl$/i.test(basename(filePath ?? ""))) return "codex";
  let first = null;
  try {
    first = JSON.parse(readFirstLine(filePath) ?? "");
  } catch {
    first = null;
  }
  if (first?.type === "session" && first.version !== void 0) return "pi";
  if (first?.type === "session_meta") return "codex";
  return "claude";
}
function toolInputPaths(input) {
  const out = [];
  if (!input || typeof input !== "object") return out;
  if (typeof input.file_path === "string") out.push(input.file_path);
  if (typeof input.notebook_path === "string") out.push(input.notebook_path);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) if (typeof e?.file_path === "string") out.push(e.file_path);
  }
  return out;
}
function claudeUsage(u) {
  const out = {};
  for (const f of CLAUDE_USAGE_FIELDS) out[f] = int(u?.[f]);
  return out;
}
function parseClaudeEntries(entries) {
  const byRequest = /* @__PURE__ */ new Map();
  const writes = [];
  for (const e of entries) {
    if (e?.type !== "assistant" || !e.message || typeof e.message !== "object") continue;
    const u = e.message.usage;
    if (u && typeof u === "object") {
      const key = e.requestId ?? e.uuid ?? `${e.timestamp}`;
      byRequest.set(key, { model: e.message.model ?? null, usage: claudeUsage(u), ts: e.timestamp ?? null });
    }
    for (const c of Array.isArray(e.message.content) ? e.message.content : []) {
      if (c?.type === "tool_use" && WRITE_TOOLS.has(c.name)) {
        for (const p of toolInputPaths(c.input)) writes.push({ path: p, ts: e.timestamp ?? null });
      }
    }
  }
  return { usages: [...byRequest.values()], writes };
}
function applyPatchPaths(patchText) {
  const out = [];
  const re = /^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/gm;
  let m;
  while (m = re.exec(String(patchText ?? ""))) out.push(m[1]);
  return out;
}
function codexPatchText(payload) {
  if (payload.type === "custom_tool_call") return String(payload.input ?? "");
  let args = payload.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return args;
    }
  }
  return String(args?.input ?? args?.patch ?? "");
}
function parseCodexEntries(entries) {
  let latestTotal = null;
  let model = null;
  const writes = [];
  for (const e of entries) {
    const p = e?.payload;
    if (!p || typeof p !== "object") continue;
    if (e.type === "turn_context" && typeof p.model === "string") model = p.model;
    if (e.type === "event_msg" && p.type === "token_count" && p.info?.total_token_usage) {
      const t = p.info.total_token_usage;
      latestTotal = {};
      for (const f of CODEX_USAGE_FIELDS) latestTotal[f] = int(t[f]);
    }
    if (e.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call") && p.name === "apply_patch") {
      for (const path of applyPatchPaths(codexPatchText(p))) writes.push({ path, ts: e.timestamp ?? null });
    }
  }
  return { latestTotal, model, writes };
}
function codexDelta(latestTotal, previousTotal) {
  if (!latestTotal) return null;
  const out = {};
  let any = false;
  for (const f of CODEX_USAGE_FIELDS) {
    const d = int(latestTotal[f]) - int(previousTotal?.[f]);
    out[f] = d < 0 ? int(latestTotal[f]) : d;
    if (out[f] > 0) any = true;
  }
  return any ? out : null;
}
function piUsage(u) {
  return {
    input_tokens: int(u?.input),
    output_tokens: int(u?.output),
    cache_read_input_tokens: int(u?.cacheRead),
    cache_creation_input_tokens: int(u?.cacheWrite)
  };
}
function parsePiEntries(entries) {
  const usages = [];
  const subagents = [];
  const writes = [];
  const seen = /* @__PURE__ */ new Set();
  for (const e of entries) {
    if (e?.type === "message" && e.message?.role === "assistant") {
      if (e.message.stopReason === "error") continue;
      const key = e.id ?? `${e.timestamp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usages.push({ model: e.message.model ?? null, provider: e.message.provider ?? null, usage: piUsage(e.message.usage), ts: e.timestamp ?? null });
      for (const c of Array.isArray(e.message.content) ? e.message.content : []) {
        if (c?.type === "toolCall" && PI_WRITE_TOOLS.has(String(c.name ?? "").toLowerCase())) {
          const p = c.arguments?.path ?? c.arguments?.file_path;
          if (typeof p === "string") writes.push({ path: p, ts: e.timestamp ?? null });
        }
      }
    } else if (e?.type === "custom" && e.customType === PI_SUBAGENT_USAGE_TYPE && e.data?.usage) {
      subagents.push({
        agent_id: e.data.id ?? null,
        type: e.data.type ?? null,
        status: e.data.status ?? null,
        model: null,
        // the pi-subagents event carries no model
        ...piUsage(e.data.usage)
      });
    }
  }
  return { usages, subagents, writes };
}
function workflowPathParts(filePath) {
  const normalized = String(filePath ?? "").replace(/\\/g, "/");
  const m = normalized.match(/^(.*?)(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { root: m[1] ? `${m[1]}/.ai/workflows` : ".ai/workflows", slug: m[2], filename: m[3].split("/").at(-1) };
}
function keyFromArtifactName(filename) {
  const m = /^(\d{2})[a-z]?-([a-z][a-z0-9]*)(?:-(.+))?\.md$/i.exec(filename ?? "");
  if (!m) return null;
  const key = KEY_BY_NUMBER[m[1]];
  if (!key) return null;
  return { key, slice: SLICED_KEYS.has(key) && m[3] ? m[3] : null };
}
function attributeWrites(writes, prev = null) {
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
function sumInto(acc, usage, fields) {
  for (const f of fields) acc[f] = int(acc[f]) + int(usage?.[f]);
  return acc;
}
function sumMain(usages, fields = CLAUDE_USAGE_FIELDS) {
  if (!usages?.length) return null;
  const byModel = /* @__PURE__ */ new Map();
  for (const u of usages) {
    const m = u.model ?? "(unknown)";
    if (!byModel.has(m)) byModel.set(m, { model: u.model ?? null, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    sumInto(byModel.get(m), u.usage, fields);
  }
  const models = [...byModel.values()];
  if (models.length === 1) return models[0];
  const total = { model: models.map((m) => m.model ?? "(unknown)").join("+"), ...Object.fromEntries(fields.map((f) => [f, 0])) };
  for (const m of models) sumInto(total, m, fields);
  return { ...total, models };
}
function sumSubagents(list, fields = CLAUDE_USAGE_FIELDS) {
  const byKey = /* @__PURE__ */ new Map();
  for (const s of list ?? []) {
    const k = `${s.agent_id ?? ""}|${s.model ?? ""}`;
    if (!byKey.has(k)) byKey.set(k, { agent_id: s.agent_id ?? null, model: s.model ?? null, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    sumInto(byKey.get(k), s, fields);
  }
  return [...byKey.values()];
}
function collectTurn({ transcriptPath, subagentsDir = null, cursor }) {
  const host = detectTranscriptHost(transcriptPath);
  const read = readNewLines(transcriptPath, cursor.mainOffset ?? 0);
  const entries = parseJsonLines(read.lines);
  let main = null;
  let subagents = [];
  let writes = [];
  let fields = CLAUDE_USAGE_FIELDS;
  if (host === "codex") {
    const r = parseCodexEntries(entries);
    writes = r.writes;
    fields = CODEX_USAGE_FIELDS;
    if (r.latestTotal) {
      const delta = codexDelta(r.latestTotal, cursor.codexTotal);
      cursor.codexTotal = r.latestTotal;
      if (delta) main = { model: r.model ?? cursor.codexModel ?? null, fields: "codex", ...delta };
    }
    if (r.model) cursor.codexModel = r.model;
  } else if (host === "pi") {
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
      for (const name of readdirSync(subagentsDir).filter((n) => n.endsWith(".jsonl")).sort()) {
        const agentId = name.replace(/^agent-/, "").replace(/\.jsonl$/, "");
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
function newCursor() {
  return { mainOffset: 0, agents: {}, turn: 0, last: null, codexTotal: null, codexModel: null };
}
function cursorPath(cursorDir, sessionId) {
  return join(cursorDir, `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
}
function readCursor(cursorDir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath(cursorDir, sessionId), "utf-8"));
    return { ...newCursor(), ...parsed && typeof parsed === "object" ? parsed : {} };
  } catch {
    return newCursor();
  }
}
function writeAtomic(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, "utf-8");
  renameSync(tmp, filePath);
}
function writeCursor(cursorDir, sessionId, cursor) {
  writeAtomic(cursorPath(cursorDir, sessionId), `${JSON.stringify(cursor)}
`);
}
function endsWithNewline(file) {
  try {
    const size = statSync(file).size;
    if (size === 0) return true;
    const fd = openSync(file, "r");
    try {
      const b = Buffer.alloc(1);
      readSync(fd, b, 0, 1, size - 1);
      return b[0] === 10;
    } finally {
      closeSync(fd);
    }
  } catch {
    return true;
  }
}
function appendCostRow(slugDir, row) {
  const file = join(slugDir, COST_FILE);
  mkdirSync(slugDir, { recursive: true });
  appendFileSync(file, `${endsWithNewline(file) ? "" : "\n"}${JSON.stringify(row)}
`, "utf-8");
  return file;
}
function readCostRows(slugDir) {
  const file = join(slugDir ?? "", COST_FILE);
  if (!slugDir || !existsSync(file)) return [];
  return parseJsonLines(readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean)).filter((r) => r && typeof r === "object" && typeof r.slug === "string");
}
function usageColumns(u) {
  if (!u || typeof u !== "object") return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (u.fields === "codex" || "cached_input_tokens" in u) {
    return { input: int(u.input_tokens), output: int(u.output_tokens), cacheRead: int(u.cached_input_tokens), cacheWrite: int(u.cache_write_input_tokens) };
  }
  return { input: int(u.input_tokens), output: int(u.output_tokens), cacheRead: int(u.cache_read_input_tokens), cacheWrite: int(u.cache_creation_input_tokens) };
}
function emptyAgg() {
  return { turns: 0, subagents: 0, external: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, externalInput: 0, externalOutput: 0 };
}
function addColumns(acc, cols) {
  acc.input += cols.input;
  acc.output += cols.output;
  acc.cacheRead += cols.cacheRead;
  acc.cacheWrite += cols.cacheWrite;
}
function aggregateCost(rows) {
  const byKey = {};
  const total = emptyAgg();
  for (const r of rows ?? []) {
    const key = r.key ?? "(unattributed)";
    const agg = byKey[key] ??= emptyAgg();
    for (const a of [agg, total]) {
      if (r.turn != null) a.turns += 1;
      if (r.main) addColumns(a, usageColumns(r.main));
      for (const s of Array.isArray(r.subagents) ? r.subagents : []) {
        a.subagents += 1;
        addColumns(a, usageColumns(s));
      }
      for (const x of Array.isArray(r.external) ? r.external : []) {
        const c = usageColumns(x);
        a.external += 1;
        a.externalInput += c.input + c.cacheRead + c.cacheWrite;
        a.externalOutput += c.output;
      }
    }
  }
  return { byKey, total, rows: (rows ?? []).length };
}

export {
  collectTurn,
  readCursor,
  writeCursor,
  appendCostRow,
  readCostRows,
  aggregateCost
};
