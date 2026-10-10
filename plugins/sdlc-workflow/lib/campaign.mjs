// lib/campaign.mjs — the pure core of /wf campaign (WF-CAMPAIGN-PLAN, Stage C).
//
// The campaign reads the brainstorm's work packets (work/<slug>.md, written by
// work-packets.mjs) and drives the build packets in dependency waves. It never
// writes the board or a packet: the brainstorm owns them (section 15). Its own
// state is work/campaign/ledger.json; ledger.md is generated from it.
//
// Everything here is pure, so the tests and scripts/campaign.mjs share one
// source: the waves, the same-slug rule, the partial-wave and revert rules, the
// drift classes, the version order at ship time, the ledger and the action the
// command takes next, the context file, and the forecast.

export const BUILD_FORMS = Object.freeze(['intake', 'extension', 'fix', 'hotfix']);
export const OUTSIDE_FORMS = Object.freeze(['task', 'investigate', 'discover']);
export const MAX_CARRIED = 40;
export const LEDGER_VERSION = 1;
export const WAVE_STATES = Object.freeze(['planned', 'running', 'boundary', 'handoff', 'shipping', 'shipped', 'stopped']);
// `waiting`: the drive stopped at a wait for another unit of its wave (WF-CAMPAIGN-RUN-FIXES-PLAN N5).
export const UNIT_STATES = Object.freeze(['planned', 'prepared', 'running', 'waiting', 'stopped', 'finished', 'merged', 'needs-fix', 'shipped']);
export const LIVE_WAVE_STATES = Object.freeze(['running', 'boundary', 'handoff', 'shipping']);
export const SETUP_ANSWERS = Object.freeze(['forecast', 'target-version', 'release-each-wave', 'output', 'budget']);
/** 17.2: the budget lines, in percent of each rate-limit window (the yolo.usageBudget names). */
export const DEFAULT_BUDGET = Object.freeze({ fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 });
/** 17.5: a reading older than this is unknown. */
export const READING_STALE_MS = 10 * 60 * 1000;
/** 12.5: unshipped waves that may wait above the trunk. */
export const DEFAULT_MAX_UNSHIPPED = 2;
/** 13: the width when the project has an isolation contract and the config names none. */
export const DEFAULT_WIDTH = 3;
const CONTEXT_LONG_LINES = 200;

// ---------------------------------------------------------------- units

/**
 * One campaign unit from a packet's frontmatter. `written` is the `written:`
 * list of work/index.md: the write-now pieces the brainstorm session already
 * wrote. A dependency on one of them is done before the campaign starts, and
 * its expects lines are met (the brainstorm checked them, 3.4 step 1), so they
 * leave dependsOn and expects and are kept apart for the context file.
 */
export function unitOf(packet, { written = [] } = {}) {
  const form = packet.form ?? 'intake';
  const done = new Set(written);
  const deps = packet['depends-on'] ?? [];
  const exps = packet.expects ?? [];
  const workSlug = packet['work-slug'] ?? packet.key;
  const targetSlug = packet['target-slug'] ?? null;
  // N1: a need on another packet does not move this unit to a later wave. A need on
  // a written piece is met before the campaign starts, so it drops out.
  const needs = (Array.isArray(packet.needs) ? packet.needs : [])
    .filter((n) => n && n.from && !done.has(n.from))
    .map((n) => ({ from: String(n.from), through: n.through ? String(n.through) : 'finished', before: n.before ? String(n.before) : null, why: n.why ? String(n.why) : '' }));
  return {
    key: packet.key,
    title: packet.title ?? packet.key,
    form,
    // An extension adds slices to the slug it extends, so yolo drives that slug.
    slug: form === 'extension' && targetSlug ? targetSlug : workSlug,
    workSlug,
    targetSlug,
    urgency: packet.urgency ?? 'normal',
    order: Number.isFinite(Number(packet.order)) ? Number(packet.order) : 1,
    dependsOn: deps.filter((d) => !done.has(d)),
    needs,
    provides: [...(packet.provides ?? [])],
    expects: exps.filter((e) => !done.has(e.from)),
    writtenDeps: deps.filter((d) => done.has(d)),
    writtenExpects: exps.filter((e) => done.has(e.from)),
    decisions: [...(packet['carried-decisions'] ?? [])],
    uxImpact: packet['ux-impact'] ?? 'none',
    packetState: packet.state ?? 'proposed',
    routedTo: packet['routed-to'] ?? null,
    file: packet.file ?? null,
  };
}

export const isBuildUnit = (u) => BUILD_FORMS.includes(u.form);

/** Every slug a unit touches: its own workflow and the workflow it changes (R1). */
export function touchedSlugs(u) {
  return new Set([u.slug, u.workSlug, u.targetSlug].filter(Boolean));
}

const byOrder = (a, b) => a.order - b.order || String(a.key).localeCompare(String(b.key));

const needsOf = (u) => u.needs ?? [];

function findCycle(units) {
  const graph = new Map(units.map((u) => [u.key, [...u.dependsOn, ...needsOf(u).map((n) => n.from)]]));
  const state = new Map();
  const stack = [];
  const visit = (k) => {
    if (state.get(k) === 'done') return null;
    if (state.get(k) === 'open') return [...stack.slice(stack.indexOf(k)), k];
    state.set(k, 'open');
    stack.push(k);
    for (const n of graph.get(k) ?? []) {
      if (!graph.has(n)) continue;
      const c = visit(n);
      if (c) return c;
    }
    stack.pop();
    state.set(k, 'done');
    return null;
  };
  for (const k of graph.keys()) {
    const c = visit(k);
    if (c) return c;
  }
  return null;
}

function closure(byKey, key) {
  const seen = new Set();
  const walk = (k) => {
    for (const n of byKey.get(k)?.dependsOn ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      walk(n);
    }
  };
  walk(key);
  return seen;
}

/**
 * Phase 0 checks (9.1 steps 1-2, F7). `single` is true when the work set has at
 * most one build packet: that is not a campaign, and the person starts the
 * packet by its own start command.
 */
