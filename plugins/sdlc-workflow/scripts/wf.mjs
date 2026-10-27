#!/usr/bin/env node
/**
 * scripts/wf.mjs — the deterministic parts of /wf, in code. skills/wf/scripts/wf.mjs runs it.
 *
 *   dispatch <root> [--host claude|codex|pi] [--json] [--] <token>...
 *             Step 0 of SKILL.md: the key, the reference and where the key's arguments start.
 *             Pass a token that does not match ^[A-Za-z0-9#._/-]+$ as @. A `close-ask:` line names
 *             each open workflow whose branch is merged. A `first-run:` line says that the repo has
 *             no .ai/ folder, so the setup runs before the key.
 *             Example: wf.mjs dispatch . --host claude -- implement demo api
 *   help     [<command>]
 *             the commands, or the forms and the flags of one command (also <command> --help)
 *             Example: wf.mjs help record
 *   describe [--json]
 *             every CLI form and every function of the library of wf.mjs run, each with one example
 *             Example: wf.mjs describe
 *   run      <root> <script.mjs> [<arg>...] [--slug s] [--dry-run] [--json]
 *             run a script in the project: its default export gets { wf, open, args }, and its
 *             return value prints as JSON. All or nothing: a script that throws changes nothing.
 *             Each changed workflow gets one commit. --dry-run lists the changes and applies none
 *             Example: wf.mjs run . .ai/workflows/demo/.draft/verify-all.mjs --slug demo
 *   path     <root> [<slug> [<file>]]
 *             the real place of the records folder, a workflow folder or a file in it: a linked
 *             project keeps them in the records repo clone, and only the drafts stay local
 *             Example: wf.mjs path . demo verify-evidence/api/run.txt
 *   records  <link|status|sync|push|close> <root> [<project>|<slug>] [--json]
 *             the records repo: link a project (its records move into the clone), show the
 *             clone, pull the work of other machines, push a workflow, squash a closed one
 *             Example: wf.mjs records status .
 *   lease    <claim|release|show> <root> <slug> [--take] [--json]
 *             the lease of a workflow: the one machine that writes its records now (--take: an
 *             expired lease of another machine, after the person said yes)
 *             Example: wf.mjs lease claim . demo
 *   msg      <post|list|read> <root> <slug> [<id>] [--kind k --text t] [--to <project>] [--unread]
 *             messages between machines and projects: one file each in the workflow's inbox/.
 *             --to reads a project that is not linked here from the records repo, and a post
 *             to it pushes only the message file
 *             Example: wf.mjs msg post . demo --kind note --text "the API is ready"
 *   design   <init|screen add|explore add|list|tokens|track> <root> ...
 *             the design surface of the repo, .ai/design/: screens, the manifest, the token sheet
 *             and the git rule (lib/design-cli.mjs lists every command)
 *             Example: wf.mjs design list .
 *   modernize <root> <slug> [--check] [--json]
 *             convert an old workflow: the record files into the YAML layout, and the stages
 *             shape and handoff into intake and ship in the index (--check: only report)
 *             Example: wf.mjs modernize . demo --check
 *   page     <brief|put|check> <root> <slug> [--json]
 *             the page of a brainstorm: the brief of the page agent, the check and move of its
 *             draft (.draft/page.html → page/index.html), or the check of the page in place
 *             Example: wf.mjs page check . demo
 *   gh       <flush|status> [<root>] [--json]
 *             the GitHub layer: send the queued issue edits and comments in order, or show what
 *             is queued and parked. Each state change of a workflow queues one progress edit by
 *             itself. An entry that fails three flushes is parked, so the rest go on
 *             Example: wf.mjs gh status .
 *   gh       backfill <root> [--json]
 *             queue one progress edit for each workflow of the project, so a workflow from
 *             before the layer gets its issue; an issue that another machine made is reused
 *             Example: wf.mjs gh backfill .
 *   doctor   <root> [--json]
 *             the checks of a project: a warn: line for each pre-push command that is in no suite
 *             of the test profile; exit 0
 *             Example: wf.mjs doctor .
 *   setup    <root> [--about "<one line>"] [--ignore] [--json]
 *             the first-run setup: the .ai/ tree, the project line, the merge method and the gaps
 *             of ship (--ignore: add .ai/ to .gitignore, after the person said yes)
 *             Example: wf.mjs setup . --about "a CLI for photo backups"
 *   close    <root> <slug> [--reason r] [--note n] [--decline]
 *             close a workflow: the close record and the index fields (--decline: record the
 *             person's no to the close question, so it is not asked again)
 *             Example: wf.mjs close . demo --reason merged
 *   status   <root> [<slug>] [--json]
 *             every workflow with its group and next command; with a slug, its stage files,
 *             slices (with the verify result and the convergence), cost and next routes
 *             Example: wf.mjs status . demo
 *   status   <root> <slug> --brief [--json]
 *             where the workflow stands, in one block under 2 KB: the stage and the slice, step
 *             n of N, the open questions and deferrals, the last driver run, the next command
 *             Example: wf.mjs status . demo --brief
 *   index    <root> [--check]
 *             rebuild .ai/workflows/INDEX.md from the 00-index.md files
 *             Example: wf.mjs index . --check
 *   cost     <root> <slug> [--json]
 *             the sums of the slug's cost.jsonl per key
 *             Example: wf.mjs cost . demo
 *   stamp    <type> [--slug s] [--slice x]
 *             the frontmatter template of an artifact type, with every required field
 *             Example: wf.mjs stamp plan --slug demo --slice api
 *   board    add <root> <slug> <item|thread|area> (--file <entries.json> | --key k [--kind k]
 *                [--thread t] [--text x] [--why w] [--source s] [--name n] [--area a] [--side s])
 *             add an item, a thread or an area to the brainstorm board; the file holds one
 *             entry or a list. The whole board is checked against the schema before the write
 *             Example: wf.mjs board add . ideas item --key cap-warns --kind decision --thread limits --text "A cap warns." --source person
 *   board    move <root> <slug> <item>... (--to <thread> | --new <thread> --name n [--area a])
 *             move items into a thread; --new makes the thread first
 *             Example: wf.mjs board move . ideas cap-warns cap-per-run --new caps --name "Spending caps" --area cost
 *   board    regroup <root> <slug> <thread>... --to <area>
 *             move threads into another area
 *             Example: wf.mjs board regroup . ideas caps alerts --to cost
 *   board    remove <root> <slug> <item>...
 *             remove items that nothing else on the board names (a work packet, a brief, a
 *             budget, a sketch, a tension, a replaced-by)
 *             Example: wf.mjs board remove . ideas old-idea
 *   receipt  <root> <slug> <slice> [--suites a,b] [--json]
 *             run the suites of the test profile (the implement suites, or --suites) at HEAD,
 *             and write .test-receipt-<slice>.json only when every suite passed; exit 1 else.
 *             A tracked change outside .ai that HEAD lacks goes into its dirty list, with its hash
 *             Example: wf.mjs receipt . demo api
 *   receipt  <root> <slug> <slice> --check [--json]
 *             exit 0 when the receipt still names the tree: no code commit after its sha, and the
 *             changes of its dirty list with the same hashes; exit 1 and the reason else
 *             Example: wf.mjs receipt . demo api --check
 *   slice    drop <root> <slug> <slice> --reason r [--json]
 *             drop a slice from the roster: the roster, the slice record and the index say
 *             dropped, with the reason; its stage records stay
 *             Example: wf.mjs slice drop . demo docs --reason "the API docs cover it"
 *   slice    move <root> <slug> <slice> --to <slug> --reason r [--json]
 *             move a slice to the roster of another workflow: the slice record goes with it,
 *             and the source says dropped, with moved-to
 *             Example: wf.mjs slice move . demo ui --to demo-ui --reason "its own PR"
 *   decide   add <root> <slug> --answer a [--key k] [--question q] [--kind k] [--by b]
 *                [--packet p] [--slice s] [--files f,g] [--stage s] [--rewrote f,g] [--json]
 *             Example: wf.mjs decide add . demo --key db --question "Which database?" --answer postgres
 *   decide   add <root> <slug> --file <answers.json> [--by b] [--stage s] [--json]
 *             record a decision; a live entry with the same key and scope is superseded, and
 *             each record that names it gets superseded-decisions.<old id>: <new id>
 *             Example: wf.mjs decide add . demo --file .ai/workflows/demo/.draft/answers.json
 *   decide   list <root> <slug> [--packet p] [--slice s] [--files f,g] [--by b] [--kind k] [--all] [--json]
 *             the live entries in a scope (--all: every entry). Use it to read what is decided;
 *             use decide answered to test one key before a question is asked
 *             Example: wf.mjs decide list . demo --slice api
 *   decide   answered <root> <slug> --key k [--packet p] [--slice s] [--files f,g] [--json]
 *             exit 0 and the entry when a live entry answers the key, exit 1 when none does.
 *             Use it before a question is asked; use decide list to read every decision
 *             Example: wf.mjs decide answered . demo --key db
 *   decide   hold <root> <slug> --key k --question q --stage s [--slice s]
 *                [--options "a|b"] [--recommended a] [--json]
 *             publish a question that a running stage holds while it continues: the entry goes
 *             into open-questions of the index, so a look-in can ask it by its exact key; a
 *             second hold of the key replaces it, and decide add with the key settles it
 *             Example: wf.mjs decide hold . demo --key db --question "Which database?" --stage implement
 *   decide   drop <root> <slug> <questions.json> [--packet p] [--slice s] [--json]
 *             split a list of questions ({key, ...}) into the ones to ask and the answered ones
 *             Example: wf.mjs decide drop . demo .ai/workflows/demo/.draft/questions.json
 *   decide   import <root> <slug>
 *             copy po-answers.md and steer.md into the store; a second run adds nothing
 *             Example: wf.mjs decide import . demo
 *   step     start <root> <slug> <slice> <n> [--title t]
 *             Example: wf.mjs step start . demo api 3 --title "add the route"
 *   step     done <root> <slug> <slice> <n> (--sha s|HEAD | --no-change)
 *             Example: wf.mjs step done . demo api 3 --sha HEAD
 *   step     stop <root> <slug> <slice> [--reason r] [--kind fail|gate|question]
 *             Example: wf.mjs step stop . demo api --kind gate --reason "the plan names a manual check"
 *   step     retry <root> <slug> <slice>
 *             Example: wf.mjs step retry . demo api
 *   step     complete <root> <slug> <slice> [--sha s|HEAD] [--skip n,... --reason r]
 *             record a plan step in steps.jsonl: done needs the step commit or --no-change; a
 *             gate of the plan or a question to the person is a stop of its own kind, and only a
 *             fail counts toward the split question; complete refuses an open step unless --skip
 *             Example: wf.mjs step complete . demo api --sha HEAD
 *   step     where <root> <slug> [<slice>] [--json]
 *             the done steps of the slice, the step that runs, the next open step, the hard-stops.
 *             Only the steps of one slice: status --brief gives where the whole workflow stands
 *             Example: wf.mjs step where . demo api
 *   profile  show <root> [--json]
 *             the suites of the test profile with their commands and times
 *             Example: wf.mjs profile show .
 *   profile  set <root> <suite> --command c --estimate seconds
 *             the command of a suite and the estimate of intake, with no run
 *             Example: wf.mjs profile set . unit --command "npm test" --estimate 30
 *   profile  record <root> <suite> <seconds>
 *             a real run of a suite: its time replaces the estimate
 *             Example: wf.mjs profile record . unit 42
 *   profile  run <root> <suite> [--json]
 *             run the command of a suite in the root and record its time; exit 1 when it fails
 *             Example: wf.mjs profile run . unit
 *   profile  timebox <root> <stage> [--work seconds] [--json]
 *             the time box of a stage agent, from the suites that the stage runs
 *             Example: wf.mjs profile timebox . verify
 *   profile  hooks <root> [--json]
 *             each command of the pre-push and pre-commit hooks of the repo (lefthook.yml,
 *             .husky/, .pre-commit-config.yaml, .git/hooks), its file and the suite that runs it
 *             Example: wf.mjs profile hooks .
 *   progress set <root> <slug> [--stage s] [--slice x] [--status running|waiting|stopped|done]
 *                [--run id] [--driver d] [--reason r] [--resume cmd]
 *             write progress.json: where a run stands
 *             Example: wf.mjs progress set . demo --stage implement --slice api --status running
 *   progress show <root> <slug> [--json]
 *             where the driver run stands, a dead run as stopped, with the ETA of the slice. Only
 *             the run: status --brief gives where the whole workflow stands
 *             Example: wf.mjs progress show . demo
 *   defer    check <root> <slug> [--next <slice>] [--json]
 *             run the clearing-probe of each open deferral; exit 1 when the next slice needs
 *             an open deferral now (a person task)
 *             Example: wf.mjs defer check . demo --next ui
 *   brief    <root> <slug> <stage> [<slice>] [--json]
 *             the brief of a stage agent: the stage card, the slice and its acceptance criteria,
 *             the plan sections of the stage, and the live decisions in scope
 *             Example: wf.mjs brief . demo implement api
 *   findings add <root> <slug> <found.json> [--source review|audit|pr-bot] [--slice x]
 *                [--dimensions a,b] [--files a,b] [--run id] [--json]
 *             merge the findings of one run into findings.yaml by the merge law; --files (or
 *             affectedFiles of found.json) is the scope: a finding in another file is dropped
 *             Example: wf.mjs findings add . demo .ai/workflows/demo/.draft/found.json --source review --slice api
 *   findings list <root> <slug> [--source s] [--slice x] [--open] [--json]
 *             the entries of the ledger (--open: open, deferred and could-not-fix only)
 *             Example: wf.mjs findings list . demo --open
 *   findings set <root> <slug> <id> <status> [--reason r] [--commit sha] [--decision D-n]
 *             the triage status of one entry; --commit names the commit of a fix step;
 *             --decision dismisses a finding that goes against a live decision of the person
 *             Example: wf.mjs findings set . demo F-3 fixed --commit 1a2b3c
 *   findings table|metrics <root> <slug> [--source s] [--slice x] [--json]
 *             the verdict and the findings table, or the metric fields, of a review file
 *             (the source defaults to review, the scope to the whole packet)
 *             Example: wf.mjs findings table . demo --slice api
 *   record   put <root> <slug> [<draft>...] [--json]
 *             check each draft (.draft/<old name>.md, or every draft) and write it into its
 *             section of the record files; a draft with errors stays, and exit 1
 *             Example: wf.mjs record put . demo 04-plan-api.md
 *   record   get <root> <slug> <name|index>... [--fields a,b] [--json]
 *             records by their old file names, as Markdown with frontmatter (either layout);
 *             several names in one call; --fields prints only those frontmatter fields
 *             Example: wf.mjs record get . demo index 03-slice --fields status,best-first-slice
 *   record   draft <root> <slug> <name|index> [--json]
 *             write one record as its draft (.draft/<old name>.md) to change its body: edit the
 *             draft, then run record put
 *             Example: wf.mjs record draft . demo 04-plan-api
 *   record   set <root> <slug> <name|index> <path=value>...
 *             merge fields into one record; a value reads as YAML, null deletes the field.
 *             Paths: field=v, a.b=v, list[<slug>].field=v, list[0].field=v, list+=v, list-=v.
 *             A value outside the enum of the schema is refused with the allowed values
 *             Example: wf.mjs record set . demo 03-slice slices[api].status=in-progress
 *   record   stage-done <root> <slug> <stage> [<slice>] [--next "<invocation>"] [--status s]
 *             the end of a stage in the index: current-stage, progress.<stage>, next-command,
 *             next-invocation (the default route of the stage, or --next) and workflow-files
 *             Example: wf.mjs record stage-done . demo implement api
 *   record   list|where|migrate <root> <slug> [<old path>]
 *             the records of a workflow; the new place of an old path; move a workflow of
 *             the old layout into the record files, with redirects.yaml
 *             Example: wf.mjs record list . demo
 *   record   evidence <root> <slug> [--check] [--json]
 *             the size of the evidence; delete the oldest runs over the 200 MB cap (put does
 *             this too), never the newest run (--check: say what it would delete)
 *             Example: wf.mjs record evidence . demo --check
 *   consent  check|grant|revoke <root> <slug> [--json]
 *             whether the model may start /wf for the workflow (its own consent, or its list's);
 *             grant records it only from the answer event of the person's yes to the consent
 *             question, which the question hook wrote; check exits 1 and prints the question
 *             Example: wf.mjs consent check . demo
 *   base     check <root> [--base b] [--remote r] [--json]
 *             fetch the base and compare it with the remote one: fast-forward a base that is only
 *             behind; exit 1 when it has diverged (cut no branch from it)
 *             Example: wf.mjs base check . --base main
 *   worktree add <root> <slug> <name> <commit> [--json]
 *             make a detached copy of the repo at <commit> in .scratch/worktrees/<slug>/<name>/
 *             and print its path; the same copy at the same commit is kept
 *             Example: wf.mjs worktree add . demo before HEAD~3
 *   worktree remove <root> <slug> [<name>] [--json]
 *             remove the copies of the workflow, or one of them; a copy that holds a link is kept
 *             and reported; exit 1 when a copy stays
 *             Example: wf.mjs worktree remove . demo
 *   ship     facts <root> [--base b] [--json]
 *             the merge rules of the repo: allowed methods, rulesets, protection, merge queue
 *             Example: wf.mjs ship facts . --base main
 *   ship     ready <root> [<slug>] [--json]
 *             the gaps before ship that a script sees; with a slug, each gap is a person task of
 *             the workflow; exit 1 when there is a gap
 *             Example: wf.mjs ship ready . demo
 *   ship     merge <root> <slug> [--pr N] [--print]
 *             merge the PR by the method of the facts, or print the one command when a review
 *             or a merge queue is in the way (exit 3)
 *             Example: wf.mjs ship merge . demo --print
 *   ship     finish <root> <slug>
 *             after the merge: fast-forward and switch to the base, delete the branch, and mark
 *             the workflow shipped
 *             Example: wf.mjs ship finish . demo
 *   drive    <root> <slug> [<slice>] [--answered <file.json>] [--delegate] [--resume <run>]
 *            [--time-box <minutes>] [--json]
 *             run the yolo driver under Node, each agent as one `codex exec` call; prints the
 *             outcome, and keeps the run's records in .scratch/wf/drive/<run>/
 *             Example: wf.mjs drive . demo api --time-box 90
 */
