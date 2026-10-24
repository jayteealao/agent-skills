#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  BUILD_FORMS,
  DEFAULT_FILES,
  IDEATE_FILES,
  PACKET_STATES,
  checkList,
  closesCycle,
  editRosterEntry,
  endBranch,
  frontmatterValue,
  isStartedState,
  listBranch,
  readWorkFiles,
  rosterEntries,
  rosterWalkOrder,
  setFrontmatterValue,
  writeList
} from "./chunk-2NDPLZOO.mjs";
import {
  designNeeded,
  designSettled
} from "./chunk-XRORYZXI.mjs";
import {
  validateBrainstormBoard
} from "./chunk-LJCAG37B.mjs";
import {
  missingBoardFiles,
  needsPictures
} from "./chunk-3O7UYQ5X.mjs";
import {
  jsYaml,
  safeParseFrontmatter
} from "./chunk-R35WUHOB.mjs";
import "./chunk-DS4JUPRY.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/campaign.mjs
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync as existsSync2, lstatSync as lstatSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, rmdirSync, rmSync as rmSync2, statSync as statSync2, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname as dirname2, join as join2, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/brainstorm-archive.mjs
var SESSIONS_KEPT = 3;
var SUMMARY_WORD_CAP = 150;
var CLOSED_THREAD_STATES = /* @__PURE__ */ new Set(["routed", "dropped"]);
var DONE_PACKET_STATES = /* @__PURE__ */ new Set(["written", "prepared", "routed"]);
function wordCount(text) {
  return String(text ?? "").split(/\s+/).filter(Boolean).length;
}
function namedKeys(board) {
  const keys = /* @__PURE__ */ new Set();
  for (const p of board.work ?? []) for (const k of p.items ?? []) keys.add(k);
  for (const b of board.briefs ?? []) for (const c of b.criteria ?? []) for (const k of c.items ?? []) keys.add(k);
  for (const b of board.budgets ?? []) if (b.decision) keys.add(b.decision);
  for (const s of board.sketches ?? []) for (const k of s.items ?? []) keys.add(k);
  return keys;
}
function itemRefs(item) {
  return [...Array.isArray(item.between) ? item.between : [], item["replaced-by"]].filter(Boolean);
}
function archiveBoard(board, { keep = SESSIONS_KEPT } = {}) {
  const threads = new Map((board.threads ?? []).map((t) => [t.key, t]));
  const openThreads = /* @__PURE__ */ new Set();
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
  for (let changed = true; changed; ) {
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
    stories: (board.stories ?? []).filter((s) => oldSession(s.session))
  };
  const kept = {
    ...board,
    items: items.filter((i) => !going.has(i.key)),
    log: (board.log ?? []).filter((e) => !oldSession(e.session)),
    stories: (board.stories ?? []).filter((s) => !oldSession(s.session))
  };
  return { board: kept, archived, count: archived.items.length + archived.log.length + archived.stories.length };
}
function mergeArchive(prior, part) {
  const out = { items: [...prior?.items ?? []], log: [...prior?.log ?? []], stories: [...prior?.stories ?? []] };
  const seen = new Set(out.items.map((i) => i.key));
  for (const i of part.items) if (!seen.has(i.key)) out.items.push(i);
  out.log.push(...part.log);
  out.stories.push(...part.stories);
  return out;
}
function section(markdown, name) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, n) => n > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}
function docCheck(markdown, { keep = SESSIONS_KEPT, cap = SUMMARY_WORD_CAP } = {}) {
  const warnings = [];
  const summary = section(markdown, "The Brainstorm");
  if (summary != null) {
    const words = wordCount(summary.replace(/<!--[\s\S]*?-->/g, ""));
    if (words > cap) warnings.push(`## The Brainstorm has ${words} words, more than ${cap}: rewrite it shorter.`);
  }
  const stories = section(markdown, "Sessions");
  if (stories != null) {
    const count = stories.split(/\r?\n/).filter((l) => l.startsWith("### ")).length;
    if (count > keep) warnings.push(`## Sessions tells ${count} sessions, more than ${keep}: move the older stories to archive/record.md.`);
  }
  return warnings;
}