export function checkCampaignSet(packets, { written = [] } = {}) {
  const units = packets.map((p) => (p.dependsOn ? p : unitOf(p, { written })));
  const byKey = new Map(units.map((u) => [u.key, u]));
  const errors = [];
  const warnings = [];
  for (const u of units) {
    for (const d of u.dependsOn) if (!byKey.has(d)) errors.push(`packet ${u.key} depends on ${d}, which is not a packet of this work set and not in the written list of work/index.md.`);
    // N1: a need names another build packet. It may share a wave with this one, so the two must not touch the same slug.
    for (const n of needsOf(u)) {
      const src = byKey.get(n.from);
      if (n.from === u.key) errors.push(`packet ${u.key} needs itself.`);
      else if (!src) errors.push(`packet ${u.key} needs ${n.from}, which is not a packet of this work set and not in the written list of work/index.md.`);
      else if (!isBuildUnit(src)) errors.push(`packet ${u.key} needs ${n.from}, a ${src.form}: a need names a build packet. Use depends-on for a ${src.form}.`);
      else if ([...touchedSlugs(u)].some((s) => touchedSlugs(src).has(s))) errors.push(`packet ${u.key} needs ${n.from}, and both touch the same slug: use depends-on.`);
      else if (u.dependsOn.includes(n.from)) warnings.push(`packet ${u.key} depends on ${n.from} and also needs it: the depends-on already puts ${n.from} in an earlier wave, so the need has no effect.`);
    }
  }
  const cycle = findCycle(units);
  if (cycle) errors.push(`the dependencies form a cycle: ${cycle.join(' -> ')}.`);
  for (const u of units) {
    const deps = closure(byKey, u.key);
    for (const e of u.expects) {
      const src = byKey.get(e.from);
      if (!src || !src.provides.some((p) => p.key === e.key)) errors.push(`packet ${u.key} expects ${e.from}/${e.key} ("${e.text}"), and no packet provides it.`);
      else if (!deps.has(e.from)) errors.push(`packet ${u.key} expects ${e.from}/${e.key}, but ${e.from} is not in its depends-on.`);
    }
    if (isBuildUnit(u) && u.decisions.length > MAX_CARRIED && !['prepared', 'routed'].includes(u.packetState)) {
      errors.push(`packet ${u.key} has ${u.decisions.length} carried decisions, more than ${MAX_CARRIED}: the person splits it in the brainstorm before it can be prepared (F7).`);
    }
  }
  const build = units.filter(isBuildUnit);
  const slugs = new Map();
  for (const u of build.filter((x) => x.form === 'intake')) {
    if (slugs.has(u.slug)) errors.push(`packets ${slugs.get(u.slug)} and ${u.key} open the same slug ${u.slug}.`);
    else slugs.set(u.slug, u.key);
  }
  for (const u of units.filter((x) => !isBuildUnit(x))) {
    warnings.push(`packet ${u.key} is a ${u.form}: it runs with the person outside the waves (9.3a), and its dependents wait for it.`);
  }
  return { errors, warnings, single: build.length <= 1 };
}

/**
 * The waves (9.1 step 3, 9.3a, 12.1, R1). A wave is every build unit whose
 * dependencies are done or in an earlier wave. Two units that touch the same
 * slug never share a wave: the unit with the later order waits. A task,
 * investigate or discover packet never enters a wave; its dependents wait until
 * the person closes it (outsideDone). A stopped unit waits, and so do the units
 * that depend on it. Started waves are kept as they are, never re-planned.
 */
export function planWaves(units, { done = new Set(), started = [], stopped = new Set(), outsideDone = new Set() } = {}) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const waves = started.map((w) => [...w]);
  const placed = new Map();
  waves.forEach((w, i) => w.forEach((k) => placed.set(k, i)));
  const satisfied = (d, k) => done.has(d) || outsideDone.has(d) || (placed.has(d) && placed.get(d) < k);
  let remaining = units.filter(isBuildUnit).filter((u) => !done.has(u.key) && !placed.has(u.key) && !stopped.has(u.key)).sort(byOrder);
  for (;;) {
    const k = waves.length;
    const taken = new Set();
    const wave = [];
    // N1: a need is met by a unit in this wave or an earlier one. A unit can join only
    // after the unit it needs joined, so the pass repeats until it adds nothing.
    const inWave = new Set();
    const needMet = (n) => done.has(n.from) || (placed.has(n.from) && placed.get(n.from) < k) || inWave.has(n.from);
    for (let grew = true; grew;) {
      grew = false;
      for (const u of remaining) {
        if (inWave.has(u.key)) continue;
        if (!u.dependsOn.every((d) => satisfied(d, k))) continue;
        if (!needsOf(u).every(needMet)) continue;
        const slugs = touchedSlugs(u);
        if ([...slugs].some((s) => taken.has(s))) continue;
        slugs.forEach((s) => taken.add(s));
        wave.push(u.key);
        inWave.add(u.key);
        grew = true;
      }
    }
    if (!wave.length) break;
    wave.sort((a, b) => byOrder(byKey.get(a), byKey.get(b)));
    waves.push(wave);
    wave.forEach((key) => placed.set(key, k));
    remaining = remaining.filter((u) => !placed.has(u.key));
  }
  const waiting = [];
  for (const key of stopped) if (byKey.has(key) && !done.has(key)) waiting.push({ key, on: [], reason: 'stopped' });
  for (const u of remaining) {
    const open = [...new Set([...u.dependsOn, ...needsOf(u).map((n) => n.from)])].filter((d) => !done.has(d) && !outsideDone.has(d) && !placed.has(d));
    const outside = open.filter((d) => byKey.has(d) && !isBuildUnit(byKey.get(d)));
    waiting.push(outside.length ? { key: u.key, on: outside, reason: 'needs-you' } : { key: u.key, on: open, reason: 'waits' });
  }
  return { waves, waiting };
}

/**
 * A wave starts with its prepared units (9.3 step 6). An unprepared unit moves
 * to a later wave, and so does every unit of the wave that depends on it.
 */
export function deferUnprepared(waveKeys, units, prepared) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const moved = [];
  const out = new Set();
  for (const key of waveKeys) if (!prepared.has(key)) { out.add(key); moved.push({ key, reason: 'not prepared' }); }
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of waveKeys) {
      if (out.has(key)) continue;
      const dep = (byKey.get(key)?.dependsOn ?? []).find((d) => out.has(d));
      // N1: a unit whose needed unit leaves the wave leaves with it.
      const need = needsOf(byKey.get(key) ?? {}).find((n) => out.has(n.from));
      if (dep) { out.add(key); moved.push({ key, reason: `depends on ${dep}` }); grew = true; }
      else if (need) { out.add(key); moved.push({ key, reason: `needs ${need.from}` }); grew = true; }
    }
  }
  return { start: waveKeys.filter((k) => !out.has(k)), moved };
}

// ---------------------------------------------------------------- waits inside a wave (WF-CAMPAIGN-RUN-FIXES-PLAN 3.1)

/**
 * N3: the waits of each unit that a wave starts with. A need on a unit of this wave
 * becomes an open wait; a need on an earlier wave is on the wave branch already.
 */
export function waveWaits(units, waveKeys) {
  const inWave = new Set(waveKeys);
  const out = {};
  for (const key of waveKeys) {
    const u = units.find((x) => x.key === key);
    const waits = needsOf(u ?? {}).filter((n) => inWave.has(n.from)).map((n) => ({ from: n.from, through: n.through, before: n.before, why: n.why, state: 'open' }));
    if (waits.length) out[key] = waits;
  }
  return out;
}

/**
 * True when `merged` (a slice of the needed unit, or `finished`) covers `wanted`.
 * `order` is the needed unit's slice list. A slice not in the list is covered only by
 * itself or by `finished`.
 */
