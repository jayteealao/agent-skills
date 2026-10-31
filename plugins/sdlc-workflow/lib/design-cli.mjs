// `wf.mjs design ...`: the commands of the design surface. wf.mjs routes here.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { canvasState, snapshotHtml } from './design-state.mjs';
import { failureLines, runChecks } from './design-check.mjs';
import { approvalQuestion, approveDesign } from './design-approve.mjs';
import { installTask, serverPort, serverStatus, startServer, stopServer, tailnetAddresses, taskStatus, uninstallTask } from './design-server.mjs';
import { addExplore, addScreen, initSurface, listExplore, listScreens, manifestProblems, readManifest, setAreas, setViewports, trackSurface, writeTokens } from './design-surface.mjs';
import { addReference, checkReferences } from './design-references.mjs';
import { addComment, capturePicture, commentsBrief, commitDesignRecords, openThreads } from './design-records.mjs';
import { migrateDesign } from './design-migrate.mjs';

export const DESIGN_USAGE = `wf.mjs design <command> <root> ...
  init <root>                                   make .ai/design/: the manifest, tokens.css, the git rule, the repo entry
  screen add <root> <key> [--title t] [--area a] [--flow f] [--order n] [--workflow slug] [--slice s]
  list <root> [--workflow slug]                 the screens (one workflow with --workflow), their states and links
  explore add <root> <key> [--title t] [--link slug]
  tokens <root>                                 write tokens.css from DESIGN.md
  track <root> [--check]                        keep .ai/design/ tracked in git
  check <root> [key...] [--workflow slug]       the screen checks, in each viewport and state
  approve <root> <slug> [key...] [--slice s]    record the approval from the answer event: commit, pictures, 02c-craft.md
  viewports <root> [name=WxH...]                the viewports of the surface; with pairs, set them
  areas <root> [area...]                        the areas in the order of the navigation; with names, set the order
  refs check <root>                             exit 1 when a reference is not a readable file in the repo
  refs add <root> <key> --file f [--kind k] [--link l] [--note n]
  comments <root> [key...] [--workflow slug]    the open comment threads, as untrusted data for a round
  comments reply <root> <key> <thread> --text t [--resolve]
  capture-path <root> <slug> <slice> <key>      where verify writes the capture of a built screen
  captures <root> <slug> <slice>                the captures of a slice; a linked project commits them to the records
  state <root>                                  the canvas data, as JSON
  publish <root> [--out file]                   one self-contained canvas page (no comments, no layout saves)
  migrate <root> [slug...] [--check]            move the boards of each workflow onto the surface, once; --check only plans
  server start|stop|status|url                  the one design server of this computer
  server install|uninstall                      the Windows scheduled task that starts the server at logon`;

/** A part of a capture path: a name, never a path. */
const namePart = (v) => /^[a-z0-9._-]+$/i.test(String(v ?? '')) && v !== '.' && v !== '..';

