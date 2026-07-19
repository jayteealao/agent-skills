// Unit tests for the uiproto skill's pure helpers.
// EXTERNAL-MODEL-DISPATCH-PLAN §6. No live API/SDK.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';

import { dispatchEnabled } from '../../../skills/uiproto/scripts/_consent.mjs';
import {
  resolveLlmProvider, buildLlmRequest, extractHtml,
} from '../../../skills/uiproto/scripts/gen-llm.mjs';
import {
  firstScreen, screenHtmlUrl,
} from '../../../skills/uiproto/scripts/gen-stitch.mjs';
import {
  attrEscape, iframeFragmentHtml,
} from '../../../skills/uiproto/scripts/embed-iframe.mjs';

// ── gen-llm ───────────────────────────────────────────────────────────────────

test('resolveLlmProvider: explicit wins, else first key (openai > gemini > gateway)', () => {
  equal(resolveLlmProvider({}, 'gemini'), 'gemini');
  equal(resolveLlmProvider({ OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'y' }), 'openai');
  equal(resolveLlmProvider({ GEMINI_API_KEY: 'y' }), 'gemini');
  equal(resolveLlmProvider({ AI_GATEWAY_API_KEY: 'z' }), 'openai/gpt-5.5');
  equal(resolveLlmProvider({}), null);
});

test('buildLlmRequest: openai chat shape with the HTML system instruction', () => {
  const { url, init } = buildLlmRequest('openai', 'a login form', { env: { OPENAI_API_KEY: 'sk' } });
  match(url, /api\.openai\.com\/v1\/chat\/completions/);
  match(init.headers.authorization, /^Bearer sk$/);
  const body = JSON.parse(init.body);
  match(body.messages[0].content, /self-contained HTML/i);
  match(body.messages[0].content, /a login form/);
});

test('buildLlmRequest: gemini carries the key in the query; gateway uses the token model', () => {
  const g = buildLlmRequest('gemini', 'x', { env: { GEMINI_API_KEY: 'k' } });
  match(g.url, /generativelanguage\.googleapis\.com/);
  match(g.url, /key=k/);
  const gw = buildLlmRequest('anthropic/claude-x', 'x', { env: { AI_GATEWAY_API_KEY: 't' } });
  match(gw.url, /ai-gateway\.vercel\.sh/);
  equal(JSON.parse(gw.init.body).model, 'anthropic/claude-x');
});

test('extractHtml: strips a stray ```html fence', () => {
  equal(extractHtml('```html\n<div>hi</div>\n```'), '<div>hi</div>');
  equal(extractHtml('<p>plain</p>'), '<p>plain</p>');
});

// ── gen-stitch ────────────────────────────────────────────────────────────────

test('firstScreen: unwraps array / {screens} / bare screen', () => {
  equal(firstScreen(['a', 'b']), 'a');
  equal(firstScreen({ screens: ['s1'] }), 's1');
  deepEqual(firstScreen({ id: 1 }), { id: 1 });
  equal(firstScreen(null), null);
});

test('screenHtmlUrl: prefers getHtml(), falls back to html field', async () => {
  equal(await screenHtmlUrl({ getHtml: async () => 'http://x/h.html' }), 'http://x/h.html');
  equal(await screenHtmlUrl({ html: '<b>inline</b>' }), '<b>inline</b>');
  equal(await screenHtmlUrl({ html: { url: 'http://x/u' } }), 'http://x/u');
  equal(await screenHtmlUrl(null), null);
});

// ── embed-iframe ──────────────────────────────────────────────────────────────

test('attrEscape: escapes & and " for a srcdoc attribute', () => {
  equal(attrEscape('a & b "c"'), 'a &amp; b &quot;c&quot;');
});

test('iframeFragmentHtml: sandbox WITHOUT allow-scripts, srcdoc attribute-escaped', () => {
  const frag = iframeFragmentHtml('<style>.x{}</style><div onclick="x">hi</div>', { label: 'llm', caption: 'Login' });
  match(frag, /<iframe sandbox/);
  ok(!/allow-scripts/.test(frag), 'no allow-scripts — JS stays inert');
  // The component HTML must be attribute-escaped inside srcdoc (no raw quotes).
  match(frag, /srcdoc="[^"]*&quot;x&quot;/);
  match(frag, /data-uiproto="llm"/);
  match(frag, /<figcaption>Login<\/figcaption>/);
});

// ── consent gate ───────────────────────────────────────────────────────────────

test('dispatchEnabled: both engines gate on the consent flag (script is the boundary)', () => {
  const home = mkdtempSync(join(tmpdir(), 'sdlc-uiproto-'));
  equal(dispatchEnabled({ home }), false, 'absent config → egress off');
  mkdirSync(join(home, '.sdlc'), { recursive: true });
  writeFileSync(join(home, '.sdlc', 'hub-config.json'), JSON.stringify({ externalDispatch: { enabled: true } }), 'utf-8');
  equal(dispatchEnabled({ home }), true, 'explicit true → on');
});
