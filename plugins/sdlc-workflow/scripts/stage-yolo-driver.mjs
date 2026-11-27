#!/usr/bin/env node
/**
 * scripts/stage-yolo-driver.mjs — stage the /wf yolo driver script inside the
 * consumer repo so the Workflow tool can load it.
 *
 * The Workflow tool accepts a `scriptPath` only when the path is inside the
 * working directory (or a directory the user added). A plugin installed from
 * the plugin cache is never inside the consumer repo, so `yolo.md` Step 0 runs
 * this script at EVERY launch and resume. It copies
 * `skills/wf/workflows/yolo.js` verbatim to `<projectRoot>/.scratch/wf/yolo.js`
 * and prints one JSON line with the path to pass to the Workflow tool.
 *
 * Guarantees:
 *   - Freshness. The copy is overwritten on every call, so a staged copy can
 *     never outlive a plugin upgrade. There is no compare-and-skip path.
 *   - Gitignored. `.scratch/.gitignore` containing `*` is written when absent.
 *     Git honors a nested ignore file, so the directory ignores itself and the
 *     repo's tracked `.gitignore` is never edited.
 *   - Hot-patch visibility. When the existing staged copy differs from the
 *     source, a CAUTION line is printed BEFORE the overwrite. The durable
 *     record of a mid-run patch is `.ai/patches/<date>-<symbol>.md`
 *     (yolo.md "Hot-patching the driver mid-run"); the staged copy is
 *     disposable by design.
 *   - Provenance. `yolo.js.source.json` beside the copy records the source
 *     path, the plugin version, and the sha256.
 *
 * The source is resolved relative to THIS file, so the same script is correct
 * from the plugin cache and from the dev tree.
 *
 *   node scripts/stage-yolo-driver.mjs <absolute projectRoot>
 *   node scripts/stage-yolo-driver.mjs <absolute projectRoot> --driver optimize
 *   node scripts/stage-yolo-driver.mjs <absolute projectRoot> --slug <slug>
 *
 *   node scripts/stage-yolo-driver.mjs <absolute projectRoot> --slug <slug> --take-over
 *
 * With `--slug`, the staging refuses while a run of that workflow is recorded as running in a host
 * process that is alive. `--take-over` starts over such a run, after the session saw that no task of it runs.
 * `--driver` stages another Workflow script of skills/wf/workflows/ the same
 * way, beside yolo.js. `--slug` adds `delegate`: true when the live `run-decisions`
 * steer of the workflow takes the recommended option, so the launch passes `delegate: true`.
 *   → {"scriptPath":"…/.scratch/wf/yolo.js","version":"9.154.0","sha256":"…","overwroteHotPatch":false}
 */
import { isMainModule } from '../lib/proc.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { modelsOf } from '../lib/campaign.mjs';
import { runDelegatedIn } from '../lib/decisions.mjs';
import { progressOf } from '../lib/progress.mjs';
import { workflowDir, workflowsRoot } from '../lib/records-root.mjs';
import { agentFix, defectFix, fixLines, refuse } from '../lib/fix.mjs';
import { opsTable } from '../lib/ops/render.mjs';

const SELF = fileURLToPath(import.meta.url);
const stageLine = (root, ...rest) => [`node "${SELF}"`, `"${root}"`, ...rest].join(' ');

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DRIVER_SOURCE = path.join(PLUGIN_ROOT, 'skills', 'wf', 'workflows', 'yolo.js');
export const STAGE_REL = path.join('.scratch', 'wf', 'yolo.js');
export const DRIVERS = Object.freeze(['yolo', 'optimize']);

/**
 * The staged copy of a driver: the source with the table of the operations of wf filled in, so
 * that its prompts show each call of wf as the call of a tool on Claude. Nothing else changes.
 */
export function stagedText(sourceText) {
  // The line ends with \n or \r\n: a checkout on Windows may hold either.
  return sourceText.replace(/^const WF_OPS = null(\r?\n)/m, (_, nl) => `const WF_OPS = ${JSON.stringify(opsTable())}${nl}`);
}

