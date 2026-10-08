#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/campaign.mjs
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, rmSync as rmSync2, statfsSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join2, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/campaign.mjs
var BUILD_FORMS = Object.freeze(["intake", "extension", "fix", "hotfix"]);
var OUTSIDE_FORMS = Object.freeze(["task", "investigate", "discover"]);
var MAX_CARRIED = 40;
var LEDGER_VERSION = 1;
var WAVE_STATES = Object.freeze(["planned", "running", "boundary", "handoff", "shipping", "shipped", "stopped"]);
var UNIT_STATES = Object.freeze(["planned", "prepared", "running", "stopped", "finished", "merged", "needs-fix", "shipped"]);
var LIVE_WAVE_STATES = Object.freeze(["running", "boundary", "handoff", "shipping"]);
var SETUP_ANSWERS = Object.freeze(["forecast", "target-version", "release-each-wave", "output", "budget"]);
var DEFAULT_BUDGET = Object.freeze({ fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 });
var READING_STALE_MS = 10 * 60 * 1e3;
var DEFAULT_MAX_UNSHIPPED = 2;
var DEFAULT_WIDTH = 3;
var CONTEXT_LONG_LINES = 200;
function unitOf(packet, { written = [] } = {}) {
  const form = packet.form ?? "intake";
  const done = new Set(written);
  const deps = packet["depends-on"] ?? [];
  const exps = packet.expects ?? [];
  const workSlug = packet["work-slug"] ?? packet.key;
  const targetSlug = packet["target-slug"] ?? null;
  return {
    key: packet.key,
    title: packet.title ?? packet.key,
    form,
    // An extension adds slices to the slug it extends, so yolo drives that slug.
    slug: form === "extension" && targetSlug ? targetSlug : workSlug,
    workSlug,
    targetSlug,
    urgency: packet.urgency ?? "normal",
    order: Number.isFinite(Number(packet.order)) ? Number(packet.order) : 1,
    dependsOn: deps.filter((d) => !done.has(d)),
    provides: [...packet.provides ?? []],
    expects: exps.filter((e) => !done.has(e.from)),
    writtenDeps: deps.filter((d) => done.has(d)),
    writtenExpects: exps.filter((e) => done.has(e.from)),
    decisions: [...packet["carried-decisions"] ?? []],
    uxImpact: packet["ux-impact"] ?? "none",
    packetState: packet.state ?? "proposed",
    routedTo: packet["routed-to"] ?? null,
    file: packet.file ?? null
  };
}
var isBuildUnit = (u) => BUILD_FORMS.includes(u.form);
function touchedSlugs(u) {
  return new Set([u.slug, u.workSlug, u.targetSlug].filter(Boolean));
}
var byOrder = (a, b) => a.order - b.order || String(a.key).localeCompare(String(b.key));
function findCycle(units) {
  const graph = new Map(units.map((u) => [u.key, u.dependsOn]));
  const state = /* @__PURE__ */ new Map();
  const stack2 = [];
  const visit = (k) => {
    if (state.get(k) === "done") return null;
    if (state.get(k) === "open") return [...stack2.slice(stack2.indexOf(k)), k];
    state.set(k, "open");
    stack2.push(k);
    for (const n of graph.get(k) ?? []) {
      if (!graph.has(n)) continue;
      const c = visit(n);
      if (c) return c;
    }
    stack2.pop();
    state.set(k, "done");
    return null;
  };
  for (const k of graph.keys()) {
    const c = visit(k);
    if (c) return c;
  }
  return null;
}
function closure(byKey, key) {
  const seen = /* @__PURE__ */ new Set();
  const walk2 = (k) => {
    for (const n of byKey.get(k)?.dependsOn ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      walk2(n);
    }
  };
  walk2(key);
  return seen;
}
function checkCampaignSet(packets, { written = [] } = {}) {
  const units = packets.map((p) => p.dependsOn ? p : unitOf(p, { written }));
  const byKey = new Map(units.map((u) => [u.key, u]));
  const errors = [];
  const warnings = [];
  for (const u of units) {
    for (const d of u.dependsOn) if (!byKey.has(d)) errors.push(`packet ${u.key} depends on ${d}, which is not a packet of this work set and not in the written list of work/index.md.`);
  }
  const cycle = findCycle(units);
  if (cycle) errors.push(`the dependencies form a cycle: ${cycle.join(" -> ")}.`);
  for (const u of units) {
    const deps = closure(byKey, u.key);
    for (const e of u.expects) {
      const src = byKey.get(e.from);
      if (!src || !src.provides.some((p) => p.key === e.key)) errors.push(`packet ${u.key} expects ${e.from}/${e.key} ("${e.text}"), and no packet provides it.`);
      else if (!deps.has(e.from)) errors.push(`packet ${u.key} expects ${e.from}/${e.key}, but ${e.from} is not in its depends-on.`);
    }
    if (isBuildUnit(u) && u.decisions.length > MAX_CARRIED && !["prepared", "routed"].includes(u.packetState)) {
      errors.push(`packet ${u.key} has ${u.decisions.length} carried decisions, more than ${MAX_CARRIED}: the person splits it in the brainstorm before it can be prepared (F7).`);
    }
  }
  const build = units.filter(isBuildUnit);
  const slugs = /* @__PURE__ */ new Map();
  for (const u of build.filter((x) => x.form === "intake")) {
    if (slugs.has(u.slug)) errors.push(`packets ${slugs.get(u.slug)} and ${u.key} open the same slug ${u.slug}.`);
    else slugs.set(u.slug, u.key);
  }
  for (const u of units.filter((x) => !isBuildUnit(x))) {
    warnings.push(`packet ${u.key} is a ${u.form}: it runs with the person outside the waves (9.3a), and its dependents wait for it.`);
  }
  return { errors, warnings, single: build.length <= 1 };
}
function planWaves(units, { done = /* @__PURE__ */ new Set(), started = [], stopped = /* @__PURE__ */ new Set(), outsideDone = /* @__PURE__ */ new Set() } = {}) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const waves = started.map((w) => [...w]);
  const placed = /* @__PURE__ */ new Map();
  waves.forEach((w, i) => w.forEach((k) => placed.set(k, i)));
  const satisfied = (d, k) => done.has(d) || outsideDone.has(d) || placed.has(d) && placed.get(d) < k;
  let remaining = units.filter(isBuildUnit).filter((u) => !done.has(u.key) && !placed.has(u.key) && !stopped.has(u.key)).sort(byOrder);
  for (; ; ) {
    const k = waves.length;
    const taken = /* @__PURE__ */ new Set();
    const wave2 = [];
    for (const u of remaining) {
      if (!u.dependsOn.every((d) => satisfied(d, k))) continue;
      const slugs = touchedSlugs(u);
      if ([...slugs].some((s) => taken.has(s))) continue;
      slugs.forEach((s) => taken.add(s));
      wave2.push(u.key);
    }
    if (!wave2.length) break;
    waves.push(wave2);
    wave2.forEach((key) => placed.set(key, k));
    remaining = remaining.filter((u) => !placed.has(u.key));
  }
  const waiting = [];
  for (const key of stopped) if (byKey.has(key) && !done.has(key)) waiting.push({ key, on: [], reason: "stopped" });
  for (const u of remaining) {
    const open = u.dependsOn.filter((d) => !done.has(d) && !outsideDone.has(d) && !placed.has(d));
    const outside2 = open.filter((d) => byKey.has(d) && !isBuildUnit(byKey.get(d)));
    waiting.push(outside2.length ? { key: u.key, on: outside2, reason: "needs-you" } : { key: u.key, on: open, reason: "waits" });
  }
  return { waves, waiting };
}
function deferUnprepared(waveKeys, units, prepared) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const moved = [];
  const out = /* @__PURE__ */ new Set();
  for (const key of waveKeys) if (!prepared.has(key)) {
    out.add(key);
    moved.push({ key, reason: "not prepared" });
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of waveKeys) {
      if (out.has(key)) continue;
      const dep = (byKey.get(key)?.dependsOn ?? []).find((d) => out.has(d));
      if (dep) {
        out.add(key);
        moved.push({ key, reason: `depends on ${dep}` });
        grew = true;
      }
    }
  }
  return { start: waveKeys.filter((k) => !out.has(k)), moved };
}
var DRIFT_RANK = { none: 0, "implementation-detail": 1, contract: 2 };
function classifyDrift(unit2, asBuilt) {
  const lines = unit2.expects.map((e) => {
    const entry = asBuilt?.[e.from]?.lines?.find((l) => l.key === e.key) ?? null;
    const status2 = entry?.status ?? "no-as-built";
    let cls2 = "contract";
    if (status2 === "met") cls2 = "none";
    else if (status2 === "changed" && (entry.class === "implementation-detail" || entry.class === "contract")) cls2 = entry.class;
    return { from: e.from, key: e.key, text: e.text, status: status2, class: cls2, note: entry?.note ?? null };
  });
  const cls = lines.reduce((m, l) => DRIFT_RANK[l.class] > DRIFT_RANK[m] ? l.class : m, "none");
  return { key: unit2.key, class: cls, lines };
}
function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split(".").map((p) => /^\d+$/.test(p) ? Number(p) : p) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre, text: `${m[1]}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ""}` };
}
function compareVersions(a, b) {
  const x = typeof a === "string" ? parseVersion(a) : a;
  const y = typeof b === "string" ? parseVersion(b) : b;
  for (const f of ["major", "minor", "patch"]) if (x[f] !== y[f]) return x[f] - y[f];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === void 0) return -1;
    if (q === void 0) return 1;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1;
    if (typeof q === "number") return 1;
    return String(p).localeCompare(String(q));
  }
  return 0;
}
var sameBase = (v, t) => v.major === t.major && v.minor === t.minor && v.patch === t.patch;
function nextWaveVersion({ target, tags = [], label: label2 = "beta" }) {
  const t = parseVersion(target);
  if (!t || t.pre.length) throw new Error(`the target version "${target}" is not a final x.y.z version`);
  const versions = tags.map(parseVersion).filter(Boolean);
  if (versions.some((v) => sameBase(v, t) && !v.pre.length)) throw new Error(`the target version ${t.text} is already released; ask the person for a new target`);
  let n = 0;
  for (const v of versions) if (sameBase(v, t) && v.pre[0] === label2 && typeof v.pre[1] === "number") n = Math.max(n, v.pre[1]);
  return `${t.text}-${label2}.${n + 1}`;
}
function hotfixVersion({ tags = [] }) {
  const versions = tags.map(parseVersion).filter(Boolean).sort(compareVersions);
  const newest = versions[versions.length - 1];
  if (!newest) throw new Error("no released tag: ask the person for the hotfix version");
  const base = `${newest.major}.${newest.minor}.${newest.patch}`;
  if (!newest.pre.length) return `${newest.major}.${newest.minor}.${newest.patch + 1}`;
  const [label2, n] = newest.pre;
  return `${base}-${label2}.${typeof n === "number" ? n + 1 : 1}`;
}
function buildLabel({ wave: wave2, slug = null, sha }) {
  return `wave-${wave2}${slug ? `.${slug}` : ""}+${String(sha ?? "").slice(0, 7)}`;
}
function newLedger({ brainstorm, revision, units, now = (/* @__PURE__ */ new Date()).toISOString(), stage = "C" }) {
  const plan = planWaves(units);
  const ledger = {
    version: LEDGER_VERSION,
    brainstorm,
    stage,
    "work-revision": revision,
    "created-at": now,
    "updated-at": now,
    answers: Object.fromEntries(SETUP_ANSWERS.map((k) => [k, null])),
    "tool-gaps": [],
    units: {},
    outside: {},
    waves: plan.waves.map((keys, i) => ({ n: i + 1, revision, units: keys, state: "planned", branch: null, pr: null, version: null, label: null, moved: [] })),
    waiting: plan.waiting,
    questions: [],
    pause: null,
    stack: null,
    revisions: [{ revision, at: now, note: "planned from this revision" }]
  };
  for (const u of units) {
    if (isBuildUnit(u)) {
      ledger.units[u.key] = {
        slug: u.slug,
        "work-slug": u.workSlug,
        form: u.form,
        title: u.title,
        order: u.order,
        state: ["prepared", "routed"].includes(u.packetState) ? "prepared" : "planned",
        wave: null,
        route: null,
        merge: null,
        output: null
      };
    } else {
      ledger.outside[u.key] = { slug: u.workSlug, form: u.form, title: u.title, state: "needs-you" };
    }
  }
  plan.waves.forEach((keys, i) => keys.forEach((k) => {
    ledger.units[k].wave = i + 1;
  }));
  return ledger;
}
function replan(ledger, units, { revision = ledger["work-revision"], now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  for (const u of units) {
    if (isBuildUnit(u) && !ledger.units[u.key]) {
      ledger.units[u.key] = { slug: u.slug, "work-slug": u.workSlug, form: u.form, title: u.title, order: u.order, state: ["prepared", "routed"].includes(u.packetState) ? "prepared" : "planned", wave: null, route: null, merge: null, output: null };
    } else if (!isBuildUnit(u) && !ledger.outside[u.key]) {
      ledger.outside[u.key] = { slug: u.workSlug, form: u.form, title: u.title, state: "needs-you" };
    }
  }
  const startedWaves = ledger.waves.filter((w) => w.state !== "planned");
  const done = new Set(Object.entries(ledger.units).filter(([, x]) => ["merged", "shipped"].includes(x.state)).map(([k]) => k));
  const stopped = new Set(Object.entries(ledger.units).filter(([, x]) => ["stopped", "needs-fix"].includes(x.state)).map(([k]) => k));
  const outsideDone = new Set(Object.entries(ledger.outside).filter(([, x]) => x.state === "closed").map(([k]) => k));
  const started = startedWaves.map((w) => w.units.filter((k) => !(w.moved ?? []).some((m) => m.key === k)));
  const plan = planWaves(units, { done, started, stopped, outsideDone });
  const next = plan.waves.slice(startedWaves.length).map((keys, i) => ({
    n: startedWaves.length + i + 1,
    revision,
    units: keys,
    state: "planned",
    branch: null,
    pr: null,
    version: null,
    label: null,
    moved: []
  }));
  ledger.waves = [...startedWaves, ...next];
  for (const w of next) for (const k of w.units) ledger.units[k].wave = w.n;
  for (const w of plan.waiting) if (ledger.units[w.key] && !["stopped", "needs-fix"].includes(ledger.units[w.key].state)) ledger.units[w.key].wave = null;
  ledger.waiting = plan.waiting;
  if (revision !== ledger["work-revision"]) {
    ledger.revisions.push({ revision, at: now, note: "re-planned the waves that had not started" });
    ledger["work-revision"] = revision;
  }
  ledger["updated-at"] = now;
  return ledger;
}
var openSetupAnswer = (ledger) => SETUP_ANSWERS.find((k) => ledger.answers?.[k] === null || ledger.answers?.[k] === void 0) ?? null;
function campaignAction(ledger, { revision = null } = {}) {
  if (!ledger) return { action: "orient" };
  if (ledger.pause) return { action: "paused", pause: ledger.pause };
  const setup = openSetupAnswer(ledger);
  if (setup) return { action: "setup", question: setup };
  if (revision !== null && revision !== ledger["work-revision"]) return { action: "work-changed", from: ledger["work-revision"], to: revision };
  const open = ledger.questions.filter((q) => !q["answered-at"]);
  if (open.length) return { action: "ask", questions: open };
  const unprepared = (w) => w ? w.units.filter((k) => ledger.units[k]?.state === "planned") : [];
  const lives = ledger.waves.filter((w) => LIVE_WAVE_STATES.includes(w.state));
  const live = lives[0];
  const next = ledger.waves.find((w) => w.state === "planned");
  const stacked = ledger.stack?.enabled && next && lives.length && lives.every((w) => ["handoff", "shipping"].includes(w.state)) && lives.length < (ledger.stack["max-unshipped"] ?? DEFAULT_MAX_UNSHIPPED);
  if (stacked) {
    const todo = unprepared(next);
    return todo.length ? { action: "prepare", wave: next.n, units: todo } : { action: "start-wave", wave: next.n, beside: lives.map((w) => w.n) };
  }
  if (live) return { action: "running", wave: live.n, state: live.state, prepare: unprepared(next) };
  const stopped = ledger.waves.find((w) => w.state === "stopped");
  if (stopped) return { action: "stopped", wave: stopped.n };
  if (next) {
    const todo = unprepared(next);
    return todo.length ? { action: "prepare", wave: next.n, units: todo } : { action: "start-wave", wave: next.n };
  }
  const needsYou = Object.entries(ledger.outside).filter(([, x]) => x.state !== "closed").map(([k]) => k);
  if ((ledger.waiting ?? []).length) return { action: "blocked", waiting: ledger.waiting, needsYou };
  if (ledger.phase === "done") return { action: "done" };
  return { action: "end" };
}
function renderLedgerMd(ledger) {
  const L = [];
  L.push(`# Campaign: ${ledger.brainstorm}`, "");
  L.push(`Generated from \`ledger.json\`, which is the truth. Work revision ${ledger["work-revision"]}. Updated ${ledger["updated-at"]}.`, "");
  const act = campaignAction(ledger, {});
  L.push(`Next: **${act.action}**${act.wave ? ` (wave ${act.wave})` : ""}.`, "");
  if (ledger.pause) L.push(`Paused: ${ledger.pause.reason}${ledger.pause.until ? `, until ${ledger.pause.until}` : ""}.`, "");
  L.push("## Setup", "");
  for (const k of SETUP_ANSWERS) {
    const v = ledger.answers[k];
    L.push(`- ${k}: ${v === null || v === void 0 ? "_open_" : typeof v === "object" ? `\`${JSON.stringify(v)}\`` : v}`);
  }
  L.push("");
  L.push("## Waves", "");
  if (!ledger.waves.length) L.push("- None.");
  for (const w of ledger.waves) {
    L.push(`### Wave ${w.n} \u2014 ${w.state}`, "");
    if (w.branch) L.push(`Branch \`${w.branch}\`${w.pr ? `, PR ${w.pr}` : ""}${w.version ? `, version ${w.version}` : w.label ? `, label ${w.label}` : ""}.`, "");
    L.push("| Packet | Slug | Form | State | Route |", "|---|---|---|---|---|");
    for (const k of w.units) {
      const u = ledger.units[k] ?? {};
      L.push(`| ${k} | \`${u.slug ?? "?"}\` | ${u.form ?? "?"} | ${u.state ?? "?"} | ${u.route ?? ""} |`);
    }
    for (const m of w.moved ?? []) L.push(`| ${m.key} | | | moved | ${m.reason} |`);
    L.push("");
  }
  L.push("## Waiting", "");
  const waiting = ledger.waiting ?? [];
  if (!waiting.length) L.push("- None.");
  for (const w of waiting) L.push(`- ${w.key}: ${w.reason}${w.on.length ? ` on ${w.on.join(", ")}` : ""}.`);
  L.push("");
  L.push("## Needs you (outside the waves)", "");
  const outside2 = Object.entries(ledger.outside);
  if (!outside2.length) L.push("- None.");
  for (const [k, x] of outside2) L.push(`- ${k} (${x.form}, \`${x.slug}\`): ${x.state}.`);
  L.push("");
  L.push("## Questions", "");
  if (!ledger.questions.length) L.push("- None.");
  for (const q of ledger.questions) L.push(`- ${q.id}${q.wave ? ` (wave ${q.wave})` : ""}: ${q.text} \u2014 ${q["answered-at"] ? `answered: ${q.answer}` : "**open**"}`);
  L.push("");
  return L.join("\n");
}
function renderContext({ unit: unit2, units, ledger, asBuilt = {}, drift: drift2 = [], isolation = null, localRecords = false }) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const wave2 = ledger?.units?.[unit2.key]?.wave ?? null;
  const pre = [...closure(byKey, unit2.key)].map((k) => byKey.get(k)).filter(Boolean).sort(byOrder);
  const post = units.filter((u) => u.expects.some((e) => e.from === unit2.key)).sort(byOrder);
  const parallel = wave2 ? units.filter((u) => u.key !== unit2.key && ledger.units[u.key]?.wave === wave2).sort(byOrder) : [];
  const L = [];
  L.push(`# Campaign context: ${unit2.slug}`, "");
  L.push(`Packet ${unit2.key} (${unit2.form}) of campaign \`${ledger?.brainstorm ?? "?"}\`, wave ${wave2 ?? "?"}. Read this file fresh, by path, at each stage: the campaign updates it while the run drives.`, "");
  L.push("## 1. This slug's carried decisions", "", "Verbatim, as the person confirmed them in prepare.", "");
  L.push(...unit2.decisions.length ? unit2.decisions.map((d) => `- **${d.key}** \u2014 ${d.text}${d["decided-at"] ? ` (${d["decided-at"]})` : ""}`) : ["- None."], "");
  L.push("This slug provides:", "");
  L.push(...unit2.provides.length ? unit2.provides.map((p) => `- \`${p.key}\`: ${p.text}`) : ["- Nothing named."], "");
  const directPre = new Set(unit2.dependsOn);
  const preLines = [];
  for (const u of pre) {
    const note = asBuilt[u.key];
    if (!directPre.has(u.key) && pre.length + post.length > 0 && preLinesTooLong(pre, post)) {
      preLines.push(`- ${u.key} \`${u.slug}\`${note?.path ? ` \u2014 [as-built](${note.path})` : ""}`);
      continue;
    }
    preLines.push(`### ${u.key} \`${u.slug}\`${note?.path ? ` \u2014 [as-built](${note.path})` : " \u2014 not merged yet"}`, "");
    const diffs = (note?.lines ?? []).filter((l) => l.status !== "met");
    for (const d of diffs) preLines.push(`- **Differs:** \`${d.key}\` is ${d.status}${d.note ? `: ${d.note}` : ""}.`);
    preLines.push(...u.provides.length ? u.provides.map((p) => `- Provides \`${p.key}\`: ${p.text}`) : ["- Provides nothing named."], "");
  }
  for (const k of /* @__PURE__ */ new Set([...unit2.writtenDeps ?? [], ...(unit2.writtenExpects ?? []).map((e) => e.from)])) {
    preLines.push(`### ${k} \u2014 written in the brainstorm session`, "");
    const exps = (unit2.writtenExpects ?? []).filter((e) => e.from === k);
    preLines.push(...exps.length ? exps.map((e) => `- Expects \`${e.key}\`: ${e.text}`) : ["- Expects nothing named."], "");
  }
  L.push("## 2. Preceding slugs", "", "What this slug builds on. A difference between the as-built note and a provides line comes first.", "");
  L.push(...preLines.length ? preLines : ["- None.", ""]);
  L.push("## 3. Succeeding slugs", "", "Do not break these lines. Plan treats each one as a Known Constraint. A plan fork that would break one is intent-bearing.", "");
  const postLines = [];
  for (const u of post) for (const e of u.expects.filter((x) => x.from === unit2.key)) postLines.push(`- ${u.key} \`${u.slug}\` expects \`${e.key}\`: ${e.text}`);
  L.push(...postLines.length ? postLines : ["- None."], "");
  L.push("## 4. Parallel slugs", "", "The other slugs of this wave. They have not merged yet.", "");
  L.push(...parallel.length ? parallel.map((u) => `- ${u.key} \`${u.slug}\`: ${u.provides.map((p) => p.text).join("; ") || "provides nothing named"}`) : ["- None."], "");
  L.push("## 5. Drift notes", "", "Implementation-detail differences that the drift check recorded for this slug.", "");
  L.push(...drift2.length ? drift2.map((d) => `- \`${d.from}/${d.key}\` (${d.text}): ${d.note ?? d.status}`) : ["- None."], "");
  L.push("## 6. Isolation", "");
  L.push(isolation ? isolation.startsWith("- ") ? isolation : `- ${isolation}` : "- Width 1, in the main checkout. No port base, no own build folder, no heavy-suite lock.", "");
  if (localRecords) L.push("- Local records: this repo does not track `.ai/`. Do not stage or commit a file under `.ai/`. The campaign copies the records back to the main checkout.", "");
  return L.join("\n");
}
function isolationOf(config) {
  const iso = config?.campaign?.isolation;
  if (!iso || typeof iso !== "object") return null;
  const ports = iso["port-env"];
  if (!ports || typeof ports !== "object" || Array.isArray(ports)) return null;
  if (!Array.isArray(iso["build-dirs"])) return null;
  return {
    parallel: iso.parallel !== false,
    "port-env": ports,
    "build-dirs": iso["build-dirs"],
    "heavy-suites": Array.isArray(iso["heavy-suites"]) ? iso["heavy-suites"] : [],
    "min-free-gb": Number.isFinite(iso["min-free-gb"]) ? iso["min-free-gb"] : 20
  };
}
function portsFor(isolation, index) {
  return Object.fromEntries(Object.entries(isolation?.["port-env"] ?? {}).map(([k, base]) => [k, Number(base) + 100 * index]));
}
function effectiveWidth({ width = DEFAULT_WIDTH, isolation, budget: budget2 = "unknown" }) {
  if (budget2 === "pause") return 0;
  if (!isolation || isolation.parallel === false) return 1;
  if (budget2 === "slow") return 1;
  return Math.max(1, Number(width) || 1);
}
function isolationText(isolation, { index, worktree: worktree2, lockCmd, slug = "<slug>" }) {
  const ports = Object.entries(portsFor(isolation, index)).map(([k, v]) => `\`${k}=${v}\``).join(", ");
  const L = [];
  L.push(`- Worktree: \`${worktree2}\`. Run every command there. Never write in the main checkout or in another worktree.`);
  if (ports) L.push(`- Ports: set ${ports} in the environment of every command that starts the app or the tests.`);
  if (isolation["build-dirs"].length) L.push(`- Build folders: ${isolation["build-dirs"].map((d) => `\`${d}\``).join(", ")} stay inside this worktree. Never point a build at another worktree's folder.`);
  for (const suite of isolation["heavy-suites"]) {
    L.push(`- Heavy suite \`${suite}\` runs only under the lock. Run \`${lockCmd} acquire ${slug}\` first. When it answers busy, wait, append a \`lock-wait\` line to the driver journal every 5 minutes, and try again. Run \`${lockCmd} release ${slug}\` after the suite ends, also when it fails.`);
  }
  return L.join("\n");
}
function waveBase(ledger, n, trunk) {
  if (!ledger.stack?.enabled) return trunk;
  const below = ledger.waves.filter((w) => w.n < n && w.state !== "shipped" && w.state !== "planned").sort((a, b) => b.n - a.n)[0];
  return below ? below.branch ?? `campaign/${ledger.brainstorm}/wave-${below.n}` : trunk;
}
function newestReading(readings2) {
  return (readings2 ?? []).filter((r) => r && r.at && Array.isArray(r.rateLimits)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
}
function budgetState(reading, budget2 = DEFAULT_BUDGET, { now = Date.now(), staleMs = READING_STALE_MS } = {}) {
  const b = { ...DEFAULT_BUDGET, ...budget2 ?? {} };
  if (!reading || !Array.isArray(reading.rateLimits) || !reading.rateLimits.length) return { state: "unknown", reason: "no reading" };
  const age = now - Date.parse(reading.at);
  if (!Number.isFinite(age) || age > staleMs) return { state: "unknown", reason: `the newest reading is older than ${Math.round(staleMs / 6e4)} minutes` };
  const win = (kind) => reading.rateLimits.find((r) => r.kind === kind);
  const five = win("five_hour");
  const seven = win("seven_day");
  if (seven && seven.percentUsed >= 100 - b.sevenDayReserve) {
    return { state: "pause", until: seven.resetsAt ?? null, reason: `7-day window at ${seven.percentUsed}%: the last ${b.sevenDayReserve}% is the person's reserve`, windows: reading.rateLimits };
  }
  if (five && five.percentUsed >= b.fiveHourPause) return { state: "pause", until: five.resetsAt ?? null, reason: `5-hour window at ${five.percentUsed}%`, windows: reading.rateLimits };
  if (five && five.percentUsed >= b.fiveHourSlow) return { state: "slow", reason: `5-hour window at ${five.percentUsed}%`, windows: reading.rateLimits };
  return { state: "ok", windows: reading.rateLimits };
}
function preLinesTooLong(pre, post) {
  const lines = pre.reduce((n, u) => n + 3 + u.provides.length, 0) + post.reduce((n, u) => n + u.expects.length, 0);
  return lines > CONTEXT_LONG_LINES;
}
var median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function stageMinutesFromJournals(journals) {
  const per = {};
  for (const lines of journals) {
    const open = /* @__PURE__ */ new Map();
    for (const l of lines) {
      const stage = String(l.agent ?? "").split(":")[0];
      const at = Date.parse(l.at ?? "");
      if (!["plan", "implement", "verify", "review"].includes(stage) || !Number.isFinite(at)) continue;
      const id = `${l.run}|${l.agent}`;
      if (l.event === "agent-start") open.set(id, { stage, at });
      else if (l.event === "agent-end" && open.has(id)) {
        const s = open.get(id);
        open.delete(id);
        (per[s.stage] ??= []).push((at - s.at) / 6e4);
      }
    }
  }
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, median(v)]));
}
function rowTokens(row) {
  const sum = (u) => u ? ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "cached_input_tokens", "cache_write_input_tokens", "reasoning_output_tokens"].reduce((n, f) => n + (Number(u[f]) || 0), 0) : 0;
  return sum(row?.main) + (row?.subagents ?? []).reduce((n, s) => n + sum(s), 0);
}
function buildForecast({ units, history, slices = {} }) {
  const perSlice = ["plan", "implement", "verify"].map((s) => history.stageMinutes?.[s]);
  const sliceMinutes = perSlice.every((x) => Number.isFinite(x)) ? perSlice.reduce((a, b) => a + b, 0) : null;
  const review = history.stageMinutes?.review ?? null;
  const rows = units.filter(isBuildUnit).sort(byOrder).map((u) => {
    const n = slices[u.key] ?? history.slicesPerSlug ?? null;
    const known = Number.isFinite(n) && sliceMinutes !== null;
    return {
      key: u.key,
      slug: u.slug,
      slices: n,
      slicesFrom: slices[u.key] ? "slice" : n ? "history" : "unknown",
      minutes: known ? Math.round(n * sliceMinutes + (review ?? 0)) : null,
      tokens: Number.isFinite(n) && Number.isFinite(history.sliceTokens) ? Math.round(n * history.sliceTokens) : null
    };
  });
  const sum = (f) => rows.every((r) => r[f] !== null) ? rows.reduce((a, r) => a + r[f], 0) : null;
  return { rows, minutes: sum("minutes"), tokens: sum("tokens"), unknown: rows.filter((r) => r.minutes === null).map((r) => r.key) };
}
function renderForecast(fc, { brainstorm, now = (/* @__PURE__ */ new Date()).toISOString(), actual = [] } = {}) {
  const L = [`# Forecast: ${brainstorm}`, "", `Written ${now}. This is an estimate from earlier yolo runs in this repository, not a promise. The campaign updates it after each wave with the real numbers.`, ""];
  L.push("| Packet | Slug | Slices | Minutes | Tokens |", "|---|---|---|---|---|");
  for (const r of fc.rows) L.push(`| ${r.key} | \`${r.slug}\` | ${r.slices ?? "unknown"}${r.slicesFrom === "history" ? " (from history)" : ""} | ${r.minutes ?? "unknown"} | ${r.tokens ?? "unknown"} |`);
  L.push("");
  L.push(`- Total run time: ${fc.minutes !== null ? `about ${Math.round(fc.minutes / 60)} hours (${fc.minutes} minutes) at width 1` : "unknown: some slugs have no history"}.`);
  L.push(`- Total tokens: ${fc.tokens !== null ? fc.tokens.toLocaleString("en-US") : "unknown"}.`);
  L.push(`- Unknown estimates: ${fc.unknown.length ? fc.unknown.join(", ") : "none"}.`);
  L.push("- Weeks of the 7-day limit: unknown until the usage guard records readings (Stage D3).", "");
  if (actual.length) {
    L.push("## Actual, per wave", "", "| Wave | Minutes | Tokens |", "|---|---|---|");
    for (const a of actual) L.push(`| ${a.wave} | ${a.minutes ?? "unknown"} | ${a.tokens ?? "unknown"} |`);
    L.push("");
  }
  return L.join("\n");
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
function recordsIn({ main: main2, worktree: worktree2, manifest, exclude = () => false, pristine = () => false }) {
  const src = walk(join(main2, ".ai"));
  const dst = walk(join(worktree2, ".ai"));
  const res = { copied: [], refreshed: [], same: 0, keptInWorktree: [], deletedInWorktree: [], tracked: [] };
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const mh = hashFile(abs);
    const e = manifest.files[rel];
    const target = join(worktree2, ".ai", ...rel.split("/"));
    if (!dst.files.has(rel)) {
      if (e?.base) {
        res.deletedInWorktree.push(rel);
        continue;
      }
      copyVerified(abs, target, mh);
      entryOf(manifest, rel).base = mh;
      res.copied.push(rel);
      continue;
    }
    const wh = hashFile(dst.files.get(rel));
    if (wh === mh) {
      entryOf(manifest, rel).base = mh;
      res.same++;
      continue;
    }
    if (pristine(rel)) {
      const t = entryOf(manifest, rel);
      if (!t.base) t.base = wh;
      res.tracked.push(rel);
      continue;
    }
    if (e?.base && wh === e.base) {
      copyVerified(abs, target, mh);
      e.base = mh;
      res.refreshed.push(rel);
      continue;
    }
    res.keptInWorktree.push(rel);
  }
  return res;
}
function recordsOut({ main: main2, worktree: worktree2, manifest, conflictsDir, exclude = () => false }) {
  const src = walk(join(worktree2, ".ai"));
  const res = { copied: [], same: 0, unchanged: 0, conflicts: [], deletedInWorktree: [], links: src.links.filter((r) => !isSkipped(r)) };
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const wh = hashFile(abs);
    const target = join(main2, ".ai", ...rel.split("/"));
    const mh = existsSync(target) ? hashFile(target) : null;
    const e = entryOf(manifest, rel);
    if (mh === wh) {
      e.base = wh;
      res.same++;
      continue;
    }
    if (e.base && wh === e.base) {
      res.unchanged++;
      continue;
    }
    if (mh === null || e.base && mh === e.base) {
      const now = existsSync(target) ? hashFile(target) : null;
      if (now === mh) {
        copyVerified(abs, target, wh);
        e.base = wh;
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
    e.base = wh;
    res.conflicts.push({ rel, kept: posix(kept), merged });
  }
  for (const [rel, e] of Object.entries(manifest.files)) {
    if (e.base && !src.files.has(rel) && !isSkipped(rel) && !exclude(rel)) res.deletedInWorktree.push(rel);
  }
  return res;
}
function recordsPending({ main: main2, worktree: worktree2, manifest, exclude = () => false }) {
  const src = walk(join(worktree2, ".ai"));
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
var USAGE = "Usage: campaign.mjs <orient|status|replan|answer|unit|outside|wave|ask|reply|pause|resume|context|drift|version|label|journal|forecast|budget|worktree|lock|stack> <projectRoot> <brainstorm> ...";
var PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
var brainstormDir = (root, b) => join2(root, ".ai", "workflows", b);
var workDir = (root, b) => join2(brainstormDir(root, b), "work");
var campDir = (root, b) => join2(workDir(root, b), "campaign");
var ledgerPath = (root, b) => join2(campDir(root, b), "ledger.json");
var journalPath = (root, b) => join2(campDir(root, b), ".campaign-journal.jsonl");
var controlPath = (root, b) => join2(campDir(root, b), ".control.json");
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
function writeAtomic(file, text) {
  mkdirSync2(join2(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync2(tmp, text);
  renameSync2(tmp, file);
}
function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}
function readWorkSet(root, b) {
  const dir = workDir(root, b);
  const indexFile = join2(dir, "index.md");
  if (!existsSync2(indexFile)) return { error: `no work set: ${relative(root, indexFile)} does not exist. End the brainstorm with done first.` };
  let index = safeParseFrontmatter(readFileSync2(indexFile, "utf8")).data;
  if (!index) index = safeParseFrontmatter(readFileSync2(indexFile, "utf8")).data;
  if (!index) return { error: "work/index.md does not parse; read it again at the next boundary." };
  const packets = [];
  for (const file of readdirSync2(dir)) {
    if (!file.endsWith(".md") || file === "index.md" || file === "changes.md") continue;
    const data = safeParseFrontmatter(readFileSync2(join2(dir, file), "utf8")).data;
    if (data?.type === "work-packet") packets.push({ ...data, file: `work/${file}` });
  }
  const written = Array.isArray(index.written) ? index.written.map(String) : [];
  return { revision: Number(index["work-revision"]) || 0, index, packets, written };
}
var unitsOf = (ws) => ws.packets.map((p) => unitOf(p, { written: ws.written }));
function loadLedger(root, b) {
  const p = ledgerPath(root, b);
  return existsSync2(p) ? JSON.parse(readFileSync2(p, "utf8")) : null;
}
function saveLedger(root, b, ledger) {
  ledger["updated-at"] = nowIso();
  writeAtomic(ledgerPath(root, b), `${JSON.stringify(ledger, null, 2)}
`);
  writeAtomic(join2(campDir(root, b), "ledger.md"), renderLedgerMd(ledger));
}
function requireLedger(root, b) {
  const l = loadLedger(root, b);
  if (!l) throw new Error(`no campaign ledger for ${b}: run orient first`);
  return l;
}
function appendJournal(root, b, event, extra = {}) {
  const line = { at: nowIso(), event, ...extra };
  mkdirSync2(campDir(root, b), { recursive: true });
  appendFileSync(journalPath(root, b), `${JSON.stringify(line)}
`);
  return line;
}
function readJson(file) {
  try {
    return JSON.parse(readFileSync2(file, "utf8"));
  } catch {
    return null;
  }
}
function readJsonl(file) {
  try {
    return readFileSync2(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
function forecastHistory(root) {
  const wfRoot = join2(root, ".ai", "workflows");
  const journals = [];
  const sliceTokens = [];
  const slicesPerSlug = [];
  let slugs = [];
  try {
    slugs = readdirSync2(wfRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
  }
  for (const slug of slugs) {
    const j = readJsonl(join2(wfRoot, slug, ".driver-journal.jsonl"));
    if (j.length) journals.push(j);
    const cost = readJsonl(join2(wfRoot, slug, "cost.jsonl"));
    const n = sliceCount(root, slug);
    if (n) slicesPerSlug.push(n);
    if (cost.length && n) sliceTokens.push(cost.reduce((a, r) => a + rowTokens(r), 0) / n);
  }
  const med = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return { stageMinutes: stageMinutesFromJournals(journals), sliceTokens: med(sliceTokens), slicesPerSlug: med(slicesPerSlug), journals: journals.length };
}
function sliceCount(root, slug) {
  const idx = join2(root, ".ai", "workflows", slug, "00-index.md");
  if (!existsSync2(idx)) return null;
  const data = safeParseFrontmatter(readFileSync2(idx, "utf8")).data;
  const s = data?.slices;
  return Array.isArray(s) && s.length ? s.length : null;
}
function shipPlan(root) {
  const p = join2(root, ".ai", "ship-plan.md");
  if (!existsSync2(p)) return null;
  const d = safeParseFrontmatter(readFileSync2(p, "utf8")).data ?? {};
  return {
    "version-scheme": d["version-scheme"] ?? null,
    "version-source-of-truth": d["version-source-of-truth"] ?? null,
    "version-bump-cmd": d["version-bump-cmd"] ?? null,
    "release-trigger": d["release-trigger"] ?? null,
    "rollout-stages": d["rollout-stages"] ?? null
  };
}
function trunkOf(root) {
  const head = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head) return head.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(root, ["rev-parse", "--verify", "--quiet", b]) !== null) return b;
  return "main";
}
function flags(args) {
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      f[args[i].slice(2)] = args[i + 1];
      i++;
    } else pos.push(args[i]);
  }
  return { pos, f };
}
function orient(root, b) {
  if (loadLedger(root, b)) return { ok: false, error: "a ledger exists: use status (the campaign infers its phase from the ledger)" };
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const check = checkCampaignSet(units);
  if (check.single) {
    const only = units.find(isBuildUnit);
    return { ok: false, single: true, error: "the work set has one build packet: that is not a campaign.", start: only ? `/wf intake .ai/workflows/${b}/${only.file}` : null };
  }
  if (check.errors.length) return { ok: false, errors: check.errors, warnings: check.warnings };
  const cfg = readJson(join2(root, ".ai", "sdlc-config.json")) ?? {};
  const ignored = cfg.artifactTracking === "ignored" || git(root, ["check-ignore", "-q", ".ai/workflows"]) !== null;
  const ledger = newLedger({ brainstorm: b, revision: ws.revision, units, now: nowIso() });
  ledger.records = ignored ? "local" : "tracked";
  if (ignored) check.warnings.push("the repo does not track .ai/: the records stay in the main checkout. Each worktree gets a copy, and its changes come back before the worktree is removed (local records). The wave PR text and the code are still public.");
  ledger["ship-plan"] = shipPlan(root);
  ledger.trunk = trunkOf(root);
  ledger["run-id"] = `${nowIso().replace(/[-:]/g, "").replace(/\.\d+/, "")}-${b}`;
  if (ledger["ship-plan"] === null || ledger["ship-plan"]["version-scheme"] === "none") ledger.answers["target-version"] = "none";
  if (ledger["ship-plan"] === null) ledger["tool-gaps"].push({ tool: "ship-plan", have: "none", need: ".ai/ship-plan.md", fix: "/wf ship-plan init" });
  const cliOk = claudeVersionGap();
  if (cliOk) ledger["tool-gaps"].push(cliOk);
  const stackVersion = ghStackVersion();
  const stackOk = stackVersion !== null && compareSemver(stackVersion, "0.1.0") >= 0;
  if (stackVersion !== null && !stackOk) ledger["tool-gaps"].push({ tool: "gh-stack", have: stackVersion, need: "0.1.0", fix: "gh extension upgrade stack" });
  ledger.stack = { enabled: stackOk && cfg.campaign?.stack !== false, number: null, "max-unshipped": cfg.campaign?.["max-unshipped"] ?? DEFAULT_MAX_UNSHIPPED };
  const history = forecastHistory(root);
  const slices = Object.fromEntries(units.filter(isBuildUnit).map((u) => [u.key, sliceCount(root, u.slug)]).filter(([, n]) => n));
  const fc = buildForecast({ units, history, slices });
  ledger.forecast = { minutes: fc.minutes, tokens: fc.tokens, unknown: fc.unknown, journals: history.journals };
  saveLedger(root, b, ledger);
  writeAtomic(join2(campDir(root, b), "forecast.md"), renderForecast(fc, { brainstorm: b, now: nowIso() }));
  appendJournal(root, b, "campaign-orient", { revision: ws.revision, waves: ledger.waves.length });
  return { ok: true, records: ledger.records, waves: ledger.waves.map((w) => w.units), waiting: ledger.waiting, outside: Object.keys(ledger.outside), warnings: check.warnings, forecast: ledger.forecast, toolGaps: ledger["tool-gaps"], next: campaignAction(ledger, { revision: ws.revision }) };
}
function claudeVersionGap() {
  const r = process.platform === "win32" ? spawnSync("claude --version", { encoding: "utf8", windowsHide: true, shell: true }) : spawnSync("claude", ["--version"], { encoding: "utf8" });
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(r.stdout ?? "");
  if (!m) return null;
  const [maj, min, pat] = m.slice(1).map(Number);
  const ok = maj > 2 || maj === 2 && (min > 1 || min === 1 && pat >= 287);
  return ok ? null : { tool: "claude-code", have: m[0], need: "2.1.287", fix: "update Claude Code" };
}
function ghStackVersion() {
  if (process.env.SDLC_CAMPAIGN_SKIP_TOOLS === "1") return null;
  const r = spawnSync("gh", ["extension", "list"], { encoding: "utf8", windowsHide: true });
  const line = (r.stdout ?? "").split(/\r?\n/).find((l) => /gh-stack/.test(l));
  const m = line ? /v?(\d+\.\d+\.\d+)/.exec(line) : null;
  return m ? m[1] : null;
}
function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
var configOf = (root) => readJson(join2(root, ".ai", "sdlc-config.json")) ?? {};
var usageDir = () => process.env.SDLC_USAGE_DIR || join2(homedir(), ".claude", "sdlc", "usage");
function readings() {
  const dir = usageDir();
  if (!existsSync2(dir)) return [];
  return readdirSync2(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(join2(dir, f)));
}
function budget(root, b) {
  const ledger = requireLedger(root, b);
  const cfg = configOf(root);
  const reading = newestReading(readings());
  const st = budgetState(reading, ledger.answers.budget ?? DEFAULT_BUDGET, { now: Date.now() });
  const isolation = isolationOf(cfg);
  const width = effectiveWidth({ width: cfg.campaign?.width ?? DEFAULT_WIDTH, isolation, budget: st.state });
  return { ok: true, ...st, width, readingAt: reading?.at ?? null, isolation: isolation !== null };
}
var worktreeRoot = (root, ledger) => join2(root, ".scratch", "cw", String(ledger["run-id"] ?? "run").split("-")[0]);
var gitLong = (root, args) => spawnSync("git", ["-c", "core.longpaths=true", "-C", root, ...args], { encoding: "utf8", windowsHide: true });
var commitOf = (root, ref) => {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
};
var recordsDir = (root, b) => join2(campDir(root, b), "records");
var manifestFile = (root, b, id) => join2(recordsDir(root, b), `${id}.json`);
var isLocal = (ledger) => ledger?.records === "local";
var WORKTREE_IGNORE = "# written by /wf campaign (local records): the records in this worktree stay out of git\n*\n";
var isAiIgnore = (rel) => rel === ".gitignore";
var mainOwned = (b) => (rel) => isAiIgnore(rel) || rel.startsWith(`workflows/${b}/work/campaign/`);
var EVIDENCE_RE = /^workflows\/([^/]+)\/[^/]+-evidence(\/|$)/;
var notCopiedIn = (b, slugs) => (rel) => {
  if (mainOwned(b)(rel)) return true;
  const m = EVIDENCE_RE.exec(rel);
  return Boolean(m) && !slugs.includes(m[1]);
};
var slugsOf = (ledger, w, u) => w ? w.units.map((k) => ledger.units[k]?.slug ?? k) : [u.slug];
function committedAs(path) {
  const list = (args) => {
    const r = spawnSync("git", ["-C", path, ...args, "-z", "--", ".ai"], { encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error(`records: git ${args.join(" ")} failed in ${path}: ${(r.stderr || "").trim()}`);
    return r.stdout.split("\0").filter(Boolean).map((p) => p.replace(/^\.ai\//, ""));
  };
  const changed = /* @__PURE__ */ new Set([...list(["diff", "--name-only"]), ...list(["diff", "--cached", "--name-only"])]);
  const clean = new Set(list(["ls-files"]).filter((p) => !changed.has(p)));
  return (rel) => clean.has(rel);
}
function syncIn(root, b, id, path, slugs) {
  return withRecordsLock(join2(recordsDir(root, b), ".lock"), id, () => {
    const ignoreFile = join2(path, ".ai", ".gitignore");
    mkdirSync2(join2(path, ".ai"), { recursive: true });
    const tracked = spawnSync("git", ["-C", path, "ls-files", "--error-unmatch", ".ai/.gitignore"], { encoding: "utf8", windowsHide: true }).status === 0;
    const have = existsSync2(ignoreFile) ? readFileSync2(ignoreFile, "utf8") : "";
    if (!tracked && !have.split(/\r?\n/).includes("*")) writeFileSync2(ignoreFile, WORKTREE_IGNORE);
    const manifest = loadManifest(manifestFile(root, b, id), id);
    manifest.worktree = path;
    const res = recordsIn({ main: root, worktree: path, manifest, exclude: notCopiedIn(b, slugs), pristine: committedAs(path) });
    saveManifest(manifestFile(root, b, id), manifest, nowIso());
    const st = spawnSync("git", ["-C", path, "status", "--porcelain", "--untracked-files=all", "--", ".ai"], { encoding: "utf8", windowsHide: true });
    const visible = st.status === 0 ? st.stdout.split(/\r?\n/).filter((l) => l.startsWith("?? ")).map((l) => l.slice(3)) : ["(git status failed)"];
    if (visible.length) res.visibleToGit = visible;
    return res;
  });
}
function syncOut(root, b, id, path) {
  return withRecordsLock(join2(recordsDir(root, b), ".lock"), id, () => {
    const manifest = loadManifest(manifestFile(root, b, id), id);
    const conflictsDir = join2(recordsDir(root, b), "conflicts", id, nowIso().replace(/[-:]/g, ""));
    const res = recordsOut({ main: root, worktree: path, manifest, conflictsDir, exclude: isAiIgnore });
    saveManifest(manifestFile(root, b, id), manifest, nowIso());
    if (res.copied.length || res.conflicts.length) appendJournal(root, b, "records-out", { id, copied: res.copied.length, conflicts: res.conflicts.map((c) => c.rel) });
    return res;
  });
}
function removeWorktree(root, b, ledger, id, path) {
  let records = null;
  if (isLocal(ledger)) {
    records = syncOut(root, b, id, path);
    const pending = recordsPending({ main: root, worktree: path, manifest: loadManifest(manifestFile(root, b, id), id), exclude: isAiIgnore });
    if (pending.length) return { ok: false, error: `${pending.length} file(s) in the worktree exist nowhere else, so the worktree stays. Ask the person.`, pending, records };
  } else {
    const wf = join2(path, ".ai", "workflows");
    if (existsSync2(wf)) for (const d of readdirSync2(wf)) rmSync2(join2(wf, d, ".watch-state.json"), { force: true });
  }
  const st = spawnSync("git", ["-C", path, "status", "--porcelain", "--ignored=matching"], { encoding: "utf8", windowsHide: true });
  if (st.status !== 0) return { ok: false, error: `git status failed in ${path}: ${(st.stderr || "").trim()}`, records };
  const risk = ignoredAtRisk(st.stdout, isolationOf(configOf(root))?.["build-dirs"] ?? []);
  if (risk.length) return { ok: false, error: "git worktree remove deletes ignored files without asking, and these are not build folders. Ask the person: copy what they need into the main checkout, or name the folder in campaign.isolation.build-dirs, then remove again.", ignored: risk, records };
  const r = spawnSync("git", ["-C", root, "worktree", "remove", path], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return { ok: false, error: `git refused to remove ${path}: ${(r.stderr || "").trim()}. Ask the person; do not force.`, records };
  return { ok: true, removed: true, records };
}
function worktree(root, b, args) {
  const res = worktreeStep(root, b, args);
  const visible = res.records?.visibleToGit ?? [];
  if (!visible.length) return res;
  return { ...res, ok: false, error: `git can stage ${visible.length} copied record(s) in this worktree, so a commit there could publish them. Do not drive, hand off or ship in this worktree. Ask the person.` };
}
function worktreeStep(root, b, [key, action]) {
  const ledger = requireLedger(root, b);
  const waveN = /^wave-(\d+)$/.exec(key ?? "")?.[1];
  const w = waveN ? ledger.waves.find((x) => x.n === Number(waveN)) : null;
  if (waveN && !w) throw new Error(`worktree: no wave ${waveN}`);
  const u = waveN ? null : ledger.units[key];
  if (!waveN && !u) throw new Error(`worktree: ${key} is not a build unit of this campaign`);
  if (!["add", "refresh", "sync", "remove"].includes(action)) throw new Error("worktree: the action is add, refresh, sync or remove");
  const local = isLocal(ledger);
  const holder = w ?? u;
  const slugs = slugsOf(ledger, w, u);
  if (action !== "add") {
    if (!holder.worktree) return { ok: true, removed: false, synced: false, reason: local ? "no worktree: the drive wrote in the main checkout" : "no worktree" };
    if (action === "remove") {
      const res = removeWorktree(root, b, ledger, key, holder.worktree.path);
      if (res.ok) {
        delete holder.worktree;
        saveLedger(root, b, ledger);
      }
      return res;
    }
    if (!local) return { ok: true, synced: false, reason: "the repo tracks .ai/: the records travel in commits" };
    return { ok: true, records: action === "sync" ? syncOut(root, b, key, holder.worktree.path) : syncIn(root, b, key, holder.worktree.path, slugs) };
  }
  if (w) {
    if (!w.branch) throw new Error(`worktree: wave ${w.n} has no branch yet`);
    const path2 = w.worktree && existsSync2(w.worktree.path) ? w.worktree.path : join2(worktreeRoot(root, ledger), key);
    if (!existsSync2(path2)) {
      mkdirSync2(worktreeRoot(root, ledger), { recursive: true });
      const r2 = gitLong(root, ["worktree", "add", path2, w.branch]);
      if (r2.status !== 0) return { ok: false, error: `git worktree add failed: ${(r2.stderr || "").trim()}` };
    }
    w.worktree = { path: path2, branch: w.branch };
    saveLedger(root, b, ledger);
    return { ok: true, ...w.worktree, ...local ? { records: syncIn(root, b, key, path2, slugs) } : {} };
  }
  const iso = isolationOf(configOf(root));
  if (!iso) return { ok: false, error: "no usable isolation contract (campaign.isolation in .ai/sdlc-config.json): drive this slug in the main checkout at width 1" };
  const uw = ledger.waves.find((x) => x.n === u.wave);
  if (!uw || uw.state !== "running" || !uw.branch) throw new Error(`worktree: wave ${u.wave} of ${key} is not running`);
  if (u.worktree && existsSync2(u.worktree.path)) return { ok: true, ...u.worktree, reused: true, ...local ? { records: syncIn(root, b, key, u.worktree.path, slugs) } : {} };
  const base = worktreeRoot(root, ledger);
  mkdirSync2(base, { recursive: true });
  const freeGb = statfsSync(base).bavail * statfsSync(base).bsize / 1024 ** 3;
  if (freeGb < iso["min-free-gb"]) return { ok: false, wait: true, error: `${freeGb.toFixed(1)} GB free, below min-free-gb ${iso["min-free-gb"]}: wait until a merged slug's worktree is removed` };
  const index = [...uw.units].sort((a, c) => (ledger.units[a].order ?? 0) - (ledger.units[c].order ?? 0)).indexOf(key);
  const branch = `campaign/${b}/wave-${uw.n}--${u.slug}`;
  const path = join2(base, `w${uw.n}-${index + 1}`);
  const had = commitOf(root, `refs/heads/${branch}`);
  if (had && spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", uw.branch, branch], { windowsHide: true }).status !== 0) {
    return { ok: false, error: `the branch ${branch} exists and does not contain the wave branch ${uw.branch}, so it comes from another run. Ask the person: delete it, or rename it, then add again.` };
  }
  const r = gitLong(root, had ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, uw.branch]);
  if (r.status !== 0) {
    if (!had && commitOf(root, `refs/heads/${branch}`) === commitOf(root, uw.branch)) spawnSync("git", ["-C", root, "branch", "-D", branch], { encoding: "utf8", windowsHide: true });
    return { ok: false, error: `git worktree add failed: ${(r.stderr || "").trim()}` };
  }
  u.worktree = { path, branch, index, ports: portsFor(iso, index) };
  saveLedger(root, b, ledger);
  let records = null;
  if (local) records = syncIn(root, b, key, path, slugs);
  else {
    const src = join2(root, ".ai", "workflows", u.slug);
    const dest = join2(path, ".ai", "workflows", u.slug);
    if (existsSync2(src) && !existsSync2(dest)) cpSync(src, dest, { recursive: true });
  }
  appendJournal(root, b, "worktree", { key, slug: u.slug, path, branch, index });
  return { ok: true, ...u.worktree, ...records ? { records } : {} };
}
var LOCK_STALE_MS = 3 * 60 * 60 * 1e3;
function lock(root, b, [action, holder]) {
  if (!holder) throw new Error("lock: give the holder (the slug)");
  const file = join2(root, ".scratch", "campaign", "heavy.lock");
  mkdirSync2(join2(file, ".."), { recursive: true });
  const cur = readJson(file);
  if (action === "release") {
    if (!cur || cur.holder !== holder) return { ok: true, released: false, holder: cur?.holder ?? null };
    rmSync2(file, { force: true });
    return { ok: true, released: true };
  }
  if (action !== "acquire") throw new Error("lock: the action is acquire or release");
  if (cur && cur.holder !== holder && Date.now() - Date.parse(cur.at) < LOCK_STALE_MS) return { ok: true, acquired: false, holder: cur.holder, since: cur.at };
  if (!cur || cur.holder !== holder) {
    try {
      writeFileSync2(file, JSON.stringify({ holder, at: nowIso() }), { flag: cur ? "w" : "wx" });
    } catch {
      const now = readJson(file);
      return { ok: true, acquired: false, holder: now?.holder ?? null, since: now?.at ?? null };
    }
  }
  return { ok: true, acquired: true, holder };
}
function stack(root, b, [action, value]) {
  const ledger = requireLedger(root, b);
  ledger.stack = { enabled: false, number: null, "max-unshipped": DEFAULT_MAX_UNSHIPPED, ...ledger.stack ?? {} };
  if (action === "enable") ledger.stack.enabled = true;
  else if (action === "disable") ledger.stack.enabled = false;
  else if (action === "set") {
    if (!/^\d+$/.test(value ?? "")) throw new Error("stack set: give the stack number");
    ledger.stack.number = Number(value);
  } else throw new Error("stack: the action is enable, disable, or set <number>");
  saveLedger(root, b, ledger);
  return { ok: true, stack: ledger.stack };
}
function status(root, b) {
  const ledger = loadLedger(root, b);
  const ws = readWorkSet(root, b);
  const revision = ws.error ? null : ws.revision;
  return { ok: true, next: campaignAction(ledger, { revision }), revision, ledger: ledger ? { waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units, moved: w.moved })), waiting: ledger.waiting, pause: ledger.pause } : null };
}
function doReplan(root, b) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const check = checkCampaignSet(units);
  if (check.errors.length) return { ok: false, errors: check.errors };
  const before = /* @__PURE__ */ new Set([...Object.keys(ledger.units), ...Object.keys(ledger.outside)]);
  for (const u of units) if (ledger.units[u.key]?.state === "planned" && ["prepared", "routed"].includes(u.packetState)) ledger.units[u.key].state = "prepared";
  replan(ledger, units, { revision: ws.revision, now: nowIso() });
  const added = [...Object.keys(ledger.units), ...Object.keys(ledger.outside)].filter((k) => !before.has(k));
  saveLedger(root, b, ledger);
  appendJournal(root, b, "replan", { revision: ws.revision, added });
  return { ok: true, added, waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units })), waiting: ledger.waiting };
}
function answer(root, b, [key, ...rest]) {
  if (!SETUP_ANSWERS.includes(key)) throw new Error(`answer: the key is one of ${SETUP_ANSWERS.join(", ")}`);
  const ledger = requireLedger(root, b);
  const raw = rest.join(" ");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  if (key === "budget") {
    if (value === "default") value = { ...DEFAULT_BUDGET };
    if (!value || typeof value !== "object" || Object.keys(value).some((k) => !(k in DEFAULT_BUDGET) || !Number.isFinite(value[k]))) throw new Error('answer budget: default, or {"fiveHourSlow":n,"fiveHourPause":n,"sevenDayReserve":n}');
    value = { ...DEFAULT_BUDGET, ...value };
  }
  ledger.answers[key] = value;
  saveLedger(root, b, ledger);
  return { ok: true, key, value, next: campaignAction(ledger, {}) };
}
function unit(root, b, [key, state], f) {
  if (!UNIT_STATES.includes(state)) throw new Error(`unit: the state is one of ${UNIT_STATES.join(", ")}`);
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u) throw new Error(`unit: ${key} is not a build unit of this campaign`);
  u.state = state;
  for (const k of ["route", "reason", "merge", "output"]) if (f[k] !== void 0) u[k] = f[k];
  if (f.digest !== void 0) {
    try {
      u.digest = JSON.parse(f.digest);
    } catch {
      u.digest = f.digest;
    }
  }
  saveLedger(root, b, ledger);
  appendJournal(root, b, "unit-state", { key, slug: u.slug, state, ...f.route ? { route: f.route } : {} });
  return { ok: true, key, state };
}
function outside(root, b, [key, state]) {
  const ledger = requireLedger(root, b);
  if (!ledger.outside[key]) throw new Error(`outside: ${key} is not a task, investigate or discover packet of this campaign`);
  if (!["closed", "needs-you"].includes(state)) throw new Error("outside: the state is closed or needs-you");
  ledger.outside[key].state = state;
  saveLedger(root, b, ledger);
  return doReplan(root, b);
}
function wave(root, b, [nText, action, state], f) {
  const ledger = requireLedger(root, b);
  const n = Number(nText);
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) throw new Error(`wave: no wave ${nText}`);
  if (action === "start") {
    if (w.state !== "planned") throw new Error(`wave ${n} is ${w.state}, not planned`);
    const lives = ledger.waves.filter((x) => ["running", "boundary", "handoff", "shipping"].includes(x.state));
    const building = lives.find((x) => ["running", "boundary"].includes(x.state));
    if (building) throw new Error(`wave ${building.n} is ${building.state}: a wave starts after the wave below merged its slugs into its branch`);
    if (lives.length && !ledger.stack?.enabled) throw new Error(`wave ${lives[0].n} is ${lives[0].state}: without stacked PRs a wave starts after the previous wave merged`);
    const max = ledger.stack?.["max-unshipped"] ?? DEFAULT_MAX_UNSHIPPED;
    if (lives.length >= max) throw new Error(`${lives.length} unshipped waves wait above the trunk (max-unshipped ${max}): ship one first`);
    const ws = readWorkSet(root, b);
    const units = ws.error ? [] : unitsOf(ws);
    const prepared = new Set(w.units.filter((k) => ledger.units[k]?.state === "prepared"));
    const { start, moved } = deferUnprepared(w.units, units, prepared);
    if (!start.length) return { ok: false, error: `no unit of wave ${n} is prepared`, moved };
    const trunk = waveBase(ledger, n, f.trunk ?? ledger.trunk ?? "main");
    w.units = start;
    w.moved = [...w.moved ?? [], ...moved];
    w.state = "running";
    w.branch = `campaign/${b}/wave-${n}`;
    w.base = trunk;
    w["started-at"] = nowIso();
    for (const k of start) {
      ledger.units[k].state = "prepared";
      ledger.units[k].wave = n;
    }
    if (moved.length) replan(ledger, units, { revision: ledger["work-revision"], now: nowIso() });
    saveLedger(root, b, ledger);
    appendJournal(root, b, "wave-start", { wave: n, branch: w.branch, base: trunk, units: start, slugs: start.map((k) => ledger.units[k].slug), moved });
    return { ok: true, wave: n, branch: w.branch, base: trunk, units: start.map((k) => ({ key: k, slug: ledger.units[k].slug })), moved };
  }
  if (action === "set") {
    if (!WAVE_STATES.includes(state)) throw new Error(`wave set: the state is one of ${WAVE_STATES.join(", ")}`);
    w.state = state;
    for (const k of ["pr", "version", "label"]) if (f[k] !== void 0) w[k] = f[k];
    if (state === "shipped") {
      w["shipped-at"] = nowIso();
      for (const k of w.units) if (ledger.units[k]?.state === "merged") ledger.units[k].state = "shipped";
    }
    saveLedger(root, b, ledger);
    appendJournal(root, b, state === "shipped" ? "wave-end" : "wave-state", { wave: n, state, ...f.pr ? { pr: f.pr } : {}, ...f.version ? { version: f.version } : {} });
    return { ok: true, wave: n, state };
  }
  throw new Error("wave: the action is start or set");
}
function ask(root, b, args, f) {
  const [id, ...text] = args;
  const ledger = requireLedger(root, b);
  if (ledger.questions.some((q2) => q2.id === id && !q2["answered-at"])) throw new Error(`ask: question ${id} is open`);
  const q = { id, ...f.wave ? { wave: Number(f.wave) } : {}, text: text.join(" "), "asked-at": nowIso() };
  ledger.questions.push(q);
  saveLedger(root, b, ledger);
  appendJournal(root, b, "asked", { id, wave: q.wave ?? null, text: q.text });
  return { ok: true, question: q };
}
function reply(root, b, [id, ...text]) {
  const ledger = requireLedger(root, b);
  const q = ledger.questions.find((x) => x.id === id && !x["answered-at"]);
  if (!q) throw new Error(`reply: no open question ${id}`);
  q.answer = text.join(" ");
  q["answered-at"] = nowIso();
  saveLedger(root, b, ledger);
  return { ok: true, question: q };
}
function pause2(root, b, [until, ...reason]) {
  if (!until || !Number.isFinite(Date.parse(until))) throw new Error("pause: give the reset time as an ISO 8601 timestamp");
  const ledger = requireLedger(root, b);
  ledger.pause = { reason: reason.join(" ") || "usage limit", until: new Date(Date.parse(until)).toISOString(), at: nowIso() };
  saveLedger(root, b, ledger);
  writeAtomic(controlPath(root, b), `${JSON.stringify({ action: "pause", scope: "campaign", until: ledger.pause.until, reason: ledger.pause.reason, requestedAt: nowIso() }, null, 2)}
`);
  appendJournal(root, b, "paused", ledger.pause);
  return { ok: true, pause: ledger.pause };
}
function resume(root, b) {
  const ledger = requireLedger(root, b);
  ledger.pause = null;
  saveLedger(root, b, ledger);
  const ctl = readJson(controlPath(root, b));
  if (ctl && ctl.action === "pause") writeAtomic(controlPath(root, b), "{}\n");
  appendJournal(root, b, "resumed", {});
  return { ok: true, next: campaignAction(ledger, {}) };
}
function asBuiltNotes(root, b) {
  const dir = join2(campDir(root, b), "as-built");
  const out = {};
  if (!existsSync2(dir)) return out;
  for (const f of readdirSync2(dir).filter((x) => x.endsWith(".json"))) {
    const d = readJson(join2(dir, f));
    if (d?.key) out[d.key] = { ...d, path: `../as-built/${f.replace(/\.json$/, ".md")}` };
  }
  return out;
}
function context(root, b, [key]) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const u = units.find((x) => x.key === key);
  if (!u) throw new Error(`context: no packet ${key}`);
  const driftFile = join2(campDir(root, b), "drift", `${key}.json`);
  const drift2 = (readJson(driftFile)?.lines ?? []).filter((l) => l.class === "implementation-detail");
  const wt = ledger.units[key]?.worktree;
  const iso = wt ? isolationOf(readJson(join2(root, ".ai", "sdlc-config.json")) ?? {}) : null;
  const isolation = wt && iso ? isolationText(iso, { index: wt.index, worktree: wt.path, slug: u.slug, lockCmd: `node "${join2(PLUGIN_ROOT, "skills", "wf", "scripts", "campaign.mjs")}" lock "${root}" ${b}` }) : null;
  const text = renderContext({ unit: u, units, ledger, asBuilt: asBuiltNotes(root, b), drift: drift2, isolation, localRecords: isLocal(ledger) });
  const file = join2(campDir(root, b), "context", `${u.slug}.md`);
  writeAtomic(file, text);
  return { ok: true, key, slug: u.slug, path: file };
}
function drift(root, b, [nText]) {
  const ledger = requireLedger(root, b);
  const n = Number(nText);
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) throw new Error(`drift: no wave ${nText}`);
  const ws = readWorkSet(root, b);
  const units = ws.error ? [] : unitsOf(ws);
  const notes = asBuiltNotes(root, b);
  const results = w.units.map((k) => units.find((u) => u.key === k)).filter(Boolean).map((u) => classifyDrift(u, notes));
  const L = [`# Drift check before wave ${n}`, "", "Each waiting slug's expects lines against the as-built notes of the slugs it names, after the refuter (11.2).", ""];
  for (const r of results) {
    writeAtomic(join2(campDir(root, b), "drift", `${r.key}.json`), `${JSON.stringify(r, null, 2)}
`);
    L.push(`## ${r.key} \u2014 ${r.class}`, "");
    if (!r.lines.length) L.push("- No expects lines.");
    for (const l of r.lines) L.push(`- \`${l.from}/${l.key}\` (${l.text}): ${l.status} \u2192 **${l.class}**${l.note ? `. ${l.note}` : ""}`);
    L.push("");
  }
  const contract = results.filter((r) => r.class === "contract").map((r) => r.key);
  const stop = new Set(contract);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) if (!stop.has(u.key) && u.dependsOn.some((d) => stop.has(d)) && w.units.includes(u.key)) {
      stop.add(u.key);
      grew = true;
    }
  }
  L.push("## Result", "", contract.length ? `Contract differences: ${contract.join(", ")}. These slugs and their dependents wait for the person: ${[...stop].join(", ")}.` : "No contract difference. The wave can start.", "");
  writeAtomic(join2(campDir(root, b), "drift", `wave-${n}.md`), L.join("\n"));
  appendJournal(root, b, "drift", { wave: n, contract, stop: [...stop], implementation: results.filter((r) => r.class === "implementation-detail").map((r) => r.key) });
  return { ok: true, wave: n, results: results.map((r) => ({ key: r.key, class: r.class })), stop: [...stop] };
}
function version(root, b, [kind], f) {
  const ledger = requireLedger(root, b);
  const tags = (git(root, ["tag", "--list"]) ?? "").split(/\r?\n/).filter(Boolean);
  const stages = ledger["ship-plan"]?.["rollout-stages"];
  const label2 = f.label ?? (Array.isArray(stages) && typeof stages[0] === "string" && /^[a-z]+$/.test(stages[0]) ? stages[0] : "beta");
  if (kind === "wave") {
    const target = ledger.answers["target-version"];
    if (!target || target === "none") return { ok: true, version: null, reason: "no versioning (V6): the outputs keep their build labels" };
    return { ok: true, version: nextWaveVersion({ target, tags, label: label2 }) };
  }
  if (kind === "hotfix") return { ok: true, version: hotfixVersion({ tags }), confirm: "the person confirms the hotfix number (V3)" };
  throw new Error("version: wave or hotfix");
}
function label(root, b, [nText, slug]) {
  const ledger = requireLedger(root, b);
  const w = ledger.waves.find((x) => x.n === Number(nText));
  if (!w?.branch) throw new Error(`label: wave ${nText} has no branch yet`);
  const ref = slug ? `campaign/${b}/wave-${w.n}--${slug}` : w.branch;
  const sha = git(root, ["rev-parse", ref]) ?? git(root, ["rev-parse", "HEAD"]);
  return { ok: true, label: buildLabel({ wave: w.n, slug: slug ?? null, sha }) };
}
function journal(root, b, [event, json]) {
  let extra = {};
  if (json) {
    try {
      extra = JSON.parse(json);
    } catch {
      throw new Error("journal: the second argument is a JSON object");
    }
  }
  return { ok: true, line: appendJournal(root, b, event, extra) };
}
function forecast(root, b, f) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  const units = ws.error ? [] : unitsOf(ws);
  ledger["forecast-actual"] ??= [];
  if (f.wave) ledger["forecast-actual"].push({ wave: Number(f.wave), minutes: f.minutes ? Number(f.minutes) : null, tokens: f.tokens ? Number(f.tokens) : null });
  const history = forecastHistory(root);
  const slices = Object.fromEntries(units.filter(isBuildUnit).map((u) => [u.key, sliceCount(root, u.slug)]).filter(([, n]) => n));
  const fc = buildForecast({ units: units.filter((u) => !["merged", "shipped"].includes(ledger.units[u.key]?.state)), history, slices });
  ledger.forecast = { minutes: fc.minutes, tokens: fc.tokens, unknown: fc.unknown, journals: history.journals };
  saveLedger(root, b, ledger);
  writeAtomic(join2(campDir(root, b), "forecast.md"), renderForecast(fc, { brainstorm: b, now: nowIso(), actual: ledger["forecast-actual"] }));
  return { ok: true, forecast: ledger.forecast };
}
function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, b, ...rest] = argv;
  if (!cmd || !rootArg || !b) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case "orient":
        out = orient(root, b);
        break;
      case "status":
        out = status(root, b);
        break;
      case "replan":
        out = doReplan(root, b);
        break;
      case "answer":
        out = answer(root, b, pos);
        break;
      case "unit":
        out = unit(root, b, pos, f);
        break;
      case "outside":
        out = outside(root, b, pos);
        break;
      case "wave":
        out = wave(root, b, pos, f);
        break;
      case "ask":
        out = ask(root, b, pos, f);
        break;
      case "reply":
        out = reply(root, b, pos);
        break;
      case "pause":
        out = pause2(root, b, pos);
        break;
      case "resume":
        out = resume(root, b);
        break;
      case "context":
        out = context(root, b, pos);
        break;
      case "drift":
        out = drift(root, b, pos);
        break;
      case "version":
        out = version(root, b, pos, f);
        break;
      case "label":
        out = label(root, b, pos);
        break;
      case "journal":
        out = journal(root, b, pos);
        break;
      case "forecast":
        out = forecast(root, b, f);
        break;
      case "budget":
        out = budget(root, b);
        break;
      case "worktree":
        out = worktree(root, b, pos);
        break;
      case "lock":
        out = lock(root, b, pos);
        break;
      case "stack":
        out = stack(root, b, pos);
        break;
      default:
        process.stderr.write(`${USAGE}
`);
        return 2;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}
`);
  return out.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
export {
  appendJournal,
  controlPath,
  journalPath,
  main,
  readWorkSet
};
