// The checks of the screens, before an approval: contrast, target size, viewport fit and
// worst-case content, in each viewport and each state. A headless Chromium opens each screen
// page over the DevTools protocol, and a script in the page measures it.
//
// Each failure names its screen, check, viewport and state, a message, the box of the element
// on the page, and the move that fixes it. The result goes to `_design/checks.json` in the
// records; the canvas draws the boxes, and the approval question shows each failure.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserCandidates } from '../scripts/design-boards.mjs';
import { readChecks, writeChecks } from './design-records.mjs';
import { STATES, listScreens, parseViewport, readManifest, screenFile } from './design-surface.mjs';

/** The check of a failure → the move that fixes it (design/<move>.md). */
export const CHECK_MOVES = Object.freeze({ contrast: 'colorize', 'target-size': 'adapt', 'viewport-fit': 'layout', 'worst-case': 'harden', states: 'harden' });
/** One rule for target size: a pointer target is at least 24 by 24 CSS pixels. */
export const MIN_TARGET = 24;
const START_MS = 15000;
const STEP_MS = 15000;
const MAX_PER_PAGE = 40;

/* ───────────────────────── the page script ───────────────────────── */

// Runs in the screen page. It returns `[{ check, message, rect, selector }]`.
function pageChecks(minTarget, worst) {
  const out = [];
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => {
    if (!c || c === 'transparent') return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000'; ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const selector = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})` : n.tagName.toLowerCase());
    }
    return parts.join(' > ');
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const add = (check, el, message) => out.push({ check, message, rect: box(el), selector: selector(el) });

  // The background under an element: its layers composited down to white. Null when an image
  // or a gradient is in the way, because no single color is the background then.
  const background = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255, 1]);
  };

  // Contrast: WCAG AA, 4.5:1, or 3:1 for large text.
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (!shown(el)) continue;
    const own = [...el.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    const bg = background(el);
    if (!bg) continue;
    const fg = over(rgba(cs.color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio + 1e-9 < need) {
      const key = `${hex(fg)}/${hex(bg)}/${need}`;
      if (seen.has(key) && seen.size > 12) continue;
      seen.add(key);
      add('contrast', el, `The text ${hex(fg)} on ${hex(bg)} is ${ratio.toFixed(2)}:1; ${need}:1 is the minimum for ${large ? 'large' : 'body'} text`);
    }
  }

  // Target size: one rule, at least minTarget by minTarget CSS pixels. A link inside running
  // text is exempt.
  const targets = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [onclick]';
  for (const el of document.body.querySelectorAll(targets)) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= minTarget - 0.5 && r.height >= minTarget - 0.5) continue;
    const cs = getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue;
    add('target-size', el, `The target is ${Math.round(r.width)}×${Math.round(r.height)} px; ${minTarget}×${minTarget} px is the minimum`);
  }

  // Viewport fit: no horizontal scroll at this width.
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > width + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => shown(el) && el.getBoundingClientRect().right > width + 1)
      .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)));
    for (const el of wide.slice(0, 5)) add('viewport-fit', el, `The element ends at ${Math.round(el.getBoundingClientRect().right)} px, past the ${width} px viewport`);
    if (!wide.length) add('viewport-fit', document.body, `The page is ${document.documentElement.scrollWidth} px wide, past the ${width} px viewport`);
  }

  // Worst-case content: in the worst state, no text is cut off by a box that hides overflow.
  if (worst) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      const clipX = /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
      const clipY = /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && cs.webkitLineClamp === 'none';
      if (clipX || clipY) add('worst-case', el, `The content is cut off: ${el.scrollWidth}×${el.scrollHeight} px in a ${el.clientWidth}×${el.clientHeight} px box with hidden overflow`);
    }
  }
  return out;
}

/* ───────────────────────── the browser ───────────────────────── */

function killTree(pid) {
  if (platform() === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
}

/** The first browser that can run the checks: a Chromium or a headless shell, not a script. */
export function checkBrowser(root, env = process.env) {
  return browserCandidates(root, env).find((b) => b.kind === 'chromium' || b.kind === 'shell') ?? null;
}

async function startBrowser(browser, { noSandbox }) {
  const profile = mkdtempSync(join(tmpdir(), 'sdlc-check-'));
  const args = [
    ...(browser.kind === 'chromium' ? ['--headless=new'] : []),
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    // Under some sandboxes (Codex on Windows) Chromium crashes at start without this flag. It
    // turns off the renderer sandbox, so only the local screen pages are ever opened.
    ...(noSandbox ? ['--no-sandbox'] : []),
    'about:blank',
  ];
  const child = spawn(browser.path, args, { stdio: 'ignore', windowsHide: true, detached: platform() !== 'win32' });
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', () => { exited = true; });
  const portFile = join(profile, 'DevToolsActivePort');
  const until = Date.now() + START_MS;
  while (Date.now() < until && !exited) {
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (port && path) return { child, profile, url: `ws://127.0.0.1:${port}${path}` };
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  killTree(child.pid);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser can hold it a moment */ }
  return null;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.calls = new Map();
    this.waits = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'));
      if (m.id && this.calls.has(m.id)) {
        const { ok, no } = this.calls.get(m.id);
        this.calls.delete(m.id);
        if (m.error) no(new Error(m.error.message)); else ok(m.result);
        return;
      }
      this.waits = this.waits.filter((w) => !(w.method === m.method && w.session === m.sessionId && (w.ok(m.params), true)));
    });
  }
  send(method, params = {}, sessionId = undefined) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      this.calls.set(id, { ok, no });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  once(method, session, ms = STEP_MS) {
    return new Promise((ok, no) => {
      const w = { method, session, ok: (p) => { clearTimeout(t); ok(p); } };
      const t = setTimeout(() => { this.waits = this.waits.filter((x) => x !== w); no(new Error(`no ${method} in ${ms} ms`)); }, ms);
      this.waits.push(w);
    });
  }
}

