#!/usr/bin/env node
/**
 * scripts/build-icon.mjs — rasterize the sunflower mark into committed tray icons.
 *
 * Source of truth: assets/favicon.svg. Emits three state variants × two formats:
 *
 *   assets/app-icon.{ico,png}         up      — full colour
 *   assets/app-icon-down.{ico,png}    down    — desaturated grey (hub stopped)
 *   assets/app-icon-stale.{ico,png}   stale   — amber (version mismatch)
 *
 * `.ico` (multi-size) for the Windows tray helper, `.png` for macOS/Linux. The
 * outputs are COMMITTED binary assets — this script is a one-off regen tool, NOT
 * part of `npm run build`, so sharp's platform-dependent output never enters the
 * dist/ freshness diff. devDeps: sharp + to-ico (not committed — install ad hoc).
 *
 *   npm i -D sharp to-ico && node scripts/build-icon.mjs
 */
import sharp from 'sharp';
import toIco from 'to-ico';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const baseSvg = readFileSync(join(ASSETS, 'favicon.svg'), 'utf-8');

// Recolour by literal hex substitution on the SVG source (deterministic — no
// per-pixel filtering whose output could drift between sharp versions).
const recolor = (svg, map) => Object.entries(map).reduce((s, [a, b]) => s.split(a).join(b), svg);

const VARIANTS = {
  '': baseSvg,
  // down: cool greys, dimmed centre — reads "inactive".
  '-down': recolor(baseSvg, { '#4a6c8c': '#8a9099', '#3e7d4a': '#a7adb4', '#1f1b16': '#6b6b6b' }),
  // stale: amber petals — reads "warning, restart".
  '-stale': recolor(baseSvg, { '#4a6c8c': '#d99a2b', '#3e7d4a': '#c1851f' }),
};

const ICO_SIZES = [256, 48, 32, 16];

for (const [suffix, svg] of Object.entries(VARIANTS)) {
  const buf = Buffer.from(svg);
  const pngs = await Promise.all(ICO_SIZES.map((sz) => sharp(buf).resize(sz, sz).png().toBuffer()));
  writeFileSync(join(ASSETS, `app-icon${suffix}.ico`), await toIco(pngs));
  writeFileSync(join(ASSETS, `app-icon${suffix}.png`), await sharp(buf).resize(32, 32).png().toBuffer());
  console.log(`[icon] app-icon${suffix}.{ico,png}`);
}