export function throughCovers(merged, wanted, order = []) {
  if (merged === 'finished') return true;
  if (wanted === 'finished') return false;
  if (merged === wanted) return true;
  const a = order.indexOf(wanted);
  const b = order.indexOf(merged);
  return a >= 0 && b >= 0 && a <= b;
}

/**
 * N7: the merge-ins that can run now. `progress` maps a unit key to
 * { finished, passed: [slices whose verify passed], order: [slice list] }.
 * A unit that a drive runs is never merged into (D5): only `waiting`, `prepared`
 * and `stopped` units are offered.
 */
export function mergeInsReady(ledger, progress = {}) {
  const ready = [];
  for (const w of ledger.waves.filter((x) => x.state === 'running')) {
    for (const key of w.units) {
      const u = ledger.units[key];
      if (!u || !['waiting', 'prepared', 'stopped'].includes(u.state)) continue;
      const seen = new Set();
      for (const wt of (u.waits ?? []).filter((x) => x.state === 'open')) {
        const p = progress[wt.from];
        if (!p) continue;
        const reached = p.finished ? 'finished' : [...(p.passed ?? [])].sort((a, b) => (p.order ?? []).indexOf(b) - (p.order ?? []).indexOf(a))[0];
        if (!reached || !throughCovers(reached, wt.through, p.order)) continue;
        if (seen.has(wt.from)) continue;
        seen.add(wt.from);
        ready.push({ key, from: wt.from, through: reached, waitingFor: wt.through });
      }
    }
  }
  return ready;
}

/** N6: close each open wait on `from` that a merge through `through` covers. Returns the closed waits. */
export function closeWaits(waits, { from, through, order = [], at }) {
  const closed = [];
  for (const w of waits ?? []) {
    if (w.state !== 'open' || w.from !== from || !throughCovers(through, w.through, order)) continue;
    w.state = 'closed';
    w['closed-at'] = at;
    closed.push(w);
  }
  return closed;
}

/** Section 7 of the context file: the open waits and what is merged into this branch. */
export function waitsText(unitLedger) {
  const waits = unitLedger?.waits ?? [];
  if (!waits.length) return null;
  const merged = unitLedger['merged-in'] ?? [];
  const L = [];
  L.push(`- Merged into this branch: ${merged.length ? merged.map((m) => `${m.from} through \`${m.through}\` (${String(m.sha ?? '').slice(0, 7)}, ${m.at})`).join('; ') : 'none'}.`);
  for (const w of waits) {
    const slice = w.before ? `the slice \`${w.before}\`` : 'the first slice';
    L.push(`- ${w.state === 'open' ? '**Open**' : 'Closed'}: before ${slice}, this branch needs ${w.from} through \`${w.through}\`${w.why ? ` (${w.why})` : ''}.`);
  }
  L.push('- Until a merge brings the code of an open wait, the values and code that it names stay neutral, as the slices say. Do not build a stand-in for them.');
  L.push('- The stop-request check stops the plan or the implement stage of a slice that an open wait names. The campaign merges the needed unit while this drive is stopped, closes the wait here, and starts the drive again.');
  L.push('- After a merge, the merged code can change behaviour. The next test that compares outputs expects that change: record it in the stage artifact.');
  return L.join('\n');
}

// ---------------------------------------------------------------- merge order at the boundary (3.7)

/**
 * C7: the boundary merge order. `units` are the finished units in packet order, each
 * { key, tip (sha of its slug branch), mergedIn: [{ from, sha }] }. A unit whose
 * branch tip another unit merged in is merged through that unit, and is not merged
 * on its own. A unit is merged after every unit whose branch it merged in.
 */
export function boundaryMergeOrder(units) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const through = {};
  for (const x of units) {
    for (const m of x.mergedIn ?? []) {
      const y = byKey.get(m.from);
      if (y && y.tip && m.sha === y.tip && !through[y.key]) through[y.key] = x.key;
    }
  }
  // A carrier that is itself carried passes its riders on to its own carrier.
  const carrier = (k) => { let c = through[k]; const seen = new Set([k]); while (c && through[c] && !seen.has(c)) { seen.add(c); c = through[c]; } return c; };
  for (const k of Object.keys(through)) through[k] = carrier(k);
  const left = units.filter((u) => !through[u.key]).map((u) => u.key);
  const order = [];
  const done = new Set();
  const ready = (k) => (byKey.get(k).mergedIn ?? []).every((m) => !left.includes(m.from) || done.has(m.from) || m.from === k);
  while (order.length < left.length) {
    const next = left.find((k) => !done.has(k) && ready(k)) ?? left.find((k) => !done.has(k));
    order.push(next);
    done.add(next);
  }
  return { order, through };
}

// ---------------------------------------------------------------- disk and paths (3.5, 3.6)

/** Windows limits a path to 260 characters for tools that ignore core.longpaths (the linker, some build scripts). */
export const WINDOWS_PATH_LIMIT = 260;
export const DEFAULT_BUILD_DEPTH = 140;

/** C6: the deepest path a build can make in a worktree, against the Windows limit. */
export function pathBudget({ worktree, longestTracked = 0, buildDepth = DEFAULT_BUILD_DEPTH, limit = WINDOWS_PATH_LIMIT }) {
  const total = String(worktree).length + 1 + Math.max(Number(longestTracked) || 0, Number(buildDepth) || 0);
  return { total, limit, ok: total < limit };
}

/** C5: the free space a new worktree needs, from the sizes of earlier unit folders. */
export function diskNeedGb({ history = [], toStart = 1, minFreeGb = 20 }) {
  const sizes = history.map((h) => Number(h.gb)).filter((x) => Number.isFinite(x) && x > 0);
  if (!sizes.length) return { needGb: minFreeGb, from: 'min-free-gb' };
  const per = Math.max(...sizes);
  return { needGb: Math.round((per * Math.max(1, toStart) + minFreeGb) * 10) / 10, perUnitGb: per, from: 'history' };
}

/** C6: a short stamp for the worktree root: the run time in base 36. */
export function shortStamp(runId) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(String(runId ?? ''));
  if (!m) return String(runId ?? 'run').split('-')[0].slice(0, 8);
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000).toString(36);
}

// ---------------------------------------------------------------- plugin version (3.8)

/** C8: the newer installed plugin, or null. */
export function pluginUpdate(running, installed) {
  if (!running || !installed) return null;
  const a = parseVersion(running);
  const b = parseVersion(installed);
  if (!a || !b) return null;
  return compareVersions(b, a) > 0 ? { running: a.text, installed: b.text } : null;
}

// ---------------------------------------------------------------- recap (3.3)

/**
 * C3: the facts of a recap. `journals` maps a unit key to its driver journal lines;
 * `campaign` is the campaign journal. Lines at or after `since` count.
 */
