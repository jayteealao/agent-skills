// Unit tests for the imagery skill's byte/request helpers.
// EXTERNAL-MODEL-DISPATCH-PLAN §6. No live API: pure functions only.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';

import {
  sniffMime, extForMime, writeImage, imageFigureHtml, embedFragment, dispatchEnabled,
} from '../../../skills/imagery/scripts/_img.mjs';
import {
  pickSize, buildOpenAiImageRequest, decodeImageResponse,
} from '../../../skills/imagery/scripts/gen-openai.mjs';
import {
  extractInlineImage, buildGeminiConfig,
} from '../../../skills/imagery/scripts/gen-gemini.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function tempDir() { return mkdtempSync(join(tmpdir(), 'sdlc-imagery-')); }

test('sniffMime: recognizes JPEG / PNG / WEBP / GIF, else octet-stream', () => {
  equal(sniffMime(JPEG), 'image/jpeg');
  equal(sniffMime(PNG), 'image/png');
  equal(sniffMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'image/webp');
  equal(sniffMime(Buffer.from('GIF89a___')), 'image/gif');
  equal(sniffMime(Buffer.from([0, 1, 2, 3])), 'application/octet-stream');
});

test('extForMime: maps MIME → extension', () => {
  equal(extForMime('image/jpeg'), '.jpg');
  equal(extForMime('image/png'), '.png');
  equal(extForMime('application/octet-stream'), '.img');
});

test('writeImage: corrects the extension to the actual bytes (A3)', () => {
  const dir = tempDir();
  // Ask for .png but hand it JPEG bytes — the extension must flip to .jpg.
  const out = writeImage(JPEG, join(dir, 'probe.png'));
  equal(out.mime, 'image/jpeg');
  match(out.path, /probe\.jpg$/);
  ok(existsSync(out.path));
  // PNG bytes into a .jpg path → flips to .png.
  equal(writeImage(PNG, join(dir, 'x.jpg')).path.endsWith('.png'), true);
});

test('imageFigureHtml: data-URI carries the sniffed MIME + escapes the caption', () => {
  const html = imageFigureHtml(JPEG, { caption: 'A & B <hero>' });
  match(html, /data:image\/jpeg;base64,/);
  match(html, /A &amp; B &lt;hero&gt;/);
  ok(!html.includes('<hero>'), 'caption HTML is escaped');
});

test('embedFragment: writes a fragment file with the inlined image', () => {
  const dir = tempDir();
  const imgPath = writeImage(PNG, join(dir, 'pic.png')).path;
  const frag = embedFragment(imgPath, join(dir, '02-shape.01-probe.html.fragment'), { caption: 'probe' });
  ok(existsSync(frag));
  match(readFileSync(frag, 'utf-8'), /data:image\/png;base64,/);
});

test('pickSize: 2K tier maps larger, default 1K', () => {
  equal(pickSize('2K'), '1536x1024');
  equal(pickSize('1K'), '1024x1024');
  equal(pickSize(), '1024x1024');
});

test('buildOpenAiImageRequest: gpt-image-2 body + bearer auth', () => {
  const { url, init } = buildOpenAiImageRequest('a cat', '2K', 'sk-x');
  match(url, /api\.openai\.com\/v1\/images\/generations/);
  match(init.headers.authorization, /^Bearer sk-x$/);
  const body = JSON.parse(init.body);
  equal(body.model, 'gpt-image-2');
  equal(body.prompt, 'a cat');
  equal(body.size, '1536x1024');
});

test('decodeImageResponse: decodes b64_json, null when absent', () => {
  const b64 = JPEG.toString('base64');
  ok(decodeImageResponse({ data: [{ b64_json: b64 }] }).equals(JPEG));
  equal(decodeImageResponse({ data: [] }), null);
  equal(decodeImageResponse({}), null);
});

test('extractInlineImage: handles inlineData and inline_data shapes, null when none', () => {
  const b64 = PNG.toString('base64');
  const a = extractInlineImage({ candidates: [{ content: { parts: [{ inlineData: { data: b64 } }] } }] });
  ok(a.equals(PNG));
  const b = extractInlineImage({ candidates: [{ content: { parts: [{ text: 'hi' }, { inline_data: { data: b64 } }] } }] });
  ok(b.equals(PNG));
  equal(extractInlineImage({ candidates: [{ content: { parts: [{ text: 'only text' }] } }] }), null);
  equal(extractInlineImage({}), null);
});

test('buildGeminiConfig: response modalities + UPPERCASE imageSize tier', () => {
  deepEqual(buildGeminiConfig('2k'), { responseModalities: ['Text', 'Image'], imageConfig: { imageSize: '2K' } });
  equal(buildGeminiConfig().imageConfig.imageSize, '1K');
});

test('dispatchEnabled: egress generators gate on the consent flag (script is the boundary)', () => {
  const home = tempDir();
  equal(dispatchEnabled({ home }), false, 'absent config → egress off');
  mkdirSync(join(home, '.sdlc'), { recursive: true });
  writeFileSync(join(home, '.sdlc', 'hub-config.json'), JSON.stringify({ externalDispatch: { enabled: false } }), 'utf-8');
  equal(dispatchEnabled({ home }), false, 'explicit false → off');
  writeFileSync(join(home, '.sdlc', 'hub-config.json'), JSON.stringify({ externalDispatch: { enabled: true } }), 'utf-8');
  equal(dispatchEnabled({ home }), true, 'explicit true → on');
});
