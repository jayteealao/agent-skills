#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  aggregateCost,
  readCostRows
} from "./chunk-2IS7NC7D.mjs";
import {
  TERMINAL_WORKFLOW_STATUSES,
  scanWorkflowIndexes
} from "./chunk-7EPCP4B5.mjs";
import {
  safeParseFrontmatter
} from "./chunk-R35WUHOB.mjs";
import "./chunk-UR5JS5PH.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/wf.mjs
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync as existsSync3, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { dirname as dirname2, join as join3, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// lib/dispatch.mjs
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
var UNSAFE = "@";
var SAFE_TOKEN = /^[A-Za-z0-9#._/-]+$/;
var FREE_SLOTS = /* @__PURE__ */ new Set(["dimension", "aggregate", "env", "path", "run-id"]);
function parseForm(form) {
  let i = 0;
  const s = form.trim();
  function seq(close) {
    const items = [];
    for (; ; ) {
      while (s[i] === " ") i += 1;
      if (i >= s.length) {
        if (close) throw new Error(`form "${form}": no closing ]`);
        return items;
      }
      if (s[i] === "]") {
        if (!close) throw new Error(`form "${form}": stray ]`);
        i += 1;
        return items;
      }
      if (s[i] === "[") {
        i += 1;
        items.push({ group: seq(true) });
        continue;
      }
      let word = "";
      while (i < s.length && !" []".includes(s[i])) word += s[i++];
      items.push({ alts: word.split("|").map(atomOf) });
    }
  }
  return seq(false);
}
function atomOf(word) {
  const m = /^<([a-z-]+)>$/.exec(word);
  if (m) return { slot: m[1] };
  if (word === "text") return { text: true };
  if (word === "pr#N") return { pr: true };
  return { word };
}
var atomName = (a) => a.slot ? `<${a.slot}>` : a.text ? "text" : a.pr ? "pr#N" : a.word;
var itemName = (it) => it.alts ? it.alts.map(atomName).join("|") : `[${it.group.map(itemName).join(" ")}]`;
function fit(items, tokens, i, state, check) {
  if (!items.length) {
    return i === tokens.length ? [{ ok: true, state }] : [{ ok: false, at: i, reason: `${tokens[i]} does not fit the form` }];
  }
  const [head, ...rest] = items;
  if (head.group) {
    return [...fit([...head.group, ...rest], tokens, i, state, check), ...fit(rest, tokens, i, state, check)];
  }
  if (i >= tokens.length) return [{ ok: false, at: i, reason: `missing ${itemName(head)}` }];
  const out2 = [];
  const t = tokens[i];
  for (const a of head.alts) {
    if (a.text) {
      for (let j = tokens.length; j > i; j -= 1) out2.push(...fit(rest, tokens, j, state, check));
      continue;
    }
    if (t === UNSAFE) {
      out2.push({ ok: false, at: i, reason: `a token does not fit ${itemName(head)}` });
      continue;
    }
    if (a.word) {
      out2.push(...t === a.word ? fit(rest, tokens, i + 1, state, check) : [{ ok: false, at: i, reason: `${t} does not fit ${itemName(head)}` }]);
    } else if (a.pr) {
      out2.push(.../^pr#\d+$/.test(t) ? fit(rest, tokens, i + 1, state, check) : [{ ok: false, at: i, reason: `${t} does not fit ${itemName(head)}` }]);
    } else {
      const r = check(a.slot, t, state);
      out2.push(...r.ok ? fit(rest, tokens, i + 1, r.state ?? state, check) : [{ ok: false, at: i, reason: r.reason }]);
    }
  }
  return out2;
}
function fitForms(forms, tokens, check) {
  let best = null;
  for (const form of forms) {
    for (const r of fit(parseForm(form), tokens, 0, {}, check)) {
      if (r.ok) return { ok: true, form, state: r.state };
      if (!best || r.at > best.at) best = r;
    }
  }
  return { ok: false, reason: best?.reason ?? "no form fits" };
}
function diskFacts(projectRoot, { git = defaultGit } = {}) {
  const wf = join(projectRoot, ".ai", "workflows");
  return {
    hasWorkflow: (slug) => SAFE_TOKEN.test(slug) && !slug.includes("/") && existsSync(join(wf, slug, "00-index.md")),
    hasWorkflowDir: (slug) => SAFE_TOKEN.test(slug) && !slug.includes("/") && existsSync(join(wf, slug)),
    slicesOf: (slug) => {
      const file = join(wf, slug, "03-slice.md");
      if (!existsSync(file)) return [];
      const { data } = safeParseFrontmatter(readFileSync(file, "utf8"));
      return (Array.isArray(data?.slices) ? data.slices : []).map((x) => typeof x === "string" ? x : x?.slug).filter(Boolean);
    },
    hasBranch: (name) => SAFE_TOKEN.test(name) && !name.startsWith("-") && git(projectRoot, ["branch", "--list", name]).trim() !== ""
  };
}
function defaultGit(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}
function slotCheck(reg, disk) {
  const modes = new Set((reg.keys.find((k) => k.name === "intake")?.modes ?? []).map((m) => m.name));
  return (slot, t, state) => {
    if (slot === "slug") return disk.hasWorkflow(t) ? { ok: true, state: { ...state, slug: t } } : { ok: false, reason: `${t} not on disk` };
    if (slot === "slice") {
      if (!state.slug) return { ok: false, reason: `${t} not on disk` };
      return disk.slicesOf(state.slug).includes(t) ? { ok: true } : { ok: false, reason: `${t} not on disk` };
    }
    if (slot === "branch") return disk.hasBranch(t) ? { ok: true } : { ok: false, reason: `${t} not on disk` };
    if (slot === "mode") return modes.has(t) ? { ok: true } : { ok: false, reason: `${t} does not fit <mode>` };
    if (FREE_SLOTS.has(slot)) return { ok: true };
    return { ok: false, reason: `unknown slot <${slot}>` };
  };
}
var ROUTE = "reference/route.md";
function dispatch(reg, tokens, disk, { host = null } = {}) {
  if (!tokens.length) return { key: null, reference: ROUTE, argsFrom: 0, reason: "empty" };
  const key = reg.keys.find((k) => k.name === tokens[0]);
  if (!key) return { key: null, reference: ROUTE, argsFrom: 0, reason: "not a key" };
  const route = (reason) => ({ key: key.name, reference: ROUTE, argsFrom: 0, reason });
  const hostOf = (row) => host ? String(row.hosts?.[host] ?? "") : "";
  const gapOf = (row) => {
    const v = hostOf(row);
    return v.startsWith("gap: not available") ? v.slice(4).trim() : null;
  };
  const noteOf = (row) => {
    const v = hostOf(row);
    return v.startsWith("gap:") || v.startsWith("differs:") ? v : void 0;
  };
  const keyGap = gapOf(key);
  if (keyGap) return { key: key.name, reference: null, argsFrom: 1, reason: `host gap: ${keyGap}` };
  if (key.subkeys?.length) {
    const sub = key.subkeys.find((s) => s.name === tokens[1]);
    if (!sub) {
      if (key.needs === "sub-key") {
        return { key: key.name, reference: null, argsFrom: 1, reason: "ask sub-key", subkeys: key.subkeys.map((s) => ({ name: s.name, reference: s.reference })) };
      }
    } else {
      const subGap = gapOf(sub);
      if (subGap) return { key: `${key.name} ${sub.name}`, reference: null, argsFrom: 2, reason: `host gap: ${subGap}` };
      const forms = key.args.filter((f) => f.split(" ")[0].split("|").includes(sub.name));
      const r2 = fitForms(forms.length ? forms : key.args, tokens.slice(1), slotCheck(reg, disk));
      if (!r2.ok) return route(r2.reason);
      return { key: `${key.name} ${sub.name}`, reference: sub.reference, argsFrom: 2, reason: null, hostNote: noteOf(sub) };
    }
  }
  if (key.modes?.length && tokens.length > 1) {
    const mode = key.modes.find((m) => m.name === tokens[1]);
    if (mode && !disk.hasWorkflowDir(tokens[1])) {
      return {
        key: `${key.name} ${mode.name}`,
        reference: mode.reference,
        argsFrom: 2,
        reason: null,
        firstInput: "reference/intake/_intake-context.md",
        hostNote: noteOf(mode)
      };
    }
  }
  const r = fitForms(key.args, tokens.slice(1), slotCheck(reg, disk));
  if (!r.ok) return route(r.reason);
  return { key: key.name, reference: key.reference, argsFrom: 1, reason: null, hostNote: noteOf(key) };
}
function dispatchLine(result, tokens) {
  const args = tokens.slice(result.argsFrom);
  return `wf dispatch: key=${result.key ?? "(none)"} \xB7 args=${args.length ? args.join(" ") : "(none)"} \xB7 reference=${result.reference ?? "(none)"}`;
}

// lib/registry.mjs
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var REGISTRY_REL = join2("skills", "wf", "keys.json");
function loadRegistry(root = PLUGIN_ROOT) {
  return JSON.parse(readFileSync2(join2(root, REGISTRY_REL), "utf8"));
}
function reservedWords(reg) {
  const words = /* @__PURE__ */ new Set();
  for (const k of reg.keys) {
    words.add(k.name);
    for (const s of k.subkeys ?? []) words.add(s.name);
    for (const m of k.modes ?? []) words.add(m.name);
  }
  return words;
}

// scripts/wf.mjs
var PLUGIN_ROOT2 = resolve2(fileURLToPath2(new URL("..", import.meta.url)));
var USAGE = "Usage: wf.mjs <dispatch|status|index|cost|stamp> ...";
var STALE_DAYS = 7;
var DONE = /* @__PURE__ */ new Set([...TERMINAL_WORKFLOW_STATUSES, "shipped"]);
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
var wfRoot = (root) => join3(root, ".ai", "workflows");
var out = (v) => process.stdout.write(`${typeof v === "string" ? v : JSON.stringify(v, null, 2)}
`);
function flags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (["json", "check"].includes(name)) opt[name] = true;
      else opt[name] = argv[i += 1];
    } else pos.push(a);
  }
  return { pos, opt };
}
function runDispatch(pos, opt) {
  const [root, ...tokens] = pos;
  if (!root) throw new Error("dispatch: <root> is required");
  const safe = tokens.map((t) => t === UNSAFE || SAFE_TOKEN.test(t) ? t : UNSAFE);
  const r = dispatch(loadRegistry(PLUGIN_ROOT2), safe, diskFacts(resolve2(root)), { host: opt.host ?? null });
  if (opt.json) {
    out({ ...r, line: dispatchLine(r, safe) });
    return 0;
  }
  const lines = [dispatchLine(r, safe)];
  if (r.reason) lines.push(`reason: ${r.reason}`);
  if (r.firstInput) lines.push(`first-input: ${r.firstInput}`);
  if (r.hostNote) lines.push(`host-note: ${r.hostNote}`);
  for (const s of r.subkeys ?? []) lines.push(`sub-key: ${r.key} ${s.name} \u2192 ${s.reference}`);
  out(lines.join("\n"));
  return 0;
}
var STAGE_FILES = {
  intake: () => "01-intake.md",
  shape: () => "02-shape.md",
  design: () => "02c-craft.md",
  slice: () => "03-slice.md",
  plan: (s) => s ? `04-plan-${s}.md` : null,
  implement: (s) => s ? `05-implement-${s}.md` : null,
  verify: (s) => s ? `06-verify-${s}.md` : null,
  review: (s) => s ? `07-review-${s}.md` : null,
  handoff: () => "08-handoff.md",
  ship: () => "09-ship-runs.md",
  retro: () => "10-retro.md"
};
var SLICE_STAGES = [["plan", "04-plan"], ["implement", "05-implement"], ["verify", "06-verify"], ["review", "07-review"]];
function frontmatterOf(file) {
  if (!existsSync3(file)) return null;
  return safeParseFrontmatter(readFileSync3(file, "utf8")).data ?? {};
}
var count = (v) => Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0;
function groupOf(fm) {
  const status = String(fm.status ?? "");
  if (DONE.has(status)) return "completed";
  if (status === "awaiting-input" || count(fm["open-questions"]) > 0) return "blocked";
  return "active";
}
function summaryOf(w, now) {
  const fm = w.frontmatter ?? {};
  const updated = Date.parse(fm["updated-at"] ?? "");
  return {
    slug: w.slug,
    title: fm.title ?? null,
    status: fm.status ?? null,
    group: w.classification === "invalid" ? "invalid" : groupOf(fm),
    invalid: w.invalidReason ?? null,
    stage: fm["current-stage"] ?? null,
    selectedSlice: fm["selected-slice"] ?? null,
    workflowType: fm["workflow-type"] ?? "standard",
    branch: w.branch,
    updatedAt: fm["updated-at"] ?? null,
    stale: Number.isFinite(updated) && now - updated > STALE_DAYS * 864e5,
    openQuestions: count(fm["open-questions"]),
    next: fm["recommended-next-invocation"] ?? fm["next-invocation"] ?? null
  };
}
function costSummary(dir) {
  const rows = readCostRows(dir);
  return rows.length ? aggregateCost(rows) : null;
}
async function statusOf(root, slug = null, now = Date.now()) {
  const workflows = await scanWorkflowIndexes({ projectRoot: root });
  if (!slug) return { workflows: workflows.map((w2) => summaryOf(w2, now)) };
  const w = workflows.find((x) => x.slug === slug || x.directorySlug === slug);
  if (!w) return { error: `Workflow ${slug} not found.` };
  const dir = w.workflowDir;
  const summary = summaryOf(w, now);
  const stages = Object.entries(STAGE_FILES).map(([stage, name]) => {
    const file = name(summary.selectedSlice);
    const fm = file ? frontmatterOf(join3(dir, file)) : null;
    return { stage, file, present: !!fm, status: fm?.status ?? null, updatedAt: fm?.["updated-at"] ?? null };
  });
  const sliceFm = frontmatterOf(join3(dir, "03-slice.md"));
  const slices = (Array.isArray(sliceFm?.slices) ? sliceFm.slices : []).map((s) => {
    const name = typeof s === "string" ? s : s?.slug;
    const row = { slice: name };
    for (const [stage, prefix] of SLICE_STAGES) row[stage] = frontmatterOf(join3(dir, `${prefix}-${name}.md`))?.status ?? null;
    return row;
  });
  const current = STAGE_FILES[summary.stage]?.(summary.selectedSlice);
  const currentFm = current ? frontmatterOf(join3(dir, current)) : null;
  return {
    workflow: summary,
    stages,
    slices,
    cost: costSummary(dir),
    next: {
      file: current ?? null,
      invocation: currentFm?.["next-invocation"] ?? summary.next,
      routes: currentFm?.["recommended-routes"] ?? []
    }
  };
}
function statusText(s) {
  if (s.error) return s.error;
  if (s.workflows) {
    if (!s.workflows.length) return "No workflows found. Start one with `/wf intake <description>`.";
    const rows = s.workflows.map((w) => [w.slug, w.group, `${w.status ?? "?"}${w.stale ? " (stale)" : ""}`, w.stage ?? "-", w.next ?? "-"].join("	"));
    return ["slug	group	status	stage	next", ...rows].join("\n");
  }
  const lines = [`${s.workflow.slug}: ${s.workflow.status} at ${s.workflow.stage ?? "-"}`];
  for (const st of s.stages) if (st.present) lines.push(`  ${st.file}	${st.status ?? "-"}`);
  for (const sl of s.slices) lines.push(`  slice ${sl.slice}	${SLICE_STAGES.map(([k]) => `${k}=${sl[k] ?? "-"}`).join(" ")}`);
  lines.push(`next: ${s.next.invocation ?? "-"}`);
  return lines.join("\n");
}
var INDEX_HEADER = "# .ai/workflows/INDEX.md \u2014 global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.";
var rowOf = (fm, slug) => [slug, fm.status ?? "", fm["workflow-type"] ?? "standard", fm.branch ?? "", fm["updated-at"] ?? ""].join("	");
function parseIndex(text) {
  const rows = /* @__PURE__ */ new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    rows.set(line.split("	")[0], line);
  }
  return rows;
}
function worktreesByBranch(root) {
  const r = spawnSync2("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" });
  const map = /* @__PURE__ */ new Map();
  if (r.status !== 0) return map;
  let path = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    else if (line.startsWith("branch refs/heads/") && path) map.set(line.slice(18), path);
  }
  return map;
}
async function reconcileIndex(root, { write = true } = {}) {
  const file = join3(wfRoot(root), "INDEX.md");
  const existed = existsSync3(file);
  const before = existed ? readFileSync3(file, "utf8") : "";
  const old = parseIndex(before);
  const rows = /* @__PURE__ */ new Map();
  const reserved = reservedWords(loadRegistry(PLUGIN_ROOT2));
  const invalid = [];
  for (const w of await scanWorkflowIndexes({ projectRoot: root })) {
    if (w.classification !== "invalid") {
      rows.set(w.directorySlug, rowOf(w.frontmatter, w.directorySlug));
      continue;
    }
    invalid.push({ slug: w.directorySlug, reason: w.invalidReason });
    if (old.has(w.directorySlug)) rows.set(w.directorySlug, old.get(w.directorySlug));
  }
  const trees = worktreesByBranch(root);
  for (const [slug, line] of old) {
    if (rows.has(slug)) continue;
    const [, , type, branch] = line.split("	");
    const tree = type === "prototype" && branch ? trees.get(branch) : null;
    const fm = tree ? frontmatterOf(join3(tree, ".ai", "workflows", slug, "00-index.md")) : null;
    if (fm) rows.set(slug, rowOf(fm, slug));
  }
  const sorted = [...rows.keys()].sort((a, b) => a.localeCompare(b));
  const text = `${[INDEX_HEADER, ...sorted.map((s) => rows.get(s))].join("\n")}
`;
  const added = sorted.filter((s) => !old.has(s));
  const removed = [...old.keys()].filter((s) => !rows.has(s));
  const updated = sorted.filter((s) => old.has(s) && old.get(s) !== rows.get(s));
  const changed = text !== before.replace(/\r\n/g, "\n");
  if (write && changed && (rows.size || existed)) {
    mkdirSync(dirname2(file), { recursive: true });
    writeFileSync(file, text);
  }
  return {
    bootstrapped: !existed && rows.size > 0,
    changed,
    count: rows.size,
    added,
    removed,
    updated,
    invalid,
    reserved: sorted.filter((s) => reserved.has(s))
  };
}
function indexText(r) {
  const lines = [];
  if (r.bootstrapped) lines.push(`Bootstrapped .ai/workflows/INDEX.md with ${r.count} workflows.`);
  else if (r.changed) lines.push(`Reconciled INDEX.md: ${r.added.length} added, ${r.removed.length} removed, ${r.updated.length} updated.`);
  for (const s of r.removed) lines.push(`Removed stale row: ${s} (directory missing).`);
  for (const w of r.invalid) lines.push(`Workflow ${w.slug} has an unreadable 00-index.md (${w.reason}); its row is kept as it was.`);
  for (const s of r.reserved) lines.push(`Slug ${s} is a /wf command word, so a /wf form that names it as a command does not reach it.`);
  return lines.join("\n") || "INDEX.md is in sync.";
}
function costText(agg) {
  if (!agg) return "No cost ledger.";
  const head = "key	turns	subagents	input	output	cache-read	cache-write	external-in	external-out";
  const line = (k, a) => [k, a.turns, a.subagents, a.input, a.output, a.cacheRead, a.cacheWrite, a.externalInput, a.externalOutput].join("	");
  return [head, ...Object.entries(agg.byKey).map(([k, a]) => line(k, a)), line("total", agg.total)].join("\n");
}
function schemaOf() {
  return JSON.parse(readFileSync3(join3(PLUGIN_ROOT2, "schemas", "frontmatter.schema.json"), "utf8"));
}
function resolveRef(schema, node) {
  let n = node;
  while (n?.$ref) n = schema.$defs[n.$ref.split("/").pop()];
  return n ?? {};
}
function defOfType(schema, type) {
  for (const branch of (schema.allOf ?? []).flatMap((a) => a.oneOf ?? [])) {
    const def = resolveRef(schema, branch);
    const t = def.properties?.type;
    if (t?.const === type || t?.enum?.includes(type)) return def;
  }
  return null;
}
var yamlScalar = (v) => typeof v === "string" ? v === "" || /[:#\-[\]{},&*!|>'"%@`]|^\s|\s$|^(true|false|null|\d)/.test(v) ? JSON.stringify(v) : v : JSON.stringify(v);
function stampOf(type, { slug = "<slug>", slice = null, now = nowIso() } = {}) {
  const schema = schemaOf();
  const def = defOfType(schema, type);
  if (!def) throw new Error(`stamp: no artifact type ${type} in the schema`);
  const lines = ["---"];
  for (const key of def.required ?? []) {
    const p = resolveRef(schema, def.properties?.[key] ?? {});
    const ptype = Array.isArray(p.type) ? p.type[0] : p.type;
    let value;
    let note = "";
    if (key === "schema") value = "sdlc/v1";
    else if (key === "type") value = type;
    else if (key === "slug") value = slug;
    else if ((key === "slice-slug" || key === "slice") && slice) value = slice;
    else if (/-at$/.test(key)) value = now;
    else if (p.const !== void 0) value = p.const;
    else if (p.enum) {
      value = p.enum[0];
      note = `  # one of: ${p.enum.join(" | ")}`;
    } else if (ptype === "array") value = [];
    else if (ptype === "integer" || ptype === "number") value = 0;
    else if (ptype === "boolean") value = false;
    else if (ptype === "object") value = {};
    else value = "";
    const text = Array.isArray(value) ? "[]" : value && typeof value === "object" ? "{}" : yamlScalar(value);
    lines.push(`${key}: ${text}${note}`);
  }
  lines.push("---");
  return lines.join("\n");
}
async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  const { pos, opt } = flags(rest);
  try {
    switch (cmd) {
      case "dispatch":
        return runDispatch(pos, opt);
      case "status": {
        const [root, slug] = pos;
        if (!root) throw new Error("status: <root> is required");
        const s = await statusOf(resolve2(root), slug ?? null);
        out(opt.json ? s : statusText(s));
        return s.error ? 1 : 0;
      }
      case "index": {
        const [root] = pos;
        if (!root) throw new Error("index: <root> is required");
        const r = await reconcileIndex(resolve2(root), { write: !opt.check });
        out(opt.json ? r : indexText(r));
        return opt.check && r.changed ? 1 : 0;
      }
      case "cost": {
        const [root, slug] = pos;
        if (!root || !slug) throw new Error("cost: <root> <slug> are required");
        const agg = costSummary(join3(wfRoot(resolve2(root)), slug));
        out(opt.json ? agg : costText(agg));
        return 0;
      }
      case "stamp": {
        const [type] = pos;
        if (!type) throw new Error("stamp: <type> is required");
        out(stampOf(type, { slug: opt.slug, slice: opt.slice ?? null }));
        return 0;
      }
      default:
        process.stderr.write(`${USAGE}
`);
        return 2;
    }
  } catch (e) {
    process.stderr.write(`wf.mjs: ${e.message}
`);
    return 1;
  }
}
var isMain = process.argv[1] && resolve2(process.argv[1]) === fileURLToPath2(import.meta.url);
if (isMain) process.exitCode = await main();
export {
  INDEX_HEADER,
  defOfType,
  main,
  reconcileIndex,
  stampOf,
  statusOf
};