export function buildRecap({ ledger, since, journals = {}, campaign = [], now }) {
  const after = (l) => !since || String(l.at ?? '') >= since;
  const units = [];
  for (const [key, u] of Object.entries(ledger.units ?? {})) {
    if (!['running', 'waiting', 'stopped', 'finished', 'needs-fix', 'merged'].includes(u.state)) continue;
    const lines = (journals[key] ?? []).filter(after);
    const ends = lines.filter((l) => l.event === 'agent-end' && /^(plan|implement|verify|review):/.test(String(l.agent ?? '')));
    const last = [...(journals[key] ?? [])].reverse().find((l) => l.event === 'agent-start' || l.event === 'agent-end') ?? null;
    units.push({
      key, slug: u.slug, state: u.state, route: u.route ?? null,
      stagesEnded: ends.map((l) => ({ agent: l.agent, status: l.status ?? null, at: l.at })),
      now: last ? { agent: last.agent, event: last.event, at: last.at } : null,
      openWaits: (u.waits ?? []).filter((w) => w.state === 'open').map((w) => `${w.from} through ${w.through}`),
    });
  }
  const decided = (ledger.decided ?? []).filter(after);
  const events = campaign.filter(after).filter((l) => !['agent-start', 'agent-end'].includes(l.event)).map((l) => ({ at: l.at, event: l.event, ...(l.key ? { key: l.key } : {}), ...(l.wave ? { wave: l.wave } : {}) }));
  const elapsedMinutes = since && now ? Math.round((Date.parse(now) - Date.parse(since)) / 60000) : null;
  return {
    since: since ?? null,
    // D4: the decisions taken for the person come first.
    decided: [...decided].sort((a, b) => Number(Boolean(b['intent-bearing'])) - Number(Boolean(a['intent-bearing']))),
    units,
    questions: (ledger.questions ?? []).filter((q) => !q['answered-at']),
    events,
    elapsedMinutes,
    forecastMinutes: ledger.forecast?.minutes ?? null,
  };
}

// ---------------------------------------------------------------- failure paths

/** 12.2: the merges are reverted newest first, one at a time. */
export const revertOrder = (merges) => [...merges].reverse();

/**
 * 12.2: `results[i]` is the wave verify after the i-th revert (newest first),
 * true when green. The first green names the breaker; the slugs reverted before
 * it are merged again (reapply), so the other slugs stay merged. Red with every
 * slug reverted means the fault is in the wave branch base.
 */
export function findBreaker(merges, results) {
  const order = revertOrder(merges);
  const reverted = [];
  for (let i = 0; i < results.length && i < order.length; i++) {
    reverted.push(order[i].key);
    if (results[i] === true) return { culprit: order[i].key, reverted, reapply: reverted.slice(0, -1) };
  }
  if (reverted.length >= order.length) return { culprit: null, base: true, reverted };
  return { culprit: null, base: false, reverted, next: order[reverted.length].key };
}

// ---------------------------------------------------------------- drift

const DRIFT_RANK = { none: 0, 'implementation-detail': 1, contract: 2 };

/**
 * 11.2: compare a waiting unit's expects lines with the as-built notes of the
 * units it names. `asBuilt` maps a packet key to { lines: [{ key, status,
 * class?, note? }] }, after the refuter: status is met, changed, missing, or
 * unverified. A met line is none. A changed line keeps the class the drift
 * writer gave it, and is a contract difference without one. Missing and
 * unverified lines, and lines with no as-built entry, are contract differences.
 */
export function classifyDrift(unit, asBuilt) {
  const lines = unit.expects.map((e) => {
    const entry = asBuilt?.[e.from]?.lines?.find((l) => l.key === e.key) ?? null;
    const status = entry?.status ?? 'no-as-built';
    let cls = 'contract';
    if (status === 'met') cls = 'none';
    else if (status === 'changed' && (entry.class === 'implementation-detail' || entry.class === 'contract')) cls = entry.class;
    return { from: e.from, key: e.key, text: e.text, status, class: cls, note: entry?.note ?? null };
  });
  const cls = lines.reduce((m, l) => (DRIFT_RANK[l.class] > DRIFT_RANK[m] ? l.class : m), 'none');
  return { key: unit.key, class: cls, lines };
}

// ---------------------------------------------------------------- versions

export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre, text: `${m[1]}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ''}` };
}

/** Semver precedence: a final version is above its pre-releases. */
export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  for (const f of ['major', 'minor', 'patch']) if (x[f] !== y[f]) return x[f] - y[f];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p - q;
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    return String(p).localeCompare(String(q));
  }
  return 0;
}

const sameBase = (v, t) => v.major === t.major && v.minor === t.minor && v.patch === t.patch;

/**
 * V2: a wave's version is assigned when it is next to ship: the next
 * pre-release of the target after the newest released tag.
 */
export function nextWaveVersion({ target, tags = [], label = 'beta' }) {
  const t = parseVersion(target);
  if (!t || t.pre.length) throw new Error(`the target version "${target}" is not a final x.y.z version`);
  const versions = tags.map(parseVersion).filter(Boolean);
  if (versions.some((v) => sameBase(v, t) && !v.pre.length)) throw new Error(`the target version ${t.text} is already released; ask the person for a new target`);
  let n = 0;
  for (const v of versions) if (sameBase(v, t) && v.pre[0] === label && typeof v.pre[1] === 'number') n = Math.max(n, v.pre[1]);
  return `${t.text}-${label}.${n + 1}`;
}

/** V3: a hotfix takes the next version after the newest released tag. */
export function hotfixVersion({ tags = [] }) {
  const versions = tags.map(parseVersion).filter(Boolean).sort(compareVersions);
  const newest = versions[versions.length - 1];
  if (!newest) throw new Error('no released tag: ask the person for the hotfix version');
  const base = `${newest.major}.${newest.minor}.${newest.patch}`;
  if (!newest.pre.length) return `${newest.major}.${newest.minor}.${newest.patch + 1}`;
  const [label, n] = newest.pre;
  return `${base}-${label}.${typeof n === 'number' ? n + 1 : 1}`;
}

/** V4: the label an output carries before its wave ships. */
export function buildLabel({ wave, slug = null, sha }) {
  return `wave-${wave}${slug ? `.${slug}` : ''}+${String(sha ?? '').slice(0, 7)}`;
}

// ---------------------------------------------------------------- ledger

export function newLedger({ brainstorm, revision, units, now = new Date().toISOString(), stage = 'C' }) {
  const plan = planWaves(units);
  const ledger = {
    version: LEDGER_VERSION,
    brainstorm,
    stage,
    'work-revision': revision,
    'created-at': now,
    'updated-at': now,
    answers: Object.fromEntries(SETUP_ANSWERS.map((k) => [k, null])),
    'tool-gaps': [],
    units: {},
    outside: {},
    waves: plan.waves.map((keys, i) => ({ n: i + 1, revision, units: keys, state: 'planned', branch: null, pr: null, version: null, label: null, moved: [] })),
    waiting: plan.waiting,
    questions: [],
    pause: null,
    stack: null,
    revisions: [{ revision, at: now, note: 'planned from this revision' }],
  };
  for (const u of units) {
    if (isBuildUnit(u)) {
      ledger.units[u.key] = {
        slug: u.slug, 'work-slug': u.workSlug, form: u.form, title: u.title, order: u.order,
        state: ['prepared', 'routed'].includes(u.packetState) ? 'prepared' : 'planned',
        wave: null, route: null, merge: null, output: null,
      };
    } else {
      ledger.outside[u.key] = { slug: u.workSlug, form: u.form, title: u.title, state: 'needs-you' };
    }
  }
  plan.waves.forEach((keys, i) => keys.forEach((k) => { ledger.units[k].wave = i + 1; }));
  return ledger;
}

