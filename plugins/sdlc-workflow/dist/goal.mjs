#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  optimizeStatus
} from "./chunk-HLUJZOLH.mjs";
import {
  designNeeded,
  designSettled
} from "./chunk-77MEJD36.mjs";
import {
  missingBoardFiles
} from "./chunk-6NAHF4FM.mjs";
import {
  safeParseFrontmatter
} from "./chunk-R35WUHOB.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/goal.mjs
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/goal.mjs
var KINDS = Object.freeze(["lifecycle", "optimize", "proofs"]);
var HOSTS = Object.freeze(["claude-code", "codex", "pi"]);
var STATES = Object.freeze(["armed", "met", "blocked", "cleared"]);
var VERDICTS = Object.freeze(["MET", "NOT-MET", "BLOCKED"]);
var DEFAULT_MAX_CHECKS = 30;
var CONDITION_LIMIT = 4e3;
var EVIDENCE_TAIL = 20;
var str = (v) => String(v ?? "").trim();
function contractErrors(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["the contract has no frontmatter"];
  if (!str(c.objective)) errors.push("objective is empty");
  if (!KINDS.includes(c.kind)) errors.push(`kind must be one of ${KINDS.join(", ")}`);
  if (c.kind === "proofs") {
    if (!Array.isArray(c.proofs) || !c.proofs.length || c.proofs.some((p) => !str(p))) errors.push("kind proofs needs at least one proof command");
  }
  const max = Number(c["max-checks"]);
  if (!Number.isInteger(max) || max < 1) errors.push("max-checks must be a positive integer");
  if (c.host !== void 0 && c.host !== null && !HOSTS.includes(c.host)) errors.push(`host must be one of ${HOSTS.join(", ")}`);
  if (c.state !== void 0 && !STATES.includes(c.state)) errors.push(`state must be one of ${STATES.join(", ")}`);
  return errors;
}
function goalLine(verdict, reason = "") {
  if (!VERDICTS.includes(verdict)) throw new Error(`unknown verdict ${verdict}`);
  const r = str(reason).replace(/\s+/g, " ");
  return verdict === "MET" || !r ? `GOAL: ${verdict}` : `GOAL: ${verdict} ${r}`;
}
var quotePath = (p) => `"${String(p).replace(/\\/g, "/")}"`;
function conditionText({ script, root, slug, maxChecks }) {
  const check2 = `node ${quotePath(script)} check ${quotePath(root)} ${slug}`;
  const text = `The goal is met only when the most recent output of \`${check2}\` in this conversation ends with the line \`GOAL: MET\`. If that line is \`GOAL: BLOCKED\`, the goal is impossible. A claim without that output is not evidence. Stop after ${maxChecks} checks.`;
  if (text.length > CONDITION_LIMIT) throw new Error(`the condition is ${text.length} characters, above the limit of ${CONDITION_LIMIT}`);
  return text;
}
function armPlan(host, condition) {
  if (host === "codex") {
    return {
      how: "create_goal",
      instruction: "Call the create_goal tool with the condition as the objective. Call update_goal to complete the goal only in a turn whose check printed GOAL: MET. When features.goals is off, tell the person to run `codex features enable goals`, then stop. /goal clear removes the goal.",
      condition
    };
  }
  if (host === "pi") {
    return { how: "in-session", instruction: "pi has no host goal. Run the auto loop in this session and run check after each stage.", condition };
  }
  return {
    how: "goal-command",
    command: `/goal ${condition}`,
    instruction: 'The model cannot type /goal. On Claude Code Desktop the mod submits the command after this turn. On the CLI, the mod puts it into the prompt box; when it cannot, the person pastes it. Headless: claude -p "/goal <condition>". /goal clear (or /clear) removes the goal.',
    condition
  };
}
function clearPlan(host) {
  if (host === "codex") return "Run /goal clear in Codex, or ask the model to stop the goal.";
  if (host === "pi") return "pi has no host goal: nothing more to clear.";
  return "Run /goal clear in Claude Code. /clear also removes the goal.";
}
function precheck(contract, count) {
  if (!contract) return { verdict: "BLOCKED", reason: "no goal contract: run /wf loop goal <slug> first" };
  if (contract.state === "cleared") return { verdict: "BLOCKED", reason: "the goal is cleared: run /wf loop goal <slug> resume to arm it again" };
  const parked = contract.parked;
  if (parked && str(parked.gate)) return { verdict: "BLOCKED", reason: `gate ${str(parked.gate)}${str(parked.reason) ? `: ${str(parked.reason)}` : ""}` };
  const max = Number(contract["max-checks"]) || DEFAULT_MAX_CHECKS;
  if (count + 1 > max) return { verdict: "BLOCKED", reason: `budget: ${max} checks used. Run /wf loop goal <slug> resume, with a new max-checks when more are needed` };
  return null;
}
function fromLifecycle(l) {
  if (l.verdict === "met") return { verdict: "MET", reason: "" };
  if (l.verdict === "blocked") return { verdict: "BLOCKED", reason: l.reason };
  const next = l.next ? `next: ${l.next.stage}${l.next.slice ? ` ${l.next.slice}` : ""}. ` : "";
  return { verdict: "NOT-MET", reason: `${next}${l.reason}` };
}
function fromOptimize(s) {
  if (!s || s.ok === false) return { verdict: "BLOCKED", reason: s?.error ? `optimize: ${s.error}` : "optimize: no state" };
  if (s.state === "complete" || s.state === "finished") return { verdict: "MET", reason: "" };
  if (s.state === "stopped") return { verdict: "BLOCKED", reason: `optimize stopped: ${s.reason}` };
  return { verdict: "NOT-MET", reason: `optimize: next ${s.next?.action ?? "trial"}${s.next?.on ? ` on ${s.next.on}` : ""}` };
}
function fromProofs(runs) {
  const failed = runs.filter((r) => r.code !== 0);
  if (!failed.length) return { verdict: "MET", reason: "" };
  return { verdict: "NOT-MET", reason: `${failed.length} of ${runs.length} proof(s) fail: ${failed.map((r) => r.command).join("; ")}` };
}
function renderGoalMd(c, prose = "") {
  const lines = ["---", "schema: sdlc/v1", "type: goal", `slug: ${JSON.stringify(c.slug)}`, `objective: ${JSON.stringify(c.objective)}`, `kind: ${c.kind}`];
  if (c.kind === "proofs") {
    lines.push("proofs:");
    for (const p of c.proofs) lines.push(`  - ${JSON.stringify(p)}`);
  }
  lines.push(`max-checks: ${c["max-checks"]}`);
  lines.push(`arming: ${c.arming ?? 0}`);
  lines.push(`armed-at: ${c["armed-at"] ? JSON.stringify(c["armed-at"]) : "null"}`);
  lines.push(`host: ${c.host ?? "claude-code"}`);
  lines.push(`state: ${c.state ?? "armed"}`);
  if (c.parked && str(c.parked.gate)) {
    lines.push("parked:");
    lines.push(`  gate: ${JSON.stringify(c.parked.gate)}`);
    lines.push(`  reason: ${JSON.stringify(c.parked.reason ?? "")}`);
    lines.push(`  at: ${JSON.stringify(c.parked.at ?? "")}`);
  } else {
    lines.push("parked: null");
  }
  lines.push("---", "");
  const body = str(prose) || `# Goal

${c.objective}

The worker follows skills/wf/reference/goal.md. Only \`goal.mjs check\` decides that the goal is met.`;
  return `${lines.join("\n")}
${body}
`;
}

