// `wf.mjs design ...`: the commands of the design surface. wf.mjs routes here.
//
// Every result of `--json` is one object with `ok`. A failure is `{ ok: false, error, fix }`:
// the fix says who repairs it and how (lib/fix.mjs). A mistake of the caller (a wrong key, a
// slug that names no workflow, a missing argument) is a refusal with a fix for the agent, never
// a defect of the plugin. `design next` computes the one next action of the stage from disk.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { findAnswer } from './answers.mjs';
import { approvalQuestion, approveDesign, lastApprovalAnswer } from './design-approve.mjs';
import { browserCandidates, noBrowserReason } from './design-browser.mjs';
import { checkBrowsers, failureGroups, failureLines, partialLines, runChecks } from './design-check.mjs';
import { addComponent, changeManifest, foundation, linkComponent, listComponents, removeComponent, scanComponents, setNoComponents, verifyComponents, word } from './design-components.mjs';
import { approvedByAnswer, designNeeded, designReopened, namesScreens } from './design-lane.mjs';
import { migrateDesign } from './design-migrate.mjs';
import { addComment, approvalPicture, capturePicture, commentsBrief, commentsPath, commitDesignRecords, openThreads, readChecks } from './design-records.mjs';
import { addReference, checkReferences } from './design-references.mjs';
import { installTask, serverPort, serverStatus, startServer, stopServer, tailnetAddresses, taskStatus, uninstallTask } from './design-server.mjs';
import { canvasState, snapshotHtml } from './design-state.mjs';
import {
  COMPONENTS_FILE, KEY_RE, LAYOUT_FILE, MANIFEST_FILE, SCREENS_DIR, SURFACE_REL, TOKENS_FILE,
  addExplore, addScreen, designMdOf, initSurface, listExplore, listScreens, manifestProblems, manifestRefusal, readDesignRepos, readManifest, registerRepo,
  missingDesignFiles, screenFile, screenRel, screenTemplate, setAreas, setViewports, surfaceDir, trackSurface, writeTokens,
} from './design-surface.mjs';
import { approvedPages, dropRounds, listVersions, restoreVersion, saveRound, versionDir, versionDrift, versionName } from './design-versions.mjs';
import { Refusal, agentFix, asFix, failureOf, fixLines, personFix, refuse } from './fix.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { linkedProject, workflowDir, workflowsRoot } from './records-root.mjs';

/**
 * Every form of `wf.mjs design`: its words, what it does, and one example. The usage text, the
 * help of wf.mjs and the check of an unknown verb all come from this list.
 */
export const DESIGN_FORMS = Object.freeze([
  ['init <root>', 'make .ai/design/: the manifest, tokens.css, the git rule, the repo entry', 'init .'],
  ['next <root> <slug>', 'the one next action of the design stage of a workflow, from disk', 'next . demo --json'],
  ['status <root> <slug>', 'the open threads, the drift, the last check, the newest round and version, and the next action', 'status . demo'],
  ['doctor <root>', 'which browser a check uses, whether the server runs, whether the records are linked, the viewports', 'doctor .'],
  ['foundation <root>', 'the tokens and the components; exit 1 until a new screen can be drawn, with the command for each missing part', 'foundation .'],
  ['component add <root> <key> [--title t] [--code file --name n] [--workflow slug]', 'add a component: --code names the code that has it; with no --code it is new', 'component add . button --code src/components/ui/button.tsx --name Button'],
  ['component link <root> <key> --code file --name n', 'record the code of a new component, after the build makes it', 'component link . order-row --code src/components/OrderRow.tsx --name OrderRow'],
  ['component remove <root> <key> [--force]', 'take a component out of the library; --force when a screen still uses it', 'component remove . order-row'],
  ['components <root> [--workflow slug]', 'the component library, each with its code and its screens', 'components .'],
  ['components scan <root>', 'the components of the product code, each with the command that adds it', 'components scan .'],
  ['components none <root> --reason r', 'record that the product has no reusable parts', 'components none . --reason "A terminal surface"'],
  ['components verify <root> <slug> [--slice s]', 'exit 1 when the code does not have or use a component of the screens', 'components verify . demo'],
  ['screen add <root> <key> [--title t] [--area a] [--flow f] [--order n] [--workflow slug] [--slice s]', 'add a screen, or change its fields', 'screen add . basket --area checkout --workflow demo'],
  ['screen remove <root> <key> [--force]', 'take a screen off the surface; --force when an approval or a contract names it', 'screen remove . basket-old'],
  ['screen rename <root> <old> <new> [--force]', 'give a screen a new key, in the manifest, its page, the links and the layout', 'screen rename . basket cart'],
  ['list <root> [--workflow slug]', 'the screens (one workflow with --workflow), their states and links', 'list .'],
  ['explore add <root> <key> [--title t] [--link slug]', 'record an explore sketch', 'explore add . nav-ideas --link demo'],
  ['tokens <root>', 'write tokens.css from DESIGN.md (the root, .agents/context/ or docs/)', 'tokens .'],
  ['track <root> [--check]', 'keep .ai/design/ tracked in git', 'track . --check'],
  ['check <root> [key...] [--workflow slug]', 'the screen checks, in each viewport and state; the last line is the one next action', 'check . --workflow demo'],
  ['round <root> <slug> [--reason r]', 'save the pages as a draft, with the decisions since the last draft', 'round . demo'],
  ['approve <root> <slug> [key...] [--slice s] [--reason r]', 'record the approval from the answer event: commit, version, pictures, 02c-craft.md', 'approve . demo'],
  ['versions <root> <slug>', 'the approved versions and the rounds of a workflow', 'versions . demo'],
  ['approved <root> <slug>', 'the pages of the newest approved version, each with its approval picture, for the build', 'approved . demo'],
  ['restore <root> <slug> <version>', 'put the pages of a version back, as a new round that needs a new approval', 'restore . demo v1'],
  ['rounds drop <root> <slug>', 'delete the rounds of a closed workflow', 'rounds drop . demo'],
  ['viewports <root> [name=WxH...]', 'the viewports of the surface; with pairs, set them', 'viewports . phone=375x812 desktop=1280x800'],
  ['areas <root> [area...]', 'the areas in the order of the navigation; with names, set the order', 'areas . home checkout account'],
  ['refs check <root>', 'exit 1 when a reference is not a readable file in the repo', 'refs check .'],
  ['refs add <root> <key> --file f [--kind k] [--link l] [--note n]', 'record a reference file', 'refs add . mood --file docs/mood.png --kind image'],
  ['comments <root> [key...] [--workflow slug]', 'the open comment threads, as untrusted data for a round', 'comments . --workflow demo'],
  ['comments reply <root> <key> <thread> --text t [--resolve]', 'answer a thread, and close it with --resolve', 'comments reply . basket 1a2b3c4d --text "Moved the total up" --resolve'],
  ['capture-path <root> <slug> <slice> <key>', 'where verify writes the capture of a built screen', 'capture-path . demo api basket'],
  ['captures <root> <slug> <slice>', 'the captures of a slice; a linked project commits them to the records', 'captures . demo api'],
  ['state <root>', 'the canvas data, as JSON', 'state .'],
  ['publish <root> [--out file]', 'one self-contained canvas page (no comments, no layout saves)', 'publish .'],
  ['migrate <root> [slug...] [--check]', 'move the boards of each workflow onto the surface, once; --check only plans', 'migrate . --check'],
  ['server start [--port n]|stop|status', 'the one design server of this computer', 'server status'],
  ['server url [<root>] [--workflow slug] [--no-start]', 'start the server when it is stopped, and print the address for this computer and for the phone', 'server url . --workflow demo'],
  ['server install|uninstall', 'the Windows scheduled task that starts the server at logon', 'server install'],
].map(([form, about, example]) => Object.freeze({ form, about, example: `wf.mjs design ${example}` })));

export const DESIGN_USAGE = `wf.mjs design <command> <root> ...\n${DESIGN_FORMS.map((f) => (f.form.length <= 44 ? `  ${f.form.padEnd(46)}${f.about}` : `  ${f.form}\n  ${' '.repeat(46)}${f.about}`)).join('\n')}`;