/** Open a browser for the checks. Returns `{ open(url, viewport), evaluate, screenshot, close }`, or null. */
export async function openBrowser(root, { browser = checkBrowser(root) } = {}) {
  if (!browser) return null;
  const started = (await startBrowser(browser, { noSandbox: false })) ?? (await startBrowser(browser, { noSandbox: true }));
  if (!started) return null;
  const ws = new WebSocket(started.url);
  await new Promise((ok, no) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', () => no(new Error('the browser refused the DevTools connection')), { once: true }); });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    browser,
    async open(url, { width, height }) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
      const loaded = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url }, sessionId);
      await loaded;
      await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
    },
    evaluate,
    async screenshot() {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      return Buffer.from(data, 'base64');
    },
    async close() {
      try { await Promise.race([cdp.send('Browser.close'), new Promise((ok) => setTimeout(ok, 2000))]); } catch { /* it closed */ }
      try { ws.close(); } catch { /* closed */ }
      killTree(started.child.pid);
      await new Promise((ok) => setTimeout(ok, 200));
      try { rmSync(started.profile, { recursive: true, force: true }); } catch { /* the browser can hold it a moment */ }
    },
  };
}

/* ───────────────────────── the run ───────────────────────── */

const screenUrl = (root, key, state) => `${pathToFileURL(screenFile(root, key)).href}?state=${state}`;

/** The viewports of the surface: `[{ name, width, height }]`. */
export function surfaceViewports(root) {
  return Object.entries(readManifest(root).viewports).map(([name, v]) => ({ name, ...parseViewport(v) }));
}

/**
 * Check the screens. `keys` limits the run; `workflow` checks the screens of one workflow.
 * The result keeps the failures of the screens that this run did not check.
 */
export async function runChecks(root, { keys = null, workflow = null, now = new Date(), browser = undefined } = {}) {
  let screens = listScreens(root, { workflow });
  if (keys?.length) {
    const unknown = keys.filter((k) => !screens.some((s) => s.key === k));
    if (unknown.length) throw new Error(`no screen ${unknown.join(', ')}`);
    screens = screens.filter((s) => keys.includes(s.key));
  }
  if (!screens.length) throw new Error('no screen to check');
  const failures = [];
  for (const s of screens) {
    const missing = STATES.filter((st) => !s.states.includes(st));
    if (!s.exists) failures.push({ screen: s.key, check: 'states', viewport: null, state: null, message: 'The screen page is missing', rect: null, move: CHECK_MOVES.states });
    else if (missing.length) failures.push({ screen: s.key, check: 'states', viewport: null, state: null, message: `The page has no ${missing.join(', ')} state`, rect: null, move: CHECK_MOVES.states });
  }
  const b = await openBrowser(root, browser === undefined ? {} : { browser });
  if (!b) {
    return { at: now.toISOString(), ran: false, reason: 'no browser can run the checks: install Chrome, Edge or Chromium, or set SDLC_BROWSER', passed: false, screens: screens.map((s) => s.key), failures };
  }
  try {
    const script = `(${pageChecks.toString()})`;
    for (const s of screens.filter((x) => x.exists)) {
      for (const vp of surfaceViewports(root)) {
        for (const state of s.states) {
          await b.open(screenUrl(root, s.key, state), vp);
          const found = await b.evaluate(`${script}(${MIN_TARGET}, ${JSON.stringify(state === 'worst')})`);
          for (const f of (found ?? []).slice(0, MAX_PER_PAGE)) failures.push({ screen: s.key, viewport: vp.name, state, ...f, move: CHECK_MOVES[f.check] ?? null });
        }
      }
    }
  } finally { await b.close(); }
  const checked = new Set(screens.map((s) => s.key));
  const before = readChecks(root);
  const kept = (before?.failures ?? []).filter((f) => !checked.has(f.screen));
  const result = {
    at: now.toISOString(), ran: true, browser: b.browser.path,
    screens: [...new Set([...(before?.screens ?? []), ...checked])].sort(),
    passed: failures.length + kept.length === 0,
    failures: [...kept, ...failures],
  };
  writeChecks(root, result);
  return { ...result, checked: [...checked], new: failures };
}

/** One picture per screen, in the default state at one viewport. Returns `{ key: Buffer }`, or null with no browser. */
export async function captureScreens(root, keys, { viewport = null, browser = undefined } = {}) {
  const vps = surfaceViewports(root);
  const vp = vps.find((v) => v.name === viewport) ?? vps.find((v) => v.name === 'desktop') ?? vps[0];
  const b = await openBrowser(root, browser === undefined ? {} : { browser });
  if (!b) return null;
  const out = {};
  try {
    for (const key of keys) {
      await b.open(screenUrl(root, key, 'default'), vp);
      out[key] = await b.screenshot();
    }
  } finally { await b.close(); }
  return out;
}

/** The failures as lines for a person: one per failure, with its move. */
export function failureLines(failures) {
  return failures.map((f) => `${f.screen}${f.viewport ? ` (${f.viewport}, ${f.state})` : ''}: ${f.check}: ${f.message}${f.move ? ` — move: ${f.move}` : ''}`);
}