import { spawn, spawnSync } from 'node:child_process';
import { fromGitBashPath, undoGitBashPath } from '../lib/msys.mjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildBrief } from '../lib/brief.mjs';
import { putChecked } from '../lib/record-put.mjs';
import { driveScript, readRun } from '../lib/drive.mjs';
import { checkConsent, grantConsent, revokeConsent } from '../lib/consent.mjs';
import { closeCandidates, closeWorkflow } from '../lib/closing.mjs';
import { needsSetup, setupProject } from '../lib/setup.mjs';
import { MAX_FAILS, backfill, flushOutbox, issueComments, layerOf, layerStatus, noteMessage, readOutbox } from '../lib/github-layer.mjs';
import { afterChange, inBackground } from '../lib/after-change.mjs';
import { healthLine, linkProject, liveRef, logRecordsFailure, machineName, productRepoGapLines, productRepoGaps, pushRef, pushWorkflow, recordsStatus, squashWorkflow, syncRecords, workflowHealth } from '../lib/records-sync.mjs';
import { claimLease, heldBefore, leaseLostLine, releaseLease, renewIfMine, showLease } from '../lib/leases.mjs';
import { importComments, listMessages, postMessage, readMessage } from '../lib/messages.mjs';
import { checkPage, pageBrief, putPage } from '../lib/brainstorm-page.mjs';
import { modernizeWorkflow } from '../lib/modernize.mjs';
import { runDesign } from '../lib/design-cli.mjs';
import { baseCheck, defaultRun, finishShip, mergeCommand, readyGaps, shipFacts } from '../lib/last-mile.mjs';
import { addScratchWorktree, removeScratchWorktrees } from '../lib/scratch-worktree.mjs';
import { addDecision, answeredBy, decisionLine, decisionsOf, dropAnswered, importLegacy, liveDecisions } from '../lib/decisions.mjs';
import { SAFE_TOKEN, UNSAFE, diskFacts, dispatch, dispatchLine } from '../lib/dispatch.mjs';
import { checkDeferrals, deferralLine } from '../lib/deferrals.mjs';
import { OPEN_STATUSES, findingsTable, mergeRun, metricsOf, readLedger, setStatus, verdictOf, writeLedger } from '../lib/findings.mjs';
import { progressLine, progressOf, readProgress, writeDriverOutcome, writeProgress } from '../lib/progress.mjs';
import { pruneEvidence } from '../lib/evidence.mjs';
import { DRAFT_DIR, INDEX_NAME, draftPath, draftsOf, frontmatterOfDoc, listDocs, markSuperseded, migrateWorkflow, putDraft, readDoc, redirectOf, setFields } from '../lib/records.mjs';
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.mjs';
import { PATH_FORMS } from '../lib/record-path.mjs';
import { SLICE_STAGES, SMALL_STAGE_FILES, STAGE_FILES, stageDone } from '../lib/stage-done.mjs';
import { dropSlice, moveSlice } from '../lib/slice-ops.mjs';
import { BOARD_KINDS, boardAdd, boardMove, boardRegroup, boardRemove } from '../lib/board-ops.mjs';
import { appendStep, branchOf, commitIdentity, gitRevParse, lastSlice, planProblems, readPlan, readSteps, sliceRefusal, stepCheckout, whereLine, whereOf } from '../lib/steps.mjs';
import { STAGE_SUITES, profileLines, readProfile, recordRun, setSuite, timeBox } from '../lib/test-profile.mjs';
import { hookSuites } from '../lib/repo-hooks.mjs';
import { receiptState, treeChanges } from '../lib/test-receipt.mjs';
import { loadRegistry, reservedWords } from '../lib/registry.mjs';
import { scanWorkflowIndexes } from '../lib/workflow-index.mjs';
import { stageYoloDriver } from './stage-yolo-driver.mjs';
import { linkedProject, localWorkflowsRoot, recordPathOf, recordsHome, workflowDir, workflowsRoot } from '../lib/records-root.mjs';
import { briefText, costSummary, count, statusBrief, statusOf, stepGit } from '../lib/wf-status.mjs';
import { decideAdd, defOfType, holdQuestion, noRecord, pick, recordName, resolveRef, schemaOf, setRecordPaths, settleQuestion } from '../lib/wf-ops.mjs';
import { runScript } from '../lib/wf-api.mjs';

// The status and record bodies live in lib/, so the library calls the same functions.
export { briefText, defOfType, setRecordPaths, statusBrief, statusOf };

// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USAGE = 'Usage: wf.mjs <dispatch|status|index|cost|stamp|decide|step|progress|profile|defer|brief|findings|record|consent|base|ship|close|setup|gh|records|lease|msg|page|modernize|design|drive> ...';
const REFERENCE_ROOT = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const wfRoot = workflowsRoot;
const out = (v) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

function flags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (['json', 'check', 'all', 'open', 'delegate', 'print', 'decline', 'ignore', 'take', 'unread', 'resolve', 'no-change', 'brief', 'dry-run'].includes(name)) opt[name] = true;
      else {
        const { value, repaired } = undoGitBashPath(argv[(i += 1)]);
        if (repaired) process.stderr.write(`wf.mjs: --${name} began with the Git install path, which Git Bash put in front of /wf; it is set to ${value}\n`);
        opt[name] = value;
      }
    } else pos.push(fromGitBashPath(a));
  }
  return { pos, opt };
}

// ---------------------------------------------------------------- drive

/** The yolo driver on Codex: the script runs here, and each agent runs as `codex exec`. */
async function runDrive(pos, opt) {
  const [root, slug, slice] = pos;
  if (!root || !slug) throw new Error('drive: <root> <slug> are required');
  const projectRoot = resolve(root);
  const staged = stageYoloDriver(projectRoot, { slug });
  const answered = opt.answered ? JSON.parse(readFileSync(resolve(opt.answered), 'utf8')) : null;
  if (answered && !Array.isArray(answered)) throw new Error('drive: --answered must name a JSON array of answers');
  const run = opt.resume || `${nowIso().replace(/[-:]/g, '')}-${slug}`;
  const runDir = join(projectRoot, '.scratch', 'wf', 'drive', run);
  if (opt.resume && !existsSync(runDir)) throw new Error(`drive: no earlier run ${run} in .scratch/wf/drive/`);
  const args = {
    projectRoot, referenceRoot: REFERENCE_ROOT, slug, host: 'codex', runId: run, models: staged.models, recordsRoot: staged.recordsRoot,
    ...(slice ? { slice } : {}), ...(answered ? { answered } : {}), ...(opt.delegate || staged.delegate ? { delegate: true } : {}),
  };
  const r = await driveScript({
    source: readFileSync(staged.scriptPath, 'utf8'), args, cwd: projectRoot, runDir,
    resume: opt.resume ? readRun(runDir) : undefined,
    timeoutMs: opt['time-box'] ? Number(opt['time-box']) * 60_000 : undefined,
    say: (line) => process.stderr.write(`[drive ${run}] ${line}\n`),
  });
  // The outcome stays on this machine for `status --brief`.
  try {
    const o = r.result ?? {};
    writeDriverOutcome(join(wfRoot(projectRoot), slug), { run, driver: 'yolo', host: 'codex', ok: Boolean(o.ok), status: o.ok ? 'done' : o.questions?.length ? 'waiting' : 'stopped', stoppedAt: o.stoppedAt ?? null, reason: o.reason ?? null, route: o.route ?? null, questions: Array.isArray(o.questions) ? o.questions.length : 0 });
  } catch { /* status --brief then shows the progress record only */ }
  out(opt.json ? { run, runDir, ...r } : { run, outcome: r.result, agents: r.totals.agents, failed: r.totals.failed, usage: r.totals.usage });
  return r.result && r.result.ok ? 0 : 3;
}

