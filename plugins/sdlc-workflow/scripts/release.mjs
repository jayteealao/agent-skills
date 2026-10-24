#!/usr/bin/env node
/**
 * scripts/release.mjs — `npm run release <patch|minor|major|next>`, the one way to release.
 *
 * Six steps, in order. Each step checks whether its work is already done, so a second run
 * after a failure resumes at the step that stopped. The run stops at the first failure.
 *
 *   preflight  on master, not behind origin/master, the paths the release writes are clean,
 *              every gate passes, and the last CI run on master is green
 *   prepare    the CHANGELOG section, the version in package.json and every carrier it
 *              stamps, the catalog line, the generated files, BUILD_SHA, and the move of
 *              each shipped plan to docs/internal/archived/
 *   publish    one commit of those paths only, an annotated tag, a push of master and the tag
 *   delivered  origin/master and the remote tags carry the release
 *   install    a reinstall on each host of this machine, then doctor must say OK
 *   report     the command page needs an update when skills/wf/keys.json changed
 *
 * `next` is the channel for daily work: 9.x.y → 10.0.0-next.0 → 10.0.0-next.1 … and
 * `major` ships 10.0.0 from the last next. A file another session changed is never staged.
 * The target version is kept in .release.json between runs; the last step deletes it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_SHA_FILE, readClaudeInstalls, readCodexInstalls, runDoctor, formatDoctorTable, versionVerdict, MARKETPLACE, PLUGIN_NAME } from '../lib/doctor.mjs';
import { stampVersion } from './stamp-version.mjs';
import { generate } from './generate.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const LEVELS = ['patch', 'minor', 'major', 'next'];
export const STEPS = ['preflight', 'prepare', 'publish', 'delivered', 'install', 'report'];
export const STATE_FILE = '.release.json';
export const SUBJECT = (v) => `release(sdlc-workflow): v${v}`;
export const CI_WORKFLOW = 'sdlc-gates.yml';
export const PLANS_DIR = 'docs/internal';

/** The paths the release writes, relative to the plugin root. */
export const OWNED = [
  'package.json', 'package-lock.json', 'CHANGELOG.md', BUILD_SHA_FILE,
  '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'docs/site/nav.html',
  '../../.claude-plugin/marketplace.json',
];

/** The gates, as node scripts relative to the plugin root. */
export const GATES = [
  ['tests', ['tests/run-all.mjs']],
  ['generated', ['scripts/generate.mjs', '--check']],
  ['drift', ['scripts/lint-drift.mjs']],
  ['versions', ['scripts/verify-release-versions.mjs']],
  ['neutrality', ['scripts/verify-host-neutrality.mjs']],
  ['surface', ['scripts/verify-surface.mjs']],
  ['docs', ['scripts/verify-doc-site.mjs']],
  ['legibility', ['scripts/verify-doc-legibility.mjs']],
];

export class ReleaseStop extends Error {}
const stop = (message) => { throw new ReleaseStop(message); };

// ---------------------------------------------------------------- versions

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?$/;

/** The version a release of `level` makes from `current`. */
export function nextVersion(current, level) {
  const m = VERSION.exec(current);
  if (!m) stop(`package.json version ${current} is not X.Y.Z or X.Y.Z-next.N`);
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  const pre = m[4] === undefined ? null : Number(m[4]);
  if (level === 'next') return pre === null ? `${major + 1}.0.0-next.0` : `${major}.${minor}.${patch}-next.${pre + 1}`;
  if (pre !== null) {
    if (level !== 'major') stop(`${current} is on the next channel: run release next, or release major to ship ${major}.${minor}.${patch}`);
    return `${major}.${minor}.${patch}`;
  }
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  return stop(`unknown level ${level}: use one of ${LEVELS.join(', ')}`);
}

/** The catalog release line moves with the plugin: a minor for a minor or a major, a patch otherwise. */
export function nextCatalogVersion(current, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) stop(`the catalog version ${current} is not X.Y.Z`);
  const [a, b, c] = m.slice(1, 4).map(Number);
  return level === 'minor' || level === 'major' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

// ---------------------------------------------------------------- CHANGELOG

/**
 * The CHANGELOG with a section for `version`. An `## [Unreleased]` section with text becomes
 * the version section. With no such text, the section lists `lines` (the commit subjects).
 * A CHANGELOG that has the section already comes back unchanged.
 */