/** Re-plan the waves that have not started, keeping the started ones (15.1). */
export function replan(ledger, units, { revision = ledger['work-revision'], now = new Date().toISOString() } = {}) {
  for (const u of units) {
    if (isBuildUnit(u) && !ledger.units[u.key]) {
      ledger.units[u.key] = { slug: u.slug, 'work-slug': u.workSlug, form: u.form, title: u.title, order: u.order, state: ['prepared', 'routed'].includes(u.packetState) ? 'prepared' : 'planned', wave: null, route: null, merge: null, output: null };
    } else if (!isBuildUnit(u) && !ledger.outside[u.key]) {
      ledger.outside[u.key] = { slug: u.workSlug, form: u.form, title: u.title, state: 'needs-you' };
    }
  }
  const startedWaves = ledger.waves.filter((w) => w.state !== 'planned');
  const done = new Set(Object.entries(ledger.units).filter(([, x]) => ['merged', 'shipped'].includes(x.state)).map(([k]) => k));
  const stopped = new Set(Object.entries(ledger.units).filter(([, x]) => ['stopped', 'needs-fix'].includes(x.state)).map(([k]) => k));
  const outsideDone = new Set(Object.entries(ledger.outside).filter(([, x]) => x.state === 'closed').map(([k]) => k));
  // Units of a started wave that did not finish there (moved, stopped) leave it.
  const started = startedWaves.map((w) => w.units.filter((k) => !(w.moved ?? []).some((m) => m.key === k)));
  const plan = planWaves(units, { done, started, stopped, outsideDone });
  const next = plan.waves.slice(startedWaves.length).map((keys, i) => ({
    n: startedWaves.length + i + 1, revision, units: keys, state: 'planned', branch: null, pr: null, version: null, label: null, moved: [],
  }));
  ledger.waves = [...startedWaves, ...next];
  for (const w of next) for (const k of w.units) ledger.units[k].wave = w.n;
  for (const w of plan.waiting) if (ledger.units[w.key] && !['stopped', 'needs-fix'].includes(ledger.units[w.key].state)) ledger.units[w.key].wave = null;
  ledger.waiting = plan.waiting;
  if (revision !== ledger['work-revision']) {
    ledger.revisions.push({ revision, at: now, note: 're-planned the waves that had not started' });
    ledger['work-revision'] = revision;
  }
  ledger['updated-at'] = now;
  return ledger;
}

/** The first setup answer still open, or null when setup is done. */
export const openSetupAnswer = (ledger) => SETUP_ANSWERS.find((k) => ledger.answers?.[k] === null || ledger.answers?.[k] === undefined) ?? null;

/**
 * Section 6: what `/wf campaign <brainstorm>` does next, from the ledger and the
 * current work-revision of work/index.md.
 */
export function campaignAction(ledger, { revision = null, mergeReady = [] } = {}) {
  if (!ledger) return { action: 'orient' };
  if (ledger.pause) return { action: 'paused', pause: ledger.pause };
  const setup = openSetupAnswer(ledger);
  if (setup) return { action: 'setup', question: setup };
  if (revision !== null && revision !== ledger['work-revision']) return { action: 'work-changed', from: ledger['work-revision'], to: revision };
  const open = ledger.questions.filter((q) => !q['answered-at']);
  if (open.length) return { action: 'ask', questions: open };
  const unprepared = (w) => (w ? w.units.filter((k) => ledger.units[k]?.state === 'planned') : []);
  const lives = ledger.waves.filter((w) => LIVE_WAVE_STATES.includes(w.state));
  const live = lives[0];
  const next = ledger.waves.find((w) => w.state === 'planned');
  // Stage D2 (16.3, 12.5): with stacked wave PRs, the next wave builds on the
  // wave below once that wave's slugs merged into its branch (handoff or
  // later), while fewer than max-unshipped waves wait above the trunk.
  const stacked = ledger.stack?.enabled && next && lives.length
    && lives.every((w) => ['handoff', 'shipping'].includes(w.state))
    && lives.length < (ledger.stack['max-unshipped'] ?? DEFAULT_MAX_UNSHIPPED);
  if (stacked) {
    const todo = unprepared(next);
    return todo.length ? { action: 'prepare', wave: next.n, units: todo } : { action: 'start-wave', wave: next.n, beside: lives.map((w) => w.n) };
  }
  // N7: a waiting unit whose needed slice passed verify is merged into before anything else of the wave.
  if (live && mergeReady.length) return { action: 'merge-in', wave: live.n, merges: mergeReady };
  if (live) return { action: 'running', wave: live.n, state: live.state, prepare: unprepared(next) };
  const stopped = ledger.waves.find((w) => w.state === 'stopped');
  if (stopped) return { action: 'stopped', wave: stopped.n };
  if (next) {
    const todo = unprepared(next);
    return todo.length ? { action: 'prepare', wave: next.n, units: todo } : { action: 'start-wave', wave: next.n };
  }
  const needsYou = Object.entries(ledger.outside).filter(([, x]) => x.state !== 'closed').map(([k]) => k);
  if ((ledger.waiting ?? []).length) return { action: 'blocked', waiting: ledger.waiting, needsYou };
  if (ledger.phase === 'done') return { action: 'done' };
  return { action: 'end' };
}

// ---------------------------------------------------------------- views

