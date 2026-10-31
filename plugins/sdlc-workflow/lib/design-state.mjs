// The data of the canvas: one JSON object that the design server serves and a published
// snapshot inlines. The canvas reads nothing else.
//
// It holds the screens with their states, links, approvals, history, open comments and check
// failures; the positions of the layout; the explore sketches; the references with their check;
// the token sheet; the design decisions of the workflows; and one design card per slice.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { capturesOf, groupFailures, readComments, readChecks } from './design-records.mjs';
import { LAYOUT_FILE, STATES, TOKENS_FILE, listExplore, listScreens, readManifest, screenFile, screenRel, surfaceDir } from './design-surface.mjs';
import { checkReferences } from './design-references.mjs';
import { readDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const STATE_SCHEMA = 'sdlc/design-canvas/v1';

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** The custom properties of the token sheet: `[{ name, value }]`. */
export function tokensOf(css) {
  return [...String(css ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => ({ name: m[1], value: m[2].trim() }));
}

/** The tokens that a screen page uses: each `var(--name)`. */
export function tokensUsed(html) {
  return [...new Set([...String(html ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))].sort();
}

/** The commits that changed a screen page, newest first. */
function historyOf(root, key, limit = 20) {
  const r = spawnSync('git', ['-C', root, 'log', `-${limit}`, '--format=%H%x09%cI%x09%s', '--', screenRel(key)], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const [commit, at, subject] = l.split('\t');
    return { commit, at, subject };
  });
}

/** The lines of a `## <heading>` section of a record body. */
function sectionLines(body, heading) {
  const lines = String(body ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^##\s/.test(l)) break;
    const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/**
 * The design card of each slice: the tokens of its screens, the rules of the visual contract
 * that apply to it, its screens with their states, the newest approval and check result of
 * its screens, and its open comments.
 */
export function designCards(root, screens, checks) {
  const bySlice = new Map();
  for (const s of screens) {
    for (const w of s.workflows ?? []) {
      const slices = (s.slices ?? []).length ? s.slices : ['(whole workflow)'];
      for (const slice of slices) {
        const k = `${w}\u0000${slice}`;
        if (!bySlice.has(k)) bySlice.set(k, { workflow: w, slice, screens: [] });
        bySlice.get(k).screens.push(s);
      }
    }
  }
  const contracts = new Map();
  const contractOf = (w) => {
    if (!contracts.has(w)) contracts.set(w, existsSync(workflowDir(root, w)) ? readDoc(workflowDir(root, w), '02c-craft.md') : null);
    return contracts.get(w);
  };
  return [...bySlice.values()].map(({ workflow, slice, screens: list }) => {
    const contract = contractOf(workflow);
    const keys = list.map((s) => s.key);
    const inventory = sectionLines(contract?.body, 'Mock fidelity inventory').filter((l) => keys.some((k) => l.includes(k)));
    const avoid = sectionLines(contract?.body, 'Anti-patterns to avoid');
    const approvals = list.flatMap((s) => (s.approvals ?? []).map((a) => ({ ...a, screen: s.key }))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const failures = (checks?.failures ?? []).filter((f) => keys.includes(f.screen));
    return {
      workflow, slice,
      tokens: [...new Set(list.flatMap((s) => s.tokens ?? []))].sort(),
      rules: [...inventory, ...avoid.map((a) => `Avoid: ${a}`)],
      screens: list.map((s) => ({ key: s.key, title: s.title, states: s.states })),
      approval: approvals[0] ?? null,
      checks: checks ? { at: checks.at, failures: failures.length, passed: failures.length === 0 } : null,
      openComments: list.reduce((n, s) => n + (s.openComments ?? 0), 0),
    };
  });
}

/** The design decisions of the workflows that changed a screen. */
function designDecisions(root, workflows) {
  const out = [];
  for (const w of workflows) {
    const dir = workflowDir(root, w);
    if (!existsSync(dir)) continue;
    for (const d of liveDecisions(readDecisions(dir))) {
      if (d.stage === 'design' || d.kind === 'design') out.push({ workflow: w, id: d.id, question: d.question ?? d.key ?? null, answer: d.answer ?? null, by: d.by ?? null, at: d.at ?? null });
    }
  }
  return out;
}

/** The whole canvas state of a repo. */
export function canvasState(root, { repo = null, writable = true } = {}) {
  const m = readManifest(root);
  const checks = readChecks(root);
  const layout = readJson(join(surfaceDir(root), LAYOUT_FILE), {});
  const tokensCss = existsSync(join(surfaceDir(root), TOKENS_FILE)) ? readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8') : '';
  const screens = listScreens(root).map((s) => {
    const html = existsSync(screenFile(root, s.key)) ? readFileSync(screenFile(root, s.key), 'utf8') : '';
    const threads = readComments(root, s.key).threads;
    const failures = (checks?.failures ?? []).filter((f) => f.screen === s.key);
    return {
      ...s,
      tokens: tokensUsed(html),
      history: historyOf(root, s.key),
      threads,
      openComments: threads.filter((t) => t.open).length,
      failures,
      // One entry for each cause, with its places: the canvas lists these, the CLI prints the same groups.
      failureGroups: groupFailures(failures),
      position: layout.positions?.[s.key] ?? null,
      captures: capturesOf(root, s.key),
    };
  });
  const workflows = [...new Set(screens.flatMap((s) => s.workflows ?? []))].sort();
  return {
    schema: STATE_SCHEMA,
    repo,
    writable,
    viewports: m.viewports,
    states: STATES,
    areas: m.areas,
    workflows,
    screens,
    explore: listExplore(root),
    references: checkReferences(root).references,
    tokens: tokensOf(tokensCss),
    decisions: designDecisions(root, workflows),
    cards: designCards(root, screens, checks),
    checks: checks ? { at: checks.at, passed: checks.passed, failures: checks.failures?.length ?? 0 } : null,
  };
}

/** The folder of the canvas page, its style and its script. */
export const CANVAS_DIR = fileURLToPath(new URL('../skills/wf/canvas/', import.meta.url));

/** JSON that is safe inside a script element. */
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * One self-contained page of the canvas: the state, the screen pages and the token sheet inline,
 * with no write route. A comment or a layout change needs the design server.
 */
export function snapshotHtml(root, { repo = null } = {}) {
  const state = canvasState(root, { repo, writable: false });
  const screens = Object.fromEntries(state.screens.filter((s) => existsSync(screenFile(root, s.key))).map((s) => [s.key, readFileSync(screenFile(root, s.key), 'utf8')]));
  const tokens = existsSync(join(surfaceDir(root), TOKENS_FILE)) ? readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8') : '';
  const page = readFileSync(join(CANVAS_DIR, 'index.html'), 'utf8');
  const css = readFileSync(join(CANVAS_DIR, 'canvas.css'), 'utf8');
  const js = readFileSync(join(CANVAS_DIR, 'canvas.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  return page
    .replace('<link rel="stylesheet" href="/canvas/canvas.css">', () => `<style>\n${css}</style>`)
    .replace('<script src="/canvas/canvas.js"></script>', () => `<script>window.WF_STATE = ${scriptJson(state)};\nwindow.WF_SNAPSHOT = ${scriptJson({ screens, tokens })};</script>\n<script>\n${js}</script>`);
}