// ---------------------------------------------------------------- dispatch

async function runDispatch(pos, opt) {
  const [root, ...tokens] = pos;
  if (!root) throw new Error('dispatch: <root> is required');
  const safe = tokens.map((t) => (t === UNSAFE || SAFE_TOKEN.test(t) ? t : UNSAFE));
  const projectRoot = resolve(root);
  // A linked project pulls the work of other machines first, so the dispatch sees it.
  const sync = linkedProject(projectRoot) ? syncRecords(projectRoot, { holds: (s) => showLease(projectRoot, s).mine === true }) : null;
  const r = dispatch(loadRegistry(PLUGIN_ROOT), safe, diskFacts(projectRoot), { host: opt.host ?? null });
  r.sync = sync;
  const target = sync ? slugAtDispatch(projectRoot, r, safe) : null;
  r.lease = target ? leaseAtDispatch(projectRoot, target, opt.host ?? null) : null;
  // The registry is generated in the clone: a pull that moved a folder rebuilds it.
  if (sync && (sync.pulled.length || sync.folded.length)) await reconcileIndex(projectRoot);
  r.health = target ? healthLine(workflowHealth(projectRoot, target)) : null;
  // The person's comments on the issue reach the inbox of the workflow that the call acts on.
  r.imported = target && layerOf(projectRoot) ? importIssueComments(projectRoot, target) : [];
  r.parked = layerOf(projectRoot) ? layerStatus(projectRoot).parked.length : 0;
  // A linked project whose product repo tracks or does not ignore the record folder is warned.
  r.repoGaps = sync ? productRepoGapLines(productRepoGaps(projectRoot)) : [];
  // The open workflows whose branch is merged: the person is asked whether to close each one.
  r.closeAsk = closeCandidates(projectRoot, await scanWorkflowIndexes({ projectRoot }));
  // A repo with no .ai/ folder runs the setup before the key. Status and the router only read.
  r.firstRun = Boolean(r.key && r.key !== 'status' && needsSetup(projectRoot));
  // The queued GitHub edits go out in the background, so the call does not wait on the network.
  if (layerOf(projectRoot) && readOutbox().length) flushInBackground();
  if (opt.json) { out({ ...r, line: dispatchLine(r, safe) }); return 0; }
  const lines = [dispatchLine(r, safe)];
  if (r.reason) lines.push(`reason: ${r.reason}`);
  if (r.firstInput) lines.push(`first-input: ${r.firstInput}`);
  if (r.hostNote) lines.push(`host-note: ${r.hostNote}`);
  if (r.aliasOf) lines.push(`alias-of: ${r.aliasOf}`);
  if (r.nextOf) lines.push(`next-of: ${r.nextOf} → /wf ${r.tokens.join(' ')}${r.nextReason ? ` (${r.nextReason})` : ''}`);
  for (const s of r.subkeys ?? []) lines.push(`sub-key: ${r.key} ${s.name} → ${s.reference}`);
  for (const c of r.closeAsk) lines.push(`close-ask: ${c.slug} (${c.reason})`);
  if (r.firstRun) lines.push('first-run: reference/setup.md');
  // A linked project keeps its workflow files in the records home: the reference paths point there.
  if (r.sync) lines.push(`records-dir: ${wfRoot(projectRoot)}`);
  if (r.sync?.offline) lines.push('records: offline; the records of other machines may be old');
  for (const c of r.sync?.conflicts ?? []) lines.push(`records-conflict: ${c}`);
  for (const c of r.sync?.fileConflicts ?? []) lines.push(`records-conflict: ${c} has a change of this machine; the pull did not overwrite it`);
  for (const c of r.sync?.adoptConflicts ?? []) lines.push(`records-warning: the local copy of ${c} differs from the clone copy; it is kept in .ai/workflows/.conflicts/`);
  if (r.health) lines.push(r.health);
  lines.push(...r.repoGaps);
  if (r.imported.length) lines.push(`messages: ${r.imported.length} new comment(s) from GitHub in the inbox of ${target}; wf.mjs msg list "${projectRoot}" ${target} --unread`);
  if (r.parked) lines.push(`github-parked: ${r.parked} entry(ies) failed ${MAX_FAILS} flushes; wf.mjs gh status "${projectRoot}"`);
  if (r.lease) lines.push(r.lease);
  out(lines.join('\n'));
  return 0;
}

// ---------------------------------------------------------------- status


// A record by its old file name, in either layout.
const frontmatterOf = (dir, name) => frontmatterOfDoc(dir, name);


function statusText(s) {
  if (s.error) return s.error;
  if (s.workflows) {
    if (!s.workflows.length) return 'No workflows found. Start one with `/wf intake <description>`.';
    const rows = s.workflows.map((w) => [w.slug, w.group, `${w.status ?? '?'}${w.stale ? ' (stale)' : ''}`, w.stage ?? '-', w.next ?? '-'].join('\t'));
    const runs = s.workflows.filter((w) => w.progress && w.progress.state !== 'done').map((w) => `${w.slug}: ${progressLine(w.progress)}`);
    return ['slug\tgroup\tstatus\tstage\tnext', ...rows, ...(runs.length ? ['', ...runs] : [])].join('\n');
  }
  const lines = [`${s.workflow.slug}: ${s.workflow.status} at ${s.workflow.stage ?? '-'}`];
  if (s.workflow.progress) lines.push(`run: ${progressLine(s.workflow.progress)}`);
  for (const st of s.stages) if (st.present) lines.push(`  ${st.file}\t${st.status ?? '-'}`);
  for (const sl of s.slices) lines.push(`  slice ${sl.slice}\t${SLICE_STAGES.map(([k]) => `${k}=${sl[k] ?? '-'}`).join(' ')}${sl.result ? ` result=${sl.result}${sl.convergence ? ` convergence=${sl.convergence}` : ''}` : ''}`);
  lines.push(`next: ${s.next.invocation ?? '-'}`);
  return lines.join('\n');
}


// ---------------------------------------------------------------- index

export const INDEX_HEADER = '# .ai/workflows/INDEX.md — global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.';

const rowOf = (fm, slug) => [slug, fm.status ?? '', fm['workflow-type'] ?? 'standard', fm.branch ?? '', fm['updated-at'] ?? ''].join('\t');

function parseIndex(text) {
  const rows = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    rows.set(line.split('\t')[0], line);
  }
  return rows;
}

/** The worktree checkout of each local branch: a prototype's workflow lives in its worktree. */
function worktreesByBranch(root) {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const map = new Map();
  if (r.status !== 0) return map;
  let path = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line.startsWith('branch refs/heads/') && path) map.set(line.slice(18), path);
  }
  return map;
}

