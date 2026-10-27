// The git hooks of a project: the commands that its pre-push and pre-commit hooks run.
//
// A check that a hook runs and the test profile does not name is first seen at the push. Setup
// reads the hooks, so that the person can put each pre-push command into the `heavy` suite, and
// the doctor warns about a pre-push command that is in no suite. The reads are files only: no git
// call and no hook run.
//
// The sources: lefthook.yml (and its other names), .husky/<hook>, .pre-commit-config.yaml and the
// hook file of the git folder. A hook file that a hook manager wrote is left out, because the
// manager's own config names the commands.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { parse as parseYaml } from './yaml.mjs';

export const HOOKS = ['pre-push', 'pre-commit'];
const LEFTHOOK_FILES = ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml', '.lefthook.yaml'];
// pre-commit names the stages `push` and `commit` in its old configs.
const PRE_COMMIT_STAGES = { 'pre-push': ['pre-push', 'push'], 'pre-commit': ['pre-commit', 'commit'] };
// The marks of a hook file that a hook manager wrote.
const MANAGED = /lefthook|husky|pre-commit\.com|INSTALL_PYTHON|simple-git-hooks|yorkie/i;

function readText(file) {
  try {
    return statSync(file).isFile() ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}

function readYaml(file) {
  const text = readText(file);
  if (text == null) return null;
  try {
    return parseYaml(text);
  } catch {
    return null;
  }
}

// The commands of a lefthook hook: `commands.<name>.run`, `scripts.<file>` with its runner, and
// `jobs[].run` or `jobs[].script`, with the jobs of a group.
function lefthookCommands(hookCfg, hook) {
  if (!hookCfg || typeof hookCfg !== 'object') return [];
  const out = [];
  for (const c of Object.values(hookCfg.commands ?? {})) {
    if (c && typeof c === 'object' && !c.skip && typeof c.run === 'string') out.push(c.run);
  }
  for (const [name, s] of Object.entries(hookCfg.scripts ?? {})) {
    if (s && typeof s === 'object' && s.skip) continue;
    const runner = s && typeof s === 'object' && typeof s.runner === 'string' ? `${s.runner} ` : '';
    out.push(`${runner}.lefthook/${hook}/${name}`);
  }
  const jobs = (list) => {
    for (const j of Array.isArray(list) ? list : []) {
      if (!j || typeof j !== 'object' || j.skip) continue;
      if (typeof j.run === 'string') out.push(j.run);
      else if (typeof j.script === 'string') out.push(`${typeof j.runner === 'string' ? `${j.runner} ` : ''}.lefthook/${hook}/${j.script}`);
      else if (j.group && typeof j.group === 'object') jobs(j.group.jobs);
    }
  };
  jobs(hookCfg.jobs);
  return out;
}

// The command lines of a shell hook file: no shebang, comment, blank line, `set` or `exit`
// line, and no line that loads husky. A line that ends with a backslash goes on.
function shellCommands(text) {
  const out = [];
  let carry = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = carry ? `${carry} ${raw.trim()}` : raw.trim();
    if (line.endsWith('\\')) { carry = line.slice(0, -1).trim(); continue; }
    carry = '';
    if (!line || line.startsWith('#')) continue;
    if (/^(set\s|exit\b|\.\s.*husky|source\s.*husky)/.test(line)) continue;
    out.push(line);
  }
  if (carry) out.push(carry);
  return out;
}

// The folder that git keeps its hooks in: .git/hooks, or for a worktree the hooks of the
// common git folder. null when there is none.
function gitHooksDir(root) {
  const dotGit = join(root, '.git');
  if (!existsSync(dotGit)) return null;
  let gitDir = dotGit;
  if (statSync(dotGit).isFile()) {
    const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
    if (!m) return null;
    gitDir = isAbsolute(m[1].trim()) ? m[1].trim() : resolve(root, m[1].trim());
  }
  const common = readText(join(gitDir, 'commondir'));
  if (common) gitDir = resolve(gitDir, common.trim());
  return join(gitDir, 'hooks');
}

/**
 * The commands of the pre-push and pre-commit hooks of a project, in source order.
 * Returns [{ hook: 'pre-push'|'pre-commit', command, source }], where `source` is the file that
 * names the command, relative to the root. A file that is not there adds nothing.
 */
export function discoverHookCommands(root) {
  const found = [];
  const add = (hook, command, source) => {
    const c = String(command).trim();
    if (c && !found.some((f) => f.hook === hook && f.command === c)) found.push({ hook, command: c, source });
  };

  for (const name of LEFTHOOK_FILES) {
    const cfg = readYaml(join(root, name));
    if (!cfg || typeof cfg !== 'object') continue;
    for (const hook of HOOKS) for (const c of lefthookCommands(cfg[hook], hook)) add(hook, c, name);
  }

  for (const hook of HOOKS) {
    const text = readText(join(root, '.husky', hook));
    if (text != null) for (const c of shellCommands(text)) add(hook, c, `.husky/${hook}`);
  }

  const pc = readYaml(join(root, '.pre-commit-config.yaml'));
  if (pc && typeof pc === 'object' && Array.isArray(pc.repos)) {
    const defaults = Array.isArray(pc.default_stages) ? pc.default_stages : ['pre-commit'];
    for (const repo of pc.repos) {
      for (const h of Array.isArray(repo?.hooks) ? repo.hooks : []) {
        if (!h || typeof h.id !== 'string') continue;
        const stages = Array.isArray(h.stages) ? h.stages : defaults;
        for (const hook of HOOKS) {
          if (!stages.some((s) => PRE_COMMIT_STAGES[hook].includes(s))) continue;
          add(hook, `pre-commit run --hook-stage ${hook} --all-files ${h.id}`, '.pre-commit-config.yaml');
        }
      }
    }
  }

  const hooksDir = gitHooksDir(root);
  if (hooksDir) {
    for (const hook of HOOKS) {
      const text = readText(join(hooksDir, hook));
      if (text == null || MANAGED.test(text)) continue;
      for (const c of shellCommands(text)) add(hook, c, `.git/hooks/${hook}`);
    }
  }
  return found;
}

const norm = (s) => String(s).trim().replace(/\s+/g, ' ');

/**
 * The suite of the test profile that already runs a hook command, or null. A suite runs it when
 * its command is the hook command, or one of its parts joined by `&&` or `;`.
 */
export function suiteOfCommand(profile, command) {
  const want = norm(command);
  for (const [name, suite] of Object.entries(profile ?? {})) {
    if (!suite?.command) continue;
    const parts = String(suite.command).split(/&&|;|\r?\n/).map(norm);
    if (norm(suite.command) === want || parts.includes(want)) return name;
  }
  return null;
}

/** Each hook command of a project with the suite that runs it: [{ hook, command, source, suite }]. */
export function hookSuites(root, profile) {
  return discoverHookCommands(root).map((h) => ({ ...h, suite: suiteOfCommand(profile, h.command) }));
}
