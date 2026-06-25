#!/usr/bin/env node
// skills/imagery/scripts/gen-openai.mjs
//
// gpt-image-2 via the OpenAI Images REST API (per-token; OPENAI_API_KEY).
// EXTERNAL-MODEL-DISPATCH-PLAN §3.2. Dep-free fetch. gpt-image-2 always returns
// base64 (no URL mode), so we decode b64_json and write bytes (extension fixed
// to the sniffed type — A3).
//
//   node gen-openai.mjs "<prompt>" <outputBasePath> [1K|2K]
//
// Exit: 0 success (prints final path) · 1 OPENAI_API_KEY unset · 2 API error · 3 write error.

import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { writeImage, dispatchEnabled } from './_img.mjs';

/** Map the resolution tier to a gpt-image-2 `size`. */
export function pickSize(tier = '1K') {
  return String(tier).toUpperCase() === '2K' ? '1536x1024' : '1024x1024';
}

export function buildOpenAiImageRequest(prompt, tier, apiKey) {
  return {
    url: 'https://api.openai.com/v1/images/generations',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: pickSize(tier), n: 1 }),
    },
  };
}

/** Pull the base64 image out of an Images API response → Buffer (or null). */
export function decodeImageResponse(json) {
  const b64 = json?.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, 'base64') : null;
}

async function main() {
  const [prompt, outBase, tier = '1K'] = process.argv.slice(2);
  if (!prompt || !outBase) {
    process.stderr.write('usage: node gen-openai.mjs "<prompt>" <outputBasePath> [1K|2K]\n');
    process.exit(3);
  }
  if (!dispatchEnabled()) {
    process.stderr.write('external-model dispatch is OFF (set externalDispatch.enabled in ~/.sdlc/hub-config.json) — skipping the egress backend\n');
    process.exit(1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { process.stderr.write('OPENAI_API_KEY not set\n'); process.exit(1); }

  let buf;
  try {
    const { url, init } = buildOpenAiImageRequest(prompt, tier, apiKey);
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      process.stderr.write(`OpenAI Images HTTP ${res.status}: ${body.slice(0, 400)}\n`);
      process.exit(2);
    }
    buf = decodeImageResponse(await res.json());
    if (!buf) { process.stderr.write('no image data in response\n'); process.exit(2); }
  } catch (err) {
    process.stderr.write(`OpenAI Images request failed: ${String(err?.message || err)}\n`);
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
if (isMain || basename(process.argv[1] || '') === 'gen-openai.mjs') main();
