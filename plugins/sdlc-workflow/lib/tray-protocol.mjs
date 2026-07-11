// lib/tray-protocol.mjs
//
// A minimal stdio driver for the systray2 Go helper binary, replacing the
// systray2 npm package's JS entirely (docs/internal/archived/TRAY-APP-PLAN.md risk #1). The package's
// own binary resolver is cwd/__dirname-bound and breaks once esbuild bundles it;
// owning the ~120-line protocol here also drops its heavy request/fs-extra deps
// from the shipped bundle. We speak the SAME line-delimited JSON the vendored
// binary expects, so the identical binary works.
//
// Wire protocol (verified against the vendored binary's strings + the
// systray-portable fork source it was built from — NOT the systray2 JS docs,
// which describe an `update-menu` full re-render this binary does not have):
//   • helper → us:  one JSON object per stdout line. `{type:'ready'}` once at
//     startup, then `{type:'clicked', __id, …}` per menu click.
//   • us → helper:  the initial menu as a bare JSON object. After that the ONLY
//     mutations the helper understands are PER-ITEM:
//       `{type:'update-item', seq_id:-1, item}`          — retitle/recheck ONE item
//       `{type:'update-item-and-menu', seq_id:-1, item, menu}` — ditto + tray
//         chrome (icon/title/tooltip); `menu` here is chrome only, items ignored
//       `{type:'exit'}`                                   — quit
//     `seq_id:-1` makes the helper resolve the target from `item.__id`. There is
//     NO way to add or remove items after startup — structural changes need a
//     helper respawn (restart()). update() diffs against the last-rendered tree,
//     sends per-item updates when the shape is unchanged, and returns false when
//     the caller must respawn instead.
//   • Every item carries a numeric `__id` (depth-first, 1-based) so a click maps
//     back to its handler. Linux has no native checkmarks, so a `(√)` suffix is
//     appended to checked titles there (mirrors systray2).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Sentinel item the helper renders as a divider. */
export const SEPARATOR = Object.freeze({ title: '<SEPARATOR>', tooltip: '', enabled: true });

const CHECK = ' (√)';

// Build the JSON-serializable wire tree from caller items WITHOUT mutating them
// (the originals may be frozen, e.g. SEPARATOR, or shared across renders). Each
// wire node gets a depth-first 1-based __id; the map keys that id back to the
// ORIGINAL item so a click can fire its onClick. Functions are dropped.
function buildWire(items, ctx) {
  return items.map((item) => {
    const id = ctx.counter++;
    ctx.map.set(id, item);
    const out = {
      title: item.title,
      tooltip: item.tooltip ?? '',
      checked: item.checked ?? false,
      enabled: item.enabled === undefined ? true : item.enabled,
      hidden: item.hidden ?? false,
      __id: id,
    };
    if (item.icon) out.icon = item.icon;
    if (item.isTemplateIcon) out.isTemplateIcon = item.isTemplateIcon;
    if (Array.isArray(item.items)) out.items = buildWire(item.items, ctx);
    return out;
  });
}

// Structural fingerprint of a wire tree: separator-ness + nesting, nothing else.
// Two trees with the same shape get identical depth-first __ids from buildWire,
// which is what makes an in-place per-item diff valid between renders.
function shapeOf(items) {
  return items.map((it) => {
    const kind = it.title === SEPARATOR.title ? 's' : 'i';
    return Array.isArray(it.items) ? `${kind}[${shapeOf(it.items)}]` : kind;
  }).join('');
}

// Collect the wire nodes whose visible fields changed between two SAME-SHAPE
// trees (callers must check shapeOf first). Separators are skipped — the helper
// holds no updatable handle for them.
function diffWire(prev, next, out = []) {
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (b.title !== SEPARATOR.title && (
      a.title !== b.title || a.tooltip !== b.tooltip || a.checked !== b.checked
      || a.enabled !== b.enabled || a.hidden !== b.hidden
      || (a.icon ?? '') !== (b.icon ?? '') || (a.isTemplateIcon ?? false) !== (b.isTemplateIcon ?? false)
    )) out.push(b);
    if (Array.isArray(b.items)) diffWire(a.items, b.items, out);
  }
  return out;
}

function firstRealItem(items) {
  for (const it of items) {
    if (it.title !== SEPARATOR.title) return it;
  }
  return null;
}

