#!/usr/bin/env node
// skills/imagery/scripts/gen-gemini.mjs
//
// nano-banana (Gemini image model) via @google/genai generateContent.
// EXTERNAL-MODEL-DISPATCH-PLAN §3.2. Default model gemini-3.1-flash-image. The
// dep is LAZY-imported (mirrors today's pip-install-if-missing) — a missing dep
// exits 1 so the skill's fan-out falls through, not crashes. Gemini returns JPEG
// regardless of extension; writeImage() fixes the extension from the bytes (A3).
//
//   node gen-gemini.mjs "<prompt>" <outputBasePath> [1K|2K] [model]
//
// Exit: 0 success (prints final path) · 1 no API key / dep missing · 2 API error · 3 write error.

import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { writeImage, dispatchEnabled } from './_img.mjs';

const DEFAULT_MODEL = 'gemini-3.1-flash-image';

/** Walk the generateContent response parts for the first inline image → Buffer (or null). */
export function extractInlineImage(res) {
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p?.inlineData?.data ?? p?.inline_data?.data;
    if (typeof data === 'string' && data) return Buffer.from(data, 'base64');
  }
  return null;
}

/** The generateContent request config (responseModalities + imageSize tier UPPERCASE). */
export function buildGeminiConfig(tier = '1K') {
  return { responseModalities: ['Text', 'Image'], imageConfig: { imageSize: String(tier).toUpperCase() } };
}

async function main() {
  const [prompt, outBase, tier = '1K', model = DEFAULT_MODEL] = process.argv.slice(2);
  if (!prompt || !outBase) {
    process.stderr.write('usage: node gen-gemini.mjs "<prompt>" <outputBasePath> [1K|2K] [model]\n');
    process.exit(3);
  }
  if (!dispatchEnabled()) {
    process.stderr.write('external-model dispatch is OFF (set externalDispatch.enabled in ~/.sdlc/hub-config.json) — skipping the egress backend\n');
    process.exit(1);
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { process.stderr.write('GEMINI_API_KEY / GOOGLE_API_KEY not set\n'); process.exit(1); }

  let genai;
  try {
    genai = await import('@google/genai');
  } catch {
    process.stderr.write('@google/genai not installed; run: npm i @google/genai\n');
    process.exit(1);
  }

  let buf;
  try {
    const ai = new genai.GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: buildGeminiConfig(tier),
    });
    buf = extractInlineImage(res);
    if (!buf) { process.stderr.write('no inline image in Gemini response\n'); process.exit(2); }
  } catch (err) {
    process.stderr.write(`Gemini request failed: ${String(err?.message || err)}\n`);
    process.exit(2);
  }

  try {
    const { path } = writeImage(buf, outBase);
    process.stdout.write(`${path}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`failed to write image: ${String(err?.message || err)}\n`);
    process.exit(3);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || basename(process.argv[1] || '') === 'gen-gemini.mjs') main();
