// The findings ledger of a workflow: .ai/workflows/<slug>/findings.yaml, written by scripts only.
//
// One ledger holds the findings of review, audit and the PR bots. A run merges its findings
// into the ledger by the merge law:
//   1. a finding of the run that matches a ledger entry (the same source, dimension and key,
//      or the same file and line) keeps that entry's id, surfaced-at and triage status;
//      last-seen-at moves, and a `resolved` entry opens again
//   2. a new finding gets the next id of its dimension prefix (never a reused id), status open
//   3. an open entry of a dimension that the run checked and did not find again is resolved
//   4. an entry of a dimension that the run did not check stays as it is
// A finding that its refuter refuted is kept with status `refuted` and the refuter's reason,
// so a reader can tell a checked surface from an unread one. A run that names the files of
// the work packet (the changed files and the files that call, import or test them) drops a
// finding in any other file: the review looks only at the packet. Rows are never deleted. Each
// merge appends one `runs` entry. The review file of a run is written whole from the ledger,
// so the ledger, not the file, keeps the history.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse, stringify } from './yaml.mjs';

export const FINDINGS_FILE = 'findings.yaml';
export const SOURCES = ['review', 'audit', 'pr-bot'];
export const SEVERITIES = ['BLOCKER', 'HIGH', 'MED', 'LOW', 'NIT'];
export const STATUSES = ['open', 'resolved', 'refuted', 'fixed', 'deferred', 'dismissed', 'could-not-fix', 'kept-by-person'];
// The statuses that a re-run keeps: a triage decision is changed only by `set`.
const TRIAGED = new Set(['fixed', 'deferred', 'dismissed', 'could-not-fix', 'kept-by-person']);
export const OPEN_STATUSES = new Set(['open', 'deferred', 'could-not-fix']);

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
const lineNo = (l) => { const m = /\d+/.exec(String(l ?? '')); return m ? Number(m[0]) : null; };

/** The id prefix of a dimension: its first three letters, upper case. */
export function prefixOf(dimension) {
  const letters = String(dimension ?? '').replace(/[^a-z]/gi, '').toUpperCase();
  return (letters.slice(0, 3) || 'GEN');
}

/** Read the ledger: { findings, runs }. A missing file is an empty ledger. */
export function readLedger(slugDir) {
  const file = join(slugDir, FINDINGS_FILE);
  if (!existsSync(file)) return { findings: [], runs: [] };
  const doc = parse(readFileSync(file, 'utf8')) ?? {};
  return { findings: Array.isArray(doc.findings) ? doc.findings : [], runs: Array.isArray(doc.runs) ? doc.runs : [] };
}