/** Run one design command. Returns the exit code; `out` prints a value. */
export async function runDesign(pos, opt, out) {
  const [verb, ...rest] = pos;
  const sub = ['screen', 'explore', 'server', 'refs'].includes(verb) || (verb === 'comments' && rest[0] === 'reply') ? rest.shift() : null;
  if (verb === 'server') return runServer(sub, opt, out);
  const [root, key] = rest;
  if (!verb || !root) throw new Error(DESIGN_USAGE);
  const projectRoot = resolve(root);
  switch (verb) {
    case 'init': {
      const r = initSurface(projectRoot);
      out(opt.json ? r : [`${r.created ? 'made' : 'kept'} .ai/design/ (${r.tokens} token roles from DESIGN.md)`,
        `git: ${r.track.tracked ? `tracked${r.track.changed ? ' (.gitignore changed)' : ''}` : `not tracked: ${r.track.manual}`}`,
        `design server: ${r.repo.name}${r.repo.added ? ' (added)' : ''}`].join('\n'));
      return r.track.tracked || r.track.manual === 'not a git repo' ? 0 : 1;
    }
    case 'screen': {
      if (sub !== 'add' || !key) throw new Error('design screen add <root> <key> is required');
      const r = addScreen(projectRoot, key, { title: opt.title ?? null, area: opt.area ?? null, flow: opt.flow ?? null, order: opt.order ?? null, workflow: opt.workflow ?? null, slice: opt.slice ?? null });
      out(opt.json ? r : `${r.created ? 'added' : 'changed'} screen ${key} → ${r.file}`);
      return 0;
    }
    case 'explore': {
      if (sub !== 'add' || !key) throw new Error('design explore add <root> <key> is required');
      const r = addExplore(projectRoot, key, { title: opt.title ?? null, link: opt.link ?? null });
      out(opt.json ? r : `explore ${key}${r.link ? ` (for ${r.link})` : ''}: write the sketch to .ai/design/explore/${key}.html`);
      return 0;
    }
    case 'list': {
      const screens = listScreens(projectRoot, { workflow: opt.workflow ?? null });
      const problems = manifestProblems(readManifest(projectRoot), projectRoot);
      if (opt.json) { out({ screens, explore: listExplore(projectRoot), problems }); return problems.length ? 1 : 0; }
      out([...screens.map((s) => `${s.key}: ${s.title} [${s.area ?? 'no area'}${s.flow ? ` / ${s.flow}${s.order != null ? ` #${s.order}` : ''}` : ''}] states ${s.states.join(' ') || 'none'}${s.links.length ? ` → ${s.links.join(', ')}` : ''}${s.approvals.length ? ` (approved ${s.approvals.at(-1).commit.slice(0, 8)})` : ''}`),
        ...problems.map((p) => `problem: ${p}`)].join('\n') || 'no screens');
      return problems.length ? 1 : 0;
    }
    case 'tokens': {
      const rows = writeTokens(projectRoot);
      out(opt.json ? rows : `tokens.css: ${rows.length} token roles${rows.length ? '' : ' (DESIGN.md has no ## Colors table)'}`);
      return 0;
    }
    case 'track': {
      const r = trackSurface(projectRoot, { write: !opt.check });
      out(opt.json ? r : r.tracked ? `.ai/design/ is tracked${r.changed ? ' (.gitignore changed)' : ''}` : r.would ? `would change .gitignore: ${r.would.join(', ')}` : `not tracked: ${r.manual}`);
      return r.tracked ? 0 : 1;
    }
    case 'check': {
      const r = await runChecks(projectRoot, { keys: rest.slice(1), workflow: opt.workflow ?? null });
      if (opt.json) { out(r); return r.ran && r.passed ? 0 : 1; }
      const found = r.new ?? r.failures;
      const lines = failureLines(found);
      out([r.ran ? `checked ${r.checked.length} screen(s): ${lines.length ? `${found.length} failure(s) from ${lines.length} cause(s)` : 'all pass'}` : `not checked: ${r.reason}`,
        ...lines, ...(opt.workflow ? [`ask: ${approvalQuestion(opt.workflow)}`] : [])].join('\n'));
      return r.ran && !lines.length ? 0 : 1;
    }
    case 'approve': {
      if (!key) throw new Error('design approve <root> <slug> is required');
      const r = await approveDesign(projectRoot, key, { keys: rest.slice(2), slice: opt.slice ?? null });
      out(opt.json ? r : r.ok
        ? `approved ${r.screens.join(', ')} for ${r.slug} in ${r.commit.slice(0, 8)}${r.committed ? '' : ' (no change since the last commit)'}; ${r.pictures} picture(s); ${r.checkFailures ?? 'no'} check failure(s)`
        : [`not approved: ${r.reason}`, ...(r.question ? [`ask: ${r.question}`] : [])].join('\n'));
      return r.ok ? 0 : 1;
    }
    case 'viewports': {
      const pairs = rest.slice(1);
      const v = pairs.length ? setViewports(projectRoot, Object.fromEntries(pairs.map((p) => { const i = p.indexOf('='); return i > 0 ? [p.slice(0, i), p.slice(i + 1)] : [p, '']; }))) : readManifest(projectRoot).viewports;
      out(opt.json ? v : Object.entries(v).map(([n, s]) => `${n}=${s}`).join(' '));
      return 0;
    }
    case 'areas': {
      const names = rest.slice(1);
      const a = names.length ? setAreas(projectRoot, names) : readManifest(projectRoot).areas ?? [];
      out(opt.json ? a : a.join(' ') || 'no areas');
      return 0;
    }
    case 'refs': {
      if (sub === 'add') {
        if (!key) throw new Error('design refs add <root> <key> --file <path> is required');
        const r = addReference(projectRoot, { key, file: opt.file ?? null, kind: opt.kind ?? 'other', link: opt.link ?? null, note: opt.note ?? null });
        out(opt.json ? r : `reference ${key}: ${r.file}`);
        return 0;
      }
      if (sub !== 'check') throw new Error(DESIGN_USAGE);
      const r = checkReferences(projectRoot);
      out(opt.json ? r : [`${r.references.length} reference(s)${r.ok ? ', all readable' : ''}`, ...r.references.filter((x) => !x.readable).map((x) => `unreadable: ${x.key}: ${x.problem}`)].join('\n'));
      return r.ok ? 0 : 1;
    }
    case 'comments': {
      if (sub === 'reply') {
        const [, k, thread] = rest;
        if (!k || !thread) throw new Error('design comments reply <root> <key> <thread> --text t is required');
        const r = addComment(projectRoot, k, { thread, text: opt.text ?? '', author: 'agent', resolve: Boolean(opt.resolve) });
        out(opt.json ? r : r.ok === false ? `not saved: ${r.reason}` : `replied on ${k} thread ${thread}${opt.resolve ? ' and resolved it' : ''}`);
        return r.ok === false ? 1 : 0;
      }
      const keys = rest.slice(1).length ? rest.slice(1) : opt.workflow ? listScreens(projectRoot, { workflow: opt.workflow }).map((s) => s.key) : null;
      if (opt.json) { out(openThreads(projectRoot, keys)); return 0; }
      out(commentsBrief(projectRoot, keys) || 'no open comment');
      return 0;
    }
    case 'capture-path': {
      const [, slug, slice, k] = rest;
      if (![slug, slice, k].every(namePart)) throw new Error('design capture-path <root> <slug> <slice> <key> is required');
      const file = capturePicture(projectRoot, slug, slice, k);
      mkdirSync(dirname(file), { recursive: true });
      out(opt.json ? { file } : file);
      return 0;
    }
    case 'captures': {
      // After the screenshots of a slice: the dispatch commits no records, so the captures reach
      // the records here. An unlinked project keeps them in its own folder, with no commit.
      const [, slug, slice] = rest;
      if (![slug, slice].every(namePart)) throw new Error('design captures <root> <slug> <slice> is required');
      const dir = dirname(capturePicture(projectRoot, slug, slice, 'x'));
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort() : [];
      const commit = files.length ? commitDesignRecords(projectRoot, `design: captures of ${slug} ${slice}`) : null;
      out(opt.json ? { slug, slice, files, commit } : `${files.length} capture(s) of ${slug} ${slice}${commit ? `; records commit ${commit.slice(0, 8)}` : ''}`);
      return 0;
    }
    case 'state': {
      out(canvasState(projectRoot, { repo: basename(projectRoot), writable: false }));
      return 0;
    }
    case 'publish': {
      const file = resolve(opt.out ?? join(projectRoot, '.ai', 'design-canvas.html'));
      writeFileSync(file, snapshotHtml(projectRoot, { repo: basename(projectRoot) }));
      out(opt.json ? { file } : `canvas page: ${file}`);
      return 0;
    }
    case 'migrate': {
      const r = migrateDesign(projectRoot, { slugs: rest.slice(1), write: !opt.check });
      out(opt.json ? r : r.results.map(migrateLine).join('\n') || 'no workflow has boards');
      return r.results.some((x) => x.blocked) ? 1 : 0;
    }
    default:
      throw new Error(DESIGN_USAGE);
  }
}