function applyLinuxChecks(items, platform) {
  if (platform !== 'linux') return;
  for (const item of items) {
    if (item.title && item.title !== SEPARATOR.title) {
      const has = item.title.endsWith(CHECK);
      if (item.checked && !has) item.title += CHECK;
      else if (!item.checked && has) item.title = item.title.slice(0, -CHECK.length);
    }
    if (Array.isArray(item.items)) applyLinuxChecks(item.items, platform);
  }
}

export class Tray {
  /**
   * @param {{ binPath:string, menu:object, debug?:boolean, platform?:string }} opts
   *   menu = { icon, title, tooltip, isTemplateIcon, items:[{title,tooltip,checked,
   *            enabled,hidden,icon,items,onClick}] } — icon is a base64 string.
   */
  constructor({ binPath, menu, debug = false, platform = process.platform, spawn: spawnFn = spawn }) {
    this.binPath = binPath;
    this.menu = menu;
    this.debug = debug;
    this.platform = platform;
    this._spawn = spawnFn;   // injectable for tests; defaults to node:child_process spawn
    this.map = new Map();
    this.proc = null;
    this.rl = null;
    this._pending = null;   // in-flight spawn promise — serializes start/restart, defers update
    this._lastWire = null;    // wire tree last rendered on the helper (diff base for update)
    this._lastChrome = null;  // tray icon/title/tooltip last rendered
    this._exitCbs = [];
    this._errorCbs = [];
  }

  /** Spawn the helper and send the menu once it reports ready. Resolves then. */
  start() {
    return this._track(this._spawnAndWait());
  }

  // Publish an in-flight spawn on `_pending` and clear it on settle. While a
  // spawn is pending, restart() piggybacks on it and update() defers — the ready
  // handler reads `this.menu` at send time, so the freshest menu always wins.
  _track(promise) {
    this._pending = promise.finally(() => { this._pending = null; });
    // The extra .finally link is what callers await; keep rejections flowing.
    return this._pending;
  }

  // Spawn one helper process, wire its stdio, and resolve when it reports ready.
  // Shared by start() and restart(); the latter tears down the previous process
  // first. Each process carries its own readline on `_rl` so a restart can close
  // the old reader without leaking it, and a `_replacing` flag so a process we are
  // deliberately swapping out does NOT fire the driver-level exit callbacks (which
  // call process.exit — that would take the whole tray down on every restart).
  _spawnAndWait() {
    return new Promise((resolve, reject) => {
      let proc;
      try { proc = this._spawn(this.binPath, [], { windowsHide: true }); }
      catch (err) { reject(err); return; }
      this.proc = proc;
      // Drain stderr so a chatty helper can't fill the OS pipe buffer and block.
      proc.stderr?.resume();
      let settled = false;
      proc.on('error', (err) => {
        if (proc._replacing) return;
        this._errorCbs.forEach((cb) => cb(err));
        if (!settled) { settled = true; reject(err); }
      });
      proc.on('exit', (code) => {
        if (proc._replacing) return;   // a deliberate swap — not a real helper death
        this._exitCbs.forEach((cb) => cb(code));
        // If the helper dies before emitting `ready` (crash, missing libs, arch
        // mismatch), settle the start() promise instead of hanging forever.
        if (!settled) { settled = true; reject(new Error(`tray helper exited (code ${code}) before becoming ready`)); }
      });
      proc._rl = createInterface({ input: proc.stdout });
      this.rl = proc._rl;
      proc._rl.on('line', (line) => {
        const wasReady = this._onLine(line);
        if (wasReady && !settled) { settled = true; resolve(this); }
      });
    });
  }

  /**
   * Replace the running helper with a fresh process and render `menu` on it. The
   * native helper's `update-menu` path is unreliable for large structural changes
   * (notably the down→up transition, where the item count grows) — a clean
   * respawn always renders correctly. Tears the old process down WITHOUT firing
   * the driver's exit handlers, so the tray keeps running. Resolves once the new
   * helper is ready; rejects if it never comes up (caller can fall back to update).
   */
  async restart(menu) {
    if (menu) this.menu = menu;
    // A spawn is already in flight (an earlier restart, or start itself): don't
    // tear it down and race a second helper — piggyback on it. Both callers share
    // one settlement, so no promise is ever abandoned by rapid icon flapping. The
    // follow-up update closes the microtask race where the spawn went ready (and
    // rendered the previous menu) just before this menu landed.
    if (this._pending) {
      return this._pending.then((res) => {
        this.update();   // no-op diff unless the menu changed after ready fired
        return res;
      });
    }
    const old = this.proc;
    if (old) {
      old._replacing = true;                                  // suppress its exit/error propagation
      try { old._rl?.close(); } catch { /* already closed */ }
      try { old.stdin?.writable && old.stdin.write(`${JSON.stringify({ type: 'exit' })}\n`); } catch { /* helper gone */ }
      setTimeout(() => { try { old.kill(); } catch { /* already gone */ } }, 250).unref?.();
    }
    return this._track(this._spawnAndWait());
  }

