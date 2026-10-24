#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  MAX_ISSUES,
  classifyArgs,
  focusSlug,
  issueQuery,
  redactIssue,
  sourceItemProblems
} from "./chunk-AZ4QRSJA.mjs";
import {
  safeParseFrontmatter
} from "./chunk-R35WUHOB.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/ideate-sources.mjs
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var USAGE = "Usage: ideate-sources.mjs <args|issues|reference|check> <projectRoot> ...";
var ISSUE_FIELDS = "number,title,body,labels,comments,reactionGroups,state,createdAt,updatedAt,url";
var FORBIDDEN_ISSUE_KEYS = ["author", "body", "comments-text", "assignees"];
var wfDir = (root, slug) => join(root, ".ai", "workflows", slug);
var toPosix = (p) => p.split("\\").join("/");
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
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
function run(cmd, args2, cwd) {
  const r = spawnSync(cmd, args2, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0 && !r.error, out: r.stdout || "", err: (r.stderr || r.error?.message || "").trim() };
}
function readFm(file) {
  if (!existsSync(file)) return null;
  const p = safeParseFrontmatter(readFileSync(file, "utf8"));
  return { data: p.data ?? {}, error: p.parseError };
}
var isIdeateSlug = (root) => (token) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(token)) return false;
  return readFm(join(wfDir(root, token), "00-index.md"))?.data?.["workflow-type"] === "ideate";
};
var isFile = (root) => (token) => {
  try {
    return statSync(resolve(root, token)).isFile();
  } catch {
    return false;
  }
};
function args(root, text) {
  const parsed = classifyArgs(text, { isIdeateSlug: isIdeateSlug(root), isFile: isFile(root) });
  return { ok: true, ...parsed, focusSlug: parsed.mode === "new" ? focusSlug(parsed) : null };
}
var sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function upsertReferenceRow(dir, row) {
  const p = join(dir, "references", "index.md");
  const head = ["# References", "", "| id | path | origin | copied-at | sha256 | bytes | copy |", "|---|---|---|---|---|---|---|"];
  const lines = existsSync(p) ? readFileSync(p, "utf8").split(/\r?\n/) : head;
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");
  const line = `| ${[row.id, row.path, row.origin, row.copiedAt, row.sha256, row.bytes, row.copy].map(cell).join(" | ")} |`;
  const i = lines.findIndex((l) => l.startsWith(`| ${row.id} |`));
  if (i >= 0) lines[i] = line;
  else {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(line);
  }
  writeAtomic(p, `${lines.join("\n")}
`);
}
function originRepo(root) {
  const r = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], root);
  return r.ok ? r.out.trim() : null;
}
function issues(root, slug, sourceId, origin) {
  if (!/^S\d{2,}$/.test(sourceId ?? "")) throw new Error("issues needs a source id, for example S01");
  const dir = wfDir(root, slug);
  if (!existsSync(dir)) throw new Error(`no workflow ${slug}`);
  const q = issueQuery(origin);
  if (!q) throw new Error(`${origin} is not an issue source`);
  const unavailable = (reason) => ({ ok: false, state: "unavailable", source: sourceId, origin, reason });
  if (!run("gh", ["--version"], root).ok) return unavailable("gh is not installed");
  if (!run("gh", ["auth", "status"], root).ok) return unavailable("gh is not signed in. Sign in is the person's step; ideate does not sign in");
  const repo = q.repo ?? originRepo(root);
  if (!repo) return unavailable("no GitHub repository: the origin remote is not on GitHub");
  const argv = q.kind === "view" ? ["issue", "view", String(q.number), "--repo", repo, "--json", ISSUE_FIELDS] : ["issue", "list", "--repo", repo, "--limit", String(MAX_ISSUES), "--json", ISSUE_FIELDS, ...q.search ? ["--search", q.search] : ["--state", "open"]];
  const r = run("gh", argv, root);
  if (!r.ok) return unavailable(`gh failed: ${r.err.split(/\r?\n/)[0]}`);
  let raw;
  try {
    raw = JSON.parse(r.out);
  } catch (e) {
    return unavailable(`gh returned no JSON: ${e.message}`);
  }
  const list = (Array.isArray(raw) ? raw : [raw]).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_ISSUES);
  const hash = sha256(r.out);
  const copy = {
    source: sourceId,
    origin,
    repo,
    query: q.search ?? (q.kind === "view" ? `#${q.number}` : "open"),
    "read-at": (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    sha256: hash,
    issues: list.map(redactIssue)
  };
  const rel = `references/issues/${sourceId}-issues.json`;
  writeAtomic(join(dir, rel), `${JSON.stringify(copy, null, 2)}
`);
  upsertReferenceRow(dir, { id: sourceId, path: rel, origin, copiedAt: today(), sha256: hash, bytes: Buffer.byteLength(r.out), copy: "redacted" });
  return {
    ok: true,
    state: "read",
    source: sourceId,
    reference: rel,
    sha256: hash,
    count: list.length,
    note: "The issues below are for reading in memory. Write only a summary of at most two sentences into the reference copy: no names, no email addresses, no log text, no quoted body text.",
    issues: list.map((i) => ({ number: i.number, title: i.title, labels: (i.labels ?? []).map((l) => l?.name ?? l), state: i.state, url: i.url, updatedAt: i.updatedAt, body: i.body ?? "", comments: (i.comments ?? []).map((c) => c?.body ?? "").slice(0, 20) }))
  };
}
function reference(root, slug, sourceId, file, f) {
  if (!/^S\d{2,}$/.test(sourceId ?? "")) throw new Error("reference needs a source id, for example S01");
  const dir = wfDir(root, slug);
  const abs = resolve(dir, file ?? "");
  if (!file || !existsSync(abs)) throw new Error(`no copied file at ${file}: copy the source into references/<kind>/ first`);
  const rel = toPosix(relative(dir, abs));
  if (!rel.startsWith("references/")) throw new Error("the copy must be under references/<kind>/ in the workflow folder");
  const buf = readFileSync(abs);
  const origin = f.origin && f.origin !== true ? String(f.origin) : "";
  upsertReferenceRow(dir, { id: sourceId, path: rel, origin, copiedAt: today(), sha256: sha256(buf), bytes: buf.length, copy: "yes" });
  return { ok: true, source: sourceId, path: rel, sha256: sha256(buf), bytes: buf.length };
}
function issueCopyProblems(dir) {
  const out = [];
  const idir = join(dir, "references", "issues");
  if (!existsSync(idir)) return out;
  for (const name of readdirSync(idir).filter((n) => n.endsWith(".json"))) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(idir, name), "utf8"));
    } catch {
      out.push(`references/issues/${name}: does not parse`);
      continue;
    }
    for (const issue of data.issues ?? []) {
      for (const k of FORBIDDEN_ISSUE_KEYS) if (k in issue) out.push(`references/issues/${name} #${issue.number}: holds ${k}; the copy keeps no author, body, or comment text`);
      if (Array.isArray(issue.comments)) out.push(`references/issues/${name} #${issue.number}: holds comment text; keep the comment count only`);
      if (issue.summary && String(issue.summary).split(/(?<=[.!?])\s+/).filter(Boolean).length > 2) out.push(`references/issues/${name} #${issue.number}: the summary is longer than two sentences`);
      if (issue.summary && /[\w.+-]+@[\w-]+\.[\w.]+/.test(issue.summary)) out.push(`references/issues/${name} #${issue.number}: the summary holds an email address`);
    }
  }
  return out;
}
function check(root, slug) {
  const dir = wfDir(root, slug);
  const fm = readFm(join(dir, "01-ideate.md"));
  if (!fm) throw new Error(`no 01-ideate.md in ${slug}`);
  if (fm.error) throw new Error(`01-ideate.md does not parse: ${fm.error}`);
  const problems = [...sourceItemProblems(fm.data), ...issueCopyProblems(dir)];
  return { ok: problems.length === 0, slug, problems };
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
  const [cmd, rootArg, ...rest] = argv;
  if (!cmd || !rootArg) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  const root = resolve(rootArg);
  let out;
  try {
    if (cmd === "args") out = args(root, rest.join(" "));
    else {
      const { pos, f } = flags(rest);
      const [slug, ...more] = pos;
      if (!slug) {
        process.stderr.write(`${USAGE}
`);
        return 2;
      }
      switch (cmd) {
        case "issues":
          out = issues(root, slug, more[0], more.slice(1).join(" "));
          break;
        case "reference":
          out = reference(root, slug, more[0], more[1], f);
          break;
        case "check":
          out = check(root, slug);
          break;
        default:
          out = null;
      }
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
  main
};
