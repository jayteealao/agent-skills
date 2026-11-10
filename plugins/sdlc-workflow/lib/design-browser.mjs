// The browser of the design checks: where a Chromium is found on this computer, and the
// temporary profile folder that each run gives it.
//
// A run makes one profile folder in the temp folder, `sdlc-check-<random>`, and removes it when
// the browser closes. A run that was killed leaves its folder: each new run removes the folders
// that are older than a day and that no browser holds.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pidAlive } from './proc.mjs';

/** The name starts of the profile folders that the design scripts make in the temp folder. */
export const PROFILE_PREFIXES = Object.freeze(['sdlc-check-', 'sdlc-board-']);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The directories where Playwright keeps its browsers. */
function playwrightDirs(root, env) {
  const dirs = [];
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') dirs.push(env.PLAYWRIGHT_BROWSERS_PATH);
  dirs.push(join(root, 'node_modules', 'playwright-core', '.local-browsers'));
  const home = homedir();
  if (platform() === 'win32') dirs.push(join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright'));
  else if (platform() === 'darwin') dirs.push(join(home, 'Library', 'Caches', 'ms-playwright'));
  else dirs.push(join(home, '.cache', 'ms-playwright'));
  return dirs;
}

/** The browser revisions the project's Playwright wants, from node_modules/playwright-core/browsers.json. */
function projectRevisions(root) {
  try {
    const j = JSON.parse(readFileSync(join(root, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8'));
    return new Map((j.browsers ?? []).map((b) => [b.name, String(b.revision)]));
  } catch { return new Map(); }
}

/** The executables inside one Playwright browser folder. A headless shell comes before a full Chromium. */
function playwrightExecutables(dir, revisions) {
  if (!existsSync(dir)) return [];
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  const rank = (name) => {
    const [kind, rev] = name.split('-');
    const wanted = kind === 'chromium_headless_shell' ? revisions.get('chromium-headless-shell') : revisions.get('chromium');
    return (wanted && rev === wanted ? 0 : 1) * 100000 - Number(rev || 0);
  };
  const shells = entries.filter((e) => /^chromium_headless_shell-\d+$/.test(e)).sort((a, b) => rank(a) - rank(b));
  const fulls = entries.filter((e) => /^chromium-\d+$/.test(e)).sort((a, b) => rank(a) - rank(b));
  const out = [];
  for (const e of shells) {
    for (const rel of ['chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-headless-shell-linux64/chrome-headless-shell',
      'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
      const p = join(dir, e, ...rel.split('/'));
      if (existsSync(p)) out.push({ path: p, kind: 'shell', from: `playwright ${e}` });
    }
  }
  for (const e of fulls) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome',
      'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(dir, e, ...rel.split('/'));
      if (existsSync(p)) out.push({ path: p, kind: 'chromium', from: `playwright ${e}` });
    }
  }
  return out;
}

function onPath(name) {
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean) ?? null : null;
}

/**
 * The browsers of this computer, in the order a run tries them: SDLC_BROWSER, the project's
 * Playwright Chromium, PLAYWRIGHT_BROWSERS_PATH and the Playwright cache, Chrome, Edge, Chromium.
 * A set SDLC_BROWSER is the only candidate: the person chose it. `SDLC_BROWSER=none` gives none.
 */
export function browserCandidates(root, env = process.env) {
  if (env.SDLC_BROWSER === 'none') return [];
  if (env.SDLC_BROWSER) {
    const kind = /\.(m?js)$/i.test(env.SDLC_BROWSER) ? 'script' : /headless[-_]shell/i.test(env.SDLC_BROWSER) ? 'shell' : 'chromium';
    return [{ path: env.SDLC_BROWSER, kind, from: 'SDLC_BROWSER' }];
  }
  const out = [];
  const revisions = projectRevisions(root);
  for (const d of playwrightDirs(root, env)) out.push(...playwrightExecutables(d, revisions));
  const sys = [];
  if (platform() === 'win32') {
    const pf = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    for (const base of pf) sys.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    for (const base of pf) sys.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    for (const base of pf) sys.push(join(base, 'Chromium', 'Application', 'chrome.exe'));
  } else if (platform() === 'darwin') {
    sys.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const n of ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'chromium', 'chromium-browser']) {
      const p = onPath(n);
      if (p) sys.push(p);
    }
  }
  for (const p of sys) if (existsSync(p)) out.push({ path: p, kind: 'chromium', from: 'system' });
  const seen = new Set();
  return out.filter((c) => (seen.has(c.path) ? false : seen.add(c.path)));
}

/**
 * Why no browser can run the checks, as one sentence for the person. A set SDLC_BROWSER that
 * names no file, or a script, is named: the default list is not read then.
 */
export function noBrowserReason(root, env = process.env, tried = []) {
  const set = env.SDLC_BROWSER;
  if (set === 'none') return 'no browser can run the checks: SDLC_BROWSER is none';
  if (set && /\.(m?js)$/i.test(set)) return `no browser can run the checks: SDLC_BROWSER names a script (${set}), and the checks need a Chromium`;
  if (set && !existsSync(set)) return `no browser can run the checks: SDLC_BROWSER names ${set}, which is not a file`;
  if (set) return `no browser can run the checks: SDLC_BROWSER names ${set}, and it did not start`;
  if (tried.length) return `no browser can run the checks: ${tried.length} browser(s) did not start (${tried.map((b) => b.path).join(', ')})`;
  return 'no browser can run the checks: install Chrome, Edge or Chromium, or set SDLC_BROWSER';
}

/** Remove one profile folder. A browser that just ended can hold it for a moment, so the remove tries again. */
export function removeProfile(dir, { tries = 10 } = {}) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: Math.max(0, tries - 1), retryDelay: 150 }); } catch { return false; }
  return !existsSync(dir);
}

/** True when a live browser holds the profile: Chromium keeps a lock in it that names its process. */
function profileInUse(dir) {
  const lock = join(dir, 'SingletonLock');
  try {
    // POSIX: a link to `<host>-<pid>`.
    if (lstatSync(lock).isSymbolicLink()) return pidAlive(Number(String(readlinkSync(lock)).split('-').pop()));
  } catch { /* no lock */ }
  return false;
}

/**
 * Remove the profile folders of earlier runs that are older than a day and that no browser holds.
 * On Windows a browser that runs keeps files of its profile open, so the remove of a held folder
 * fails and the folder stays. Returns the number removed.
 */
export function sweepProfiles({ dir = tmpdir(), now = Date.now(), olderThanMs = DAY_MS } = {}) {
  let names = [];
  try { names = readdirSync(dir); } catch { return 0; }
  let n = 0;
  for (const name of names) {
    if (!PROFILE_PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (!st.isDirectory() || now - st.mtimeMs < olderThanMs || profileInUse(full)) continue;
      rmSync(full, { recursive: true, force: true });
      n += 1;
    } catch { /* held, or gone */ }
  }
  return n;
}
