#!/usr/bin/env node
/**
 * scripts/brainstorm-page.mjs — write the brainstorm page (WF-DESIGN-PLAN A7,
 * intake/brainstorm.md 2.9). Bundled to dist/brainstorm-page.mjs;
 * skills/wf/scripts/brainstorm-page.mjs runs the bundle.
 *
 *   brainstorm-page.mjs <projectRoot> <slug>
 *
 * Reads `.ai/workflows/<slug>/brainstorm-board.json` and `01-brainstorm.md`, and writes
 * `brainstorm-page.html` beside them: the summary, the sessions, the areas, the
 * decisions, the open ideas, the findings, the tensions and risks, the sketches, and
 * the pieces of work. Prints one JSON object on stdout.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGE_FILE, renderBrainstormPage } from '../lib/brainstorm-page.mjs';

const USAGE = 'usage: brainstorm-page.mjs <projectRoot> <slug>';
const posix = (p) => String(p).split('\\').join('/');

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** Write the page of one brainstorm. Returns the JSON result. */
export function writePage(root, slug, { now = new Date() } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(slug ?? ''))) throw new Error(`'${slug}' is not a workflow slug`);
  const dir = join(root, '.ai', 'workflows', slug);
  const boardFile = join(dir, 'brainstorm-board.json');
  if (!existsSync(boardFile)) throw new Error(`no brainstorm board .ai/workflows/${slug}/brainstorm-board.json`);
  let board;
  try {
    board = JSON.parse(readFileSync(boardFile, 'utf8'));
  } catch (e) {
    throw new Error(`brainstorm-board.json is not valid JSON: ${e.message}`);
  }
  const docFile = join(dir, '01-brainstorm.md');
  const doc = existsSync(docFile) ? readFileSync(docFile, 'utf8') : '';
  const page = join(dir, PAGE_FILE);
  writeAtomic(page, renderBrainstormPage(board, doc, { generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z') }));
  return {
    ok: true, page: posix(relative(root, page)), absolute: posix(page), document: existsSync(docFile),
    sketches: (board.sketches ?? []).length, pieces: (board.work ?? []).length,
  };
}

export function main(argv = process.argv.slice(2)) {
  const [rootArg, slug] = argv.filter((a) => !a.startsWith('--'));
  if (!rootArg || !slug) { process.stderr.write(`${USAGE}\n`); return 2; }
  let out;
  try {
    out = writePage(resolve(rootArg), slug);
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
