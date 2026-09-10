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
 *   → {"scriptPath":"…/.scratch/wf/yolo.js","version":"9.154.0","sha256":"…","overwroteHotPatch":false}
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DRIVER_SOURCE = path.join(PLUGIN_ROOT, 'skills', 'wf', 'workflows', 'yolo.js');
export const STAGE_REL = path.join('.scratch', 'wf', 'yolo.js');

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
 * @returns {{ scriptPath: string, version: string|null, sha256: string, overwroteHotPatch: boolean }}
 */
export function stageYoloDriver(projectRoot, opts = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) {
    throw new Error(`stage-yolo-driver: projectRoot must be an absolute path (got ${JSON.stringify(projectRoot)})`);
  }
  if (!existsSync(path.join(projectRoot, '.ai', 'workflows'))) {
    throw new Error(`stage-yolo-driver: ${projectRoot} has no .ai/workflows — pass the repo root that owns the workflow`);
  }
  const source = opts.source ?? DRIVER_SOURCE;
  const log = opts.log ?? ((line) => console.error(line));
  const bytes = readFileSync(source);
  const digest = sha256(bytes);

  const scratchDir = path.join(projectRoot, '.scratch');
  const stageDir = path.join(scratchDir, 'wf');
  const scriptPath = path.join(stageDir, 'yolo.js');
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

  return { scriptPath, version, sha256: digest, overwroteHotPatch };
}

function main() {
  const projectRoot = process.argv[2];
  if (!projectRoot) {
    console.error('usage: node scripts/stage-yolo-driver.mjs <absolute projectRoot>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(stageYoloDriver(path.resolve(projectRoot))));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
