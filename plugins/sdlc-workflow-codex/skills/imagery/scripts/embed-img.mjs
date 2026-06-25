#!/usr/bin/env node
// skills/imagery/scripts/embed-img.mjs
//
// Embed a generated image into a free narrative fragment as a data-URI (MIME
// sniffed from the bytes — A3). EXTERNAL-MODEL-DISPATCH-PLAN §3.4. The renderer
// raw-inlines `<stem>.<label>.html.fragment` siblings (with @scope CSS
// containment), so the figure rides into the rendered page with no path-serving.
//
//   node embed-img.mjs <imagePath> <fragmentPath> [label] [caption]
//
// Exit: 0 success (prints fragment path) · 2 error.

import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { embedFragment } from './_img.mjs';

async function main() {
  const [imagePath, fragmentPath, label, caption] = process.argv.slice(2);
  if (!imagePath || !fragmentPath) {
    process.stderr.write('usage: node embed-img.mjs <imagePath> <fragmentPath> [label] [caption]\n');
    process.exit(2);
  }
  try {
    const out = embedFragment(imagePath, fragmentPath, { label: label || 'imagery', caption: caption || '' });
    process.stdout.write(`${out}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`embed failed: ${String(err?.message || err)}\n`);
    process.exit(2);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || basename(process.argv[1] || '') === 'embed-img.mjs') main();