/** Rebuild INDEX.md. Pure apart from its reads; `write` writes the file when it changed. */
export async function reconcileIndex(root, { write = true } = {}) {
  const file = join(wfRoot(root), 'INDEX.md');
  const existed = existsSync(file);
  const before = existed ? readFileSync(file, 'utf8') : '';
  const old = parseIndex(before);
  const rows = new Map();
  const reserved = reservedWords(loadRegistry(PLUGIN_ROOT));
  const invalid = [];
  for (const w of await scanWorkflowIndexes({ projectRoot: root })) {
    if (w.classification !== 'invalid') { rows.set(w.directorySlug, rowOf(w.frontmatter, w.directorySlug)); continue; }
    // A folder whose 00-index.md does not parse keeps the row it had: only a missing folder loses its row.
    invalid.push({ slug: w.directorySlug, reason: w.invalidReason });
    if (old.has(w.directorySlug)) rows.set(w.directorySlug, old.get(w.directorySlug));
  }
  // A prototype row stays while its branch has a worktree that holds the workflow.
  const trees = worktreesByBranch(root);
  for (const [slug, line] of old) {
    if (rows.has(slug)) continue;
    const [, , type, branch] = line.split('\t');
    const tree = type === 'prototype' && branch ? trees.get(branch) : null;
    const fm = tree ? frontmatterOf(workflowDir(tree, slug), INDEX_NAME) : null;
    if (fm) rows.set(slug, rowOf(fm, slug));
  }
  const sorted = [...rows.keys()].sort((a, b) => a.localeCompare(b));
  const text = `${[INDEX_HEADER, ...sorted.map((s) => rows.get(s))].join('\n')}\n`;
  const added = sorted.filter((s) => !old.has(s));
  const removed = [...old.keys()].filter((s) => !rows.has(s));
  const updated = sorted.filter((s) => old.has(s) && old.get(s) !== rows.get(s));
  const changed = text !== before.replace(/\r\n/g, '\n');
  if (write && changed && (rows.size || existed)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return {
    bootstrapped: !existed && rows.size > 0, changed, count: rows.size, added, removed, updated, invalid,
    reserved: sorted.filter((s) => reserved.has(s)),
  };
}

function indexText(r) {
  const lines = [];
  if (r.bootstrapped) lines.push(`Bootstrapped .ai/workflows/INDEX.md with ${r.count} workflows.`);
  else if (r.changed) lines.push(`Reconciled INDEX.md: ${r.added.length} added, ${r.removed.length} removed, ${r.updated.length} updated.`);
  for (const s of r.removed) lines.push(`Removed stale row: ${s} (directory missing).`);
  for (const w of r.invalid) lines.push(`Workflow ${w.slug} has an unreadable 00-index.md (${w.reason}); its row is kept as it was.`);
  for (const s of r.reserved) lines.push(`Slug ${s} is a /wf command word, so a /wf form that names it as a command does not reach it.`);
  return lines.join('\n') || 'INDEX.md is in sync.';
}

// ---------------------------------------------------------------- cost

function costText(agg) {
  if (!agg) return 'No cost ledger.';
  const head = 'key\tturns\tsubagents\tinput\toutput\tcache-read\tcache-write\texternal-in\texternal-out';
  const line = (k, a) => [k, a.turns, a.subagents, a.input, a.output, a.cacheRead, a.cacheWrite, a.externalInput, a.externalOutput].join('\t');
  return [head, ...Object.entries(agg.byKey).map(([k, a]) => line(k, a)), line('total', agg.total)].join('\n');
}

// ---------------------------------------------------------------- stamp


const yamlScalar = (v) => (typeof v === 'string' ? (v === '' || /[:#\-[\]{},&*!|>'"%@`]|^\s|\s$|^(true|false|null|\d)/.test(v) ? JSON.stringify(v) : v) : JSON.stringify(v));

export function stampOf(type, { slug = '<slug>', slice = null, now = nowIso() } = {}) {
  const schema = schemaOf();
  const def = defOfType(schema, type);
  if (!def) throw new Error(`stamp: no artifact type ${type} in the schema`);
  const lines = ['---'];
  for (const key of def.required ?? []) {
    const p = resolveRef(schema, def.properties?.[key] ?? {});
    const ptype = Array.isArray(p.type) ? p.type[0] : p.type;
    let value;
    let note = '';
    if (key === 'schema') value = 'sdlc/v1';
    else if (key === 'type') value = type;
    else if (key === 'slug') value = slug;
    else if ((key === 'slice-slug' || key === 'slice') && slice) value = slice;
    else if (/-at$/.test(key)) value = now;
    else if (p.const !== undefined) value = p.const;
    else if (p.enum) { value = p.enum[0]; note = `  # one of: ${p.enum.join(' | ')}`; }
    else if (ptype === 'array') value = [];
    else if (ptype === 'integer' || ptype === 'number') value = 0;
    else if (ptype === 'boolean') value = false;
    else if (ptype === 'object') value = {};
    else value = '';
    const text = Array.isArray(value) ? '[]' : value && typeof value === 'object' ? '{}' : yamlScalar(value);
    lines.push(`${key}: ${text}${note}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------- decide

const scopeOf = (opt) => ({ packet: opt.packet, slice: opt.slice, files: opt.files });


export function runDecide(pos, opt) {
  const [verb, root, slug, arg] = pos;
  if (!verb || !root || !slug) throw new Error('decide: <add|list|answered|hold|drop|import> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`decide: no workflow folder ${dir}`);
  switch (verb) {
    case 'add': {
      if (opt.file) {
        // Every answer of a file in one call: [{ key, question, answer, by, kind, stage, slice, files }].
        const doc = JSON.parse(readFileSync(resolve(opt.file), 'utf8'));
        const list = Array.isArray(doc) ? doc : doc.answers ?? doc.decisions ?? [];
        if (!list.length) throw new Error(`decide add: ${opt.file} holds no answers`);
        const rows = list.map((a) => decideAdd(dir, a, { by: opt.by ?? null, stage: opt.stage ?? null }));
        out(opt.json ? rows : rows.flatMap((r) => [decisionLine(r.entry), ...r.superseded.map((id) => `supersedes ${id}`), ...(r.settled ? [`settled ${r.entry.key}`] : [])]).join('\n'));
        return 0;
      }
      const r = addDecision(dir, {
        kind: opt.kind, key: opt.key, question: opt.question, answer: opt.answer, by: opt.by,
        scope: scopeOf(opt), stage: opt.stage, source: opt.source,
        rewrote: opt.rewrote ? String(opt.rewrote).split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      // Each record that names a superseded entry gets a marker that names the new one.
      const marked = markSuperseded(dir, r.superseded, r.entry.id);
      const settled = r.entry.kind !== 'steer' && settleQuestion(dir, r.entry.key);
      out(opt.json ? { ...r, marked, settled } : [decisionLine(r.entry), ...r.superseded.map((id) => `supersedes ${id}`), ...marked.map((n) => `marked ${n}`), ...(settled ? [`settled ${r.entry.key}`] : [])].join('\n'));
      return 0;
    }
    case 'list': {
      const all = decisionsOf(dir);
      const rows = opt.all ? all : liveDecisions(all, scopeOf(opt), { by: opt.by, kind: opt.kind });
      out(opt.json ? rows : rows.length ? rows.map(decisionLine).join('\n') : 'no decisions');
      return 0;
    }
    case 'answered': {
      if (!opt.key) throw new Error('decide answered: --key is required');
      const hit = answeredBy(decisionsOf(dir), opt.key, scopeOf(opt));
      out(opt.json ? { answered: Boolean(hit), entry: hit } : hit ? decisionLine(hit) : `not answered: ${opt.key}`);
      return hit ? 0 : 1;
    }
    case 'hold': {
      const r = holdQuestion(dir, {
        key: opt.key, question: opt.question, stage: opt.stage, slice: opt.slice,
        options: opt.options ? String(opt.options).split('|').map((s) => s.trim()).filter(Boolean) : [],
        recommended: opt.recommended,
      });
      out(opt.json ? r : `${r.replaced ? 'held again' : 'held'} ${r.entry.key}: ${r.entry.question}`);
      return 0;
    }
    case 'drop': {
      if (!arg) throw new Error('decide drop: <questions.json> is required');
      const doc = JSON.parse(readFileSync(resolve(arg), 'utf8'));
      const questions = Array.isArray(doc) ? doc : doc.questions ?? [];
      const r = dropAnswered(decisionsOf(dir), questions, scopeOf(opt));
      out(opt.json ? r : [`ask: ${r.ask.length}`, ...r.answered.map((q) => `answered: ${q.key} by ${q.decision}`)].join('\n'));
      return 0;
    }
    case 'import': {
      const r = importLegacy(dir);
      out(opt.json ? r : `imported ${r.added}, already held ${r.skipped}`);
      return 0;
    }
    default:
      throw new Error(`decide: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- step


export function runStep(pos, opt) {
  const [verb, root, slug, slice, n] = pos;
  if (!verb || !root || !slug) throw new Error('step: <start|done|stop|retry|complete|where> <root> <slug> are required');
  const projectRoot = resolve(root);
  const dir = join(wfRoot(projectRoot), slug);
  if (!existsSync(dir)) throw new Error(`step: no workflow folder ${dir}`);
  // A step commit in a worktree of the project is resolved there; its branch decides, not the checkout.
  const checkout = stepCheckout(projectRoot);
  const branch = branchOf(checkout);
  const head = () => gitRevParse(checkout, 'HEAD');
  const sha = () => {
    if (!opt.sha) return null;
    const s = gitRevParse(checkout, opt.sha);
    if (!s) throw new Error(`step: ${opt.sha} is not a commit of ${checkout}`);
    return s;
  };
  if (verb === 'where') {
    const target = slice ?? lastSlice(dir);
    if (!target) { out(opt.json ? { slice: null } : 'no steps recorded'); return 0; }
    const w = whereOf(dir, target, stepGit(projectRoot, dir));
    out(opt.json ? w : whereLine(w));
    return 0;
  }
  if (!slice) throw new Error(`step ${verb}: <slice> is required`);
  if (['start', 'done', 'complete'].includes(verb)) {
    const refused = sliceRefusal(dir, slug, slice);
    if (refused) throw new Error(`step ${verb}: ${refused}`);
  }
  const step = n == null ? null : Number(n);
  const where = () => whereOf(dir, slice, stepGit(projectRoot, dir));
  const done = () => {
    if (opt['no-change']) {
      if (opt.sha) throw new Error('step done: give --sha or --no-change, not both');
      return { slice, event: 'done', step, noChange: true, head: head(), branch };
    }
    if (!opt.sha) throw new Error('step done: --sha <commit> is required, or --no-change for a step that changed no file');
    const s = sha();
    // A step commit moves HEAD: the sha of the start, or of another done step, is not this step's commit.
    const run = readSteps(dir).filter((r) => r.slice === slice);
    let from = 0;
    run.forEach((r, i) => { if (r.event === 'complete') from = i + 1; });
    const current = run.slice(from);
    const start = [...current].reverse().find((r) => r.event === 'start' && r.step === step);
    if (start?.head && start.head === s) throw new Error(`step done: ${s.slice(0, 8)} is the HEAD at the start of step ${step}, so the step made no commit. Commit the step first, or run step done with --no-change`);
    const owner = current.find((r) => r.event === 'done' && r.step !== step && r.sha === s);
    if (owner) throw new Error(`step done: ${s.slice(0, 8)} is the commit of step ${owner.step}. Commit step ${step} first; a failed commit hook leaves HEAD where it was`);
    return { slice, event: 'done', step, sha: s, ...commitIdentity(checkout, s), branch };
  };
  const complete = () => {
    const w = where();
    const skip = opt.skip ? String(opt.skip).split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : [];
    if (skip.length && !opt.reason) throw new Error('step complete: --skip needs --reason');
    const open = w.steps.filter((s) => !w.done.some((d) => d.n === s.n) && !skip.includes(s.n)).map((s) => s.n);
    if (open.length) throw new Error(`step complete: steps ${open.join(', ')} of the plan are open. Do them, or name them with --skip ${open.join(',')} --reason "<why>"`);
    const plan = readPlan(readDoc(dir, `04-plan-${slice}.md`)?.body ?? '');
    return { slice, event: 'complete', sha: sha(), planHash: plan.hash, ...(skip.length ? { skipped: skip.map((x) => ({ n: x, reason: opt.reason })) } : {}), branch };
  };
  const rows = {
    start: () => ({ slice, event: 'start', step, title: opt.title ?? null, head: head(), branch }),
    done,
    stop: () => ({ slice, event: 'hard-stop', reason: opt.reason ?? null, kind: opt.kind ?? 'fail' }),
    retry: () => ({ slice, event: 'retry' }),
    complete,
  };
  if (!rows[verb]) throw new Error(`step: unknown verb ${verb}`);
  const line = appendStep(dir, rows[verb]());
  // The progress record follows the step of the slice.
  if (verb === 'start') {
    const total = whereOf(dir, slice).total;
    writeProgress(dir, { stage: 'implement', slice, step: { n: step, of: total || null, title: opt.title ?? null }, ...(readProgress(dir)?.status ? {} : { status: 'running' }) });
  } else if (verb === 'complete') writeProgress(dir, { slice, step: null });
  out(opt.json ? line : `${line.event} ${slice}${line.step ? ` step ${line.step}` : ''}${line.sha ? ` ${line.sha.slice(0, 8)}` : ''}${line.noChange ? ' (no change)' : ''}${line.kind && line.kind !== 'fail' ? ` (${line.kind})` : ''}`);
  return 0;
}

// ---------------------------------------------------------------- profile

export function runProfile(pos, opt) {
  const [verb, root, a, b] = pos;
  if (!verb || !root) throw new Error('profile: <show|set|record|run|timebox|hooks> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'show') {
    const p = readProfile(projectRoot);
    const lines = profileLines(p);
    out(opt.json ? p : lines.length ? lines.join('\n') : 'no test profile');
    return 0;
  }
  if (verb === 'set') {
    if (!a || !opt.command || opt.estimate == null) throw new Error('profile set: <suite> --command c --estimate seconds are required');
    const s = setSuite(projectRoot, a, { command: opt.command, estimateSeconds: Number(opt.estimate) });
    out(opt.json ? s : `${a}: \`${s.command}\` (${s.estimateSeconds}s estimated)`);
    return 0;
  }
  if (verb === 'record') {
    if (!a || b == null) throw new Error('profile record: <suite> <seconds> are required');
    const s = recordRun(projectRoot, a, Number(b));
    out(opt.json ? s : `${a}: ${s.measuredSeconds}s measured`);
    return 0;
  }
  if (verb === 'run') {
    // Run the command of a suite in the project root, and record its time: no timer by hand.
    if (!a) throw new Error('profile run: <suite> is required');
    const suite = readProfile(projectRoot)[a];
    if (!suite?.command) throw new Error(`profile run: the test profile has no command for the ${a} suite; set it with profile set first`);
    const t0 = Date.now();
    const r = spawnSync(suite.command, { cwd: projectRoot, shell: true, stdio: opt.json ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true });
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const pass = r.status === 0;
    const head = pass ? spawnSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || null : null;
    if (!r.error) recordRun(projectRoot, a, seconds, { passedAt: head });
    out(opt.json ? { suite: a, command: suite.command, seconds, pass, exit: r.status, ...(head ? { passedAt: head } : {}) } : `${a}: ${pass ? `pass at ${head ? head.slice(0, 8) : 'an unknown commit'}` : `fail (exit ${r.status ?? r.error?.code})`} in ${seconds}s, recorded`);
    return pass ? 0 : 1;
  }
  if (verb === 'timebox') {
    if (!a) throw new Error('profile timebox: <stage> is required');
    const suites = STAGE_SUITES[a] ?? [];
    const box = timeBox(readProfile(projectRoot), suites, { workSeconds: Number(opt.work ?? 0) || 0 });
    out(opt.json ? { stage: a, suites, ...box } : `${a}: ${Math.round(box.seconds / 60)} minutes${box.from.length ? ` (${box.from.join(', ')})` : ' (no suite time; the floor)'}`);
    return 0;
  }
  if (verb === 'hooks') {
    const hooks = hookSuites(projectRoot, readProfile(projectRoot));
    const line = (h) => `${h.hook}: \`${h.command}\` (${h.source}) — ${h.suite ? `in ${h.suite}` : 'in no suite'}`;
    out(opt.json ? hooks : hooks.length ? hooks.map(line).join('\n') : 'no push or commit hook');
    return 0;
  }
  throw new Error(`profile: unknown verb ${verb}`);
}

// ---------------------------------------------------------------- findings

export function runFindings(pos, opt) {
  const [verb, root, slug, a, b] = pos;
  if (!verb || !root || !slug) throw new Error('findings: <add|list|set|table|metrics> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`findings: no workflow folder ${dir}`);
  const ledger = readLedger(dir);
  const source = opt.source ?? null;
  // A review file shows one source and one scope: the packet (no slice) unless --slice names one.
  const scope = { source: source ?? 'review', slice: opt.slice ?? null };
  switch (verb) {
    case 'add': {
      if (!a) throw new Error('findings add: <found.json> is required');
      const doc = JSON.parse(readFileSync(resolve(a), 'utf8'));
      const found = Array.isArray(doc) ? doc : doc.findings ?? [];
      const dimensions = opt.dimensions ? String(opt.dimensions).split(',').map((d) => d.trim()).filter(Boolean) : (doc.dimensions ?? []);
      const files = opt.files ? String(opt.files).split(',').map((f) => f.trim()).filter(Boolean) : (Array.isArray(doc.affectedFiles) ? doc.affectedFiles : null);
      const r = mergeRun(ledger, found, { ...scope, dimensions, files, run: opt.run ?? null });
      writeLedger(dir, r.ledger);
      out(opt.json ? { added: r.added, resurfaced: r.resurfaced, resolved: r.resolved, outOfScope: r.outOfScope, verdict: r.verdict } : `added ${r.added.length}, seen again ${r.resurfaced.length}, resolved ${r.resolved.length}${r.outOfScope.length ? `, dropped ${r.outOfScope.length} outside the work packet` : ''}: ${r.verdict}`);
      return 0;
    }
    case 'metrics': {
      const m = metricsOf(ledger, scope);
      out(opt.json ? m : Object.entries(m).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join('\n'));
      return 0;
    }
    case 'list': {
      const rows = ledger.findings.filter((f) => (!source || f.source === source) && (opt.slice == null || f.slice === opt.slice) && (!opt.open || OPEN_STATUSES.has(f.status)));
      out(opt.json ? rows : rows.length ? rows.map((f) => `${f.id} ${f.severity} ${f.status}${f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : ''}: ${f.issue}`).join('\n') : 'no findings');
      return 0;
    }
    case 'set': {
      if (!a || !b) throw new Error('findings set: <id> <status> are required');
      if (opt.decision) {
        // A dismissal by a decision names a live answer, steer or approval of the person.
        const d = decisionsOf(dir).find((x) => x.id === opt.decision);
        if (!d) throw new Error(`findings set: no decision ${opt.decision}`);
        if (d['superseded-by']) throw new Error(`findings set: decision ${d.id} is superseded by ${d['superseded-by']}`);
        if (d.by !== 'person' || !['answer', 'steer', 'approval'].includes(d.kind)) throw new Error(`findings set: decision ${d.id} is not an answer, steer or approval of the person`);
      }
      const e = setStatus(ledger, a, b, opt.reason ?? null, { commit: opt.commit ?? null, decision: opt.decision ?? null });
      writeLedger(dir, ledger);
      out(opt.json ? e : `${e.id} ${e.status}`);
      return 0;
    }
    case 'table': {
      process.stdout.write(`Verdict: ${verdictOf(ledger, scope)}\n\n${findingsTable(ledger, scope)}\n`);
      return 0;
    }
    default:
      throw new Error(`findings: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- record


/** `key=value` → [key, value], the value read as a YAML scalar or flow collection. */
export function fieldOf(arg) {
  const at = arg.indexOf('=');
  if (at < 1) throw new Error(`record set: ${arg} is not key=value`);
  // Git Bash turns `key=/wf ...` into `key=C:/Program Files/Git/wf ...`; lib/msys.mjs undoes it.
  const { value: raw, repaired } = undoGitBashPath(arg.slice(at + 1));
  if (repaired) process.stderr.write(`wf.mjs: ${arg.slice(0, at)} began with the Git install path, which Git Bash put in front of /wf; it is set to ${raw}\n`);
  let value;
  try { value = raw === '' ? '' : parseYaml(raw); } catch { value = raw; }
  return [arg.slice(0, at), value];
}


const RECORD_VERBS = ['put', 'get', 'draft', 'set', 'stage-done', 'list', 'where', 'migrate', 'evidence'];


function runRecord(pos, opt) {
  const [verb, root, slug, ...rest] = pos;
  if (!RECORD_VERBS.includes(verb) || !root || !slug) {
    throw new Error(`record: <${RECORD_VERBS.join('|')}> <root> <slug> are required`);
  }
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`record: no workflow folder ${dir}`);
  switch (verb) {
    case 'put': {
      // The agents write the drafts in the local folder; a linked project keeps its records elsewhere.
      const local = join(localWorkflowsRoot(resolve(root)), slug);
      const homes = local === dir ? [dir] : [local, dir];
      const drafts = rest.length
        ? rest.map((p) => (existsSync(resolve(p)) ? resolve(p) : homes.map((h) => draftPath(h, p)).find(existsSync) ?? draftPath(dir, p)))
        : homes.flatMap(draftsOf);
      if (!drafts.length) throw new Error(`record put: no draft in ${join(dir, DRAFT_DIR)}`);
      const results = drafts.map((p) => putChecked(dir, p));
      const ev = pruneEvidence(dir);
      out(opt.json ? { results, pruned: ev.pruned } : results.map((r) => (r.errors.length
        ? `refused ${r.name}: ${r.errors.join('; ')}`
        : `put ${r.name} → ${r.file}${r.section ? `#${r.section}` : ''}`)).concat(ev.pruned.map((p) => `pruned evidence ${p}`)).join('\n'));
      return results.some((r) => r.errors.length) ? 1 : 0;
    }
    case 'get': {
      if (!rest.length) throw new Error('record get: <name> is required');
      // Several names read in one call; --fields a,b prints only those frontmatter fields.
      const keys = opt.fields ? String(opt.fields).split(',').map((k) => k.trim()).filter(Boolean) : null;
      const docs = rest.map((name) => ({ name, doc: readDoc(dir, recordName(name)) }));
      const missing = docs.filter((d) => !d.doc);
      for (const d of missing) process.stderr.write(`wf.mjs: ${noRecord(d.name, slug, dir)}\n`);
      const found = docs.filter((d) => d.doc);
      const view = (d) => (keys ? pick(d.doc.frontmatter ?? {}, keys) : d.doc);
      const many = rest.length > 1;
      if (opt.json) out(many ? Object.fromEntries(found.map((d) => [recordName(d.name), view(d)])) : found[0] ? view(found[0]) : null);
      else {
        for (const d of found) {
          if (many) process.stdout.write(`==> ${recordName(d.name)} <==\n`);
          if (keys) process.stdout.write(stringifyYaml(view(d)));
          else process.stdout.write(`---\n${stringifyYaml(d.doc.frontmatter ?? {})}\n---\n${d.doc.body ?? ''}`);
          if (many) process.stdout.write('\n');
        }
      }
      return missing.length ? 1 : 0;
    }
    case 'stage-done': {
      const [stage, slice] = rest;
      if (!stage) throw new Error(`record stage-done: <stage> is required; the stages are: ${Object.keys(STAGE_FILES).join(', ')}`);
      const changes = stageDone(dir, slug, stage, slice ?? null, { next: opt.next ?? null, status: opt.status ?? null });
      out(opt.json ? changes : `${stage}${slice ? ` ${slice}` : ''} done: progress.${stage}=${changes[`progress.${stage}`]}; next ${changes['next-invocation']}`);
      return 0;
    }
    case 'draft': {
      // The record as a draft, ready for an edit and a put: the change of a body in three steps.
      const [name] = rest;
      if (!name) throw new Error('record draft: <name> is required');
      const n = recordName(name);
      const doc = readDoc(dir, n);
      if (!doc) { process.stderr.write(`wf.mjs: ${noRecord(name, slug, dir)}\n`); return 1; }
      const path = draftPath(join(localWorkflowsRoot(resolve(root)), slug), n);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringifyYaml(doc.frontmatter ?? {})}\n---\n${doc.body ?? ''}`);
      out(opt.json ? { name: n, draft: path } : `draft ${n} → ${path}; edit it, then run record put`);
      return 0;
    }
    case 'set': {
      const [name, ...fields] = rest;
      if (!name || !fields.length) throw new Error(`record set: <name> <key=value>... are required. The forms are: ${PATH_FORMS}`);
      const r = setRecordPaths(dir, recordName(name), fields, { slug });
      out(opt.json ? r.frontmatter : `set ${r.keys.join(', ')} in ${recordName(name)}`);
      return 0;
    }
    case 'list': {
      const names = listDocs(dir);
      out(opt.json ? names : names.join('\n'));
      return 0;
    }
    case 'where': {
      const [name] = rest;
      if (!name) throw new Error('record where: <old path> is required');
      const to = redirectOf(name);
      out(to ?? `${name} keeps its place`);
      return 0;
    }
    case 'evidence': {
      const r = pruneEvidence(dir, { dryRun: Boolean(opt.check) });
      const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
      out(opt.json ? r : [`evidence ${mb(r.bytes)} of ${mb(r.cap)}, ${r.kept} run(s)`, ...r.pruned.map((p) => `${opt.check ? 'would prune' : 'pruned'} ${p}`)].join('\n'));
      return 0;
    }
    case 'migrate': {
      const r = migrateWorkflow(dir);
      out(opt.json ? r : [...r.moved.map((m) => `moved ${m.from} → ${m.to}`), ...r.kept.map((k) => `kept ${k}`)].join('\n') || 'nothing to move');
      return 0;
    }
    default: return 2;
  }
}

// ---------------------------------------------------------------- consent

function runConsent(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['check', 'grant', 'revoke'].includes(verb) || !root || !slug) throw new Error('consent: <check|grant|revoke> <root> <slug> are required');
  const projectRoot = resolve(root);
  if (verb === 'check') {
    const r = checkConsent(projectRoot, slug);
    const ask = r.question ? [`ask: ${r.question}`, `then: wf.mjs consent grant <root> ${r.for}`] : [];
    out(opt.json ? r : r.ok ? `consent: ${slug} runs under the consent of ${r.via} (${r.consent.at})` : [`no consent for ${slug}`, ...ask].join('\n'));
    return r.ok ? 0 : 1;
  }
  const r = verb === 'grant' ? grantConsent(projectRoot, slug) : revokeConsent(projectRoot, slug);
  if (opt.json) { out(r); return r.ok ? 0 : 1; }
  if (r.ok) { out(`${verb === 'grant' ? 'granted' : 'revoked'}: ${slug}`); return 0; }
  // The refusal names the exact question, and the commands that follow the person's answer.
  const how = r.question ? [
    `ask the person this exact question with the question tool, so that its answer event is written: ${r.question}`,
    `record the answer: wf.mjs decide add "${root}" ${slug} --key consent --question "${r.question}" --answer "<the answer>"`,
    `then run: wf.mjs consent grant "${root}" ${slug}`,
  ] : [];
  out([`not ${verb === 'grant' ? 'granted' : 'revoked'}: ${r.reason}`, ...how].join('\n'));
  return 1;
}

// ---------------------------------------------------------------- base, ship

function runBase(pos, opt) {
  const [verb, root] = pos;
  if (verb !== 'check' || !root) throw new Error('base: check <root> is required');
  const projectRoot = resolve(root);
  const base = opt.base ?? (defaultRun('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: projectRoot }).stdout.replace(/^origin\//, '') || 'main');
  const r = baseCheck(projectRoot, base, { remote: opt.remote ?? 'origin' });
  out(opt.json ? r : `${base}: ${r.state}${r.fastForwarded ? ` (fast-forwarded ${r.behind})` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
  return r.stop ? 1 : 0;
}

function runWorktree(pos, opt) {
  const [verb, root, slug, name, commit] = pos;
  if (verb === 'add') {
    if (!root || !slug || !name || !commit) throw new Error('worktree: add <root> <slug> <name> <commit> are required');
    const r = addScratchWorktree(resolve(root), slug, name, commit);
    out(opt.json ? r : r.ok ? r.path : r.error);
    return r.ok ? 0 : 1;
  }
  if (verb === 'remove') {
    if (!root || !slug) throw new Error('worktree: remove <root> <slug> are required');
    const r = removeScratchWorktrees(resolve(root), slug, name ?? null);
    const kept = [...r.refused, ...r.failed];
    if (opt.json) out(r);
    else {
      const lines = [...r.removed.map((p) => `removed ${p}`), ...kept.map((k) => `kept ${k.path}: ${k.reason}`)];
      out(lines.join('\n') || 'no scratch worktree');
    }
    return kept.length ? 1 : 0;
  }
  throw new Error('worktree: <add|remove> is required');
}

const TASK_PREFIX = 'ship-ready:';

function runShip(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['facts', 'ready', 'merge', 'finish'].includes(verb) || !root) throw new Error('ship: <facts|ready|merge|finish> <root> are required');
  const projectRoot = resolve(root);
  const index = slug ? frontmatterOf(join(wfRoot(projectRoot), slug), INDEX_NAME) : null;
  if (slug && !index) throw new Error(`ship: no workflow ${slug}`);
  const base = opt.base ?? index?.['base-branch'] ?? null;
  if (verb === 'facts') {
    const f = shipFacts(projectRoot, base);
    out(opt.json ? f : f.ok ? `${f.repo} ${f.base}: merge by ${f.method ?? 'nothing allowed'} (allowed ${f.allowed.join(', ') || 'none'}); reviews ${f.requiredReviews}; merge queue ${f.mergeQueue}; ${f.direct ? 'ship merges' : 'ship prints the command'}` : f.reason);
    return f.ok ? 0 : 1;
  }
  if (verb === 'ready') {
    const gaps = readyGaps(projectRoot, { base });
    if (slug) {
      // Each gap is a person task; a gap that closed leaves the list.
      const kept = (Array.isArray(index['person-tasks']) ? index['person-tasks'] : []).filter((t) => !String(t?.id ?? '').startsWith(TASK_PREFIX));
      const tasks = gaps.map((g) => ({ id: `${TASK_PREFIX}${g.code}`, task: g.task, needed: 'ship', at: nowIso() }));
      setFields(join(wfRoot(projectRoot), slug), INDEX_NAME, { 'person-tasks': [...kept, ...tasks] });
    }
    out(opt.json ? { ready: !gaps.length, gaps } : gaps.length ? gaps.map((g) => `gap: ${g.task}`).join('\n') : 'ready: no gap that a script sees');
    return gaps.length ? 1 : 0;
  }
  if (!slug) throw new Error(`ship ${verb}: <slug> is required`);
  const pr = opt.pr ?? index['pr-number'] ?? null;
  if (verb === 'merge') {
    if (!pr) throw new Error('ship merge: the workflow has no pr-number; pass --pr N');
    const f = shipFacts(projectRoot, base);
    if (!f.ok) throw new Error(f.reason);
    const cmd = mergeCommand(f, pr);
    if (!cmd) throw new Error(`ship merge: the repo allows no merge method for ${f.base}`);
    if (opt.print || !f.direct) {
      out(opt.json ? { merged: false, command: cmd, facts: f } : `run: ${cmd}${f.direct ? '' : ` (${f.mergeQueue ? 'the merge queue merges it' : `${f.requiredReviews} review(s) are required`})`}`);
      return 3;
    }
    const r = defaultRun('gh', cmd.split(' ').slice(1), { cwd: projectRoot });
    out(opt.json ? { merged: r.status === 0, command: cmd, stderr: r.stderr } : r.status === 0 ? `merged PR ${pr} by ${f.method}` : `the merge failed: ${r.stderr}\nrun: ${cmd}`);
    return r.status === 0 ? 0 : 1;
  }
  const r = finishShip(projectRoot, { branch: index.branch, base: base ?? 'main', pr });
  if (r.ok) {
    setFields(join(wfRoot(projectRoot), slug), INDEX_NAME, {
      status: 'shipped', 'close-reason': 'shipped', 'closed-at': nowIso(), 'progress.ship': 'complete',
      'current-stage': 'ship', 'next-invocation': `/wf retro ${slug}`,
    });
  }
  out(opt.json ? r : r.ok ? `on ${r.base}; ${r.steps.map(([k, v]) => `${k} ${v ? 'ok' : 'skipped'}`).join(', ')}; ${slug} is shipped` : `not finished: ${r.reason}`);
  return r.ok ? 0 : 1;
}

// ---------------------------------------------------------------- main

// The workflow that a call acts on, or null. A read-only key acts on none.
function slugAtDispatch(projectRoot, r, tokens) {
  if (!r.key || r.key === 'status' || r.reason) return null;
  const args = (r.tokens ?? tokens).slice(r.argsFrom);
  return r.nextOf ?? args.slice(0, 2).find((t) => existsSync(join(wfRoot(projectRoot), t, INDEX_NAME)) || existsSync(join(wfRoot(projectRoot), t, 'state.yaml'))) ?? null;
}

// The lease of the workflow that a call acts on.
function leaseAtDispatch(projectRoot, slug, host) {
  const before = heldBefore(projectRoot, slug);
  const c = claimLease(projectRoot, slug, { host });
  if (c.ok) return null;
  // This machine held the lease, and another machine took it: the session stops writing.
  if (c.held && before) return leaseLostLine(slug, c.lease);
  if (c.held) return `lease-held: ${slug} by ${c.lease.machine}${c.lease.host ? ` (${c.lease.host})` : ''} until ${c.lease.expires}`;
  if (c.expired) return `lease-expired: ${slug} by ${c.lease.machine} since ${c.lease.expires}`;
  if (c.offline) return `lease-offline: ${slug}`;
  return `lease-held: ${slug} (${c.reason ?? 'another machine claimed it at the same time'})`;
}

async function runRecords(pos, opt) {
  const [verb, root, arg] = pos;
  if (!root) throw new Error('records: <link|status|sync|push|close> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'link') {
    if (!arg) throw new Error('records link: <project> is required');
    const r = linkProject(projectRoot, arg);
    // Each workflow of the project gets its issue when the GitHub layer is on.
    if (r.ok && layerOf(projectRoot)) {
      r.queued = backfill(projectRoot, r.moved.filter((s) => s !== '_design')) ?? [];
      if (r.queued.length) flushInBackground();
    }
    if (opt.json) { out(r); return r.ok && !r.conflicts.length ? 0 : 1; }
    if (!r.ok) { out(r.reason); return 1; }
    out([
      `linked as ${r.project} in ${r.home}${r.moved.length ? `; moved ${r.moved.join(', ')}` : ''}`,
      ...(r.squashed.length ? [`squashed the closed workflows onto the main branch: ${r.squashed.join(', ')}`] : []),
      ...r.separate.map((p) => `separate: ${p} has its own .ai/sdlc-config.json with no link, so its records stay in it`),
      ...r.conflicts.map((f) => `records-conflict: ${f}: the clone copy stays; the local copy is in .ai/workflows/.conflicts/${f}. Compare them, then delete the kept copy.`),
      ...(r.tracked.length ? [`tracked: ${r.tracked.slice(0, 10).join(', ')}${r.tracked.length > 10 ? ` and ${r.tracked.length - 10} more` : ''}`] : []),
      ...productRepoGapLines(r),
    ].join('\n'));
    return r.conflicts.length ? 1 : 0;
  }
  if (verb === 'status') {
    const s = recordsStatus(projectRoot);
    const lines = s.linked
      ? [`records: ${s.project} in ${s.home} (${s.remote ? 'with a remote' : 'no remote'}), machine ${s.machine}`, ...s.live.map((l) => `live: ${l}`), ...s.pendingClose.map((k) => `close waits for the network: ${k}`), ...s.conflicts.map((c) => `conflict: ${c.workflow}: ${c.reason}`),
        ...s.workflows.flatMap((h) => [
          ...(h.uncommitted.length ? [`uncommitted: ${h.workflow}: ${h.uncommitted.join(', ')}`] : []),
          ...(h.ahead || h.behind ? [`branch: ${h.workflow}: ${h.ahead} ahead, ${h.behind} behind the remote`] : []),
          ...h.adoptConflicts.map((f) => `kept aside: ${h.workflow}: .ai/workflows/.conflicts/${h.workflow.split('/')[1]}/${f} (the clone copy won; compare, then delete the kept copy)`),
          ...(h.lastFailure ? [`failed: ${h.workflow}: ${h.lastFailure.step} at ${h.lastFailure.at}: ${h.lastFailure.error}`] : []),
        ]),
        ...s.dropped.map((d) => `dropped: ${d.ref} was ${d.sha} (${d.reason}); git -C "${s.home}" update-ref ${d.ref} ${d.sha} brings it back`)]
      : [`records: local in .ai/workflows/${s.clone ? `; a clone is at ${s.home}: wf.mjs records link <root> <project>` : ''}`];
    out(opt.json ? s : lines.join('\n'));
    return 0;
  }
  if (verb === 'sync') {
    const r = syncRecords(projectRoot, { holds: (s) => showLease(projectRoot, s).mine === true });
    if (r && (r.pulled.length || r.folded.length)) await reconcileIndex(projectRoot);
    out(opt.json ? r : !r ? 'records: local; nothing to sync' : r.offline ? 'records: offline' : `pulled ${r.pulled.join(', ') || 'nothing'}; pushed ${r.pushed.join(', ') || 'nothing'}${r.conflicts.length ? `; conflicts: ${r.conflicts.join('; ')}` : ''}`);
    return r?.conflicts?.length ? 1 : 0;
  }
  if (!arg) throw new Error(`records ${verb}: <slug> is required`);
  if (verb === 'push') {
    const r = opt.to ? pushRef(recordsHome(), liveRef(opt.to, arg), { folder: `${opt.to}/${arg}` }) : pushWorkflow(projectRoot, arg);
    if (!opt.to && !r?.leaseLost) renewIfMine(projectRoot, arg);
    // This step runs in the background with no output: a failure goes into the records log.
    if (r && !r.pushed && !r.offline) logRecordsFailure({ project: opt.to ?? linkedProject(projectRoot), slug: arg, step: 'push', error: r.reason ?? (r.conflict ? 'the branches conflict' : 'not pushed') });
    out(opt.json ? r : !r ? 'records: local' : r.pushed ? 'pushed' : `not pushed: ${r.reason ?? (r.offline ? 'offline' : 'unknown')}`);
    return !r || r.pushed ? 0 : 1;
  }
  if (verb === 'close') {
    const r = squashWorkflow(projectRoot, arg);
    if (r?.ok) releaseLease(projectRoot, arg);
    out(opt.json ? r : !r ? 'records: local' : r.ok ? `squashed ${arg}${r.pending ? '; the push waits for the network' : ''}` : r.reason);
    return !r || r.ok ? 0 : 1;
  }
  throw new Error(`records: unknown verb ${verb}`);
}

function runLease(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['claim', 'release', 'show'].includes(verb) || !root || !slug) throw new Error('lease: <claim|release|show> <root> <slug> are required');
  const projectRoot = resolve(root);
  const r = verb === 'claim' ? claimLease(projectRoot, slug, { take: Boolean(opt.take), host: opt.host ?? null })
    : verb === 'release' ? releaseLease(projectRoot, slug) : showLease(projectRoot, slug);
  if (opt.json) { out(r); return r.ok === false ? 1 : 0; }
  if (r.linked === false) { out('records: local; no lease'); return 0; }
  if (verb === 'show') {
    out(!r.online ? 'offline' : !r.lease ? `${slug}: free` : `${slug}: ${r.mine ? 'this machine' : r.lease.machine} until ${r.lease.expires}${r.expired ? ' (expired)' : ''}`);
    return 0;
  }
  if (r.ok) out(verb === 'claim' ? `${slug}: held by ${machineName()} until ${r.lease.expires}${r.took ? ' (taken over)' : ''}` : `${slug}: ${r.released ? 'released' : 'free'}`);
  else out(r.offline ? 'offline' : r.held ? `${slug}: held by ${r.lease?.machine} until ${r.lease?.expires}` : r.expired ? `${slug}: the lease of ${r.lease.machine} expired at ${r.lease.expires}; claim with --take after the person said yes` : `not done: ${r.reason}`);
  return r.ok ? 0 : 1;
}

function runPage(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['brief', 'put', 'check'].includes(verb) || !root || !slug) throw new Error('page: <brief|put|check> <root> <slug> are required');
  const projectRoot = resolve(root);
  if (verb === 'brief') {
    const b = pageBrief(projectRoot, slug);
    if (!b.ok) { out(opt.json ? b : b.reason); return 1; }
    const now = checkPage(projectRoot, slug);
    if (now.ok && !now.stale) { out(opt.json ? { ...b, needed: false } : 'no page needed: the page shows the newest board'); return 0; }
    if (opt.json) { out({ ...b, needed: true }); return 0; }
    const k = b.keys;
    out([`board: ${b.board}`, `decisions: ${b.decisions}`, `draft: ${b.draft}`, `page: ${b.page}`, `version: ${b.version}`,
      `keys: areas ${k.areas.join(' ') || '-'} | threads ${k.threads.join(' ') || '-'} | decisions ${k.decisions.join(' ') || '-'} | work ${k.work.join(' ') || '-'} | store ${k.ledger.join(' ') || '-'}`].join('\n'));
    return 0;
  }
  const r = verb === 'put' ? putPage(projectRoot, slug) : checkPage(projectRoot, slug);
  out(opt.json ? r : r.ok ? (r.page ? `put the page → ${r.page}` : 'the page is good and shows the newest board') : r.problems.map((p) => `problem: ${p}`).join('\n'));
  return r.ok ? 0 : 1;
}

/**
 * `wf.mjs run`: a script of the project, with the library (lib/wf-api.mjs). The script comes
 * from a file that the agent wrote, never from shell text; a path outside the project is refused.
 */
async function runRun(pos, opt) {
  const [root, script, ...args] = pos;
  if (!root || !script) throw new Error('run: <root> <script.mjs> are required');
  const projectRoot = realpathSync(resolve(root));
  const file = [resolve(projectRoot, script), resolve(script)].find(existsSync);
  if (!file) throw new Error(`run: no script ${script}`);
  const real = realpathSync(file);
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  if (!fold(real).startsWith(fold(`${projectRoot}${sep}`))) {
    throw new Error(`run: ${real} is outside the project ${projectRoot}. Write the script in .ai/workflows/<slug>/.draft/ or in .scratch/`);
  }
  const mod = await import(`${pathToFileURL(real).href}?run=${Date.now()}`);
  if (typeof mod.default !== 'function') throw new Error(`run: ${script} has no default export function; write export default async function ({ wf, open, args }) { ... }`);
  const dryRun = Boolean(opt['dry-run']);
  const r = await runScript(projectRoot, mod.default, { slug: opt.slug ?? null, script: real, args, dryRun });
  const writes = r.ops.filter((o) => o.write).map(({ slug, op, record, keys }) => ({ slug, op, record, keys }));
  if (!r.ok) {
    process.stderr.write(`wf.mjs: run: ${r.error?.message ?? r.error}\n${r.failedOp ? `wf.mjs: run: the operation that failed: ${r.failedOp}\n` : ''}wf.mjs: run: nothing was applied\n`);
    return 1;
  }
  if (opt.json) { out({ value: r.value ?? null, applied: r.applied, changed: r.changed, changes: writes }); return 0; }
  if (r.value !== undefined) out(r.value);
  const list = writes.map((w) => `  ${w.slug}: ${w.op}${w.record ? ` ${w.record}` : ''}${w.keys.length ? ` (${w.keys.join(', ')})` : ''}`);
  if (dryRun) process.stderr.write(`dry run: ${writes.length} change(s), none applied${list.length ? `:\n${list.join('\n')}` : ''}\n`);
  else if (writes.length) process.stderr.write(`applied ${writes.length} change(s); committed ${r.changed.join(', ') || 'nothing'}\n`);
  return 0;
}

/** Import the person's comments on the issue of a workflow into its inbox, and commit them at once. */
function importIssueComments(projectRoot, slug) {
  try {
    const comments = issueComments(projectRoot, slug);
    const added = comments ? importComments(projectRoot, slug, comments) : [];
    if (added.length) afterChange(projectRoot, slug, { label: `${slug}: ${added.length} comment(s) from GitHub` });
    return added;
  } catch { return []; }
}

function runMsg(pos, opt) {
  const [verb, root, slug, id] = pos;
  if (!['post', 'list', 'read'].includes(verb) || !root || !slug) throw new Error('msg: <post|list|read> <root> <slug> are required');
  const projectRoot = resolve(root);
  const to = opt.to ?? null;
  if (verb === 'post') {
    const r = postMessage(projectRoot, slug, { kind: opt.kind, text: opt.text, to });
    if (!to) noteMessage(projectRoot, slug, { kind: opt.kind, from: machineName(), text: opt.text });
    // A post to a project that is not linked here is pushed already.
    if (r.project && !r.pushed) inBackground(['records', 'push', projectRoot, slug, ...(to ? ['--to', to] : [])]);
    out(opt.json ? r : `posted ${r.id}`);
    return 0;
  }
  if (verb === 'list') {
    if (!to) importIssueComments(projectRoot, slug);
    const all = listMessages(projectRoot, slug, { to });
    const rows = opt.unread ? all.filter((m) => !m.read) : all;
    out(opt.json ? rows : rows.length ? rows.map((m) => `${m.read ? ' ' : '*'} ${m.id} (${m.kind} from ${m.from})`).join('\n') : 'no messages');
    return 0;
  }
  if (!id) throw new Error('msg read: <id> is required');
  const r = readMessage(projectRoot, slug, id, { to });
  out(opt.json ? r : r.text);
  return 0;
}

function flushInBackground() {
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'gh', 'flush'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* the next call flushes */ }
}

// The commands that change the state of a workflow: [root, slug] of each, for the GitHub layer.
const CHANGES = {
  record: ['put', 'set', 'stage-done', 'migrate'], slice: ['drop', 'move'], board: ['add', 'move', 'regroup', 'remove'], page: ['put'], progress: ['set'], decide: ['add', 'hold'], ship: ['finish'], step: ['start', 'done', 'complete', 'stop'], design: ['approve', 'migrate'],
};
function changed(cmd, pos, opt = {}) {
  if (cmd === 'close' || (cmd === 'modernize' && !opt.check)) return pos[0] && pos[1] ? [pos[0], pos[1]] : null;
  return CHANGES[cmd]?.includes(pos[0]) && pos[1] && pos[2] ? [pos[1], pos[2]] : null;
}

function runGh(pos, opt) {
  const [verb, root] = pos;
  if (verb === 'backfill') {
    if (!root) throw new Error('gh backfill: <root> is required');
    const projectRoot = resolve(root);
    if (!layerOf(projectRoot)) throw new Error('gh backfill: the layer is off (records.repo in ~/.sdlc/config.json and records.project in .ai/sdlc-config.json)');
    const slugs = existsSync(wfRoot(projectRoot)) ? readdirSync(wfRoot(projectRoot), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && frontmatterOf(join(wfRoot(projectRoot), e.name), INDEX_NAME)).map((e) => e.name) : [];
    const queued = backfill(projectRoot, slugs) ?? [];
    if (queued.length) flushInBackground();
    out(opt.json ? { queued } : queued.length ? `queued ${queued.length} workflow(s): ${queued.join(', ')}` : 'no workflow');
    return 0;
  }
  if (verb === 'flush') {
    const r = flushOutbox();
    out(opt.json ? r : r.busy ? 'another flush runs' : `sent ${r.sent}, left ${r.left}${r.parked ? `, parked ${r.parked}` : ''}${r.error ? `; stopped: ${r.error}` : ''}`);
    return r.error ? 1 : 0;
  }
  if (verb === 'status') {
    const s = layerStatus(root ? resolve(root) : null);
    const lines = [
      s.layer ? `layer: ${s.layer.repo} as ${s.layer.project}${s.layer.board ? `, board ${s.layer.board}` : ''}` : root ? 'layer: off (records.repo in ~/.sdlc/config.json and records.project in .ai/sdlc-config.json)' : null,
      `queued: ${s.queued}`,
      s.error ? `last error: ${s.error.message} (${s.error.at})` : null,
      ...s.issues.map((i) => `${i.workflow}: issue ${i.number}${i.closed ? ' (closed)' : ''}${i.needsMe ? ' needs-me' : ''}`),
      ...s.parked.map((p) => `parked: ${p.workflow} ${p.op} at ${p.at}: ${p.error}`),
    ].filter(Boolean);
    out(opt.json ? s : lines.join('\n'));
    return 0;
  }
  throw new Error('gh: <flush|status|backfill> is required');
}

// Commands that run but have no help block: none today. A command must have a help block, so
// `describe` and the unknown-command rule see it.
const HIDDEN_COMMANDS = new Set();

/**
 * The first words (the forms) of a command whose blocks start with a form, such as `record put`
 * or `lease <claim|release|show>`, or null for a command whose first argument is the root.
 * `design` lists its own forms (lib/design-cli.mjs).
 */
export function formsOf(cmd) {
  if (cmd === 'design') return null;
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const head = src.slice(src.indexOf('/**'), src.indexOf('*/'));
  const verbs = new Set();
  let blocks = 0;
  for (const m of head.matchAll(/^ \* {3}(\S+)\s+(\S+)/gm)) {
    if (m[1] !== cmd) continue;
    blocks += 1;
    const t = m[2];
    const list = /^<([a-z][a-z |-]*\|[a-z |-]*)>$/.exec(t)?.[1] ?? (/^[a-z][a-z|-]*$/.test(t) ? t : null);
    if (!list) return null;
    for (const v of list.split('|')) verbs.add(v.trim().split(' ')[0]);
  }
  return blocks ? verbs : null;
}

/** The blocks of the first comment of a file: `name` is the first word of a block, `lines` its text. */
function headerBlocks(file) {
  const src = readFileSync(file, 'utf8');
  const head = src.slice(src.indexOf('/**'), src.indexOf('*/'));
  const blocks = [];
  for (const line of head.split(/\r?\n/)) {
    const m = /^ \* {3}(\S+)(.*)$/.exec(line);
    if (m) blocks.push({ name: m[1], lines: [`${m[1]}${m[2]}`] });
    else if (blocks.length && /^ \* {4,}\S/.test(line)) blocks.at(-1).lines.push(line.replace(/^ \* {3}/, ''));
  }
  return blocks;
}

const API_FILE = join(PLUGIN_ROOT, 'lib', 'wf-api.mjs');

/** Every CLI form and every library function, each with its text and its example. */
export function describeAll() {
  const entry = (b) => ({
    name: b.name,
    form: b.lines[0],
    about: b.lines.slice(1).filter((l) => !/^\s*Example:/.test(l)).map((l) => l.trim()).join(' '),
    example: b.lines.find((l) => /^\s*Example:/.test(l))?.replace(/^\s*Example:\s*/, '') ?? null,
  });
  return { cli: headerBlocks(fileURLToPath(import.meta.url)).map(entry), api: headerBlocks(API_FILE).map(entry) };
}

function describeText(d) {
  const block = (e) => [e.form, `    ${e.about}`, ...(e.example ? [`    Example: ${e.example}`] : [])].join('\n');
  return [
    'CLI: wf.mjs <command> ... (one record or one decision)',
    ...d.cli.map(block),
    '',
    'API: wf.mjs run <root> <script.mjs> --slug <slug> (several records, a list edit, a read with a filter).',
    'The script exports default async function ({ wf, open, args }); its return value prints as JSON.',
    ...d.api.map(block),
  ].join('\n');
}

// The forms of each command, from the header of this file, so the help never drifts from it.
export function helpText(cmd) {
  const blocks = headerBlocks(fileURLToPath(import.meta.url));
  if (!cmd) {
    const names = [...new Set(blocks.map((b) => b.name))];
    return `Usage: wf.mjs <command> ...\nCommands: ${names.join(', ')}\nRun wf.mjs help <command> for its forms and flags.`;
  }
  const hits = blocks.filter((b) => b.name === cmd);
  return hits.length ? hits.map((b) => b.lines.join('\n')).join('\n') : null;
}

// A reader that closes the pipe early (`record get ... | head`) is not an error of the command.
let pipeGuard = false;
function guardPipe() {
  if (pipeGuard) return;
  pipeGuard = true;
  process.stdout.on('error', (e) => {
    if (e.code !== 'EPIPE') throw e;
    process.exit(process.exitCode ?? 0);
  });
}

export async function main(argv = process.argv.slice(2)) {
  guardPipe();
  // A bare call, `help [cmd]`, `--help`, `<cmd> help` and `<cmd> --help` print the forms and exit 0.
  if (!argv.length) { out(helpText()); return 0; }
  if (argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h' || argv.includes('--help') || (argv[1] === 'help' && argv.length === 2)) {
    const want = argv[0] === 'help' ? argv[1] : argv[0]?.startsWith('-') ? undefined : argv[0];
    const text = helpText(want);
    if (text === null) { process.stderr.write(`wf.mjs: no command ${want}\n${helpText()}\n`); return 2; }
    out(text);
    return 0;
  }
  // An unknown command or form exits 2 with the forms of the command, each with its example.
  // It names no near match: the forms are the answer.
  const [cmd, ...rest] = argv;
  const known = helpText(cmd);
  if (known === null && !HIDDEN_COMMANDS.has(cmd)) { process.stderr.write(`wf.mjs: no command ${cmd}\n${helpText()}\n`); return 2; }
  const verbs = formsOf(cmd);
  if (verbs && (!rest.length || (!rest[0].startsWith('-') && !verbs.has(rest[0])))) {
    process.stderr.write(`wf.mjs: ${rest.length ? `${cmd} has no form ${rest[0]}` : `${cmd} needs a form`}. Its forms:\n${known}\n`);
    return 2;
  }
  const { pos, opt } = flags(rest);
  const code = await runMain(cmd, pos, opt);
  const target = code === 0 ? changed(cmd, pos, opt) : null;
  if (target) {
    const [root, slug] = [resolve(target[0]), target[1]];
    afterChange(root, slug, {
      label: `${slug}: ${cmd} ${cmd === 'close' ? '' : pos[0]}`.trim(),
      answer: cmd === 'decide' && opt.answer ? { question: opt.question ?? null, answer: opt.answer, by: opt.by ?? null } : null,
    });
  }
  return code;
}

async function runMain(cmd, pos, opt) {
  try {
    switch (cmd) {
      case 'dispatch': return await runDispatch(pos, opt);
      case 'run': return await runRun(pos, opt);
      case 'describe': {
        const d = describeAll();
        out(opt.json ? d : describeText(d));
        return 0;
      }
      case 'gh': return runGh(pos, opt);
      case 'records': return await runRecords(pos, opt);
      case 'lease': return runLease(pos, opt);
      case 'msg': return runMsg(pos, opt);
      case 'page': return runPage(pos, opt);
      case 'design': return await runDesign(pos, opt, out);
      case 'modernize': {
        const [root, slug] = pos;
        if (!root || !slug) throw new Error('modernize: <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw new Error(`modernize: no workflow folder ${dir}`);
        const r = modernizeWorkflow(dir, { check: Boolean(opt.check) });
        if (opt.json) { out(r); return r.ok ? 0 : 1; }
        if (!r.ok) { out(r.reason); return 1; }
        const verb = r.check ? 'would move' : 'moved';
        const lines = [
          ...r.moved.map((m) => `${verb} ${m.from} → ${m.to}`),
          ...r.kept.map((k) => `kept ${k}`),
          ...Object.entries(r.renamed).map(([k, v]) => `${r.check ? 'would set' : 'set'} ${k}=${v === null ? '(removed)' : v}`),
        ];
        out(lines.join('\n') || 'nothing to convert');
        return 0;
      }
      case 'doctor': {
        // The checks of a project. A pre-push command that no suite runs is first seen at the push.
        const [root] = pos;
        if (!root) throw new Error('doctor: <root> is required');
        const projectRoot = resolve(root);
        const loose = hookSuites(projectRoot, readProfile(projectRoot)).filter((h) => h.hook === 'pre-push' && !h.suite);
        const warnings = loose.map((h) => `the pre-push command \`${h.command}\` of ${h.source} is in no suite of the test profile; add it to the heavy suite with profile set`);
        out(opt.json ? { ok: !warnings.length, warnings } : warnings.length ? warnings.map((w) => `warn: ${w}`).join('\n') : 'ok: every pre-push command is in a suite');
        return 0;
      }
      case 'setup': {
        const [root] = pos;
        if (!root) throw new Error('setup: <root> is required');
        const r = setupProject(resolve(root), { about: opt.about ?? null, ignore: Boolean(opt.ignore) });
        if (opt.json) { out(r); return 0; }
        const lines = [`${r.created ? 'created' : 'kept'} .ai/ and ${r.config}`];
        lines.push(`about: ${r.project.about ?? '(no line yet)'}`);
        const suites = Object.keys(r.profile);
        lines.push(`test profile: ${suites.length ? suites.join(', ') : 'none'}`);
        lines.push(`merge: ${r.facts.method ? `${r.facts.repo} ${r.facts.base} merges by ${r.facts.method}` : r.facts.reason ?? 'the repo allows no merge method'}`);
        lines.push(`.ai/ in git: ${r.ignored === true ? `ignored${r.ignoreAdded ? ' (added to .gitignore)' : ''}` : r.ignored === false ? 'tracked' : 'not a git repo'}`);
        for (const g of r.gaps) lines.push(`gap: ${g.task}`);
        out(lines.join('\n'));
        return 0;
      }
      case 'close': {
        const [root, slug] = pos;
        if (!root || !slug) throw new Error('close: <root> <slug> are required');
        const r = closeWorkflow(resolve(root), slug, { reason: opt.reason ?? 'merged', note: opt.note ?? null, decline: Boolean(opt.decline) });
        out(opt.json ? r : !r.ok ? r.reason : r.declined ? `${slug} stays open; the close question is not asked again` : r.closed ? `${slug} is closed` : r.reason);
        return r.ok ? 0 : 1;
      }
      case 'status': {
        const [root, slug] = pos;
        if (!root) throw new Error('status: <root> is required');
        if (opt.brief) {
          if (!slug) throw new Error('status --brief: <slug> is required');
          const b = await statusBrief(resolve(root), slug);
          out(opt.json ? b : briefText(b));
          return b.error ? 1 : 0;
        }
        const s = await statusOf(resolve(root), slug ?? null);
        out(opt.json ? s : statusText(s));
        return s.error ? 1 : 0;
      }
      case 'index': {
        const [root] = pos;
        if (!root) throw new Error('index: <root> is required');
        const r = await reconcileIndex(resolve(root), { write: !opt.check });
        out(opt.json ? r : indexText(r));
        return opt.check && r.changed ? 1 : 0;
      }
      case 'cost': {
        const [root, slug] = pos;
        if (!root || !slug) throw new Error('cost: <root> <slug> are required');
        const agg = costSummary(join(wfRoot(resolve(root)), slug));
        out(opt.json ? agg : costText(agg));
        return 0;
      }
      case 'stamp': {
        const [type] = pos;
        if (!type) throw new Error('stamp: <type> is required');
        out(stampOf(type, { slug: opt.slug, slice: opt.slice ?? null }));
        return 0;
      }
      case 'decide': return runDecide(pos, opt);
      case 'step': return runStep(pos, opt);
      case 'profile': return runProfile(pos, opt);
      case 'findings': return runFindings(pos, opt);
      case 'record': return runRecord(pos, opt);
      case 'consent': return runConsent(pos, opt);
      case 'base': return runBase(pos, opt);
      case 'worktree': return runWorktree(pos, opt);
      case 'ship': return runShip(pos, opt);
      case 'drive': return await runDrive(pos, opt);
      case 'progress': {
        const [verb, root, slug] = pos;
        if (!['set', 'show'].includes(verb) || !root || !slug) throw new Error('progress: <set|show> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw new Error(`progress: no workflow folder ${dir}`);
        if (verb === 'set') {
          const change = Object.fromEntries(['stage', 'slice', 'status', 'run', 'driver', 'reason', 'resume'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          writeProgress(dir, change);
        }
        const p = progressOf(dir, slug);
        out(opt.json ? p : progressLine(p));
        return 0;
      }
      case 'defer': {
        const [verb, root, slug] = pos;
        if (verb !== 'check' || !root || !slug) throw new Error('defer: check <root> <slug> is required');
        const r = checkDeferrals(resolve(root), slug, { next: opt.next ?? null });
        out(opt.json ? r : r.entries.length ? r.entries.map(deferralLine).join('\n') : 'no open deferrals');
        return r.stop.length ? 1 : 0;
      }
      case 'path': {
        const [root, slug, file] = pos;
        if (!root) throw new Error('path: <root> is required');
        const projectRoot = resolve(root);
        // A draft stays in the local folder; every other file of a workflow is in its records folder.
        const local = slug && file ? join(localWorkflowsRoot(projectRoot), slug, file) : null;
        out(!slug ? wfRoot(projectRoot) : !file ? workflowDir(projectRoot, slug) : recordPathOf(projectRoot, local));
        return 0;
      }
      case 'board': {
        const [verb, root, slug, ...keys] = pos;
        if (!['add', 'move', 'regroup', 'remove'].includes(verb) || !root || !slug) throw new Error('board: <add|move|regroup|remove> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw new Error(`board: no workflow folder ${dir}`);
        const file = opt.board ?? null;
        let r;
        if (verb === 'add') {
          const [kind] = keys;
          if (!kind) throw new Error(`board add: <${BOARD_KINDS.join('|')}> is required`);
          // A file holds one entry or a list; flags hold one entry. A file avoids the quoting of a shell.
          const entries = opt.file
            ? JSON.parse(readFileSync(resolve(opt.file), 'utf8'))
            : Object.fromEntries(['key', 'kind', 'thread', 'text', 'why', 'source', 'name', 'area', 'side', 'state'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          r = boardAdd(dir, kind, entries, { file });
        } else if (verb === 'move') {
          if (!keys.length) throw new Error('board move: <item>... are required');
          if (!opt.to && !opt.new) throw new Error('board move: --to <thread>, or --new <thread> --name n [--area a], is required');
          r = boardMove(dir, keys, opt.to ?? null, { newThread: opt.new ? { key: opt.new, name: opt.name, area: opt.area } : null, file });
        } else if (verb === 'regroup') {
          if (!keys.length || !opt.to) throw new Error('board regroup: <thread>... --to <area> are required');
          r = boardRegroup(dir, keys, opt.to, { file });
        } else {
          if (!keys.length) throw new Error('board remove: <item>... are required');
          r = boardRemove(dir, keys, { file });
        }
        out(opt.json ? r : `${verb}: ${JSON.stringify(r)}`);
        return 0;
      }
      case 'receipt': {
        // Run the suites of the slice at HEAD; a receipt is written only when every suite passed.
        const [root, slug, slice] = pos;
        if (!root || !slug || !slice) throw new Error('receipt: <root> <slug> <slice> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw new Error(`receipt: no workflow folder ${dir}`);
        const file = join(dir, `.test-receipt-${slice}.json`);
        if (opt.check) {
          // A reader reuses the receipt only while the tree is the one that ran.
          if (!existsSync(file)) { out(opt.json ? { reusable: false, reason: 'no receipt' } : 'no receipt'); return 1; }
          const held = JSON.parse(readFileSync(file, 'utf8'));
          const state = receiptState(projectRoot, held);
          out(opt.json ? { ...state, receipt: held } : state.reusable ? `receipt reusable: ${held.commands.join(', ')} passed at ${String(held.sha).slice(0, 8)}` : `receipt stale: ${state.reason}`);
          return state.reusable ? 0 : 1;
        }
        const g = (args) => spawnSync('git', ['-C', projectRoot, ...args], { encoding: 'utf8', windowsHide: true });
        const head = g(['rev-parse', 'HEAD']);
        if (head.status !== 0) throw new Error(`receipt: ${projectRoot} has no commit`);
        // A change outside .ai that HEAD lacks does not refuse the receipt: it is named, with the
        // hash of the file that the suites run with, so a reader can tell when it changes.
        const dirty = treeChanges(projectRoot);
        const profile = readProfile(projectRoot);
        const names = opt.suites ? String(opt.suites).split(',').map((s) => s.trim()).filter(Boolean) : STAGE_SUITES.implement.filter((s) => profile[s]?.command);
        if (!names.length) throw new Error('receipt: the test profile has no suite for implement; set one with profile set');
        const runs = [];
        for (const name of names) {
          const suite = profile[name];
          if (!suite?.command) throw new Error(`receipt: the test profile has no command for the ${name} suite`);
          const t0 = Date.now();
          const r = spawnSync(suite.command, { cwd: projectRoot, shell: true, stdio: opt.json ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true });
          const seconds = Math.round((Date.now() - t0) / 100) / 10;
          if (!r.error) recordRun(projectRoot, name, seconds);
          runs.push({ suite: name, command: suite.command, pass: r.status === 0, seconds });
          if (r.status !== 0) break;
        }
        const pass = runs.length === names.length && runs.every((r) => r.pass);
        const receipt = { sha: head.stdout.trim(), commands: runs.map((r) => r.command), result: 'pass', at: nowIso(), dirty };
        if (pass) writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
        const named = dirty.length ? ` with ${dirty.length} change(s) that HEAD lacks: ${dirty.map((d) => d.path).join(', ')}` : '';
        out(opt.json ? { pass, runs, receipt: pass ? file : null, dirty } : pass ? `receipt ${file}: ${runs.map((r) => r.suite).join(', ')} passed at ${receipt.sha.slice(0, 8)}${named}` : `no receipt: ${runs.find((r) => !r.pass)?.suite} failed`);
        return pass ? 0 : 1;
      }
      case 'slice': {
        const [verb, root, slug, slice] = pos;
        if (!['drop', 'move'].includes(verb) || !root || !slug || !slice) throw new Error('slice: <drop|move> <root> <slug> <slice> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw new Error(`slice: no workflow folder ${dir}`);
        const r = verb === 'drop'
          ? dropSlice(dir, slice, { reason: opt.reason })
          : moveSlice(dir, join(wfRoot(projectRoot), String(opt.to ?? '')), slice, { fromSlug: slug, toSlug: opt.to, reason: opt.reason });
        // The target of a move commits as its own change; main() commits the source.
        if (verb === 'move') afterChange(projectRoot, opt.to, { label: `${opt.to}: slice move ${slice} from ${slug}` });
        await reconcileIndex(projectRoot);
        out(opt.json ? r : verb === 'drop' ? `dropped ${slice} from ${slug}` : `moved ${slice} from ${slug} to ${r.to}`);
        return 0;
      }
      case 'brief': {
        const [root, slug, stage, slice] = pos;
        if (!root || !slug || !stage) throw new Error('brief: <root> <slug> <stage> are required');
        const b = buildBrief({ projectRoot: resolve(root), referenceRoot: REFERENCE_ROOT, slug, stage, slice: slice ?? null, wfCli: join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'wf.mjs') });
        if (opt.json) out(b); else process.stdout.write(b.text);
        return 0;
      }
      default:
        process.stderr.write(`${USAGE}\n`);
        return 2;
    }
  } catch (e) {
    process.stderr.write(`wf.mjs: ${e.message}\n${hintOf(cmd, pos, e.message)}`);
    return 1;
  }
}

// The hint after an error: a slug in the place of the root, or the forms of the command.
function hintOf(cmd, pos, message) {
  const roots = { decide: 1, step: 1, record: 1, findings: 1, progress: 1, profile: 1, defer: 1, consent: 1, lease: 1, msg: 1 };
  const at = Object.hasOwn(roots, cmd) ? 1 : 0;
  const root = pos[at];
  if (/no workflow folder/.test(message) && root && !existsSync(join(resolve(root), '.ai')) && existsSync(join(process.cwd(), '.ai'))) {
    return `wf.mjs: ${root} is not a project root. The project root comes first: wf.mjs ${cmd} ${at ? `${pos[0]} ` : ''}"<project root>" <slug> ...\n`;
  }
  return /are required|is required|unknown verb|must be one of/.test(message) && cmd ? `wf.mjs: run wf.mjs help ${cmd} for its forms and flags\n` : '';
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main();
