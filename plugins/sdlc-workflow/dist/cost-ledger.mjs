#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  loadConfig,
  projectRootFromInput,
  readStdinJson
} from "./chunk-P7Y6FJOM.mjs";
import "./chunk-DS4JUPRY.mjs";
import {
  logError
} from "./chunk-TIGAJNZN.mjs";
import {
  sdlcHomeDir
} from "./chunk-BSVWX5RF.mjs";
import "./chunk-ZGVOYTOL.mjs";

// hooks/cost-ledger.mjs
import { existsSync as existsSync2, readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, isAbsolute, join as join2, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
function claudeMessageKey(e) {
  return e?.message?.id ?? e?.requestId ?? e?.uuid ?? `${e?.timestamp}`;
}
function parseClaudeEntries(entries) {
  const byRequest = /* @__PURE__ */ new Map();
  const writes = [];
  for (const e of entries) {
    if (e?.type !== "assistant" || !e.message || typeof e.message !== "object") continue;
    const u = e.message.usage;
    if (u && typeof u === "object") {
      byRequest.set(claudeMessageKey(e), { model: e.message.model ?? null, usage: claudeUsage(u), ts: e.timestamp ?? null });
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
    if (!byKey.has(k)) {
      byKey.set(k, {
        agent_id: s.agent_id ?? null,
        model: s.model ?? null,
        ...s.label ? { label: s.label, ...stageOfLabel(s.label) } : {},
        ...Object.fromEntries(fields.map((f) => [f, 0]))
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
function stageOfLabel(label) {
  const base = String(label ?? "").replace(/@[^@]*$/, "").replace(/#\d+$/, "");
  const parts = base.split(":").filter(Boolean);
  return { stage: parts[0] ?? null, slice: parts.length > 1 ? parts[parts.length - 1] : null };
}
function collectTurn({ transcriptPath, subagentsDir = null, cursor }) {
  const host = detectTranscriptHost(transcriptPath);
  const read = readNewLines(transcriptPath, cursor.mainOffset ?? 0);
  const entries = parseJsonLines(read.lines);
  let main2 = null;
  let subagents = [];
  let writes = [];
  let agents = [];
  let fields = CLAUDE_USAGE_FIELDS;
  if (host === "codex") {
    const r = parseCodexEntries(entries);
    writes = r.writes;
    fields = CODEX_USAGE_FIELDS;
    if (r.latestTotal) {
      const delta = codexDelta(r.latestTotal, cursor.codexTotal);
      cursor.codexTotal = r.latestTotal;
      if (delta) main2 = { model: r.model ?? cursor.codexModel ?? null, fields: "codex", ...delta };
    }
    if (r.model) cursor.codexModel = r.model;
  } else if (host === "pi") {
    const r = parsePiEntries(entries);
    writes = r.writes;
    main2 = sumMain(r.usages);
    subagents = sumSubagents(r.subagents);
  } else {
    const r = parseClaudeEntries(entries);
    writes = r.writes;
    main2 = sumMain(r.usages);
    agents = subagentsDir ? readClaudeAgents(subagentsDir, cursor) : [];
    subagents = sumSubagents(agents.flatMap((a) => a.usages));
  }
  cursor.mainOffset = read.offset;
  const attributed = attributeWrites(writes, cursor.last ?? null);
  if (attributed) cursor.last = attributed;
  const hadUsage = Boolean(main2) || subagents.length > 0;
  const turnAttr = cursor.last ?? null;
  return { host, main: main2, subagents, attributed: turnAttr, hadUsage, fields, groups: groupBySlug(host === "claude" ? agents : null, { main: main2, subagents, attributed: turnAttr }) };
}
function listClaudeAgentFiles(subagentsDir) {
  const out = [];
  const agentsIn = (dir, workflow) => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.filter((n) => /^agent-.+\.jsonl$/.test(n)).sort()) {
      out.push({ id: name.replace(/^agent-/, "").replace(/\.jsonl$/, ""), file: join(dir, name), workflow });
    }
  };
  if (!subagentsDir || !existsSync(subagentsDir)) return out;
  agentsIn(subagentsDir, null);
  const wfRoot = join(subagentsDir, "workflows");
  let runs = [];
  try {
    runs = readdirSync(wfRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    runs = [];
  }
  for (const run of runs) agentsIn(join(wfRoot, run), run);
  return out;
}
function agentLabelOf(file) {
  try {
    const meta = JSON.parse(readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    return typeof meta?.description === "string" ? meta.description : null;
  } catch {
    return null;
  }
}
function labelSlugOf(label) {
  const m = /@([a-z0-9][a-z0-9._-]*)$/i.exec(String(label ?? ""));
  return m ? m[1] : null;
}
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
    const st = cursor.files[rel] ??= { off: 0, ord: 0, last: null, used: null, mine: false };
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
    read.push({ ...f, usages: pr.usages.map((u) => ({ agent_id: f.id, model: u.model, ...u.usage, ...u.ts ? { ts: u.ts } : {}, ...label ? { label } : {} })) });
  }
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
    attributed: cursor.agentLast[a.id] ?? silent(a)
  }));
}
function agentFileKey(f) {
  return `${f.workflow ?? ""}/${f.id}`;
}
function migrateAgentOffsets(cursor, files) {
  if (!cursor.agents || cursor.files) return;
  cursor.files = {};
  for (const f of files) {
    if (!(f.id in cursor.agents)) continue;
    let size = 0;
    try {
      size = statSync(f.file).size;
    } catch {
      continue;
    }
    cursor.files[agentFileKey(f)] = { off: size, ord: null, last: null, used: null, mine: false };
  }
  delete cursor.agents;
}
function bookAgentLines(entries, st, agentOrd, id) {
  const out = [];
  const fields = CLAUDE_USAGE_FIELDS;
  for (const e of entries) {
    if (e?.type !== "assistant" || !e.message?.usage || typeof e.message.usage !== "object") continue;
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
    if (st.ord === null) {
      st.mine = true;
      out.push({ model, usage, ts });
      continue;
    }
    st.ord += 1;
    st.mine = st.ord > (agentOrd[id] ?? 0);
    if (!st.mine) continue;
    agentOrd[id] = st.ord;
    out.push({ model, usage, ts });
  }
  return out;
}
function groupBySlug(agents, turn) {
  const first = { attributed: turn.attributed, main: turn.main, subagents: turn.subagents };
  if (!agents) return [first];
  const same = (a, b) => a && b && a.slug === b.slug && a.root === b.root;
  const other = /* @__PURE__ */ new Map();
  const mine = [];
  for (const a of agents) {
    if (!a.attributed || same(a.attributed, turn.attributed)) {
      mine.push(...a.usages);
      continue;
    }
    const k = `${a.attributed.root}|${a.attributed.slug}`;
    if (!other.has(k)) other.set(k, { attributed: a.attributed, usages: [] });
    other.get(k).usages.push(...a.usages);
  }
  first.subagents = sumSubagents(mine);
  return [first, ...[...other.values()].map((g) => ({ attributed: g.attributed, main: null, subagents: sumSubagents(g.usages) }))];
}
function newCursor() {
  return { mainOffset: 0, files: {}, agentOrd: {}, agentLast: {}, workflowLast: {}, turn: 0, last: null, codexTotal: null, codexModel: null };
}
function cursorPath(cursorDir, sessionId) {
  return join(cursorDir, `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
}
function readCursor(cursorDir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(cursorPath(cursorDir, sessionId), "utf-8"));
    const cursor = { ...newCursor(), ...parsed && typeof parsed === "object" ? parsed : {} };
    if (parsed?.agents && !parsed.files) {
      delete cursor.files;
      delete cursor.agentOrd;
    }
    return cursor;
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

// hooks/cost-ledger.mjs
function parseHookArgs(argv = process.argv.slice(2)) {
  const out = { pluginRoot: null, pluginData: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plugin-root" && argv[i + 1]) out.pluginRoot = argv[++i];
    else if (argv[i] === "--plugin-data" && argv[i + 1]) out.pluginData = argv[++i];
  }
  return out;
}
function findCodexRollout(sessionId, codexHome = process.env.CODEX_HOME || join2(homedir(), ".codex")) {
  const root = join2(codexHome, "sessions");
  if (!sessionId || !existsSync2(root)) return null;
  let best = null;
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync2(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      const p = join2(dir, d.name);
      if (d.isDirectory()) {
        if (depth < 3) walk(p, depth + 1);
        continue;
      }
      if (!d.name.startsWith("rollout-") || !d.name.endsWith(".jsonl") || !d.name.includes(sessionId)) continue;
      const m = statSync2(p).mtimeMs;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    }
  };
  walk(root, 0);
  return best?.path ?? null;
}
function hostName(transcriptHost, env) {
  if (transcriptHost === "pi" || transcriptHost === "codex") return transcriptHost;
  return env.SDLC_HOST === "codex" ? "codex" : "claude";
}
async function runCostLedger({ input, cursorDir, env = process.env, now = () => /* @__PURE__ */ new Date() }) {
  const sessionId = input?.session_id;
  if (!sessionId) return { wrote: false, reason: "no session_id" };
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks?.costLedger === false) return { wrote: false, reason: "disabled" };
  let transcript = typeof input.transcript_path === "string" && input.transcript_path ? input.transcript_path : null;
  if (!transcript) transcript = findCodexRollout(sessionId, env.CODEX_HOME || void 0);
  if (!transcript || !existsSync2(transcript)) return { wrote: false, reason: "no transcript" };
  const cursor = readCursor(cursorDir, sessionId);
  const turn = collectTurn({ transcriptPath: transcript, subagentsDir: join2(dirname2(transcript), sessionId, "subagents"), cursor });
  cursor.turn = (cursor.turn ?? 0) + 1;
  const mainRoot = resolve(projectRoot, ".ai", "workflows");
  const [own, ...others] = turn.groups ?? [{ attributed: turn.attributed, main: turn.main, subagents: turn.subagents }];
  const ownDir = (a) => {
    if (!a?.slug) return null;
    const root = a.root && isAbsolute(a.root) ? a.root : resolve(projectRoot, a.root ?? join2(".ai", "workflows"));
    return join2(root, a.slug);
  };
  const byDir = /* @__PURE__ */ new Map();
  const turnRow = { attributed: own.attributed, main: own.main, subagents: [...own.subagents] };
  if (ownDir(own.attributed)) byDir.set(ownDir(own.attributed), turnRow);
  for (const g of others) {
    const dir = join2(mainRoot, g.attributed.slug);
    if (!existsSync2(dir)) {
      turnRow.subagents.push(...g.subagents);
      continue;
    }
    if (!byDir.has(dir)) byDir.set(dir, { attributed: g.attributed, main: null, subagents: [] });
    byDir.get(dir).subagents.push(...g.subagents);
  }
  const ts = now().toISOString();
  const ledgers = [];
  for (const [dir, r] of byDir) {
    if (!r.main && !r.subagents.length) continue;
    ledgers.push(appendCostRow(dir, {
      ts,
      host: hostName(turn.host, env),
      session: sessionId,
      turn: cursor.turn,
      key: r.attributed.key ?? null,
      slug: r.attributed.slug,
      slice: r.attributed.slice ?? null,
      main: r.main,
      subagents: r.subagents,
      external: []
    }));
  }
  const wrote = ledgers.length > 0;
  const ledger = ledgers[0];
  writeCursor(cursorDir, sessionId, cursor);
  return { wrote, reason: wrote ? "row" : turn.hadUsage ? "no slug" : "no usage", ledger, ledgers };
}
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const args = parseHookArgs();
  const input = await readStdinJson();
  if (!input || typeof input !== "object") return;
  const pluginData = typeof input.sdlc_plugin_data === "string" && input.sdlc_plugin_data || args.pluginData;
  const cursorDir = pluginData ? join2(resolve(pluginData), "cost-cursor") : join2(sdlcHomeDir(), "cost-cursor");
  let projectRoot = process.cwd();
  try {
    projectRoot = projectRootFromInput(input);
    await runCostLedger({ input, cursorDir });
  } catch (err) {
    try {
      await logError("cost-ledger", err, { projectRoot, context: { session: input.session_id ?? null } });
    } catch {
    }
  }
}
var isMain = process.argv[1] && (import.meta.url === pathToFileURL(resolve(process.argv[1])).href || fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
  main().finally(() => process.exit(0));
}
export {
  findCodexRollout,
  parseHookArgs,
  runCostLedger
};