/** The `issues` block of the config: how many issues a run investigates at once and in all. */
export function issuesOf(cfg) {
  const b = cfg && typeof cfg.issues === 'object' && cfg.issues ? cfg.issues : null;
  if (!b) return null;
  const n = (v) => (Number.isInteger(v) && v > 0 ? v : undefined);
  const out = Object.fromEntries(Object.entries({ maxParallel: n(b.maxParallel), maxPerRun: n(b.maxPerRun) }).filter(([, v]) => v));
  return Object.keys(out).length ? out : null;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function pluginVersion() {
  try {
    return JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Stage the driver into `<projectRoot>/.scratch/wf/yolo.js`.
 *
 * @param {string} projectRoot absolute root of the repo that owns .ai/workflows
 * @param {{ source?: string, version?: string, log?: (line: string) => void }} [opts]
 *   test seams: `source` overrides the driver file, `version` the stamp,
 *   `log` receives the CAUTION line (default: console.error).
 * @returns {{ scriptPath: string, version: string|null, sha256: string, overwroteHotPatch: boolean, models: object, recordsRoot: string, issues?: object }}
 */
export function stageYoloDriver(projectRoot, opts = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) {
    throw refuse(`stage-yolo-driver: projectRoot must be an absolute path (got ${JSON.stringify(projectRoot)})`, agentFix('Run it again with the absolute path of the project root.', stageLine('<absolute projectRoot>')));
  }
  if (!existsSync(workflowsRoot(projectRoot))) {
    throw refuse(`stage-yolo-driver: ${projectRoot} has no .ai/workflows — pass the repo root that owns the workflow`, agentFix('Run it again with the root of the repo that holds .ai/workflows (git rev-parse --show-toplevel in the main checkout names it).', stageLine('<absolute projectRoot>')));
  }
  const name = opts.driver ?? 'yolo';
  // ONE DRIVER PER WORKFLOW. A run that says running, in a host process that lives, is not
  // replaced by silence alone: two drivers on one tree edit and commit over each other.
  if (opts.slug && name === 'yolo' && !opts.takeOver) {
    const p = (opts.progressOf ?? progressOf)(workflowDir(projectRoot, opts.slug), opts.slug);
    if (p && p.status === 'running' && p.hostAlive === true) {
      throw refuse(
        `stage-yolo-driver: a run of ${opts.slug} is recorded as running (${[p.stage, p.slice].filter(Boolean).join(' ') || 'no stage'}, run ${p.run ?? 'unknown'}), and its host process ${p.hostPid} is alive. Its last line is ${p.quietMinutes ?? '?'} min old; a long command writes no line`,
        agentFix('Look at the run first: the Workflow tasks of your own session, or on Codex the driver process of the run (wf.mjs drive --view). When it still runs, start no second run: wait for it, or ask it to stop with a stop request. When it does not run (it was stopped, or it belongs to a session that ended), start again with --take-over: this staging command, or wf.mjs drive with --take-over on Codex.', stageLine(projectRoot, '--slug', opts.slug, '--take-over')),
      );
    }
  }
  if (!DRIVERS.includes(name)) throw refuse(`stage-yolo-driver: the driver is one of ${DRIVERS.join(', ')}`, agentFix(`Run it again with --driver ${DRIVERS.join(' or --driver ')}.`, stageLine(projectRoot, '--driver', DRIVERS[0])));
  const source = opts.source ?? path.join(PLUGIN_ROOT, 'skills', 'wf', 'workflows', `${name}.js`);
  const log = opts.log ?? ((line) => console.error(line));
  const bytes = Buffer.from(stagedText(readFileSync(source, 'utf8')), 'utf8');
  const digest = sha256(bytes);

  const scratchDir = path.join(projectRoot, '.scratch');
  const stageDir = path.join(scratchDir, 'wf');
  const scriptPath = path.join(stageDir, `${name}.js`);
  mkdirSync(stageDir, { recursive: true });

  const ignoreFile = path.join(scratchDir, '.gitignore');
  if (!existsSync(ignoreFile)) writeFileSync(ignoreFile, '*\n');

  let overwroteHotPatch = false;
  if (existsSync(scriptPath) && sha256(readFileSync(scriptPath)) !== digest) {
    overwroteHotPatch = true;
    log(
      `CAUTION: ${scriptPath} differed from the plugin source and was overwritten. ` +
        'A mid-run hot-patch lives on only in .ai/patches/<date>-<symbol>.md (yolo.md, "Hot-patching the driver mid-run").',
    );
  }
  writeFileSync(scriptPath, bytes);

  const version = opts.version ?? pluginVersion();
  const sidecar = { source, version, sha256: digest, stagedAt: new Date().toISOString() };
  writeFileSync(`${scriptPath}.source.json`, `${JSON.stringify(sidecar, null, 2)}\n`);

  // The session passes `models` on as `args.models`, so each stage runs on the model of the config.
  let models = {};
  let issues = null;
  try {
    const cfg = JSON.parse(readFileSync(path.join(projectRoot, '.ai', 'sdlc-config.json'), 'utf8'));
    models = modelsOf(cfg);
    issues = issuesOf(cfg);
  } catch { /* no config: every stage on Opus, the default issue limits */ }
  // The session passes `recordsRoot` on too: a linked project keeps its records in the records home.
  const staged = { scriptPath, version, sha256: digest, overwroteHotPatch, models, recordsRoot: workflowsRoot(projectRoot), ...(issues ? { issues } : {}) };
  // The launch asks how the run settles the decisions of the person; the answer sets `delegate`.
  if (opts.slug) staged.delegate = runDelegatedIn(workflowDir(projectRoot, opts.slug));
  return staged;
}

function main() {
  const projectRoot = process.argv[2];
  const at = process.argv.indexOf('--driver');
  const driver = at > -1 ? process.argv[at + 1] : 'yolo';
  const slugAt = process.argv.indexOf('--slug');
  const slug = slugAt > -1 ? process.argv[slugAt + 1] : undefined;
  if (!projectRoot) {
    console.error('usage: node scripts/stage-yolo-driver.mjs <absolute projectRoot>');
    for (const l of fixLines(agentFix('Run it again with the absolute path of the project root.', stageLine('<absolute projectRoot>')))) console.error(l);
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(stageYoloDriver(path.resolve(projectRoot), { driver, slug, takeOver: process.argv.includes('--take-over') })));
  } catch (err) {
    console.error(err.message);
    for (const l of fixLines(err.fix ?? defectFix('stage-yolo-driver.mjs', err))) console.error(l);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