/** Write the ledger whole, through a temporary file. */
export function writeLedger(slugDir, ledger) {
  const file = join(slugDir, FINDINGS_FILE);
  const text = `${stringify({ schema: 'sdlc/v1', type: 'findings', findings: ledger.findings, runs: ledger.runs })}\n`;
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

// Two findings are the same when they share a source, a slice, a dimension and a key, or a
// source, a slice, a file and a line within 3 lines. A finding with no line matches only by key.
const sliceOf = (f) => f.slice ?? null;
function sameFinding(a, b) {
  if (a.source !== b.source || sliceOf(a) !== sliceOf(b)) return false;
  if (a.key && b.key) return a.key === b.key && a.dimension === b.dimension;
  if (!a.file || norm(a.file) !== norm(b.file)) return false;
  const la = lineNo(a.line);
  const lb = lineNo(b.line);
  return la != null && lb != null && Math.abs(la - lb) <= 3;
}

const rank = (s) => SEVERITIES.indexOf(s);

/**
 * Merge the findings of one run. `found` holds { dimension, severity, file, line, issue,
 * fix?, key?, confidence?, evidence?, preExisting?, refuted?, changesAcceptance?,
 * needsRuntimeEvidence? }. `needsRuntimeEvidence` names the experiment that settles a finding
 * that reading cannot settle.
 * `refuted` is the refuter's reason. A finding with `changesAcceptance` has a fix that
 * changes an acceptance check: the review rewrites the check with the fix. A `preExisting`
 * finding is on lines that the change did not touch: it is debt, not a verdict input.
 * `dimensions` names every dimension that the run checked, also the ones that found nothing.
 * `slice` scopes the run: a per-slice run matches and resolves only the entries of its slice,
 * and a run of the whole packet (slice null) only the entries with no slice.
 * `files`, when it is not empty, is the scope of the run: a finding with a file outside it is
 * dropped and listed in `outOfScope`. A finding with no file stays.
 * Returns { ledger, added, resurfaced, resolved, outOfScope, verdict } and writes nothing.
 */
export function mergeRun(ledger, found, { source = 'review', dimensions = [], slice = null, run = null, files = null, now = nowIso() } = {}) {
  if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(', ')}`);
  const inPacket = Array.isArray(files) && files.length ? new Set(files.map(norm)) : null;
  const outOfScope = [];
  if (inPacket) {
    found = found.filter((f) => {
      if (!f.file || inPacket.has(norm(f.file))) return true;
      outOfScope.push(`${norm(f.file)}${f.line != null ? `:${f.line}` : ''}`);
      return false;
    });
  }
  const findings = ledger.findings.map((f) => ({ ...f }));
  const checked = new Set([...dimensions, ...found.map((f) => f.dimension)].filter(Boolean));
  const seen = new Set();
  const added = [];
  const resurfaced = [];
  // Within-run dedupe: the same file and line in one run is one finding, at the higher severity.
  const merged = [];
  for (const f of found) {
    if (!SEVERITIES.includes(f.severity)) throw new Error(`severity must be one of ${SEVERITIES.join(', ')}`);
    const g = { ...f, source, slice };
    const twin = merged.find((m) => sameFinding(m, g) || (m.file && g.file && norm(m.file) === norm(g.file) && lineNo(m.line) != null && lineNo(m.line) === lineNo(g.line)));
    if (twin) {
      if (rank(g.severity) < rank(twin.severity)) twin.severity = g.severity;
      if (g.dimension && g.dimension !== twin.dimension && !(twin.also ?? []).includes(g.dimension)) twin.also = [...(twin.also ?? []), g.dimension];
      // The twin is refuted only when both copies are refuted.
      if (!g.refuted) delete twin.refuted;
      if (g.changesAcceptance) twin.changesAcceptance = true;
      continue;
    }
    merged.push(g);
  }
  for (const f of merged) {
    const old = findings.find((e) => !seen.has(e.id) && sameFinding(e, f));
    if (old) {
      seen.add(old.id);
      old['last-seen-at'] = now;
      if (rank(f.severity) < rank(old.severity)) old.severity = f.severity;
      if (f.issue) old.issue = f.issue;
      if (f.evidence) old.evidence = f.evidence;
      if (f.preExisting != null) old['pre-existing'] = Boolean(f.preExisting);
      if (f.changesAcceptance) old['changes-acceptance'] = true;
      if (f.refuted && old.status === 'open') { old.status = 'refuted'; old.reason = f.refuted; old['resolved-at'] = now; }
      else if (!f.refuted && (old.status === 'resolved' || old.status === 'refuted')) {
        old.status = 'open'; old.reason = null; old['resolved-at'] = null; old.reopened = (old.reopened ?? 0) + 1;
      }
      resurfaced.push(old.id);
      continue;
    }
    const prefix = prefixOf(f.dimension);
    const max = findings.filter((e) => String(e.id).startsWith(`${prefix}-`))
      .reduce((m, e) => Math.max(m, Number(String(e.id).slice(prefix.length + 1)) || 0), 0);
    const entry = {
      id: `${prefix}-${max + 1}`,
      source,
      slice,
      dimension: f.dimension ?? null,
      ...(f.also ? { also: f.also } : {}),
      severity: f.severity,
      confidence: f.confidence ?? null,
      'pre-existing': Boolean(f.preExisting),
      file: f.file ? norm(f.file) : null,
      line: f.line != null ? String(f.line) : null,
      key: f.key ?? null,
      issue: f.issue ?? '',
      evidence: f.evidence ?? null,
      fix: f.fix ?? null,
      ...(f.changesAcceptance ? { 'changes-acceptance': true } : {}),
      ...(f.needsRuntimeEvidence ? { 'needs-runtime-evidence': f.needsRuntimeEvidence } : {}),
      status: f.refuted ? 'refuted' : 'open',
      reason: f.refuted ?? null,
      'surfaced-at': now,
      'last-seen-at': now,
      'resolved-at': f.refuted ? now : null,
    };
    findings.push(entry);
    seen.add(entry.id);
    added.push(entry.id);
  }
  const resolved = [];
  for (const e of findings) {
    if (seen.has(e.id) || e.source !== source || sliceOf(e) !== slice || e.status !== 'open' || !checked.has(e.dimension)) continue;
    e.status = 'resolved';
    e['resolved-at'] = now;
    resolved.push(e.id);
  }
  const verdict = verdictOf({ findings }, { source, slice });
  const runs = [...ledger.runs, { at: now, source, slice, run, dimensions: [...checked].sort(), raw: found.length + outOfScope.length, added: added.length, resurfaced: resurfaced.length, resolved: resolved.length, ...(outOfScope.length ? { 'out-of-scope': outOfScope.length } : {}), verdict }];
  return { ledger: { findings, runs }, added, resurfaced, resolved, outOfScope, verdict };
}

/**
 * Set the triage status of one entry, with its reason. `commit` is the commit of a fix step;
 * `decision` is the id of the decision of the person that a dismissed finding goes against,
 * and it is the reason. Returns the entry.
 */
export function setStatus(ledger, id, status, reason = null, { now = nowIso(), commit = null, decision = null } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const e = ledger.findings.find((f) => f.id === id);
  if (!e) throw new Error(`no finding ${id}`);
  if (decision && status !== 'dismissed') throw new Error('only a dismissed finding names a decision');
  if (decision) reason = reason ? `decision ${decision}: ${reason}` : `decision ${decision}`;
  if (TRIAGED.has(status) && status !== 'fixed' && !reason) throw new Error(`a ${status} finding needs a reason`);
  e.status = status;
  e.reason = reason;
  e['resolved-at'] = OPEN_STATUSES.has(status) ? null : now;
  if (commit) e.commit = String(commit);
  else if (status !== 'fixed') delete e.commit;
  if (decision) e.decision = decision;
  else delete e.decision;
  return e;
}

// The entries of one source and one scope. `slice: undefined` selects every scope.
const select = (ledger, { source = null, slice } = {}) =>
  ledger.findings.filter((f) => (!source || f.source === source) && (slice === undefined || sliceOf(f) === slice));

/**
 * The verdict of the open findings that the change made (pre-existing findings are debt):
 * dont-ship on a BLOCKER, ship-with-caveats on a HIGH or a MED, otherwise ship. A deferred or
 * could-not-fix finding counts as open.
 */
export function verdictOf(ledger, scope = {}) {
  const open = select(ledger, scope).filter((f) => OPEN_STATUSES.has(f.status) && !f['pre-existing']);
  if (open.some((f) => f.severity === 'BLOCKER')) return 'dont-ship';
  if (open.some((f) => f.severity === 'HIGH' || f.severity === 'MED')) return 'ship-with-caveats';
  return 'ship';
}

/** The metric fields of a review file's frontmatter, from the ledger. */
export function metricsOf(ledger, scope = {}) {
  const rows = select(ledger, scope);
  const open = rows.filter((f) => OPEN_STATUSES.has(f.status));
  const mine = open.filter((f) => !f['pre-existing']);
  const n = (list, sev) => list.filter((f) => f.severity === sev).length;
  const last = [...ledger.runs].reverse().find((r) => (!scope.source || r.source === scope.source) && (scope.slice === undefined || (r.slice ?? null) === scope.slice));
  return {
    verdict: verdictOf(ledger, scope),
    'commands-run': [...new Set(ledger.runs.filter((r) => !scope.source || r.source === scope.source).flatMap((r) => r.dimensions ?? []))].sort(),
    'metric-commands-run': last?.dimensions?.length ?? 0,
    'metric-findings-total': open.length,
    'metric-findings-raw': last?.raw ?? 0,
    'metric-findings-blocker': n(mine, 'BLOCKER'),
    'metric-findings-high': n(mine, 'HIGH'),
    'metric-findings-med': n(open, 'MED'),
    'metric-findings-low': n(open, 'LOW'),
    'metric-findings-nit': n(open, 'NIT'),
    'metric-findings-pre-existing': open.length - mine.length,
    'metric-findings-resolved': rows.filter((f) => f.status === 'resolved').length,
    'metric-findings-fixed': rows.filter((f) => f.status === 'fixed').length,
    'metric-findings-total-ever': rows.length,
  };
}

/** The findings table of a review file: open rows first, then the closed rows, in id order. */
export function findingsTable(ledger, scope = {}) {
  const rows = select(ledger, scope);
  if (!rows.length) return 'No findings.';
  const open = (f) => (OPEN_STATUSES.has(f.status) ? 0 : 1);
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return [
    '| ID | Severity | Dimension | Where | Issue | Status |',
    '|---|---|---|---|---|---|',
    ...[...rows].sort((a, b) => open(a) - open(b) || byId(a, b)).map((f) => `| ${f.id} | ${f.severity} | ${cell(f.dimension)} | ${f.file ? `\`${cell(f.file)}${f.line ? `:${cell(f.line)}` : ''}\`` : '—'} | ${cell(f.issue)}${f['pre-existing'] ? ' (pre-existing)' : ''} | ${f.status}${f.reason ? `: ${cell(f.reason)}` : ''} |`),
  ].join('\n');
}