async function runServer(sub, opt, out) {
  const urls = (s) => (s.addresses?.length ? s.addresses : [`http://127.0.0.1:${s.port}/`, ...tailnetAddresses().map((a) => `http://${a}:${s.port}/`)]);
  switch (sub) {
    case 'start': {
      const s = await startServer({ port: opt.port ? Number(opt.port) : serverPort() });
      out(opt.json ? s : s.running ? `design server ${s.started ? 'started' : 'runs'}: ${urls(s).join(' ')}` : s.reason);
      return s.running ? 0 : 1;
    }
    case 'stop': {
      const s = await stopServer();
      out(opt.json ? s : s.stopped ? 'design server stopped' : 'the design server did not run');
      return 0;
    }
    case 'status': {
      const s = await serverStatus();
      const t = taskStatus();
      out(opt.json ? { ...s, task: t } : [`server: ${s.running ? `runs (pid ${s.pid}) ${urls(s).join(' ')}` : 'stopped'}`,
        `scheduled task: ${!t.supported ? 'not on this platform' : t.installed ? `installed${t.targetExists === false ? ' — its script is gone: run design server install again' : ''}` : 'not installed'}`].join('\n'));
      return s.running ? 0 : 1;
    }
    case 'url': {
      const s = await serverStatus();
      out(opt.json ? { running: s.running, urls: urls(s) } : `${urls(s).join('\n')}${s.running ? '' : '\n(the server is stopped: run design server start)'}`);
      return 0;
    }
    case 'install': {
      const r = installTask();
      out(opt.json ? r : r.installed ? `scheduled task ${r.task}: the design server starts at logon` : r.reason);
      return r.installed ? 0 : 1;
    }
    case 'uninstall': {
      const r = uninstallTask();
      out(opt.json ? r : r.removed ? 'scheduled task removed' : r.reason);
      return r.removed ? 0 : 1;
    }
    default:
      throw new Error(DESIGN_USAGE);
  }
}

/** One line per workflow of a migration, and the lines of what it waits for. */
function migrateLine(r) {
  if (r.skip) return `${r.slug}: ${r.skip}`;
  const keys = Object.entries(r.keys ?? {}).map(([b, k]) => `${b} → ${k}`).join(', ');
  if (r.blocked) {
    return [`${r.slug}: not migrated`,
      ...r.exports.map((e) => `  export ${e.file} from ${e.canvas} (read the artifact, save its page there), then run migrate again`),
      ...r.missing.map((f) => `  the board file ${f} is missing`)].join('\n');
  }
  if (!r.migrated) return `${r.slug}: would migrate revisions ${r.revisions.map((n) => n ?? 'working').join(', ')}${r.confirmed ? `, approve r${r.confirmed}` : ''}: ${keys}`;
  return [`${r.slug}: migrated ${Object.keys(r.commits).join(', ')}${r.approved ? `; approved ${r.screens.join(', ')} at ${r.approved.slice(0, 10)}` : ''}; ${r.captures} captures`,
    `  ${keys}`, ...r.warnings.map((w) => `  ${w}`)].join('\n');
}