// lib/campaign-records.mjs
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var MANIFEST_VERSION = 1;
var REGISTRY = "workflows/INDEX.md";
var MACHINE_LOCAL = /* @__PURE__ */ new Set([".watch-state.json"]);
var TEMP_RE = /\.records-\d+-[0-9a-f]+\.tmp$|^\.watch-state\.json\.\d+\.tmp$/;
var posix = (p) => p.split("\\").join("/");
function isSkipped(rel) {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  return MACHINE_LOCAL.has(base) || parts.includes("_view") || TEMP_RE.test(base);
}
function hashFile(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}
function walk(dir) {
  const files = /* @__PURE__ */ new Map();
  const links = [];
  if (!existsSync(dir)) return { files, links };
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(a);
      if (st.isSymbolicLink()) links.push(r);
      else if (st.isDirectory()) visit(a, r);
      else if (st.isFile()) files.set(r, a);
    }
  };
  visit(dir, "");
  return { files, links };
}
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function putVerified(dest, bytes, hash, mtime = null) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = join(dirname(dest), `.records-${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmp, bytes);
  if (hashFile(tmp) !== hash) {
    rmSync(tmp, { force: true });
    throw new Error(`records: the temp copy of ${dest} does not match its source`);
  }
  if (mtime) utimesSync(tmp, mtime, mtime);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, dest);
      break;
    } catch (e) {
      if (i >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        rmSync(tmp, { force: true });
        throw e;
      }
      pause(100 * (i + 1));
    }
  }
  if (hashFile(dest) !== hash) throw new Error(`records: ${dest} does not match its source after the copy`);
}
function copyVerified(src, dest, hash) {
  putVerified(dest, readFileSync(src), hash, statSync(src).mtime);
}
function loadManifest(file, id) {
  try {
    const m = JSON.parse(readFileSync(file, "utf8"));
    if (m && m.files) return m;
  } catch {
  }
  return { version: MANIFEST_VERSION, id, files: {} };
}
function saveManifest(file, manifest, now) {
  manifest["updated-at"] = now;
  const text = `${JSON.stringify(manifest, null, 2)}
`;
  putVerified(file, text, createHash("sha256").update(text).digest("hex"));
}
var entryOf = (manifest, rel) => manifest.files[rel] ??= { base: null, kept: [] };
var EARLIER_LIMIT = 20;
function setBase(e, hash) {
  if (e.base && hash && e.base !== hash) {
    e.earlier = [...(e.earlier ?? []).filter((h) => h !== e.base && h !== hash), e.base].slice(-EARLIER_LIMIT);
  } else if (hash && e.earlier?.includes(hash)) {
    e.earlier = e.earlier.filter((h) => h !== hash);
  }
  e.base = hash;
}
function mergeRegistry(mainText, otherText) {
  const header = [];
  const rows = /* @__PURE__ */ new Map();
  const take = (text, isMain) => {
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith("#")) {
        if (isMain) header.push(line);
        continue;
      }
      const cols = line.split("	");
      const prev = rows.get(cols[0]);
      if (!prev || String(cols[4] ?? "") > String(prev[4] ?? "")) rows.set(cols[0], cols);
    }
  };
  take(mainText, true);
  take(otherText, false);
  const body = [...rows.keys()].sort().map((k) => rows.get(k).join("	"));
  return `${[...header, ...body].join("\n")}
`;
}
function recordsOut({ main: main2, worktree, manifest, conflictsDir, exclude = () => false, mainOnly = () => false }) {
  const src = walk(join(worktree, ".ai"));
  const res = { copied: [], same: 0, unchanged: 0, conflicts: [], deletedInWorktree: [], links: src.links.filter((r) => !isSkipped(r)) };
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const wh = hashFile(abs);
    const target = join(main2, ".ai", ...rel.split("/"));
    const mh = existsSync(target) ? hashFile(target) : null;
    const e = entryOf(manifest, rel);
    if (mh === wh) {
      setBase(e, wh);
      res.same++;
      continue;
    }
    if (e.base && wh === e.base) {
      res.unchanged++;
      continue;
    }
    const stale = mh !== null && (e.earlier ?? []).includes(wh);
    const owned = mainOnly(rel);
    if (!stale && !owned && (mh === null || e.base && mh === e.base)) {
      const now = existsSync(target) ? hashFile(target) : null;
      if (now === mh) {
        copyVerified(abs, target, wh);
        setBase(e, wh);
        res.copied.push(rel);
        continue;
      }
    }
    const kept = join(conflictsDir, ...rel.split("/"));
    copyVerified(abs, kept, wh);
    if (!e.kept.includes(wh)) e.kept.push(wh);
    let merged = false;
    if (rel === REGISTRY && existsSync(target)) {
      const text = mergeRegistry(readFileSync(target, "utf8"), readFileSync(abs, "utf8"));
      putVerified(target, text, createHash("sha256").update(text).digest("hex"));
      merged = true;
    }
    setBase(e, wh);
    res.conflicts.push({ rel, kept: posix(kept), merged, ...stale ? { stale: true } : {}, ...owned ? { mainOwned: true } : {} });
  }
  for (const [rel, e] of Object.entries(manifest.files)) {
    if (e.base && !src.files.has(rel) && !isSkipped(rel) && !exclude(rel)) res.deletedInWorktree.push(rel);
  }
  return res;
}
function recordsPending({ main: main2, worktree, manifest, exclude = () => false }) {
  const src = walk(join(worktree, ".ai"));
  const pending = src.links.filter((r) => !isSkipped(r)).map((rel) => ({ rel, reason: "a link: the sync never follows links" }));
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const wh = hashFile(abs);
    const target = join(main2, ".ai", ...rel.split("/"));
    if (existsSync(target) && hashFile(target) === wh) continue;
    const e = manifest.files[rel];
    if (e && (e.base === wh || e.kept.includes(wh))) continue;
    pending.push({ rel, reason: "not in the main checkout" });
  }
  return pending;
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function withRecordsLock(file, holder, fn, { waitMs = 6e4, staleMs = 15 * 6e4, liveStaleMs = 6 * 60 * 6e4, alive = pidAlive, now = () => (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const until = Date.now() + waitMs;
  for (; ; ) {
    try {
      writeFileSync(file, JSON.stringify({ holder, pid: process.pid, at: now() }), { flag: "wx" });
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let cur = null;
      try {
        cur = JSON.parse(readFileSync(file, "utf8"));
      } catch {
      }
      const at = cur?.at ? Date.parse(cur.at) : statSync(file).mtimeMs;
      const hasPid = Number.isInteger(cur?.pid);
      const running = hasPid && alive(cur.pid);
      const stale = hasPid ? !running || Date.now() - at > liveStaleMs : Date.now() - at > staleMs;
      if (stale) {
        rmSync(file, { force: true });
        continue;
      }
      if (Date.now() > until) throw new Error(`records: the records lock is held by ${cur?.holder ?? "another sync"} since ${cur?.at ?? "?"}${running ? ` (process ${cur.pid} still runs)` : ""}; try again`);
      pause(250);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(file, { force: true });
  }
}
function ignoredAtRisk(porcelain, allow = []) {
  const ok = ["node_modules", ...allow].map((d) => posix(d).replace(/^\.\//, "").replace(/\/+$/, ""));
  return String(porcelain).split(/\r?\n/).filter((l) => l.startsWith("!! ")).map((l) => l.slice(3).replace(/^"|"$/g, "").replace(/\/$/, "")).filter((p) => p !== ".ai" && !p.startsWith(".ai/")).filter((p) => !ok.some((d) => p === d || p.startsWith(`${d}/`) || p.split("/").includes(d)));
}

// scripts/campaign.mjs
var USAGE = "Usage: campaign.mjs <check|write|archive> <source-dir|board-file> | <status|open|land|start|built|reopen|done|close|migrate|remove-worktree> <projectRoot> <source> ... | slice-order <checkout> <slug> add ...";
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
var sourceDir = (root, src) => join2(root, ".ai", "workflows", src);
var workDir = (root, src) => join2(sourceDir(root, src), "work");
var oldCampDir = (root, src) => join2(workDir(root, src), "campaign");
var archivedCampDir = (root, src) => join2(workDir(root, src), "archive", "campaign");
var wfDir = (root, slug) => join2(root, ".ai", "workflows", slug);
var posix2 = (p) => String(p).split("\\").join("/");
function readJson(file) {
  try {
    return JSON.parse(readFileSync2(file, "utf8"));
  } catch {
    return null;
  }
}
function readFm(file) {
  if (!existsSync2(file)) return null;
  return safeParseFrontmatter(readFileSync2(file, "utf8")).data ?? {};
}
function dump(data) {
  return jsYaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' }).trimEnd();
}
function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}
var commitOf = (cwd, ref) => {
  const r = git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout : null;
};
var isAncestor = (cwd, a, b) => git(cwd, ["merge-base", "--is-ancestor", a, b]).status === 0;
var currentBranch = (cwd) => git(cwd, ["branch", "--show-current"]).stdout || null;
var hasRemote = (cwd, name = "origin") => git(cwd, ["remote"]).stdout.split(/\r?\n/).includes(name);
function trunkOf(root, f = {}) {
  if (f.trunk) return String(f.trunk);
  const head = git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (head.status === 0 && head.stdout) return head.stdout.replace(/^origin\//, "");
  for (const t of ["main", "master"]) if (commitOf(root, `refs/heads/${t}`)) return t;
  return "main";
}
function trunkRef(root, trunk) {
  if (hasRemote(root)) {
    git(root, ["fetch", "--quiet", "origin", trunk]);
    if (commitOf(root, `refs/remotes/origin/${trunk}`)) return `origin/${trunk}`;
  }
  return trunk;
}
function dirtyOutsideAi(cwd) {
  const r = git(cwd, ["status", "--porcelain"]);
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "")).filter((p) => !posix2(p).startsWith(".ai/"));
}
function configOf(root) {
  return readJson(join2(root, ".ai", "sdlc-config.json")) ?? {};
}
function appendHistory(dir, text, stage = "campaign") {
  mkdirSync2(dir, { recursive: true });
  appendFileSync(join2(dir, "index-history.jsonl"), `${JSON.stringify({ at: nowIso(), kind: "note", text, stage })}
`);
}
function setFields(file, fields) {
  let text = readFileSync2(file, "utf8");
  for (const [k, v] of Object.entries(fields)) {
    const next = setFrontmatterValue(text, k, v);
    if (next === null) return false;
    text = next;
  }
  writeFileSync2(file, text);
  return true;
}
function resolveBoard(arg) {
  const abs = resolve(arg);
  if (abs.endsWith(".json")) return { dir: dirname2(abs), boardFile: basename(abs) };
  for (const name of [DEFAULT_FILES.board, IDEATE_FILES.board]) {
    if (existsSync2(join2(abs, name))) return { dir: abs, boardFile: name };
  }
  return { dir: abs, boardFile: DEFAULT_FILES.board };
}
function boardFileOf(dir) {
  return resolveBoard(dir).boardFile;
}
function gitIgnoredCheck(projectRoot) {
  if (git(projectRoot, ["rev-parse", "--is-inside-work-tree"]).status !== 0) return null;
  const cache = /* @__PURE__ */ new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    const ignored = spawnSync("git", ["check-ignore", "-q", "--", path], { cwd: projectRoot, encoding: "utf8", windowsHide: true }).status === 0;
    cache.set(path, ignored);
    return ignored;
  };
}
var projectRootOfSource = (dir) => resolve(dir, "..", "..", "..");
function checkCmd(arg) {
  const { dir, boardFile } = resolveBoard(arg);
  const board = readJson(join2(dir, boardFile));
  if (!board) return { ok: false, error: `no ${boardFile} in ${dir}` };
  const res = checkList(board, { isIgnored: gitIgnoredCheck(projectRootOfSource(dir)) });
  return { ok: !res.errors.length, ...res };
}
function writeCmd(arg, f) {
  const { dir, boardFile } = resolveBoard(arg);
  if (!existsSync2(join2(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}` };
  return writeList(dir, { isIgnored: gitIgnoredCheck(projectRootOfSource(dir)), dryRun: Boolean(f["dry-run"]), boardFile });
}
function archiveCommand(dir, boardFile, { dryRun = false, now = null } = {}) {
  const boardPath = join2(dir, boardFile);
  const board = JSON.parse(readFileSync2(boardPath, "utf8"));
  const { board: kept, archived, count } = archiveBoard(board);
  const docPath = join2(dir, "01-brainstorm.md");
  const warnings = existsSync2(docPath) ? docCheck(readFileSync2(docPath, "utf8")) : [];
  const result = { ok: true, moved: { items: archived.items.length, log: archived.log.length, stories: archived.stories.length }, warnings, dryRun };
  if (!count || dryRun) return result;
  const archiveDir = join2(dir, "archive");
  const archivePath = join2(archiveDir, "board.json");
  const prior = existsSync2(archivePath) ? JSON.parse(readFileSync2(archivePath, "utf8")) : null;
  mkdirSync2(archiveDir, { recursive: true });
  writeFileSync2(archivePath, `${JSON.stringify(mergeArchive(prior, archived), null, 2)}
`);
  const at = (now ?? /* @__PURE__ */ new Date()).toISOString();
  kept.archived = [...board.archived ?? [], { session: board.sessions ?? null, at, file: "archive/board.json", ...result.moved }];
  writeFileSync2(boardPath, `${JSON.stringify(kept, null, 2)}
`);
  return result;
}
function readList(root, src) {
  const wd = workDir(root, src);
  const index = readFm(join2(wd, "index.md"));
  const { packets } = readWorkFiles(wd);
  const all = [...packets.values()].map((p) => ({ ...p.data, file: p.file, path: join2(wd, p.file) })).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  return { index, packets: all };
}
function packetOf(root, src, key) {
  const { index, packets } = readList(root, src);
  if (index?.type !== "list") throw new Error(`${src} has no list: run campaign.mjs write first`);
  const packet = packets.find((p) => p.key === key || p["packet-slug"] === key);
  if (!packet) throw new Error(`${key} is not a packet of the list ${src}`);
  return { index, packets, packet };
}
function setPacketState(packet, state) {
  if (!PACKET_STATES.includes(state)) throw new Error(`unknown packet state ${state}`);
  setFields(packet.path, { state });
}
function designBlock(root, slug) {
  const dir = wfDir(root, slug);
  const index = readFm(join2(dir, "00-index.md"));
  if (!index) return null;
  if (!designNeeded(index, existsSync2(join2(dir, "02b-design.md")))) return null;
  const contract = readFm(join2(dir, "02c-craft.md"));
  const missing = contract ? missingBoardFiles(dir, contract) : null;
  if (!designSettled(index, contract, missing)) {
    if (missing?.length) return `the confirmed boards are missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`;
    return `the design is not settled; run /wf design ${slug} with the person`;
  }
  const skipped = index.progress && typeof index.progress === "object" && index.progress.design === "skipped";
  if (!skipped && needsPictures(index) && !String(contract?.boards ?? "").trim()) {
    return `02c-craft.md names no boards (ux-impact ${index["ux-impact"]}); run /wf design ${slug} amend`;
  }
  return null;
}
var plainCell = (s) => String(s ?? "").replace(/[`*_]/g, "").trim();
function decisionFidelity(root, slug, carriedKeys = []) {
  const dir = wfDir(root, slug);
  const review = join2(dir, "07-review.md");
  const none = { table: false, missing: [], rows: [] };
  if (!existsSync2(review)) return none;
  const text = readFileSync2(review, "utf8");
  const at = text.search(/^## Decision Fidelity\s*$/m);
  if (at < 0) return carriedKeys.length ? none : { table: true, missing: [], rows: [] };
  const section2 = text.slice(at).split(/\n## /)[0];
  const answers = existsSync2(join2(dir, "po-answers.md")) ? readFileSync2(join2(dir, "po-answers.md"), "utf8") : "";
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const line of section2.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    const key = plainCell(cells[1]);
    if (!key || /^:?-+:?$/.test(key) || /^key$/i.test(key)) continue;
    seen.add(key);
    const verdict = plainCell(cells[2]).toLowerCase();
    if (/^honored\b/.test(verdict)) continue;
    const recorded = new RegExp(`^- \\W*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\W*: approved`, "m").test(answers);
    if (!recorded) rows.push({ key, verdict: verdict || "no verdict", evidence: cells[3] ?? "" });
  }
  return { table: true, missing: carriedKeys.map(String).filter((k) => !seen.has(k)), rows };
}
function openSlices(root, slug) {
  const slices = readFm(join2(wfDir(root, slug), "00-index.md"))?.slices;
  if (!Array.isArray(slices)) return [];
  return slices.filter((s) => s && ["defined", "in-progress", "planned", "not-started"].includes(String(s.status ?? ""))).map((s) => String(s.slug ?? s.slice ?? ""));
}
var tryOutRecorded = (root, slug) => {
  const file = join2(wfDir(root, slug), "po-answers.md");
  return existsSync2(file) && /^- try-out: works/m.test(readFileSync2(file, "utf8"));
};
function nextStep(root, src, packet) {
  const slug = packet["packet-slug"];
  if (packet.state === "done" || packet.state === "dropped") return { step: "none" };
  if (!BUILD_FORMS.includes(packet.form)) return { step: "route", route: routeOf(src, packet) };
  if (packet.state === "written") return { step: "open" };
  const block = designBlock(root, slug);
  if (block) return { step: "design", reason: block, route: `/wf design ${slug}` };
  if (packet.state === "open") {
    if (!existsSync2(join2(wfDir(root, slug), "03-slice.md"))) return { step: "slice" };
    return { step: "yolo" };
  }
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { step: "yolo", reason: `the slice(s) ${unbuilt.join(", ")} are not complete: run campaign.mjs reopen, then the driver` };
  const fid = decisionFidelity(root, slug, (packet["carried-decisions"] ?? []).map((d) => d.key));
  if (!fid.table) return { step: "fidelity", reason: "07-review.md has no ## Decision Fidelity table: run the review again" };
  if (fid.missing.length) return { step: "fidelity", reason: `the ## Decision Fidelity table has no row for ${fid.missing.join(", ")}: run the review again`, missing: fid.missing };
  if (fid.rows.length) return { step: "fidelity", rows: fid.rows };
  if (packet["try-out"] === "yes" && !tryOutRecorded(root, slug)) return { step: "try-out" };
  return { step: "done" };
}
function routeOf(src, packet) {
  const slug = packet["packet-slug"];
  switch (packet.form) {
    case "investigate":
      return `/wf intake investigate ${slug}`;
    case "discover":
      return `/wf intake discover ${slug}`;
    case "rca":
      return `/wf intake rca ${slug}`;
    case "task":
      return `/wf intake task ${slug}`;
    default:
      return `/wf intake .ai/workflows/${src}/work/${packet.file}`;
  }
}
function statusCmd(root, src) {
  const dir = sourceDir(root, src);
  if (!existsSync2(dir)) return { ok: false, error: `no source folder .ai/workflows/${src}` };
  const { index, packets } = readList(root, src);
  const oldLedger = existsSync2(join2(oldCampDir(root, src), "ledger.json"));
  if (oldLedger && index?.type !== "list") {
    return { ok: true, source: src, migrate: true, reason: "an old campaign ledger and no list: migrate first (section 12.2)", next: `campaign.mjs migrate <root> ${src} report` };
  }
  if (index?.type !== "list") return { ok: false, source: src, error: `${src} has no list. Write it at brainstorm done (campaign.mjs write).` };
  if (oldLedger) {
    return { ok: true, source: src, migrate: "finish", reason: "the list is written and the old ledger is still in work/campaign/: finish the migration (section 12.2 steps 8 to 10)", next: `campaign.mjs migrate <root> ${src} finish` };
  }
  const branch = listBranch(src);
  const rows = packets.map((p) => ({ key: p.key, slug: p["packet-slug"], form: p.form, state: p.state, order: p.order, "try-out": p["try-out"] ?? null, ...p.migrated ? { migrated: true } : {} }));
  const current = packets.find((p) => !["done", "dropped"].includes(p.state)) ?? null;
  const needDesign = packets.filter((p) => BUILD_FORMS.includes(p.form) && !["done", "dropped"].includes(p.state)).map((p) => {
    const opened = existsSync2(join2(wfDir(root, p["packet-slug"]), "00-index.md"));
    const why = opened ? designBlock(root, p["packet-slug"]) : (p["ux-impact"] ?? "none") !== "none" ? "not opened yet; the design stage runs after open" : null;
    return why ? { key: p.key, slug: p["packet-slug"], reason: why } : null;
  }).filter(Boolean);
  return {
    ok: true,
    source: src,
    branch,
    onListBranch: currentBranch(root) === branch,
    packets: rows,
    current: current ? { key: current.key, slug: current["packet-slug"], state: current.state, ...nextStep(root, src, current) } : null,
    needDesign,
    finished: !current
  };
}
function indexRow(root, slug, branch) {
  const file = join2(root, ".ai", "workflows", "INDEX.md");
  const header = "# .ai/workflows/INDEX.md \u2014 global workflow registry. Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.";
  const lines = existsSync2(file) ? readFileSync2(file, "utf8").split(/\r?\n/).filter((l, i, a) => l || i < a.length - 1) : [header];
  if (lines.some((l) => l.split("	")[0] === slug)) return false;
  const head = lines[0]?.startsWith("#") ? [lines[0]] : [];
  const rows = lines.slice(head.length).filter(Boolean);
  rows.push([slug, "active", "feature", branch, nowIso()].join("	"));
  rows.sort((a, b) => a.split("	")[0].localeCompare(b.split("	")[0]));
  mkdirSync2(dirname2(file), { recursive: true });
  writeFileSync2(file, `${[...head, ...rows].join("\n")}
`);
  return true;
}
function sectionList(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*$`, "m").exec(text);
  if (!m) return [];
  const body = text.slice(m.index + m[0].length).split(/\n## /)[0];
  return body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("- ") && l !== "- None.").map((l) => l.slice(2));
}
function sectionText(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*$`, "m").exec(text);
  if (!m) return "";
  const body = text.slice(m.index + m[0].length).split(/\n## /)[0].trim();
  return body === "- None." ? "" : body;
}
function packetFolderFiles({ src, packet, packetText, list, trunk, now }) {
  const slug = packet["packet-slug"];
  const originPacket = `.ai/workflows/${src}/work/${packet.file}`;
  const decisions = packet["carried-decisions"] ?? [];
  const boardFile = list?.board ?? DEFAULT_FILES.board;
  const goal = sectionText(packetText, "Goal");
  const inScope = sectionList(packetText, "In scope");
  const outScope = sectionList(packetText, "Out of scope");
  const acs = sectionList(packetText, "Acceptance criteria");
  const constraints = sectionList(packetText, "Constraints");
  const risks = sectionList(packetText, "Risks");
  const ux = packet["ux-impact"] ?? "none";
  const stack = { ...list?.stack ?? {}, "user-confirmed": true };
  const index = {
    schema: "sdlc/v1",
    type: "index",
    slug,
    title: packet.title ?? slug,
    status: "active",
    "current-stage": "shape",
    "stage-number": 2,
    "created-at": now,
    "updated-at": now,
    "workflow-type": "feature",
    "selected-slice": "",
    "branch-strategy": "dedicated",
    branch: listBranch(src),
    "base-branch": trunk,
    "review-scope": "slug-wide",
    "review-scope-confirmed": true,
    "pr-url": "",
    "pr-number": 0,
    "open-questions": [],
    tags: [],
    stack,
    "ux-impact": ux,
    "ux-impact-confirmed": true,
    ...ux === "none" ? { "design-skip-reason": "ux-impact none" } : {},
    "origin-packet": originPacket,
    "origin-items": decisions.map((d) => d.key),
    ...packet.amends || packet["target-slug"] ? { amends: packet["target-slug"] ?? packet.amends } : {},
    // The person confirmed each risk at brainstorm done, and the walk runs no shape stage, so a
    // risk is carried to the slug-wide review. An `open` risk would block the handoff gate.
    "intent-risks": risks.length ? risks.map((r, i) => ({
      id: `RIM-${i + 1}`,
      risk: r,
      severity: "medium",
      status: "carried",
      "adjudicated-by": "02-shape.md#unknowns--open-questions",
      decision: "confirmed by the person at brainstorm done; the slug-wide review checks it",
      "po-ratified": true
    })) : "none-declared",
    charter: "none-declared",
    "next-command": ux === "none" ? "wf-slice" : "wf-design",
    "next-invocation": ux === "none" ? `/wf campaign ${src}` : `/wf design ${slug}`,
    "workflow-files": ["00-index.md", "01-intake.md", "02-shape.md", "po-answers.md"],
    progress: {
      intake: "complete",
      shape: "complete",
      design: ux === "none" ? "skipped" : "not-started",
      slice: "not-started",
      plan: "not-started",
      implement: "not-started",
      verify: "not-started",
      review: "not-started",
      handoff: "not-started",
      ship: "not-started",
      retro: "not-started"
    }
  };
  const cite = (d) => `source: .ai/workflows/${src}/${boardFile}#${d.key}`;
  const intake = [
    "---",
    dump({
      schema: "sdlc/v1",
      type: "intake",
      slug,
      status: "complete",
      "stage-number": 1,
      "created-at": now,
      "updated-at": now,
      tags: [],
      refs: { index: "00-index.md", next: "02-shape.md" },
      "next-command": "wf-slice",
      "next-invocation": `/wf campaign ${src}`,
      "recommended-routes": [{ invocation: `/wf campaign ${src}`, reason: "the campaign walk slices and builds this packet", default: true }]
    }),
    "---",
    "",
    "# Intake",
    "",
    `Written by \`campaign.mjs open\` from the packet [${packet.file}](../${src}/work/${packet.file}). The brainstorm wrote the scope with the person; nobody re-words it.`,
    "",
    "## Restated Request",
    "",
    goal || packet.title || slug,
    "",
    "## Intended Outcome",
    "",
    goal || "- See Success Criteria.",
    "",
    "## Known Constraints",
    "",
    ...constraints.length || decisions.length ? [...constraints.map((c) => `- ${c}`), ...decisions.map((d) => `- **${d.key}** \u2014 ${d.text} (${cite(d)})`)] : ["- None."],
    "",
    "## Risks if Misunderstood",
    "",
    ...risks.length ? risks.map((r, i) => `- **RIM-${i + 1}** \u2014 ${r}`) : ["- none-declared: the packet records no risk."],
    "- charter: none-declared: the carried decisions are the commitments of the packet.",
    "",
    "## Success Criteria",
    "",
    ...acs.length ? acs.map((a) => `- ${a}`) : ["- None."],
    "",
    "## Out of Scope for Now",
    "",
    ...outScope.length ? outScope.map((o) => `- ${o}`) : ["- None."],
    ""
  ].join("\n");
  const shape = [
    "---",
    dump({
      schema: "sdlc/v1",
      type: "shape",
      slug,
      status: "complete",
      "stage-number": 2,
      "created-at": now,
      "updated-at": now,
      "docs-needed": false,
      "docs-types": [],
      "augmentations-needed": [],
      "charter-scenario": "none \u2014 a campaign packet; the acceptance criteria carry the scenario",
      "files-in-scope": [],
      tags: [],
      refs: { index: "00-index.md", intake: "01-intake.md", next: "03-slice.md" },
      "next-command": ux === "none" ? "wf-slice" : "wf-design",
      "next-invocation": ux === "none" ? `/wf campaign ${src}` : `/wf design ${slug}`,
      "recommended-routes": [{ invocation: ux === "none" ? `/wf campaign ${src}` : `/wf design ${slug}`, reason: ux === "none" ? "the walk slices the packet" : "the packet needs the design stage first", default: true }]
    }),
    "---",
    "",
    "# Shape",
    "",
    `Written by \`campaign.mjs open\` from the packet [${packet.file}](../${src}/work/${packet.file}).`,
    "",
    "## Problem Statement",
    "",
    goal || packet.title || slug,
    "",
    "## Desired Behavior",
    "",
    ...inScope.length ? inScope.map((s) => `- ${s}`) : ["- See Acceptance Criteria."],
    "",
    "## Acceptance Criteria",
    "",
    ...acs.length ? acs.map((a) => `- ${a}`) : ["- None."],
    "",
    "## Out of Scope",
    "",
    ...outScope.length ? outScope.map((o) => `- ${o}`) : ["- None."],
    "",
    "## Unknowns / Open Questions",
    "",
    ...risks.length ? risks.map((r, i) => `- **RIM-${i + 1}** (carried to the slug-wide review) \u2014 ${r}`) : ["- None."],
    "",
    "## Intake Fidelity",
    "",
    "| Intake directive | Disposition | How | Authority |",
    "|---|---|---|---|",
    ...decisions.map((d) => `| **${d.key}** \u2014 ${String(d.text).replace(/\|/g, "\\|")} | honored | carried word for word into this packet | the brainstorm board, ${d.key} |`),
    ...constraints.map((c) => `| ${c.replace(/\|/g, "\\|")} | honored | a constraint of the packet | the brainstorm |`),
    "",
    "## Definition of Done",
    "",
    "Every acceptance criterion passes verify, the slug-wide review clears, and the decision fidelity table has no unapproved row.",
    ""
  ].join("\n");
  const answers = `# PO answers

The brainstorm \`${src}\` recorded the decisions of this packet. The campaign walk appends the fidelity approvals and the try-out here.
`;
  return { "00-index.md": `---
${dump(index)}
---
`, "01-intake.md": intake, "02-shape.md": shape, "po-answers.md": answers };
}
function openCmd(root, src, [key], f) {
  const { index: list, packet } = packetOf(root, src, key);
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a ${packet.form} packet; the walk routes it to its own command`, route: routeOf(src, packet) };
  if (packet.state !== "written") return { ok: true, opened: false, key: packet.key, state: packet.state, reason: "already open" };
  const slug = packet["packet-slug"];
  const dir = wfDir(root, slug);
  const trunk = trunkOf(root, f);
  const originPacket = `.ai/workflows/${src}/work/${packet.file}`;
  if (existsSync2(join2(dir, "00-index.md"))) {
    setFields(join2(dir, "00-index.md"), {
      "origin-packet": originPacket,
      branch: listBranch(src),
      "base-branch": trunk,
      "branch-strategy": "dedicated",
      "workflow-type": "feature",
      "review-scope": "slug-wide",
      "review-scope-confirmed": true,
      "updated-at": nowIso()
    });
    appendHistory(dir, `campaign: the packet ${packet.key} of ${src} adopted this folder`);
    setPacketState(packet, "open");
    indexRow(root, slug, listBranch(src));
    return { ok: true, opened: true, adopted: true, key: packet.key, slug };
  }
  const boardFile = boardFileOf(sourceDir(root, src));
  const files = packetFolderFiles({ src, packet, packetText: readFileSync2(packet.path, "utf8"), list: { ...list, board: boardFile }, trunk, now: nowIso() });
  mkdirSync2(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync2(join2(dir, name), text);
  appendHistory(dir, `campaign: opened from the packet ${packet.key} of ${src}`, "intake");
  setPacketState(packet, "open");
  indexRow(root, slug, listBranch(src));
  return { ok: true, opened: true, key: packet.key, slug, wrote: Object.keys(files).map((n) => posix2(relative(root, join2(dir, n)))) };
}
function landCmd(root, src, f) {
  const branch = listBranch(src);
  if (currentBranch(root) === branch) return { ok: true, branch, switched: false };
  const trunk = trunkOf(root, f);
  const exists = commitOf(root, `refs/heads/${branch}`);
  const r = exists ? git(root, ["switch", branch]) : git(root, ["switch", "-c", branch, trunk]);
  if (r.status !== 0) return { ok: false, branch, error: `git switch failed: ${r.stderr}. Ask the person; do not stash and do not force.` };
  return { ok: true, branch, switched: true, created: !exists, from: exists ? null : trunk };
}
function requireListBranch(root, src) {
  const branch = listBranch(src);
  const cur = currentBranch(root);
  if (cur !== branch) throw new Error(`the walk's checkout is on ${cur ?? "a detached HEAD"}, not on the list branch ${branch}: run campaign.mjs land first`);
  return branch;
}
function landMigrated(root, src, packet) {
  const m = packet.migrated ?? {};
  const branch = m["from-branch"];
  if (!branch) return { ok: true, skipped: "no unit branch" };
  if (m.merged) return { ok: true, skipped: "already merged" };
  const wt = m.worktree && existsSync2(m.worktree) ? m.worktree : null;
  const steps = [];
  const list = listBranch(src);
  const waveBase = m["wave-base"];
  const needsRebase = m.land === "squashed" && Boolean(waveBase) && !(wt && isAncestor(wt, list, "HEAD"));
  if (needsRebase) {
    if (!wt) return { ok: false, error: `the unit ${packet.key} needs a rebase, and its worktree ${m.worktree ?? "(none)"} is gone. Ask the person.` };
    if (!Number(git(wt, ["rev-list", "--count", `${waveBase}..HEAD`]).stdout || 0)) {
      return { ok: false, error: `${branch} has no commit beyond the wave base ${waveBase}. Its work is in the wave base, which is not in the trunk, or it has no work yet. A rebase would bring nothing. Ask the person how to bring the work of ${packet.key} to ${list}.` };
    }
  }
  if (wt) {
    const dirty = dirtyOutsideAi(wt) ?? [];
    if (dirty.length) {
      const add = git(wt, ["add", "-A", "--", "."]);
      if (add.status !== 0) return { ok: false, error: `git add failed in ${wt}: ${add.stderr}` };
      git(wt, ["reset", "-q", "--", ".ai"]);
      const c = git(wt, ["commit", "-m", `wip(${packet["packet-slug"]}): migration snapshot`]);
      if (c.status !== 0 && !/nothing to commit/.test(c.stdout + c.stderr)) return { ok: false, error: `the snapshot commit failed in ${wt}: ${c.stderr || c.stdout}` };
      steps.push({ snapshot: dirty.length });
    }
  }
  if (needsRebase) {
    const ahead = Number(git(wt, ["rev-list", "--count", `${waveBase}..HEAD`]).stdout || 0);
    if (ahead > 1) {
      const backup = `campaign/${src}/backup--${packet["packet-slug"]}`;
      const bk = git(wt, ["branch", "-f", backup, "HEAD"]);
      if (bk.status !== 0) return { ok: false, error: `git branch ${backup} failed: ${bk.stderr}` };
      const fork = git(wt, ["merge-base", waveBase, "HEAD"]).stdout;
      git(wt, ["reset", "-q", "--soft", fork]);
      const c = git(wt, ["commit", "-q", "-m", `${packet["packet-slug"]}: the work of the old unit, in one commit for the migration (old commits on ${backup})`]);
      if (c.status !== 0) {
        git(wt, ["reset", "-q", "--soft", backup]);
        return { ok: false, error: `the one-commit step failed in ${wt}: ${c.stderr || c.stdout}` };
      }
      steps.push({ squashed: ahead, backup });
    }
    const r = git(wt, ["rebase", "--onto", list, waveBase]);
    if (r.status !== 0) {
      git(wt, ["rebase", "--abort"]);
      return { ok: false, conflict: "rebase", error: `the rebase of ${branch} onto ${list} stopped on a conflict: ${r.stderr || r.stdout}. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.` };
    }
    steps.push({ rebased: true });
  }
  const mg = git(root, ["merge", "--no-ff", "--no-edit", branch]);
  if (mg.status !== 0) {
    git(root, ["merge", "--abort"]);
    return { ok: false, conflict: "merge", error: `the merge of ${branch} into ${listBranch(src)} stopped on a conflict: ${mg.stderr || mg.stdout}. Ask the person to merge by hand, then start again.` };
  }
  steps.push({ merged: branch });
  setFields(packet.path, { migrated: { ...m, merged: true } });
  return { ok: true, steps };
}
function startCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is not a build packet` };
  if (packet.state === "written") return { ok: false, error: `${packet.key} is not open: run campaign.mjs open first` };
  if (["done", "dropped"].includes(packet.state)) return { ok: false, error: `${packet.key} is ${packet.state}` };
  requireListBranch(root, src);
  const trunk = trunkOf(root, f);
  let migration = null;
  if (packet.migrated) {
    migration = landMigrated(root, src, packet);
    if (!migration.ok) return { ok: false, key: packet.key, ...migration };
  }
  const before = packets.filter((p) => (p.order ?? 0) < (packet.order ?? 0) && BUILD_FORMS.includes(p.form) && p.state === "done").pop();
  let base = trunk;
  if (before) {
    const end = endBranch(src, before.key);
    if (commitOf(root, `refs/heads/${end}`) && isAncestor(root, end, "HEAD")) base = end;
  }
  const idx = join2(wfDir(root, packet["packet-slug"]), "00-index.md");
  if (!existsSync2(idx)) return { ok: false, error: `${posix2(relative(root, idx))} does not exist: run campaign.mjs open` };
  setFields(idx, { "base-branch": base, branch: listBranch(src), "updated-at": nowIso() });
  return { ok: true, key: packet.key, slug: packet["packet-slug"], base, ...migration ? { migration } : {} };
}
function builtCmd(root, src, [key]) {
  const { packet } = packetOf(root, src, key);
  if (packet.state !== "open" && packet.state !== "built") return { ok: false, error: `${packet.key} is ${packet.state}, not open` };
  setPacketState(packet, "built");
  return { ok: true, key: packet.key, state: "built" };
}
function reopenCmd(root, src, [key]) {
  const { packet } = packetOf(root, src, key);
  if (packet.state === "open") return { ok: true, key: packet.key, state: "open", changed: false };
  if (packet.state !== "built") return { ok: false, error: `${packet.key} is ${packet.state}; only a built packet opens again` };
  setPacketState(packet, "open");
  return { ok: true, key: packet.key, state: "open", changed: true };
}
function doneCmd(root, src, [key], f) {
  const { packet } = packetOf(root, src, key);
  if (packet.state !== "built") return { ok: false, error: `${packet.key} is ${packet.state}; done needs a built packet (a clean yolo run, then campaign.mjs built)` };
  const slug = packet["packet-slug"];
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { ok: false, error: `the slice(s) ${unbuilt.join(", ")} of ${slug} are not complete: run the driver again`, unbuilt };
  const fid = decisionFidelity(root, slug, (packet["carried-decisions"] ?? []).map((d) => d.key));
  if (!fid.table) return { ok: false, error: `${slug}/07-review.md has no ## Decision Fidelity table` };
  if (fid.missing.length) return { ok: false, error: `the ## Decision Fidelity table of ${slug} has no row for ${fid.missing.join(", ")}`, missing: fid.missing };
  if (fid.rows.length) return { ok: false, error: `${fid.rows.length} fidelity row(s) are not honored and not approved`, rows: fid.rows };
  if (packet["try-out"] === "yes" && !tryOutRecorded(root, slug)) return { ok: false, error: `the try-out of ${packet.key} is not recorded: po-answers.md needs "- try-out: works"` };
  requireListBranch(root, src);
  const trunk = trunkOf(root, f);
  const from = trunkRef(root, trunk);
  let merged = false;
  if (!isAncestor(root, from, "HEAD")) {
    const mg = git(root, ["merge", "--no-edit", from]);
    if (mg.status !== 0) {
      git(root, ["merge", "--abort"]);
      return { ok: false, conflict: "trunk", error: `the merge of ${from} into ${listBranch(src)} stopped on a conflict: ${mg.stderr || mg.stdout}. Ask the person to merge by hand, then run done again.` };
    }
    merged = true;
  }
  const end = endBranch(src, packet.key);
  const b = git(root, ["branch", "-f", end, "HEAD"]);
  if (b.status !== 0) return { ok: false, error: `git branch -f ${end} failed: ${b.stderr}` };
  setFields(join2(wfDir(root, slug), "00-index.md"), { "base-branch": trunk, "updated-at": nowIso() });
  setPacketState(packet, "done");
  let removed = null;
  if (packet.migrated?.worktree && existsSync2(packet.migrated.worktree)) removed = removeWorktree(root, src, packet.migrated.worktree, { unitKey: packet.migrated["unit-key"] ?? packet.key });
  return { ok: true, key: packet.key, state: "done", endBranch: end, trunkMerged: merged, ...removed ? { worktree: removed } : {} };
}
function closeCmd(root, src, [key, to]) {
  if (!["done", "dropped"].includes(to)) throw new Error("close: the state is done or dropped");
  const { packet } = packetOf(root, src, key);
  if (["done", "dropped"].includes(packet.state)) return { ok: true, key: packet.key, state: packet.state, changed: false };
  if (to === "done" && BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a build packet: it is done through built and done, after its yolo run and its fidelity read` };
  setPacketState(packet, to);
  const { path: boardPath, board } = boardOf(root, src);
  const onBoard = board?.work?.find((w) => w.key === packet.key);
  if (onBoard) {
    onBoard.state = to;
    writeFileSync2(boardPath, `${JSON.stringify(board, null, 2)}
`);
  }
  const wt = to === "dropped" && packet.migrated?.worktree && existsSync2(packet.migrated.worktree) ? packet.migrated.worktree : null;
  const worktree = wt ? removeWorktree(root, src, wt, { unitKey: packet.migrated["unit-key"] ?? packet.key }) : null;
  return { ok: true, key: packet.key, state: to, changed: true, board: Boolean(onBoard), ...worktree ? { worktree } : {} };
}
function sliceOrder(root, slug, [action], f) {
  if (action !== "add") throw new Error("slice-order: the action is add");
  const s = String(f.slice ?? "").trim();
  const t = String(f.after ?? "").trim();
  if (!s || !t || s === t) throw new Error("slice-order add: give --slice <slice> --after <another slice>");
  const dir = join2(root, ".ai", "workflows", slug);
  const rosterFile = join2(dir, "03-slice.md");
  if (!existsSync2(rosterFile)) return { ok: false, error: `slice-order: ${relative(root, rosterFile)} does not exist` };
  const text = readFileSync2(rosterFile, "utf8");
  const roster = rosterEntries(text);
  const entry = roster.find((e) => e.slug === s);
  if (!entry || !roster.some((e) => e.slug === t)) return { ok: false, error: `slice-order: ${!entry ? s : t} is not a slice of the roster of ${slug}` };
  if (entry.dependsOn.includes(t)) return { ok: true, slug, slice: s, after: t, added: false, walkOrder: rosterWalkOrder(roster).map((e) => e.slug) };
  if (closesCycle(roster, s, t)) return { ok: false, cycle: true, error: `slice-order: ${s} after ${t} closes a cycle, because ${t} already depends on ${s}` };
  const deps = [...entry.dependsOn, t];
  writeFileSync2(rosterFile, editRosterEntry(text, s, { "depends-on": deps }));
  const sliceFile = join2(dir, `03-slice-${s}.md`);
  if (existsSync2(sliceFile)) {
    const st = readFileSync2(sliceFile, "utf8");
    const have = frontmatterValue(st, "depends-on");
    const l = Array.isArray(have) ? have.map(String) : [];
    if (!l.includes(t)) writeFileSync2(sliceFile, setFrontmatterValue(st, "depends-on", [...l, t]) ?? st);
  }
  const why = String(f.why ?? "").trim();
  appendFileSync(join2(dir, "index-history.jsonl"), `${JSON.stringify({ at: nowIso(), kind: "note", text: `slice-order: '${s}' after '${t}'${why ? `: ${why}` : ""}`, stage: "plan" })}
`);
  const order = rosterWalkOrder(rosterEntries(readFileSync2(rosterFile, "utf8"))).map((e) => e.slug);
  const planFile = join2(dir, "04-plan.md");
  if (existsSync2(planFile)) {
    const pt = readFileSync2(planFile, "utf8");
    const next = setFrontmatterValue(pt, "implementation-order", order);
    if (next && next !== pt) writeFileSync2(planFile, next);
  }
  return { ok: true, slug, slice: s, after: t, added: true, dependsOn: deps, walkOrder: order };
}
function worktreeList(root) {
  const r = git(root, ["worktree", "list", "--porcelain"]);
  const out = [];
  let cur = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice(9) };
      out.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "detached") cur.detached = true;
  }
  return out;
}
var samePath = (a, b) => posix2(resolve(a)).toLowerCase() === posix2(resolve(b)).toLowerCase();
function isOldCampaignWorktree(entry, src) {
  if (entry.branch) return entry.branch.startsWith(`campaign/${src}/`);
  const p = posix2(entry.path);
  return Boolean(entry.detached) && /\/\.scratch\/campaign\//.test(p) && p.includes(src);
}
function linksIn(dir, limit = 5e3) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    if (found.length >= limit) return { links: found, complete: false };
    const d = stack.pop();
    let entries = [];
    try {
      entries = readdirSync2(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === ".git") continue;
      const p = join2(d, e.name);
      let st;
      try {
        st = lstatSync2(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) found.push(p);
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return { links: found, complete: true };
}
var REMOVABLE_IGNORED = ["build", "dist", "out", "target", ".gradle", ".next", ".kotlin", ".cxx", ".idea", ".vscode", "local.properties"];
function removeLink(p) {
  try {
    unlinkSync(p);
    return;
  } catch {
  }
  rmdirSync(p);
}
function manifestOf(root, src, unitKey) {
  for (const dir of [oldCampDir(root, src), archivedCampDir(root, src)]) {
    const file = join2(dir, "records", `${unitKey}.json`);
    if (existsSync2(file)) return { file, manifest: loadManifest(file, unitKey) };
  }
  return null;
}
function removeWorktree(root, src, path, { unitKey = null, allowIgnored = false, linkLimit = 5e3 } = {}) {
  const entry = worktreeList(root).find((w) => samePath(w.path, path));
  if (!entry) return { ok: false, path, error: `${path} is not a worktree of ${root}` };
  if (!isOldCampaignWorktree(entry, src)) return { ok: false, path, untouched: true, error: `${path} is not an old campaign worktree of ${src}; the migration does not touch it` };
  if (!existsSync2(path)) {
    git(root, ["worktree", "prune"]);
    return { ok: true, path, removed: true, pruned: true };
  }
  const dirty = dirtyOutsideAi(path);
  if (dirty === null) return { ok: false, path, error: `git status failed in ${path}` };
  if (dirty.length) return { ok: false, path, error: `${dirty.length} uncommitted change(s) outside .ai/; the worktree stays. Ask the person.`, dirty: dirty.slice(0, 20) };
  if (entry.detached && entry.head && !git(root, ["branch", "--all", "--contains", entry.head]).stdout) {
    return { ok: false, path, error: `the detached HEAD ${entry.head.slice(0, 12)} is on no branch; its commits would be lost. Ask the person.` };
  }
  if (existsSync2(join2(path, ".ai"))) {
    const m = unitKey ? manifestOf(root, src, unitKey) : null;
    const pending = recordsPending({ main: root, worktree: path, manifest: m?.manifest ?? { files: {} }, exclude: (rel) => rel === ".gitignore" });
    if (pending.length) return { ok: false, path, error: `${pending.length} record file(s) in the worktree exist nowhere else; the records sync did not bring them home. Ask the person.`, pending: pending.slice(0, 20) };
  }
  if (!allowIgnored) {
    const st = git(path, ["status", "--porcelain", "--ignored=matching"]);
    const risk = ignoredAtRisk(st.stdout, configOf(root)?.campaign?.isolation?.["build-dirs"] ?? REMOVABLE_IGNORED);
    if (risk.length) {
      return {
        ok: false,
        path,
        ignoredAtRisk: true,
        ignored: risk.slice(0, 20),
        error: "git worktree remove deletes these ignored files without asking, and they are not build output. Show them to the person. On a yes, run remove-worktree again with --allow-ignored."
      };
    }
  }
  const { links, complete } = linksIn(path, linkLimit);
  if (!complete) return { ok: false, path, error: `the worktree has more than ${linkLimit} links; a link after the limit could take the remove into its target. Ask the person.` };
  for (const l of links) removeLink(l);
  const r = git(root, ["worktree", "remove", path]);
  if (r.status !== 0) return { ok: false, path, linksRemoved: links.length, error: `git refused to remove ${path}: ${r.stderr}. Ask the person; do not force.` };
  return { ok: true, path, removed: true, linksRemoved: links.length };
}
function removeWorktreeCmd(root, src, [path], f) {
  if (!path) throw new Error("remove-worktree: give the worktree path");
  return removeWorktree(root, src, resolve(path), { allowIgnored: Boolean(f["allow-ignored"]) });
}
var STARTED_WAVE = /* @__PURE__ */ new Set(["running", "boundary", "handoff", "shipping", "stopped"]);
var STRAY_RE = /[{}<>]/;
function journalAgeMs(root, src, ledger = null) {
  let newest = 0;
  const seen = (file) => {
    try {
      newest = Math.max(newest, statSync2(file).mtimeMs);
    } catch {
    }
  };
  const dir = oldCampDir(root, src);
  for (const name of [".campaign-journal.jsonl", "ledger.json"]) seen(join2(dir, name));
  try {
    for (const name of readdirSync2(dir)) if (name.endsWith(".jsonl")) seen(join2(dir, name));
  } catch {
  }
  const started = new Set((ledger?.waves ?? []).filter((w) => STARTED_WAVE.has(w.state)).map((w) => w.n));
  for (const u of Object.values(ledger?.units ?? {})) {
    if (!started.has(u.wave)) continue;
    const slug = u.slug ?? u["work-slug"];
    if (!slug) continue;
    for (const base of [root, u.worktree?.path].filter(Boolean)) seen(join2(base, ".ai", "workflows", slug, ".driver-journal.jsonl"));
  }
  return newest ? Date.now() - newest : Infinity;
}
function prMerged(root, branch) {
  const r = spawnSync("gh", ["pr", "list", "--head", branch, "--state", "merged", "--json", "number", "--jq", ".[0].number"], { cwd: root, encoding: "utf8", windowsHide: true });
  const n = Number((r.stdout ?? "").trim());
  return r.status === 0 && Number.isInteger(n) && n > 0 ? n : null;
}
function landingOf(root, ledger, wave, trunk, isMerged = prMerged) {
  const base = wave.branch;
  if (!base || !commitOf(root, `refs/heads/${base}`)) return { land: "blocked", reason: `the wave base ${base ?? "(none)"} does not exist` };
  if (isAncestor(root, base, trunk)) return { land: "merged", waveBase: base };
  const earlier = (ledger.waves ?? []).filter((w) => w.n < wave.n && w.branch);
  const open = earlier.filter((w) => !isMerged(root, w.branch));
  if (open.length) return { land: "blocked", waveBase: base, reason: `wave PR(s) not merged: ${open.map((w) => `${w.n} (${w.branch})`).join(", ")}`, openWaves: open.map((w) => w.n) };
  return { land: "squashed", waveBase: base };
}
function migrationReport(root, src, f = {}, { isMerged = prMerged } = {}) {
  const ledger = readJson(join2(oldCampDir(root, src), "ledger.json"));
  if (!ledger?.units) return { ok: false, error: `no old campaign ledger in ${posix2(relative(root, oldCampDir(root, src)))}` };
  const trunk = ledger.trunk ?? trunkOf(root, f);
  const ageMs = journalAgeMs(root, src, ledger);
  const running = (ledger.waves ?? []).filter((w) => w.state === "running");
  const live = running.length > 0 && ageMs < 30 * 6e4;
  const waveOf = (n) => (ledger.waves ?? []).find((w) => w.n === n);
  const units = Object.entries(ledger.units).map(([key, u]) => ({ key, ...u }));
  const isShipped = (u) => u.state === "shipped" || waveOf(u.wave)?.state === "shipped";
  const shipped = units.filter(isShipped);
  const dropped = units.filter((u) => u.state === "dropped");
  const inflight = units.filter((u) => !isShipped(u) && u.state !== "dropped" && STARTED_WAVE.has(waveOf(u.wave)?.state));
  const notStarted = units.filter((u) => !shipped.includes(u) && !dropped.includes(u) && !inflight.includes(u));
  const groups = /* @__PURE__ */ new Map();
  for (const u of inflight) {
    const slug = u.slug ?? u["work-slug"] ?? u.key;
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(u);
  }
  const packets = [...groups.entries()].map(([slug, us]) => {
    const lead = us.find((u) => u.key === slug || (u["work-slug"] ?? u.key) === slug) ?? us.find((u) => u.worktree) ?? us[0];
    const wt = us.map((u) => u.worktree).find(Boolean) ?? null;
    const branch = wt?.branch ?? `campaign/${src}/wave-${lead.wave}--${slug}`;
    const wave = waveOf(lead.wave);
    const landing = landingOf(root, ledger, wave, trunk, isMerged);
    const dirty = wt && existsSync2(wt.path) ? dirtyOutsideAi(wt.path) ?? [] : [];
    const ahead = commitOf(root, `refs/heads/${branch}`) ? Number(git(root, ["rev-list", "--count", `${trunk}..${branch}`]).stdout || 0) : null;
    return {
      slug,
      lead: lead.key,
      units: us.map((u) => ({ key: u.key, state: u.state })),
      wave: lead.wave,
      branch,
      worktree: wt?.path ?? null,
      uncommitted: dirty.length,
      ahead,
      ...landing
    };
  });
  const inflightPaths = new Set(packets.map((p) => p.worktree).filter(Boolean).map((p) => posix2(resolve(p)).toLowerCase()));
  const worktrees = worktreeList(root).map((w) => {
    if (!isOldCampaignWorktree(w, src)) return { path: w.path, branch: w.branch ?? null, old: false };
    return { path: w.path, branch: w.branch ?? null, detached: Boolean(w.detached), old: true, inflight: inflightPaths.has(posix2(resolve(w.path)).toLowerCase()) };
  });
  const strays = [];
  const wfRoot = join2(root, ".ai", "workflows");
  try {
    for (const name of readdirSync2(wfRoot)) if (STRAY_RE.test(name)) strays.push(name);
  } catch {
  }
  return {
    ok: true,
    source: src,
    trunk,
    records: ledger.records ?? null,
    live,
    ledgerAgeMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 6e4) : null,
    shipped: shipped.map((u) => ({ key: u.key, slug: u.slug, wave: u.wave })),
    dropped: dropped.map((u) => u.key),
    inflight: packets,
    notStarted: notStarted.map((u) => ({ key: u.key, slug: u.slug, state: u.state, prepared: existsSync2(join2(wfDir(root, u.slug ?? u.key), "01-intake.md")), designSettled: u.slug ? !designBlock(root, u.slug) && existsSync2(join2(wfDir(root, u.slug), "02c-craft.md")) : false })),
    worktrees,
    strays,
    blocked: packets.filter((p) => p.land === "blocked")
  };
}
function renderMigration(rep) {
  const L = ["# Migration of the old campaign", "", `Written by \`campaign.mjs migrate report\` at ${nowIso()}. It changes no branch and deletes nothing (WF-PIECES-PLAN 12.2).`, ""];
  L.push(`- Trunk: \`${rep.trunk}\`. Records: ${rep.records === "local" ? "local (.ai/ is not tracked; the records sync brings them home)" : "tracked"}.`);
  L.push(`- Old wave run live: ${rep.live ? `YES (last ledger event ${rep.ledgerAgeMinutes} minutes ago): stop it first` : "no"}.`, "");
  L.push("## Shipped units (done packets)", "", ...rep.shipped.length ? rep.shipped.map((u) => `- \`${u.key}\` (wave ${u.wave})`) : ["- None."], "");
  L.push("## In-flight units (the first packets)", "");
  if (rep.inflight.length) {
    L.push("| Packet slug | Units | Branch | Worktree | Uncommitted | Ahead of trunk | Earlier waves |", "|---|---|---|---|---|---|---|");
    for (const p of rep.inflight) L.push(`| \`${p.slug}\` | ${p.units.map((u) => `${u.key} (${u.state})`).join(", ")} | \`${p.branch}\` | ${p.worktree ? `\`${posix2(p.worktree)}\`` : "\u2014"} | ${p.uncommitted} | ${p.ahead ?? "\u2014"} | ${p.land}${p.reason ? `: ${p.reason}` : ""} |`);
  } else L.push("- None.");
  L.push("", "## Units not started (the regroup)", "", ...rep.notStarted.length ? rep.notStarted.map((u) => `- \`${u.key}\` (${u.state}${u.prepared ? ", has intake and shape" : ""}${u.designSettled ? ", design settled" : ""})`) : ["- None."], "");
  L.push("## Worktrees", "");
  for (const w of rep.worktrees) L.push(`- \`${posix2(w.path)}\` ${w.branch ? `on \`${w.branch}\`` : "(detached)"}: ${!w.old ? "not an old campaign worktree; untouched" : w.inflight ? "an in-flight unit; removed at its packet done" : "removed at migrate finish, with the guarded remove"}`);
  L.push("", "## Stray folders", "", ...rep.strays.length ? rep.strays.map((s) => `- \`.ai/workflows/${s}/\` moves to \`work/archive/stray/\``) : ["- None."], "");
  return L.join("\n");
}
function boardOf(root, src) {
  const dir = sourceDir(root, src);
  const boardFile = boardFileOf(dir);
  return { path: join2(dir, boardFile), board: readJson(join2(dir, boardFile)), boardFile };
}
function migrateApply(root, src, f = {}, deps = {}) {
  const rep = migrationReport(root, src, f, deps);
  if (!rep.ok) return rep;
  if (rep.live) return { ok: false, error: `an old wave run is live (last ledger event ${rep.ledgerAgeMinutes} minutes ago). Stop it first.` };
  if (rep.blocked.length) return { ok: false, error: "the trunk does not hold the earlier waves of an in-flight unit. Merge the open wave PRs first.", blocked: rep.blocked };
  const ledger = readJson(join2(oldCampDir(root, src), "ledger.json"));
  const { path: boardPath, board } = boardOf(root, src);
  if (!board) return { ok: false, error: `no board in .ai/workflows/${src}` };
  const records = [];
  if (rep.records === "local") {
    const recDir = join2(oldCampDir(root, src), "records");
    for (const p of rep.inflight) {
      if (!p.worktree || !existsSync2(p.worktree)) continue;
      for (const u of p.units) {
        const file = join2(recDir, `${u.key}.json`);
        if (!existsSync2(file) && u.key !== p.lead) continue;
        const res = withRecordsLock(join2(recDir, ".lock"), u.key, () => {
          const manifest = loadManifest(file, u.key);
          const conflictsDir = join2(recDir, "conflicts", u.key, nowIso().replace(/[-:]/g, ""));
          const out = recordsOut({ main: root, worktree: p.worktree, manifest, conflictsDir, exclude: (rel) => rel === ".gitignore", mainOnly: (rel) => rel.startsWith(`workflows/${src}/work/campaign/`) || rel.startsWith("design/") });
          saveManifest(file, manifest, nowIso());
          return out;
        });
        records.push({ slug: p.slug, unit: u.key, copied: res.copied.length, conflicts: res.conflicts });
        break;
      }
    }
  }
  const work = board.work ?? [];
  const byKeyMap = new Map(work.map((w) => [w.key, w]));
  const shippedKeys = new Set(rep.shipped.map((u) => u.key));
  const order = [];
  for (const w of work) if (shippedKeys.has(w.key)) {
    w.state = "done";
    order.push(w);
  }
  const absorbed = [];
  for (const p of rep.inflight) {
    const lead = byKeyMap.get(p.lead) ?? work.find((w) => (w.slug ?? w.key) === p.slug);
    if (!lead) continue;
    for (const u of p.units) {
      if (u.key === lead.key) continue;
      const other = byKeyMap.get(u.key);
      if (!other) continue;
      lead.items = [.../* @__PURE__ */ new Set([...lead.items ?? [], ...other.items ?? []])];
      other.items = [];
      other.state = "dropped";
      other.was = `merged into ${lead.key} by the migration (one packet per workflow slug)`;
      absorbed.push(u.key);
    }
    lead.state = "open";
    lead.slug = p.slug;
    if (!BUILD_FORMS.includes(lead.shape)) lead.shape = "intake";
    lead.migrated = { "unit-key": p.lead, "from-branch": p.branch, worktree: p.worktree ? posix2(p.worktree) : null, "wave-base": p.waveBase ?? null, land: p.land };
    if (!lead["why-here"]) lead["why-here"] = `in flight in wave ${p.wave} of the old campaign`;
    order.push(lead);
  }
  for (const w of [...work].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))) if (!order.includes(w)) order.push(w);
  order.forEach((w, i) => {
    w.order = i + 1;
    if (w.order > 1 && !String(w["why-here"] ?? "").trim()) w["why-here"] = shippedKeys.has(w.key) ? "shipped in the old campaign" : "the order of the old campaign";
  });
  for (const w of work) if (w.state === "done" && !w["why-here"] && w.order > 1) w["why-here"] = "shipped in the old campaign";
  if (!board.stack && ledger.stack) board.stack = ledger.stack;
  board.work = order;
  const shape = validateBrainstormBoard(board);
  if (!shape.valid) return { ok: false, error: "the migrated board does not pass the board schema", errors: shape.errors.slice(0, 10), records };
  writeFileSync2(boardPath, `${JSON.stringify(board, null, 2)}
`);
  const indexes = [];
  for (const p of rep.inflight) {
    const idx = join2(wfDir(root, p.slug), "00-index.md");
    if (!existsSync2(idx)) {
      indexes.push({ slug: p.slug, error: "no 00-index.md in the main checkout after the records sync" });
      continue;
    }
    const lead = order.find((w) => w.slug === p.slug);
    setFields(idx, {
      "origin-packet": `.ai/workflows/${src}/work/${p.slug}.md`,
      branch: listBranch(src),
      "base-branch": rep.trunk,
      "branch-strategy": "dedicated",
      "workflow-type": "feature",
      "review-scope": "slug-wide",
      "review-scope-confirmed": true,
      "migrated-from": p.branch,
      ...p.waveBase ? { "wave-base": p.waveBase } : {},
      land: p.land,
      "updated-at": nowIso(),
      ...lead ? { "origin-items": [...new Set(lead.items ?? [])] } : {}
    });
    appendHistory(wfDir(root, p.slug), `campaign: migrated from the old unit branch ${p.branch} into the list ${src}`);
    indexes.push({ slug: p.slug, ok: true });
  }
  return { ok: true, source: src, records, absorbed, indexes, order: order.map((w) => ({ key: w.key, order: w.order, state: w.state })), next: "regroup the units that are not started with the person (12.4 or 12.6), then campaign.mjs write, then migrate finish" };
}
function migrateFinish(root, src) {
  const idx = readFm(join2(workDir(root, src), "index.md"));
  if (idx?.type !== "list") return { ok: false, error: "write the list first (campaign.mjs write)" };
  const rep = existsSync2(join2(oldCampDir(root, src), "ledger.json")) ? migrationReport(root, src) : null;
  const moved = [];
  if (existsSync2(oldCampDir(root, src))) {
    const dest = archivedCampDir(root, src);
    mkdirSync2(dirname2(dest), { recursive: true });
    renameSync2(oldCampDir(root, src), existsSync2(dest) ? `${dest}-${nowIso().replace(/[-:]/g, "")}` : dest);
    moved.push("work/campaign \u2192 work/archive/campaign");
  }
  const strays = [];
  const wfRoot = join2(root, ".ai", "workflows");
  try {
    for (const name of readdirSync2(wfRoot)) {
      if (!STRAY_RE.test(name)) continue;
      const dest = join2(workDir(root, src), "archive", "stray", name.replace(/[{}<>]/g, "_"));
      mkdirSync2(dirname2(dest), { recursive: true });
      const tracked = git(root, ["ls-files", "--", posix2(relative(root, join2(wfRoot, name)))]).stdout;
      if (tracked) git(root, ["mv", posix2(relative(root, join2(wfRoot, name))), posix2(relative(root, dest))]);
      else renameSync2(join2(wfRoot, name), dest);
      strays.push({ from: `.ai/workflows/${name}`, to: posix2(relative(root, dest)) });
    }
  } catch {
  }
  const dropped = new Set(readList(root, src).packets.filter((p) => p.state === "dropped").map((p) => p["packet-slug"]));
  const droppedPaths = new Set((rep?.inflight ?? []).filter((p) => p.worktree && dropped.has(p.slug)).map((p) => posix2(resolve(p.worktree)).toLowerCase()));
  const removed = [];
  for (const w of rep?.worktrees ?? []) {
    if (!w.old || w.inflight && !droppedPaths.has(posix2(resolve(w.path)).toLowerCase())) continue;
    removed.push(removeWorktree(root, src, w.path));
  }
  return { ok: true, source: src, moved, strays, worktrees: removed, refused: removed.filter((r) => !r.ok) };
}
function migrateCmd(root, src, [phase], f) {
  if (phase === "report") {
    const rep = migrationReport(root, src, f);
    if (!rep.ok) return rep;
    writeFileSync2(join2(workDir(root, src), "migration.md"), renderMigration(rep));
    return { ...rep, wrote: posix2(relative(root, join2(workDir(root, src), "migration.md"))) };
  }
  if (phase === "apply") return migrateApply(root, src, f);
  if (phase === "finish") return migrateFinish(root, src);
  throw new Error("migrate: the phase is report, apply or finish");
}
function flags(args) {
  const BOOLEAN = /* @__PURE__ */ new Set(["dry-run", "json", "allow-ignored"]);
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith("--") ? args[i].slice(2) : null;
    if (name && BOOLEAN.has(name)) f[name] = true;
    else if (name) {
      f[name] = args[i + 1];
      i++;
    } else pos.push(args[i]);
  }
  return { pos, f };
}
function dispatch(cmd, argv) {
  const { pos, f } = flags(argv);
  if (["check", "write", "archive"].includes(cmd)) {
    const [arg] = pos;
    if (!arg) return null;
    if (cmd === "check") return checkCmd(arg);
    if (cmd === "write") return writeCmd(arg, f);
    const { dir, boardFile } = resolveBoard(arg);
    if (!existsSync2(join2(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}` };
    return archiveCommand(dir, boardFile, { dryRun: Boolean(f["dry-run"]) });
  }
  const [rootArg, second, ...rest] = pos;
  if (!rootArg || !second) return null;
  const root = resolve(rootArg);
  switch (cmd) {
    case "status":
      return statusCmd(root, second);
    case "open":
      return openCmd(root, second, rest, f);
    case "land":
      return landCmd(root, second, f);
    case "start":
      return startCmd(root, second, rest, f);
    case "built":
      return builtCmd(root, second, rest);
    case "reopen":
      return reopenCmd(root, second, rest);
    case "done":
      return doneCmd(root, second, rest, f);
    case "close":
      return closeCmd(root, second, rest);
    // `slice-order <checkout> <slug> add`: the second argument is the slug.
    case "slice-order":
      return sliceOrder(root, second, rest, f);
    case "migrate":
      return migrateCmd(root, second, rest, f);
    case "remove-worktree":
      return removeWorktreeCmd(root, second, rest, f);
    default:
      return null;
  }
}
function run(argv) {
  const [cmd, ...rest] = argv;
  try {
    return cmd ? dispatch(cmd, rest) : null;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function main(argv = process.argv.slice(2)) {
  const out = run(argv);
  if (out === null) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}
`);
  return out.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
export {
  archiveCommand,
  decisionFidelity,
  designBlock,
  isOldCampaignWorktree,
  linksIn,
  main,
  migrateApply,
  migrateFinish,
  migrationReport,
  packetFolderFiles,
  removeWorktree,
  resolveBoard,
  run
};