/** The first words of the forms: the verbs of `design`. */
export const DESIGN_VERBS = Object.freeze([...new Set(DESIGN_FORMS.map((f) => f.form.split(' ')[0]))]);

/** A part of a capture path: a name, never a path. */
const namePart = (v) => /^[a-z0-9._-]+$/i.test(String(v ?? '')) && v !== '.' && v !== '..';
const posix = (p) => String(p).split('\\').join('/');

/** A call that misses an argument or names no form: the fix is the form, and the exit code is 2. */
function usage(message, form = null) {
  const forms = form ? DESIGN_FORMS.filter((f) => f.form.startsWith(form)) : [];
  const r = refuse(message, agentFix(forms.length ? `Run the command in this form: wf.mjs design ${forms.map((f) => f.form).join('  or  wf.mjs design ')}` : 'Run the command again in one of the forms of wf.mjs design: wf.mjs help design lists them.', forms.length === 1 ? forms[0].example : null));
  r.usage = true;
  return r;
}

/** The workflows of a project: each folder of the records that has an index. */
function workflowSlugs(root) {
  const base = workflowsRoot(root);
  let names = [];
  try { names = readdirSync(base); } catch { return []; }
  return names.filter((n) => !n.startsWith('_') && !n.startsWith('.') && frontmatterOfDoc(join(base, n), INDEX_NAME)).sort();
}
const slugList = (root) => { const s = workflowSlugs(root); return s.length ? `The workflows of this project: ${s.slice(0, 30).join(', ')}.` : 'This project has no workflow yet.'; };
const screenList = (root) => { const k = Object.keys(readManifest(root).screens).sort(); return k.length ? `The screens of the surface: ${k.slice(0, 40).join(', ')}.` : 'The surface has no screen yet.'; };

/** The project root of a call: a folder that exists. */
function rootOf(root) {
  const abs = resolve(root);
  let dir = false;
  try { dir = statSync(abs).isDirectory(); } catch { dir = false; }
  if (!dir) throw refuse(`no folder ${posix(abs)}`, agentFix('Run the command again with the path of the project root first: the folder that holds .ai/.'));
  return abs;
}
const hasSurface = (root) => existsSync(join(surfaceDir(root), MANIFEST_FILE));
/** A command that reads or changes the surface needs it: no command makes `.ai/design/` as a side effect. */
function needSurface(root) {
  if (!hasSurface(root)) throw refuse(`${posix(root)} has no design surface (.ai/design/screens.json)`, agentFix('When this folder is the project root, make the surface first. Otherwise run the command again with the project root.', `wf.mjs design init ${word(root)}`));
  // A manifest that does not read would show as a surface with no screen.
  const refusal = manifestRefusal(root);
  if (refusal) throw refusal;
}
/** A slug that names a workflow of the project. */
function needWorkflow(root, slug, form) {
  if (!slug) throw usage(`design ${form}: <root> <slug> are required`, form);
  if (!frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)) throw refuse(`no workflow ${slug}`, agentFix(`Run the command again with the slug of a workflow. ${slugList(root)}`, `wf.mjs status ${word(root)}`));
}
/** The workflow of a `--workflow` filter: a workflow of the project, or one that a screen or a component names. */
function needKnownWorkflow(root, slug) {
  if (slug == null || slug === true) return;
  const m = readManifest(root);
  const named = [...Object.values(m.screens), ...Object.values(m.components)].some((x) => (x.workflows ?? []).includes(slug));
  if (!named && !frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)) throw refuse(`no workflow ${slug}`, agentFix(`Run the command again with --workflow as the slug of a workflow. ${slugList(root)}`, `wf.mjs status ${word(root)}`));
}
function needScreen(root, key, form) {
  if (!key) throw usage(`design ${form}: <root> <key> are required`, form);
  if (!readManifest(root).screens[key]) throw refuse(`no screen ${key}`, agentFix(`Run the command again with the key of a screen. ${screenList(root)}`, `wf.mjs design list ${word(root)}`));
}

/**
 * A thrown error as a refusal, or null when it is a defect. An error that carries a fix is a
 * refusal already. A plain error with a message is what a module says about its input: the
 * agent corrects the call. Any other error (a type error, a file-system error) is a defect.
 */
function asRefusal(e) {
  if (e?.fix) return e;
  if (e instanceof Error && e.constructor === Error && !e.code && e.message) {
    return new Refusal(e.message, agentFix('Read the error, correct the argument that it names, then run the command again.'));
  }
  return null;
}

/** The fix of a failed result of another design module that names none, from its reason. */
function fixOfReason(root, slug, reason, question = null) {
  const r = String(reason ?? '');
  if (/^no workflow /.test(r)) return agentFix(`Run the command again with the slug of a workflow. ${slugList(root)}`, `wf.mjs status ${word(root)}`);
  if (/is closed/.test(r)) return personFix(`The workflow ${slug} is closed. Reopen it only when the person asks: wf.mjs record set <root> ${slug} index status=in-progress.`);
  if (/no screen of /.test(r)) return agentFix(`Add each screen of the workflow, draw its page, then run the command again. ${screenList(root)}`, `wf.mjs design screen add ${word(root)} <key> --workflow ${slug}`);
  if (/has no version /.test(r)) return agentFix('Run the command again with a version or a round that the list names.', `wf.mjs design versions ${word(root)} ${slug}`);
  if (/write 02c-craft\.md first/.test(r)) return agentFix('Write the contract 02c-craft.md from the template of design/contract.md and put it with record put. Then run the command again.', `wf.mjs design approve ${word(root)} ${slug}`);
  if (/no new answer event/.test(r)) return agentFix(`Ask the person the approval question with the question tool of the host, with the exact text "${question ?? approvalQuestion(slug)}" and the options Approve, Adjust and Stop. Then run the command again.`, `wf.mjs design approve ${word(root)} ${slug}`);
  if (/the person answered/.test(r)) return agentFix('The answer is no approval: it is a change request. Change the screens as the answer says, save a round, run the check, and ask the approval question again.', `wf.mjs design round ${word(root)} ${slug}`);
  if (/^no screen /.test(r)) return agentFix(`Run the command again with the key of a screen. ${screenList(root)}`, `wf.mjs design list ${word(root)}`);
  if (/^no thread /.test(r)) return agentFix('Run the command again with the id of an open thread of that screen.', `wf.mjs design comments ${word(root)}`);
  if (/comment is empty/.test(r)) return agentFix('Run the command again with --text and the reply.');
  return agentFix('Read the reason, repair what it names, then run the command again.');
}

/* ───────────────────────── the next action ───────────────────────── */

