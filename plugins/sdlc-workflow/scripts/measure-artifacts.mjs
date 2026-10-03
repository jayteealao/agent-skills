#!/usr/bin/env node
// scripts/measure-artifacts.mjs — the artifact meter (ARTIFACT-SPLIT-PLAN.md, wave W0).
//
// One meter for five measures of how agents use workflow artifacts:
//   (a) yolo    — which files each yolo stage agent (plan, implement, verify,
//                 review) read: its own reference, the artifact before it,
//                 02-shape.md, po-answers.md, its `_artifact.md` and the other
//                 procedure files its reference orders.
//   (b) reads   — reads refused as too large, and partial (offset/limit) reads,
//                 across every session that read a workflow artifact.
//   (c) index   — 00-index.md size p50/p90/max across slugs on disk.
//   (d) writes  — artifact write mix: stage `.md` against the view layer
//                 (`.yaml`, `.html.fragment`) and the explainer fragment.
//   (e) ledger  — required-read coverage from `.ai/workflows/*/.read-ledger.jsonl`
//                 rows (spec S6): the share of checks with an empty `missing` list.
//
// A read is a `Read` call, or a shell command (Bash, PowerShell, a Codex shell
// call) that reads a file with a read verb (`cat`, `Get-Content`, `sed`, ...).
// Paths match in absolute and relative form: `cat 02-shape.md` after a `cd`
// counts. An earlier set of scripts matched only absolute `Read` paths and
// undercounted reads badly.
//
//   node scripts/measure-artifacts.mjs [--since 2026-07-01] [--projects <dir>]
//        [--codex <dir>] [--dev <dir>] [--json] [--baseline <file>] [--out <file>]
//
// Token counts are characters divided by 4. Node builtins only.

import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
/** The default `--dev` root: the parent of the repo that holds the plugin. */
const DEFAULT_DEV = resolve(PLUGIN_ROOT, '..', '..', '..');
/** Test fixtures and non-product repos that the disk sections skip. */
const SKIP_PROJECTS = new Set(['wf-mod-fixture', 'tier-b', 'grok-test', 'pi-sdlc']);

export const STAGES = ['plan', 'implement', 'verify', 'review'];

/** Top-level reference names that a bare relative path may name. */
const REFERENCE_NAMES = new Set([
  'auto.md', 'brainstorm.md', 'campaign.md', 'close.md', 'design.md', 'docs.md', 'handoff.md', 'implement.md', 'intake.md',
  'observability.md', 'plan.md', 'probe.md', 'recap.md', 'retro.md', 'review.md', 'runtime-adapters.md',
  'shape.md', 'ship-plan.md', 'ship.md', 'simplify.md', 'slice.md', 'status.md', 'task.md', 'verify.md', 'yolo.md',
]);
/** Reference sub-folders that a relative `<dir>/_x.md` path may name. */
const REFERENCE_DIRS = new Set([
  'augment', 'campaign', 'design', 'docs', 'handoff', 'implement', 'intake', 'observability', 'probe', 'retro', 'review',
  'runtime-adapters', 'ship', 'ship-plan', 'simplify', 'status', 'verify',
]);

/**
 * What each yolo stage agent must read. `prefix` entries match an artifact
 * basename by prefix (any slice); `ref` entries match a reference path.
 */
export const STAGE_WANTS = {
  plan: {
    adjacent: '03-slice',
    template: null,
    procedures: ['_story-arc.md'],
  },
  implement: {
    adjacent: '04-plan',
    template: 'implement/_artifact.md',
    procedures: ['implement/_research.md'],
  },
  verify: {
    adjacent: '05-implement',
    template: 'verify/_artifact.md',
    procedures: ['verify/_sub-agents.md', 'verify/_deferrals.md', '_fix-loop.md', 'runtime-adapters.md'],
  },
  review: {
    adjacent: '06-verify',
    template: 'review/_artifact.md',
    procedures: ['review/_stage.md', 'review/_context.md', 'review/_dispatch.md', '_findings-ledger.md'],
  },
};