export function changelogFor(text, version, date, lines = []) {
  if (text.includes(`## [${version}]`)) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lf = text.replace(/\r\n/g, '\n');
  const heading = `## [${version}] - ${date}`;
  const un = /^## \[Unreleased\][^\n]*\n/m.exec(lf);
  let out;
  if (un) {
    const rest = lf.slice(un.index + un[0].length);
    const next = rest.search(/^## \[/m);
    const body = next < 0 ? rest : rest.slice(0, next);
    if (body.trim()) out = `${lf.slice(0, un.index)}${heading}\n${rest}`;
    else out = `${lf.slice(0, un.index)}${sectionOf(heading, lines)}${next < 0 ? '' : rest.slice(next)}`;
  } else {
    const first = lf.search(/^## \[/m);
    const at = first < 0 ? lf.length : first;
    out = `${lf.slice(0, at)}${first < 0 && !lf.endsWith('\n\n') ? '\n' : ''}${sectionOf(heading, lines)}${lf.slice(at)}`;
  }
  return eol === '\n' ? out : out.replace(/\n/g, '\r\n');
}

function sectionOf(heading, lines) {
  if (!lines.length) stop('the CHANGELOG has no Unreleased text and no commit names a change');
  return `${heading}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n`;
}

// ---------------------------------------------------------------- plans

/** The shipped version that a plan's Status line names, or null. */
export function shippedVersionOf(text) {
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  const m = /Status\W{0,4}(?:SHIPPED|BUILT)[^\n]{0,24}?\bv?(\d+\.\d+\.\d+)\b/i.exec(head);
  return m ? m[1] : null;
}

/** The plan files that ship with `version`: a Status line names SHIPPED or BUILT at a version ≤ it. */
export function shippedPlans(root, version, isClean) {
  const dir = join(root, PLANS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('WF-V10-'))
    .filter((f) => {
      const v = shippedVersionOf(readFileSync(join(dir, f), 'utf8'));
      return v && ['behind', 'ok'].includes(versionVerdict(v, version));
    })
    .map((f) => `${PLANS_DIR}/${f}`)
    .filter((rel) => isClean(rel));
}

const LINK = /\]\(([^)\s#]+)(#[^)\s]*)?\)/g;

/**
 * Rewrite the relative links of `text` (a file that moves from `fromDir` to `toDir`) so that
 * each still names its target, where `moved` maps an old path to its new path. Paths are posix
 * and relative to the plugin root.
 */
export function relink(text, fromDir, toDir, moved) {
  return text.replace(LINK, (all, target, anchor = '') => {
    if (/^[a-z]+:/i.test(target) || target.startsWith('/')) return all;
    const old = posix.normalize(posix.join(fromDir, target));
    const now = moved.get(old) ?? old;
    if (now === old && fromDir === toDir) return all;
    let rel = posix.relative(toDir, now);
    if (!rel) return all;
    if (!rel.startsWith('.') && target.startsWith('./')) rel = `./${rel}`;
    return rel === target ? all : `](${rel}${anchor})`;
  });
}

// ---------------------------------------------------------------- process

function defaultRun(cmd, args, { cwd, input, shell = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', shell, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

function context(opts = {}) {
  const root = resolve(opts.root ?? PLUGIN_ROOT);
  const run = opts.run ?? defaultRun;
  const ctx = {
    root,
    repoRoot: resolve(root, '..', '..'),
    run,
    log: opts.log ?? ((line) => process.stdout.write(`${line}\n`)),
    now: opts.now ?? (() => new Date()),
    gates: opts.gates ?? GATES,
    checkCi: opts.checkCi ?? checkCi,
    install: opts.install ?? installHosts,
    doctor: opts.doctor ?? ((c) => runDoctor({ pluginRoot: c.root })),
    generate: opts.generate ?? ((c) => generate({ root: c.root, write: true })),
    remote: opts.remote ?? 'origin',
    branch: opts.branch ?? 'master',
  };
  ctx.git = (...args) => {
    const r = run('git', ['-C', ctx.root, ...args]);
    return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
  };
  ctx.mustGit = (...args) => {
    const r = ctx.git(...args);
    if (!r.ok) stop(`git ${args.join(' ')} failed: ${r.err || r.out}`);
    return r.out;
  };
  return ctx;
}

/** A path relative to the plugin root has no uncommitted change. */
function cleanPath(ctx, rel) {
  return ctx.git('status', '--porcelain', '--', rel).out === '';
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function replaceFirstVersion(text, version) {
  return text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
}

// ---------------------------------------------------------------- steps

function preflight(ctx, state) {
  const head = ctx.mustGit('rev-parse', '--abbrev-ref', 'HEAD');
  if (head !== ctx.branch) stop(`HEAD is on ${head}: release only from ${ctx.branch}`);
  ctx.mustGit('fetch', '--quiet', ctx.remote, ctx.branch);
  const upstream = `${ctx.remote}/${ctx.branch}`;
  if (!ctx.git('merge-base', '--is-ancestor', upstream, 'HEAD').ok) stop(`HEAD is behind ${upstream}: merge it first`);
  const dirty = OWNED.filter((rel) => existsSync(join(ctx.root, rel)) && !cleanPath(ctx, rel));
  if (dirty.length) stop(`the release writes these paths, and they have uncommitted changes: ${dirty.join(', ')}`);
  for (const [name, args] of ctx.gates) {
    const r = ctx.run(process.execPath, args, { cwd: ctx.root });
    if (r.status !== 0) stop(`the ${name} gate failed:\n${(r.stderr || r.stdout).trim().split('\n').slice(-15).join('\n')}`);
    ctx.log(`[release]   gate ${name}: OK`);
  }
  const ci = ctx.checkCi(ctx);
  if (!ci.ok) stop(ci.reason);
  ctx.log(`[release]   CI: ${ci.reason}`);
  state.sourceSha = ctx.mustGit('rev-parse', 'HEAD');
}

/** The last run of the gates workflow on master must be green; no run yet is a note, not a stop. */
export function checkCi(ctx) {
  const r = ctx.run('gh', ['run', 'list', '--workflow', CI_WORKFLOW, '--branch', ctx.branch, '--limit', '1', '--json', 'status,conclusion,headSha,url'], { cwd: ctx.repoRoot, shell: process.platform === 'win32' });
  if (r.status !== 0) return { ok: false, reason: `gh cannot read CI: ${(r.stderr || r.stdout).trim() || 'gh is not installed'}` };
  let runs;
  try { runs = JSON.parse(r.stdout || '[]'); } catch { return { ok: false, reason: 'gh returned no JSON for the CI runs' }; }
  if (!runs.length) return { ok: true, reason: `no run of ${CI_WORKFLOW} on ${ctx.branch} yet` };
  const [last] = runs;
  if (last.status !== 'completed') return { ok: false, reason: `CI is still running on ${last.headSha.slice(0, 8)} (${last.url}); run the release again when it ends` };
  if (last.conclusion !== 'success') return { ok: false, reason: `CI is ${last.conclusion} on ${last.headSha.slice(0, 8)} (${last.url})` };
  return { ok: true, reason: `green on ${last.headSha.slice(0, 8)}` };
}

function commitSubjects(ctx) {
  const tag = ctx.git('describe', '--tags', '--abbrev=0', '--match', 'v*').out;
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const log = ctx.git('log', '--format=%s', range, '--', '.').out;
  return log.split('\n').filter((s) => s && !/^release\(sdlc-workflow\):/.test(s));
}

function prepare(ctx, state) {
  const { root } = ctx;
  const written = new Set();
  const touch = (rel) => written.add(rel);

  // The CHANGELOG section.
  const changelog = join(root, 'CHANGELOG.md');
  const before = readFileSync(changelog, 'utf8');
  const after = changelogFor(before, state.version, ctx.now().toISOString().slice(0, 10), commitSubjects(ctx));
  if (after !== before) { writeFileSync(changelog, after); touch('CHANGELOG.md'); }

  // package.json, then every carrier it stamps.
  const pkgPath = join(root, 'package.json');
  const pkgText = readFileSync(pkgPath, 'utf8');
  if (readJson(pkgPath).version !== state.version) { writeFileSync(pkgPath, replaceFirstVersion(pkgText, state.version)); touch('package.json'); }
  const stamp = stampVersion({ pluginRoot: root, repoRoot: ctx.repoRoot, version: state.version });
  for (const rel of stamp.changed) touch(rel.replace(/\\/g, '/'));

  // The catalog release line: the top-level version of the root marketplace.
  const catalog = join(ctx.repoRoot, '.claude-plugin', 'marketplace.json');
  if (existsSync(catalog)) {
    const text = readFileSync(catalog, 'utf8');
    if (readJson(catalog).version !== state.catalogVersion) { writeFileSync(catalog, replaceFirstVersion(text, state.catalogVersion)); touch('../../.claude-plugin/marketplace.json'); }
  }

  // The generated files, and the SHA of the commit that the release ships.
  for (const rel of ctx.generate(ctx)) touch(rel);
  const buildSha = join(root, BUILD_SHA_FILE);
  if (!existsSync(buildSha) || readFileSync(buildSha, 'utf8').trim() !== state.sourceSha) {
    writeFileSync(buildSha, `${state.sourceSha}\n`);
    touch(BUILD_SHA_FILE);
  }

  // The shipped plans move to archived/, with their links.
  const plans = shippedPlans(root, state.version, (rel) => cleanPath(ctx, rel) && ctx.git('ls-files', '--error-unmatch', '--', rel).ok);
  if (plans.length) {
    const moved = new Map(plans.map((rel) => [rel, `${PLANS_DIR}/archived/${posix.basename(rel)}`]));
    mkdirSync(join(root, PLANS_DIR, 'archived'), { recursive: true });
    const docs = [...readdirSync(join(root, PLANS_DIR)).filter((f) => f.endsWith('.md')).map((f) => `${PLANS_DIR}/${f}`),
      ...readdirSync(join(root, PLANS_DIR, 'archived')).filter((f) => f.endsWith('.md')).map((f) => `${PLANS_DIR}/archived/${f}`),
      'README.md', 'CHANGELOG.md'].filter((rel) => existsSync(join(root, rel)));
    for (const rel of docs) {
      const target = moved.get(rel) ?? rel;
      const text = readFileSync(join(root, rel), 'utf8');
      const next = relink(text, posix.dirname(rel), posix.dirname(target), moved);
      if (next === text) continue;
      if (!moved.has(rel) && !cleanPath(ctx, rel) && rel !== 'CHANGELOG.md') { ctx.log(`[release]   note: ${rel} links to an archived plan and has changes of its own; its links are not rewritten`); continue; }
      writeFileSync(join(root, rel), next);
      if (!moved.has(rel)) touch(rel);
    }
    for (const [from, to] of moved) {
      ctx.mustGit('mv', '--', from, to);
      touch(from);
      touch(to);
      ctx.log(`[release]   archived ${from}`);
    }
  }
  state.paths = [...new Set([...(state.paths ?? []), ...written])].sort();
}

function publish(ctx, state) {
  const tag = `v${state.version}`;
  const subject = SUBJECT(state.version);
  let commit = null;
  if (ctx.git('log', '-1', '--format=%s').out === subject) commit = ctx.mustGit('rev-parse', 'HEAD');
  else {
    const paths = state.paths ?? [];
    if (!paths.length) stop('the release changed no path: nothing to commit');
    ctx.mustGit('add', '--', ...paths.filter((rel) => existsSync(join(ctx.root, rel))));
    ctx.mustGit('commit', '--quiet', '-m', subject, '--only', '--', ...paths);
    commit = ctx.mustGit('rev-parse', 'HEAD');
  }
  const tagged = ctx.git('rev-parse', '--quiet', '--verify', `refs/tags/${tag}^{commit}`);
  if (!tagged.ok) ctx.mustGit('tag', '-a', tag, '-m', subject, commit);
  else if (tagged.out !== commit) stop(`the tag ${tag} names ${tagged.out.slice(0, 8)}, not the release commit ${commit.slice(0, 8)}`);
  ctx.mustGit('push', '--quiet', ctx.remote, `HEAD:refs/heads/${ctx.branch}`);
  ctx.mustGit('push', '--quiet', ctx.remote, `refs/tags/${tag}`);
  state.commit = commit;
}

function delivered(ctx, state) {
  ctx.mustGit('fetch', '--quiet', ctx.remote, ctx.branch);
  if (!ctx.git('merge-base', '--is-ancestor', state.commit, `${ctx.remote}/${ctx.branch}`).ok) stop(`${ctx.remote}/${ctx.branch} does not have the release commit ${state.commit.slice(0, 8)}`);
  if (!ctx.git('ls-remote', '--exit-code', '--tags', ctx.remote, `refs/tags/v${state.version}`).ok) stop(`${ctx.remote} does not have the tag v${state.version}`);
}

/** The reinstall of each host that has the plugin, through the host CLIs. */
export function installHosts(ctx) {
  const shell = process.platform === 'win32';
  const steps = [];
  const claude = readClaudeInstalls();
  if (claude.length) {
    steps.push(['claude', ['plugin', 'marketplace', 'update', MARKETPLACE], ctx.repoRoot]);
    for (const i of claude) {
      const args = ['plugin', 'update', `${PLUGIN_NAME}@${MARKETPLACE}`, '-y'];
      if (i.scope !== 'user') args.push('--scope', i.scope);
      steps.push(['claude', args, i.projectPath ?? ctx.repoRoot]);
    }
  }
  if (readCodexInstalls().installs.length) steps.push(['codex', ['plugin', 'marketplace', 'upgrade', MARKETPLACE], ctx.repoRoot]);
  for (const [cmd, args, cwd] of steps) {
    if (!existsSync(cwd)) { ctx.log(`[release]   skip ${cmd} ${args.join(' ')}: ${cwd} is gone`); continue; }
    const r = ctx.run(cmd, args, { cwd, shell });
    if (r.status !== 0) stop(`${cmd} ${args.join(' ')} (in ${cwd}) failed: ${(r.stderr || r.stdout).trim()}`);
    ctx.log(`[release]   ${cmd} ${args.join(' ')}: OK`);
  }
}

async function install(ctx, state) {
  ctx.install(ctx, state);
  const report = await ctx.doctor(ctx);
  ctx.log(formatDoctorTable(report).split('\n').map((l) => `[release]   ${l}`).join('\n'));
  if (!report.ok) stop('doctor: a host does not run the released version');
}

function report(ctx, state) {
  const prev = ctx.git('describe', '--tags', '--abbrev=0', '--match', 'v*', `v${state.version}^`).out;
  const changed = prev && !ctx.git('diff', '--quiet', prev, `v${state.version}`, '--', 'skills/wf/keys.json').ok;
  state.keysChanged = Boolean(changed);
  if (changed) ctx.log(`[release]   the keys changed since ${prev}: update the command page`);
}

const STEP_FN = { preflight, prepare, publish, delivered, install, report };

// ---------------------------------------------------------------- run

/** Run (or resume) a release of `level`. Returns the final state; throws ReleaseStop on a failure. */
export async function release(level, opts = {}) {
  if (!LEVELS.includes(level)) stop(`usage: npm run release <${LEVELS.join('|')}>`);
  const ctx = context(opts);
  const statePath = join(ctx.root, STATE_FILE);
  let state = existsSync(statePath) ? readJson(statePath) : null;
  if (state && state.level !== level) stop(`a ${state.level} release of v${state.version} is in progress: run npm run release ${state.level} to resume it, or delete ${STATE_FILE}`);
  if (!state) {
    const current = readJson(join(ctx.root, 'package.json')).version;
    const catalog = join(ctx.repoRoot, '.claude-plugin', 'marketplace.json');
    state = {
      level,
      from: current,
      version: nextVersion(current, level),
      catalogVersion: existsSync(catalog) ? nextCatalogVersion(readJson(catalog).version, level) : null,
      done: [],
    };
  }
  const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  ctx.log(`[release] ${state.from} → ${state.version} (${level})${state.done.length ? `, resuming after ${state.done.at(-1)}` : ''}`);
  for (const step of STEPS) {
    if (state.done.includes(step)) continue;
    ctx.log(`[release] ${step}`);
    try {
      await STEP_FN[step](ctx, state);
    } finally {
      save();
    }
    state.done.push(step);
    save();
  }
  rmSync(statePath, { force: true });
  ctx.log(`[release] v${state.version} is released: ${state.commit.slice(0, 8)} on ${ctx.remote}/${ctx.branch}`);
  return state;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const level = process.argv[2];
  release(level).catch((err) => {
    if (!(err instanceof ReleaseStop)) throw err;
    console.error(`[release] stopped: ${err.message}`);
    console.error(`[release] fix it, then run npm run release ${level} again; it resumes at this step.`);
    process.exitCode = 1;
  });
}
