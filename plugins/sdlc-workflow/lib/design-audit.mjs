// The design audit of the canvas: one headless, read-only Sonnet agent that runs the Diagnostic
// Scan of `design/audit.md` over the screens and the built UI of one repo.
//
// The Audit button of the canvas starts it through the design server. The agent reads files and
// changes nothing: its tools are Read, Glob and Grep, it loads no MCP server, and the SDLC hooks
// skip it. It runs through the runner of consult, so a failure names its class. Its report is one
// JSON file under the SDLC home, which the canvas reads and draws: a score for each dimension,
// and each finding as a box on its screen in each viewport. An audit of one workflow writes its
// token use as one cost row, key `design-audit`, to the cost ledger of that workflow, like each
// other external call; it writes no other record.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalCostRow, runCli, buildClaudeArgs } from '../skills/consult/scripts/dispatch.mjs';
import { appendCostRow } from './cost-ledger.mjs';
import { failureLines, openBrowser, selectorRect, surfaceViewports } from './design-check.mjs';
import { readChecks } from './design-records.mjs';
import { KEY_RE, STATES, listScreens, readManifest, screenRel, screenUrl, writeJson } from './design-surface.mjs';
import { sdlcHomeDir } from './home.mjs';
import { pidAlive } from './proc.mjs';
import { INDEX_NAME, frontmatterOfDoc, readDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const AUDIT_SCHEMA = 'sdlc/design-audit/v1';
export const AUDIT_MODEL = 'claude-sonnet-5-5';
export const AUDIT_DIMENSIONS = Object.freeze(['accessibility', 'performance', 'theming', 'responsive', 'integrity']);
export const SEVERITIES = Object.freeze(['blocker', 'high', 'medium', 'low']);
const MAX_TURNS = 80;
const TIMEOUT_MS = 20 * 60 * 1000;
const MAX_FINDINGS = 60;
const MAX_CONTRACT = 24 * 1024;
const MAX_MEASURED = 40;
const DESIGN_REF = fileURLToPath(new URL('../skills/wf/reference/design/', import.meta.url));

/** The report of one repo: under the SDLC home, never in the repo or its records. */
export const auditPath = (root) => join(sdlcHomeDir(), 'design-audits', `${createHash('sha1').update(resolve(root)).digest('hex').slice(0, 16)}.json`);

/** The runs of this process, by report path. */
const running = new Map();

function writeReport(root, report) {
  writeJson(auditPath(root), report);
  return report;
}

/** The last report of the repo, or `{ status: 'none' }`. A run of a server that stopped reads as failed. */
export function readAudit(root) {
  let report = null;
  try { report = JSON.parse(readFileSync(auditPath(root), 'utf8')); } catch { return { schema: AUDIT_SCHEMA, status: 'none' }; }
  if (report.status === 'running' && !running.has(auditPath(root)) && !(report.serverPid !== process.pid && pidAlive(report.serverPid))) {
    return { ...report, status: 'failed', error: 'the design server stopped during the run' };
  }
  return report;
}

/** The argv of the headless agent: the read-only argv of consult, with the audit model and turns. Paths never go in argv. */
export const buildAuditArgs = () => buildClaudeArgs({ model: AUDIT_MODEL, maxTurns: MAX_TURNS });

const readText = (file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };

/** The platforms of the platform map, each with the name of its column. */
export const PLATFORM_COLUMNS = Object.freeze({ web: 'Web', ios: 'iOS', android: 'Android (Compose)', desktop: 'Desktop' });

/**
 * The platforms of the built UI, as keys of PLATFORM_COLUMNS: `stack.platforms` of the workflow,
 * or of the workflows of the screens when the audit names none. With no stack, the files at the
 * top of the repo: Gradle is Android, an Xcode project is iOS, `package.json` is the web. An empty
 * list is an unknown platform.
 */
export function auditPlatforms(root, { workflow = null, screens = [] } = {}) {
  const slugs = workflow ? [workflow] : [...new Set(screens.flatMap((s) => s.workflows ?? []))];
  const stack = slugs.flatMap((w) => {
    const p = frontmatterOfDoc(workflowDir(root, w), INDEX_NAME)?.stack?.platforms;
    return Array.isArray(p) ? p.map((x) => String(x).toLowerCase()) : [];
  });
  if (stack.length) return Object.keys(PLATFORM_COLUMNS).filter((k) => stack.includes(k));
  let files = [];
  try { files = readdirSync(root); } catch { files = []; }
  const found = [
    files.some((f) => /^(settings|build)\.gradle(\.kts)?$/.test(f)) && 'android',
    files.some((f) => /\.(xcodeproj|xcworkspace)$/.test(f)) && 'ios',
    files.includes('package.json') && 'web',
  ].filter(Boolean);
  return found.length === 1 ? found : [];
}

/** Split a table row into its cells; a `\|` inside a cell is not a split. */
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

/**
 * The platform map with only the first column of each table and the columns of `platforms`.
 * A table whose rows are the platforms keeps the rows of `platforms`. With no platform, the
 * whole map.
 */
export function platformMap(text, platforms) {
  const names = (platforms ?? []).map((p) => PLATFORM_COLUMNS[p]).filter(Boolean);
  if (!names.length) return text;
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = /^\|/.test(lines[i]) && /^\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? '') ? cellsOf(lines[i]) : null;
    if (!head) { out.push(lines[i]); continue; }
    let j = i + 2;
    const rows = [];
    while (j < lines.length && /^\|/.test(lines[j])) rows.push(cellsOf(lines[j++]));
    const keep = head.map((h, n) => (n === 0 || names.includes(h) ? n : -1)).filter((n) => n >= 0);
    if (keep.length > 1) {
      const row = (cells) => `| ${keep.map((n) => cells[n] ?? '').join(' | ')} |`;
      out.push(row(head), `|${keep.map(() => '---').join('|')}|`, ...rows.map(row));
    } else {
      // The rows are the platforms (`| Platform | Tools |`): keep the rows of the chosen ones.
      out.push(lines[i], lines[i + 1], ...lines.slice(i + 2, j).filter((l) => names.includes(cellsOf(l)[0])));
    }
    i = j - 1;
  }
  return out.join('\n');
}

