#!/usr/bin/env node
/**
 * scripts/design-boards.mjs — the design boards of a workflow (DESIGN-BOARDS-PLAN section 5).
 * Bundled to dist/design-boards.mjs; skills/wf/scripts/design-boards.mjs runs the bundle.
 *
 *   init    <root> <slug> [--method m] [--viewport name=WxH]...  create or update design/boards.json
 *   render  <root> <slug> [key...]                 register boards/<key>.html|png, render HTML to PNG (and sketches/*.html), write the sheet
 *   sheet   <root> <slug>                          write design/index.html (the contact sheet)
 *   freeze  <root> <slug> [--by who] [--canvas link] [--canvas-version v]   copy the boards to r<N>/ and record the confirmation
 *   check   <root> <slug>                          the board files that 02c-craft.md boards: lists but that are missing
 *   capture-name <root> <slug> <slice> <key>       the verify capture path of a board
 *   import  <root> <slug> <path>...                copy outside design work into design/source/import-<n>/
 *   track   <root> [--write]                       the .gitignore exceptions that keep the design record tracked (D9)
 *
 * Every command prints one JSON object on stdout. No new dependency: a board renders
 * with the headless mode of an installed Chromium browser (`--screenshot`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DESIGN_DIR, MANIFEST, METHODS, REVISION_WARN_BYTES, SHEET,
  boardFiles, capturePath, emptyManifest, frozenManifestPath, ignoreAdvice, missingBoardFiles, needsPictures,
  parseBoardKey, parseViewport, readManifest, renderSheet, revisionDir,
} from '../lib/design-boards.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';

const USAGE = `usage: design-boards.mjs <init|render|sheet|freeze|check|capture-name|import> <projectRoot> <slug> [args]
       design-boards.mjs track <projectRoot> [--write]`;
/** A browser that renders nothing in this time is stopped (W0: one Playwright Chromium build hung on --screenshot). */
const RENDER_TIMEOUT_MS = Number(process.env.SDLC_BROWSER_TIMEOUT_MS) || 30_000;

const posix = (p) => String(p).split('\\').join('/');
const nowIso = () => new Date().toISOString();
const workflowDir = (root, slug) => join(root, '.ai', 'workflows', slug);
const designDir = (root, slug) => join(workflowDir(root, slug), DESIGN_DIR);
const manifestPath = (root, slug) => join(designDir(root, slug), MANIFEST);

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function flags(rest) {
  const pos = [];
  const f = { viewport: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      if (k === 'viewport') f.viewport.push(v); else f[k] = v;
    } else pos.push(a);
  }
  return { pos, f };
}

function requireWorkflow(root, slug) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) throw new Error(`'${slug}' is not a workflow slug`);
  if (!existsSync(workflowDir(root, slug))) throw new Error(`no workflow folder .ai/workflows/${slug}/`);
}

/** The working manifest, created empty when absent. Throws on an invalid manifest. */
function loadWorking(root, slug) {
  const file = manifestPath(root, slug);
  if (!existsSync(file)) return emptyManifest(slug);
  const { manifest, errors } = readManifest(file);
  if (!manifest) throw new Error(errors[0]);
  if (errors.length) throw new Error(`design/${MANIFEST} is not valid: ${errors.join('; ')}`);
  return manifest;
}

const saveWorking = (root, slug, m) => writeAtomic(manifestPath(root, slug), `${JSON.stringify(m, null, 2)}\n`);

// ---------------------------------------------------------------- init

function init(root, slug, f) {
  requireWorkflow(root, slug);
  const m = loadWorking(root, slug);
  if (f.method !== undefined) {
    if (!METHODS.includes(f.method)) throw new Error(`--method is one of ${METHODS.join(', ')}`);
    m.method = f.method;
  }
  for (const v of f.viewport) {
    const [name, size] = String(v).split('=');
    if (!name || !parseViewport(size)) throw new Error(`--viewport is <name>=<width>x<height>, not '${v}'`);
    m.viewports[name] = size;
  }
  for (const sub of ['boards', 'source', 'sketches']) mkdirSync(join(designDir(root, slug), sub), { recursive: true });
  saveWorking(root, slug, m);
  return { ok: true, manifest: posix(relative(root, manifestPath(root, slug))), viewports: m.viewports, method: m.method };
}

// ---------------------------------------------------------------- render

