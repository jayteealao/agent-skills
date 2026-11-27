// The size limits of slices and packets: one place that every reader takes them from.
//
//   maxSteps     the most steps that the plan of one slice has       (slices.maxSteps, default 20)
//   maxSlices    the most open slices that one packet holds          (slices.maxPerPacket, default 14)
//   targetSlices the slice count that a packet aims at               (default 10)
//   budgetSteps  the most steps that one packet holds                (packets.maxSteps, default maxSlices × maxSteps)
//
// A project sets them in `.ai/sdlc-config.json`. A missing or broken config reads as the defaults.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_MAX_STEPS = 20;
export const DEFAULT_MAX_SLICES = 14;
export const DEFAULT_TARGET_SLICES = 10;
export const DEFAULT_MIN_SLICES = 6;

const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : null);

/** The limits of a parsed config object (or of none). */
export function limitsOfConfig(cfg) {
  const s = cfg && typeof cfg.slices === 'object' && cfg.slices ? cfg.slices : {};
  const p = cfg && typeof cfg.packets === 'object' && cfg.packets ? cfg.packets : {};
  const maxSteps = posInt(s.maxSteps) ?? DEFAULT_MAX_STEPS;
  const maxSlices = posInt(s.maxPerPacket) ?? DEFAULT_MAX_SLICES;
  const targetSlices = Math.min(DEFAULT_TARGET_SLICES, maxSlices);
  const minSlices = Math.min(DEFAULT_MIN_SLICES, targetSlices);
  const budgetSteps = posInt(p.maxSteps) ?? maxSlices * maxSteps;
  return { maxSteps, maxSlices, targetSlices, minSlices, budgetSteps };
}

export const DEFAULT_LIMITS = Object.freeze(limitsOfConfig(null));

/** The limits of the project at `root`; the defaults when `root` is null or has no config. */
export function limitsOf(root) {
  if (!root) return { ...DEFAULT_LIMITS };
  const file = join(root, '.ai', 'sdlc-config.json');
  if (!existsSync(file)) return { ...DEFAULT_LIMITS };
  try {
    // A config saved with a byte order mark reads as one without it, as loadConfig reads it.
    return limitsOfConfig(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')));
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

/** `limits` when it is a limits object, else the defaults: a caller may pass nothing. */
export function limitsOr(limits) {
  return limits && Number.isInteger(limits.maxSteps) ? { ...DEFAULT_LIMITS, ...limits } : { ...DEFAULT_LIMITS };
}

/**
 * The step estimate of a slice, from what its scope holds. The model was fitted to measured
 * slices: a fixed cost of 4 steps, 1 per finding, 2 per new behaviour and 1 per behaviour steer
 * that the plan must honour, then 10% for what the scope leaves unsaid.
 */
export function estimateSteps({ findings = 0, behaviours = 0, steers = 0 } = {}) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return Math.ceil((4 + n(findings) + 2 * n(behaviours) + n(steers)) * 1.1);
}