const READ_VERBS = /(?:^|[\s;|&(])(?:cat|type|Get-Content|gc|sed|head|tail|awk|less|more|bat|grep|egrep|rg|Select-String|findstr|jq|yq)(?=\s)/i;
const WRITE_CMDLETS = /\b(?:Set-Content|Out-File|Add-Content|tee)\b[^;|&]*/gi;
const PATH_TOKEN = /[^\s'"`|;<>(),={}[\]]+?\.(?:md|ya?ml|fragment|html|jsonl)(?![\w.])/g;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the tests)
// ---------------------------------------------------------------------------

/** Nearest-rank quantile of a number list; 0 for an empty list. */
export function quantile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const pct = (a, b) => (b > 0 ? Math.round((a * 1000) / b) / 10 : 0);
const kb = (n) => Math.round(n / 1024);

/** A path with forward slashes and no doubled separators. */
export function normalizePath(p) {
  return String(p).replace(/\\+/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '');
}

/** The artifact family of a workflow file basename. */
export function stemOf(name) {
  if (name === 'po-answers.md') return 'po-answers';
  if (/\.explainer\.html\.fragment$/.test(name)) return 'explainer';
  if (/\.(fragment|html)$/.test(name)) return 'view';
  if (/\.ya?ml$/.test(name)) return 'sibling-yaml';
  const m = name.match(/^\d+[a-z]?-([a-z]+)/i);
  return m ? m[1].toLowerCase() : 'other';
}

/**
 * Classifies one path. Returns
 *   { kind: 'artifact', slug, name, stem }   a workflow file (slug null when relative)
 *   { kind: 'reference', ref }               a `skills/wf/reference/` file
 *   null                                     anything else
 */
export function classifyPath(raw) {
  const p = normalizePath(raw);
  const wf = p.match(/(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/);
  if (wf) {
    const name = wf[2].split('/').pop();
    return { kind: 'artifact', slug: wf[1], name, stem: wf[2].includes('/') ? 'other' : stemOf(name) };
  }
  const ref = p.match(/(?:^|\/)skills\/wf\/reference\/(.+\.md)$/) || p.match(/(?:^|\/)reference\/(.+\.md)$/);
  if (ref) return { kind: 'reference', ref: ref[1] };
  const name = p.split('/').pop();
  if (/^\d\d[a-z]?-[a-z][a-z0-9.-]*\.(md|ya?ml|fragment)$/i.test(name) || name === 'po-answers.md') {
    if (/(^|\/)(docs|node_modules|tests?|fixtures?)\//.test(p)) return null;
    return { kind: 'artifact', slug: null, name, stem: stemOf(name) };
  }
  if (!p.includes('/') && (REFERENCE_NAMES.has(p) || /^_[a-z0-9-]+\.md$/.test(p))) return { kind: 'reference', ref: p };
  const sub = p.match(/^([a-z-]+)\/(_?[a-z0-9-]+\.md)$/);
  if (sub && REFERENCE_DIRS.has(sub[1])) return { kind: 'reference', ref: p };
  return null;
}

/** Every file path token in a text, in order, without repeats. */
export function pathTokens(text) {
  return [...new Set(String(text).match(PATH_TOKEN) || [])];
}

/**
 * The files one tool call reads. `partial` is true for a `Read` with an
 * offset or a limit. Shell commands count only with a read verb; a path that a
 * redirect or a write cmdlet targets is dropped.
 */
export function readsOf(name, input) {
  const i = input || {};
  if (name === 'Read' || name === 'read_file') {
    const c = classifyPath(i.file_path || i.path || '');
    return c ? [{ path: normalizePath(i.file_path || i.path), cls: c, partial: Boolean(i.offset || i.limit) }] : [];
  }
  let command = '';
  if (/^(Bash|PowerShell|shell|shell_command|exec|exec_command|local_shell)$/.test(name)) {
    command = typeof i === 'string' ? i : Array.isArray(i.command) ? i.command.join(' ') : String(i.command ?? i.cmd ?? '');
  } else if (typeof input === 'string' && /shell_command|Get-Content|\bcat\b/.test(input)) {
    command = input;
  }
  if (!command || !READ_VERBS.test(command.replace(/\\"/g, '"'))) return [];
  const cleaned = command.replace(/\\"/g, '"').replace(/>>?\s*["']?[^\s"';|&]+/g, ' ').replace(WRITE_CMDLETS, ' ');
  const out = [];
  for (const token of pathTokens(cleaned)) {
    const c = classifyPath(token);
    if (c) out.push({ path: normalizePath(token), cls: c, partial: false });
  }
  return out;
}

/** The workflow files one tool call writes, with the characters written. */
export function writesOf(name, input) {
  const i = input || {};
  let chars = 0;
  if (name === 'Write') chars = String(i.content ?? '').length;
  else if (name === 'Edit') chars = String(i.new_string ?? '').length;
  else if (name === 'MultiEdit') chars = (i.edits || []).reduce((a, e) => a + String(e.new_string ?? '').length, 0);
  else if (name === 'NotebookEdit') chars = String(i.new_source ?? '').length;
  else return [];
  const path = i.file_path || i.notebook_path || '';
  const c = classifyPath(path);
  return c && c.kind === 'artifact' ? [{ path: normalizePath(path), cls: c, chars, bucket: writeBucket(c.name) }] : [];
}

/** stage-md, view, explainer or other, for a written artifact basename. */
export function writeBucket(name) {
  if (/\.explainer\.html\.fragment$/.test(name)) return 'explainer';
  if (/\.(fragment|html|ya?ml)$/.test(name)) return 'view';
  if (/\.md$/.test(name)) return 'stage-md';
  return 'other';
}

const textOf = (c) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : x?.text ?? (typeof x?.content === 'string' ? x.content : ''))).join('') : '';

/**
 * Parses one transcript line (Claude Code or Codex) into the parts the meter
 * uses. Returns null for a line that does not parse.
 *   { userText, uses: [{id, name, input}], results: [{id, text}], usage: {id, output} | null, at }
 */
export function parseTranscriptLine(line) {
  if (!line || line[0] !== '{') return null;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  const out = { userText: null, uses: [], results: [], usage: null, at: typeof j.timestamp === 'string' ? j.timestamp : null };
  const m = j.message;
  if (m && (m.role === 'user' || m.role === 'assistant')) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.userText = m.content;
      else if (Array.isArray(m.content)) {
        const t = m.content.filter((c) => c?.type === 'text').map((c) => c.text).join('');
        if (t) out.userText = t;
        for (const c of m.content) if (c?.type === 'tool_result') out.results.push({ id: c.tool_use_id, text: textOf(c.content) });
      }
    } else if (Array.isArray(m.content)) {
      for (const c of m.content) if (c?.type === 'tool_use') out.uses.push({ id: c.id, name: c.name, input: c.input || {} });
      if (m.usage) out.usage = { id: m.id || null, output: m.usage.output_tokens || 0 };
    }
    return out;
  }
  const p = j.payload;
  if (p && typeof p === 'object') {
    if (p.type === 'message' && p.role === 'user') out.userText = textOf(p.content);
    else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      let input = p.input ?? p.arguments ?? p.action ?? '';
      if (typeof input === 'string' && p.type === 'function_call') {
        try {
          input = JSON.parse(input);
        } catch {
          /* keep the string */
        }
      }
      out.uses.push({ id: p.call_id, name: p.name || 'shell', input });
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      out.results.push({ id: p.call_id, text: typeof p.output === 'string' ? p.output : textOf(p.output?.content ?? p.output) });
    } else if (p.type === 'token_count' && p.info?.last_token_usage) {
      out.usage = { id: null, output: p.info.last_token_usage.output_tokens || 0 };
    }
  }
  return out;
}

/** The yolo stage a sub-agent prompt starts (the driver line opens a line of the first message), or null. */
export function yoloStageOf(text) {
  const m = String(text || '').match(/^\s*Execute the SDLC '([a-z-]+)' stage for slug '([^']+)'(?:, slice '([^']+)')?[^\n]*FULLY AUTONOMOUSLY/m);
  if (!m || !STAGES.includes(m[1])) return null;
  const root = String(text).match(/([A-Za-z]:[\\/][^\s'"`]*?|\/[^\s'"`]*?)[\\/]\.ai[\\/]workflows[\\/]/);
  return { stage: m[1], slug: m[2], slice: m[3] || null, root: root ? join(root[1], '.ai', 'workflows', m[2]) : null };
}

/** True when a tool result reports a `Read` refused as too large. */
export function isRefused(text) {
  return String(text).length < 2000 && /exceeds maximum allowed tokens|File content \([^)]*\) exceeds/i.test(String(text));
}

/** True when a shell read's output was over the cap and was saved to a file instead. */
export function isSpilled(text) {
  return /^\s*<persisted-output>\s*Output too large/i.test(String(text));
}

// ---------------------------------------------------------------------------
// Session analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes one session from its parsed lines. Pure: the caller streams the
 * file. Returns the reads, writes, refusals and (for a yolo stage agent) the
 * coverage facts.
 */
export function analyzeSession(parsedLines, options = {}) {
  const a = createSessionAnalyzer(options);
  for (const line of parsedLines) a.push(line);
  return a.done();
}

/** The streaming form of `analyzeSession`: `push` each parsed line, then `done`. */
export function createSessionAnalyzer({ subagent = false } = {}) {
  const pending = new Map();
  const seenUsage = new Set();
  const seenFile = new Set();
  const s = {
    subagent, yolo: null, startAt: null, reads: 0, readChars: 0, repeatChars: 0, partial: 0, refused: 0,
    refusedByStem: {}, spilled: 0, readStems: {}, writes: [], outputTokens: 0, artifactReadChars: 0,
    readRefs: new Set(), readArtifacts: new Set(), partialRefs: new Set(), siblingPlansRead: new Set(),
  };
  let first = true;
  const push = (line) => {
    if (!line) return;
    if (!s.startAt && line.at) s.startAt = line.at;
    if (first && line.userText) {
      s.yolo = subagent ? yoloStageOf(line.userText) : null;
      first = false;
    }
    if (line.usage) {
      const key = line.usage.id;
      if (key === null || !seenUsage.has(key)) {
        if (key !== null) seenUsage.add(key);
        s.outputTokens += line.usage.output;
      }
    }
    for (const u of line.uses) {
      for (const w of writesOf(u.name, u.input)) s.writes.push(w);
      const reads = readsOf(u.name, u.input);
      if (reads.length) pending.set(u.id, reads);
    }
    for (const r of line.results) {
      const reads = pending.get(r.id);
      if (!reads) continue;
      pending.delete(r.id);
      const arts = reads.filter((x) => x.cls.kind === 'artifact');
      // A shell read over the output cap saves the output to a file and shows a
      // preview; the agent reads the saved file next. It counts as a read for
      // coverage, and as `spilled`, but its preview is not counted as tokens.
      const spilled = isSpilled(r.text) && arts.length > 0;
      if (spilled) s.spilled++;
      if (isRefused(r.text)) {
        s.refused++;
        for (const a of arts.length ? arts : reads) {
          const k = a.cls.kind === 'artifact' ? a.cls.stem : 'reference';
          s.refusedByStem[k] = (s.refusedByStem[k] || 0) + 1;
        }
        continue;
      }
      for (const x of reads) {
        if (x.cls.kind === 'reference') {
          s.readRefs.add(x.cls.ref);
          if (x.partial) s.partialRefs.add(x.cls.ref);
        } else {
          s.readArtifacts.add(x.cls.name);
          const plan = x.cls.name.match(/^04-plan-(.+)\.md$/);
          if (plan) s.siblingPlansRead.add(plan[1]);
        }
      }
      if (!arts.length || spilled) continue;
      const n = r.text.length;
      s.reads++;
      s.readChars += n;
      if (arts.some((a) => a.partial)) s.partial++;
      for (const a of arts) {
        const share = n / arts.length;
        const key = `${a.cls.slug ?? ''}/${a.cls.name}`;
        if (seenFile.has(key)) s.repeatChars += share;
        seenFile.add(key);
        s.readStems[a.cls.stem] = (s.readStems[a.cls.stem] || 0) + share;
      }
      s.artifactReadChars += n;
    }
  };
  return { push, done: () => s };
}

/** Yolo coverage facts for one analyzed session, or null when it is not a yolo stage agent. */
export function yoloCoverage(s) {
  if (!s.yolo) return null;
  const want = STAGE_WANTS[s.yolo.stage];
  const arts = [...s.readArtifacts];
  const hasRef = (r) => [...s.readRefs].some((x) => x === r || x.endsWith('/' + r));
  const own = `${s.yolo.stage}.md`;
  const facts = {
    stage: s.yolo.stage,
    own: [...s.readRefs].includes(own),
    ownPartial: s.partialRefs.has(own),
    adjacent: arts.some((a) => a.startsWith(want.adjacent)),
    shape: arts.includes('02-shape.md'),
    po: arts.includes('po-answers.md'),
    template: want.template ? hasRef(want.template) : null,
    procedures: Object.fromEntries(want.procedures.map((p) => [p, hasRef(p)])),
    artifactTokens: Math.round(s.artifactReadChars / 4),
  };
  return facts;
}

// ---------------------------------------------------------------------------
// File walking and streaming
// ---------------------------------------------------------------------------

function walkJsonl(dir, sinceMs) {
  const out = [];
  if (!dir || !existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.jsonl')) {
        try {
          if (statSync(p).mtimeMs >= sinceMs) out.push(p);
        } catch {
          /* gone */
        }
      }
    }
  }
  return out;
}

/** Streams one transcript file through a session analyzer. */
async function analyzeFile(file, options) {
  const a = createSessionAnalyzer(options);
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) a.push(parseTranscriptLine(l));
  return a.done();
}

/** Earlier sibling plans on disk for a yolo plan agent: plans created before the session started. */
function siblingPlansAvailable(yolo, startAt) {
  if (!yolo.root || !yolo.slice || !existsSync(yolo.root)) return null;
  const start = Date.parse(startAt || '');
  let n = 0;
  for (const f of readdirSync(yolo.root)) {
    const m = f.match(/^04-plan-(.+)\.md$/);
    if (!m || m[1] === yolo.slice) continue;
    let created = NaN;
    try {
      created = Date.parse((readFileSync(join(yolo.root, f), 'utf8').match(/created-at:\s*"?([^"\n]+)/) || [])[1]);
    } catch {
      /* unreadable */
    }
    if (created && (!start || created < start)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function transcriptSections({ projects, codex, sinceMs }) {
  const files = [
    ...walkJsonl(projects, sinceMs).map((f) => ['claude', f]),
    ...walkJsonl(codex, sinceMs).map((f) => ['codex', f]),
  ];
  const reads = {
    sessionsScanned: files.length, readingSessions: 0, subagentSessions: 0, codexSessions: 0,
    reads: 0, readTokens: 0, repeatShare: 0, refused: 0, refusedByStem: {}, spilled: 0, partial: 0, readTokensByStem: {},
  };
  const writes = { stageMd: 0, view: 0, explainer: 0, other: 0, byStem: {}, outputTokens: 0 };
  const yolo = Object.fromEntries(STAGES.map((st) => [st, []]));
  const siblings = [];
  let repeatChars = 0;
  for (const [kind, f] of files) {
    const subagent = kind === 'claude' && /[\\/]subagents[\\/]/.test(f);
    let s;
    try {
      s = await analyzeFile(f, { subagent });
    } catch {
      continue;
    }
    const cov = yoloCoverage(s);
    if (cov) {
      yolo[cov.stage].push(cov);
      if (cov.stage === 'plan') {
        const avail = siblingPlansAvailable(s.yolo, s.startAt);
        if (avail) {
          const read = [...s.siblingPlansRead].filter((x) => x !== s.yolo.slice).length;
          siblings.push({ avail, read: Math.min(read, avail) });
        }
      }
    }
    if (s.reads || s.refused || s.spilled) {
      reads.readingSessions++;
      if (subagent) reads.subagentSessions++;
      if (kind === 'codex') reads.codexSessions++;
    }
    reads.reads += s.reads;
    reads.readTokens += s.readChars / 4;
    repeatChars += s.repeatChars;
    reads.refused += s.refused;
    reads.spilled += s.spilled;
    reads.partial += s.partial;
    for (const [k, v] of Object.entries(s.refusedByStem)) reads.refusedByStem[k] = (reads.refusedByStem[k] || 0) + v;
    for (const [k, v] of Object.entries(s.readStems)) reads.readTokensByStem[k] = (reads.readTokensByStem[k] || 0) + v / 4;
    if (s.reads || s.writes.length) writes.outputTokens += s.outputTokens;
    for (const w of s.writes) {
      const t = w.chars / 4;
      const key = { 'stage-md': 'stageMd', view: 'view', explainer: 'explainer' }[w.bucket] || 'other';
      writes[key] += t;
      writes.byStem[w.cls.stem] = (writes.byStem[w.cls.stem] || 0) + t;
    }
  }
  reads.repeatShare = pct(repeatChars / 4, reads.readTokens);
  reads.readTokens = Math.round(reads.readTokens);
  for (const k of Object.keys(reads.readTokensByStem)) reads.readTokensByStem[k] = Math.round(reads.readTokensByStem[k]);
  const artifactWrites = writes.stageMd + writes.view + writes.explainer + writes.other;
  const writeSummary = {
    stageMdTokens: Math.round(writes.stageMd),
    viewTokens: Math.round(writes.view),
    explainerTokens: Math.round(writes.explainer),
    otherTokens: Math.round(writes.other),
    viewShare: pct(writes.view, artifactWrites),
    explainerShare: pct(writes.explainer, artifactWrites),
    outputTokens: writes.outputTokens,
    artifactShareOfOutput: pct(artifactWrites, writes.outputTokens),
    byStem: Object.fromEntries(Object.entries(writes.byStem).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1])),
  };
  const yoloSummary = {};
  for (const st of STAGES) {
    const rows = yolo[st];
    const share = (fn) => pct(rows.filter(fn).length, rows.length);
    const want = STAGE_WANTS[st];
    const tokens = rows.map((r) => r.artifactTokens);
    yoloSummary[st] = {
      n: rows.length,
      own: share((r) => r.own),
      ownPartial: rows.filter((r) => r.ownPartial).length,
      adjacent: share((r) => r.adjacent),
      shape: share((r) => r.shape),
      po: share((r) => r.po),
      template: want.template ? share((r) => r.template) : null,
      procedures: Object.fromEntries(want.procedures.map((p) => [p, share((r) => r.procedures[p])])),
      artifactTokensP50: quantile(tokens, 0.5),
      artifactTokensP90: quantile(tokens, 0.9),
    };
  }
  const ratios = siblings.map((x) => x.read / x.avail);
  yoloSummary.siblingPlans = {
    agents: siblings.length,
    meanAvailable: siblings.length ? Math.round((siblings.reduce((a, x) => a + x.avail, 0) / siblings.length) * 10) / 10 : 0,
    readAny: siblings.filter((x) => x.read > 0).length,
    readAll: siblings.filter((x) => x.read >= x.avail).length,
    medianShareRead: Math.round(quantile(ratios, 0.5) * 100),
  };
  return { yolo: yoloSummary, reads, writes: writeSummary };
}

