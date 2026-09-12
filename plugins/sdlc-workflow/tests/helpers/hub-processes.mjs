// tests/helpers/hub-processes.mjs — the hub daemons alive on this machine, for
// the run-level guard in tests/unit/state-dir-guard.test.mjs.
//
// Imported by tests/run-all.mjs (records the baseline before the suite) and by
// the guard (compares after it). Not a test.
//
// A test that reaches the real supervisor without a private port reaps the
// operator's hub and leaves a detached sandbox hub behind; a live test whose
// cleanup misses its hub leaves a zombie on its port that fails every later run.
// Both are invisible to the ~/.sdlc fingerprint, so the guard also compares (a)
// the pid that owns the operator's hub port and (b) the set of hub-serve
// processes, before and after the suite. Listing is best-effort: null means
// "cannot list here", and the guard skips instead of guessing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { portOwner } from '../../lib/port-owner.mjs';

export const HUB_DEFAULT_PORT_FALLBACK = 48173;

/** The port the operator's real hub uses: ~/.sdlc/hub-config.json, else the canonical default. */
export function operatorHubPort(stateDir = join(homedir(), '.sdlc')) {
  try {
    const cfg = JSON.parse(readFileSync(join(stateDir, 'hub-config.json'), 'utf-8'));
    const port = Number(cfg?.port);
    if (Number.isInteger(port) && port > 0) return port;
  } catch { /* no config → default */ }
  return HUB_DEFAULT_PORT_FALLBACK;
}

/** The pid listening on `port`, or null when nothing (or when unknowable). */
export function portOwnerPid(port) {
  return portOwner(port)?.pid ?? null;
}

/**
 * Every process whose command line runs a `hub-serve.mjs`, as
 * `[{ pid, commandLine }]` sorted by pid. Returns null when the platform
 * listing is unavailable, so a caller can skip rather than fail.
 */
export function listHubServeProcesses({ platform = process.platform, exec = spawnSync } = {}) {
  try {
    let rows = [];
    if (platform === 'win32') {
      const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
      const r = exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf-8', windowsHide: true, timeout: 20_000 });
      if (r.status !== 0 || !r.stdout) return null;
      const text = r.stdout.trim();
      if (!text) return [];
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      rows = list.map((x) => ({ pid: Number(x.ProcessId), commandLine: String(x.CommandLine ?? '') }));
    } else {
      const r = exec('ps', ['-eo', 'pid=,args='], { encoding: 'utf-8', timeout: 10_000 });
      if (r.status !== 0 || !r.stdout) return null;
      rows = r.stdout.split('\n').map((line) => {
        const m = /^\s*(\d+)\s+(.*)$/.exec(line);
        return m ? { pid: Number(m[1]), commandLine: m[2] } : null;
      }).filter(Boolean);
    }
    return rows
      .filter((x) => Number.isInteger(x.pid) && x.pid > 0 && /hub-serve\.mjs/i.test(x.commandLine))
      .sort((a, b) => a.pid - b.pid);
  } catch {
    return null;
  }
}

/** The pids in `after` that were not in `before` (both `[{pid}]`; null → []). */
export function newHubProcesses(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return [];
  const seen = new Set(before.map((x) => x.pid));
  return after.filter((x) => !seen.has(x.pid));
}

/** Everything the guard compares, as one JSON-able object. */
export function hubBaseline(stateDir = join(homedir(), '.sdlc')) {
  const port = operatorHubPort(stateDir);
  return {
    port,
    ownerPid: portOwnerPid(port),
    hubProcesses: listHubServeProcesses(),
    ...(existsSync(stateDir) ? {} : { noStateDir: true }),
  };
}