/** The instructions of the agent: the rules, the platform map, the screens and the contract. */
export function auditPrompt(root, { workflow = null } = {}) {
  const screens = listScreens(root, { workflow }).filter((s) => s.exists);
  const contract = workflow && existsSync(workflowDir(root, workflow)) ? readDoc(workflowDir(root, workflow), '02c-craft.md')?.body ?? '' : '';
  const keys = new Set(screens.map((s) => s.key));
  const measured = (readChecks(root)?.failures ?? []).filter((f) => keys.has(f.screen)).slice(0, MAX_MEASURED);
  const platforms = auditPlatforms(root, { workflow, screens });
  const columns = platforms.map((p) => PLATFORM_COLUMNS[p]).join(' and ');
  return [
    'You audit the design of one product repo. You are read-only: you read files and change nothing. Write no file.',
    '',
    `The repo is the working folder. ${workflow ? `Audit the screens of the workflow \`${workflow}\` and the built UI of those screens.` : 'Audit every screen and the built UI of the screens.'}`,
    '',
    '## Steps',
    '',
    '1. Read `DESIGN.md` and `.ai/design/tokens.css`. They hold the design system and its tokens.',
    platforms.length
      ? `2. The platform of the built UI is ${columns}. The platform map below keeps only ${platforms.length > 1 ? 'the columns of those platforms' : 'the column of that platform'}.`
      : '2. Find the platform of the built UI from the repo: web, Android with Jetpack Compose, iOS, or desktop. Use the column of that platform in the platform map below.',
    '3. Read each screen page below. Each screen is an HTML mock with the states default, empty, loading, error and worst, each an element with `data-state`.',
    '4. Find the built UI code of each screen in the repo with Glob and Grep, and read it. When no built code exists, audit the screens only.',
    '5. Run the Diagnostic Scan of the audit rules below, sections 1 to 5, over the screens and the built code. Weigh most: a value that does not use a token, a target under the minimum of the platform, and drift from `DESIGN.md`.',
    '6. Also find these faults in the built code, which the screen check measures only on the mocks:',
    '   - a color written as a value, not taken from a token (a hex or rgb() literal in CSS, `Color(0xFF…)` in Compose, a hex brush in XAML); name the nearest token;',
    '   - a value from data that can be missing and is shown with no fallback, so the UI can show `undefined`, `null`, `NaN` or `[object Object]`;',
    '   - an image or asset path that names no file in the repo (check it with Glob);',
    '   - text that can overlap other text: an absolute position, a negative margin, or a fixed height over content that can grow;',
    '   - a script error: a call to a name that nothing defines, or an error that the code logs on a normal path.',
    '7. Do not write the report of the audit rules. Return the JSON below instead.',
    '',
    '## The screens',
    '',
    ...(screens.length ? screens.map((s) => `- \`${s.key}\` (${s.title || s.key}): \`${screenRel(s.key)}\``) : ['- No screen page exists. Audit the built UI only.']),
    '',
    ...(measured.length ? [
      '## The measured checks',
      '',
      '`wf design check` measured these failures on the screens. Do not report them again. When the built code has the same fault, report it at its file and line.',
      '',
      ...failureLines(measured).map((l) => `- ${l}`),
      '',
    ] : []),
    ...(contract ? ['## The visual contract of the workflow (`02c-craft.md`)', '', contract.slice(0, MAX_CONTRACT), ''] : []),
    '## The audit rules (`design/audit.md`)',
    '',
    readText(join(DESIGN_REF, 'audit.md')),
    '',
    '## The platform map (`design/_platforms.md`)',
    '',
    platformMap(readText(join(DESIGN_REF, '_platforms.md')), platforms),
    '',
    '## Return',
    '',
    'End your answer with one fenced `json` block, and write nothing after it:',
    '',
    '```json',
    JSON.stringify({
      summary: 'Two sentences: the state of the design and the worst problem.',
      platform: 'web | android | ios | desktop | unknown',
      scores: Object.fromEntries(AUDIT_DIMENSIONS.map((d) => [d, '0-4'])),
      findings: [{
        severity: SEVERITIES.join(' | '), dimension: AUDIT_DIMENSIONS.join(' | '), rule: 'the rule of the audit rules, for example Hard-coded colors',
        screen: 'a screen key, or null', state: STATES.join(' | '), selector: 'a CSS selector of the element in the screen page, or null',
        file: 'the repo-relative path of the built code, or null', line: 'a line number, or null',
        message: 'the problem, with the measured or read value', fix: 'the fix, with the token or the value to use',
      }],
    }, null, 2),
    '```',
    '',
    `A finding on a screen names the screen key and a selector that matches the element in that screen page. A finding in built code names the file and the line. Give at most ${MAX_FINDINGS} findings, the most severe first.`,
  ].join('\n');
}

