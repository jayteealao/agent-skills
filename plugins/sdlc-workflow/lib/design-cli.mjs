// `wf.mjs design ...`: the commands of the design surface. wf.mjs routes here.
import { writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { canvasState, snapshotHtml } from './design-state.mjs';
import { installTask, serverPort, serverStatus, startServer, stopServer, tailnetAddresses, taskStatus, uninstallTask } from './design-server.mjs';
import { addExplore, addScreen, initSurface, listExplore, listScreens, manifestProblems, readManifest, trackSurface, writeTokens } from './design-surface.mjs';

export const DESIGN_USAGE = `wf.mjs design <command> <root> ...
  init <root>                                   make .ai/design/: the manifest, tokens.css, the git rule, the repo entry
  screen add <root> <key> [--title t] [--area a] [--flow f] [--order n] [--workflow slug] [--slice s]
  list <root> [--workflow slug]                 the screens (one workflow with --workflow), their states and links
  explore add <root> <key> [--title t] [--link slug]
  tokens <root>                                 write tokens.css from DESIGN.md
  track <root> [--check]                        keep .ai/design/ tracked in git
  state <root>                                  the canvas data, as JSON
  publish <root> [--out file]                   one self-contained canvas page (no comments, no layout saves)
  server start|stop|status|url                  the one design server of this computer
  server install|uninstall                      the Windows scheduled task that starts the server at logon`;

/** Run one design command. Returns the exit code; `out` prints a value. */
export async function runDesign(pos, opt, out) {
  const [verb, ...rest] = pos;
  const sub = ['screen', 'explore', 'server'].includes(verb) ? rest.shift() : null;
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
