// lib/port-owner.mjs — who holds a TCP port (WIDE-VIEW-REPAIR-PLAN §14.2.1 + §14.2.4).
//
// Two questions, answered without the hub's own protocol:
//   portHeld({host, port})  — does SOMETHING accept a TCP connection there?
//   portOwner(port)         — which pid listens there? (netstat on win32, lsof elsewhere)
//
// The supervisor asks both before it spawns a hub onto a port that answers TCP
// but not `/__sdlc/health` (a foreign process): it returns `port-held` instead
// of spawning a hub that would die on EADDRINUSE. The doctor and the tray
// tooltip show the same answer. Everything is injectable for the unit tests.

import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

/** Windows `netstat -ano` → LISTENING rows as { proto, local, port, pid }. */
export function parseNetstatListeners(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(TCP|UDP)\s+(\S+?):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m) out.push({ proto: m[1], local: m[2], port: Number(m[3]), pid: Number(m[4]) });
  }
  return out;
}

/** The pid listening on `port`, or null. `exec` is injectable for tests. Never throws. */
export function portOwner(port, { platform = process.platform, exec = spawnSync } = {}) {
  try {
    if (platform === 'win32') {
      const r = exec('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf-8', windowsHide: true, timeout: 10_000 });
      const row = parseNetstatListeners(r.stdout).find((x) => x.port === Number(port));
      return row ? { pid: row.pid, source: 'netstat' } : null;
    }
    const r = exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf-8', timeout: 10_000 });
    const pid = Number(String(r.stdout ?? '').trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? { pid, source: 'lsof' } : null;
  } catch { return null; }
}

/**
 * True when a TCP connection to host:port is accepted within `timeoutMs`.
 * A bound-but-silent listener counts as held; a refused connection does not.
 */
export function portHeld({ host = '127.0.0.1', port, timeoutMs = 400 } = {}) {
  const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch { /* ignore */ } resolve(v); } };
    const sock = connect({ host: probeHost, port: Number(port) });
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}
