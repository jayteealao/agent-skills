#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  expand
} from "./chunk-OD4U4WLL.mjs";
import {
  DOC_FILE,
  LEDGER_FILE,
  MAX_COMMIT_FILE_BYTES,
  REPORT_FILE,
  SCRATCH_DIR,
  branchFor,
  buildReport,
  commitPlan,
  ledgerProblems,
  mediaKind,
  newLedger,
  openProofs,
  reportProblems
} from "./chunk-CI2GKFZ3.mjs";
import {
  validatePrototypeLedger
} from "./chunk-ZQSE2SVB.mjs";
import "./chunk-FZ2GR6GF.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/prototype.mjs
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var USAGE = "Usage: prototype.mjs <start|status|check|report|decide|exit|cleanup> <projectRoot> <slug> ...";
var PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
var toPosix = (p) => p.split("\\").join("/");
var wfRel = (slug) => `.ai/workflows/${slug}`;
function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || i >= 19) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}
function git(cwd, args) {
  const r = spawnSync("git", ["-c", "core.longpaths=true", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
var gitOk = (cwd, args, what) => {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`${what}: git ${args.join(" ")} failed: ${r.err || r.out}`);
  return r.out;
};
var samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
function mainCheckout(dir) {
  const list = worktrees(dir);
  return list[0]?.path ?? dir;
}
function worktrees(dir) {
  const r = git(dir, ["worktree", "list", "--porcelain"]);
  if (!r.ok) return [];
  const out = [];
  let cur = null;
  for (const line of r.out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: resolve(line.slice(9)), branch: null };
      out.push(cur);
    } else if (line.startsWith("branch ") && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
  }
  return out;
}
function locate(root, slug) {
  const ledgerIn = (dir) => existsSync(join(dir, wfRel(slug), LEDGER_FILE));
  if (ledgerIn(root)) return root;
  const list = worktrees(root);
  const branch = indexRow(mainCheckout(root), slug)?.branch || branchFor(slug);
  const byBranch = list.find((w) => w.branch === branch && ledgerIn(w.path));
  if (byBranch) return byBranch.path;
  const any = list.find((w) => ledgerIn(w.path));
  return any?.path ?? null;
}
function needWorktree(root, slug) {
  const wt = locate(root, slug);
  if (!wt) throw new Error(`no prototype ${slug}: start one with /wf loop prototype <idea>`);
  return wt;
}
var ledgerPath = (wt, slug) => join(wt, wfRel(slug), LEDGER_FILE);
function readLedger(wt, slug) {
  const p = ledgerPath(wt, slug);
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`${LEDGER_FILE} does not parse: ${e.message}`);
  }
}
var saveLedger = (wt, slug, ledger) => writeAtomic(ledgerPath(wt, slug), `${JSON.stringify(ledger, null, 2)}
`);
var INDEX_HEADER = "# .ai/workflows/INDEX.md \u2014 global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.";
function indexRow(main2, slug) {
  const p = join(main2, ".ai", "workflows", "INDEX.md");
  if (!existsSync(p)) return null;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const cols = line.split("	");
    if (cols[0] === slug) return { slug, status: cols[1], type: cols[2], branch: cols[3], updatedAt: cols[4] };
  }
  return null;
}
function upsertIndexRow(main2, { slug, status: status2, branch, at }) {
  const p = join(main2, ".ai", "workflows", "INDEX.md");
  const lines = existsSync(p) ? readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.length) : [INDEX_HEADER];
  const header = lines.filter((l) => l.startsWith("#"));
  const rows = lines.filter((l) => !l.startsWith("#") && l.split("	")[0] !== slug);
  rows.push([slug, status2, "prototype", branch, at].join("	"));
  rows.sort((a, b) => a.split("	")[0].localeCompare(b.split("	")[0]));
  writeAtomic(p, `${[...header.length ? header : [INDEX_HEADER], ...rows].join("\n")}
`);
}
function indexFile({ slug, idea, branch, baseBranch, worktree, status: status2, at, next }) {
  return [
    "---",
    "schema: sdlc/v1",
    "type: workflow-index",
    `slug: ${slug}`,
    `title: ${JSON.stringify(`Prototype: ${idea}`)}`,
    "workflow-type: prototype",
    "current-stage: prototype",
    `status: ${status2}`,
    "branch-strategy: dedicated",
    `branch: ${branch}`,
    `base-branch: ${baseBranch ?? "null"}`,
    `worktree: ${JSON.stringify(toPosix(worktree))}`,
    "open-questions: []",
    "next-command: wf-prototype",
    `next-invocation: ${JSON.stringify(next)}`,
    "progress:",
    `  prototype: ${status2 === "open" ? "in-progress" : status2}`,
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    "---",
    "",
    `# Prototype: ${idea}`,
    "",
    `The person steers this prototype one round at a time. The proof ledger is \`${LEDGER_FILE}\`; the accepted pipeline is \`${DOC_FILE}\`; the rolling report is \`${REPORT_FILE}\`.`,
    ""
  ].join("\n");
}
function docFile({ slug, idea, at }) {
  return [
    "---",
    "schema: sdlc/v1",
    "type: prototype",
    `slug: ${slug}`,
    `idea: ${JSON.stringify(idea)}`,
    "status: open",
    `ledger: ${LEDGER_FILE}`,
    `report: ${REPORT_FILE}`,
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    "---",
    "",
    `# ${idea}`,
    "",
    "## The accepted pipeline",
    "",
    "No component is accepted yet.",
    "",
    "## Known limits",
    "",
    "None recorded yet.",
    ""
  ].join("\n");
}
function setIndexStatus(wt, slug, status2, next) {
  const p = join(wt, wfRel(slug), "00-index.md");
  if (!existsSync(p)) return;
  let text = readFileSync(p, "utf8");
  const at = nowIso();
  text = text.replace(/^status: .*$/m, `status: ${status2}`).replace(/^ {2}prototype: .*$/m, `  prototype: ${status2 === "open" ? "in-progress" : status2}`).replace(/^updated-at: .*$/m, `updated-at: "${at}"`);
  if (next) text = text.replace(/^next-invocation: .*$/m, `next-invocation: ${JSON.stringify(next)}`);
  writeAtomic(p, text);
}
function start(root, slug, f) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`slug ${slug}: use lower-case words joined by dashes`);
  const idea = String(f.idea ?? "").trim();
  if (!idea || idea === "true") throw new Error(`start needs --idea "<the open question, in the person's words>"`);
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new Error("not a git repository: a prototype runs in a worktree on its own branch");
  const main2 = mainCheckout(resolve(top.out));
  if (existsSync(join(main2, wfRel(slug), "00-index.md"))) throw new Error(`.ai/workflows/${slug} exists in the main checkout: pick another slug`);
  const existing = locate(main2, slug);
  if (existing) return { ok: true, resumed: true, slug, worktree: existing, ...summary(existing, slug) };
  const branch = String(f.branch && f.branch !== true ? f.branch : branchFor(slug));
  const baseBranch = f.base && f.base !== true ? String(f.base) : git(main2, ["rev-parse", "--abbrev-ref", "HEAD"]).out || null;
  const wt = f.worktree && f.worktree !== true ? resolve(main2, String(f.worktree)) : join(dirname(main2), `${basename(main2)}.poc`, slug);
  if (existsSync(wt)) throw new Error(`the worktree path ${wt} exists: name another with --worktree`);
  const local = git(main2, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok;
  const remote = !local && git(main2, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).ok;
  mkdirSync(dirname(wt), { recursive: true });
  if (local) gitOk(main2, ["worktree", "add", "-q", wt, branch], "worktree add");
  else if (remote) gitOk(main2, ["worktree", "add", "-q", "-b", branch, wt, `origin/${branch}`], "worktree add");
  else gitOk(main2, ["worktree", "add", "-q", "-b", branch, wt, baseBranch || "HEAD"], "worktree add");
  const at = nowIso();
  const dir = join(wt, wfRel(slug));
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(wt, SCRATCH_DIR), { recursive: true });
  if (!existsSync(join(wt, ".scratch", ".gitignore"))) writeFileSync(join(wt, ".scratch", ".gitignore"), "*\n");
  const next = `/wf loop prototype ${slug} <request>`;
  if (!existsSync(join(dir, "00-index.md"))) writeFileSync(join(dir, "00-index.md"), indexFile({ slug, idea, branch, baseBranch, worktree: wt, status: "open", at, next }));
  if (!existsSync(ledgerPath(wt, slug))) saveLedger(wt, slug, newLedger({ slug, idea, branch, baseBranch, worktree: toPosix(wt), at }));
  if (!existsSync(join(dir, DOC_FILE))) writeFileSync(join(dir, DOC_FILE), docFile({ slug, idea, at }));
  upsertIndexRow(main2, { slug, status: "open", branch, at });
  return { ok: true, resumed: false, slug, branch, reusedBranch: local || remote, baseBranch, worktree: wt, workflowDir: dir, scratch: join(wt, SCRATCH_DIR), next };
}
function problemsOf(wt, slug, ledger) {
  const schema = validatePrototypeLedger(ledger);
  const problems = schema.valid ? [] : schema.errors.map((e) => `${e.path || "/"}: ${e.message}`);
  problems.push(...ledgerProblems(ledger));
  for (const p of ledger.proofs ?? []) {
    for (const file of [...p.files ?? [], ...p.media ?? []]) {
      if (!existsSync(join(wt, file))) problems.push(`proof ${p.id}: file ${file} does not exist in the worktree`);
    }
  }
  return problems;
}
function summary(wt, slug) {
  const ledger = readLedger(wt, slug);
  const rounds = ledger.rounds ?? [];
  const reportAbs = join(wt, wfRel(slug), REPORT_FILE);
  const tracked = new Set(git(wt, ["ls-files", "--", wfRel(slug)]).out.split(/\r?\n/).filter(Boolean));
  const recorded = [.../* @__PURE__ */ new Set([...(ledger.proofs ?? []).flatMap((p) => p.files ?? []), ...rounds.flatMap((r) => r.files ?? [])])];
  return {
    status: ledger.status,
    branch: ledger.branch,
    rounds: rounds.length,
    lastRound: rounds[rounds.length - 1] ?? null,
    pipeline: ledger.pipeline ?? [],
    decisions: (ledger.decisions ?? []).map((d) => ({ id: d.id, component: d.component, generalized: d.generalized === true, commit: d.commit ?? null })),
    openProofs: openProofs(ledger).map((p) => ({ id: p.id, question: p.question, verdict: p.verdict })),
    report: { file: reportAbs, exists: existsSync(reportAbs), url: ledger.report?.url ?? null },
    uncommitted: recorded.filter((p) => !git(wt, ["ls-files", "--error-unmatch", "--", p]).ok).slice(0, 50),
    recordsTracked: tracked.size > 0,
    problems: problemsOf(wt, slug, ledger)
  };
}
function status(root, slug) {
  const wt = needWorktree(root, slug);
  return { ok: true, slug, worktree: wt, ...summary(wt, slug) };
}
function check(root, slug) {
  const wt = needWorktree(root, slug);
  const problems = problemsOf(wt, slug, readLedger(wt, slug));
  return { ok: problems.length === 0, slug, worktree: wt, problems };
}
function mediaReader(wt) {
  return (p) => {
    const abs = join(wt, p);
    if (!existsSync(abs)) return { exists: false };
    const kind = mediaKind(p);
    if (kind.kind !== "image") return { exists: true };
    const buf = readFileSync(abs);
    return { exists: true, bytes: buf.length, dataUri: `data:${kind.mime};base64,${buf.toString("base64")}` };
  };
}
function buildAndWrite(wt, slug) {
  const ledger = readLedger(wt, slug);
  const docPath = join(wt, wfRel(slug), DOC_FILE);
  const doc = existsSync(docPath) ? safeParseFrontmatter(readFileSync(docPath, "utf8")).content ?? "" : "";
  const html = buildReport(ledger, {
    expand: (h) => expand(h, { componentsRoot: join(PLUGIN_ROOT, "components"), maxDepth: 4 }),
    mediaFor: mediaReader(wt),
    doc
  });
  const file = join(wt, wfRel(slug), REPORT_FILE);
  writeAtomic(file, html);
  const { bytes, problems } = reportProblems(html);
  const heaviest = (ledger.proofs ?? []).flatMap((p) => p.media ?? []).filter((m) => existsSync(join(wt, m))).map((m) => ({ path: m, bytes: statSync(join(wt, m)).size })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  return { file, bytes, problems, heaviest, url: ledger.report?.url ?? null };
}
function report(root, slug) {
  const wt = needWorktree(root, slug);
  const r = buildAndWrite(wt, slug);
  return { ok: r.problems.length === 0, slug, worktree: wt, ...r };
}
function decide(root, slug, decisionId, f) {
  if (!decisionId) throw new Error("decide needs the decision id, for example D-01");
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const problems = problemsOf(wt, slug, ledger);
  if (problems.length) return { ok: false, slug, error: "the ledger has problems: repair them before the commit", problems };
  const plan = commitPlan(ledger, decisionId, wfRel(slug));
  if (plan.error) return { ok: false, slug, error: plan.error };
  const built = buildAndWrite(wt, slug);
  const refused = [];
  for (const p of plan.paths) {
    const abs = join(wt, p);
    if (!existsSync(abs)) {
      refused.push(`${p}: does not exist`);
      continue;
    }
    if (git(wt, ["check-ignore", "-q", "--", p]).ok) refused.push(`${p}: git ignores it`);
    else if (statSync(abs).isFile() && statSync(abs).size > MAX_COMMIT_FILE_BYTES) refused.push(`${p}: ${statSync(abs).size} bytes, over ${MAX_COMMIT_FILE_BYTES}; a large file stays out of the commit`);
  }
  if (refused.length) return { ok: false, slug, error: "some paths cannot be committed: remove them from the proof files, or fix them", refused };
  const before = git(wt, ["diff", "--cached", "--name-only"]).out.split(/\r?\n/).filter(Boolean).map(toPosix);
  const extra = before.filter((p) => !plan.paths.includes(p));
  if (extra.length) return { ok: false, slug, error: "the index already holds staged files that this decision does not name: unstage them first", staged: extra };
  gitOk(wt, ["add", "--", ...plan.paths], "stage");
  const message = f.message && f.message !== true ? `${plan.message}

${f.message}` : plan.message;
  const staged = git(wt, ["diff", "--cached", "--name-only"]).out.split(/\r?\n/).filter(Boolean);
  if (!staged.length) return { ok: false, slug, error: "nothing changed since the last commit: there is nothing to commit" };
  gitOk(wt, ["commit", "-q", "-m", message], "commit");
  const sha = gitOk(wt, ["rev-parse", "HEAD"], "rev-parse");
  const after = readLedger(wt, slug);
  const d = after.decisions.find((x) => x.id === decisionId);
  d.commit = sha;
  after["updated-at"] = nowIso();
  saveLedger(wt, slug, after);
  return { ok: true, slug, worktree: wt, commit: sha, message: plan.message, paths: staged, skipped: plan.skipped, warning: plan.warning, report: { bytes: built.bytes, problems: built.problems } };
}
function exitPrototype(root, slug, how) {
  if (!["park", "graduate", "close"].includes(how)) throw new Error("exit needs park, graduate, or close");
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const statusOf = { park: "parked", graduate: "graduated", close: "closed" }[how];
  ledger.status = statusOf;
  ledger["updated-at"] = nowIso();
  saveLedger(wt, slug, ledger);
  const next = how === "graduate" ? `/wf intake ${ledger.idea} from ${slug}` : how === "close" ? `/wf intake ${slug} close` : `/wf loop prototype ${slug} <request>`;
  setIndexStatus(wt, slug, statusOf, next);
  upsertIndexRow(mainCheckout(wt), { slug, status: statusOf, branch: ledger.branch, at: ledger["updated-at"] });
  const out = { ok: true, slug, status: statusOf, worktree: wt, branch: ledger.branch, next };
  if (how === "graduate") out.brief = join(wt, wfRel(slug), DOC_FILE);
  if (how === "close") out.links = linksUnder(wt);
  return out;
}
function linksUnder(dir, limit = 20, maxDirs = 2e4) {
  const found = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length && found.length < limit && seen < maxDirs) {
    const d = stack.pop();
    seen++;
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === ".git") continue;
      const p = join(d, e.name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) found.push(toPosix(relative(dir, p)));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}