  // Build the wire tree for this.menu into `map` (click routing). Kept separate
  // from _menuObject so update() can build into a THROWAWAY map and only commit
  // it when the render actually happens in place.
  _buildItems(map) {
    const items = buildWire(this.menu.items, { counter: 1, map });
    applyLinuxChecks(items, this.platform);   // mutates the wire copies, not the originals
    return items;
  }

  _chromeObject() {
    return {
      icon: this.menu.icon ?? '',
      title: this.menu.title ?? '',
      tooltip: this.menu.tooltip ?? '',
      isTemplateIcon: this.menu.isTemplateIcon ?? false,
    };
  }

  _menuObject() {
    this.map = new Map();
    return { ...this._chromeObject(), items: this._buildItems(this.map) };
  }

  _write(obj) {
    if (!this.proc || !this.proc.stdin?.writable) return;
    const line = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (this.debug) console.error('[tray→]', line.slice(0, 160));
    try { this.proc.stdin.write(`${line.trim()}\n`); } catch { /* helper gone */ }
  }

  _onLine(line) {
    let action;
    try { action = JSON.parse(line); } catch { return false; }
    if (this.debug) console.error('[tray←]', line.slice(0, 160));
    if (action.type === 'ready') {
      const m = this._menuObject();
      this._write(m);                    // initial menu is sent as a bare object
      this._lastWire = m.items;          // diff base for subsequent in-place updates
      this._lastChrome = { icon: m.icon, title: m.title, tooltip: m.tooltip, isTemplateIcon: m.isTemplateIcon };
      return true;
    }
    if (action.type === 'clicked') {
      const item = this.map.get(action.__id);
      if (item && typeof item.onClick === 'function') {
        try { item.onClick(item); } catch (err) { this._errorCbs.forEach((cb) => cb(err)); }
      }
    }
    return false;
  }

  /**
   * Re-render the tray IN PLACE via per-item diffs — the only mutation the
   * helper supports (see the wire-protocol note atop this file; the old
   * whole-menu `update-menu` message was silently ignored by the binary, which
   * is why nothing ever updated dynamically). Diffs the new menu against the
   * last-rendered wire tree and sends `update-item` per changed node; a tray
   * chrome change (icon/tooltip/title) rides the first one as
   * `update-item-and-menu`. Returns TRUE when handled (including no-ops and
   * deferrals onto an in-flight spawn) and FALSE when the menu SHAPE changed —
   * items cannot be added/removed in place, the caller must restart() instead.
   */
  update(menu) {
    if (menu) this.menu = menu;
    // A helper that hasn't reported ready must not receive item updates before
    // its initial bare menu — defer until the spawn settles; ready renders
    // this.menu itself, so the chase is usually a no-op diff.
    if (this._pending) {
      this._pending.then(() => { this.update(); }).catch(() => {});
      return true;
    }
    if (!this._lastWire) return false;   // nothing rendered yet — need a full spawn
    const map = new Map();
    const items = this._buildItems(map);
    if (shapeOf(items) !== shapeOf(this._lastWire)) return false;   // structural — respawn
    const updates = diffWire(this._lastWire, items);
    const chrome = this._chromeObject();
    const chromeDirty = !this._lastChrome || JSON.stringify(chrome) !== JSON.stringify(this._lastChrome);
    this.map = map;   // same shape ⇒ same __ids — commit fresh click handlers
    this._lastWire = items;
    if (updates.length || chromeDirty) {
      if (chromeDirty) {
        // updateItem is idempotent, so an unchanged carrier item is harmless.
        const carrier = updates.shift() ?? firstRealItem(items);
        if (carrier) this._write({ type: 'update-item-and-menu', seq_id: -1, item: carrier, menu: chrome });
        this._lastChrome = chrome;
      }
      for (const node of updates) this._write({ type: 'update-item', seq_id: -1, item: node });
    }
    return true;
  }

  onExit(cb) { this._exitCbs.push(cb); }
  onError(cb) { this._errorCbs.push(cb); }

  /** Ask the helper to quit, then force-kill if it lingers. */
  kill() {
    this._write({ type: 'exit' });
    setTimeout(() => { try { this.proc?.kill(); } catch { /* already gone */ } }, 250).unref?.();
  }
}
