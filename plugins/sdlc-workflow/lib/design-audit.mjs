// The design audit of the canvas: one headless, read-only Sonnet agent that runs the Diagnostic
// Scan of `design/audit.md` over the screens and the built UI of one repo.
//
// The Audit button of the canvas starts it through the design server. The agent reads files and
// changes nothing: its tools are Read, Glob and Grep, it loads no MCP server, and the SDLC hooks
// skip it. The run writes no workflow record. Its report is one JSON file under the SDLC home,
// which the canvas reads and draws: a score for each dimension, and each finding as a box on its
// screen in each viewport.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildClaudeEnv } from '../skills/consult/scripts/isolate.mjs';
import { openBrowser, surfaceViewports } from './design-check.mjs';
import { KEY_RE, STATES, listScreens, readManifest, screenFile, screenRel } from './design-surface.mjs';
import { sdlcHomeDir } from './home.mjs';
import { readDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const AUDIT_SCHEMA = 'sdlc/design-audit/v1';
export const AUDIT_MODEL = 'claude-sonnet-5-5';
export const AUDIT_DIMENSIONS = Object.freeze(['accessibility', 'performance', 'theming', 'responsive', 'integrity']);
export const SEVERITIES = Object.freeze(['blocker', 'high', 'medium', 'low']);
const MAX_TURNS = 80;
const TIMEOUT_MS = 20 * 60 * 1000;
const MAX_FINDINGS = 60;
const MAX_CONTRACT = 24 * 1024;
const DESIGN_REF = fileURLToPath(new URL('../skills/wf/reference/design/', import.meta.url));

/** The report of one repo: under the SDLC home, never in the repo or its records. */
export const auditPath = (root) => join(sdlcHomeDir(), 'design-audits', `${createHash('sha1').update(resolve(root)).digest('hex').slice(0, 16)}.json`);

/** The runs of this process, by report path. */
const running = new Map();

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function writeReport(root, report) {
  const path = auditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return report;
}

/** The last report of the repo, or `{ status: 'none' }`. A run of a server that stopped reads as failed. */
export function readAudit(root) {
  let report = null;
  try { report = JSON.parse(readFileSync(auditPath(root), 'utf8')); } catch { return { schema: AUDIT_SCHEMA, status: 'none' }; }
  if (report.status === 'running' && !running.has(auditPath(root)) && !(report.serverPid !== process.pid && alive(report.serverPid))) {
    return { ...report, status: 'failed', error: 'the design server stopped during the run' };
  }
  return report;
}

/** The argv of the headless agent. Paths never go in argv: the prompt carries them on stdin. */
export function buildAuditArgs() {
  return [
    '-p', 'Follow the audit instructions on standard input.',
    '--output-format', 'json',
    '--model', AUDIT_MODEL,
    '--tools', 'Read,Glob,Grep',
    '--strict-mcp-config',
    '--permission-mode', 'plan',
    '--max-turns', String(MAX_TURNS),
  ];
}

const readText = (file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };

/** The instructions of the agent: the rules, the platform map, the screens and the contract. */
export function auditPrompt(root, { workflow = null } = {}) {
  const screens = listScreens(root, { workflow }).filter((s) => s.exists);
  const contract = workflow && existsSync(workflowDir(root, workflow)) ? readDoc(workflowDir(root, workflow), '02c-craft.md')?.body ?? '' : '';
  return [
    'You audit the design of one product repo. You are read-only: you read files and change nothing. Write no file.',
    '',
    `The repo is the working folder. ${workflow ? `Audit the screens of the workflow \`${workflow}\` and the built UI of those screens.` : 'Audit every screen and the built UI of the screens.'}`,
    '',
    '## Steps',
    '',
    '1. Read `DESIGN.md` and `.ai/design/tokens.css`. They hold the design system and its tokens.',
    '2. Find the platform of the built UI from the repo: web, Android with Jetpack Compose, iOS, or desktop. Use the column of that platform in the platform map below.',
    '3. Read each screen page below. Each screen is an HTML mock with the states default, empty, loading, error and worst, each an element with `data-state`.',
    '4. Find the built UI code of each screen in the repo with Glob and Grep, and read it. When no built code exists, audit the screens only.',
    '5. Run the Diagnostic Scan of the audit rules below, sections 1 to 5, over the screens and the built code. Weigh most: a value that does not use a token, a target under the minimum of the platform, and drift from `DESIGN.md`.',
    '6. Do not write the report of the audit rules. Return the JSON below instead.',
    '',
    '## The screens',
    '',
    ...(screens.length ? screens.map((s) => `- \`${s.key}\` (${s.title || s.key}): \`${screenRel(s.key)}\``) : ['- No screen page exists. Audit the built UI only.']),
    '',
    ...(contract ? ['## The visual contract of the workflow (`02c-craft.md`)', '', contract.slice(0, MAX_CONTRACT), ''] : []),
    '## The audit rules (`design/audit.md`)',
    '',
    readText(join(DESIGN_REF, 'audit.md')),
    '',
    '## The platform map (`design/_platforms.md`)',
    '',
    readText(join(DESIGN_REF, '_platforms.md')),
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
        await b.open(`${pathToFileURL(screenFile(root, key)).href}?state=${state}`, vp);
        for (const f of targets.filter((x) => x.screen === key && x.state === state)) {
          const rect = await b.evaluate(`(() => { try {
            const el = document.querySelector(${JSON.stringify(f.selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            if (!r.width && !r.height) return null;
            return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
          } catch { return null; } })()`);
          (f.rects ||= {})[vp.name] = rect ?? null;
        }
      }
    }
  } finally { await b.close(); }
  return findings;
}

function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

/** Run `claude -p` with the prompt on stdin. Resolves `{ ok, text, costUsd, error }`. */
export function spawnClaude(prompt, { cwd, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((done) => {
    const args = buildAuditArgs();
    // A `.cmd` shim of an npm install cannot start without cmd.exe, as in consult's dispatch.
    // The arguments hold no path, so the quoting of cmd.exe cannot break one.
    const [cmd, argv] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', 'claude', ...args]] : ['claude', args];
    let child;
    try {
      child = spawn(cmd, argv, { cwd, env: buildClaudeEnv(process.env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) { done({ ok: false, error: String(e?.message || e) }); return; }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { killTree(child.pid); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, error: String(e?.message || e) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let out = null;
      try { out = JSON.parse(stdout); } catch { out = null; }
      if (code === 0 && out && !out.is_error) done({ ok: true, text: String(out.result ?? ''), costUsd: typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null });
      else done({ ok: false, error: String(out?.result || stderr || stdout || `claude exited ${code}`).trim().slice(0, 600) });
    });
    child.stdin.on('error', () => { /* the child closed early; close reports it */ });
    child.stdin.end(prompt);
  });
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