/** Add each boards/<key>.html|png file to the manifest; fill in html and png paths that exist now. */
function scanBoards(root, slug, m) {
  const dir = join(designDir(root, slug), 'boards');
  const added = [];
  const found = new Map();
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const ext = extname(name).toLowerCase();
      if (ext !== '.html' && ext !== '.png') continue;
      const key = basename(name, extname(name));
      if (!parseBoardKey(key)) continue;
      const rec = found.get(key) ?? {};
      rec[ext.slice(1)] = `boards/${name}`;
      found.set(key, rec);
    }
  }
  for (const [key, rec] of [...found.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let b = m.boards.find((x) => x.key === key);
    if (!b) {
      const p = parseBoardKey(key);
      b = { key, surface: p.surface, state: p.state, viewport: p.viewport, html: null, png: null, caption: `${p.surface}, ${p.state}${p.viewport ? `, ${p.viewport}` : ''}` };
      m.boards.push(b);
      added.push(key);
    }
    if (rec.html) b.html = rec.html;
    if (rec.png) b.png = rec.png;
  }
  return added;
}

/** The viewport of a board: its own name, else the first viewport of the manifest. */
function viewportOf(m, b) {
  const names = Object.keys(m.viewports ?? {});
  const name = b.viewport ?? names[0] ?? 'desktop';
  const size = parseViewport(m.viewports?.[name] ?? (names.length ? null : '1280x800'));
  if (!size) throw new Error(`board ${b.key}: viewport '${name}' is not in viewports (run init --viewport ${name}=<w>x<h>)`);
  return { name, ...size };
}