export function renderLedgerMd(ledger) {
  const L = [];
  L.push(`# Campaign: ${ledger.brainstorm}`, '');
  L.push(`Generated from \`ledger.json\`, which is the truth. Work revision ${ledger['work-revision']}. Updated ${ledger['updated-at']}.`, '');
  const act = campaignAction(ledger, {});
  L.push(`Next: **${act.action}**${act.wave ? ` (wave ${act.wave})` : ''}.`, '');
  if (ledger.pause) L.push(`Paused: ${ledger.pause.reason}${ledger.pause.until ? `, until ${ledger.pause.until}` : ''}.`, '');
  // C9: the person's standing rules come first, so that a reader after a compaction sees them.
  if ((ledger.rules ?? []).length) {
    L.push('## Standing rules', '');
    for (const r of ledger.rules) L.push(`- **${r.id}** — ${r.text} (${r.by}, ${r.at})`);
    L.push('');
  }
  // C3: presence and the decisions taken for the person.
  if (ledger.presence?.state === 'away') L.push(`The person is away since ${ledger.presence.since}${ledger.presence.until ? `, until ${ledger.presence.until}` : ''}: "${ledger.presence.words}".`, '');
  if ((ledger.decided ?? []).length) L.push(`Decided for the person: ${ledger.decided.length} (see \`decided-for-you.md\`).`, '');
  L.push('## Setup', '');
  for (const k of SETUP_ANSWERS) {
    const v = ledger.answers[k];
    L.push(`- ${k}: ${v === null || v === undefined ? '_open_' : typeof v === 'object' ? `\`${JSON.stringify(v)}\`` : v}`);
  }
  L.push('');
  L.push('## Waves', '');
  if (!ledger.waves.length) L.push('- None.');
  for (const w of ledger.waves) {
    L.push(`### Wave ${w.n} — ${w.state}`, '');
    if (w.branch) L.push(`Branch \`${w.branch}\`${w.pr ? `, PR ${w.pr}` : ''}${w.version ? `, version ${w.version}` : w.label ? `, label ${w.label}` : ''}.`, '');
    L.push('| Packet | Slug | Form | State | Route |', '|---|---|---|---|---|');
    for (const k of w.units) {
      const u = ledger.units[k] ?? {};
      const open = (u.waits ?? []).filter((x) => x.state === 'open').map((x) => `waits for ${x.from} through \`${x.through}\``);
      L.push(`| ${k} | \`${u.slug ?? '?'}\` | ${u.form ?? '?'} | ${u.state ?? '?'} | ${[u.route ?? '', ...open].filter(Boolean).join('; ')} |`);
    }
    for (const m of w.moved ?? []) L.push(`| ${m.key} | | | moved | ${m.reason} |`);
    L.push('');
  }
  L.push('## Waiting', '');
  const waiting = ledger.waiting ?? [];
  if (!waiting.length) L.push('- None.');
  for (const w of waiting) L.push(`- ${w.key}: ${w.reason}${w.on.length ? ` on ${w.on.join(', ')}` : ''}.`);
  L.push('');
  L.push('## Needs you (outside the waves)', '');
  const outside = Object.entries(ledger.outside);
  if (!outside.length) L.push('- None.');
  for (const [k, x] of outside) L.push(`- ${k} (${x.form}, \`${x.slug}\`): ${x.state}.`);
  L.push('');
  L.push('## Questions', '');
  if (!ledger.questions.length) L.push('- None.');
  for (const q of ledger.questions) L.push(`- ${q.id}${q.wave ? ` (wave ${q.wave})` : ''}: ${q.text} — ${q['answered-at'] ? `answered: ${q.answer}` : '**open**'}`);
  L.push('');
  return L.join('\n');
}

/**
 * Section 10: the context file a yolo run reads fresh, by path. `asBuilt` maps a
 * packet key to { path, lines } (after the refuter); `drift` is this unit's
 * implementation-detail drift lines. `localRecords` is true when the repo does
 * not track .ai/ (local records, 13).
 */
export function renderContext({ unit, units, ledger, asBuilt = {}, drift = [], isolation = null, localRecords = false }) {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const wave = ledger?.units?.[unit.key]?.wave ?? null;
  const pre = [...closure(byKey, unit.key)].map((k) => byKey.get(k)).filter(Boolean).sort(byOrder);
  const post = units.filter((u) => u.expects.some((e) => e.from === unit.key)).sort(byOrder);
  const parallel = wave ? units.filter((u) => u.key !== unit.key && ledger.units[u.key]?.wave === wave).sort(byOrder) : [];
  const L = [];
  L.push(`# Campaign context: ${unit.slug}`, '');
  L.push(`Packet ${unit.key} (${unit.form}) of campaign \`${ledger?.brainstorm ?? '?'}\`, wave ${wave ?? '?'}. Read this file fresh, by path, at each stage: the campaign updates it while the run drives.`, '');
  L.push('## 1. This slug\'s carried decisions', '', 'Verbatim, as the person confirmed them in prepare.', '');
  L.push(...(unit.decisions.length ? unit.decisions.map((d) => `- **${d.key}** — ${d.text}${d['decided-at'] ? ` (${d['decided-at']})` : ''}`) : ['- None.']), '');
  L.push('This slug provides:', '');
  L.push(...(unit.provides.length ? unit.provides.map((p) => `- \`${p.key}\`: ${p.text}`) : ['- Nothing named.']), '');
  const directPre = new Set(unit.dependsOn);
  const preLines = [];
  for (const u of pre) {
    const note = asBuilt[u.key];
    if (!directPre.has(u.key) && pre.length + post.length > 0 && preLinesTooLong(pre, post)) {
      preLines.push(`- ${u.key} \`${u.slug}\`${note?.path ? ` — [as-built](${note.path})` : ''}`);
      continue;
    }
    preLines.push(`### ${u.key} \`${u.slug}\`${note?.path ? ` — [as-built](${note.path})` : ' — not merged yet'}`, '');
    const diffs = (note?.lines ?? []).filter((l) => l.status !== 'met');
    for (const d of diffs) preLines.push(`- **Differs:** \`${d.key}\` is ${d.status}${d.note ? `: ${d.note}` : ''}.`);
    preLines.push(...(u.provides.length ? u.provides.map((p) => `- Provides \`${p.key}\`: ${p.text}`) : ['- Provides nothing named.']), '');
  }
  for (const k of new Set([...(unit.writtenDeps ?? []), ...(unit.writtenExpects ?? []).map((e) => e.from)])) {
    preLines.push(`### ${k} — written in the brainstorm session`, '');
    const exps = (unit.writtenExpects ?? []).filter((e) => e.from === k);
    preLines.push(...(exps.length ? exps.map((e) => `- Expects \`${e.key}\`: ${e.text}`) : ['- Expects nothing named.']), '');
  }
  L.push('## 2. Preceding slugs', '', 'What this slug builds on. A difference between the as-built note and a provides line comes first.', '');
  L.push(...(preLines.length ? preLines : ['- None.', '']));
  L.push('## 3. Succeeding slugs', '', 'Do not break these lines. Plan treats each one as a Known Constraint. A plan fork that would break one is intent-bearing.', '');
  const postLines = [];
  for (const u of post) for (const e of u.expects.filter((x) => x.from === unit.key)) postLines.push(`- ${u.key} \`${u.slug}\` expects \`${e.key}\`: ${e.text}`);
  L.push(...(postLines.length ? postLines : ['- None.']), '');
  L.push('## 4. Parallel slugs', '', 'The other slugs of this wave. They have not merged yet.', '');
  L.push(...(parallel.length ? parallel.map((u) => `- ${u.key} \`${u.slug}\`: ${u.provides.map((p) => p.text).join('; ') || 'provides nothing named'}`) : ['- None.']), '');
  L.push('## 5. Drift notes', '', 'Implementation-detail differences that the drift check recorded for this slug.', '');
  L.push(...(drift.length ? drift.map((d) => `- \`${d.from}/${d.key}\` (${d.text}): ${d.note ?? d.status}`) : ['- None.']), '');
  L.push('## 6. Isolation', '');
  L.push(isolation ? (isolation.startsWith('- ') ? isolation : `- ${isolation}`) : '- Width 1, in the main checkout. No port base, no own build folder, no heavy-suite lock.', '');
  if (localRecords) L.push('- Local records: this repo does not track `.ai/`. Do not stage or commit a file under `.ai/`. The campaign copies the records back to the main checkout.', '');
  const waits = waitsText(ledger?.units?.[unit.key]);
  if (waits) L.push('## 7. Waits', '', 'Other units of this wave whose code this slug needs. The campaign updates this section after each merge.', '', waits, '');
  return L.join('\n');
}

