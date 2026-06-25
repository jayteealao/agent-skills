#!/usr/bin/env node
// skills/uiproto/scripts/gen-stitch.mjs
//
// Generate a UI screen via Google Stitch (@google/stitch-sdk, LAZY import).
// EXTERNAL-MODEL-DISPATCH-PLAN §3.3/§10. Stitch has NO createProject — a project
// must be pre-created in the Stitch UI and its id supplied as STITCH_PROJECT_ID.
// The SDK is pre-1.0 / "not officially supported" with ~1h token expiry, so this
// is wrapped defensively: any miss exits non-zero and the skill falls through to
// the LLM-HTML path.
//
//   node gen-stitch.mjs "<prompt>" <outHtmlPath>
//
// Env: STITCH_API_KEY, STITCH_PROJECT_ID. Exit: 0 success (prints path) ·
// 1 key/project-id/dep missing → skip · 2 API error · 3 write error.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dispatchEnabled } from './_consent.mjs';

/** Pull the HTML download URL out of a generated screen across plausible SDK shapes. */
export async function screenHtmlUrl(screen) {
  if (!screen) return null;
  if (typeof screen.getHtml === 'function') return await screen.getHtml();
  if (typeof screen.html === 'string') return screen.html;
  if (screen.html && typeof screen.html.url === 'string') return screen.html.url;
  return null;
}

/** A generate() result may be a screen, an array of screens, or { screens: [...] }. */
export function firstScreen(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  if (Array.isArray(result.screens)) return result.screens[0] ?? null;
  return result;
}

async function main() {
  const [prompt, outPath] = process.argv.slice(2);
  if (!prompt || !outPath) {
    process.stderr.write('usage: node gen-stitch.mjs "<prompt>" <outHtmlPath>\n');
    process.exit(3);
  }
  if (!dispatchEnabled()) {
    process.stderr.write('external-model dispatch is OFF (set externalDispatch.enabled in ~/.sdlc/hub-config.json) — skipping Stitch\n');
    process.exit(1);
  }
  const apiKey = process.env.STITCH_API_KEY;
  const projectId = process.env.STITCH_PROJECT_ID;
  if (!apiKey || !projectId) {
    process.stderr.write('STITCH_API_KEY and/or STITCH_PROJECT_ID not set\n');
    process.exit(1);
  }

  let sdk;
  try {
    sdk = await import('@google/stitch-sdk');
  } catch {
    process.stderr.write('@google/stitch-sdk not installed; run: npm i @google/stitch-sdk\n');
    process.exit(1);
  }

  let html;
  try {
    const Stitch = sdk.Stitch || sdk.default;
    const stitch = new Stitch({ apiKey });
    const project = stitch.project(projectId);          // NO createProject (§10)
    const result = await project.generate(prompt);
    const screen = firstScreen(result);
    const url = await screenHtmlUrl(screen);
    if (!url) { process.stderr.write('Stitch returned no HTML for the screen\n'); process.exit(2); }
    // getHtml/getImage return download URLs — fetch the bytes.
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (!res.ok) { process.stderr.write(`Stitch HTML fetch HTTP ${res.status}\n`); process.exit(2); }
      html = await res.text();
    } else {
      html = url; // already inline HTML
    }
    if (!html) { process.stderr.write('empty Stitch HTML\n'); process.exit(2); }
  } catch (err) {
    process.stderr.write(`Stitch request failed: ${String(err?.message || err)}\n`);
    process.exit(2);
  }

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf-8');
    process.stdout.write(`${outPath}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`failed to write HTML: ${String(err?.message || err)}\n`);
    process.exit(3);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || basename(process.argv[1] || '') === 'gen-stitch.mjs') main();