// lib/lifecycle-done.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
var CHANGE_MODES = Object.freeze(["fix", "hotfix", "refactor"]);
var NOT_DRIVEN = Object.freeze({
  "update-deps": "/wf intake update-deps <slug>",
  task: "/wf intake task <slug>",
  audit: "/wf intake audit <slug>",
  brainstorm: "/wf intake brainstorm <slug>",
  investigate: "the pick recorded in 01-investigate.md",
  discover: "the verdict recorded in 01-discover.md",
  // A prototype is steered by the person, one round at a time (WF-PROTOTYPE-PLAN P4).
  prototype: "/wf loop prototype <slug> <request>, one round per request of the person"
});
var VERIFY_CLEAN_CONVERGENCE = Object.freeze(["not-needed", "converged"]);
var REVIEW_CLEAN_VERDICTS = Object.freeze(["ship", "ship-with-caveats"]);
var str2 = (v) => String(v ?? "").trim();
function verifyGate(fm) {
  if (!fm) return { state: "open", reason: "no verify artifact" };
  if (str2(fm.status) === "awaiting-input") return { state: "paused", reason: "verify is awaiting input" };
  if (str2(fm.convergence) === "escalated") return { state: "paused", reason: "verify escalated" };
  if (str2(fm.result) === "blocked-runtime-evidence-missing") return { state: "paused", reason: "verify is blocked: runtime evidence is missing" };
  if (VERIFY_CLEAN_CONVERGENCE.includes(str2(fm.convergence)) && str2(fm.result) === "pass") return { state: "clean" };
  return { state: "open", reason: `verify is not clean (convergence ${str2(fm.convergence) || "none"}, result ${str2(fm.result) || "none"})` };
}
function reviewGate(fm) {
  if (!fm) return { state: "open", reason: "no review artifact" };
  if (str2(fm.status) === "awaiting-input") return { state: "paused", reason: "review is awaiting input" };
  const blockers = Number(fm["metric-findings-blocker"] ?? 0);
  if (str2(fm.verdict) === "dont-ship") return { state: "paused", reason: "review verdict is dont-ship" };
  if (Number.isFinite(blockers) && blockers > 0) return { state: "paused", reason: `review has ${blockers} open blocker(s)` };
  if (REVIEW_CLEAN_VERDICTS.includes(str2(fm.verdict))) return { state: "clean" };
  return { state: "open", reason: `review is not clean (verdict ${str2(fm.verdict) || "none"})` };
}
var awaiting = (fm) => str2(fm?.status) === "awaiting-input";
function judgeLifecycle({ index, roster, artifact, design = { needed: false, settled: true } }) {
  const out = (verdict, reason, next = null, extra = {}) => ({ verdict, reason, next, suffixed: false, slices: [], ...extra });
  if (!index) return out("blocked", "no 00-index.md: start the workflow with /wf intake");
  const type = str2(index["workflow-type"]) || "standard";
  if (NOT_DRIVEN[type]) return out("blocked", `workflow-type ${type} has no build lifecycle to drive: ${NOT_DRIVEN[type]}`);
  const optimize = type === "optimize";
  const intake = artifact(optimize ? "01-optimize.md" : "01-intake.md");
  if (intake && awaiting(intake)) return out("blocked", "intake is awaiting input");
  if (optimize) {
    const spec = artifact("02-optimize-spec.md");
    if (!spec) return out("not-met", "no metric spec yet", { stage: "intake", slice: null });
    if (awaiting(spec) || str2(spec["confirmed-by"]) === "") return out("blocked", "the metric spec waits for the person to confirm it");
  } else {
    const shape = artifact("02-shape.md");
    if (!shape) return out("not-met", "no shape yet", { stage: "shape", slice: null });
    if (awaiting(shape)) return out("blocked", "shape is awaiting input");
    if (design.needed && !design.settled) return out("blocked", "the design is not settled: a person confirms it with /wf design <slug>");
  }
  const slices = (roster ?? []).filter((s) => s && str2(s.slug) && str2(s.status) !== "skipped").map((s) => str2(s.slug));
  if (!slices.length) {
    return optimize ? out("not-met", "the optimize loop has not finished", { stage: "optimize", slice: null }) : out("not-met", "no slice roster yet", { stage: "slice", slice: null });
  }
  const scope = str2(index["review-scope"]) === "slug-wide" ? "slug-wide" : "per-slice";
  const suffixed = !CHANGE_MODES.includes(type) && slices.some((s) => artifact(`03-slice-${s}.md`) !== null || artifact(`04-plan-${s}.md`) !== null);
  const file = (num, stage, s) => suffixed ? `${num}-${stage}-${s}.md` : `${num}-${stage}.md`;
  const rows = [];
  for (const s of slices) {
    const row = { slice: s, verify: null, review: null };
    rows.push(row);
    const plan = artifact(file("04", "plan", s));
    const impl = artifact(file("05", "implement", s));
    if (!optimize) {
      if (!plan) return out("not-met", `slice ${s} has no plan`, { stage: "plan", slice: s }, { suffixed, slices: rows });
      if (awaiting(plan)) return out("blocked", `the plan of slice ${s} is awaiting input`, null, { suffixed, slices: rows });
    }
    if (!impl) return out("not-met", `slice ${s} is not implemented`, { stage: optimize ? "optimize" : "implement", slice: s }, { suffixed, slices: rows });
    if (awaiting(impl)) return out("blocked", `the implement of slice ${s} is awaiting input`, null, { suffixed, slices: rows });
    const v = verifyGate(artifact(file("06", "verify", s)));
    row.verify = v.state;
    if (v.state === "paused") return out("blocked", `slice ${s}: ${v.reason}`, null, { suffixed, slices: rows });
    if (v.state === "open") return out("not-met", `slice ${s}: ${v.reason}`, { stage: "verify", slice: s }, { suffixed, slices: rows });
    if (scope === "per-slice") {
      const r = reviewGate(artifact(file("07", "review", s)));
      row.review = r.state;
      if (r.state === "paused") return out("blocked", `slice ${s}: ${r.reason}`, null, { suffixed, slices: rows });
      if (r.state === "open") return out("not-met", `slice ${s}: ${r.reason}`, { stage: "review", slice: s }, { suffixed, slices: rows });
    }
  }
  if (scope === "slug-wide") {
    const r = reviewGate(artifact("07-review.md"));
    if (r.state === "paused") return out("blocked", `slug-wide ${r.reason}`, null, { suffixed, slices: rows });
    if (r.state === "open") return out("not-met", `slug-wide ${r.reason}`, { stage: "review", slice: null }, { suffixed, slices: rows });
  }
  return out("met", `every slice is clean (${slices.length}); the next step is /wf handoff <slug>`, null, { suffixed, slices: rows });
}
function readRoster(workflowDir) {
  const file = join(workflowDir, "03-slice.md");
  if (!existsSync(file)) return null;
  const fm = safeParseFrontmatter(readFileSync(file, "utf8")).data;
  const list = Array.isArray(fm?.slices) ? fm.slices : [];
  return list.map((s) => typeof s === "string" ? { slug: s } : { slug: str2(s?.slug), status: str2(s?.status) });
}
function lifecycleDone(root, slug) {
  const dir = join(root, ".ai", "workflows", slug);
  const read = (name) => {
    const f = join(dir, name);
    if (!existsSync(f)) return null;
    return safeParseFrontmatter(readFileSync(f, "utf8")).data ?? {};
  };
  const index = read("00-index.md");
  const contract = read("02c-craft.md");
  let design = { needed: false, settled: true };
  if (index) {
    const needed = designNeeded(index, existsSync(join(dir, "02b-design.md")));
    design = { needed, settled: !needed || designSettled(index, contract, contract ? missingBoardFiles(dir, contract) : null) };
  }
  return judgeLifecycle({ index, roster: readRoster(dir), artifact: read, design });
}

