// lib/tray-protocol.mjs
//
// A minimal stdio driver for the systray2 Go helper binary, replacing the
// systray2 npm package's JS entirely (TRAY-APP-PLAN.md risk #1). The package's
// own binary resolver is cwd/__dirname-bound and breaks once esbuild bundles it;
// owning the ~120-line protocol here also drops its heavy request/fs-extra deps
// from the shipped bundle. We speak the SAME line-delimited JSON the vendored
// binary expects, so the identical binary works.
//
// Wire protocol (observed from systray2/index.js):
//   • helper → us:  one JSON object per stdout line. `{type:'ready'}` once at
//     startup, then `{type:'clicked', __id, …}` per menu click.
//   • us → helper:  the initial menu as a bare JSON object; thereafter
//     `{type:'update-menu', menu}` to re-render and `{type:'exit'}` to quit.
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
  constructor({ binPath, menu, debug = false, platform = process.platform }) {
    this.binPath = binPath;
    this.menu = menu;
    this.debug = debug;
    this.platform = platform;
    this.map = new Map();
    this.proc = null;
    this.rl = null;
    this._exitCbs = [];
    this._errorCbs = [];
  }

  /** Spawn the helper and send the menu once it reports ready. Resolves then. */
  start() {
    return new Promise((resolve, reject) => {
      let proc;
      try { proc = spawn(this.binPath, [], { windowsHide: true }); }
      catch (err) { reject(err); return; }
      this.proc = proc;
      let settled = false;
      proc.on('error', (err) => {
        this._errorCbs.forEach((cb) => cb(err));
        if (!settled) { settled = true; reject(err); }
      });
      proc.on('exit', (code) => this._exitCbs.forEach((cb) => cb(code)));
      this.rl = createInterface({ input: proc.stdout });
      this.rl.on('line', (line) => {
        const wasReady = this._onLine(line);
        if (wasReady && !settled) { settled = true; resolve(this); }
      });
    });
  }

  _menuObject() {
    this.map = new Map();
    const items = buildWire(this.menu.items, { counter: 1, map: this.map });
    applyLinuxChecks(items, this.platform);   // mutates the wire copies, not the originals
    return {
      icon: this.menu.icon ?? '',
      title: this.menu.title ?? '',
      tooltip: this.menu.tooltip ?? '',
      isTemplateIcon: this.menu.isTemplateIcon ?? false,
      items,
    };
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
      this._write(this._menuObject());   // initial menu is sent as a bare object
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

  /** Re-render the tray (icon + all items). Pass a new menu or mutate `this.menu`. */
  update(menu) {
    if (menu) this.menu = menu;
    this._write({ type: 'update-menu', menu: this._menuObject() });
  }

  onExit(cb) { this._exitCbs.push(cb); }
  onError(cb) { this._errorCbs.push(cb); }

  /** Ask the helper to quit, then force-kill if it lingers. */
  kill() {
    this._write({ type: 'exit' });
    setTimeout(() => { try { this.proc?.kill(); } catch { /* already gone */ } }, 250);
  }
}