// ---------------------------------------------------------------- Stage D: isolation and width (13)

/** The project's isolation contract from `.ai/sdlc-config.json`, or null when it is absent or not usable. */
export function isolationOf(config) {
  const iso = config?.campaign?.isolation;
  if (!iso || typeof iso !== 'object') return null;
  const ports = iso['port-env'];
  if (!ports || typeof ports !== 'object' || Array.isArray(ports)) return null;
  if (!Array.isArray(iso['build-dirs'])) return null;
  const absolute = (p) => (typeof p === 'string' && /^([A-Za-z]:[\\/]|\/)/.test(p) ? p : null);
  return {
    parallel: iso.parallel !== false,
    'port-env': ports,
    'build-dirs': iso['build-dirs'],
    'heavy-suites': Array.isArray(iso['heavy-suites']) ? iso['heavy-suites'] : [],
    // C4: the commands that need an idle machine (timed runs).
    'quiet-suites': Array.isArray(iso['quiet-suites']) ? iso['quiet-suites'] : [],
    'min-free-gb': Number.isFinite(iso['min-free-gb']) ? iso['min-free-gb'] : 20,
    // C5: a short absolute path for the folders a unit needs outside its worktree.
    'outside-root': absolute(iso['outside-root']),
    // C6: an absolute worktree root outside the repo, and the deepest build path to allow for.
    'worktree-root': absolute(iso['worktree-root']),
    'build-depth': Number.isFinite(iso['build-depth']) ? iso['build-depth'] : DEFAULT_BUILD_DEPTH,
  };
}

/** Each worktree gets base + 100 × index for each port variable. */
export function portsFor(isolation, index) {
  return Object.fromEntries(Object.entries(isolation?.['port-env'] ?? {}).map(([k, base]) => [k, Number(base) + 100 * index]));
}

/**
 * How many drives may run at once (13, 17.3, 17.5). A reading at `slow` narrows to 1,
 * and `pause` stops. An `unknown` budget keeps the set width: with the mod off (or on a
 * host without usage data) no reading is ever written, and a rule that narrows on
 * unknown would hold every campaign at width 1. A usage-limit error still pauses.
 */
export function effectiveWidth({ width = DEFAULT_WIDTH, isolation, budget = 'unknown' }) {
  if (budget === 'pause') return 0;
  if (!isolation || isolation.parallel === false) return 1;
  if (budget === 'slow') return 1;
  return Math.max(1, Number(width) || 1);
}

/** The prepared units of wave n to start now, in packet order, so that at most `width` drives run. */
export function driveSlots(ledger, n, width) {
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) return [];
  const running = w.units.filter((k) => ledger.units[k]?.state === 'running').length;
  const free = Math.max(0, width - running);
  return w.units
    .filter((k) => ledger.units[k]?.state === 'prepared')
    .sort((a, b) => (ledger.units[a].order ?? 0) - (ledger.units[b].order ?? 0))
    .slice(0, free);
}