/** The directories where Playwright keeps its browsers. */
function playwrightDirs(root) {
  const dirs = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') dirs.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  dirs.push(join(root, 'node_modules', 'playwright-core', '.local-browsers'));
  const home = homedir();
  if (platform() === 'win32') dirs.push(join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright'));
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
 * The browsers that can render a board, in the plan order: SDLC_BROWSER, the
 * project's Playwright Chromium, PLAYWRIGHT_BROWSERS_PATH and the Playwright cache,
 * Chrome, Edge, Chromium. A set SDLC_BROWSER is the only candidate: the person chose
 * it. `SDLC_BROWSER=none` turns rendering off, so the boards stay HTML.
 */
export function browserCandidates(root, env = process.env) {
  if (env.SDLC_BROWSER === 'none') return [];
  if (env.SDLC_BROWSER) {
    const kind = /\.(m?js)$/i.test(env.SDLC_BROWSER) ? 'script' : /headless[-_]shell/i.test(env.SDLC_BROWSER) ? 'shell' : 'chromium';
    return [{ path: env.SDLC_BROWSER, kind, from: 'SDLC_BROWSER' }];
  }
  const out = [];
  const revisions = projectRevisions(root);
  for (const d of playwrightDirs(root)) out.push(...playwrightExecutables(d, revisions));
  const sys = [];
  if (platform() === 'win32') {
    const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
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

/** PNG width and height from the IHDR chunk, or null when the file is not a PNG. */
export function pngSize(file) {
  try {
    const b = readFileSync(file);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } catch { return null; }
}

/** Kill a process and its children. A Chromium child outlives a plain kill on Windows. */
function killTree(pid) {
  if (platform() === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
}

/** Render one HTML file to a PNG with one browser. Resolves `{ ok, ms, error }`. */
function renderOne(browser, htmlFile, pngFile, { width, height }) {
  return new Promise((done) => {
    const profile = mkdtempSync(join(tmpdir(), 'sdlc-board-'));
    const tmpPng = `${pngFile}.${process.pid}.tmp.png`;
    rmSync(tmpPng, { force: true });
    const args = [
      ...(browser.kind === 'chromium' ? ['--headless=new'] : []),
      '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio',
      '--force-device-scale-factor=1', `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`, `--screenshot=${tmpPng}`, pathToFileURL(htmlFile).href,
    ];
    const started = Date.now();
    let child;
    try {
      // A script browser (SDLC_BROWSER=<file>.mjs) runs under this Node: a wrapper, or a test double.
      const [cmd, argv] = browser.kind === 'script' ? [process.execPath, [browser.path, ...args]] : [browser.path, args];
      child = spawn(cmd, argv, { stdio: 'ignore', windowsHide: true, detached: platform() !== 'win32' });
    } catch (e) {
      rmSync(profile, { recursive: true, force: true });
      done({ ok: false, error: e.message });
      return;
    }
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* a dying browser can hold the profile for a moment */ }
      done({ ...res, ms: Date.now() - started });
    };
    const timer = setTimeout(() => {
      killTree(child.pid);
      rmSync(tmpPng, { force: true });
      finish({ ok: false, error: `no PNG after ${RENDER_TIMEOUT_MS} ms; the browser was stopped` });
    }, RENDER_TIMEOUT_MS);
    child.on('error', (e) => finish({ ok: false, error: e.message }));
    child.on('exit', () => {
      const size = pngSize(tmpPng);
      if (!size) { rmSync(tmpPng, { force: true }); finish({ ok: false, error: 'the browser exited without a PNG' }); return; }
      renameSync(tmpPng, pngFile);
      finish({ ok: true, size });
    });
  });
}

async function render(root, slug, keys) {
  requireWorkflow(root, slug);
  const m = loadWorking(root, slug);
  const added = scanBoards(root, slug, m);
  const want = keys.length ? new Set(keys) : null;
  if (want) for (const k of want) if (!m.boards.some((b) => b.key === k)) throw new Error(`no board '${k}' (write design/boards/${k}.html first)`);
  const dir = designDir(root, slug);
  const candidates = browserCandidates(root);
  const failed = [];
  let browser = null;
  const rendered = [];
  const htmlOnly = [];
  for (const b of m.boards) {
    if (want && !want.has(b.key)) continue;
    if (!b.html) continue;
    const htmlFile = join(dir, ...b.html.split('/'));
    if (!existsSync(htmlFile)) { htmlOnly.push({ key: b.key, reason: `${b.html} is missing` }); continue; }
    const vp = viewportOf(m, b);
    const pngRel = b.png ?? `boards/${b.key}.png`;
    let res = null;
    while (!res?.ok) {
      browser ??= candidates.find((c) => !failed.some((f) => f.path === c.path)) ?? null;
      if (!browser) break;
      res = await renderOne(browser, htmlFile, join(dir, ...pngRel.split('/')), vp);
      if (!res.ok) { failed.push({ path: browser.path, from: browser.from, error: res.error }); browser = null; }
    }
    if (res?.ok) {
      b.png = pngRel;
      delete b.render;
      rendered.push({ key: b.key, png: pngRel, viewport: `${vp.width}x${vp.height}`, ms: res.ms });
    } else {
      const reason = candidates.length
        ? `every browser failed (${failed.map((f) => `${f.from}: ${f.error}`).join('; ')})`
        : process.env.SDLC_BROWSER === 'none' ? 'SDLC_BROWSER=none' : 'no Chromium browser found; set SDLC_BROWSER to one';
      if (!b.png || !existsSync(join(dir, ...b.png.split('/')))) b.png = null;
      b.render = `none — ${reason}`;
      htmlOnly.push({ key: b.key, reason });
    }
  }
  // Brainstorm sketches (sketches/<key>.html) render to sketches/<key>.png at the main
  // viewport. They are ideas, not boards, so the manifest does not list them.
  const sketches = [];
  const sketchDir = join(dir, 'sketches');
  if (!want && existsSync(sketchDir)) {
    const names = Object.keys(m.viewports ?? {});
    const vp = parseViewport(m.viewports?.[names[0]] ?? '1280x800') ?? { width: 1280, height: 800 };
    for (const name of readdirSync(sketchDir).filter((n) => n.toLowerCase().endsWith('.html')).sort()) {
      let res = null;
      while (!res?.ok) {
        browser ??= candidates.find((c) => !failed.some((x) => x.path === c.path)) ?? null;
        if (!browser) break;
        res = await renderOne(browser, join(sketchDir, name), join(sketchDir, `${basename(name, extname(name))}.png`), vp);
        if (!res.ok) { failed.push({ path: browser.path, from: browser.from, error: res.error }); browser = null; }
      }
      sketches.push({ sketch: `sketches/${name}`, png: res?.ok ? `sketches/${basename(name, extname(name))}.png` : null });
    }
  }
  saveWorking(root, slug, m);
  writeSheet(root, slug, m);
  return {
    ok: true, manifest: posix(relative(root, manifestPath(root, slug))), sheet: posix(relative(root, join(dir, SHEET))),
    added, rendered, htmlOnly, ...(sketches.length ? { sketches } : {}), browser: browser ? { path: browser.path, from: browser.from } : null,
    ...(failed.length ? { browserFailures: failed } : {}),
  };
}

// ---------------------------------------------------------------- sheet

function writeSheet(root, slug, m, into = designDir(root, slug)) {
  const file = join(into, SHEET);
  writeAtomic(file, renderSheet(m, { generatedAt: nowIso() }));
  return file;
}

function sheet(root, slug) {
  requireWorkflow(root, slug);
  const m = loadWorking(root, slug);
  const file = writeSheet(root, slug, m);
  return { ok: true, sheet: posix(relative(root, file)), absolute: posix(file), boards: m.boards.length };
}

// ---------------------------------------------------------------- freeze

function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}

function freeze(root, slug, f) {
  requireWorkflow(root, slug);
  const m = loadWorking(root, slug);
  const dir = designDir(root, slug);
  if (!m.boards.length) throw new Error('freeze: the manifest lists no board; write and render the boards first');
  const missing = [];
  for (const b of m.boards) for (const file of boardFiles(b)) if (!existsSync(join(dir, ...file.split('/')))) missing.push(file);
  for (const b of m.boards) if (!boardFiles(b).length) missing.push(`${b.key} (no html and no png)`);
  if (missing.length) throw new Error(`freeze: board files are missing: ${missing.join(', ')}`);
  const by = f.by === undefined ? 'in-session' : String(f.by);
  if (!['in-session', 'product-md', 'teach'].includes(by)) throw new Error('freeze: --by is in-session, product-md or teach');
  const n = (Number(m.revision) || 0) + 1;
  const out = join(dir, revisionDir(n));
  if (existsSync(out)) throw new Error(`freeze: design/${revisionDir(n)}/ exists; a frozen revision is never changed`);
  const frozen = structuredClone(m);
  frozen.revision = n;
  frozen.confirmed = [...(m.confirmed ?? []), {
    revision: n, at: nowIso(), by,
    canvas: f.canvas && f.canvas !== true ? String(f.canvas) : null,
    'canvas-version': f['canvas-version'] && f['canvas-version'] !== true ? String(f['canvas-version']) : null,
  }];
  const staging = `${out}.${process.pid}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  for (const b of frozen.boards) {
    for (const file of [b.html, b.png].filter(Boolean)) {
      const dest = join(staging, ...file.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(dir, ...file.split('/')), dest);
    }
  }
  writeFileSync(join(staging, MANIFEST), `${JSON.stringify(frozen, null, 2)}\n`);
  writeFileSync(join(staging, SHEET), renderSheet(frozen, { generatedAt: nowIso(), frozen: true }));
  renameSync(staging, out);
  saveWorking(root, slug, frozen);
  writeSheet(root, slug, frozen);
  const bytes = dirBytes(out);
  const warnings = [];
  if (bytes > REVISION_WARN_BYTES) warnings.push(`revision ${n} is ${(bytes / 1048576).toFixed(1)} MB, more than ${REVISION_WARN_BYTES / 1048576} MB; a tracked record grows the repo by this much`);
  const pngBoards = frozen.boards.filter((b) => b.png);
  if (pngBoards.length < frozen.boards.length) warnings.push(`${frozen.boards.length - pngBoards.length} board(s) have no PNG; verify compares against PNGs`);
  // The north star is the first board at the first viewport (the main one), else the first board.
  const mainViewport = Object.keys(frozen.viewports ?? {})[0] ?? null;
  const first = pngBoards.find((b) => !b.viewport || b.viewport === mainViewport) ?? pngBoards[0] ?? frozen.boards[0];
  return {
    ok: true, revision: n, dir: `${DESIGN_DIR}/${revisionDir(n)}`, boards: frozenManifestPath(n),
    'north-star-mock': `${DESIGN_DIR}/${revisionDir(n)}/${boardFiles(first)[0]}`,
    sheet: `${DESIGN_DIR}/${revisionDir(n)}/${SHEET}`, bytes, warnings,
  };
}

// ---------------------------------------------------------------- check

function readFm(file) {
  if (!existsSync(file)) return null;
  return safeParseFrontmatter(readFileSync(file, 'utf8'), { filePath: file }).data ?? {};
}

function check(root, slug) {
  requireWorkflow(root, slug);
  const wdir = workflowDir(root, slug);
  const index = readFm(join(wdir, '00-index.md')) ?? {};
  const contract = readFm(join(wdir, '02c-craft.md'));
  const pictures = needsPictures(index);
  if (!contract) {
    const working = existsSync(manifestPath(root, slug)) ? missingBoardFiles(wdir, { boards: `${DESIGN_DIR}/${MANIFEST}` }) : null;
    return { ok: false, contract: false, 'ux-impact': index['ux-impact'] ?? null, needsPictures: pictures, missing: working ?? [], reason: '02c-craft.md is missing: the design is not confirmed' };
  }
  const boards = String(contract.boards ?? '').trim() || null;
  const missing = missingBoardFiles(wdir, contract);
  return {
    ok: missing.length === 0,
    contract: true, 'ux-impact': index['ux-impact'] ?? null, needsPictures: pictures,
    boards, revision: contract['design-revision'] ?? null, missing,
    ...(boards ? {} : { note: '02c-craft.md names no boards: (written before the boards release); the old settled rule applies' }),
  };
}

// ---------------------------------------------------------------- capture-name

function captureName(root, slug, [slice, key]) {
  requireWorkflow(root, slug);
  if (!slice || !key) throw new Error('capture-name: <slice> <key> are required');
  const rel = capturePath(slice, key);
  const abs = join(workflowDir(root, slug), ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  return { ok: true, path: rel, absolute: posix(abs) };
}

// ---------------------------------------------------------------- import

function importSources(root, slug, paths) {
  requireWorkflow(root, slug);
  if (!paths.length) throw new Error('import: name one or more files or folders');
  const src = join(designDir(root, slug), 'source');
  mkdirSync(src, { recursive: true });
  let n = 1;
  while (existsSync(join(src, `import-${n}`))) n++;
  const out = join(src, `import-${n}`);
  mkdirSync(out, { recursive: true });
  const copied = [];
  const unpacked = [];
  for (const p of paths) {
    const abs = resolve(root, p);
    if (!existsSync(abs)) throw new Error(`import: ${p} does not exist`);
    const dest = join(out, basename(abs));
    cpSync(abs, dest, { recursive: true });
    copied.push(posix(relative(root, dest)));
    if (extname(abs).toLowerCase() === '.zip') {
      const into = join(out, basename(abs, extname(abs)));
      mkdirSync(into, { recursive: true });
      const tar = spawnSync('tar', ['-xf', dest, '-C', into], { encoding: 'utf8', windowsHide: true });
      const ok = tar.status === 0 || spawnSync('unzip', ['-q', dest, '-d', into], { windowsHide: true }).status === 0;
      unpacked.push({ zip: posix(relative(root, dest)), into: posix(relative(root, into)), ok });
    }
  }
  return { ok: true, dir: posix(relative(root, out)), copied, unpacked };
}

// ---------------------------------------------------------------- track

function gitIgnoreSource(root, rel) {
  const r = spawnSync('git', ['-C', root, 'check-ignore', '-v', '--no-index', rel], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const m = /^(.*?):(\d+):(.*?)\t/.exec(r.stdout);
  return m ? { file: m[1], line: Number(m[2]), pattern: m[3] } : null;
}

function track(root, f) {
  const repo = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (repo.status !== 0) return { ok: false, error: `${posix(root)} is not a git repository` };
  const probe = gitIgnoreSource(root, '.ai/design/current.md');
  const frozen = gitIgnoreSource(root, '.ai/workflows/x/design/r1/boards.json');
  const advice = ignoreAdvice(probe?.pattern ?? null, Boolean(probe || frozen));
  if (!advice.change) return { ok: true, ignored: Boolean(probe || frozen), ...advice, written: false };
  const file = probe?.file ? resolve(root, probe.file) : join(root, '.gitignore');
  if (!f.write) return { ok: true, ignored: true, file: posix(relative(root, file)), line: probe?.line ?? null, ...advice, written: false };
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  if (advice.replace && probe?.line) lines[probe.line - 1] = advice.replace;
  const next = `${lines.join('\n').replace(/\n*$/, '\n')}${advice.block}`;
  writeAtomic(file, next);
  const after = gitIgnoreSource(root, '.ai/design/current.md');
  const afterFrozen = gitIgnoreSource(root, '.ai/workflows/x/design/r1/boards.json');
  return { ok: !after && !afterFrozen, ignored: true, file: posix(relative(root, file)), ...advice, written: true, stillIgnored: [after, afterFrozen].filter(Boolean) };
}

// ---------------------------------------------------------------- main

export async function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, ...rest0] = argv;
  if (!cmd || !rootArg) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  let out;
  try {
    if (cmd === 'track') {
      out = track(root, flags(rest0).f);
    } else {
      const [slug, ...rest] = rest0;
      if (!slug) { process.stderr.write(`${USAGE}\n`); return 2; }
      const { pos, f } = flags(rest);
      switch (cmd) {
        case 'init': out = init(root, slug, f); break;
        case 'render': out = await render(root, slug, pos); break;
        case 'sheet': out = sheet(root, slug); break;
        case 'freeze': out = freeze(root, slug, f); break;
        case 'check': out = check(root, slug); break;
        case 'capture-name': out = captureName(root, slug, pos); break;
        case 'import': out = importSources(root, slug, pos); break;
        default: process.stderr.write(`${USAGE}\n`); return 2;
      }
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