function cleanup(root, slug) {
  const wt = needWorktree(root, slug);
  const main2 = mainCheckout(wt);
  if (samePath(wt, main2)) throw new Error("the prototype runs in the main checkout: there is no worktree to remove");
  const ledger = readLedger(wt, slug);
  if (ledger.status !== "closed") return { ok: false, slug, error: `the prototype is ${ledger.status}: the person closes it first (exit close)` };
  const links = linksUnder(wt);
  if (links.length) return { ok: false, slug, links, error: `the worktree holds links (${links.slice(0, 3).join(", ")}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
  const r = git(main2, ["worktree", "remove", wt]);
  if (!r.ok) return { ok: false, slug, error: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
  return { ok: true, slug, removed: wt, kept: ledger.branch };
}
function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = rest[i + 1];
      if (v === void 0 || v.startsWith("--")) f[k] = true;
      else {
        f[k] = v;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, f };
}
function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, slug, ...rest] = argv;
  if (!cmd || !rootArg || !slug) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case "start":
        out = start(root, slug, f);
        break;
      case "status":
        out = status(root, slug);
        break;
      case "check":
        out = check(root, slug);
        break;
      case "report":
        out = report(root, slug);
        break;
      case "decide":
        out = decide(root, slug, pos[0], f);
        break;
      case "exit":
        out = exitPrototype(root, slug, pos[0]);
        break;
      case "cleanup":
        out = cleanup(root, slug);
        break;
      default:
        out = null;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
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
  PLUGIN_ROOT,
  main
};
