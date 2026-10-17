import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";

// scripts/optimize.mjs
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/optimize.mjs
var SPEC_FILE = "02-optimize-spec.md";
var STATE_VERSION = 1;
var DIRECTIONS = Object.freeze(["lower", "higher"]);
var VERDICTS = Object.freeze(["kept", "reverted", "rejected", "crashed", "timeout"]);
var DIGEST_TRIALS = 20;
var DEFAULT_SPEC = Object.freeze({
  repeat: 5,
  "min-gain": "2%",
  budget: { trials: 60, plateau: 8, "wall-clock": "6h", tokens: null, "trial-timeout": "10m" },
  "branch-rounds": { at: ["0%", "33%", "66%"], branches: 4, "branch-trials": null, "max-extra": 2 },
  width: 1,
  "checkpoint-every": 5
});
var str = (v) => String(v ?? "").trim();
var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function parseDuration(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v === "number") return v;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(str(v));
  if (!m) return NaN;
  const n = Number(m[1]);
  return Math.round(n * { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2].toLowerCase()]);
}
function parseAmount(v) {
  if (v === null || v === void 0 || v === "") return { absolute: 0 };
  if (typeof v === "number") return { absolute: v };
  const s = str(v);
  const p = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (p) return { percent: Number(p[1]) };
  const n = Number(s);
  return Number.isFinite(n) ? { absolute: n } : { invalid: s };
}
var amountOf = (a, ref) => a.percent !== void 0 ? Math.abs(ref) * (a.percent / 100) : a.absolute ?? 0;
function fraction(v) {
  const a = parseAmount(v);
  if (a.percent !== void 0) return a.percent / 100;
  if (a.absolute !== void 0 && a.absolute >= 0 && a.absolute <= 1) return a.absolute;
  return NaN;
}
var defaultBranchTrials = (trials) => Math.max(3, Math.floor(0.06 * trials));
function parseSpec(fm) {
  const errors = [];
  if (!isObj(fm)) return { spec: null, errors: ["the spec has no frontmatter"] };
  const metric = isObj(fm.metric) ? fm.metric : {};
  if (!str(fm.objective)) errors.push("objective is empty");
  if (!str(metric.command)) errors.push("metric.command is empty");
  const direction = str(metric.direction) || "lower";
  if (!DIRECTIONS.includes(direction)) errors.push("metric.direction must be lower or higher");
  const repeat = Number(metric.repeat ?? DEFAULT_SPEC.repeat);
  if (!Number.isInteger(repeat) || repeat < 1) errors.push("metric.repeat must be a positive integer");
  const minGain = parseAmount(metric["min-gain"] ?? DEFAULT_SPEC["min-gain"]);
  if (minGain.invalid) errors.push(`metric.min-gain does not parse: ${minGain.invalid}`);
  const target = metric.target === null || metric.target === void 0 || metric.target === "" ? null : Number(metric.target);
  if (target !== null && !Number.isFinite(target)) errors.push("metric.target must be a number or null");
  const guard = isObj(fm.guard) ? fm.guard : {};
  if (!str(guard.command)) errors.push("guard.command is empty: a loop needs a guard that must pass after every trial");
  const holdout = isObj(fm.holdout) && str(fm.holdout.command) ? fm.holdout : null;
  const tolerance = parseAmount(holdout?.tolerance ?? "1%");
  const allowed = Array.isArray(fm["allowed-paths"]) ? fm["allowed-paths"].map(str).filter(Boolean) : [];
  if (!allowed.length) errors.push("allowed-paths is empty");
  const offLimits = Array.isArray(fm["off-limits"]) ? fm["off-limits"].map(str).filter(Boolean) : [];
  const b = { ...DEFAULT_SPEC.budget, ...isObj(fm.budget) ? fm.budget : {} };
  const trials = Number(b.trials);
  if (!Number.isInteger(trials) || trials < 1) errors.push("budget.trials must be a positive integer");
  const plateau = Number(b.plateau);
  if (!Number.isInteger(plateau) || plateau < 1) errors.push("budget.plateau must be a positive integer");
  const wallClock = parseDuration(b["wall-clock"]);
  if (Number.isNaN(wallClock)) errors.push("budget.wall-clock does not parse (use 90s, 10m, 6h or 2d)");
  const trialTimeout = parseDuration(b["trial-timeout"]);
  if (Number.isNaN(trialTimeout) || trialTimeout === null) errors.push("budget.trial-timeout does not parse");
  const tokens = b.tokens === null || b.tokens === void 0 || b.tokens === "" ? null : Number(b.tokens);
  if (tokens !== null && !(tokens > 0)) errors.push("budget.tokens must be a positive number or null");
  const rRaw = { ...DEFAULT_SPEC["branch-rounds"], ...isObj(fm["branch-rounds"]) ? fm["branch-rounds"] : {} };
  const at = (Array.isArray(rRaw.at) ? rRaw.at : []).map(fraction);
  if (at.some((x) => Number.isNaN(x) || x < 0 || x >= 1)) errors.push("branch-rounds.at must hold shares from 0% to below 100%");
  const branches = Number(rRaw.branches);
  if (!Number.isInteger(branches) || branches < 2) errors.push("branch-rounds.branches must be an integer of 2 or more");
  const branchTrials = rRaw["branch-trials"] === null || rRaw["branch-trials"] === void 0 ? defaultBranchTrials(trials || 0) : Number(rRaw["branch-trials"]);
  if (!Number.isInteger(branchTrials) || branchTrials < 1) errors.push("branch-rounds.branch-trials must be a positive integer");
  const maxExtra = Number(rRaw["max-extra"]);
  if (!Number.isInteger(maxExtra) || maxExtra < 0) errors.push("branch-rounds.max-extra must be an integer of 0 or more");
  const width = Number(fm.width ?? DEFAULT_SPEC.width);
  if (!Number.isInteger(width) || width < 1) errors.push("width must be a positive integer");
  const checkpointEvery = Number(fm["checkpoint-every"] ?? DEFAULT_SPEC["checkpoint-every"]);
  if (!Number.isInteger(checkpointEvery) || checkpointEvery < 1) errors.push("checkpoint-every must be a positive integer");
  const spec = {
    objective: str(fm.objective),
    metric: { command: str(metric.command), key: str(metric.key) || null, direction, unit: str(metric.unit), target, repeat, minGain },
    guard: { command: str(guard.command) },
    holdout: holdout ? { command: str(holdout.command), tolerance, direction: DIRECTIONS.includes(str(holdout.direction)) ? str(holdout.direction) : direction } : null,
    setup: str(fm.setup) || null,
    allowedPaths: allowed,
    offLimits,
    budget: { trials, plateau, wallClockMs: wallClock, tokens, trialTimeoutMs: trialTimeout },
    rounds: { at: [...at].sort((x, y) => x - y), branches, branchTrials, maxExtra },
    width,
    checkpointEvery,
    worktree: str(fm.worktree) || null,
    tags: Array.isArray(fm.tags) ? fm.tags.map(str).filter(Boolean) : [],
    confirmedBy: str(fm["confirmed-by"]) || null
  };
  return { spec, errors };
}
function parseMetricLine(stdout, key = null) {
  const lines = String(stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last === void 0) return null;
  if (key) {
    try {
      const o = JSON.parse(last);
      const v = key.split(".").reduce((acc, k) => acc && typeof acc === "object" ? acc[k] : void 0, o);
      const n2 = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n2) ? n2 : null;
    } catch {
      return null;
    }
  }
  const n = Number(last);
  return Number.isFinite(n) && last !== "" ? n : null;
}
function median(values) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function noiseOf(values) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return 0;
  return (Math.max(...v) - Math.min(...v)) / 2;
}
var gainOf = (direction, best, value) => direction === "lower" ? best - value : value - best;
var isBetter = (direction, a, b) => gainOf(direction, b, a) > 0;
function keepThreshold(spec, best, noise) {
  return Math.max(amountOf(spec.metric.minGain, best), 2 * noise);
}
function keepDecision({ spec, best, noise, first, confirm = null }) {
  const threshold = keepThreshold(spec, best, noise);
  const wins = first !== null && gainOf(spec.metric.direction, best, first) > threshold;
  if (!wins) return { wins, kept: false, needConfirm: false, threshold };
  if (confirm === null) return { wins, kept: false, needConfirm: true, threshold };
  return { wins, kept: gainOf(spec.metric.direction, best, confirm) > threshold, needConfirm: false, threshold };
}
var reachesTarget = (spec, value) => spec.metric.target !== null && value !== null && (spec.metric.direction === "lower" ? value <= spec.metric.target : value >= spec.metric.target);
function globToRegExp(glob) {
  let re = "";
  const g = str(glob).replace(/\\/g, "/").replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  if (!/[*?]/.test(g) && !/\.[^/]+$/.test(g)) re += "(?:/.*)?";
  return new RegExp(`^${re}$`);
}
var matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path.replace(/\\/g, "/")));
function commandFiles(commands, exists) {
  const out = /* @__PURE__ */ new Set();
  for (const c of commands.filter(Boolean)) {
    for (const tok of c.split(/\s+/)) {
      const t = tok.replace(/^["']|["']$/g, "").replace(/\\/g, "/").replace(/^\.\//, "");
      if (!t || t.startsWith("-") || /[|&;<>$`]/.test(t) || !/[./]/.test(t)) continue;
      if (exists(t)) out.add(t);
    }
  }
  return [...out];
}
function pathViolations(paths, spec, autoOffLimits = []) {
  const off = [...spec.offLimits, ...autoOffLimits, ".ai/**", SPEC_FILE];
  const bad = [];
  for (const p of paths) {
    const n = p.replace(/\\/g, "/");
    if (matchesAny(n, off)) bad.push({ path: n, reason: "off-limits" });
    else if (!matchesAny(n, spec.allowedPaths)) bad.push({ path: n, reason: "outside allowed-paths" });
  }
  return bad;
}
var branchNameOf = (slug, n, k) => `optimize/${slug}--r${n}b${k}`;
var trunkNameOf = (slug) => `optimize/${slug}`;
function laneBest(state, lane) {
  if (!lane || lane === "trunk" || lane === state.trunk) return state.best;
  const b = state.round?.branches.find((x) => x.name === lane);
  return b ? b.best : null;
}
function nextAction({ state, spec, now = Date.now(), control = null, tokensUsed = null }) {
  if (!state) return { state: "stopped", reason: "no-baseline", next: { action: "baseline" } };
  if (state.finished) return { state: "finished", reason: "finished", detail: `squashed as ${state.finished.commit ?? "no commit"}`, next: { action: "verify" } };
  if (state.stopped) return { state: "stopped", reason: state.stopped.reason, detail: state.stopped.detail ?? "", next: { action: "person", why: personNext(state.stopped.reason) } };
  if (control && typeof control === "object") {
    if (control.action === "stop") return { state: "stopped", reason: "stop-request", detail: str(control.reason), next: { action: "person", why: "resume with /wf optimize <slug> once the request is cleared" } };
    if (control.action === "pause" && (!control.until || Date.parse(control.until) > now)) return { state: "stopped", reason: "usage-pause", detail: str(control.reason), next: { action: "wait", why: control.until ? `until ${control.until}` : "until the pause is cleared" } };
  }
  const B = spec.budget.trials;
  const used = state.counters.trials;
  const overClock = spec.budget.wallClockMs !== null && now - Date.parse(state.startedAt) >= spec.budget.wallClockMs;
  const overTokens = spec.budget.tokens !== null && tokensUsed !== null && tokensUsed >= spec.budget.tokens;
  const r = state.round;
  if (r) {
    if (r.branches.some((b) => b.keeps > 0 && reachesTarget(spec, b.best.value))) return running({ action: "round-close", why: "a branch reached the target" });
    if (used >= B || overClock || overTokens) return running({ action: "round-close", why: "the budget ran out during the round" });
    const open = r.branches.filter((b) => b.trials < r.branchTrials);
    if (!open.length) return running({ action: "round-close", why: `every branch ran ${r.branchTrials} trials` });
    const turn = [...open].sort((a, b) => a.trials - b.trials || a.k - b.k)[0];
    return running({ action: "trial", on: turn.name, why: `round ${r.n}, branch ${turn.k}, trial ${turn.trials + 1} of ${r.branchTrials}` });
  }
  if (reachesTarget(spec, state.best.value)) return { state: "complete", reason: "complete", next: { action: "finish" } };
  if (used >= B) return { state: "stopped", reason: "budget", detail: `${used} of ${B} trials used`, next: { action: "person", why: personNext("budget") } };
  if (overClock) return { state: "stopped", reason: "budget", detail: "the wall-clock budget is used", next: { action: "person", why: personNext("budget") } };
  if (overTokens) return { state: "stopped", reason: "budget", detail: "the token budget is used", next: { action: "person", why: personNext("budget") } };
  const need = spec.rounds.branches * spec.rounds.branchTrials;
  const remaining = B - used;
  const points = spec.rounds.at.map((p, i) => ({ p, i })).filter(({ i }) => !state.schedule.used.includes(i));
  const due = points.find(({ p }) => used >= Math.ceil(p * B));
  if (due && remaining >= need) return running({ action: "round-open", point: due.i, why: `scheduled at ${Math.round(due.p * 100)}% of budget.trials` });
  if (state.counters.streak >= spec.budget.plateau) {
    const later = points.find(({ p }) => used < Math.ceil(p * B));
    if (later && remaining >= need) return running({ action: "round-open", point: later.i, why: `plateau: ${state.counters.streak} trunk trials with no keep; the round of ${Math.round(later.p * 100)}% opens early` });
    if (state.extraRounds < spec.rounds.maxExtra && remaining >= need) return running({ action: "round-open", point: "extra", why: `plateau: ${state.counters.streak} trunk trials with no keep; an extra round` });
    const detail = state.extraRounds >= spec.rounds.maxExtra ? `max-extra (${spec.rounds.maxExtra}) is used` : `${remaining} trials are left, and a round needs ${need}`;
    return { state: "stopped", reason: "plateau", detail, next: { action: "person", why: personNext("plateau") } };
  }
  if (spec.holdout && state.counters.sinceCheckpoint >= spec.checkpointEvery) return running({ action: "checkpoint", why: `${state.counters.sinceCheckpoint} trunk trials since the last checkpoint` });
  return running({ action: "trial", on: state.trunk, why: `trunk trial ${state.counters.trunkTrials + 1}` });
}
var running = (next) => ({ state: "running", reason: "running", next });
function personNext(reason) {
  switch (reason) {
    case "budget":
      return "choose finish, or a new budget in the spec";
    case "plateau":
      return "choose finish, a new spec, or a new budget";
    case "holdout-regression":
      return "look at the trials since the last good checkpoint; then finish, revert, or a new spec";
    case "state-error":
      return "report; do not repair. state.json and results.jsonl disagree, or the branch moved outside the loop";
    case "guard-red":
      return "the guard fails at the baseline: fix it first. A loop cannot start from a red guard";
    default:
      return "read the reason";
  }
}
function pickWinner(round, direction) {
  const kept = round.branches.filter((b) => b.keeps > 0 && b.best.value !== null);
  if (!kept.length) return null;
  return [...kept].sort((a, b) => {
    if (a.best.value !== b.best.value) return isBetter(direction, a.best.value, b.best.value) ? -1 : 1;
    return (a.best.reachedAt ?? 0) - (b.best.reachedAt ?? 0);
  })[0];
}
function digestTrials(results, state, lane) {
  const trials = results.filter((r) => r.event === "trial");
  const isBranch = lane && lane !== "trunk" && lane !== state.trunk;
  let mine;
  if (isBranch) {
    mine = trials.filter((r) => r.round === state.round?.n && r.branch === lane);
  } else {
    const from = state.digestFrom ?? { trial: 0, round: null, branch: null };
    mine = trials.filter((r) => r.branch === null && r.trial > from.trial || from.round !== null && r.round === from.round && r.branch === from.branch);
  }
  return mine.slice(-DIGEST_TRIALS);
}
function buildDigest({ spec, specProse, state, results, lane, solutions = [] }) {
  const isBranch = lane && lane !== "trunk" && lane !== state.trunk;
  const trials = digestTrials(results, state, lane);
  const best = laneBest(state, isBranch ? lane : state.trunk);
  const brief = (r) => ({ trial: r.trial, hypothesis: r.hypothesis?.text ?? "", verdict: r.verdict, median: r.median, delta: r.delta });
  return {
    lane: isBranch ? lane : "trunk",
    flushed: !!isBranch,
    objective: spec.objective,
    specProse,
    metric: { command: spec.metric.command, direction: spec.metric.direction, unit: spec.metric.unit, target: spec.metric.target },
    allowedPaths: spec.allowedPaths,
    offLimits: spec.offLimits,
    best: best ? { value: best.value, commit: best.commit } : null,
    baseline: { value: state.baseline.median, noise: state.baseline.noise },
    threshold: best ? keepThreshold(spec, best.value, state.baseline.noise) : null,
    trials: trials.map(brief),
    failed: trials.filter((r) => r.verdict !== "kept").map((r) => r.hypothesis?.text ?? "").filter(Boolean),
    solutions: isBranch ? [] : solutions,
    worktree: state.worktree,
    branch: isBranch ? lane : state.trunk
  };
}
function newState({ slug, worktree, baseCommit, values, holdoutValue, startedAt, slugBranch }) {
  const med = median(values);
  return {
    version: STATE_VERSION,
    slug,
    worktree,
    trunk: trunkNameOf(slug),
    slugBranch: slugBranch ?? null,
    baseCommit,
    startedAt,
    baseline: { values, median: med, noise: noiseOf(values), holdout: holdoutValue ?? null },
    best: { commit: baseCommit, value: med, trial: 0, reachedAt: 0 },
    counters: { trials: 0, trunkTrials: 0, streak: 0, sinceCheckpoint: 0, keeps: 0 },
    schedule: { used: [] },
    extraRounds: 0,
    round: null,
    rounds: [],
    digestFrom: { trial: 0, round: null, branch: null },
    lastCheckpoint: { trial: 0, ok: true, value: holdoutValue ?? null },
    stopped: null,
    finished: null
  };
}
function holdoutRegressed(spec, baseline2, value) {
  if (!spec.holdout || baseline2 === null || value === null) return false;
  const loss = -gainOf(spec.holdout.direction, baseline2, value);
  return loss > amountOf(spec.holdout.tolerance, baseline2);
}
function keptTable(results, spec) {
  const kept = results.filter((r) => r.event === "trial" && r.verdict === "kept");
  const unit = spec.metric.unit ? ` ${spec.metric.unit}` : "";
  const rows = kept.map((r) => `| ${r.trial} | ${r.branch ?? "trunk"} | ${String(r.hypothesis?.text ?? "").replace(/\|/g, "\\|")} | ${r.median}${unit} | ${r.delta}${unit} |`);
  return ["| Trial | Lane | Hypothesis | Median | Gain |", "|---|---|---|---|---|", ...rows].join("\n");
}

// scripts/optimize.mjs
var USAGE = "Usage: optimize.mjs <baseline|status|propose-context|trial|round-open|round-close|checkpoint|finish|cleanup> <projectRoot> <slug> ...";
var PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
var SLICE = "optimize";
var wfDir = (root, slug) => join(root, ".ai", "workflows", slug);
var optDir = (root, slug) => join(wfDir(root, slug), "optimize");
var statePath = (root, slug) => join(optDir(root, slug), "state.json");
var resultsPath = (root, slug) => join(optDir(root, slug), "results.jsonl");
var controlPath = (root, slug) => join(wfDir(root, slug), ".control.json");
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
function git(cwd, args) {
  const r = spawnSync("git", ["-c", "core.longpaths=true", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
var gitOk = (cwd, args, what) => {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`${what}: git ${args.join(" ")} failed: ${r.err || r.out}`);
  return r.out;
};
function runCommand(command, cwd, timeoutMs) {
  const t0 = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: "utf8", windowsHide: true, timeout: timeoutMs ?? void 0, maxBuffer: 64 * 1024 * 1024 });
  const timedOut = r.error?.code === "ETIMEDOUT" || r.signal && Date.now() - t0 >= (timeoutMs ?? Infinity);
  return { code: r.status ?? (timedOut ? 124 : 1), stdout: r.stdout || "", stderr: r.stderr || "", timedOut: !!timedOut, ms: Date.now() - t0 };
}
var tail = (text, n = 20) => String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(-n).join("\n");
function readFm(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const p = safeParseFrontmatter(text);
  return { data: p.data, content: p.content ?? "", error: p.parseError };
}
function loadSpec(root, slug) {
  const f = readFm(join(wfDir(root, slug), SPEC_FILE));
  if (!f) throw new Error(`no ${SPEC_FILE}: write the spec with /wf intake optimize first`);
  if (f.error) throw new Error(`${SPEC_FILE} does not parse: ${f.error}`);
  const { spec, errors } = parseSpec(f.data);
  if (errors.length) throw new Error(`${SPEC_FILE}: ${errors.join("; ")}`);
  return { spec, prose: f.content.trim() };
}
var readState = (root, slug) => existsSync(statePath(root, slug)) ? JSON.parse(readFileSync(statePath(root, slug), "utf8")) : null;
var saveState = (root, slug, state) => writeAtomic(statePath(root, slug), `${JSON.stringify(state, null, 2)}
`);
function readResults(root, slug) {
  const f = resultsPath(root, slug);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}
function appendResult(root, slug, line) {
  mkdirSync(optDir(root, slug), { recursive: true });
  appendFileSync(resultsPath(root, slug), `${JSON.stringify({ at: nowIso(), ...line })}
`);
}
function readControl(root, slug) {
  const f = controlPath(root, slug);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return { action: "pause", reason: ".control.json does not parse" };
  }
}
function tokensSince(root, slug, startedAt) {
  const f = join(wfDir(root, slug), "cost.jsonl");
  if (!existsSync(f)) return null;
  let sum = 0;
  const t0 = Date.parse(startedAt);
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (Date.parse(row.ts) < t0) continue;
    const add = (u) => {
      if (u) sum += Number(u.input_tokens ?? 0) + Number(u.output_tokens ?? 0);
    };
    add(row.main);
    for (const s of row.subagents ?? []) add(s);
  }
  return sum;
}
var indexOf = (root, slug) => readFm(join(wfDir(root, slug), "00-index.md"))?.data ?? null;
var samePath = (a, b) => {
  const n = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return n(a).replace(/\\/g, "/").toLowerCase() === n(b).replace(/\\/g, "/").toLowerCase();
};
function assertWorktree(root, state) {
  const wt = state.worktree;
  if (!wt || !existsSync(wt)) throw new Error(`the optimize worktree ${wt} does not exist`);
  if (samePath(wt, root)) throw new Error("the optimize worktree is the project root: refusing to reset it");
  const top = git(wt, ["rev-parse", "--show-toplevel"]);
  if (!top.ok || !samePath(top.out, wt)) throw new Error(`git does not report ${wt} as its own top level: refusing to reset it`);
}
var currentBranch = (cwd) => git(cwd, ["branch", "--show-current"]).out;
var headOf = (cwd) => git(cwd, ["rev-parse", "HEAD"]).out;
var dirtyPaths = (cwd) => {
  const r = spawnSync("git", ["-C", cwd, "status", "--porcelain", "-z", "-uall"], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const parts = (r.stdout || "").split("\0");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    out.push(e.slice(3));
    if (e[0] === "R" || e[0] === "C") out.push(parts[++i]);
  }
  return out.filter(Boolean);
};
function resetTo(root, state, commit) {
  assertWorktree(root, state);
  gitOk(state.worktree, ["reset", "--hard", commit], "reset");
  gitOk(state.worktree, ["clean", "-fd"], "clean");
}
function checkout(root, state, branch) {
  if (currentBranch(state.worktree) === branch) return;
  if (dirtyPaths(state.worktree).length) throw new Error(`the worktree has uncommitted changes on ${currentBranch(state.worktree)}: run trial on them, or discard them, before another branch takes its turn`);
  gitOk(state.worktree, ["checkout", "-q", branch], "checkout");
}
function measure(spec, cwd, n, command = spec.metric.command, key = spec.metric.key) {
  const values = [];
  const runs = [];
  for (let i = 0; i < n; i++) {
    const r = runCommand(command, cwd, spec.budget.trialTimeoutMs);
    runs.push({ code: r.code, ms: r.ms });
    if (r.timedOut) return { values, timeout: true, output: tail(r.stdout + r.stderr) };
    const v = r.code === 0 ? parseMetricLine(r.stdout, key) : null;
    if (v === null) return { values, crashed: true, output: tail(r.stdout + r.stderr), code: r.code };
    values.push(v);
  }
  return { values, median: median(values), runs };
}
function consistency(root, slug, state, results) {
  const trials = results.filter((r) => r.event === "trial").length;
  if (trials !== state.counters.trials) return `state.json counts ${state.counters.trials} trials and results.jsonl holds ${trials}`;
  if (state.finished || !state.worktree || !existsSync(state.worktree)) return null;
  const branch = currentBranch(state.worktree);
  const best = laneBest(state, branch === state.trunk ? "trunk" : branch);
  if (!best) return `the worktree is on ${branch || "a detached HEAD"}, which is not a branch of the loop`;
  const head = headOf(state.worktree);
  if (head !== best.commit) return `HEAD of ${branch} is ${head.slice(0, 12)}, and the loop left it at ${best.commit.slice(0, 12)}: the branch moved outside the loop`;
  return null;
}
function optimizeStatus(root, slug) {
  const state = readState(root, slug);
  if (!state) return { ok: true, state: "stopped", reason: "no-baseline", next: { action: "baseline" } };
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results);
  if (err) return { ok: true, state: "stopped", reason: "state-error", detail: err, next: { action: "person", why: "report; do not repair" } };
  const st = nextAction({ state, spec, control: readControl(root, slug), tokensUsed: tokensSince(root, slug, state.startedAt) });
  return {
    ok: true,
    ...st,
    best: state.best,
    baseline: { median: state.baseline.median, noise: state.baseline.noise },
    counters: state.counters,
    budget: { trials: spec.budget.trials, roundsMax: spec.rounds.at.length + spec.rounds.maxExtra, width: spec.width },
    round: state.round ? { n: state.round.n, reason: state.round.reason, branches: state.round.branches.map((b) => ({ k: b.k, name: b.name, trials: b.trials, keeps: b.keeps, best: b.best.value })) } : null,
    rounds: state.rounds.length
  };
}
function requireNext(root, slug, action) {
  const st = optimizeStatus(root, slug);
  if (st.state !== "running" || st.next?.action !== action) {
    throw new Error(`the next action is ${st.next?.action ?? "none"} (${st.state}${st.reason && st.reason !== "running" ? `: ${st.reason}` : ""}${st.detail ? `, ${st.detail}` : ""}), not ${action}`);
  }
  return st;
}
function baseline(root, slug) {
  if (readState(root, slug)) throw new Error("the baseline exists: run status, or /wf optimize <slug> to continue");
  const { spec } = loadSpec(root, slug);
  if (!spec.confirmedBy) throw new Error(`${SPEC_FILE} has no confirmed-by: the person confirms the spec before the first trial (D3)`);
  const index = indexOf(root, slug);
  const slugBranch = String(index?.branch ?? "").trim() || currentBranch(root);
  const base = git(root, ["rev-parse", "--verify", `${slugBranch || "HEAD"}^{commit}`]);
  if (!base.ok) throw new Error(`the slug branch ${slugBranch} does not resolve`);
  const wt = spec.worktree ? resolve(root, spec.worktree) : join(dirname(root), `${basename(root)}.optimize`, slug);
  const trunk = `optimize/${slug}`;
  if (existsSync(wt)) {
    if (!samePath(git(wt, ["rev-parse", "--show-toplevel"]).out || "", wt) || currentBranch(wt) !== trunk) throw new Error(`${wt} exists and is not the optimize worktree of ${slug}: remove it or set worktree: in the spec`);
    if (headOf(wt) !== base.out) throw new Error(`${wt} is at ${headOf(wt).slice(0, 12)}, not at the slug branch ${base.out.slice(0, 12)}`);
  } else {
    mkdirSync(dirname(wt), { recursive: true });
    const has = git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${trunk}`]).ok;
    if (has) throw new Error(`the branch ${trunk} exists from another run: ask the person to delete or rename it`);
    gitOk(root, ["worktree", "add", "-q", "-b", trunk, wt, base.out], "worktree add");
  }
  if (spec.setup) {
    const s = runCommand(spec.setup, wt, 60 * 6e4);
    if (s.code !== 0) return { ok: false, error: `the setup command failed (exit ${s.code})`, output: tail(s.stdout + s.stderr) };
  }
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs);
  if (g.code !== 0) return { ok: false, guardRed: true, error: `the guard fails at the baseline (exit ${g.code}): a loop cannot start from a red guard`, output: tail(g.stdout + g.stderr) };
  const m = measure(spec, wt, spec.metric.repeat);
  if (m.crashed || m.timeout) return { ok: false, error: `the metric ${m.timeout ? "timed out" : "did not print a number"} at the baseline`, output: m.output };
  let holdout = null;
  if (spec.holdout) {
    const h = measure(spec, wt, spec.metric.repeat, spec.holdout.command, null);
    if (h.crashed || h.timeout) return { ok: false, error: "the holdout did not print a number at the baseline", output: h.output };
    holdout = h.median;
  }
  const state = newState({ slug, worktree: wt, baseCommit: base.out, values: m.values, holdoutValue: holdout, startedAt: nowIso(), slugBranch });
  appendResult(root, slug, { event: "baseline", commit: base.out, values: m.values, median: state.baseline.median, noise: state.baseline.noise, holdout });
  saveState(root, slug, state);
  return { ok: true, worktree: wt, branch: trunk, baseline: state.baseline, ...optimizeStatus(root, slug) };
}
function solutionsFor(root, spec) {
  const dir = join(root, ".ai", "solutions");
  if (!existsSync(dir)) return [];
  const want = new Set(["optimize", ...spec.tags].map((t) => t.toLowerCase()));
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < 10) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!e.name.endsWith(".md") || e.name === "INDEX.md") continue;
      const f = readFm(p);
      const tags = Array.isArray(f?.data?.tags) ? f.data.tags.map((t) => String(t).toLowerCase()) : [];
      if (f?.data?.status === "active" && tags.some((t) => want.has(t))) {
        out.push({ path: relative(root, p).replace(/\\/g, "/"), title: (/^#\s+(.+)$/m.exec(f.content) || [])[1] ?? e.name });
      }
    }
  }
  return out;
}
function proposeContext(root, slug) {
  const st = requireNext(root, slug, "trial");
  const state = readState(root, slug);
  const { spec, prose } = loadSpec(root, slug);
  checkout(root, state, st.next.on);
  const lane = st.next.on === state.trunk ? "trunk" : st.next.on;
  const digest = buildDigest({ spec, specProse: prose, state, results: readResults(root, slug), lane, solutions: lane === "trunk" ? solutionsFor(root, spec) : [] });
  return { ok: true, why: st.next.why, digest };
}
function trial(root, slug, id, f) {
  if (!id) throw new Error("trial needs a hypothesis id");
  const st = requireNext(root, slug, "trial");
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  const wt = state.worktree;
  const laneName = st.next.on;
  const isTrunk = laneName === state.trunk;
  if (currentBranch(wt) !== laneName) throw new Error(`the worktree is on ${currentBranch(wt)}, and this trial runs on ${laneName}: run propose-context first`);
  const round = state.round;
  const branch = isTrunk ? null : round.branches.find((b) => b.name === laneName);
  const best = isTrunk ? state.best : branch.best;
  const text = f["hypothesis-file"] ? readFileSync(resolve(root, f["hypothesis-file"]), "utf8").trim() : String(f.hypothesis ?? "").trim();
  const hypothesis = { id, text, expected: String(f.expected ?? "").trim() };
  const n = state.counters.trials + 1;
  const line = { event: "trial", trial: n, round: isTrunk ? null : round.n, branch: isTrunk ? null : laneName, hypothesis, values: [], median: null, delta: null, noise: state.baseline.noise, guard: null };
  const finish2 = (verdict, extra = {}) => {
    Object.assign(line, { verdict, ...extra });
    if (verdict !== "kept") resetTo(root, state, best.commit);
    state.counters.trials = n;
    if (isTrunk) {
      state.counters.trunkTrials++;
      state.counters.sinceCheckpoint++;
      state.counters.streak = verdict === "kept" ? 0 : state.counters.streak + 1;
    } else {
      branch.trials++;
    }
    appendResult(root, slug, line);
    saveState(root, slug, state);
    return { ok: true, trial: n, lane: isTrunk ? "trunk" : laneName, verdict, reason: line.reason ?? null, median: line.median, delta: line.delta, threshold: line.threshold ?? null, best: isTrunk ? state.best : branch.best, ...line.output ? { output: line.output } : {}, next: optimizeStatus(root, slug).next };
  };
  const paths = dirtyPaths(wt);
  if (!paths.length) return finish2("rejected", { reason: "the worktree holds no change" });
  const auto = commandFiles([spec.metric.command, spec.guard.command, spec.holdout?.command], (p) => existsSync(join(wt, p)));
  const bad = pathViolations(paths, spec, auto);
  if (bad.length) return finish2("rejected", { reason: `path check: ${bad.map((b) => `${b.path} (${b.reason})`).join(", ")}`, paths });
  gitOk(wt, ["add", "-A"], "add");
  gitOk(wt, ["commit", "-q", "-m", `experiment ${id}${text ? `: ${text.split(/\r?\n/)[0].slice(0, 60)}` : ""}`], "commit");
  line.commit = headOf(wt);
  line.paths = paths;
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs);
  line.guard = g.code === 0 ? "pass" : "fail";
  if (g.timedOut) return finish2("timeout", { reason: "the guard timed out", output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return finish2("reverted", { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const m = measure(spec, wt, spec.metric.repeat);
  if (m.timeout) return finish2("timeout", { reason: "the metric timed out", values: m.values, output: m.output });
  if (m.crashed) return finish2("crashed", { reason: "the metric did not print a number", values: m.values, output: m.output });
  line.values = m.values;
  line.median = m.median;
  line.delta = gainOf(spec.metric.direction, best.value, m.median);
  let d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median });
  line.threshold = d.threshold;
  if (d.needConfirm) {
    const c = measure(spec, wt, spec.metric.repeat);
    if (c.timeout || c.crashed) return finish2(c.timeout ? "timeout" : "crashed", { reason: "the confirm run failed", output: c.output });
    line.confirm = c.values;
    d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median, confirm: c.median });
    if (d.kept) {
      line.median = median([...m.values, ...c.values]);
      line.delta = gainOf(spec.metric.direction, best.value, line.median);
    }
  }
  if (!d.kept) return finish2("reverted", { reason: d.wins ? "the confirm run did not agree" : `the gain ${line.delta} is not above the threshold ${d.threshold}` });
  const kept = { commit: line.commit, value: line.median, trial: n, reachedAt: n };
  if (isTrunk) state.best = kept;
  else {
    branch.best = kept;
    branch.keeps++;
  }
  state.counters.keeps++;
  return finish2("kept");
}
function roundOpen(root, slug) {
  const st = requireNext(root, slug, "round-open");
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  if (dirtyPaths(state.worktree).length) throw new Error("the worktree has uncommitted changes: a round forks from the trunk best only");
  const n = state.rounds.length + 1;
  const point = st.next.point;
  const reason = point === "extra" || /^plateau/.test(st.next.why ?? "") ? "plateau" : "schedule";
  const branches = [];
  for (let k = 1; k <= spec.rounds.branches; k++) {
    const name = branchNameOf(slug, n, k);
    if (git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).ok) throw new Error(`the branch ${name} exists: a branch of round ${n} from another run. Ask the person.`);
    gitOk(state.worktree, ["branch", name, state.best.commit], "branch");
    branches.push({ k, name, best: { ...state.best, reachedAt: 0 }, trials: 0, keeps: 0 });
  }
  state.round = { n, reason, point, why: st.next.why, branchTrials: spec.rounds.branchTrials, openedAtTrial: state.counters.trials, from: state.best.commit, branches };
  if (point === "extra") state.extraRounds++;
  else state.schedule.used.push(point);
  appendResult(root, slug, { event: "round-open", round: n, reason, why: st.next.why, from: state.best.commit, branches: branches.map((b) => b.name) });
  saveState(root, slug, state);
  return { ok: true, round: n, reason, why: st.next.why, branches: branches.map((b) => b.name), branchTrials: spec.rounds.branchTrials, next: optimizeStatus(root, slug).next };
}
function runCheckpoint(root, slug, state, spec) {
  if (!spec.holdout) return { ran: false };
  checkout(root, state, state.trunk);
  const h = measure(spec, state.worktree, spec.metric.repeat, spec.holdout.command, null);
  const value = h.crashed || h.timeout ? null : h.median;
  const regressed = value === null || holdoutRegressed(spec, state.baseline.holdout, value);
  const since = state.lastCheckpoint?.trial ?? 0;
  state.counters.sinceCheckpoint = 0;
  if (regressed) {
    state.stopped = { reason: "holdout-regression", detail: value === null ? "the holdout did not print a number" : `the holdout is ${value} against the baseline ${state.baseline.holdout}; trials ${since + 1} to ${state.counters.trials}`, at: nowIso() };
  } else state.lastCheckpoint = { trial: state.counters.trials, ok: true, value };
  appendResult(root, slug, { event: "checkpoint", trial: state.counters.trials, value, baseline: state.baseline.holdout, ok: !regressed });
  return { ran: true, value, ok: !regressed };
}
function roundClose(root, slug) {
  requireNext(root, slug, "round-close");
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  const r = state.round;
  const winner = pickWinner(r, spec.metric.direction);
  checkout(root, state, state.trunk);
  if (winner) {
    gitOk(state.worktree, ["merge", "-q", "--ff-only", winner.best.commit], "fast-forward");
    state.best = { ...winner.best };
    state.digestFrom = { trial: state.counters.trials, round: r.n, branch: winner.name };
  }
  const deleted = [];
  for (const b of r.branches) {
    if (git(state.worktree, ["branch", "-D", b.name]).ok) deleted.push(b.name);
  }
  state.counters.streak = 0;
  const summary = { n: r.n, reason: r.reason, from: r.from, winner: winner ? { k: winner.k, name: winner.name, value: winner.best.value, commit: winner.best.commit } : null, branches: r.branches.map((b) => ({ k: b.k, trials: b.trials, keeps: b.keeps, best: b.best.value })) };
  state.rounds.push(summary);
  state.round = null;
  if (!winner && r.reason === "plateau") state.stopped = { reason: "plateau", detail: `the trunk found no gain in ${spec.budget.plateau} trials, and no branch of round ${r.n} beat it`, at: nowIso() };
  appendResult(root, slug, { event: "round-close", round: r.n, winner: summary.winner, branches: summary.branches });
  const cp = state.stopped ? { ran: false } : runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, round: r.n, winner: summary.winner ?? "trunk", deleted, checkpoint: cp, ...optimizeStatus(root, slug) };
}
function checkpoint(root, slug) {
  const st = optimizeStatus(root, slug);
  if (st.state !== "running") throw new Error(`the loop is ${st.state}: ${st.reason}`);
  if (st.round) throw new Error("a branch round is open: the checkpoint runs at round-close");
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  if (!spec.holdout) return { ok: true, ran: false, note: "the spec names no holdout" };
  assertWorktree(root, state);
  const cp = runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, ...cp, ...optimizeStatus(root, slug) };
}
var yamlList = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
function finish(root, slug, f) {
  const state = readState(root, slug);
  if (!state) throw new Error("no baseline: nothing to finish");
  if (state.finished) return { ok: true, already: true, finished: state.finished };
  if (state.round) throw new Error("a branch round is open: run round-close first");
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results);
  if (err) throw new Error(`state-error: ${err}`);
  const at = nowIso();
  const winners = new Set(state.rounds.filter((r) => r.winner).map((r) => `${r.n}:${r.winner.name}`));
  const lineage = results.filter((r) => r.event !== "trial" || r.branch === null || winners.has(`${r.round}:${r.branch}`));
  const kept = lineage.filter((r) => r.event === "trial" && r.verdict === "kept");
  if (state.best.commit === state.baseCommit) {
    state.finished = { commit: null, at, gain: 0, kept: 0 };
    appendResult(root, slug, { event: "finish", commit: null, gain: 0 });
    saveState(root, slug, state);
    return { ok: true, kept: 0, note: "no trial was kept: nothing to squash. Close the slug, or write a new spec." };
  }
  const branch = state.slugBranch;
  if (branch && currentBranch(root) !== branch) throw new Error(`the main checkout is on ${currentBranch(root) || "a detached HEAD"}, not on the slug branch ${branch}: switch to it, then finish again`);
  const tracked = git(root, ["status", "--porcelain", "--untracked-files=no"]).out;
  if (tracked) throw new Error("the main checkout has uncommitted changes to tracked files: commit or stash them, then finish again");
  const m = git(root, ["merge", "--squash", state.trunk]);
  if (!m.ok) {
    git(root, ["reset", "--merge"]);
    throw new Error(`the squash of ${state.trunk} does not apply cleanly: ${m.err || m.out}`);
  }
  const gain = gainOf(spec.metric.direction, state.baseline.median, state.best.value);
  const unit = spec.metric.unit ? ` ${spec.metric.unit}` : "";
  const message = String(f.message ?? "").trim() || `${spec.objective}: ${state.baseline.median}${unit} to ${state.best.value}${unit}`;
  gitOk(root, ["commit", "-q", "-m", message], "commit");
  const sha = headOf(root);
  const files = gitOk(root, ["diff", "--name-only", `${sha}~1`, sha], "diff").split(/\r?\n/).filter(Boolean);
  const stat = gitOk(root, ["diff", "--numstat", `${sha}~1`, sha], "diff").split(/\r?\n/).filter(Boolean).map((l) => l.split("	"));
  const added = stat.reduce((s, x) => s + (Number(x[0]) || 0), 0);
  const removed = stat.reduce((s, x) => s + (Number(x[1]) || 0), 0);
  const dir = wfDir(root, slug);
  if (!existsSync(join(dir, "03-slice.md"))) {
    writeAtomic(join(dir, "03-slice.md"), [
      "---",
      "schema: sdlc/v1",
      "type: slice-index",
      `slug: ${slug}`,
      "status: complete",
      "stage-number: 3",
      `created-at: "${at}"`,
      `updated-at: "${at}"`,
      "total-slices: 1",
      `best-first-slice: ${SLICE}`,
      "tags: [optimize]",
      "slices:",
      `  - slug: ${SLICE}`,
      "    status: complete",
      "    complexity: m",
      "    depends-on: []",
      "refs:",
      "  index: 00-index.md",
      `  spec: ${SPEC_FILE}`,
      "next-command: wf-verify",
      `next-invocation: "/wf verify ${slug} ${SLICE}"`,
      "---",
      "",
      "# Slice Index",
      "",
      `One slice, \`${SLICE}\`: the kept trials of the optimize loop, squashed into one commit.`,
      ""
    ].join("\n"));
  }
  const holdoutAc = spec.holdout ? `
3. When the holdout runs, \`${spec.holdout.command}\` is within ${spec.holdout.tolerance.percent !== void 0 ? `${spec.holdout.tolerance.percent}%` : spec.holdout.tolerance.absolute} of the baseline holdout ${state.baseline.holdout}.` : "";
  writeAtomic(join(dir, `03-slice-${SLICE}.md`), [
    "---",
    "schema: sdlc/v1",
    "type: slice",
    `slug: ${slug}`,
    `slice-slug: ${SLICE}`,
    "status: complete",
    "stage-number: 3",
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    "complexity: m",
    "depends-on: []",
    "tags: [optimize]",
    "ux-impact: none",
    "refs:",
    "  index: 00-index.md",
    "  slice-index: 03-slice.md",
    `  implement: 05-implement-${SLICE}.md`,
    "next-command: wf-verify",
    `next-invocation: "/wf verify ${slug} ${SLICE}"`,
    "---",
    "",
    `# Slice: ${SLICE}`,
    "",
    `The kept trials of the loop toward: ${spec.objective}`,
    "",
    "## Acceptance Criteria",
    "",
    `1. \`${spec.metric.command}\`, ${spec.metric.repeat} runs, reaches ${state.best.value}${unit} within the noise floor ${state.baseline.noise}${unit} (median; direction ${spec.metric.direction}).`,
    `2. \`${spec.guard.command}\` exits 0.${holdoutAc}`,
    ""
  ].join("\n"));
  writeAtomic(join(dir, `05-implement-${SLICE}.md`), [
    "---",
    "schema: sdlc/v1",
    "type: implement",
    `slug: ${slug}`,
    `slice-slug: ${SLICE}`,
    "status: complete",
    "stage-number: 5",
    `created-at: "${at}"`,
    `updated-at: "${at}"`,
    `metric-files-changed: ${files.length}`,
    `metric-lines-added: ${added}`,
    `metric-lines-removed: ${removed}`,
    "metric-deviations-from-plan: 0",
    "metric-review-fixes-applied: 0",
    `commit-sha: "${sha}"`,
    `files-modified: ${yamlList(files)}`,
    "tags: [optimize]",
    `optimize-baseline: ${state.baseline.median}`,
    `optimize-kept-value: ${state.best.value}`,
    `optimize-noise: ${state.baseline.noise}`,
    `optimize-trials: ${state.counters.trials}`,
    `optimize-kept: ${kept.length}`,
    `optimize-rounds: ${state.rounds.length}`,
    "refs:",
    "  index: 00-index.md",
    `  slice-def: 03-slice-${SLICE}.md`,
    `  verify: 06-verify-${SLICE}.md`,
    "  results: optimize/results.jsonl",
    "next-command: wf-verify",
    `next-invocation: "/wf verify ${slug} ${SLICE}"`,
    "---",
    "",
    `# Implement: ${SLICE}`,
    "",
    "## Summary of Changes",
    "",
    `- The loop ran ${state.counters.trials} trials in ${state.rounds.length} branch round(s) and kept ${kept.length}.`,
    `- The metric moved from ${state.baseline.median}${unit} to ${state.best.value}${unit} (gain ${gain}${unit}; noise floor ${state.baseline.noise}${unit}).`,
    `- One squashed commit: ${sha}.`,
    "",
    "## Kept Trials",
    "",
    keptTable(lineage, spec),
    "",
    "## Files Changed",
    "",
    ...files.map((p) => `- ${p}`),
    ""
  ].join("\n"));
  state.finished = { commit: sha, at, gain, kept: kept.length };
  appendResult(root, slug, { event: "finish", commit: sha, gain, kept: kept.length });
  saveState(root, slug, state);
  return { ok: true, commit: sha, gain, kept: kept.length, files, wrote: ["03-slice.md", `03-slice-${SLICE}.md`, `05-implement-${SLICE}.md`], next: { action: "verify", invocation: `/wf verify ${slug} ${SLICE}` } };
}
function linksUnder(dir, limit = 20) {
  const found = [];
  const stack = [dir];
  while (stack.length && found.length < limit) {
    const d = stack.pop();
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
      if (st.isSymbolicLink()) found.push(relative(dir, p));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}
function cleanup(root, slug) {
  const state = readState(root, slug);
  if (!state) throw new Error("no baseline: nothing to clean up");
  if (!state.finished) throw new Error("the loop is not finished: run finish first");
  const out = { ok: true, removed: [], kept: [] };
  if (existsSync(state.worktree)) {
    const links = linksUnder(state.worktree);
    if (links.length) return { ok: false, links, error: `the worktree holds links (${links.slice(0, 3).join(", ")}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
    const r = git(root, ["worktree", "remove", state.worktree]);
    if (!r.ok) return { ok: false, error: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
    out.removed.push(state.worktree);
  }
  if (git(root, ["branch", "-D", state.trunk]).ok) out.removed.push(state.trunk);
  state.cleanedAt = nowIso();
  saveState(root, slug, state);
  return out;
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
      case "baseline":
        out = baseline(root, slug);
        break;
      case "status":
        out = optimizeStatus(root, slug);
        break;
      case "propose-context":
        out = proposeContext(root, slug);
        break;
      case "trial":
        out = trial(root, slug, pos[0], f);
        break;
      case "round-open":
        out = roundOpen(root, slug);
        break;
      case "round-close":
        out = roundClose(root, slug);
        break;
      case "checkpoint":
        out = checkpoint(root, slug);
        break;
      case "finish":
        out = finish(root, slug, f);
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
  optimizeStatus,
  main
};
