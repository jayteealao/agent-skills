#!/usr/bin/env node
/**
 * scripts/design-boards.mjs — the board tool of the older design layout.
 * skills/wf/scripts/design-boards.mjs runs this script.
 *
 *   check   <root> <slug>                          the board files that 02c-craft.md boards: lists but that are missing
 *   ansi    <input.txt> --scheme <name> --out <file.html>   render terminal output with colour in a named scheme
 *
 * Every command prints one JSON object on stdout; a failure is `{ ok: false, error, fix }`.
 *
 * The design stage draws screens (`wf.mjs design`). A workflow from before the screens keeps its
 * boards in `<workflow>/design/`: `check` reads them, and `wf.mjs design migrate` turns them into
 * screens.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANSI_SCHEMES, DESIGN_DIR, MANIFEST, missingBoardFiles, needsPictures, posix, renderAnsi } from '../lib/design-boards.mjs';
import { agentFix, failureOf, personFix, refuse } from '../lib/fix.mjs';
import { isMainModule } from '../lib/proc.mjs';
import { workflowDir, workflowRel, workflowsRoot } from '../lib/records-root.mjs';
import { INDEX_NAME, readDoc } from '../lib/records.mjs';

// The browsers of this computer: lib/design-browser.mjs finds them for the checks.
export { browserCandidates } from '../lib/design-browser.mjs';

export const COMMANDS = Object.freeze(['check', 'ansi']);
const SELF = `node "${posix(fileURLToPath(import.meta.url))}"`;
const USAGE = `usage: design-boards.mjs check <projectRoot> <slug>
       design-boards.mjs ansi <input.txt> --scheme <${Object.keys(ANSI_SCHEMES).join('|')}> [--out <file.html>]`;

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) f[a.slice(2)] = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    else pos.push(a);
  }
  return { pos, f };
}

/** The workflows of a project, for a fix that lists the valid slugs. */
function slugsOf(root) {
  const base = workflowsRoot(root);
  if (!existsSync(base)) return [];
  try { return readdirSync(base).filter((n) => !n.startsWith('_') && !n.startsWith('.')); } catch { return []; }
}

function requireWorkflow(root, slug) {
  const known = slugsOf(root);
  const list = known.length ? `The workflows of this project: ${known.slice(0, 20).join(', ')}.` : 'This project has no workflow folder.';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) throw refuse(`'${slug}' is not a workflow slug`, agentFix(`Run the command again with the slug of a workflow. ${list}`));
  if (!existsSync(workflowDir(root, slug))) throw refuse(`no workflow folder ${workflowRel(slug)}/`, agentFix(`Run the command again with the project root first, then the slug of a workflow. ${list}`));
}

// ---------------------------------------------------------------- check

/** The frontmatter of one workflow record, in either layout: {} when it does not parse, null when it is absent. */
function recordFm(dir, name) {
  const doc = readDoc(dir, name);
  return doc ? (doc.frontmatter ?? {}) : null;
}

function check(root, slug) {
  requireWorkflow(root, slug);
  const wdir = workflowDir(root, slug);
  const index = recordFm(wdir, INDEX_NAME) ?? {};
  const contract = recordFm(wdir, '02c-craft.md');
  const pictures = needsPictures(index);
  if (!contract) {
    const working = existsSync(join(wdir, DESIGN_DIR, MANIFEST)) ? missingBoardFiles(wdir, { boards: `${DESIGN_DIR}/${MANIFEST}` }) : null;
    return {
      ok: false, contract: false, 'ux-impact': index['ux-impact'] ?? null, needsPictures: pictures, missing: working ?? [],
      error: '02c-craft.md is missing: the design is not confirmed',
      fix: personFix(`The design of ${slug} is not approved yet. Run /wf design ${slug}.`),
    };
  }
  const boards = String(contract.boards ?? '').trim() || null;
  const missing = missingBoardFiles(wdir, contract);
  return {
    ok: missing.length === 0,
    contract: true, 'ux-impact': index['ux-impact'] ?? null, needsPictures: pictures,
    boards, revision: contract['design-revision'] ?? null, missing,
    ...(boards ? {} : { note: '02c-craft.md names no boards: (written before the boards release); the old settled rule applies' }),
    ...(missing.length ? {
      error: `${missing.length} board file(s) of 02c-craft.md are not on disk`,
      fix: agentFix('Put each missing board file back from git, or move the boards onto the design surface.', `wf.mjs design migrate ${JSON.stringify(posix(root))} ${slug} --check`),
    } : {}),
  };
}

// ---------------------------------------------------------------- ansi

function ansi(input, f) {
  const again = `${SELF} ansi <input.txt> --scheme ${Object.keys(ANSI_SCHEMES)[0]} --out <file.html>`;
  if (!existsSync(input)) throw refuse(`ansi: ${posix(input)} does not exist`, agentFix('Write the terminal output to a text file, then run the command again with its path.', again));
  const scheme = typeof f.scheme === 'string' ? f.scheme : null;
  if (!scheme || !ANSI_SCHEMES[scheme]) throw refuse(`ansi: --scheme is one of ${Object.keys(ANSI_SCHEMES).join(', ')}`, agentFix('Run the command again with one of these schemes.', again));
  const out = typeof f.out === 'string' && f.out ? resolve(f.out) : join(dirname(input), `${basename(input, extname(input))}.${scheme}.html`);
  const text = readFileSync(input, 'utf8');
  writeAtomic(out, renderAnsi(text, scheme, { title: `${basename(input)} · ${ANSI_SCHEMES[scheme].name}` }));
  return { ok: true, out: posix(out), scheme, theme: ANSI_SCHEMES[scheme].theme, lines: text.split(/\r?\n/).length };
}

// ---------------------------------------------------------------- main

export async function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, ...rest0] = argv;
  const usageFix = agentFix('Run the command again in one of these forms.', `${SELF} check <projectRoot> <slug>`);
  const bad = (error) => { process.stdout.write(`${JSON.stringify({ ok: false, error, fix: usageFix }, null, 2)}\n`); process.stderr.write(`${USAGE}\n`); return 2; };
  if (!cmd || !rootArg) return bad('a command and its first argument are required');
  if (!COMMANDS.includes(cmd)) return bad(`design-boards.mjs has no command ${cmd}: the design stage draws screens with wf.mjs design`);
  const root = resolve(rootArg);
  let out;
  try {
    if (cmd === 'ansi') out = ansi(root, flags(rest0).f);
    else {
      const [slug] = rest0;
      if (!slug) return bad('check: <projectRoot> <slug> are required');
      out = check(root, slug);
    }
  } catch (e) {
    out = failureOf(e, 'design-boards.mjs');
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
}