/** The JSON of the agent's answer: the last fenced json block, else the whole text. */
export function parseAuditAnswer(text) {
  const blocks = [...String(text ?? '').matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  for (const raw of [blocks.at(-1)?.[1], text]) {
    if (!raw) continue;
    try { const v = JSON.parse(raw); if (v && typeof v === 'object') return v; } catch { /* the next form */ }
  }
  return null;
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Keep only well-formed fields: known screens, known states, repo-relative files. */
export function normalizeAudit(root, answer) {
  const screens = readManifest(root).screens;
  const scores = {};
  for (const d of AUDIT_DIMENSIONS) {
    const n = Number(answer?.scores?.[d]);
    scores[d] = Number.isInteger(n) && n >= 0 && n <= 4 ? n : null;
  }
  const findings = [];
  for (const f of Array.isArray(answer?.findings) ? answer.findings : []) {
    const message = str(f?.message, 600);
    if (!message) continue;
    const screen = typeof f.screen === 'string' && KEY_RE.test(f.screen) && screens[f.screen] ? f.screen : null;
    const file = str(f.file, 300);
    const safeFile = file && !isAbsolute(file) && !normalize(file).startsWith('..') ? file.replace(/\\/g, '/') : null;
    const line = Number(f.line);
    findings.push({
      severity: SEVERITIES.includes(f.severity) ? f.severity : 'medium',
      dimension: AUDIT_DIMENSIONS.includes(f.dimension) ? f.dimension : null,
      rule: str(f.rule, 80),
      screen,
      state: screen ? (STATES.includes(f.state) ? f.state : 'default') : null,
      selector: screen ? str(f.selector, 300) : null,
      file: safeFile,
      line: safeFile && Number.isInteger(line) && line > 0 ? line : null,
      message,
      fix: str(f.fix, 600),
    });
    if (findings.length >= MAX_FINDINGS) break;
  }
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  return {
    summary: str(answer?.summary, 600),
    platform: ['web', 'android', 'ios', 'desktop'].includes(answer?.platform) ? answer.platform : 'unknown',
    scores,
    findings,
  };
}

/** The box of each finding's element, in each viewport: `rects[viewport]`. Findings with no box keep none. */
export async function screenRects(root, findings, { browser = undefined } = {}) {
  const targets = findings.filter((f) => f.screen && f.selector);
  if (!targets.length) return findings;
  const b = await openBrowser(root, browser === undefined ? {} : { browser });
  if (!b) return findings;
  try {
    for (const vp of surfaceViewports(root)) {
      const pages = [...new Set(targets.map((f) => `${f.screen}|${f.state}`))];
      for (const page of pages) {
        const [key, state] = page.split('|');
        await b.open(screenUrl(root, key, state), vp);
        for (const f of targets.filter((x) => x.screen === key && x.state === state)) {
          const rect = await b.evaluate(selectorRect(f.selector));
          (f.rects ||= {})[vp.name] = rect ?? null;
        }
      }
    }
  } finally { await b.close(); }
  return findings;
}

/** Run the agent through the runner of consult. Resolves `{ ok, text, costUsd, usage, error, errorKind }`. */
export function spawnClaude(prompt, { cwd, timeoutMs = TIMEOUT_MS } = {}) {
  return runCli('claude', prompt, cwd, { model: AUDIT_MODEL, maxTurns: MAX_TURNS, timeoutMs });
}

/** Write the token use of an audit of one workflow as one cost row of that workflow. A run with no usage, or no workflow folder, writes nothing. */
export function auditCostRow(root, workflow, r, { now = () => new Date() } = {}) {
  if (!workflow || !r?.usage) return null;
  const dir = workflowDir(root, workflow);
  if (!existsSync(dir)) return null;
  const row = externalCostRow([{ provider: 'claude', model: AUDIT_MODEL, ok: true, usage: r.usage }], { slug: workflow, key: 'design-audit', now });
  if (!row) return null;
  try { appendCostRow(dir, row); } catch { return null; }
  return row;
}

/**
 * Start an audit in the background. Returns `{ started, report }`, or `{ started: false, reason }`
 * when a run of this repo is not done. `done` resolves when the report is final.
 */
export function startAudit(root, { workflow = null, repo = null, now = () => new Date(), run = spawnClaude, rects = screenRects } = {}) {
  if (workflow !== null && !KEY_RE.test(workflow)) return { started: false, reason: 'a bad workflow' };
  const path = auditPath(root);
  if (running.has(path) || readAudit(root).status === 'running') return { started: false, reason: 'an audit of this repo runs now' };
  const base = { schema: AUDIT_SCHEMA, repo, workflow, model: AUDIT_MODEL, startedAt: now().toISOString(), serverPid: process.pid };
  const report = writeReport(root, { ...base, status: 'running' });
  const done = (async () => {
    try {
      const r = await run(auditPrompt(root, { workflow }), { cwd: root });
      auditCostRow(root, workflow, r, { now });
      if (!r.ok) return writeReport(root, { ...base, status: 'failed', endedAt: now().toISOString(), error: r.error ?? 'the agent failed' });
      const answer = parseAuditAnswer(r.text);
      if (!answer) return writeReport(root, { ...base, status: 'failed', endedAt: now().toISOString(), costUsd: r.costUsd ?? null, error: 'the agent returned no JSON report' });
      const result = normalizeAudit(root, answer);
      try { await rects(root, result.findings); } catch { /* the findings stay, with no boxes */ }
      return writeReport(root, { ...base, status: 'done', endedAt: now().toISOString(), costUsd: r.costUsd ?? null, ...result });
    } catch (e) {
      return writeReport(root, { ...base, status: 'failed', endedAt: now().toISOString(), error: String(e?.message || e) });
    } finally { running.delete(path); }
  })();
  running.set(path, done);
  return { started: true, report, done };
}