/** Slug folders under `<dev>/*\/.ai/workflows` with a top-level `.md` changed since `sinceMs`. */
export function activeSlugs(dev, sinceMs) {
  const out = [];
  if (!dev || !existsSync(dev)) return out;
  for (const proj of readdirSync(dev)) {
    if (SKIP_PROJECTS.has(proj)) continue;
    const wf = join(dev, proj, '.ai', 'workflows');
    if (!existsSync(wf)) continue;
    let entries;
    try {
      entries = readdirSync(wf, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const dir = join(wf, e.name);
      const top = readdirSync(dir).filter((f) => f.endsWith('.md'));
      if (!top.some((f) => statSync(join(dir, f)).mtimeMs >= sinceMs)) continue;
      out.push({ proj, slug: e.name, dir });
    }
  }
  return out;
}

/** Size facts for one `00-index.md` text. */
export function indexFacts(text) {
  let fm = '';
  if (text.startsWith('---')) {
    const i = text.indexOf('\n---', 3);
    fm = i < 0 ? text : text.slice(0, i + 4);
  }
  const comment = fm.split('\n').filter((l) => /^\s*#/.test(l)).reduce((a, l) => a + l.length + 1, 0);
  return { bytes: Buffer.byteLength(text), fmChars: fm.length, commentChars: comment, chars: text.length };
}

function indexSection(slugs) {
  const rows = [];
  for (const s of slugs) {
    const f = join(s.dir, '00-index.md');
    if (!existsSync(f)) continue;
    rows.push({ where: `${s.proj}/${s.slug}`, ...indexFacts(readFileSync(f, 'utf8')) });
  }
  const bytes = rows.map((r) => r.bytes);
  const chars = rows.reduce((a, r) => a + r.chars, 0);
  return {
    slugs: slugs.length,
    projects: new Set(slugs.map((s) => s.proj)).size,
    indexes: rows.length,
    p50KB: kb(quantile(bytes, 0.5)),
    p90KB: kb(quantile(bytes, 0.9)),
    maxKB: kb(bytes.length ? Math.max(...bytes) : 0),
    over20KB: rows.filter((r) => r.bytes > 20 * 1024).length,
    frontmatterShare: pct(rows.reduce((a, r) => a + r.fmChars, 0), chars),
    commentShare: pct(rows.reduce((a, r) => a + r.commentChars, 0), chars),
    largest: rows.sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((r) => ({ where: r.where, KB: kb(r.bytes) })),
  };
}

/** Required-read coverage from `.read-ledger.jsonl` rows (spec S6). */
export function ledgerSection(slugs, sinceMs) {
  const by = {};
  let files = 0;
  for (const s of slugs) {
    const f = join(s.dir, '.read-ledger.jsonl');
    if (!existsSync(f)) continue;
    files++;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const at = Date.parse(row.at || '');
      if (!Number.isNaN(at) && at < sinceMs) continue;
      const st = row.stage || '(none)';
      const b = (by[st] ??= { checks: 0, complete: 0, waived: 0, partial: 0 });
      b.checks++;
      if (Array.isArray(row.missing) && row.missing.length === 0) b.complete++;
      if (row.waiver) b.waived++;
      if (Array.isArray(row.partial) && row.partial.length) b.partial++;
    }
  }
  const stages = {};
  let checks = 0;
  let complete = 0;
  for (const [st, b] of Object.entries(by)) {
    stages[st] = { ...b, completeShare: pct(b.complete, b.checks) };
    checks += b.checks;
    complete += b.complete;
  }
  return { ledgerFiles: files, checks, completeShare: pct(complete, checks), stages };
}

// ---------------------------------------------------------------------------
// The whole measure, the headline, the baseline compare
// ---------------------------------------------------------------------------

export async function measure({ since, projects, codex, dev }) {
  const sinceMs = Date.parse(since);
  const t = await transcriptSections({ projects, codex, sinceMs });
  const slugs = activeSlugs(dev, sinceMs);
  const result = {
    generatedAt: new Date().toISOString(),
    since,
    yolo: t.yolo,
    reads: t.reads,
    index: indexSection(slugs),
    writes: t.writes,
    ledger: ledgerSection(slugs, sinceMs),
  };
  result.headline = headlineOf(result);
  return result;
}

/** The flat numbers a baseline compares. */
export function headlineOf(r) {
  const h = {};
  for (const st of STAGES) {
    const y = r.yolo[st];
    if (!y) continue;
    h[`yolo.${st}.n`] = y.n;
    h[`yolo.${st}.own%`] = y.own;
    h[`yolo.${st}.adjacent%`] = y.adjacent;
    h[`yolo.${st}.shape%`] = y.shape;
    h[`yolo.${st}.po%`] = y.po;
    if (y.template !== null) h[`yolo.${st}.template%`] = y.template;
  }
  h['reads.sessions'] = r.reads.readingSessions;
  h['reads.refused'] = r.reads.refused;
  h['reads.spilled'] = r.reads.spilled;
  h['reads.partial'] = r.reads.partial;
  h['index.p50KB'] = r.index.p50KB;
  h['index.p90KB'] = r.index.p90KB;
  h['index.maxKB'] = r.index.maxKB;
  h['writes.view%'] = r.writes.viewShare;
  h['writes.explainer%'] = r.writes.explainerShare;
  h['writes.artifactOfOutput%'] = r.writes.artifactShareOfOutput;
  h['ledger.complete%'] = r.ledger.completeShare;
  for (const [st, b] of Object.entries(r.ledger.stages)) h[`ledger.${st}.complete%`] = b.completeShare;
  return h;
}

/** Rows of `{key, baseline, now, delta}` for every headline key in either side. */
export function compareHeadlines(baseline, now) {
  const keys = [...new Set([...Object.keys(baseline || {}), ...Object.keys(now || {})])];
  return keys.map((key) => {
    const b = baseline?.[key];
    const n = now?.[key];
    return { key, baseline: b ?? null, now: n ?? null, delta: typeof b === 'number' && typeof n === 'number' ? Math.round((n - b) * 10) / 10 : null };
  });
}

function formatText(r, comparison) {
  const L = [];
  L.push(`artifact meter · since ${r.since}`);
  L.push('');
  L.push('(a) yolo stage agents — share that read the file');
  L.push('  stage       n   own  adjacent  shape  po   template  artifact tokens p50/p90');
  for (const st of STAGES) {
    const y = r.yolo[st];
    L.push(`  ${st.padEnd(10)}${String(y.n).padStart(3)}  ${String(y.own).padStart(4)}%  ${String(y.adjacent).padStart(6)}%  ${String(y.shape).padStart(4)}%  ${String(y.po).padStart(3)}%  ${y.template === null ? '     —' : String(y.template).padStart(6) + '%'}   ${y.artifactTokensP50}/${y.artifactTokensP90}`);
    const procs = Object.entries(y.procedures).map(([p, v]) => `${p} ${v}%`).join(' · ');
    L.push(`             procedures: ${procs}${y.ownPartial ? ` · own reference read in part ${y.ownPartial}` : ''}`);
  }
  const sp = r.yolo.siblingPlans;
  L.push(`  sibling plans: ${sp.agents} plan agents had earlier siblings (mean ${sp.meanAvailable}); read any ${sp.readAny}, read all ${sp.readAll}, median share read ${sp.medianShareRead}%`);
  L.push('');
  L.push('(b) reads');
  L.push(`  sessions scanned ${r.reads.sessionsScanned} · reading sessions ${r.reads.readingSessions} (sub-agents ${r.reads.subagentSessions}, codex ${r.reads.codexSessions})`);
  L.push(`  artifact reads ${r.reads.reads} · tokens ${r.reads.readTokens} · repeat share ${r.reads.repeatShare}%`);
  L.push(`  refused as too large ${r.reads.refused} ${JSON.stringify(r.reads.refusedByStem)} · shell output over the cap ${r.reads.spilled} · partial (offset/limit) ${r.reads.partial}`);
  L.push('');
  L.push('(c) index');
  L.push(`  ${r.index.indexes} indexes in ${r.index.slugs} slugs, ${r.index.projects} projects · p50 ${r.index.p50KB} KB · p90 ${r.index.p90KB} KB · max ${r.index.maxKB} KB · over 20 KB ${r.index.over20KB}`);
  L.push(`  frontmatter share ${r.index.frontmatterShare}% · YAML-comment share ${r.index.commentShare}%`);
  L.push('');
  L.push('(d) artifact writes (Claude Write/Edit/MultiEdit/NotebookEdit, tokens)');
  L.push(`  stage md ${r.writes.stageMdTokens} · view ${r.writes.viewTokens} (${r.writes.viewShare}%) · explainer ${r.writes.explainerTokens} (${r.writes.explainerShare}%) · artifact share of output ${r.writes.artifactShareOfOutput}%`);
  L.push('');
  L.push('(e) read ledger');
  if (!r.ledger.ledgerFiles) L.push('  no .read-ledger.jsonl files yet');
  else {
    L.push(`  ${r.ledger.ledgerFiles} ledger files · ${r.ledger.checks} checks · complete ${r.ledger.completeShare}%`);
    for (const [st, b] of Object.entries(r.ledger.stages)) L.push(`  ${st.padEnd(12)} checks ${b.checks} · complete ${b.completeShare}% · waived ${b.waived}`);
  }
  if (comparison) {
    L.push('');
    L.push('baseline compare');
    for (const c of comparison) L.push(`  ${c.key.padEnd(28)} ${String(c.baseline ?? '—').padStart(8)} → ${String(c.now ?? '—').padStart(8)}${c.delta === null ? '' : `  (${c.delta >= 0 ? '+' : ''}${c.delta})`}`);
  }
  return L.join('\n');
}

export function parseArgs(argv) {
  const d = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const out = {
    since: d,
    projects: join(homedir(), '.claude', 'projects'),
    codex: join(homedir(), '.codex', 'sessions'),
    dev: DEFAULT_DEV,
    json: false,
    baseline: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    const val = () => inline ?? argv[++i];
    if (flag === '--since') out.since = val();
    else if (flag === '--projects') out.projects = val();
    else if (flag === '--codex') out.codex = val();
    else if (flag === '--dev') out.dev = val();
    else if (flag === '--baseline') out.baseline = val();
    else if (flag === '--out') out.out = val();
    else if (flag === '--json') out.json = true;
  }
  if (Number.isNaN(Date.parse(out.since))) throw new Error(`--since: not a date: ${out.since}`);
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await measure(args);
  let comparison = null;
  if (args.baseline) {
    const base = JSON.parse(readFileSync(args.baseline, 'utf8'));
    comparison = compareHeadlines(base.headline || {}, result.headline);
    result.comparison = comparison;
  }
  if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(args.json ? JSON.stringify(result, null, 2) : formatText(result, comparison));
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[measure-artifacts] ${err.message}`);
      process.exit(2);
    },
  );
}