const readText = (file) => { try { return readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
const mtime = (file) => { try { return statSync(file).mtimeMs; } catch { return 0; } };

/** What the disk says about the design of one workflow: the facts that `next` and `status` share. */
function designFacts(root, slug) {
  const dir = workflowDir(root, slug);
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const contract = frontmatterOfDoc(dir, '02c-craft.md');
  const surface = hasSurface(root);
  const screens = surface ? listScreens(root, { workflow: slug, withHtml: true }) : [];
  const keys = screens.map((s) => s.key);
  const versions = surface ? listVersions(root, slug) : { approved: [], rounds: [] };
  const newest = [...versions.approved, ...versions.rounds].sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1) ?? null;
  const checks = surface ? readChecks(root) : null;
  const failures = (checks?.failures ?? []).filter((f) => keys.includes(f.screen));
  // A check is stale when a page or a sheet changed after it, or when it did not read a screen.
  const at = checks?.at ? Date.parse(checks.at) : 0;
  const files = [...keys.map((k) => screenFile(root, k)), join(surfaceDir(root), TOKENS_FILE), join(surfaceDir(root), COMPONENTS_FILE)];
  const stale = !checks || keys.some((k) => !(checks.screens ?? []).includes(k)) || files.some((f) => mtime(f) > at + 1000);
  // The pages that no round and no version holds as they are now.
  const held = newest ? versionDir(root, slug, newest.id) : null;
  const unsaved = keys.filter((k) => !held || readText(join(held, SCREENS_DIR, `${k}.html`)) !== readText(screenFile(root, k)));
  // What the disk lacks for the approval that the contract claims: a missing page, or a part of
  // the approval that the records do not hold. Null with no contract.
  const problems = contract ? missingDesignFiles(root, dir, contract) ?? [] : null;
  const approved = Boolean(contract && namesScreens(contract) && approvedByAnswer(contract) && problems.length === 0);
  // A restore put an older version back after the last approval: the pages need a new approval.
  const lastApproved = versions.approved.at(-1) ?? null;
  const restored = [...versions.rounds].reverse().find((r) => r.restored && !r.backup && (!lastApproved || String(r.at) >= String(lastApproved.at))) ?? null;
  return {
    dir, index, contract, surface, screens, keys, versions, newest, checks, failures, stale, unsaved, problems, approved, restored,
    threads: surface && keys.length ? openThreads(root, keys) : [],
    drift: surface && keys.length ? versionDrift(root, keys) : [],
  };
}

/**
 * The one next action of the design stage of a workflow, from disk: `{ ok, step, why, command?,
 * ask?, route?, groups? }`. `command` is a command of wf.mjs to run now; `ask` is a question for
 * the person; `route` is the `/wf` key that the person runs.
 */
export function designNext(root, slug, facts = designFacts(root, slug)) {
  const R = word(root);
  const f = facts;
  const step = (name, why, more = {}) => ({ ok: true, slug, step: name, why, ...more });
  if (f.index.status === 'closed') return step('closed', `the workflow ${slug} is closed`, { ask: `The workflow ${slug} is closed. Reopen it for more design work?` });
  const shape = frontmatterOfDoc(f.dir, '02-shape.md');
  if (!shape || (shape.status && shape.status !== 'complete')) return step('intake', '02-shape.md is missing or not complete: the brief comes before the design', { route: `/wf intake ${slug}` });
  const progress = f.index.progress && typeof f.index.progress === 'object' ? f.index.progress.design : null;
  if (progress === 'skipped' && String(f.index['design-skip-reason'] ?? '').trim()) return step('skipped', `the design stage is skipped: ${f.index['design-skip-reason']}`, { route: f.index['next-invocation'] ?? `/wf slice ${slug}` });
  if (!designNeeded(f.index, Boolean(frontmatterOfDoc(f.dir, '02b-design.md')))) {
    return step('no-design', `ux-impact is ${f.index['ux-impact'] ?? 'not set'}: the workflow changes nothing that a person sees`, { ask: `The workflow ${slug} has ux-impact ${f.index['ux-impact'] ?? 'none'}. Does it change what a person sees (visual, flow or new-surface), or does the design stage stay skipped?` });
  }
  const record = [
    ...(readText(join(root, 'PRODUCT.md'))?.trim() ? [] : ['PRODUCT.md']),
    ...(designMdOf(root) ? [] : ['DESIGN.md']),
    ...['current.md', 'direction.md'].filter((n) => !existsSync(join(surfaceDir(root), n))).map((n) => `${SURFACE_REL}/${n}`),
  ];
  if (record.length) return step('record', `the design record is not whole: ${record.join(', ')} ${record.length > 1 ? 'are' : 'is'} missing`, { missing: record });
  if (!f.surface) return step('init', 'the project has no design surface yet', { command: `wf.mjs design init ${R}` });
  const ready = foundation(root);
  if (!ready.ok) return step('foundation', ready.missing.join('; '), { command: ready.next[0].command, do: ready.next[0].do });
  const reopened = designReopened(f.index);
  const approved = f.approved && !f.restored;
  const drawn = f.screens.filter((s) => s.exists && s.html !== screenTemplate(s.key, s.title ?? s.key));
  if (!drawn.length) {
    return step('draw', f.keys.length ? `no screen of ${slug} is drawn yet: ${f.keys.join(', ')} still ${f.keys.length > 1 ? 'hold' : 'holds'} the template` : `no screen of ${slug} is on the surface`,
      f.keys.length ? {} : { command: `wf.mjs design screen add ${R} <key> --workflow ${slug}` });
  }
  if (approved && !f.unsaved.length && !f.drift.length) {
    if (reopened) return step('reopened', 'the design is reopened (progress.design: in-progress) and no page changed since the approved version: draw the change, then save a round', { route: `/wf design ${slug} amend` });
    return step('approved', `the design is approved as ${f.contract['design-version'] ?? 'the contract records'}`, { route: f.index['next-invocation'] ?? f.index['next-command'] ?? `/wf slice ${slug}` });
  }
  const check = `wf.mjs design check ${R} --workflow ${slug}`;
  if (f.stale) return step('check', f.checks ? 'a page or a sheet changed after the last check, or the check did not read every screen' : 'the screens are drawn and no check ran', { command: check });
  if (f.failures.length) {
    const groups = failureGroups(f.failures);
    return step('fix', `the check fails: ${f.failures.length} failure(s) from ${groups.length} cause(s)`, { groups, command: check, do: 'Repair each cause as its move (design/<move>.md) or its do line says, then run the check again. The person may also approve with the failures that stay.', question: approvalQuestion(slug) });
  }
  if (f.threads.length) return step('comments', `${f.threads.length} open comment thread(s) on ${[...new Set(f.threads.map((t) => t.screen))].join(', ')}`, { command: `wf.mjs design comments ${R} --workflow ${slug}` });
  if (f.unsaved.length) return step('round', `no round holds the pages as they are now: ${f.unsaved.join(', ')}`, { command: `wf.mjs design round ${R} ${slug}` });
  // The answer of the person to the approval question, newer than the last approval.
  const mark = [f.contract?.['answered-at'], lastApprovalAnswer(root, slug)].filter((t) => t && Number.isFinite(Date.parse(t))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const answer = findAnswer(root, approvalQuestion(slug), { since: mark });
  const fresh = answer && (!mark || Date.parse(answer.at) > Date.parse(mark)) && (!f.newest || Date.parse(answer.at) >= Date.parse(f.newest.at));
  if (fresh && /^\s*approve\b/i.test(answer.answer)) {
    if (!f.contract) return step('contract', 'the person approved the screens, and 02c-craft.md is not written: write it from design/contract.md and put it with record put, then run design approve');
    return step('approve', 'the person approved the screens, and the approval is not recorded', { command: `wf.mjs design approve ${R} ${slug}` });
  }
  if (f.contract && !approved && fresh) return step('approve', '02c-craft.md is written, and the approval is not recorded', { command: `wf.mjs design approve ${R} ${slug}` });
  if (f.restored) return step('ask', `restored: ${versionName(f.restored.restored)} is back on the surface as ${versionName(f.restored.id)}, and a restore is no approval: ask for approval again`, { ask: approvalQuestion(slug), restored: f.restored.restored });
  return step('ask', `the check passes, no thread is open, and ${versionName(f.newest.id)} holds the pages${reopened ? ' of the reopened design' : ''}`, { ask: approvalQuestion(slug) });
}

/** The lines of a next action: its step and why, then the command, the question or the key. */
function nextLines(n) {
  return [`next: ${n.step} — ${n.why}`, ...(n.do ? [`do: ${n.do}`] : []), ...(n.command ? [`run: ${n.command}`] : []), ...(n.ask ? [`ask: ${n.ask}`] : []), ...(n.route ? [`type: ${n.route}`] : [])];
}

/** The status of the design of one workflow, with the next action. */
function designStatus(root, slug) {
  const f = designFacts(root, slug);
  const groups = failureGroups(f.failures);
  const brief = (v) => (v ? { id: v.id, name: versionName(v.id), at: v.at, reason: v.reason ?? null, ...(v.commit ? { commit: v.commit } : {}) } : null);
  return {
    ok: true, slug,
    screens: f.screens.map((s) => ({ key: s.key, exists: s.exists, states: s.states, approvals: (s.approvals ?? []).length })),
    threads: f.threads.map((t) => ({ screen: t.screen, id: t.id, state: t.anchor?.state ?? 'default', comments: t.comments.length, last: t.comments.at(-1)?.text?.slice(0, 200) ?? null })),
    drift: f.drift,
    check: f.checks ? { at: f.checks.at, ran: f.checks.ran !== false, stale: f.stale, passed: !f.failures.length, failures: f.failures.length, groups, truncated: f.checks.truncated ?? {}, notices: (f.checks.notices ?? []).filter((n) => !n.screen || f.keys.includes(n.screen)) } : null,
    round: brief(f.versions.rounds.at(-1)), version: brief(f.versions.approved.at(-1)), unsaved: f.unsaved,
    contract: { exists: Boolean(f.contract), approved: f.approved && !f.restored, reopened: designReopened(f.index), restored: f.restored ? f.restored.restored : null, problems: f.problems ?? [] },
    question: approvalQuestion(slug),
    next: designNext(root, slug, f),
  };
}

/* ───────────────────────── screens: remove and rename ───────────────────────── */

/** What names a screen for good: its approvals, the approved versions and the contracts of its workflows. */
function namedBy(root, key) {
  const s = readManifest(root).screens[key] ?? {};
  const out = [];
  if ((s.approvals ?? []).length) out.push(`${s.approvals.length} approval(s) in the manifest`);
  for (const w of s.workflows ?? []) {
    const v = listVersions(root, w).approved.filter((x) => (x.screens ?? []).some((sc) => sc.key === key));
    if (v.length) out.push(`the approved version ${v.at(-1).id} of ${w}`);
    const c = frontmatterOfDoc(workflowDir(root, w), '02c-craft.md');
    if (Array.isArray(c?.screens) && c.screens.includes(key)) out.push(`the contract 02c-craft.md of ${w}`);
  }
  return out;
}
function changeLayout(root, change) {
  const file = join(surfaceDir(root), LAYOUT_FILE);
  let layout = null;
  try { layout = JSON.parse(readFileSync(file, 'utf8')); } catch { return; }
  if (!layout?.positions || change(layout.positions) === false) return;
  writeFileSync(file, `${JSON.stringify(layout, null, 2)}\n`);
}

function removeScreen(root, key, { force = false } = {}) {
  needScreen(root, key, 'screen remove');
  const named = namedBy(root, key);
  if (named.length && !force) {
    throw refuse(`the screen ${key} is named by ${named.join(', ')}`, agentFix('An approved screen stays on the surface: a later stage builds against it. Remove it only when the person asked for it, with --force; the approved versions keep their copy of the page.', `wf.mjs design screen remove ${word(root)} ${key} --force`));
  }
  changeManifest(root, (m) => { delete m.screens[key]; });
  const files = [screenRel(key), `${SURFACE_REL}/${SCREENS_DIR}/${key}`, `${SURFACE_REL}/legacy/${key}.png`, `${SURFACE_REL}/legacy/${key}`].filter((rel) => existsSync(join(root, rel)));
  for (const rel of files) rmSync(join(root, rel), { recursive: true, force: true });
  changeLayout(root, (p) => (key in p ? delete p[key] : false));
  const links = listScreens(root).filter((s) => s.links.includes(key)).map((s) => s.key);
  return { ok: true, key, removed: true, files, named, warnings: links.length ? [`these screens still link to ${key}.html: ${links.join(', ')}`] : [] };
}

function renameScreen(root, from, to, { force = false } = {}) {
  if (!from || !to) throw usage('design screen rename: <root> <old> <new> are required', 'screen rename');
  needScreen(root, from, 'screen rename');
  if (!KEY_RE.test(to)) throw refuse(`the screen key ${to} must be kebab-case`, agentFix('Run the command again with a new key of lower-case letters, digits and single dashes.'));
  if (readManifest(root).screens[to] || existsSync(screenFile(root, to))) throw refuse(`the screen ${to} exists already`, agentFix(`Run the command again with a key that no screen has. ${screenList(root)}`));
  const named = namedBy(root, from);
  if (named.length && !force) {
    throw refuse(`the screen ${from} is named by ${named.join(', ')}`, agentFix('An approved screen keeps its key: the contract and the approved versions name it. Rename it only when the person asked for it, with --force; the contract and the versions keep the old key until the next approval.', `wf.mjs design screen rename ${word(root)} ${from} ${to} --force`));
  }
  changeManifest(root, (m) => {
    m.screens = Object.fromEntries(Object.entries(m.screens).map(([k, v]) => [k === from ? to : k, v]));
  });
  const dir = join(surfaceDir(root), SCREENS_DIR);
  if (existsSync(screenFile(root, from))) {
    const html = readFileSync(screenFile(root, from), 'utf8').replace(/(<meta\s+name=["']wf:screen["']\s+content=["'])[^"']*(["'])/i, `$1${to}$2`);
    writeFileSync(screenFile(root, to), html);
    rmSync(screenFile(root, from), { force: true });
  }
  if (existsSync(join(dir, from))) renameSync(join(dir, from), join(dir, to));
  // The links of the other pages to this page.
  const link = new RegExp(`(href=["'](?:\\./)?)${from}(\\.html(?:[?#][^"']*)?["'])`, 'g');
  const links = [];
  for (const s of listScreens(root, { withHtml: true })) {
    if (!s.exists || !link.test(s.html)) continue;
    link.lastIndex = 0;
    writeFileSync(screenFile(root, s.key), s.html.replace(link, `$1${to}$2`));
    links.push(s.key);
  }
  changeLayout(root, (p) => { if (!(from in p)) return false; p[to] = p[from]; delete p[from]; return true; });
  // The comment threads of the screen go with it.
  if (existsSync(commentsPath(root, from)) && !existsSync(commentsPath(root, to))) {
    try {
      const doc = JSON.parse(readFileSync(commentsPath(root, from), 'utf8'));
      writeFileSync(commentsPath(root, to), `${JSON.stringify({ ...doc, screen: to }, null, 2)}\n`);
      rmSync(commentsPath(root, from), { force: true });
      commitDesignRecords(root, `design: the screen ${from} is now ${to}`);
    } catch { /* the threads stay under the old key */ }
  }
  return { ok: true, from, to, file: screenRel(to), links, named, warnings: named.length ? [`the old key ${from} stays in: ${named.join(', ')}`] : [] };
}

/* ───────────────────────── the commands ───────────────────────── */

/** Run one design command. Returns the exit code; `out` prints a value. */
export async function runDesign(pos, opt, out) {
  try {
    return await run(pos, opt, out);
  } catch (e) {
    const r = asRefusal(e);
    if (!r) throw e;
    if (opt.json) out(failureOf(r, 'wf.mjs'));
    else process.stderr.write(`wf.mjs: ${r.message}\n${r.usage ? `${DESIGN_USAGE}\n` : ''}${fixLines(r.fix).join('\n')}\n`);
    return r.usage ? 2 : 1;
  }
}

async function run(pos, opt, out) {
  const [verb, ...rest] = pos;
  const sub = ['screen', 'explore', 'server', 'refs', 'rounds', 'component'].includes(verb) || (verb === 'comments' && rest[0] === 'reply') || (verb === 'components' && ['none', 'verify', 'scan'].includes(rest[0])) ? rest.shift() : null;
  if (!verb) throw usage('design: a command is required');
  if (!DESIGN_VERBS.includes(verb)) throw usage(`design has no command ${verb}`);
  if (verb === 'server') return runServer(sub, opt, out, rest[0]);
  const [root, key] = rest;
  if (!root) throw usage(`design ${verb}${sub ? ` ${sub}` : ''}: <root> is required`, sub ? `${verb} ${sub}` : verb);
  const projectRoot = rootOf(root);
  const R = word(projectRoot);
  /** Print a result: the object with --json, else the text; a failed result prints its fix on stderr. Returns the exit code. */
  const finish = (r, text, code = null) => {
    if (r.ok === false) {
      r.error ??= r.reason ?? 'the command failed';
      r.fix = asFix(r.fix) ?? fixOfReason(projectRoot, key, r.error, r.question);
    }
    if (opt.json) out(r);
    else {
      out(typeof text === 'function' ? text() : text);
      // A result that ends with its next action says the repair there.
      if (r.ok === false && !r.next?.step) process.stderr.write(`${fixLines(r.fix).join('\n')}\n`);
    }
    return code ?? (r.ok === false ? 1 : 0);
  };
  if (!['init', 'migrate', 'doctor', 'next', 'status', 'track', 'capture-path', 'captures'].includes(verb)) needSurface(projectRoot);
  switch (verb) {
    case 'init': {
      const r = initSurface(projectRoot);
      const tracked = r.track.tracked || r.track.manual === 'not a git repo';
      const res = { ok: tracked, ...r, ...(tracked ? {} : { error: `.ai/design/ is not tracked in git: ${r.track.manual}`, fix: personFix('A git ignore rule outside this repo hides .ai/design/. Add an exception for .ai/design/ to that rule, then run design track.') }) };
      return finish(res, [`${r.created ? 'made' : 'kept'} .ai/design/ (${r.tokens} token roles from DESIGN.md)`,
        `git: ${r.track.tracked ? `tracked${r.track.changed ? ' (.gitignore changed)' : ''}` : `not tracked: ${r.track.manual}`}`,
        `design server: ${r.repo.name}${r.repo.added ? ' (added)' : ''}`].join('\n'));
    }
    case 'next': {
      needWorkflow(projectRoot, key, 'next');
      const n = designNext(projectRoot, key);
      return finish(n, () => nextLines(n).join('\n'));
    }
    case 'status': {
      needWorkflow(projectRoot, key, 'status');
      const s = designStatus(projectRoot, key);
      return finish(s, () => [
        `screens: ${s.screens.map((x) => x.key).join(', ') || 'none'}`,
        `threads: ${s.threads.length ? s.threads.map((t) => `${t.screen} ${t.id}`).join(', ') : 'none open'}`,
        `drift: ${s.drift.length ? s.drift.map((d) => `${d.screen} differs from ${d.version}`).join(', ') : 'none'}`,
        `check: ${!s.check ? 'never ran' : `${s.check.at}${s.check.stale ? ' (stale: a page changed after it)' : ''}: ${s.check.failures ? `${s.check.failures} failure(s) from ${s.check.groups.length} cause(s)` : 'passes'}`}`,
        ...(s.check ? failureLines((readChecks(projectRoot)?.failures ?? []).filter((f) => s.screens.some((x) => x.key === f.screen))).map((l) => `  ${l}`) : []),
        `round: ${s.round ? `${s.round.name} (${s.round.at})` : 'none'}${s.unsaved.length ? `; not in a round: ${s.unsaved.join(', ')}` : ''}`,
        `version: ${s.version ? `${s.version.name} (${s.version.at})` : 'none approved'}`,
        ...nextLines(s.next),
      ].join('\n'));
    }
    case 'doctor': {
      const candidates = browserCandidates(projectRoot);
      const browser = checkBrowsers(projectRoot).find((b) => existsSync(b.path)) ?? null;
      const server = await serverStatus();
      const project = linkedProject(projectRoot);
      const surface = hasSurface(projectRoot);
      const track = trackSurface(projectRoot, { write: false });
      const d = {
        ok: Boolean(browser) && surface, root: posix(projectRoot), surface,
        browser: browser ? { path: browser.path, kind: browser.kind, from: browser.from } : null,
        ...(browser ? {} : { browserProblem: noBrowserReason(projectRoot, process.env, candidates) }),
        server: { running: server.running, port: server.port ?? serverPort(), pid: server.pid ?? null },
        records: { linked: Boolean(project), project: project ?? null, dir: posix(workflowsRoot(projectRoot)) },
        git: { repo: track.manual !== 'not a git repo', tracked: track.tracked },
        viewports: surface ? readManifest(projectRoot).viewports : {},
        ...(surface && browser ? {} : { error: surface ? 'no browser can run the checks' : 'the project has no design surface', fix: surface ? personFix('Install Chrome, Edge or Chromium on this computer, or set SDLC_BROWSER to the path of one.') : agentFix('Make the surface first.', `wf.mjs design init ${R}`) }),
      };
      return finish(d, [
        `surface: ${surface ? '.ai/design/' : 'none (run design init)'}`,
        `browser: ${browser ? `${browser.path} (${browser.from})` : d.browserProblem}`,
        `server: ${server.running ? `runs on port ${d.server.port} (pid ${server.pid})` : 'stopped (design server url starts it)'}`,
        `records: ${project ? `linked as ${project}, in ${d.records.dir}` : `not linked: the records are in ${d.records.dir}`}`,
        `git: ${!d.git.repo ? 'not a git repo' : d.git.tracked ? '.ai/design/ is tracked' : '.ai/design/ is ignored (run design track)'}`,
        `viewports: ${Object.entries(d.viewports).map(([n, s]) => `${n}=${s}`).join(' ') || 'none'}`,
      ].join('\n'));
    }
    case 'screen': {
      if (sub === 'remove') {
        const r = removeScreen(projectRoot, key, { force: opt.force === true });
        return finish(r, [`removed the screen ${key}`, ...r.warnings].join('\n'));
      }
      if (sub === 'rename') {
        const r = renameScreen(projectRoot, key, rest[2], { force: opt.force === true });
        return finish(r, [`the screen ${r.from} is now ${r.to} → ${r.file}${r.links.length ? `; links changed in ${r.links.join(', ')}` : ''}`, ...r.warnings].join('\n'));
      }
      if (sub !== 'add' || !key) throw usage('design screen add|remove|rename <root> <key> is required', 'screen');
      if (!KEY_RE.test(key)) throw refuse(`the screen key ${key} must be kebab-case`, agentFix('Run the command again with a key of lower-case letters, digits and single dashes, for example order-list.'));
      if (opt.order != null && !Number.isFinite(Number(opt.order))) throw refuse(`--order ${opt.order} is not a number`, agentFix('Run the command again with --order as a whole number: the place of the screen in its flow.'));
      const ready = foundation(projectRoot);
      if (!readManifest(projectRoot).screens[key] && !ready.ok) {
        const res = { ok: false, error: 'a new screen waits for the foundation', missing: ready.missing, next: ready.next, fix: agentFix(ready.next[0].do, ready.next[0].command, `wf.mjs design screen add ${R} ${key}`) };
        return finish(res, ['not added: a new screen waits for the foundation', ...ready.missing].join('\n'));
      }
      const r = addScreen(projectRoot, key, { title: opt.title ?? null, area: opt.area ?? null, flow: opt.flow ?? null, order: opt.order ?? null, workflow: opt.workflow ?? null, slice: opt.slice ?? null });
      return finish({ ok: true, ...r }, `${r.created ? 'added' : 'changed'} screen ${key} → ${r.file}`);
    }
    case 'foundation': {
      const f = foundation(projectRoot);
      const res = f.ok ? f : { ...f, error: 'the foundation is not ready: a new screen cannot be drawn yet', fix: agentFix(f.next[0].do, f.next[0].command, `wf.mjs design foundation ${R}`) };
      return finish(res, [`tokens: ${f.tokens}`, `components: ${f.none ? `none (${f.none})` : f.components}`, ...(f.ok ? ['ready'] : f.missing.flatMap((m, i) => [m, `  run: ${f.next[i].command}`]))].join('\n'));
    }
    case 'component': {
      if (!key || !['add', 'link', 'remove'].includes(sub)) throw usage('design component add|link|remove <root> <key> is required', 'component');
      if (sub === 'remove') {
        const r = removeComponent(projectRoot, key, { force: opt.force === true });
        return finish(r, `removed the component ${key}${r.screens.length ? `; still used on ${r.screens.join(', ')}` : ''}`);
      }
      const r = sub === 'add' ? addComponent(projectRoot, key, { title: opt.title ?? null, code: opt.code ?? null, name: opt.name ?? null, workflow: opt.workflow ?? null })
        : linkComponent(projectRoot, key, { code: opt.code ?? null, name: opt.name ?? null });
      return finish(r, r.component.code ? `component ${key}: ${r.component.name} in ${r.component.code}` : `component ${key}: new, the build must make it${r.file ? `; show it in ${r.file}` : ''}`);
    }
    case 'components': {
      if (sub === 'none') {
        const r = setNoComponents(projectRoot, opt.reason === true ? '' : opt.reason);
        return finish(r, `no components: ${r.reason}`);
      }
      if (sub === 'scan') {
        const found = scanComponents(projectRoot);
        const res = { ...found, components: found.components.map((c) => ({ ...c, ...(c.inLibrary ? {} : { add: `wf.mjs design component add ${R} ${c.key} --code ${word(c.code)} --name ${c.name}` }) })) };
        return finish(res, [...res.components.map((c) => `${c.inLibrary ? 'in the library' : 'not in the library'}  ${c.key}: ${c.name} in ${c.code} (${c.source})`),
          ...(res.truncated ? [`the first ${res.components.length} of ${res.total}: add the parts that the screens need, then scan again`] : [])].join('\n') || 'no components in the code');
      }
      if (sub === 'verify') {
        needWorkflow(projectRoot, key, 'components verify');
        const r = verifyComponents(projectRoot, key, { slice: opt.slice ?? null });
        const res = r.ok ? r : { ...r, error: `${r.problems.length} component(s) of the screens are not built or not used`, fix: agentFix('Repair each problem: build the component and record it with design component link, or use it in the code of the screen. Then run the command again.', `wf.mjs design components verify ${R} ${key}`) };
        return finish(res, [`${r.used.length} component(s) on ${r.screens.length} screen(s)${r.ok ? ': the code has and uses each' : ''}`, ...r.problems].join('\n'));
      }
      needKnownWorkflow(projectRoot, opt.workflow);
      const list = listComponents(projectRoot, { workflow: opt.workflow ?? null });
      return finish({ ok: true, components: list }, list.map((c) => `${c.key}: ${c.title} [${c.code ? `${c.name} in ${c.code}` : 'to build'}]${c.screens.length ? ` on ${c.screens.join(', ')}` : ''}`).join('\n') || 'no components');
    }
    case 'explore': {
      if (sub !== 'add' || !key) throw usage('design explore add <root> <key> is required', 'explore add');
      if (!KEY_RE.test(key)) throw refuse(`the explore key ${key} must be kebab-case`, agentFix('Run the command again with a key of lower-case letters, digits and single dashes.'));
      const r = addExplore(projectRoot, key, { title: opt.title ?? null, link: opt.link ?? null });
      return finish({ ok: true, ...r, file: `${SURFACE_REL}/explore/${key}.html` }, `explore ${key}${r.link ? ` (for ${r.link})` : ''}: write the sketch to .ai/design/explore/${key}.html`);
    }
    case 'list': {
      needKnownWorkflow(projectRoot, opt.workflow);
      const screens = listScreens(projectRoot, { workflow: opt.workflow ?? null });
      const problems = manifestProblems(readManifest(projectRoot), projectRoot);
      const res = { ok: !problems.length, screens, explore: listExplore(projectRoot), problems,
        ...(problems.length ? { error: `the manifest has ${problems.length} problem(s)`, fix: agentFix('Repair each problem: draw the page of a screen that has none, or take the screen off the surface with design screen remove.') } : {}) };
      return finish(res, [...screens.map((s) => `${s.key}: ${s.title} [${s.area ?? 'no area'}${s.flow ? ` / ${s.flow}${s.order != null ? ` #${s.order}` : ''}` : ''}] states ${s.states.join(' ') || 'none'}${s.links.length ? ` → ${s.links.join(', ')}` : ''}${(s.approvals ?? []).length ? ` (approved ${String(s.approvals.at(-1).commit ?? '').slice(0, 8)})` : ''}`),
        ...problems.map((p) => `problem: ${p}`)].join('\n') || 'no screens');
    }
    case 'tokens': {
      const rows = writeTokens(projectRoot);
      const from = rows.file ? posix(relative(projectRoot, rows.file)) : null;
      return finish({ ok: true, rows: [...rows], file: from, skipped: rows.skipped }, [
        `tokens.css: ${rows.length} token roles${!from ? ' (no DESIGN.md found: the root, .agents/context/ and docs/ hold none)' : rows.length ? ` from ${from}` : ` (${from} has no ## Colors table)`}`,
        ...rows.skipped.map((c) => `skipped: ${c} (one role name in each Role cell)`),
      ].join('\n'));
    }
    case 'track': {
      const r = trackSurface(projectRoot, { write: !opt.check });
      const res = { ok: r.tracked, ...r, ...(r.tracked ? {} : { error: r.would ? '.ai/design/ is ignored by git' : `.ai/design/ is not tracked: ${r.manual}`,
        fix: r.would ? agentFix('Write the git rule that keeps .ai/design/ tracked.', `wf.mjs design track ${R}`) : r.manual === 'not a git repo' ? personFix('The project is no git repo: run git init in it when the design is to be kept in git.') : personFix('A git ignore rule outside this repo hides .ai/design/. Add an exception for .ai/design/ to that rule.') }) };
      return finish(res, r.tracked ? `.ai/design/ is tracked${r.changed ? ' (.gitignore changed)' : ''}` : r.would ? `would change .gitignore: ${r.would.join(', ')}` : `not tracked: ${r.manual}`);
    }
    case 'check': {
      needKnownWorkflow(projectRoot, opt.workflow);
      const slug = typeof opt.workflow === 'string' ? opt.workflow : null;
      const r = await runChecks(projectRoot, { keys: rest.slice(1), workflow: slug });
      const found = r.new ?? [];
      const groups = failureGroups(found);
      const again = `wf.mjs design check ${R}${rest.slice(1).map((k) => ` ${k}`).join('')}${slug ? ` --workflow ${slug}` : ''}`;
      const whole = r.ran && !Object.keys(r.truncated ?? {}).length;
      // The one next action: the stage of the workflow, or what this run asks for.
      const next = !r.ran ? { ok: true, step: 'browser', why: r.reason, ask: 'No browser can run the screen checks. Install Chrome, Edge or Chromium (or set SDLC_BROWSER) and check again, or go on without the check?' }
        : found.length ? { ok: true, step: 'fix', why: `the check fails: ${found.length} failure(s) from ${groups.length} cause(s)`, do: 'Repair each cause as its move (design/<move>.md) or its do line says, then run the check again.', command: again }
          : slug && frontmatterOfDoc(workflowDir(projectRoot, slug), INDEX_NAME) ? designNext(projectRoot, slug)
            : { ok: true, step: 'done', why: 'the screens pass the check' };
      const keptScreens = [...new Set((r.failures ?? []).filter((f) => !(r.checked ?? []).includes(f.screen)).map((f) => f.screen))];
      const res = {
        ok: r.ran && !found.length, ran: r.ran, ...(r.ran ? {} : { reason: r.reason, error: r.reason, fix: r.fix }), at: r.at, browser: r.browser ?? null,
        checked: r.checked ?? [], failures: found, groups, truncated: r.truncated ?? {}, notices: r.notices ?? [],
        kept: { failures: r.kept ?? 0, screens: keptScreens }, passed: r.passed,
        ...(slug ? { question: approvalQuestion(slug) } : {}), next,
        ...(r.ran && found.length ? { error: next.why, fix: agentFix(next.do, again) } : {}),
      };
      const lines = failureLines(found);
      return finish(res, [
        r.ran ? `checked ${r.checked.length} screen(s): ${lines.length ? `${found.length} failure(s) from ${lines.length} cause(s)` : 'all pass'}` : `not checked: ${r.reason}`,
        ...lines, ...partialLines(r),
        ...(r.kept ? [`other screens: ${r.kept} failure(s) of an earlier check stay (${keptScreens.join(', ')})`] : []),
        // The approval question, only when nothing fails and everything was checked.
        ...(slug && r.ran && !found.length && whole && next.step !== 'ask' ? [`ask: ${approvalQuestion(slug)}`] : []),
        ...nextLines(next),
      ].join('\n'));
    }
    case 'approve': {
      needWorkflow(projectRoot, key, 'approve');
      const r = await approveDesign(projectRoot, key, { keys: rest.slice(2), slice: opt.slice ?? null, reason: opt.reason ?? null });
      return finish(r, r.ok
        ? [`approved ${r.screens.join(', ')} for ${r.slug} as ${r.version} in ${String(r.commit).slice(0, 8)}${r.committed ? '' : ' (no change since the last commit)'}; ${r.pictures} picture(s); ${r.checkFailures ?? 'no'} check failure(s)`, ...((r.remaining ?? []).length ? [`still to approve: ${r.remaining.join(', ')} (progress.design stays in-progress)`] : []), ...(r.next ? [`next: ${typeof r.next === 'string' ? r.next : r.next.route ?? r.next.command ?? ''}`] : [])].join('\n')
        : [`not approved: ${r.reason}`, ...(r.question ? [`ask: ${r.question}`] : [])].join('\n'));
    }
    case 'round': {
      needWorkflow(projectRoot, key, 'round');
      const r = saveRound(projectRoot, key, { reason: opt.reason === true ? null : opt.reason ?? null });
      return finish(r, !r.ok ? `no round: ${r.reason}` : r.saved ? `saved ${versionName(r.id)} of ${key}: ${r.changed.join(', ')}` : `no round: no page changed since ${versionName(r.id)}`);
    }
    case 'versions': {
      needWorkflow(projectRoot, key, 'versions');
      const v = listVersions(projectRoot, key);
      const line = (x) => `${versionName(x.id)}  ${x.at}  ${x.reason}`;
      return finish({ ok: true, ...v }, [...v.approved, ...v.rounds].map(line).join('\n') || `${key} has no version`);
    }
    case 'approved': {
      needWorkflow(projectRoot, key, 'approved');
      const v = approvedPages(projectRoot, key);
      const commit = v?.commit ?? frontmatterOfDoc(workflowDir(projectRoot, key), '02c-craft.md')?.['approval-commit'] ?? null;
      const picture = (k) => { const p = commit ? approvalPicture(projectRoot, commit, k) : null; return p && existsSync(p) ? p : null; };
      const pages = (v?.pages ?? []).map((p) => ({ ...p, picture: picture(p.key) }));
      const res = { ok: Boolean(v || commit), version: v?.version ?? null, commit, pages,
        ...(v || commit ? {} : { error: `${key} has no approved design`, fix: personFix(`The design of ${key} is not approved yet. Run /wf design ${key}.`) }) };
      return finish(res, v ? [v.version, ...pages.map((p) => `${p.key} ${p.file}${p.picture ? ` picture ${p.picture}` : ' (no picture)'}`), ...((v.missing ?? []).length ? [`not whole: ${v.missing.join('; ')}`] : [])].join('\n') : `no version: read the pages at commit ${commit ?? 'none'}`);
    }
    case 'restore': {
      const id = rest[2];
      needWorkflow(projectRoot, key, 'restore');
      if (!id) throw usage('design restore <root> <slug> <version> is required', 'restore');
      const r = restoreVersion(projectRoot, key, id);
      return finish(r, !r.ok ? `not restored: ${r.reason}` : [`restored ${versionName(r.restored)} as ${versionName(r.id)}: it needs a new approval`,
        ...(r.tokensDiffer ? ['the token sheet differs from that version: change the roles in DESIGN.md, then run design tokens, to bring its colors back'] : []),
        ...(r.componentsDiffer ? ['the component sheet differs from that version: the sheet is shared, so it stays as it is'] : [])].join('\n'));
    }
    case 'rounds': {
      if (sub !== 'drop') throw usage('design rounds drop <root> <slug> is required', 'rounds drop');
      needWorkflow(projectRoot, key, 'rounds drop');
      const dropped = dropRounds(projectRoot, key);
      return finish({ ok: true, dropped }, dropped ? `deleted the rounds of ${key}` : `${key} has no rounds`);
    }
    case 'viewports': {
      const pairs = rest.slice(1);
      const bad = pairs.find((p) => !/^[a-z0-9]+(-[a-z0-9]+)*=\d{2,5}x\d{2,5}$/.test(p));
      if (bad) throw refuse(`the viewport ${bad} is not name=WxH`, agentFix('Run the command again with each viewport as name=WIDTHxHEIGHT: a kebab-case name, and a size such as 375x812.', `wf.mjs design viewports ${R} phone=375x812 tablet=768x1024 desktop=1280x800`));
      const v = pairs.length ? setViewports(projectRoot, Object.fromEntries(pairs.map((p) => p.split('=')))) : readManifest(projectRoot).viewports;
      return finish({ ok: true, viewports: v }, Object.entries(v).map(([n, s]) => `${n}=${s}`).join(' '));
    }
    case 'areas': {
      const names = rest.slice(1);
      const a = names.length ? setAreas(projectRoot, names) : readManifest(projectRoot).areas ?? [];
      return finish({ ok: true, areas: a }, a.join(' ') || 'no areas');
    }
    case 'refs': {
      if (sub === 'add') {
        if (!key) throw usage('design refs add <root> <key> --file <path> is required', 'refs add');
        const r = addReference(projectRoot, { key, file: opt.file ?? null, kind: opt.kind ?? 'other', link: opt.link ?? null, note: opt.note ?? null });
        return finish({ ok: true, ...r }, `reference ${key}: ${r.file}`);
      }
      if (sub !== 'check') throw usage('design refs check|add <root> is required', 'refs');
      const r = checkReferences(projectRoot);
      const res = r.ok ? r : { ...r, error: 'a reference is not a readable file of the repo', fix: agentFix('Export each unreadable reference to a file in the repo, then record it with design refs add <root> <key> --file <path>.') };
      return finish(res, [`${r.references.length} reference(s)${r.ok ? ', all readable' : ''}`, ...r.references.filter((x) => !x.readable).map((x) => `unreadable: ${x.key}: ${x.problem}`)].join('\n'));
    }
    case 'comments': {
      if (sub === 'reply') {
        const [, k, thread] = rest;
        if (!k || !thread) throw usage('design comments reply <root> <key> <thread> --text t is required', 'comments reply');
        needScreen(projectRoot, k, 'comments reply');
        const r = addComment(projectRoot, k, { thread, text: opt.text === true ? '' : opt.text ?? '', author: 'agent', resolve: Boolean(opt.resolve) });
        return finish(r, r.ok === false ? `not saved: ${r.reason}` : `replied on ${k} thread ${thread}${opt.resolve ? ' and resolved it' : ''}`);
      }
      needKnownWorkflow(projectRoot, opt.workflow);
      for (const k of rest.slice(1)) needScreen(projectRoot, k, 'comments');
      const keys = rest.slice(1).length ? rest.slice(1) : opt.workflow ? listScreens(projectRoot, { workflow: opt.workflow }).map((s) => s.key) : null;
      const threads = openThreads(projectRoot, keys);
      return finish({ ok: true, threads }, () => commentsBrief(projectRoot, keys) || 'no open comment');
    }
    case 'capture-path': {
      const [, slug, slice, k] = rest;
      if (![slug, slice, k].every(namePart)) throw usage('design capture-path <root> <slug> <slice> <key> is required: each is a name, not a path', 'capture-path');
      needWorkflow(projectRoot, slug, 'capture-path');
      const file = capturePicture(projectRoot, slug, slice, k);
      mkdirSync(dirname(file), { recursive: true });
      return finish({ ok: true, file }, file);
    }
    case 'captures': {
      // After the screenshots of a slice: the dispatch commits no records, so the captures reach
      // the records here. An unlinked project keeps them in its own folder, with no commit.
      const [, slug, slice] = rest;
      if (![slug, slice].every(namePart)) throw usage('design captures <root> <slug> <slice> is required: each is a name, not a path', 'captures');
      needWorkflow(projectRoot, slug, 'captures');
      const dir = dirname(capturePicture(projectRoot, slug, slice, 'x'));
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort() : [];
      const commit = files.length ? commitDesignRecords(projectRoot, `design: captures of ${slug} ${slice}`) : null;
      return finish({ ok: true, slug, slice, files, commit }, `${files.length} capture(s) of ${slug} ${slice}${commit ? `; records commit ${String(commit).slice(0, 8)}` : ''}`);
    }
    case 'state': {
      out(canvasState(projectRoot, { repo: basename(projectRoot), writable: false }));
      return 0;
    }
    case 'publish': {
      // Inside the surface, in a folder of its own: the page is made from the screens, and is no screen.
      const file = resolve(typeof opt.out === 'string' ? opt.out : join(surfaceDir(projectRoot), 'published', 'canvas.html'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, snapshotHtml(projectRoot, { repo: basename(projectRoot) }));
      return finish({ ok: true, file }, `canvas page: ${file}`);
    }
    case 'migrate': {
      const r = migrateDesign(projectRoot, { slugs: rest.slice(1), write: !opt.check });
      const first = r.results.find((x) => x.blocked);
      const res = r.ok ? r : { ...r, error: `${r.results.filter((x) => x.blocked).length} workflow(s) cannot be migrated yet`, fix: first.fix };
      return finish(res, r.results.map(migrateLine).join('\n') || 'no workflow has boards');
    }
    default:
      throw usage(`design has no command ${verb}`);
  }
}

async function runServer(sub, opt, out, root = null) {
  const hostOf = (a) => String(a).replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  const finish = (r, text, code = null) => {
    if (r.ok === false) { r.error ??= r.reason ?? 'the command failed'; r.fix = asFix(r.fix) ?? personFix(r.error); }
    if (opt.json) out(r); else { out(text); if (r.ok === false) process.stderr.write(`${fixLines(r.fix).join('\n')}\n`); }
    return code ?? (r.ok === false ? 1 : 0);
  };
  /** The address of this computer, and the address on the tailnet for a phone, or null. */
  const addresses = (s) => {
    const port = s.port ?? serverPort();
    const hosts = [...new Set([...(s.addresses ?? []).map(hostOf), ...tailnetAddresses()])].filter((h) => h && h !== '127.0.0.1' && h !== 'localhost');
    return { computer: `http://127.0.0.1:${port}/`, phone: hosts.length ? `http://${hosts[0]}:${port}/` : null };
  };
  const startFix = (s) => (s.pid ? personFix(`The process ${s.pid} holds the server pid and does not answer. End that process, then run design server start again.`) : personFix('The design server did not start. Run node scripts/design-server.mjs in a terminal to see why: another program may hold its port.'));
  switch (sub) {
    case 'start': {
      const port = opt.port ? Number(opt.port) : serverPort();
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw refuse(`--port ${opt.port} is not a port`, agentFix('Run the command again with --port as a number from 1 to 65535, or with no --port.'));
      const s = await startServer({ port });
      const a = addresses(s);
      return finish({ ok: s.running, ...s, ...(s.running ? a : { error: s.reason, fix: startFix(s) }) }, s.running ? `design server ${s.started ? 'started' : 'runs'}\ncomputer: ${a.computer}\nphone: ${a.phone ?? 'none (no tailnet address)'}` : s.reason);
    }
    case 'stop': {
      const s = await stopServer();
      return finish({ ok: true, ...s }, s.stopped ? 'design server stopped' : 'the design server did not run');
    }
    case 'status': {
      const s = await serverStatus();
      const t = taskStatus();
      const a = addresses(s);
      // A stopped server is a state, not a failure of the command: the exit code tells it.
      return finish({ ok: true, ...s, ...a, task: t }, [`server: ${s.running ? `runs (pid ${s.pid}) ${a.computer}` : 'stopped'}`,
        `scheduled task: ${!t.supported ? 'not on this platform' : t.installed ? `installed${t.targetExists === false ? ' — its script is gone: run design server install again' : ''}` : 'not installed'}`].join('\n'), s.running ? 0 : 1);
    }
    case 'url': {
      const abs = root ? rootOf(root) : null;
      if (abs) needSurface(abs);
      let s = await serverStatus();
      let started = false;
      let problem = null;
      if (!s.running && !opt['no-start']) {
        const r = await startServer({ port: opt.port ? Number(opt.port) : serverPort() });
        started = Boolean(r.started);
        if (!r.running) problem = r;
        s = r;
      }
      // With a root: the canvas of that repo, under the name that the server knows it by. A repo
      // that the server does not list yet is added, and the result says so.
      const same = (a, b) => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
      const known = abs ? readDesignRepos().find((x) => same(x.root, abs)) ?? null : null;
      const repo = abs ? known ?? registerRepo(abs) : null;
      const slug = typeof opt.workflow === 'string' ? opt.workflow : null;
      if (abs && slug) needKnownWorkflow(abs, slug);
      const path = repo ? `r/${encodeURIComponent(repo.name)}/${slug ? `?workflow=${encodeURIComponent(slug)}` : ''}` : '';
      const a = addresses(s);
      const res = {
        ok: !problem, running: Boolean(s.running), started, port: s.port ?? serverPort(),
        computer: `${a.computer}${path}`, phone: a.phone ? `${a.phone}${path}` : null,
        ...(repo ? { repo: repo.name, registered: !known } : {}), ...(slug ? { workflow: slug } : {}),
        ...(problem ? { error: problem.reason, fix: startFix(problem) } : {}),
      };
      return finish(res, [
        `computer: ${res.computer}`,
        `phone: ${res.phone ?? 'none (no tailnet address)'}`,
        ...(started ? ['(the design server was stopped: it runs now)'] : []),
        ...(repo && !known ? [`(added ${repo.name} to the repos of the design server)`] : []),
        ...(!s.running ? [problem ? `(the server did not start: ${problem.reason})` : '(the server is stopped: run design server start)'] : []),
      ].join('\n'));
    }
    case 'install': {
      const r = installTask();
      return finish({ ok: Boolean(r.installed), ...r, ...(r.installed ? {} : { error: r.reason, fix: personFix(`The scheduled task was not made: ${r.reason}. Start the server by hand with design server start.`) }) }, r.installed ? `scheduled task ${r.task}: the design server starts at logon` : r.reason);
    }
    case 'uninstall': {
      const r = uninstallTask();
      return finish({ ok: Boolean(r.removed), ...r, ...(r.removed ? {} : { error: r.reason, fix: personFix(`The scheduled task was not removed: ${r.reason}.`) }) }, r.removed ? 'scheduled task removed' : r.reason);
    }
    default:
      throw usage('design server start|stop|status|url|install|uninstall is required', 'server');
  }
}

/** One line per workflow of a migration, and the lines of what it waits for. */
function migrateLine(r) {
  if (r.skip) return `${r.slug}: ${r.skip}`;
  const keys = Object.entries(r.keys ?? {}).map(([b, k]) => `${b} → ${k}`).join(', ');
  if (r.blocked) {
    return [`${r.slug}: not migrated`,
      ...r.conflicts.map((c) => `  the screen ${c.screen} exists${c.uncommitted ? ', with changes that no commit holds' : ''}: the board ${c.board} maps to the same key`),
      ...r.invalid.map((x) => `  the board manifest ${x.file} does not read: ${x.error}`),
      ...r.exports.map((e) => `  export ${e.file} from ${e.canvas} (read the artifact, save its page there), then run migrate again`),
      ...r.missing.map((f) => `  the board file ${f} is missing`),
      ...fixLines(r.fix).map((l) => `  ${l}`)].join('\n');
  }
  if (!r.migrated) return `${r.slug}: would migrate revisions ${r.revisions.map((n) => n ?? 'working').join(', ')}${r.confirmed ? `, approve r${r.confirmed}` : ''}: ${keys}`;
  return [`${r.slug}: ${r.resumed ? 'went on and ' : ''}migrated ${Object.keys(r.commits).join(', ')}${r.approved ? `; approved ${r.screens.join(', ')} at ${r.approved.slice(0, 10)}` : ''}; ${r.captures} captures`,
    `  ${keys}`, ...r.warnings.map((w) => `  ${w}`)].join('\n');
}
