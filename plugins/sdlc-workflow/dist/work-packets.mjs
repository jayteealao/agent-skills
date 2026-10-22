#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  checkWorkSet,
  isStartedState,
  writeWorkSet
} from "./chunk-GR3BYJCI.mjs";
import "./chunk-GKIHU4J2.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/work-packets.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

// lib/brainstorm-archive.mjs
var SESSIONS_KEPT = 3;
var SUMMARY_WORD_CAP = 150;
var CLOSED_THREAD_STATES = /* @__PURE__ */ new Set(["routed", "dropped"]);
var DONE_PIECE_STATES = /* @__PURE__ */ new Set(["written"]);
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
    if (isStartedState(p.state) || DONE_PIECE_STATES.has(p.state)) continue;
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

// scripts/work-packets.mjs
var USAGE = "Usage: work-packets.mjs <check|write|archive> <workflow-dir|board-file> [--json] [--dry-run]";
function archiveCommand(dir, boardFile, { dryRun = false, now = null } = {}) {
  const boardPath = join(dir, boardFile);
  const board = JSON.parse(readFileSync(boardPath, "utf8"));
  const { board: kept, archived, count } = archiveBoard(board);
  const docPath = join(dir, "01-brainstorm.md");
  const warnings = existsSync(docPath) ? docCheck(readFileSync(docPath, "utf8")) : [];
  const result = { ok: true, moved: { items: archived.items.length, log: archived.log.length, stories: archived.stories.length }, warnings, dryRun };
  if (!count || dryRun) return result;
  const archiveDir = join(dir, "archive");
  const archivePath = join(archiveDir, "board.json");
  const prior = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, "utf8")) : null;
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(archivePath, `${JSON.stringify(mergeArchive(prior, archived), null, 2)}
`);
  const at = (now ?? /* @__PURE__ */ new Date()).toISOString();
  kept.archived = [...board.archived ?? [], { session: board.sessions ?? null, at, file: "archive/board.json", ...result.moved }];
  writeFileSync(boardPath, `${JSON.stringify(kept, null, 2)}
`);
  return result;
}
function resolveBoard(arg) {
  const abs = resolve(arg);
  if (abs.endsWith(".json")) return { dir: dirname(abs), boardFile: basename(abs) };
  for (const name of ["brainstorm-board.json", "ideate-work.json"]) {
    if (existsSync(join(abs, name))) return { dir: abs, boardFile: name };
  }
  return { dir: abs, boardFile: "brainstorm-board.json" };
}
function gitIgnoredCheck(projectRoot) {
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: projectRoot, encoding: "utf8" });
  if (probe.status !== 0) return null;
  const cache = /* @__PURE__ */ new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    const r = spawnSync("git", ["check-ignore", "-q", "--", path], { cwd: projectRoot, encoding: "utf8" });
    const ignored = r.status === 0;
    cache.set(path, ignored);
    return ignored;
  };
}
function projectRootOf(dir) {
  return resolve(dir, "..", "..", "..");
}
function main(argv = process.argv.slice(2), { log = console.log, now = null } = {}) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const [command, dirArg] = argv.filter((a) => !a.startsWith("--"));
  if (!["check", "write", "archive"].includes(command) || !dirArg) {
    log(USAGE);
    return 2;
  }
  const { dir, boardFile } = resolveBoard(dirArg);
  const boardPath = join(dir, boardFile);
  if (!existsSync(boardPath)) {
    log(`work-packets: no ${boardFile} in ${dir}`);
    return 2;
  }
  const isIgnored = gitIgnoredCheck(projectRootOf(dir));
  const json = flags.has("--json");
  if (command === "archive") {
    const result2 = archiveCommand(dir, boardFile, { dryRun: flags.has("--dry-run"), now });
    if (json) log(JSON.stringify(result2, null, 2));
    else {
      const m = result2.moved;
      log(`work-packets: ${result2.dryRun ? "would move" : "moved"} ${m.items} items, ${m.log} log entries, ${m.stories} stories to archive/board.json`);
      for (const w of result2.warnings) log(`warning: ${w}`);
    }
    return 0;
  }
  if (command === "check") {
    const board = JSON.parse(readFileSync(boardPath, "utf8"));
    const result2 = checkWorkSet(board, { isIgnored });
    if (json) log(JSON.stringify(result2, null, 2));
    else {
      for (const e of result2.errors) log(`error: ${e}`);
      for (const w of result2.warnings) log(`warning: ${w}`);
      if (!result2.errors.length) log(`work-packets: check passed (${result2.warnings.length} warnings)`);
    }
    return result2.errors.length ? 1 : 0;
  }
  const result = writeWorkSet(dir, { now, isIgnored, dryRun: flags.has("--dry-run"), boardFile });
  if (json) log(JSON.stringify(result, null, 2));
  else if (!result.ok) {
    for (const e of result.errors) log(`error: ${e}`);
    log("work-packets: nothing written. Fix the board, then run write again.");
  } else {
    log(`work-packets: work-revision ${result.revision}${result.unchanged ? " (unchanged)" : ""}`);
    for (const [label, list] of [["added", result.added], ["changed", result.changed], ["kept (started)", result.kept], ["cut", result.cut], ["pending cut", result.pendingCut], ["written in session", result.writtenNow]]) {
      if (list?.length) log(`  ${label}: ${list.join(", ")}`);
    }
    for (const w of result.warnings ?? []) log(`warning: ${w}`);
  }
  return result.ok ? 0 : 1;
}
var invoked = process.argv[1] && /work-packets\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));
if (invoked && !/skills\/wf\/scripts\//.test(process.argv[1].replace(/\\/g, "/"))) {
  process.exitCode = main();
}
export {
  archiveCommand,
  main,
  resolveBoard
};
