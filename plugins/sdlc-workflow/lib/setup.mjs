// The first-run setup of a project: the `.ai/` tree, the project line, and the facts that ship
// needs later.
//
// The first /wf call in a repo with no `.ai/` folder runs `reference/setup.md` before its key. The
// setup asks what the repo is and which commands test it, then this module writes the folders
// and the `project` setting of .ai/sdlc-config.json, and reports the merge method of GitHub, the
// gaps that ship would find, and whether git ignores `.ai/`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRun, readyGaps, shipFacts } from './last-mile.mjs';
import { readProfile } from './test-profile.mjs';

const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const configFile = (root) => join(root, '.ai', 'sdlc-config.json');

/** True when the project has no `.ai/` folder: the next /wf key runs the setup first. */
export function needsSetup(root) {
  return !existsSync(join(root, '.ai'));
}

/** True when git ignores `.ai/` in this repo; null outside a git repo. */
export function aiIgnored(root, { run = defaultRun } = {}) {
  const r = run('git', ['check-ignore', '-q', '.ai/'], { cwd: root });
  if (r.status === 0) return true;
  return r.status === 1 ? false : null;
}

/** Add `.ai/` to the .gitignore of the repo. Only after the person said yes. */
export function ignoreAi(root) {
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^\/?\.ai\/?\s*$/m.test(text)) return false;
  appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}.ai/\n`);
  return true;
}

/**
 * Write the `.ai/` tree and the `project` setting, then report the facts. A second run keeps the
 * settings that are there and changes only the line about the repo when one is given.
 */
export function setupProject(root, { about = null, ignore = false, run = defaultRun, now = new Date() } = {}) {
  const created = needsSetup(root);
  mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
  const file = configFile(root);
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const project = config.project && typeof config.project === 'object' ? config.project : {};
  config.project = { ...project, ...(about ? { about } : {}), setupAt: project.setupAt ?? nowIso(now) };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  const ignoredBefore = aiIgnored(root, { run });
  const ignoreAdded = ignore && ignoredBefore === false ? ignoreAi(root) : false;
  const facts = shipFacts(root, null, { run });
  return {
    created,
    config: file,
    project: config.project,
    profile: readProfile(root),
    ignored: ignoreAdded ? true : ignoredBefore,
    ignoreAdded,
    facts: facts.ok ? { repo: facts.repo, base: facts.base, method: facts.method, allowed: facts.allowed } : { reason: facts.reason },
    gaps: readyGaps(root, { run }),
  };
}
