// `wf.mjs design ...`: the commands of the design surface. wf.mjs routes here.
import { resolve } from 'node:path';
import { addExplore, addScreen, initSurface, listExplore, listScreens, manifestProblems, readManifest, trackSurface, writeTokens } from './design-surface.mjs';

export const DESIGN_USAGE = `wf.mjs design <command> <root> ...
  init <root>                                   make .ai/design/: the manifest, tokens.css, the git rule, the repo entry
  screen add <root> <key> [--title t] [--area a] [--flow f] [--order n] [--workflow slug] [--slice s]
  list <root> [--workflow slug]                 the screens (one workflow with --workflow), their states and links
  explore add <root> <key> [--title t] [--link slug]
  tokens <root>                                 write tokens.css from DESIGN.md
  track <root> [--check]                        keep .ai/design/ tracked in git`;

/** Run one design command. Returns the exit code; `out` prints a value. */
export async function runDesign(pos, opt, out) {
  const [verb, ...rest] = pos;
  const sub = ['screen', 'explore'].includes(verb) ? rest.shift() : null;
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
    default:
      throw new Error(DESIGN_USAGE);
  }
}