// scripts/goal.mjs
var USAGE = "Usage: goal.mjs <arm|check|park|status|clear|lifecycle> <projectRoot> <slug> ...";
var PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
var WRAPPER = join2(PLUGIN_ROOT, "skills", "wf", "scripts", "goal.mjs");
var PROOF_TIMEOUT_MS = 30 * 6e4;
var wfDir = (root, slug) => join2(root, ".ai", "workflows", slug);
var goalPath = (root, slug) => join2(wfDir(root, slug), "goal.md");
var goalDir = (root, slug) => join2(wfDir(root, slug), "goal");
var checksPath = (root, slug) => join2(goalDir(root, slug), "checks.jsonl");
var armPath = (root, slug) => join2(goalDir(root, slug), "arm.json");
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
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
function readContract(root, slug) {
  const f = goalPath(root, slug);
  if (!existsSync2(f)) return null;
  const p = safeParseFrontmatter(readFileSync2(f, "utf8"));
  if (!p.data) throw new Error(`goal.md does not parse: ${p.parseError}`);
  return { ...p.data, prose: (p.content ?? "").trim() };
}
var saveContract = (root, slug, c) => writeAtomic(goalPath(root, slug), renderGoalMd({ ...c, slug }, c.prose));
function readChecks(root, slug) {
  const f = checksPath(root, slug);
  if (!existsSync2(f)) return [];
  return readFileSync2(f, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
var countOf = (checks, arming) => checks.filter((c) => c.arming === arming).length;
function indexOf(root, slug) {
  const f = join2(wfDir(root, slug), "00-index.md");
  return existsSync2(f) ? safeParseFrontmatter(readFileSync2(f, "utf8")).data : null;
}
function arm(root, slug, f) {
  if (!existsSync2(wfDir(root, slug))) throw new Error(`no workflow ${slug}: start it with /wf intake first`);
  const prior = readContract(root, slug);
  const index = indexOf(root, slug);
  const proofs = [].concat(f.proof ?? []).map(String).filter((p) => p.trim());
  const kind = f.kind ?? prior?.kind ?? (proofs.length ? "proofs" : index?.["workflow-type"] === "optimize" ? "optimize" : "lifecycle");
  const host = f.host ?? prior?.host ?? "claude-code";
  if (!HOSTS.includes(host)) throw new Error(`host must be one of ${HOSTS.join(", ")}`);
  const objective = String(f.objective ?? prior?.objective ?? "").trim() || (kind === "lifecycle" ? `Drive slug ${slug} to handoff-ready` : kind === "optimize" ? `Finish the optimize loop of slug ${slug}` : "");
  const c = {
    objective,
    kind,
    proofs: proofs.length ? proofs : prior?.proofs ?? [],
    "max-checks": Number(f["max-checks"] ?? prior?.["max-checks"] ?? DEFAULT_MAX_CHECKS),
    arming: Number(prior?.arming ?? 0) + 1,
    "armed-at": nowIso(),
    host,
    state: "armed",
    parked: null,
    prose: prior?.prose ?? ""
  };
  const errors = contractErrors(c);
  if (errors.length) return { ok: false, error: `the contract is not valid: ${errors.join("; ")}` };
  const condition = conditionText({ script: WRAPPER, root, slug, maxChecks: c["max-checks"] });
  saveContract(root, slug, c);
  const plan = armPlan(host, condition);
  writeAtomic(armPath(root, slug), `${JSON.stringify({ slug, host, arming: c.arming, condition, command: plan.command ?? null, requestedAt: c["armed-at"], state: "pending" }, null, 2)}
`);
  return { ok: true, resumed: !!prior, kind, host, arming: c.arming, maxChecks: c["max-checks"], condition, arm: plan, contract: "goal.md" };
}
function runProofs(root, proofs) {
  return proofs.map((command) => {
    const t0 = Date.now();
    const r = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", windowsHide: true, timeout: PROOF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ""}${r.stderr || ""}`.split(/\r?\n/).filter((l) => l.trim()).slice(-EVIDENCE_TAIL).join("\n");
    return { command, code: r.status ?? 1, ms: Date.now() - t0, out };
  });
}
function check(root, slug) {
  const lines = [];
  let contract;
  try {
    contract = readContract(root, slug);
  } catch (e) {
    contract = null;
    lines.push(e.message);
  }
  const checks = readChecks(root, slug);
  const arming = Number(contract?.arming ?? 0);
  const count = countOf(checks, arming);
  lines.push(`goal check ${count + 1} of ${contract?.["max-checks"] ?? "?"} for ${slug} (kind ${contract?.kind ?? "none"})`);
  let v = precheck(contract, count);
  if (!v) {
    if (contract.kind === "lifecycle") {
      const l = lifecycleDone(root, slug);
      for (const s of l.slices) lines.push(`  slice ${s.slice}: verify ${s.verify ?? "not run"}, review ${s.review ?? "not run here"}`);
      lines.push(`  lifecycle: ${l.verdict}: ${l.reason}`);
      v = fromLifecycle(l);
    } else if (contract.kind === "optimize") {
      let s;
      try {
        s = optimizeStatus(root, slug);
      } catch (e) {
        s = { ok: false, error: e.message };
      }
      lines.push(`  optimize: ${s.state ?? "error"}${s.reason ? ` (${s.reason})` : ""}${s.detail ? `: ${s.detail}` : ""}`);
      if (s.best) lines.push(`  best ${s.best.value} against the baseline ${s.baseline?.median}; trials ${s.counters?.trials} of ${s.budget?.trials}`);
      v = fromOptimize(s);
    } else {
      const runs = runProofs(root, contract.proofs);
      for (const r of runs) {
        lines.push(`  $ ${r.command}`, `  exit ${r.code} in ${Math.round(r.ms / 100) / 10}s`);
        if (r.out) lines.push(...r.out.split("\n").map((l) => `  | ${l}`));
      }
      v = fromProofs(runs);
    }
  }
  if (contract) {
    mkdirSync(goalDir(root, slug), { recursive: true });
    appendFileSync(checksPath(root, slug), `${JSON.stringify({ at: nowIso(), arming, n: count + 1, verdict: v.verdict, reason: v.reason })}
`);
    const next = v.verdict === "MET" ? "met" : v.verdict === "BLOCKED" ? "blocked" : contract.state;
    if (next !== contract.state && contract.state !== "cleared") saveContract(root, slug, { ...contract, state: next });
  }
  lines.push(goalLine(v.verdict, v.reason));
  return lines.join("\n");
}
function park(root, slug, gate, f) {
  if (!gate) throw new Error("park needs a gate id");
  const c = readContract(root, slug);
  if (!c) throw new Error("no goal contract: nothing to park");
  const parked = { gate: String(gate), reason: String(f.reason ?? "").trim(), at: nowIso() };
  saveContract(root, slug, { ...c, parked });
  return { ok: true, parked, next: "run check: it prints GOAL: BLOCKED, and the host goal ends. After the person answers, run /wf loop goal <slug> resume." };
}
function status(root, slug) {
  const c = readContract(root, slug);
  if (!c) return { ok: true, state: "none", note: "no goal contract" };
  const checks = readChecks(root, slug);
  const arming = Number(c.arming ?? 0);
  const mine = checks.filter((x) => x.arming === arming);
  const arm2 = existsSync2(armPath(root, slug)) ? JSON.parse(readFileSync2(armPath(root, slug), "utf8")) : null;
  return { ok: true, state: c.state, kind: c.kind, objective: c.objective, host: c.host, arming, checks: mine.length, maxChecks: c["max-checks"], last: mine.at(-1) ?? null, parked: c.parked ?? null, armRequest: arm2?.state ?? null };
}
function clear(root, slug) {
  const c = readContract(root, slug);
  if (!c) return { ok: true, state: "none", note: "no goal contract" };
  saveContract(root, slug, { ...c, state: "cleared" });
  if (existsSync2(armPath(root, slug))) {
    const a = JSON.parse(readFileSync2(armPath(root, slug), "utf8"));
    writeAtomic(armPath(root, slug), `${JSON.stringify({ ...a, state: "cleared" }, null, 2)}
`);
  }
  return { ok: true, state: "cleared", host: clearPlan(c.host) };
}
function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = rest[i + 1];
      const val = v === void 0 || v.startsWith("--") ? true : (i++, v);
      f[k] = f[k] === void 0 ? val : [].concat(f[k], val);
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
  if (cmd === "check") {
    process.stdout.write(`${check(root, slug)}
`);
    return 0;
  }
  let out;
  try {
    switch (cmd) {
      case "arm":
        out = arm(root, slug, f);
        break;
      case "park":
        out = park(root, slug, pos[0], f);
        break;
      case "status":
        out = status(root, slug);
        break;
      case "clear":
        out = clear(root, slug);
        break;
      case "lifecycle":
        out = { ok: true, ...lifecycleDone(root, slug) };
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
  main
};
