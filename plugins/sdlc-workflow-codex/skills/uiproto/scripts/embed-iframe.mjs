#!/usr/bin/env node
// skills/uiproto/scripts/embed-iframe.mjs
//
// Wrap a generated HTML component/screen into a SANDBOXED iframe and write it as a
// free narrative fragment. EXTERNAL-MODEL-DISPATCH-PLAN §3.4/§12.3. A full
// generated screen carries colliding CSS (and possibly scripts), so it must be
// isolated — `<iframe sandbox srcdoc>` gives CSS/JS containment that raw-inlining
// cannot. The sandbox carries NO allow-scripts: the served view's CSP
// (`script-src 'self'`) is inherited by srcdoc iframes and would block inline
// scripts anyway, so the preview is visual (layout + styling); JS is inert.
//
//   node embed-iframe.mjs <htmlPath> <fragmentPath> [label] [caption]
//
// Exit: 0 success (prints fragment path) · 2 error.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Escape a string for use inside a double-quoted HTML attribute (srcdoc). */
export function attrEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function textEscape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Build the sandboxed-iframe `<figure>` fragment HTML for a generated component. */
export function iframeFragmentHtml(html, { label = 'uiproto', caption = '' } = {}) {
  const cap = caption ? `\n  <figcaption>${textEscape(caption)}</figcaption>` : '';
  return [
    `<figure class="uiproto-frame" data-uiproto="${attrEscape(label)}">`,
    `  <iframe sandbox loading="lazy" title="${attrEscape(caption || label)}" srcdoc="${attrEscape(html)}" style="width:100%;min-height:480px;border:1px solid var(--border,#3334);border-radius:8px;background:#fff"></iframe>${cap}`,
    '</figure>',
    '',
  ].join('\n');
}

async function main() {
  const [htmlPath, fragmentPath, label, caption] = process.argv.slice(2);
  if (!htmlPath || !fragmentPath) {
    process.stderr.write('usage: node embed-iframe.mjs <htmlPath> <fragmentPath> [label] [caption]\n');
    process.exit(2);
  }
  try {
    const html = readFileSync(htmlPath, 'utf-8');
    const frag = iframeFragmentHtml(html, { label: label || 'uiproto', caption: caption || '' });
    mkdirSync(dirname(fragmentPath), { recursive: true });
    writeFileSync(fragmentPath, frag, 'utf-8');
    process.stdout.write(`${fragmentPath}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`embed failed: ${String(err?.message || err)}\n`);
    process.exit(2);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || basename(process.argv[1] || '') === 'embed-iframe.mjs') main();
