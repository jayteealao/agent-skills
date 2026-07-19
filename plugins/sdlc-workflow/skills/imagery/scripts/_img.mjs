// skills/imagery/scripts/_img.mjs
//
// Shared byte helpers for the imagery skill — MIME sniffing, extension-correct
// writing, and data-URI fragment embedding. EXTERNAL-MODEL-DISPATCH-PLAN §3.2/§3.4.
//
// A3 (load-bearing): image backends return bytes that may not match the requested
// extension — Gemini returns JPEG regardless of what you ask for. So we ALWAYS
// sniff the magic number and set the file extension + embed MIME from the actual
// bytes; never hardcode PNG.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Egress consent gate. Read ~/.sdlc/hub-config.json and return
 * externalDispatch.enabled === true. The EGRESS generators (gen-openai,
 * gen-gemini) re-check this THEMSELVES so the script — not just the SKILL.md
 * prose — is the consent boundary: a direct `node gen-gemini.mjs …` cannot
 * bypass consent. The built-in image_gen + text fallback never egress and do not
 * consult it. Mirrors consult/dispatch.mjs's dispatchEnabled (D7/§4.1).
 */
export function dispatchEnabled({ home = homedir() } = {}) {
  try {
    const cfgPath = join(home, '.sdlc', 'hub-config.json');
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    return cfg?.externalDispatch?.enabled === true;
  } catch {
    return false;
  }
}

/** Sniff an image MIME type from the leading magic bytes. */
export function sniffMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const head6 = buf.slice(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  return 'application/octet-stream';
}

export function extForMime(mime) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[mime] || '.img';
}

/**
 * Write image bytes, FIXING the file extension to match the actual bytes (A3).
 * Returns { path, mime } with the corrected path.
 */
export function writeImage(buf, basePath) {
  const mime = sniffMime(buf);
  const want = extForMime(mime);
  const cur = extname(basePath).toLowerCase();
  const finalPath = cur === want ? basePath : `${basePath.slice(0, basePath.length - cur.length)}${want}`;
  mkdirSync(dirname(finalPath), { recursive: true });
  writeFileSync(finalPath, buf);
  return { path: finalPath, mime };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Build the data-URI `<figure>` HTML for an image (MIME sniffed from bytes).
 * Pure — returns the HTML string; the caller decides where to write it.
 */
export function imageFigureHtml(buf, { caption = '', label = 'imagery' } = {}) {
  const mime = sniffMime(buf);
  const b64 = buf.toString('base64');
  const cap = caption ? `\n  <figcaption>${escapeHtml(caption)}</figcaption>` : '';
  return `<figure class="imagery-probe">\n  <img alt="${escapeHtml(caption || label)}" src="data:${mime};base64,${b64}">${cap}\n</figure>\n`;
}

/**
 * Embed an image file as a free narrative fragment (`<stem>.<label>.html.fragment`),
 * data-URI inlined so it survives clean/additive renders and needs no path-serving.
 * Returns the fragment path.
 */
export function embedFragment(imagePath, fragmentPath, opts = {}) {
  const html = imageFigureHtml(readFileSync(imagePath), opts);
  mkdirSync(dirname(fragmentPath), { recursive: true });
  writeFileSync(fragmentPath, html, 'utf-8');
  return fragmentPath;
}