/** Part 6 of the context file for a drive in a worktree. */
export function isolationText(isolation, { index, worktree, lockCmd, slug = '<slug>', outside = null }) {
  const ports = Object.entries(portsFor(isolation, index)).map(([k, v]) => `\`${k}=${v}\``).join(', ');
  const L = [];
  L.push(`- Worktree: \`${worktree}\`. Run every command there. Never write in the main checkout or in another worktree.`);
  if (ports) L.push(`- Ports: set ${ports} in the environment of every command that starts the app or the tests.`);
  if (isolation['build-dirs'].length) L.push(`- Build folders: ${isolation['build-dirs'].map((d) => `\`${d}\``).join(', ')} stay inside this worktree. Never point a build at another worktree's folder.`);
  // C5: where output goes, and who deletes it.
  L.push(`- Run output, copied binaries, logs and temporary files go in the worktree's \`.scratch/\` folder. Git ignores it, and the campaign deletes it with the worktree.`);
  if (outside) L.push(`- Outside folder: \`${outside}\`. Put only two kinds of item there: a second build folder that needs a short path, and a checkout of another commit (for example the old engine). The campaign deletes this folder when it removes the worktree. Never write outside the worktree and this folder.`);
  else L.push('- No outside folder: keep every build folder and checkout inside the worktree.');
  L.push('- Delete each temporary file and folder that you create when no later step reads it. Do not delete a file that a running process uses, a file that a later step or the review reads, or the worktree\'s own build folders. Before a stage ends, list in its artifact what you deleted and what you kept, with the reason for each kept item.');
  for (const suite of isolation['heavy-suites']) {
    L.push(`- Heavy suite \`${suite}\` runs only under the lock. Run \`${lockCmd} acquire ${slug}\` first. When it answers busy, wait, append a \`lock-wait\` line to the driver journal every 5 minutes, and try again. Run \`${lockCmd} release ${slug}\` after the suite ends, also when it fails.`);
  }
  // C4: a timed run needs an idle machine.
  for (const suite of isolation['quiet-suites'] ?? []) {
    L.push(`- Quiet suite \`${suite}\` needs an idle machine. Run \`${lockCmd} quiet acquire ${slug}\` first, and wait while it answers busy, as for a heavy suite. Run \`${lockCmd} quiet release ${slug}\` after the run. When the run still measured a busy machine, defer the timed criterion with \`kind: quiet-window\` (verify/_deferrals.md): the wave boundary runs it alone.`);
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- Stage D: stacked waves (16)

/** The branch wave n starts from: the trunk, or (stacked) the newest unshipped wave branch below it. */
export function waveBase(ledger, n, trunk) {
  if (!ledger.stack?.enabled) return trunk;
  const below = ledger.waves.filter((w) => w.n < n && w.state !== 'shipped' && w.state !== 'planned').sort((a, b) => b.n - a.n)[0];
  return below ? (below.branch ?? `campaign/${ledger.brainstorm}/wave-${below.n}`) : trunk;
}

// ---------------------------------------------------------------- Stage D: usage (17)

/** The newest of a list of usage readings `{ at, rateLimits }`. */
export function newestReading(readings) {
  return (readings ?? []).filter((r) => r && r.at && Array.isArray(r.rateLimits))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
}

/** 17.2–17.5: ok, slow, pause (with the reset time), or unknown. */
export function budgetState(reading, budget = DEFAULT_BUDGET, { now = Date.now(), staleMs = READING_STALE_MS } = {}) {
  const b = { ...DEFAULT_BUDGET, ...(budget ?? {}) };
  if (!reading || !Array.isArray(reading.rateLimits) || !reading.rateLimits.length) return { state: 'unknown', reason: 'no reading' };
  const age = now - Date.parse(reading.at);
  if (!Number.isFinite(age) || age > staleMs) return { state: 'unknown', reason: `the newest reading is older than ${Math.round(staleMs / 60000)} minutes` };
  const win = (kind) => reading.rateLimits.find((r) => r.kind === kind);
  const five = win('five_hour');
  const seven = win('seven_day');
  if (seven && seven.percentUsed >= 100 - b.sevenDayReserve) {
    return { state: 'pause', until: seven.resetsAt ?? null, reason: `7-day window at ${seven.percentUsed}%: the last ${b.sevenDayReserve}% is the person's reserve`, windows: reading.rateLimits };
  }
  if (five && five.percentUsed >= b.fiveHourPause) return { state: 'pause', until: five.resetsAt ?? null, reason: `5-hour window at ${five.percentUsed}%`, windows: reading.rateLimits };
  if (five && five.percentUsed >= b.fiveHourSlow) return { state: 'slow', reason: `5-hour window at ${five.percentUsed}%`, windows: reading.rateLimits };
  return { state: 'ok', windows: reading.rateLimits };
}

const USAGE_LIMIT_TEXT = /you(?:'|’)ve (?:reached|hit) your [^.\n]{0,40}\blimit\b|\busage limit\b[^.\n]{0,20}\breached|\bapi error: 429\b|\brate[_ ]limit(?:ed)?\b/i;

/** P3: a failure caused by a usage limit — the rate_limit kind, status 429, or the limit text. A 529 is not one. */
export function isUsageLimitFailure({ error = null, apiErrorStatus = null, text = '' } = {}) {
  if (error === 'rate_limit' || Number(apiErrorStatus) === 429) return true;
  if (error === 'server_error' || Number(apiErrorStatus) === 529) return false;
  return USAGE_LIMIT_TEXT.test(String(text ?? ''));
}

function preLinesTooLong(pre, post) {
  const lines = pre.reduce((n, u) => n + 3 + u.provides.length, 0) + post.reduce((n, u) => n + u.expects.length, 0);
  return lines > CONTEXT_LONG_LINES;
}

// ---------------------------------------------------------------- forecast

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Stage durations from driver journals (9.1 step 7). `journals` is a list of
 * parsed journal line arrays. Returns minutes per stage kind (median).
 */
export function stageMinutesFromJournals(journals) {
  const per = {};
  for (const lines of journals) {
    const open = new Map();
    for (const l of lines) {
      // The label decides the stage: an agent-end line may carry no stage field,
      // and a bookkeeping agent (plan-index-writeback) carries a misleading one.
      const stage = String(l.agent ?? '').split(':')[0];
      const at = Date.parse(l.at ?? '');
      if (!['plan', 'implement', 'verify', 'review'].includes(stage) || !Number.isFinite(at)) continue;
      const id = `${l.run}|${l.agent}`;
      if (l.event === 'agent-start') open.set(id, { stage, at });
      else if (l.event === 'agent-end' && open.has(id)) {
        const s = open.get(id);
        open.delete(id);
        (per[s.stage] ??= []).push((at - s.at) / 60000);
      }
    }
  }
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, median(v)]));
}

/** Total tokens of a cost.jsonl row (main + sub-agents). */
export function rowTokens(row) {
  const sum = (u) => (u ? ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'reasoning_output_tokens'].reduce((n, f) => n + (Number(u[f]) || 0), 0) : 0);
  return sum(row?.main) + (row?.subagents ?? []).reduce((n, s) => n + sum(s), 0);
}

/**
 * The forecast (9.1 step 7). `history` = { stageMinutes, sliceTokens (median per
 * slice), slicesPerSlug (median) }; `slices` maps a unit key to its slice count
 * when the slug is sliced. An estimate with no history is null (unknown).
 */
export function buildForecast({ units, history, slices = {} }) {
  const perSlice = ['plan', 'implement', 'verify'].map((s) => history.stageMinutes?.[s]);
  const sliceMinutes = perSlice.every((x) => Number.isFinite(x)) ? perSlice.reduce((a, b) => a + b, 0) : null;
  const review = history.stageMinutes?.review ?? null;
  const rows = units.filter(isBuildUnit).sort(byOrder).map((u) => {
    const n = slices[u.key] ?? history.slicesPerSlug ?? null;
    const known = Number.isFinite(n) && sliceMinutes !== null;
    return {
      key: u.key, slug: u.slug,
      slices: n, slicesFrom: slices[u.key] ? 'slice' : n ? 'history' : 'unknown',
      minutes: known ? Math.round(n * sliceMinutes + (review ?? 0)) : null,
      tokens: Number.isFinite(n) && Number.isFinite(history.sliceTokens) ? Math.round(n * history.sliceTokens) : null,
    };
  });
  const sum = (f) => (rows.every((r) => r[f] !== null) ? rows.reduce((a, r) => a + r[f], 0) : null);
  return { rows, minutes: sum('minutes'), tokens: sum('tokens'), unknown: rows.filter((r) => r.minutes === null).map((r) => r.key) };
}

export function renderForecast(fc, { brainstorm, now = new Date().toISOString(), actual = [] } = {}) {
  const L = [`# Forecast: ${brainstorm}`, '', `Written ${now}. This is an estimate from earlier yolo runs in this repository, not a promise. The campaign updates it after each wave with the real numbers.`, ''];
  L.push('| Packet | Slug | Slices | Minutes | Tokens |', '|---|---|---|---|---|');
  for (const r of fc.rows) L.push(`| ${r.key} | \`${r.slug}\` | ${r.slices ?? 'unknown'}${r.slicesFrom === 'history' ? ' (from history)' : ''} | ${r.minutes ?? 'unknown'} | ${r.tokens ?? 'unknown'} |`);
  L.push('');
  L.push(`- Total run time: ${fc.minutes !== null ? `about ${Math.round(fc.minutes / 60)} hours (${fc.minutes} minutes) at width 1` : 'unknown: some slugs have no history'}.`);
  L.push(`- Total tokens: ${fc.tokens !== null ? fc.tokens.toLocaleString('en-US') : 'unknown'}.`);
  L.push(`- Unknown estimates: ${fc.unknown.length ? fc.unknown.join(', ') : 'none'}.`);
  L.push('- Weeks of the 7-day limit: unknown until the usage guard records readings (Stage D3).', '');
  if (actual.length) {
    L.push('## Actual, per wave', '', '| Wave | Minutes | Tokens |', '|---|---|---|');
    for (const a of actual) L.push(`| ${a.wave} | ${a.minutes ?? 'unknown'} | ${a.tokens ?? 'unknown'} |`);
    L.push('');
  }
  return L.join('\n');
}
