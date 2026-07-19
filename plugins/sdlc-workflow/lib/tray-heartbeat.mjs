// lib/tray-heartbeat.mjs
//
// Liveness heartbeat for the system-tray DRIVER process (scripts/tray.mjs). The
// driver polls the hub every POLL_MS (5s) and pushes menu/icon updates to the
// native systray binary; that poll IS the tray's only liveness. If it wedges —
// an event-loop stall across a sleep/resume, or a silently-dropped stdio link to
// the helper — the driver keeps running on the CURRENT bundle yet shows a frozen,
// stale status. The version-keyed live-process heal (lib/tray-lifecycle.mjs
// reconcileRunningTray) reads that tray as "current bundle → unchanged" and never
// recovers it: liveness ≠ display freshness.
//
// This module is the missing liveness signal. The driver stamps `lastPollAt` on
// every poll; the heal reaps + respawns a current-bundle tray whose stamp has
// gone cold. It mirrors how the hub already uses pid-file/health freshness for the
// same job (lib/hub-lifecycle.mjs). The staleness decision (isTrayHeartbeatStale)
// is PURE and the I/O sits behind injectable seams, so both consumers stay
// unit-testable without a real tray or filesystem.

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { sdlcHomeDir } from './registry.mjs';

// Comfortably larger than the driver's 5s POLL_MS: a live tray re-stamps every
// 5s, so only a poll dead for >1min is judged wedged. Generous enough that a tray
// briefly behind right after a resume (its overdue timer fires within ms of wake,
// re-stamping well before any session-start heal scans) is never mistaken for it.
export const TRAY_HEARTBEAT_STALE_MS = 60_000;

/** Path to the single machine-wide tray heartbeat file. */
export function trayHeartbeatPath(homeDir = sdlcHomeDir()) {
  return join(homeDir, 'tray.heartbeat.json');
}

/**
 * Stamp the driver's liveness AND its last-computed display truth. Best-effort:
 * never throws (a heartbeat write must never crash the tray's poll loop). `pid`
 * is the driver process; `bundle` its launched tray.mjs path (diagnostic — the
 * heal matches on pid). `iconState`/`summary` record what the driver's most
 * recent poll COMPUTED (not what the native helper rendered — that is opaque);
 * the display-wedge heal (lib/tray-lifecycle.mjs) reads `iconState` to catch a
 * driver stuck computing 'down' while the hub is actually up. Returns whether the
 * write succeeded. Every I/O seam is injectable for tests.
 */
export function writeTrayHeartbeat({ pid, bundle, iconState, summary, now = Date.now(), homeDir, writeFile = writeFileSync } = {}) {
  try {
    const path = trayHeartbeatPath(homeDir ?? sdlcHomeDir());
    const rec = { pid, bundle, lastPollAt: now };
    if (iconState !== undefined) rec.iconState = iconState;
    if (summary !== undefined) rec.summary = summary;
    writeFile(path, `${JSON.stringify(rec)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the heartbeat file — the deliberate-Quit signal. A crashed or reaped
 * driver cannot run this, so "heartbeat exists but no tray process" reads as a
 * crash and the heal revives the tray (lib/tray-lifecycle.mjs); a menu Quit
 * clears the stamp first and stays quit. Best-effort, never throws.
 */
export function clearTrayHeartbeat({ homeDir, rm = rmSync } = {}) {
  try {
    rm(trayHeartbeatPath(homeDir ?? sdlcHomeDir()), { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Read the heartbeat record, or null when absent / unreadable / malformed. */
export function readTrayHeartbeat({ homeDir, readFile = readFileSync } = {}) {
  try {
    const rec = JSON.parse(readFile(trayHeartbeatPath(homeDir ?? sdlcHomeDir()), 'utf-8'));
    return rec && typeof rec === 'object' ? rec : null;
  } catch {
    return null;
  }
}

/**
 * PURE: is this running tray wedged per the heartbeat? True ONLY when the stamp
 * exists, belongs to THIS pid, and is older than `stalenessMs`. A missing stamp,
 * a pid mismatch (a different/older tray, or a current tray that hasn't written
 * its first stamp yet), or a non-finite time all read as NOT stale — the heal
 * stays conservative and never reaps a tray it cannot prove is wedged.
 */
export function isTrayHeartbeatStale(tray, heartbeat, { now = Date.now(), stalenessMs = TRAY_HEARTBEAT_STALE_MS } = {}) {
  if (!tray || !heartbeat) return false;
  if (Number(heartbeat.pid) !== Number(tray.pid)) return false;
  const last = Number(heartbeat.lastPollAt);
  if (!Number.isFinite(last)) return false;
  return now - last > stalenessMs;
}

/**
 * PURE: does this LIVE tray's most recent poll show a 'down' display? True ONLY
 * when the stamp belongs to THIS pid, its poll is FRESH (not heartbeat-stale — the
 * driver's poll loop is alive, so this is not the cold-poll case the other heal
 * owns), and the stamped `iconState` is 'down'. It captures a driver whose OWN
 * probe keeps computing 'down'; combined with a live-and-settled hub (checked by
 * the caller), that is a driver-side wedge. A pid mismatch, a stale/absent stamp,
 * or any non-'down' state all read false — the heal stays conservative.
 */
export function heartbeatShowsDown(tray, heartbeat, { now = Date.now(), stalenessMs = TRAY_HEARTBEAT_STALE_MS } = {}) {
  if (!tray || !heartbeat) return false;
  if (Number(heartbeat.pid) !== Number(tray.pid)) return false;
  const last = Number(heartbeat.lastPollAt);
  if (!Number.isFinite(last) || now - last > stalenessMs) return false;  // must be a LIVE poll
  return heartbeat.iconState === 'down';
}
