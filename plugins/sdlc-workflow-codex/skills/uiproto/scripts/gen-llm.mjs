#!/usr/bin/env node
// skills/uiproto/scripts/gen-llm.mjs
//
// Generate ONE self-contained HTML component from a prompt via a REST LLM
// (Vercel AI Gateway / Gemini / OpenAI). EXTERNAL-MODEL-DISPATCH-PLAN §3.3.
// Dep-free fetch; NO CLI, NO repo read, NO isolation needed (the prompt is the
// only input). This is the automatic fallback when Stitch is unavailable.
//
//   node gen-llm.mjs "<prompt>" <outHtmlPath> [provider]
//
// provider: openai | gemini | "<provider>/<model>" (gateway); default = first
// available by key. Exit: 0 success (prints path) · 1 no provider available · 2 API error · 3 write error.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dispatchEnabled } from './_consent.mjs';

const OPENAI_MODEL = process.env.SDLC_UIPROTO_OPENAI_MODEL || 'gpt-5.5';
const GEMINI_MODEL = process.env.SDLC_UIPROTO_GEMINI_MODEL || 'gemini-3-pro';

const SYSTEM = [
  'Emit ONE self-contained HTML component for the request below.',
  'Inline ALL CSS in a single <style>. No external resources, no <link>, no <script src>,',
  'no frameworks, no CDN. Return ONLY the HTML — no explanation, no markdown fence.',
].join(' ');

/** First REST provider that has a key (gateway needs an explicit provider/model token). */
export function resolveLlmProvider(env = process.env, requested = null) {
  if (requested) return requested;
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return 'gemini';
  if (env.AI_GATEWAY_API_KEY) return 'openai/gpt-5.5';
  return null;
}

/** Build the fetch request for a provider. Returns { url, init, parse }. */
export function buildLlmRequest(provider, prompt, { env = process.env } = {}) {
  const full = `${SYSTEM}\n\nRequest: ${prompt}`;
  if (provider === 'gemini') {
    const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: full }] }] }) },
      parse: (j) => (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? '').join(''),
    };
  }
  const gateway = provider.includes('/');
  const url = gateway ? 'https://ai-gateway.vercel.sh/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const token = gateway ? env.AI_GATEWAY_API_KEY : env.OPENAI_API_KEY;
  const model = gateway ? provider : OPENAI_MODEL;
  return {
    url,
    init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: full }] }) },
    parse: (j) => j?.choices?.[0]?.message?.content ?? '',
  };
}

/** Strip a stray ```html … ``` fence if the model wrapped the output. */
export function extractHtml(text) {
  const t = String(text || '').trim();
  const fence = /^```(?:html)?\s*\n([\s\S]*?)\n```$/.exec(t);
  return (fence ? fence[1] : t).trim();
}

async function main() {
  const [prompt, outPath, provider] = process.argv.slice(2);
  if (!prompt || !outPath) {
    process.stderr.write('usage: node gen-llm.mjs "<prompt>" <outHtmlPath> [provider]\n');
    process.exit(3);
  }
  if (!dispatchEnabled()) {
    process.stderr.write('external-model dispatch is OFF (set externalDispatch.enabled in ~/.sdlc/hub-config.json) — skipping the REST LLM\n');
    process.exit(1);
  }
  const chosen = resolveLlmProvider(process.env, provider);
  if (!chosen) { process.stderr.write('no REST LLM provider available (set OPENAI_API_KEY / GEMINI_API_KEY / AI_GATEWAY_API_KEY)\n'); process.exit(1); }

  let html;
  try {
    const { url, init, parse } = buildLlmRequest(chosen, prompt);
    const res = await fetch(url, init);
    if (!res.ok) { process.stderr.write(`LLM HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}\n`); process.exit(2); }
    html = extractHtml(parse(await res.json()));
    if (!html) { process.stderr.write('empty HTML from LLM\n'); process.exit(2); }
  } catch (err) {
    process.stderr.write(`LLM request failed: ${String(err?.message || err)}\n`);
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
if (isMain || basename(process.argv[1] || '') === 'gen-llm.mjs') main();
