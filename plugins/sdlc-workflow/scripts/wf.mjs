#!/usr/bin/env node
/**
 * scripts/wf.mjs — the deterministic parts of /wf, in code. skills/wf/scripts/wf.mjs runs it.
 *
 *   dispatch <root> [--host claude|codex|pi] [--json] [--] <token>...
 *             Step 0 of SKILL.md: the key, the reference and where the key's arguments start.
 *             Pass a token that does not match ^[A-Za-z0-9#._/-]+$ as @. A `close-ask:` line names
 *             each open workflow whose branch is merged. A `first-run:` line says that the repo has
 *             no .ai/ folder, so the setup runs before the key. It commits and fetches nothing; a
 *             `records: ask` or `records: stop` line comes only when the records need the person.
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
 *   records  <link|status|sync|push|close|retry|dismiss|migrate> [<root>] [<project>|<slug>] [--problems] [--dry-run] [--json]
 *             the records repo: link a project (its records move into the clone, and each
 *             workflow gets its issue), show the clone (--problems: only the failed pushes, the
 *             conflicts and the files in no commit, at most 40 lines), pull the work of other
 *             machines, push the clone, close a workflow (commit, push, release its lease), the
 *             two answers to a records question of the dispatch (retry: commit the workflow again
 *             and push and flush in the background; dismiss: ask again only about a newer
 *             failure), and move the live branches of an older version onto the main branch once
 *             Example: wf.mjs records status . --problems
 *             Example: wf.mjs records migrate --dry-run
 *   lease    <claim|release|show|decline> <root> <slug> [--take] [--host h] [--json]
 *             the lease of a workflow: the one machine that writes its records now, when two or
 *             more machines are registered. A new claim also pulls (--take: an expired lease of
 *             another machine, after the person said yes; decline: the answer no to a lease
 *             question, exit 1)
 *             Example: wf.mjs lease claim . demo
 *   msg      <post|list|read> <root> <slug> [<id>] [--kind k --text t] [--to <project>] [--unread]
 *             messages between machines and projects: one file each in the workflow's inbox/.
 *             --to reads a project that is not linked here from the records repo, and a post
 *             to it pushes only the message file
 *             Example: wf.mjs msg post . demo --kind note --text "the API is ready"
 *   design   init <root>
 *             make .ai/design/: the manifest, tokens.css, the git rule, the repo entry
 *             Example: wf.mjs design init .
 *   design   next <root> <slug>
 *             the one next action of the design stage of a workflow, from disk
 *             Example: wf.mjs design next . demo --json
 *   design   status <root> <slug>
 *             the open threads, the drift, the last check, the newest round and version, and the next action
 *             Example: wf.mjs design status . demo
 *   design   doctor <root>
 *             which browser a check uses, whether the server runs, whether the records are linked, the viewports
 *             Example: wf.mjs design doctor .
 *   design   foundation <root>
 *             the tokens and the components; exit 1 until a new screen can be drawn, with the command for each missing part
 *             Example: wf.mjs design foundation .
 *   design   component add <root> <key> [--title t] [--code file --name n] [--workflow slug]
 *             add a component: --code names the code that has it; with no --code it is new
 *             Example: wf.mjs design component add . button --code src/components/ui/button.tsx --name Button
 *   design   component link <root> <key> --code file --name n
 *             record the code of a new component, after the build makes it
 *             Example: wf.mjs design component link . order-row --code src/components/OrderRow.tsx --name OrderRow
 *   design   component remove <root> <key> [--force]
 *             take a component out of the library; --force when a screen still uses it
 *             Example: wf.mjs design component remove . order-row
 *   design   component spec <root> <key> [--variants "dim=a|b; dim2=x|y"] [--states "default hover ..."] [--kind component|layout]
 *             declare the variants and states of a component and add an empty cell for each case it lacks; with no option, print its spec and problems
 *             Example: wf.mjs design component spec . button --variants "tone=solid|ghost" --states "default hover pressed focus disabled"
 *   design   components <root> [--workflow slug]
 *             the component library, each with its code and its screens
 *             Example: wf.mjs design components .
 *   design   components scan <root>
 *             the components of the product code, each with the command that adds it
 *             Example: wf.mjs design components scan .
 *   design   components none <root> --reason r
 *             record that the product has no reusable parts
 *             Example: wf.mjs design components none . --reason "A terminal surface"
 *   design   components verify <root> <slug> [--slice s]
 *             exit 1 when the code does not have or use a component of the screens
 *             Example: wf.mjs design components verify . demo
 *   design   screen add <root> <key> [--title t] [--area a] [--flow f] [--order n] [--workflow slug] [--slice s]
 *             add a screen, or change its fields
 *             Example: wf.mjs design screen add . basket --area checkout --workflow demo
 *   design   screen remove <root> <key> [--force]
 *             take a screen off the surface; --force when an approval or a contract names it
 *             Example: wf.mjs design screen remove . basket-old
 *   design   screen rename <root> <old> <new> [--force]
 *             give a screen a new key, in the manifest, its page, the links and the layout
 *             Example: wf.mjs design screen rename . basket cart
 *   design   list <root> [--workflow slug]
 *             the screens (one workflow with --workflow), their states and links
 *             Example: wf.mjs design list .
 *   design   explore add <root> <key> [--title t] [--link slug]
 *             record an explore sketch
 *             Example: wf.mjs design explore add . nav-ideas --link demo
 *   design   tokens <root>
 *             write tokens.css from DESIGN.md (the root, .agents/context/ or docs/)
 *             Example: wf.mjs design tokens .
 *   design   tokens import <root> <file.tokens.json...>
 *             read W3C design token files (from Figma, Penpot or Tokens Studio; one file per theme, the default first) and print them as the token tables of DESIGN.md
 *             Example: wf.mjs design tokens import . light.tokens.json dark.tokens.json
 *   design   track <root> [--check]
 *             keep .ai/design/ tracked in git
 *             Example: wf.mjs design track . --check
 *   design   check <root> [key...] [--workflow slug]
 *             the screen checks, in each viewport and state; the last line is the one next action
 *             Example: wf.mjs design check . --workflow demo
 *   design   review-pack <root> <slug> [--size n]
 *             one packet for each batch of screens changed since the last review, for a team of reviewer agents; prints each packet file
 *             Example: wf.mjs design review-pack . demo
 *   design   review-done <root> <slug> [--packet file...]
 *             record the review: the fingerprints of the screens it read and the threads that the reviewers added
 *             Example: wf.mjs design review-done . demo
 *   design   round <root> <slug> [--reason r]
 *             save the pages as a draft, with the decisions since the last draft
 *             Example: wf.mjs design round . demo
 *   design   approve <root> <slug> [key...] [--slice s] [--reason r]
 *             record the approval from the answer event: commit, version, pictures, 02c-craft.md
 *             Example: wf.mjs design approve . demo
 *   design   waive <root> <slug> [--cause c --reason r]
 *             accept one cause of a token, component, layout or library failure for a workflow, so the approval goes on over it; with no --cause, list the waivers
 *             Example: wf.mjs design waive . demo --cause "#aa0000" --reason "The brand red of the partner logo"
 *   design   versions <root> <slug>
 *             the approved versions and the rounds of a workflow
 *             Example: wf.mjs design versions . demo
 *   design   approved <root> <slug>
 *             the pages of the newest approved version, each with its approval picture, for the build
 *             Example: wf.mjs design approved . demo
 *   design   restore <root> <slug> <version>
 *             put the pages of a version back, as a new round that needs a new approval
 *             Example: wf.mjs design restore . demo v1
 *   design   rounds drop <root> <slug>
 *             delete the rounds of a closed workflow
 *             Example: wf.mjs design rounds drop . demo
 *   design   viewports <root> [name=WxH...]
 *             the viewports of the surface; with pairs, set them
 *             Example: wf.mjs design viewports . phone=375x812 desktop=1280x800
 *   design   areas <root> [area...]
 *             the areas in the order of the navigation; with names, set the order
 *             Example: wf.mjs design areas . home checkout account
 *   design   refs check <root>
 *             exit 1 when a reference is not a readable file in the repo
 *             Example: wf.mjs design refs check .
 *   design   refs add <root> <key> --file f [--kind k] [--link l] [--note n]
 *             record a reference file
 *             Example: wf.mjs design refs add . mood --file docs/mood.png --kind image
 *   design   comments <root> [key...] [--workflow slug]
 *             the open comment threads, as untrusted data for a round
 *             Example: wf.mjs design comments . --workflow demo
 *   design   comments reply <root> <key> <thread> --text t [--resolve]
 *             answer a thread, and close it with --resolve
 *             Example: wf.mjs design comments reply . basket 1a2b3c4d --text "Moved the total up" --resolve
 *   design   comments add <root> <key> --text t --author a [--selector s] [--state st] [--viewport v] [--label l]
 *             open a thread as an agent (author agent or review:<model>); the same open finding is not added twice
 *             Example: wf.mjs design comments add . basket --author review:sonnet --selector ".total" --state default --viewport phone --text "Token role: the total uses --text as its background; use --surface"
 *   design   capture-path <root> <slug> <slice> <key>
 *             where verify writes the capture of a built screen
 *             Example: wf.mjs design capture-path . demo api basket
 *   design   captures <root> <slug> <slice>
 *             the captures of a slice; a linked project commits them to the records
 *             Example: wf.mjs design captures . demo api
 *   design   state <root>
 *             the canvas data, as JSON
 *             Example: wf.mjs design state .
 *   design   publish <root> [--out file]
 *             one self-contained canvas page (no comments, no layout saves)
 *             Example: wf.mjs design publish .
 *   design   migrate <root> [slug...] [--check]
 *             move the boards of each workflow onto the surface, once; --check only plans
 *             Example: wf.mjs design migrate . --check
 *   design   server start [--port n]|stop|status
 *             the one design server of this computer
 *             Example: wf.mjs design server status
 *   design   server url [<root>] [--workflow slug] [--no-start]
 *             start the server when it is stopped, and print the address for this computer and for the phone
 *             Example: wf.mjs design server url . --workflow demo
 *   design   server install|uninstall
 *             the Windows scheduled task that starts the server at logon
 *             Example: wf.mjs design server install
 *   modernize <root> <slug> [--check] [--json]
 *             convert an old workflow: the record files into the YAML layout, and the stages
 *             shape and handoff into intake and ship in the index (--check: only report)
 *             Example: wf.mjs modernize . demo --check
 *   page     <brief|put|check> <root> <slug> [--json]
 *             the page of a brainstorm: the brief of the page agent, the check and move of its
 *             draft (.draft/page.html → page/index.html), or the check of the page in place
 *             Example: wf.mjs page check . demo
 *   gh       <flush|status> [<root>] [<slug>] [--json]
 *             the GitHub layer: send the queued issue edits and comments in order until the
 *             queue is empty, or show what is queued and parked. Each state change of a workflow
 *             queues one progress edit by itself. A network error gets one more try after 5 s; an
 *             entry that fails three flushes is parked, so the rest go on. Each flush writes its
 *             result to the records log. With <root> <slug>, flush also imports the comments of
 *             that workflow's issue into its inbox
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
 *   target   <root> [<slug>|pr#N|#N|<N>|<branch>] [--json]
 *             the first argument of handoff, ship, retro, recap and status: {scope, slugs, branch}.
 *             A slug wins, then a PR (its head branch by gh pr view), then a branch: its roster
 *             is every workflow whose index names that branch. No argument: the one open
 *             workflow (ambiguous: true lists several). Exit 1 when nothing resolves
 *             Example: wf.mjs target . pr#12 --json
 *   index    <root> [--check]
 *             rebuild .ai/workflows/INDEX.md from the 00-index.md files
 *             Example: wf.mjs index . --check
 *   cost     <root> <slug> [--json]
 *             the sums of the slug's cost ledger (cost-<yyyy-mm>.jsonl) per key
 *             Example: wf.mjs cost . demo
 *   stamp    <type> [--slug s] [--slice x]
 *             the frontmatter template of an artifact type, with every required field
 *             Example: wf.mjs stamp plan --slug demo --slice api
 *   board    add <root> <slug> <item|thread|area|work|log|sketch|budget|brief> (--file <entries.json> | --key k [--kind k]
 *                [--thread t] [--text x] [--why w] [--source s] [--name n] [--area a] [--side s]
 *                [--state s]) [--board <file>]
 *             add entries of one kind to the brainstorm board; the file holds one entry or a
 *             list. The whole board is checked against the schema before the write, and every
 *             board form that writes renders the person's document from the board in the same
 *             call (01-brainstorm.md, design-notes/brainstorm-design.md, or the slug-mode slice).
 *             --board names the board file when it is not brainstorm-board.json (a slug-mode
 *             board, or brainstorm-board-design.json of a feature); every board form takes it
 *             Example: wf.mjs board add . ideas item --key cap-warns --kind decision --thread limits --text "A cap warns." --source person
 *   board    apply <root> <slug> --file <change.json> [--board <file>]
 *             one batch in one write: {"add": {"<kind>": [...]}, "set": {"<key>": {...}}, "board": {...},
 *             "close": {"areas": [...] | "open", "marks": {"<key>": "<mark>"}},
 *             "summary": "...", "story": {"session": n, "text": "..."}, "briefs": {"<area>": "..."}, "remove": [...]}
 *             Example: wf.mjs board apply . ideas --file .draft/batch.json
 *   board    digest <root> <slug> [--area a[,b...]] [--full] [--file <close.json>] [--board <file>]
 *             read the scope, writing nothing. Compact by default: per area the counts, and the text
 *             only of what the person must look at (the items not settled, with the proposed mark,
 *             and the cuts that wait), and the planned questions of done; --area gives the item
 *             texts of those areas, --full of every area; --file shows the board as that close
 *             would leave it
 *             Example: wf.mjs board digest . ideas --area seeing-the-cost --json
 *   board    set <root> <slug> [<key>] <field=value>... [--board <file>]
 *             set fields of one entry by its key, or of the board itself with no key; a value is
 *             read as JSON when it parses, else as text; field=null removes the field
 *             Example: wf.mjs board set . ideas cap-warns scope=keep core=true
 *   board    prose <root> <slug> <summary|story|brief|carried> (--file <text file> | --text x)
 *                [--session n] [--date YYYY-MM-DD] [--area a] [--heading h] [--board <file>]
 *             set the summary, the story of a session (the current one by default), the brief of
 *             an area, or a carried section (an empty text removes it)
 *             Example: wf.mjs board prose . ideas summary --file .draft/summary.md
 *   board    render <root> <slug> [--check] [--board <file>]
 *             render the person's document from the board now; --check writes nothing and exits 1
 *             when the document does not show the board
 *             Example: wf.mjs board render . ideas
 *   board    adopt <root> <slug> [--board <file>]
 *             read the prose of a hand-written document (the summary, the area briefs, the
 *             session stories, and any other section) into the board, after a snapshot of both
 *             files to history/, then render; text that maps to no field is kept word for word
 *             Example: wf.mjs board adopt . ideas
 *   board    move <root> <slug> <item>... (--to <thread> | --new <thread> --name n [--area a]) [--board <file>]
 *             move items into a thread; --new makes the thread first
 *             Example: wf.mjs board move . ideas cap-warns cap-per-run --new caps --name "Spending caps" --area cost
 *   board    regroup <root> <slug> <thread>... --to <area> [--board <file>]
 *             move threads into another area
 *             Example: wf.mjs board regroup . ideas caps alerts --to cost
 *   board    remove <root> <slug> <item>... [--board <file>]
 *             remove items that nothing else on the board names (a work packet, a brief, a
 *             budget, a sketch, a tension, a replaced-by)
 *             Example: wf.mjs board remove . ideas old-idea
 *   receipt  <root> <slug> <slice> [--suites a,b] [--json]
 *             run the suites of the test profile (the implement suites, or --suites) at HEAD,
 *             and write .test-receipt-<slice>.json only when every suite passed; exit 1 else.
 *             A tracked change outside .ai that HEAD lacks goes into its dirty list, with its hash.
 *             With no implement suite in the profile: a receipt of none, exit 0 (record
 *             stage-done implement writes it too)
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
 *                [--packet p] [--slice s] [--files f,g] [--stage s] [--rewrote f,g] [--source s] [--json]
 *             Example: wf.mjs decide add . demo --key db --question "Which database?" --answer postgres
 *   decide   add <root> <slug> --file <answers.json> [--by b] [--stage s] [--json]
 *             record a decision; a live entry with the same key and scope is superseded, and
 *             each record that names it gets superseded-decisions.<old id>: <new id>
 *             Example: wf.mjs decide add . demo --file .ai/workflows/demo/.draft/answers.json
 *   decide   list <root> <slug> [--packet p] [--slice s] [--files f,g] [--by b] [--kind k] [--all] [--json]
 *             the live entries in a scope (--all: every entry; --by standing: the cases that a
 *             standing answer settled). Use it to read what is decided;
 *             use decide answered to test one key before a question is asked
 *             Example: wf.mjs decide list . demo --slice api
 *   decide   answered <root> <slug> --key k [--packet p] [--slice s] [--files f,g] [--json]
 *             exit 0 and the entry when a live entry answers the key, exit 1 when none does. A
 *             standing answer (key standing:<kind>) answers each key <kind>:<case>.
 *             Use it before a question is asked; use decide list to read every decision
 *             Example: wf.mjs decide answered . demo --key db
 *   decide   hold <root> <slug> --key k --question q --stage s [--slice s]
 *                [--options "a|b"] [--recommended a] [--json]
 *             publish a question that a running stage holds while it continues: the entry goes
 *             into open-questions of the index, so a look-in can ask it by its exact key; a
 *             second hold of the key replaces it, and decide add with the key settles it
 *             Example: wf.mjs decide hold . demo --key db --question "Which database?" --stage implement
 *   decide   wait <root> <slug> --key k[,k2] [--stage s] [--slice s] [--packet p] [--files f,g]
 *                [--seconds n] [--json]
 *             block until each held question of the keys has an answer. One call blocks for
 *             4 minutes at most (--seconds sets that time): give the shell call a timeout of
 *             5 minutes. It prints each answer, or "still waiting" (run the command again at
 *             once; the wait has no limit). It writes a waiting line to the driver journal, so
 *             the watch sends the question to the session
 *             Example: wf.mjs decide wait . demo --key db --stage implement
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
 *             the suites of the test profile with their commands and times, and the check budget
 *             Example: wf.mjs profile show .
 *   profile  set <root> <suite> --command c --estimate seconds
 *             the command of a suite and the estimate of intake, with no run
 *             Example: wf.mjs profile set . fast --command "npm test" --estimate 30
 *   profile  record <root> <suite> <seconds>
 *             a real run of a suite: its time replaces the estimate
 *             Example: wf.mjs profile record . fast 42
 *   profile  run <root> <suite> [--json]
 *             run the command of a suite in the root and record its time; exit 1 when it fails
 *             Example: wf.mjs profile run . fast
 *   profile  timebox <root> <stage> [--work seconds] [--json]
 *             the time box of a stage agent, from the suites that the stage runs
 *             Example: wf.mjs profile timebox . verify
 *   profile  budget <root> [--preset fast-loop|balanced|thorough] [--slice s] [--long s] [--machines a,b] [--json]
 *             the check budget of the repo: the longest slice check, the longest long run (none: no
 *             limit) and the machines for split runs; with no option, show it
 *             Example: wf.mjs profile budget . --preset fast-loop --machines desk-1,laptop
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
 *   progress watch <root> <slug> [--once] [--json]
 *             the live view of a driver run, for a second terminal: where the run stands, each
 *             running agent of a Codex run with its minutes and the command it is in, and the
 *             last lines of the commentary. It prints again every 5 seconds until the run ends;
 *             --once prints one time
 *             Example: wf.mjs progress watch . demo
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
 *             section of the record files; a draft with errors stays, and exit 1. A draft that
 *             was put stays in .draft/.put/ until record stage-done: edit it and put it again
 *             Example: wf.mjs record put . demo 04-plan-api.md
 *   record   get <root> <slug> <name>... [--section <heading>|--field <path>|--outline|--fields a,b]
 *                [--full] [--json]
 *             records as Markdown with frontmatter; several names in one call. --section prints
 *             the text under one ## heading, --field one value by a path of record set,
 *             --outline the fields and the ## headings with their sizes, --fields only those
 *             fields. A record over 20 KB prints its outline; --full prints all of it
 *             Example: wf.mjs record get . demo 04-plan-api --section "Steps"
 *   record   draft <root> <slug> <name> [--json]
 *             write one record as its draft (.draft/<old name>.md) to change its body: edit the
 *             draft, then run record put
 *             Example: wf.mjs record draft . demo 04-plan-api
 *   record   edit <root> <slug> <name> --section <heading> --from <file> | --replace <old> --with <new>
 *             change a body in place with the checks of put, and no draft: the text under one
 *             ## heading becomes the text of the file, or one exact text is replaced (refused
 *             when it matches nothing or more than once)
 *             Example: wf.mjs record edit . demo 05-implement-api --replace "- [ ] AC-2" --with "- [x] AC-2"
 *   record   set <root> <slug> <name> <path=value>...
 *             merge fields into one record; a value reads as YAML, null deletes the field.
 *             Paths: field=v, a.b=v, list[<slug>].field=v, list[0].field=v, list+=v, list-=v.
 *             A value outside the enum of the schema is refused with the allowed values.
 *             A <name> of get, draft, edit and set is the record name with or without .md
 *             and its number, index, or a stage name (implement-api, 05-implement, review);
 *             a name that fits several records lists them, and exit 1
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
 *   ship     ready <root> [<slug>] [--allow-no-plan] [--json]
 *             the gaps before ship that a script sees; with a slug, each gap is a person task of
 *             the workflow; exit 1 when there is a gap; --allow-no-plan leaves out the no-plan gap
 *             Example: wf.mjs ship ready . demo
 *   ship     merge <root> <slug> [--pr N] [--method merge|rebase|squash] [--print]
 *             merge the PR by --method or else the method of the facts, or print the one
 *             command when a review or a merge queue is in the way (exit 3); never deletes
 *             the branch
 *             Example: wf.mjs ship merge . demo --method rebase
 *   ship     finish <root> <slug> [--keep-branch]
 *             after the merge: fast-forward and switch to the base, delete the branch here and
 *             on the remote (unless --keep-branch), and mark the workflow shipped
 *             Example: wf.mjs ship finish . demo --keep-branch
 *   drive    <root> <slug> [<slice>] [--answered <file.json>] [--delegate] [--resume <run>]
 *            [--review-findings] [--time-box <minutes>] [--detach] [--no-watch] [--json]
 *             run the yolo driver under Node, each agent as one `codex exec` call; prints the
 *             outcome, and keeps the run's records in .scratch/wf/drive/<run>/. --review-findings:
 *             the slug-wide review fixes only the findings that the campaign walk put in the ledger.
 *             --detach: start the driver and its watch as their own processes and return at once;
 *             the watch sends the news of the run to the Codex session that ran the command
 *             (--no-watch starts none). The command runs outside the sandbox of Codex: inside
 *             it, it refuses before any agent starts
 *             Example: wf.mjs drive . demo api --detach
 *   inbox    <root> [--json]
 *             everything that waits on the person, across every workflow, oldest first: the slug,
 *             the kind, what is asked, since when, and what the person types to answer it. It
 *             reads the disk only (lib/inbox.mjs lists the sources) and calls no network
 *             Example: wf.mjs inbox . --json
 *   requires <root> <slug> <stage> [--mode m]... [--slice s] [--on-resume] [--max-bytes n] [--json]
 *             the inputs of a stage run in one call, from the Requires table of the stage
 *             reference: each artifact with its content (or its named sections), each procedure
 *             with whether to read it, and the missing rows. Over --max-bytes (60 KB) the largest
 *             artifacts come as their outline. Exit 1 when a missing input stops the stage
 *             Example: wf.mjs requires . demo plan --slice api --json
 *   standing <suggest|list> <root> [--json]
 *             the standing answers of the project: suggest lists the questions whose last three
 *             answers of the person are the same, with no standing answer and no declined offer
 *             Example: wf.mjs standing suggest .
 *   standing <check|clear|decline> <root> <key> [--json]
 *             check: exit 0 and the standing answer of a key, exit 1 when none; clear: ask the
 *             question again; decline: the person said no to the offer, so it is not made again
 *             Example: wf.mjs standing check . ship-merge
 *   standing set <root> <key> --answer a --question q --by person [--json]
 *             set a standing answer, only on the person's yes to the offer: the answer and the
 *             question in the person's words
 *             Example: wf.mjs standing set . pr-wanted --answer "No — keep the commit" --question "Make it the standing answer?" --by person
 */
import { spawn, spawnSync } from 'node:child_process';
import { fromGitBashPath, undoGitBashPath, unrepairedWarning } from '../lib/msys.mjs';
// The enums that a usage error lists with the forms (hintOf).
import { BY as DECISION_BY, KINDS as DECISION_KINDS } from '../lib/decisions.mjs';
import { SOURCES as FINDING_SOURCES, STATUSES as FINDING_STATUSES } from '../lib/findings.mjs';
import { STATUSES as PROGRESS_STATUSES } from '../lib/progress.mjs';
import { STOP_KINDS } from '../lib/steps.mjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildBrief } from '../lib/brief.mjs';
import { putChecked } from '../lib/record-put.mjs';
import { driveArgs, driveScript, readRun } from '../lib/drive.mjs';
import { runView, runViewLines, sandboxProblem, sessionThread, startDetached } from '../lib/drive-detach.mjs';
import { appendJournalLine, appendRunEnd, journalPath } from './yolo-watch.mjs';
import { WAIT_CALL_MS, waitForAnswers } from '../lib/decide-wait.mjs';
import { parseJsonLines, stageOf } from '../lib/live-events.mjs';
import { checkConsent, grantConsent, revokeConsent } from '../lib/consent.mjs';
import { closeCandidates, closeWorkflow } from '../lib/closing.mjs';
import { needsSetup, setupProject } from '../lib/setup.mjs';
import { MAX_FAILS, backfill, flushOutbox, issueComments, layerOf, layerStatus, noteMessage, readOutbox } from '../lib/github-layer.mjs';
import { afterChange } from '../lib/after-change.mjs';
import { closeRecords, commitWorkflow, dismissRecords, inBackground, linkProject, logRecordsEvent, machineName, migrateLive, productRepoGapLines, productRepoGaps, pullRecords, pushRecords, recordsProblems, recordsStatus, syncRecords } from '../lib/records-sync.mjs';
import { claimAndPull, releaseLease, renewIfMine, showLease } from '../lib/leases.mjs';
import { recordsLine } from '../lib/records-line.mjs';
import { importComments, listMessages, postMessage, readMessage } from '../lib/messages.mjs';
import { checkPage, pageBrief, putPage } from '../lib/brainstorm-page.mjs';
import { modernizeWorkflow } from '../lib/modernize.mjs';
import { runDesign } from '../lib/design-cli.mjs';
import { baseCheck, defaultRun, finishShip, mergeCommand, readyGaps, shipFacts } from '../lib/last-mile.mjs';
import { addScratchWorktree, removeScratchWorktrees } from '../lib/scratch-worktree.mjs';
import { addDecision, answeredBy, decisionLine, decisionsOf, dropAnswered, importLegacy, liveDecisions } from '../lib/decisions.mjs';
import { SAFE_TOKEN, UNSAFE, diskFacts, dispatch, dispatchLine } from '../lib/dispatch.mjs';
import { checkDeferrals, deferralLine } from '../lib/deferrals.mjs';
import { OPEN_STATUSES, findingsTable, mergeRun, metricsOf, readLedger, setStatus, updateLedger, verdictOf, writeLedger } from '../lib/findings.mjs';
import { progressLine, progressOf, readProgress, writeDriverOutcome, writeProgress } from '../lib/progress.mjs';
import { pruneEvidence } from '../lib/evidence.mjs';
import { DRAFT_DIR, INDEX_HEADER, INDEX_NAME, clearKept, docText, draftPath, draftsOf, frontmatterOfDoc, keptPath, listDocs, markSuperseded, migrateWorkflow, outlineOf, putDraft, readDoc, redirectOf, sectionText, setFields } from '../lib/records.mjs';
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.mjs';
import { PATH_FORMS, getPath } from '../lib/record-path.mjs';
import { SLICE_STAGES, SMALL_STAGE_FILES, STAGE_FILES, stageDone } from '../lib/stage-done.mjs';
import { dropSlice, moveSlice } from '../lib/slice-ops.mjs';
import { BOARD_KINDS, PROSE_KINDS, boardAdd, boardAdopt, boardApply, boardDigest, boardFieldArgs, boardMove, boardProse, boardRegroup, boardRemove, boardRender, boardSet } from '../lib/board-ops.mjs';
import { appendStep, branchOf, commitIdentity, gitRevParse, lastSlice, planDocOf, planProblems, readPlan, readSteps, sliceRefusal, stepCheckout, whereLine, whereOf } from '../lib/steps.mjs';
import { isMainModule } from '../lib/proc.mjs';
import { writeFileAtomic } from '../lib/atomic-write.mjs';
import { withFileLock } from '../lib/file-lock.mjs';
import { STAGE_SUITES, SUITES, BUDGET_PRESETS, budgetLine, noCommand, overLongBudget, profileLines, readBudget, readProfile, recordRun, setBudget, setSuite, timeBox } from '../lib/test-profile.mjs';
import { hookSuites } from '../lib/repo-hooks.mjs';
import { runSuiteLogged } from '../lib/run-files.mjs';
import { NO_SUITE, implementSuites, noSuiteReceipt, receiptState, treeChanges } from '../lib/test-receipt.mjs';
import { loadRegistry, reservedWords } from '../lib/registry.mjs';
import { scanWorkflowIndexes } from '../lib/workflow-index.mjs';
import { stageYoloDriver } from './stage-yolo-driver.mjs';
import { linkedProject, localWorkflowsRoot, recordsHome, workflowDir, workflowsRoot } from '../lib/records-root.mjs';
import { briefText, costSummary, count, statusBrief, statusOf, stepGit } from '../lib/wf-status.mjs';
import { resolveTarget, targetText } from '../lib/wf-target.mjs';
import { checkDismissDecision, decideAdd, defOfType, editRecord, holdQuestion, noRecord, pick, recordName, resolveRecord, resolveRef, schemaOf, setRecordPaths, settleQuestion } from '../lib/wf-ops.mjs';
import { runScript } from '../lib/wf-api.mjs';
import { inboxOf, inboxText } from '../lib/inbox.mjs';
import { REQUIRES_MAX_BYTES, resolveRequires } from '../lib/requires-resolve.mjs';
import { runStanding } from '../lib/standing.mjs';
import { agentFix, asFix, defectFix, fixLines, personFix, refuse } from '../lib/fix.mjs';

// The status and record bodies live in lib/, so the library calls the same functions.
export { briefText, defOfType, setRecordPaths, statusBrief, statusOf };

// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USAGE = 'Usage: wf.mjs <dispatch|status|target|index|cost|stamp|decide|step|progress|profile|defer|brief|findings|record|consent|base|ship|close|setup|gh|records|lease|msg|page|modernize|design|drive> ...';
const REFERENCE_ROOT = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const wfRoot = workflowsRoot;
const out = (v) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

// A refusal names its fix (lib/fix.mjs), and hintOf prints it as the last lines: `fix.who:`,
// `fix.do:`, then `fix: <command>` when a command makes the repair.
// An argument as a shell word in a fix line.
const word = (s) => (/^[A-Za-z0-9#._/:\\=,+-]+$/.test(String(s)) ? String(s) : `"${String(s).replace(/"/g, '\\"')}"`);
const ARGS_FIX = 'Run the command again with the arguments that its forms above name.';
/** A call that misses an argument or names a wrong verb: hintOf prints the forms of the command. */
const usage = (message) => refuse(message, agentFix(ARGS_FIX));
/** A slug that names no workflow: status lists the workflows of the root. */
const noFolder = (message, root) => refuse(message, agentFix('List the workflows with status, then run the command again with a slug that it names.', `wf.mjs status ${word(root)}`));
/** A repair that the agent makes alone. */
const redo = (message, doText, command = null) => refuse(message, agentFix(doText, command));
/** A repair that only the person makes. */
const ask = (message, doText) => refuse(message, personFix(doText));
/** The fix lines of a failed result on stderr; the result itself prints on stdout as before. */
const printFix = (fix) => { const lines = fixLines(fix ?? agentFix('Read the reason above, repair what it names, then run the command again.')); process.stderr.write(`${lines.join('\n')}\n`); };

function flags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (['json', 'check', 'all', 'open', 'delegate', 'print', 'decline', 'ignore', 'take', 'unread', 'resolve', 'no-change', 'brief', 'dry-run', 'allow-no-plan', 'keep-branch', 'outline', 'full', 'problems', 'background', 'review-findings', 'on-resume', 'force', 'no-start', 'detach', 'no-watch', 'once'].includes(name)) opt[name] = true;
      else {
        // Git Bash puts its install path in front of `/wf`: the repair is silent, and only a
        // value that it cannot repair warns.
        const { value } = undoGitBashPath(argv[(i += 1)]);
        const warn = unrepairedWarning(`--${name}`, value);
        if (warn) process.stderr.write(warn);
        // `--mode` may repeat (requires): the values join with a comma.
        opt[name] = name === 'mode' && opt.mode != null ? `${opt.mode},${value}` : value;
      }
    } else pos.push(fromGitBashPath(a));
  }
  return { pos, opt };
}

// ---------------------------------------------------------------- drive

/** The yolo driver on Codex: the script runs here, and each agent runs as `codex exec`. */
async function runDrive(pos, opt) {
  const [root, slug, slice] = pos;
  if (!root || !slug) throw usage('drive: <root> <slug> are required');
  const projectRoot = resolve(root);
  const staged = stageYoloDriver(projectRoot, { slug });
  const answered = opt.answered ? JSON.parse(readFileSync(resolve(opt.answered), 'utf8')) : null;
  if (answered && !Array.isArray(answered)) throw redo('drive: --answered must name a JSON array of answers', 'Write the answers file as a JSON array of answers, then run drive again.');
  const run = opt.resume || opt.run || `${nowIso().replace(/[-:]/g, '')}-${slug}`;
  const runDir = join(projectRoot, '.scratch', 'wf', 'drive', run);
  // Inside the sandbox of a Codex shell command no agent can start: say so now, not after the first stage fails.
  const sandboxed = process.env.SDLC_CODEX_ENTRY ? null : sandboxProblem();
  if (sandboxed) throw ask(`drive: ${sandboxed}`, 'The person approves this same command to run outside the sandbox of Codex (the approval prompt of the command, or a session with full access). Then run it again.');
  if (opt.detach) return detachDrive({ pos, opt, projectRoot, slug, run, runDir });
  if (opt.resume && !existsSync(runDir)) throw redo(`drive: no earlier run ${run} in .scratch/wf/drive/`, 'Run drive again with no --resume to start a new run, or with the name of a run folder in .scratch/wf/drive/.');
  const args = driveArgs({ projectRoot, referenceRoot: REFERENCE_ROOT, slug, run, staged, slice, answered, delegate: Boolean(opt.delegate), reviewFindings: Boolean(opt['review-findings']) });
  // The journal gets the end of this run whatever happens, so a watch of the run ends with it.
  // The last step of the driver writes the same line; a second end of one run appends nothing.
  const endRun = (stoppedAt, reason) => { try { appendRunEnd(projectRoot, slug, stoppedAt, Date.now(), { run, reason, agent: 'drive' }); } catch { /* the watch then ends by its own rules */ } };
  let r;
  try {
    r = await driveScript({
      source: readFileSync(staged.scriptPath, 'utf8'), args, cwd: projectRoot, runDir,
      resume: opt.resume ? readRun(runDir) : undefined,
      timeoutMs: opt['time-box'] ? Number(opt['time-box']) * 60_000 : undefined,
      say: (line) => process.stderr.write(`[drive ${run}] ${line}\n`),
    });
  } catch (e) {
    endRun('driver', `the driver stopped with an error: ${e.message}`);
    throw e;
  }
  endRun(r.result?.ok ? null : (r.result?.stoppedAt ?? 'driver'), r.result?.ok ? null : (r.result?.reason ?? 'the driver gave no outcome'));
  // The outcome stays on this machine for `status --brief`.
  try {
    const o = r.result ?? {};
    writeDriverOutcome(join(wfRoot(projectRoot), slug), { run, driver: 'yolo', host: 'codex', ok: Boolean(o.ok), status: o.ok ? 'done' : o.questions?.length ? 'waiting' : 'stopped', stoppedAt: o.stoppedAt ?? null, reason: o.reason ?? null, route: o.route ?? null, questions: Array.isArray(o.questions) ? o.questions.length : 0 });
  } catch { /* status --brief then shows the progress record only */ }
  out(opt.json ? { run, runDir, ...r } : { run, outcome: r.result, agents: r.totals.agents, failed: r.totals.failed, usage: r.totals.usage });
  return r.result && r.result.ok ? 0 : 3;
}

/** `drive --detach`: the driver and its watch run as their own processes, and this command returns. */
function detachDrive({ pos, opt, projectRoot, slug, run, runDir }) {
  if (opt.resume && !existsSync(runDir)) throw redo(`drive: no earlier run ${run} in .scratch/wf/drive/`, 'Run drive again with no --resume to start a new run, or with the name of a run folder in .scratch/wf/drive/.');
  const self = fileURLToPath(import.meta.url);
  const pass = ['answered', 'time-box'].filter((k) => opt[k] != null).flatMap((k) => [`--${k}`, k === 'answered' ? resolve(String(opt[k])) : String(opt[k])]);
  const bools = ['delegate', 'review-findings'].filter((k) => opt[k]).map((k) => `--${k}`);
  const driveArgv = [self, 'drive', projectRoot, ...pos.slice(1), ...pass, ...bools, ...(opt.resume ? ['--resume', run] : ['--run', run]), '--json'];
  const thread = opt['no-watch'] ? null : (opt.thread ?? sessionThread());
  const watchArgv = opt['no-watch'] ? null : [join(PLUGIN_ROOT, 'scripts', 'yolo-watch.mjs'), projectRoot, slug, ...(thread ? ['--queue', thread] : ['--max-minutes', '1440'])];
  const r = startDetached({ projectRoot, slug, run, driveArgv, watchArgv, thread });
  const view = `wf.mjs progress watch ${word(projectRoot)} ${slug}`;
  if (opt.json) out({ ok: true, ...r, view });
  else {
    out(`drive: run ${r.run} started (pid ${r.pid}). Its records are in ${r.runDir}`);
    out(thread ? `watch: started (pid ${r.watchPid}). It sends the news of the run to this session (${thread}): end your turn, and handle each watch message as yolo/_commentary.md says.`
      : r.watchPid ? `watch: started (pid ${r.watchPid}), but this command names no Codex session (CODEX_THREAD_ID is not set), so no news is sent. Look at the run with the view below.`
        : 'watch: none (--no-watch)');
    out(`view: ${view}`);
  }
  return 0;
}

// ---------------------------------------------------------------- dispatch

async function runDispatch(pos, opt) {
  const [root, ...tokens] = pos;
  if (!root) throw usage('dispatch: <root> is required');
  const safe = tokens.map((t) => (t === UNSAFE || SAFE_TOKEN.test(t) ? t : UNSAFE));
  const projectRoot = resolve(root);
  // The dispatch commits nothing and fetches nothing: a records commit pushes in the background,
  // and the pull runs at a claim of the lease, at `records sync` and at `msg list`.
  const r = dispatch(loadRegistry(PLUGIN_ROOT), safe, diskFacts(projectRoot), { host: opt.host ?? null });
  const linked = linkedProject(projectRoot);
  const layer = layerOf(projectRoot);
  const target = linked || layer ? slugAtDispatch(projectRoot, r, safe) : null;
  // The folder of the workflow that the call names, status too: every reference path is in it.
  const wfSlug = slugAtDispatch(projectRoot, r, safe, { reads: true });
  r.wfDir = wfSlug ? workflowDir(projectRoot, wfSlug) : null;
  // One records line, or none when all is well: the lease (two or more computers), the last
  // push, and the last flush of the GitHub layer.
  const rec = recordsLine(projectRoot, { target: linked ? target : null, host: opt.host ?? null });
  r.records = rec.line;
  // The registry is generated in the clone: a pull at the claim that moved a folder rebuilds it.
  if (rec.pulled) await reconcileIndex(projectRoot);
  // The open workflows whose branch is merged: the person is asked whether to close each one.
  // A PR answer older than the cache time is checked in the background, for the next call.
  const stale = [];
  r.closeAsk = closeCandidates(projectRoot, await scanWorkflowIndexes({ projectRoot }), { offline: true, stale });
  if (stale.length) closeCheckInBackground(projectRoot);
  // A repo with no .ai/ folder runs the setup before the key. Status and the router only read.
  r.firstRun = Boolean(r.key && r.key !== 'status' && needsSetup(projectRoot));
  // The queued GitHub edits and the person's comments on the issue of the workflow come in the
  // background, so the call does not wait on the network.
  if (layer && (target || readOutbox().length)) flushInBackground(target ? [projectRoot, target] : []);
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
  // The one folder of the workflow: each `<wf-dir>/` path of a reference is in it.
  if (r.wfDir) lines.push(`wf-dir: ${r.wfDir}`);
  if (r.records) lines.push(r.records);
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

export { INDEX_HEADER };

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
  // The whole file goes in one rename, so a reader never sees a part of it.
  if (write && changed && (rows.size || existed)) writeFileAtomic(file, text);
  return {
    bootstrapped: !existed && rows.size > 0, changed, count: rows.size, added, removed, updated, invalid,
    reserved: sorted.filter((s) => reserved.has(s)),
  };
}

/**
 * Update or add the row of one workflow in INDEX.md from its index, and keep the header and the
 * sort. With no INDEX.md yet, it rebuilds the whole file. A workflow with no readable index leaves
 * the file as it is. Returns `{ changed }`.
 */
export async function refreshIndexRow(root, slug) {
  const file = join(wfRoot(root), 'INDEX.md');
  if (!existsSync(file)) return { changed: (await reconcileIndex(root)).changed };
  const fm = frontmatterOf(join(wfRoot(root), slug), INDEX_NAME);
  if (!fm) return { changed: false };
  // The file is read under its lock, just before the new text is made: two sessions that
  // refresh other rows at once both keep their row.
  return withFileLock(file, () => {
    const before = readFileSync(file, 'utf8');
    const rows = parseIndex(before);
    rows.set(slug, rowOf(fm, slug));
    const sorted = [...rows.keys()].sort((a, b) => a.localeCompare(b));
    const text = `${[INDEX_HEADER, ...sorted.map((s) => rows.get(s))].join('\n')}\n`;
    if (text === before.replace(/\r\n/g, '\n')) return { changed: false };
    writeFileAtomic(file, text);
    return { changed: true };
  });
}

/** The commands that change the index of a workflow: their success refreshes its INDEX.md row. */
function indexChanged(cmd, pos) {
  if (cmd !== 'record' || !pos[1] || !pos[2]) return false;
  const [verb, , , ...rest] = pos;
  if (verb === 'stage-done') return true;
  if (verb === 'set') return recordName(rest[0] ?? '') === INDEX_NAME;
  // A put with no names puts every draft, so the index may be one of them.
  if (verb === 'put') return !rest.length || rest.some((p) => recordName(p.split(/[\\/]/).pop()) === INDEX_NAME);
  return false;
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
  if (agg.note) return agg.note;
  const head = 'key\tturns\tsubagents\tinput\toutput\tcache-read\tcache-write\texternal-in\texternal-out';
  const line = (k, a) => [k, a.turns, a.subagents, a.input, a.output, a.cacheRead, a.cacheWrite, a.externalInput, a.externalOutput].join('\t');
  return [head, ...Object.entries(agg.byKey).map(([k, a]) => line(k, a)), line('total', agg.total)].join('\n');
}

// ---------------------------------------------------------------- stamp


const yamlScalar = (v) => (typeof v === 'string' ? (v === '' || /[:#\-[\]{},&*!|>'"%@`]|^\s|\s$|^(true|false|null|\d)/.test(v) ? JSON.stringify(v) : v) : JSON.stringify(v));

export function stampOf(type, { slug = '<slug>', slice = null, now = nowIso() } = {}) {
  const schema = schemaOf();
  const def = defOfType(schema, type);
  if (!def) throw redo(`stamp: no artifact type ${type} in the schema`, 'Run stamp again with an artifact type of schemas/frontmatter.schema.json.');
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

// `--slice slug-wide` is no slice: the entry is scoped to the whole workflow, as in the file form.
const scopeOf = (opt) => ({ packet: opt.packet, slice: opt.slice && opt.slice !== 'slug-wide' ? opt.slice : undefined, files: opt.files });


// The running agent that waits: the newest agent-start of the journal for the stage and the
// slice. The waiting line takes its run and its seq, so a watch that emits from a seq sends it.
function waitingAgent(journal, stage, slice) {
  let lines = [];
  try { lines = parseJsonLines(readFileSync(journal, 'utf8')).lines; } catch { /* no journal: the line names the stage only */ }
  const start = lines.findLast((l) => {
    if (!l || l.event !== 'agent-start') return false;
    const at = stageOf(l);
    return (!stage || at.stage === stage) && (!slice || at.slice === slice);
  });
  const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return start
    ? pick({ run: start.run, seq: start.seq, agent: start.agent, phase: start.phase, stage: stageOf(start).stage, slice: stageOf(start).slice })
    : pick({ stage, slice });
}

export function runDecide(pos, opt) {
  const [verb, root, slug, arg] = pos;
  if (!verb || !root || !slug) throw usage('decide: <add|list|answered|hold|wait|drop|import> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw noFolder(`decide: no workflow folder ${dir}`, root);
  switch (verb) {
    case 'add': {
      if (opt.file) {
        // Every answer of a file in one call: [{ key, question, answer, by, kind, stage, slice, files }].
        const doc = JSON.parse(readFileSync(resolve(opt.file), 'utf8'));
        const list = Array.isArray(doc) ? doc : doc.answers ?? doc.decisions ?? [];
        if (!list.length) throw redo(`decide add: ${opt.file} holds no answers`, 'Write the answers into the file as a JSON array, or give one answer with --answer, then run decide add again.');
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
      if (!opt.key) throw usage('decide answered: --key is required');
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
    case 'wait': {
      const journal = journalPath(resolve(root), slug);
      const who = waitingAgent(journal, opt.stage, opt.slice && opt.slice !== 'slug-wide' ? opt.slice : null);
      // The journal line is news for the watch, never a gate: a failed append does not end the wait.
      const line = (event, fields) => {
        try { appendJournalLine(journal, null, { ...who, event, fields: JSON.stringify(fields) }); } catch { /* the wait goes on */ }
      };
      const seconds = Number(opt.seconds);
      const r = waitForAnswers(dir, {
        keys: String(opt.key ?? '').split(','), scope: scopeOf(opt),
        callMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : WAIT_CALL_MS,
        onStart: ({ until, questions }) => line('waiting', { keys: questions.map((q) => q.key), until: new Date(until).toISOString() }),
        onEnd: ({ state }) => line('wait-end', { state }),
      });
      out(opt.json ? r : [
        ...r.answered.map((a) => `answered: ${decisionLine(a.entry)}`),
        ...(r.state === 'waiting' ? [`still waiting for: ${r.open.join(', ')}. Run this command again now.`] : []),
      ].join('\n'));
      return 0;
    }
    case 'drop': {
      if (!arg) throw usage('decide drop: <questions.json> is required');
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
      throw usage(`decide: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- step


export function runStep(pos, opt) {
  const [verb, root, slug, slice, n] = pos;
  if (!verb || !root || !slug) throw usage('step: <start|done|stop|retry|complete|where> <root> <slug> are required');
  const projectRoot = resolve(root);
  const dir = join(wfRoot(projectRoot), slug);
  if (!existsSync(dir)) throw noFolder(`step: no workflow folder ${dir}`, root);
  // A step commit in a worktree of the project is resolved there; its branch decides, not the checkout.
  const checkout = stepCheckout(projectRoot);
  const branch = branchOf(checkout);
  const head = () => gitRevParse(checkout, 'HEAD');
  const sha = () => {
    if (!opt.sha) return null;
    const s = gitRevParse(checkout, opt.sha);
    if (!s) throw redo(`step: ${opt.sha} is not a commit of ${checkout}`, 'Run the command again with --sha set to a commit of the checkout, such as HEAD after the step commit.');
    return s;
  };
  if (verb === 'where') {
    const target = slice ?? lastSlice(dir);
    if (!target) { out(opt.json ? { slice: null } : 'no steps recorded'); return 0; }
    const w = whereOf(dir, target, stepGit(projectRoot, dir));
    out(opt.json ? w : whereLine(w));
    return 0;
  }
  if (!slice) throw usage(`step ${verb}: <slice> is required`);
  // The same step command with other arguments, for the fix line of a refusal.
  const again = (v, s, tail = '') => `wf.mjs step ${v} ${word(root)} ${word(slug)} ${word(s)}${tail}`;
  if (['start', 'done', 'complete'].includes(verb)) {
    const refused = sliceRefusal(dir, slug, slice);
    const one = refused && /its one slice is (\S+)$/.exec(refused)?.[1];
    if (refused) throw refuse(`step ${verb}: ${refused}`, one ? agentFix('Run the step command again with the one slice of the workflow.', again(verb, one, n != null ? ` ${n}` : '')) : agentFix('Run the step command again with a slice that the error names.'));
  }
  const step = n == null ? null : Number(n);
  const where = () => whereOf(dir, slice, stepGit(projectRoot, dir));
  const commitThenDone = `git commit -m "<what step ${step} does>" && ${again('done', slice, ` ${step} --sha HEAD`)}`;
  const done = () => {
    if (opt['no-change']) {
      if (opt.sha) throw refuse('step done: give --sha or --no-change, not both', agentFix('Run step done again with --no-change and no --sha.', again('done', slice, ` ${step} --no-change`)));
      return { slice, event: 'done', step, noChange: true, head: head(), branch };
    }
    if (!opt.sha) throw refuse('step done: --sha <commit> is required, or --no-change for a step that changed no file', agentFix('Run step done again with --sha HEAD after the step commit, or with --no-change when the step changed no file.', again('done', slice, ` ${step} --sha HEAD`)));
    const s = sha();
    // A step commit moves HEAD: the sha of the start, or of another done step, is not this step's commit.
    const run = readSteps(dir).filter((r) => r.slice === slice);
    let from = 0;
    run.forEach((r, i) => { if (r.event === 'complete') from = i + 1; });
    const current = run.slice(from);
    const start = [...current].reverse().find((r) => r.event === 'start' && r.step === step);
    if (start?.head && start.head === s) throw refuse(`step done: ${s.slice(0, 8)} is the HEAD at the start of step ${step}, so the step made no commit. Commit the step first, or run step done with --no-change when the step changed no file`, agentFix('Commit the step, then run step done with --sha HEAD.', commitThenDone));
    const owner = current.find((r) => r.event === 'done' && r.step !== step && r.sha === s);
    if (owner) throw refuse(`step done: ${s.slice(0, 8)} is the commit of step ${owner.step}. Commit step ${step} first; a failed commit hook leaves HEAD where it was`, agentFix('Commit the step, then run step done with --sha HEAD.', commitThenDone));
    return { slice, event: 'done', step, sha: s, ...commitIdentity(checkout, s), branch };
  };
  const complete = () => {
    const w = where();
    const skip = opt.skip ? String(opt.skip).split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : [];
    if (skip.length && !opt.reason) throw refuse('step complete: --skip needs --reason', agentFix('Run step complete again with --reason, the reason for the skip.', again('complete', slice, ` --skip ${skip.join(',')} --reason "<why>"`)));
    const open = w.steps.filter((s) => !w.done.some((d) => d.n === s.n) && !skip.includes(s.n)).map((s) => s.n);
    if (open.length) throw refuse(`step complete: steps ${open.join(', ')} of the plan are open. Do them, or name them with --skip`, agentFix('Do the open steps first, or name them with --skip and a --reason.', again('complete', slice, ` --skip ${[...skip, ...open].join(',')} --reason "<why>"`)));
    const plan = readPlan(planDocOf(dir, slice)?.body ?? '');
    return { slice, event: 'complete', sha: sha(), planHash: plan.hash, ...(skip.length ? { skipped: skip.map((x) => ({ n: x, reason: opt.reason })) } : {}), branch };
  };
  const rows = {
    start: () => ({ slice, event: 'start', step, title: opt.title ?? null, head: head(), branch }),
    done,
    stop: () => ({ slice, event: 'hard-stop', reason: opt.reason ?? null, kind: opt.kind ?? 'fail' }),
    retry: () => ({ slice, event: 'retry' }),
    complete,
  };
  if (!rows[verb]) throw usage(`step: unknown verb ${verb}`);
  const line = appendStep(dir, rows[verb]());
  // The progress record follows the step of the slice.
  if (verb === 'start') {
    const total = whereOf(dir, slice).total;
    const was = readProgress(dir);
    writeProgress(dir, { stage: 'implement', slice, step: { n: step, of: total || null, title: opt.title ?? null }, ...(was?.status && !(was.status === 'done' && !was.driver) ? {} : { status: 'running' }) });
  } else if (verb === 'complete') {
    // Outside a driver nothing else ends the run: a finished implement is done, not a dead run.
    writeProgress(dir, { slice, step: null, ...(readProgress(dir)?.driver ? {} : { status: 'done' }) });
  }
  out(opt.json ? line : `${line.event} ${slice}${line.step ? ` step ${line.step}` : ''}${line.sha ? ` ${line.sha.slice(0, 8)}` : ''}${line.noChange ? ' (no change)' : ''}${line.kind && line.kind !== 'fail' ? ` (${line.kind})` : ''}`);
  return 0;
}

// ---------------------------------------------------------------- profile

// The lines that name the log of a suite run, and the end of the log when the suite failed.
const suiteLogLines = (r) => [`log: ${r.log}`, ...(r.tail ? ['the end of the log:', r.tail] : [])];

export function runProfile(pos, opt) {
  const [verb, root, a, b] = pos;
  if (!verb || !root) throw usage('profile: <show|set|record|run|timebox|budget|hooks> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'show') {
    const p = readProfile(projectRoot);
    const lines = profileLines(p);
    out(opt.json ? p : lines.length ? lines.join('\n') : 'no test profile');
    return 0;
  }
  if (verb === 'set') {
    if (!a || !opt.command || opt.estimate == null) throw usage('profile set: <suite> --command c --estimate seconds are required');
    const s = setSuite(projectRoot, a, { command: opt.command, estimateSeconds: Number(opt.estimate) });
    out(opt.json ? s : `${a}: \`${s.command}\` (${s.estimateSeconds}s estimated)`);
    return 0;
  }
  if (verb === 'record') {
    if (!a || b == null) throw usage('profile record: <suite> <seconds> are required');
    const s = recordRun(projectRoot, a, Number(b));
    out(opt.json ? s : `${a}: ${s.measuredSeconds}s measured`);
    return 0;
  }
  if (verb === 'run') {
    // Run the command of a suite in the project root, and record its time: no timer by hand.
    if (!a) throw usage('profile run: <suite> is required');
    // One read: the run records only the suite time, so the budget stays the same.
    const profile = readProfile(projectRoot);
    const suite = profile[a];
    if (!suite?.command) throw noCommand(a, 'profile run: ');
    const t0 = Date.now();
    // The output of the suite goes to a log file, not to the terminal of the agent.
    const r = runSuiteLogged(projectRoot, a, suite.command);
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const pass = r.status === 0;
    const head = pass ? spawnSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || null : null;
    // A time that cannot be recorded is a warning: the suite ran, and its result stands.
    if (!r.error) {
      try { recordRun(projectRoot, a, seconds, { passedAt: head }); } catch (e) { process.stderr.write(`wf.mjs: the time of the ${a} suite was not recorded: ${e.message}\n`); }
    }
    const budget = readBudget(profile);
    if (overLongBudget(profile, seconds)) {
      process.stderr.write(`WARNING: the ${a} suite took ${seconds}s, over the long-run budget of ${budget.long}s. Before the next run, offer the faster paths of _long-runs.md: run the touched part, a pilot, a sample, a split, or the packet end.\n`);
    }
    out(opt.json
      ? { suite: a, command: suite.command, seconds, pass, exit: r.status, log: r.log, ...(r.tail ? { tail: r.tail } : {}), ...(head ? { passedAt: head } : {}) }
      : [`${a}: ${pass ? `pass at ${head ? head.slice(0, 8) : 'an unknown commit'}` : `fail (exit ${r.status ?? r.error?.code})`} in ${seconds}s, recorded`, ...suiteLogLines(r)].join('\n'));
    return pass ? 0 : 1;
  }
  if (verb === 'timebox') {
    if (!a) throw usage('profile timebox: <stage> is required');
    const suites = STAGE_SUITES[a] ?? [];
    const box = timeBox(readProfile(projectRoot), suites, { workSeconds: Number(opt.work ?? 0) || 0 });
    out(opt.json ? { stage: a, suites, ...box } : `${a}: ${Math.round(box.seconds / 60)} minutes${box.from.length ? ` (${box.from.join(', ')})` : ' (no suite time; the floor)'}`);
    return 0;
  }
  if (verb === 'budget') {
    // The check budget of the repo. With no option, show it; with an option, set it.
    const change = ['preset', 'slice', 'long', 'machines'].some((k) => opt[k] !== undefined);
    const b = change
      ? setBudget(projectRoot, { preset: opt.preset ?? null, slice: opt.slice, long: opt.long, machines: opt.machines })
      : readBudget(readProfile(projectRoot));
    const line = budgetLine({ budget: b });
    out(opt.json ? (b ?? { budget: null }) : line ?? 'no budget: ask the budget question of _check-budget.md once for the repo');
    return 0;
  }
  if (verb === 'hooks') {
    const hooks = hookSuites(projectRoot, readProfile(projectRoot));
    const line = (h) => `${h.hook}: \`${h.command}\` (${h.source}) — ${h.suite ? `in ${h.suite}` : 'in no suite'}`;
    out(opt.json ? hooks : hooks.length ? hooks.map(line).join('\n') : 'no push or commit hook');
    return 0;
  }
  throw usage(`profile: unknown verb ${verb}`);
}

// ---------------------------------------------------------------- findings

export function runFindings(pos, opt) {
  const [verb, root, slug, a, b] = pos;
  if (!verb || !root || !slug) throw usage('findings: <add|list|set|table|metrics> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw noFolder(`findings: no workflow folder ${dir}`, root);
  const ledger = readLedger(dir);
  const source = opt.source ?? null;
  // A review file shows one source and one scope: the packet (no slice) unless --slice names one.
  const scope = { source: source ?? 'review', slice: opt.slice ?? null };
  switch (verb) {
    case 'add': {
      if (!a) throw usage('findings add: <found.json> is required');
      const doc = JSON.parse(readFileSync(resolve(a), 'utf8'));
      const found = Array.isArray(doc) ? doc : doc.findings ?? [];
      const dimensions = opt.dimensions ? String(opt.dimensions).split(',').map((d) => d.trim()).filter(Boolean) : (doc.dimensions ?? []);
      const files = opt.files ? String(opt.files).split(',').map((f) => f.trim()).filter(Boolean) : (Array.isArray(doc.affectedFiles) ? doc.affectedFiles : null);
      // The merge reads the ledger again under its lock, so a parallel writer loses no entry.
      const r = updateLedger(dir, (now) => {
        const m = mergeRun(now, found, { ...scope, dimensions, files, run: opt.run ?? null });
        writeLedger(dir, m.ledger);
        return m;
      });
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
      if (!a || !b) throw usage('findings set: <id> <status> are required');
      // A dismissal by a decision names a live answer, steer or approval of the person.
      if (opt.decision) checkDismissDecision(dir, opt.decision);
      const e = updateLedger(dir, (now) => {
        const entry = setStatus(now, a, b, opt.reason ?? null, { commit: opt.commit ?? null, decision: opt.decision ?? null });
        writeLedger(dir, now);
        return entry;
      });
      out(opt.json ? e : `${e.id} ${e.status}`);
      return 0;
    }
    case 'table': {
      process.stdout.write(`Verdict: ${verdictOf(ledger, scope)}\n\n${findingsTable(ledger, scope)}\n`);
      return 0;
    }
    default:
      throw usage(`findings: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- record


/** `key=value` → [key, value], the value read as a YAML scalar or flow collection. */
export function fieldOf(arg) {
  const at = arg.indexOf('=');
  if (at < 1) throw usage(`record set: ${arg} is not key=value`);
  // Git Bash turns `key=/wf ...` into `key=C:/Program Files/Git/wf ...`; lib/msys.mjs undoes it.
  const { value: raw } = undoGitBashPath(arg.slice(at + 1));
  const warn = unrepairedWarning(arg.slice(0, at), raw);
  if (warn) process.stderr.write(warn);
  let value;
  try { value = raw === '' ? '' : parseYaml(raw); } catch { value = raw; }
  return [arg.slice(0, at), value];
}


const RECORD_VERBS = ['put', 'get', 'draft', 'set', 'edit', 'stage-done', 'list', 'where', 'migrate', 'evidence'];

// A plain `record get` of a record over this size prints its outline, not the whole record.
const BIG_RECORD = 20 * 1024;

function outlineText(name, o) {
  const size = (b) => (b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
  return [
    `${name}: ${size(o.bytes)}`,
    'fields:',
    ...o.fields.map((f) => `  ${f.name}  ${size(f.bytes)}${f.items === undefined ? '' : ` (${f.items} item(s))`}`),
    'sections:',
    ...(o.top ? [`  (before the first ##)  ${size(o.top)}`] : []),
    ...o.sections.map((s) => `  ## ${s.heading}  ${size(s.bytes)}`),
  ].join('\n');
}


function runRecord(pos, opt) {
  const [verb, root, slug, ...rest] = pos;
  if (!RECORD_VERBS.includes(verb) || !root || !slug) {
    throw usage(`record: <${RECORD_VERBS.join('|')}> <root> <slug> are required`);
  }
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw noFolder(`record: no workflow folder ${dir}`, root);
  switch (verb) {
    case 'put': {
      // The agents write the drafts in <wf-dir>/.draft/. A linked project of the old layout kept
      // them in the local .ai/workflows/<slug>/.draft/: put reads that folder second, for one release.
      const local = join(localWorkflowsRoot(resolve(root)), slug);
      const homes = local === dir ? [dir] : [dir, local];
      const named = (p) => basename(p);
      const drafts = rest.length
        // A named draft that was put already is in .draft/.put/ until the stage ends: put it again.
        ? rest.map((p) => (existsSync(resolve(p)) ? resolve(p) : homes.map((h) => draftPath(h, p)).find(existsSync) ?? homes.map((h) => keptPath(h, p)).find(existsSync) ?? draftPath(dir, p)))
        // A draft of the wf-dir wins over an old local draft of the same name.
        : homes.flatMap(draftsOf).filter((p, i, all) => all.findIndex((q) => named(q) === named(p)) === i);
      if (!drafts.length) throw redo(`record put: no draft in ${join(dir, DRAFT_DIR)}`, 'Write the draft with record draft first, then run record put again.', `wf.mjs record draft ${word(root)} ${word(slug)} <name>`);
      const results = drafts.map((p) => putChecked(dir, p));
      // A put that refused one draft exits 1, and the drafts that it did put still get the
      // follow-up of a change (the INDEX.md row, the records commit): main reads this mark.
      opt.landed = results.some((r) => !r.errors.length);
      const ev = pruneEvidence(dir);
      out(opt.json ? { results, pruned: ev.pruned } : results.map((r) => (r.errors.length
        ? `refused ${r.name}: ${r.errors.join('; ')}`
        : `put ${r.name} → ${r.file}${r.section ? `#${r.section}` : ''}`)).concat(ev.pruned.map((p) => `pruned evidence ${p}`)).join('\n'));
      return results.some((r) => r.errors.length) ? 1 : 0;
    }
    case 'get': {
      if (!rest.length) throw usage('record get: <name> is required');
      // Several names read in one call; --fields a,b prints only those frontmatter fields.
      // --section, --field and --outline read one part; a record over 20 KB prints its outline
      // unless --full (or --json) asks for all of it.
      const keys = opt.fields ? String(opt.fields).split(',').map((k) => k.trim()).filter(Boolean) : null;
      const docs = rest.map((name) => {
        const n = resolveRecord(dir, name, 'record get');
        return { name, n, doc: readDoc(dir, n) };
      });
      const missing = docs.filter((d) => !d.doc);
      for (const d of missing) process.stderr.write(`wf.mjs: ${noRecord(d.name, slug, dir)}\n`);
      if (missing.length) printFix(agentFix('Run record get again with a name of a record that the error lists.'));
      const found = docs.filter((d) => d.doc);
      const part = (d) => {
        if (opt.outline) return outlineOf(d.doc);
        if (opt.section !== undefined) return sectionText(d.doc.body, String(opt.section));
        if (opt.field !== undefined) return getPath(d.doc.frontmatter ?? {}, String(opt.field));
        return keys ? pick(d.doc.frontmatter ?? {}, keys) : d.doc;
      };
      const many = rest.length > 1;
      if (opt.json) process.stdout.write(`${JSON.stringify(many ? Object.fromEntries(found.map((d) => [d.n, part(d)])) : found[0] ? part(found[0]) : null, null, 2)}\n`);
      else {
        for (const d of found) {
          if (many) process.stdout.write(`==> ${d.n} <==\n`);
          const v = part(d);
          if (opt.outline) process.stdout.write(`${outlineText(d.n, v)}\n`);
          else if (opt.section !== undefined) process.stdout.write(v);
          else if (opt.field !== undefined) process.stdout.write(v !== null && typeof v === 'object' ? stringifyYaml(v).replace(/\n?$/, '\n') : `${v}\n`);
          else if (keys) process.stdout.write(stringifyYaml(v).replace(/\n?$/, '\n'));
          else {
            const text = docText(d.doc);
            if (opt.full || Buffer.byteLength(text, 'utf8') <= BIG_RECORD) process.stdout.write(text);
            else {
              process.stdout.write(`${outlineText(d.n, outlineOf(d.doc))}\n`);
              process.stdout.write(`${d.n} is over 20 KB, so this is its outline. Read one part with --section <heading> or --field <path>, or all of it with --full.\n`);
            }
          }
          if (many) process.stdout.write('\n');
        }
      }
      return missing.length ? 1 : 0;
    }
    case 'stage-done': {
      const [stage, slice] = rest;
      if (!stage) throw usage(`record stage-done: <stage> is required; the stages are: ${Object.keys(STAGE_FILES).join(', ')}`);
      const changes = stageDone(dir, slug, stage, slice ?? null, { next: opt.next ?? null, status: opt.status ?? null });
      // The drafts that were put in this stage are kept until here, for a second edit.
      for (const h of new Set([join(localWorkflowsRoot(resolve(root)), slug), dir])) clearKept(h, { slice: slice ?? null });
      // An implement stage of a project with no suite for implement gets the receipt that says so.
      const none = stage === 'implement' && slice ? noSuiteReceipt(resolve(root), dir, slice, { now: nowIso() }) : null;
      const receipt = none?.result === 'none' ? `; receipt: none (${NO_SUITE})` : '';
      out(opt.json ? { ...changes, ...(receipt ? { receipt: `none (${NO_SUITE})` } : {}) } : `${stage}${slice ? ` ${slice}` : ''} done: progress.${stage}=${changes[`progress.${stage}`]}; next ${changes['next-invocation']}${receipt}`);
      return 0;
    }
    case 'draft': {
      // The record as a draft, ready for an edit and a put: the change of a body in three steps.
      const [name] = rest;
      if (!name) throw usage('record draft: <name> is required');
      const n = resolveRecord(dir, name, 'record draft');
      const doc = readDoc(dir, n);
      if (!doc) { process.stderr.write(`wf.mjs: ${noRecord(name, slug, dir)}\n`); return 1; }
      const path = draftPath(dir, n);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringifyYaml(doc.frontmatter ?? {})}\n---\n${doc.body ?? ''}`);
      out(opt.json ? { name: n, draft: path } : `draft ${n} → ${path}; edit it, then run record put`);
      return 0;
    }
    case 'set': {
      const [name, ...fields] = rest;
      if (!name || !fields.length) throw usage(`record set: <name> <key=value>... are required. The forms are: ${PATH_FORMS}`);
      const n = resolveRecord(dir, name, 'record set');
      const r = setRecordPaths(dir, n, fields, { slug });
      out(opt.json ? r.frontmatter : `set ${r.keys.join(', ')} in ${n}`);
      return 0;
    }
    case 'edit': {
      // One section or one exact text of a body, changed in place with the checks of put.
      const [name] = rest;
      const bySection = opt.section !== undefined && opt.from !== undefined;
      const byReplace = opt.replace !== undefined && opt.with !== undefined;
      if (!name || bySection === byReplace) {
        throw usage('record edit: <name> and one of --section <heading> --from <file> or --replace <old> --with <new> are required');
      }
      const n = resolveRecord(dir, name, 'record edit');
      const change = bySection
        ? { section: String(opt.section), text: readFileSync(resolve(String(opt.from)), 'utf8') }
        : { replace: String(opt.replace), with: String(opt.with) };
      const r = editRecord(dir, n, change, { slug });
      out(opt.json ? r : r.errors.length ? `refused ${r.name}: ${r.errors.join('; ')}` : `edit ${r.name} → ${r.file}${r.section ? `#${r.section}` : ''}`);
      return r.errors.length ? 1 : 0;
    }
    case 'list': {
      const names = listDocs(dir);
      out(opt.json ? names : names.join('\n'));
      return 0;
    }
    case 'where': {
      const [name] = rest;
      if (!name) throw usage('record where: <old path> is required');
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
  if (!['check', 'grant', 'revoke'].includes(verb) || !root || !slug) throw usage('consent: <check|grant|revoke> <root> <slug> are required');
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
  if (verb !== 'check' || !root) throw usage('base: check <root> is required');
  const projectRoot = resolve(root);
  const base = opt.base ?? (defaultRun('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: projectRoot }).stdout.replace(/^origin\//, '') || 'main');
  const r = baseCheck(projectRoot, base, { remote: opt.remote ?? 'origin' });
  out(opt.json ? r : `${base}: ${r.state}${r.fastForwarded ? ` (fast-forwarded ${r.behind})` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
  if (r.stop && !opt.json) printFix(r.fix ?? personFix(`Check the base branch ${base} with git status and git log, and bring it in line with its remote by hand, then run the command again.`));
  return r.stop ? 1 : 0;
}

function runWorktree(pos, opt) {
  const [verb, root, slug, name, commit] = pos;
  if (verb === 'add') {
    if (!root || !slug || !name || !commit) throw usage('worktree: add <root> <slug> <name> <commit> are required');
    const r = addScratchWorktree(resolve(root), slug, name, commit);
    out(opt.json ? r : r.ok ? r.path : r.error);
    if (!r.ok && !opt.json) printFix(r.fix);
    return r.ok ? 0 : 1;
  }
  if (verb === 'remove') {
    if (!root || !slug) throw usage('worktree: remove <root> <slug> are required');
    const r = removeScratchWorktrees(resolve(root), slug, name ?? null);
    const kept = [...r.refused, ...r.failed];
    if (opt.json) out(r);
    else {
      const lines = [...r.removed.map((p) => `removed ${p}`), ...kept.map((k) => `kept ${k.path}: ${k.reason}`)];
      out(lines.join('\n') || 'no scratch worktree');
      if (kept.length) printFix(personFix('Each kept worktree may hold work: check it with git status before it is removed by hand.'));
    }
    return kept.length ? 1 : 0;
  }
  throw usage('worktree: <add|remove> is required');
}

const TASK_PREFIX = 'ship-ready:';

function runShip(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['facts', 'ready', 'merge', 'finish'].includes(verb) || !root) throw usage('ship: <facts|ready|merge|finish> <root> are required');
  const projectRoot = resolve(root);
  const index = slug ? frontmatterOf(join(wfRoot(projectRoot), slug), INDEX_NAME) : null;
  if (slug && !index) throw noFolder(`ship: no workflow ${slug}`, root);
  const base = opt.base ?? index?.['base-branch'] ?? null;
  if (verb === 'facts') {
    const f = shipFacts(projectRoot, base);
    out(opt.json ? f : f.ok ? `${f.repo} ${f.base}: merge by ${f.method ?? 'nothing allowed'} (allowed ${f.allowed.join(', ') || 'none'}); reviews ${f.requiredReviews}; merge queue ${f.mergeQueue}; ${f.direct ? 'ship merges' : 'ship prints the command'}` : f.reason);
    if (!f.ok && !opt.json) printFix(f.fix ?? personFix('Check that gh is installed and signed in (gh auth status) and that the repo has a GitHub remote, then run the command again.'));
    return f.ok ? 0 : 1;
  }
  if (verb === 'ready') {
    const gaps = readyGaps(projectRoot, { base, allowNoPlan: Boolean(opt['allow-no-plan']) });
    if (slug) {
      // Each gap is a person task; a gap that closed leaves the list.
      const kept = (Array.isArray(index['person-tasks']) ? index['person-tasks'] : []).filter((t) => !String(t?.id ?? '').startsWith(TASK_PREFIX));
      const tasks = gaps.map((g) => ({ id: `${TASK_PREFIX}${g.code}`, task: g.task, needed: 'ship', at: nowIso() }));
      setFields(join(wfRoot(projectRoot), slug), INDEX_NAME, { 'person-tasks': [...kept, ...tasks] });
    }
    out(opt.json ? { ready: !gaps.length, gaps } : gaps.length ? gaps.map((g) => `gap: ${g.task}`).join('\n') : 'ready: no gap that a script sees');
    return gaps.length ? 1 : 0;
  }
  if (!slug) throw usage(`ship ${verb}: <slug> is required`);
  const pr = opt.pr ?? index['pr-number'] ?? null;
  if (verb === 'merge') {
    if (!pr) throw redo('ship merge: the workflow has no pr-number; pass --pr N', 'Run ship merge again with --pr and the number of the pull request of the workflow.');
    const f = shipFacts(projectRoot, base);
    if (!f.ok) throw refuse(f.reason, f.fix ?? personFix('Check that gh is installed and signed in (gh auth status) and that the repo has a GitHub remote, then run the command again.'));
    const method = opt.method ? String(opt.method) : null;
    if (method && !f.allowed.includes(method)) throw redo(`ship merge: ${f.base} does not allow --method ${method}; allowed: ${f.allowed.join(', ') || 'none'}`, 'Run ship merge again with --method set to an allowed method, or with no --method.');
    const cmd = mergeCommand(f, pr, { method });
    if (!cmd) throw ask(`ship merge: the repo allows no merge method for ${f.base}`, 'The repo allows no merge method for this base: allow one in the settings of the repo on GitHub, or merge the pull request by hand.');
    if (opt.print || !f.direct) {
      out(opt.json ? { merged: false, command: cmd, facts: f } : `run: ${cmd}${f.direct ? '' : ` (${f.mergeQueue ? 'the merge queue merges it' : `${f.requiredReviews} review(s) are required`})`}`);
      return 3;
    }
    const r = defaultRun('gh', cmd.split(' ').slice(1), { cwd: projectRoot });
    out(opt.json ? { merged: r.status === 0, command: cmd, stderr: r.stderr } : r.status === 0 ? `merged PR ${pr} by ${method ?? f.method}` : `the merge failed: ${r.stderr}\nrun: ${cmd}`);
    if (r.status !== 0 && !opt.json) printFix(personFix('The merge of the pull request failed: read the reason above (checks, reviews or a conflict), then merge it by hand or ask for what it waits on.'));
    return r.status === 0 ? 0 : 1;
  }
  const r = finishShip(projectRoot, { branch: index.branch, base: base ?? 'main', pr, keepBranch: Boolean(opt['keep-branch']) });
  if (r.ok) {
    // A batch ship marks every slug of the roster of the handoff that is on the same branch.
    const roster = frontmatterOf(join(wfRoot(projectRoot), slug), '08-handoff.md')?.['branch-slugs'];
    const followers = (Array.isArray(roster) ? roster : []).map(String)
      .filter((s) => s !== slug && frontmatterOf(join(wfRoot(projectRoot), s), INDEX_NAME)?.branch === index.branch);
    for (const s of [slug, ...followers]) {
      setFields(join(wfRoot(projectRoot), s), INDEX_NAME, {
        status: 'shipped', 'close-reason': 'shipped', 'closed-at': nowIso(), 'progress.ship': 'complete',
        'current-stage': 'ship', 'next-invocation': `/wf retro ${s}`,
      });
    }
    r.shipped = [slug, ...followers];
  }
  out(opt.json ? r : r.ok ? `on ${r.base}; ${r.steps.map(([k, v]) => `${k} ${v ? 'ok' : 'skipped'}`).join(', ')}${r.kept ? `; kept ${r.branch}` : ''}; ${slug} is shipped` : `not finished: ${r.reason}`);
  if (!r.ok && !opt.json) printFix(r.fix ?? personFix('Read the reason above, and settle the branch and its pull request by hand, then run ship finish again.'));
  return r.ok ? 0 : 1;
}

// ---------------------------------------------------------------- main

// The workflow that a call acts on, or null. A read-only key acts on none; with `reads`, the
// workflow that a read-only key names counts too.
function slugAtDispatch(projectRoot, r, tokens, { reads = false } = {}) {
  if (!r.key || (r.key === 'status' && !reads) || r.reason) return null;
  const args = (r.tokens ?? tokens).slice(r.argsFrom);
  return r.nextOf ?? args.slice(0, 2).find((t) => existsSync(join(wfRoot(projectRoot), t, INDEX_NAME)) || existsSync(join(wfRoot(projectRoot), t, 'state.yaml'))) ?? null;
}

async function runRecords(pos, opt) {
  const [verb, root, arg] = pos;
  if (verb === 'migrate') {
    const r = migrateLive(recordsHome(), { dryRun: Boolean(opt['dry-run']) });
    if (opt.json) { out(r); return r.failed.length ? 1 : 0; }
    const row = (m) => `${m.ref}: ${m.action === 'commit' ? `the folder of ${m.tip.slice(0, 8)} goes on the main branch` : m.action === 'same' ? 'the main branch holds the same folder' : 'no folder on the branch'}${m.tip !== m.sha ? ' (the remote tip is newer)' : ''}${m.diverged ? ' (the remote tip diverged; it is kept in refs/archive/live-remote/)' : ''}`;
    out([
      ...(r.reason ? [r.reason] : []),
      ...(r.dryRun ? ['dry run: nothing changed'] : []),
      ...r.moved.map(row),
      ...r.moved.flatMap((m) => (m.kept ?? []).map((f) => `kept: ${f} has a change of this machine; the newer remote copy is in the commit`)),
      ...r.failed.map((m) => `failed: ${m.ref}: ${m.reason}`),
      ...(!r.dryRun && r.moved.length ? [`moved ${r.moved.length} live branch(es) to refs/archive/live/; records-state.json lists each one in migratedLive`] : []),
      ...(!r.moved.length && !r.failed.length ? ['no live branch'] : []),
    ].join('\n'));
    return r.failed.length ? 1 : 0;
  }
  if (!root) throw usage('records: <link|status|sync|push|close|retry|dismiss|migrate> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'link') {
    if (!arg) throw usage('records link: <project> is required');
    const r = linkProject(projectRoot, arg);
    if (!r.ok && r.fix?.command) r.fix = { ...r.fix, command: r.fix.command.replace('<root>', word(root)) };
    // The last step of the link: each workflow of the project gets its issue when the GitHub layer is on.
    if (r.ok && layerOf(projectRoot)) r.queued = backfillProject(projectRoot);
    if (opt.json) { out(r); return r.ok && !r.conflicts.length ? 0 : 1; }
    if (!r.ok) { out(r.reason); printFix(r.fix); return 1; }
    out([
      `linked as ${r.project} in ${r.home}${r.moved.length ? `; moved ${r.moved.join(', ')}` : ''}`,
      ...r.separate.map((p) => `separate: ${p} has its own .ai/sdlc-config.json with no link, so its records stay in it`),
      ...r.conflicts.map((f) => `records-conflict: ${f}: the clone copy stays; the local copy is in .ai/workflows/.conflicts/${f}. Compare them, then delete the kept copy.`),
      ...(r.tracked.length ? [`tracked: ${r.tracked.slice(0, 10).join(', ')}${r.tracked.length > 10 ? ` and ${r.tracked.length - 10} more` : ''}`] : []),
      ...productRepoGapLines(r),
      ...(r.queued?.length ? [`github: queued ${r.queued.length} workflow(s) for their issues; the flush runs in the background`] : []),
    ].join('\n'));
    return r.conflicts.length ? 1 : 0;
  }
  if (verb === 'status' && opt.problems) {
    const p = recordsProblems(projectRoot);
    if (opt.json) { out(p); return 0; }
    out(!p.linked ? 'records: local in .ai/workflows/' : p.lines.length ? [...p.lines, ...(p.more ? [`and ${p.more} more line(s): wf.mjs records status "${projectRoot}"`] : [])].join('\n') : 'records: no problem');
    return 0;
  }
  if (verb === 'retry') {
    // The answer yes to a records question of the dispatch: the commit of the workflow again,
    // then the push and the flush in the background. The next /wf call shows their result.
    const linked = linkedProject(projectRoot);
    const done = [];
    if (linked && arg) {
      const c = commitWorkflow(projectRoot, arg, `${linked}/${arg}: the records commit again`);
      if (!c?.commit) { out(`the records commit of ${arg} failed again; wf.mjs records status "${projectRoot}" --problems`); return 1; }
      done.push(`committed ${arg}; the push runs in the background`);
    } else if (linked) {
      inBackground(['records', 'push', projectRoot]);
      done.push('the push runs in the background');
    }
    if (layerOf(projectRoot) && readOutbox().length) { flushInBackground(); done.push('the flush of the GitHub layer runs in the background'); }
    out(done.length ? `${done.join('; ')}; the next /wf call shows the result` : 'nothing to retry');
    return 0;
  }
  if (verb === 'dismiss') {
    // The answer no: the dispatch asks again only about a newer failure.
    const at = dismissRecords();
    out(`records: the dispatch asks again only about a failure after ${at}`);
    return 0;
  }
  if (verb === 'status') {
    const s = recordsStatus(projectRoot);
    const lines = s.linked
      ? [`records: ${s.project} in ${s.home} (${s.remote ? 'with a remote' : 'no remote'}), machine ${s.machine}`,
        ...(s.ahead || s.behind ? [`branch: ${s.main}: ${s.ahead} ahead, ${s.behind} behind the remote`] : []),
        ...(s.pushConflict ? s.pushConflict.files.length ? s.pushConflict.files.map((f) => `conflict: ${f}: the push of ${s.pushConflict.at} stopped at this file`) : [`conflict: the push of ${s.pushConflict.at} stopped: ${s.pushConflict.reason}`] : []),
        ...s.live.map((l) => `live: ${l} is not moved yet; run wf.mjs records migrate`),
        ...s.workflows.flatMap((h) => [
          ...(h.uncommitted.length ? [`uncommitted: ${h.workflow}: ${h.uncommitted.join(', ')}`] : []),
          ...(h.ahead || h.behind ? [`branch: ${h.workflow}: ${h.ahead} ahead, ${h.behind} behind the remote`] : []),
          ...h.adoptConflicts.map((f) => `kept aside: ${h.workflow}: .ai/workflows/.conflicts/${h.workflow.split('/')[1]}/${f} (the clone copy won; compare, then delete the kept copy)`),
          ...(h.lastFailure ? [`failed: ${h.workflow}: ${h.lastFailure.step} at ${h.lastFailure.at}: ${h.lastFailure.error}`] : []),
        ]),
        ...s.migrated.slice(-10).map((m) => `moved: ${m.ref} was ${m.sha}; git -C "${s.home}" update-ref ${m.ref} ${m.sha} brings it back`)]
      : [`records: local in .ai/workflows/${s.clone ? `; a clone is at ${s.home}: wf.mjs records link <root> <project>` : ''}`];
    // The product repo of a linked project must not track or leave open the record folder.
    if (s.linked) lines.push(...productRepoGapLines(productRepoGaps(projectRoot)));
    if (layerOf(projectRoot)) {
      const g = layerStatus(projectRoot);
      s.github = { queued: g.queued, parked: g.parked.length };
      lines.push(`github: ${g.queued} queued, ${g.parked.length} parked (failed ${MAX_FAILS} flushes)${g.parked.length ? `; wf.mjs gh status "${projectRoot}"` : ''}`);
    }
    out(opt.json ? s : lines.join('\n'));
    return 0;
  }
  if (verb === 'sync') {
    const r = syncRecords(projectRoot);
    if (r?.pulled.length) await reconcileIndex(projectRoot);
    out(opt.json ? r : !r ? 'records: local; nothing to sync' : r.offline ? 'records: offline' : `pulled ${r.pulled.join(', ') || 'nothing'}; ${r.pushed ? 'pushed' : 'not pushed'}${r.conflicts.length ? `; conflicts: ${r.conflicts.join('; ')}` : ''}`);
    return r?.conflicts?.length ? 1 : 0;
  }
  if (verb === 'push') {
    // This step runs in the background with no output: pushRecords writes a failure into the records log.
    const r = pushRecords(recordsHome());
    if (arg && linkedProject(projectRoot)) renewIfMine(projectRoot, arg);
    out(opt.json ? r : r.pushed ? 'pushed' : `not pushed: ${r.reason ?? (r.offline ? 'offline' : 'unknown')}`);
    return r.pushed ? 0 : 1;
  }
  if (!arg) throw usage(`records ${verb}: <slug> is required`);
  if (verb === 'close') {
    const r = closeRecords(projectRoot, arg);
    if (r?.ok) releaseLease(projectRoot, arg);
    out(opt.json ? r : !r ? 'records: local' : r.ok ? `closed ${arg}${r.pushed ? '' : `; not pushed: ${r.reason ?? 'offline'}`}` : r.reason);
    if (r && !r.ok && !opt.json) printFix(r.fix);
    return !r || r.ok ? 0 : 1;
  }
  throw usage(`records: unknown verb ${verb}`);
}

async function runLease(pos, opt) {
  const [verb, root, slug] = pos;
  if (!['claim', 'release', 'show', 'decline'].includes(verb) || !root || !slug) throw usage('lease: <claim|release|show|decline> <root> <slug> are required');
  const projectRoot = resolve(root);
  // The answer no to a lease question of the dispatch: the key does not run on this computer.
  if (verb === 'decline') { out(`${slug}: not run on this computer; another computer may write it`); return 1; }
  const r = verb === 'claim' ? claimAndPull(projectRoot, slug, { take: Boolean(opt.take), host: opt.host ?? null })
    : verb === 'release' ? releaseLease(projectRoot, slug) : showLease(projectRoot, slug);
  if (verb === 'claim' && r.pull?.ok && r.pull.to !== r.pull.from) await reconcileIndex(projectRoot);
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
  if (!['brief', 'put', 'check'].includes(verb) || !root || !slug) throw usage('page: <brief|put|check> <root> <slug> are required');
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
  if (!root || !script) throw usage('run: <root> <script.mjs> are required');
  const projectRoot = realpathSync(resolve(root));
  const file = [resolve(projectRoot, script), resolve(script)].find(existsSync);
  if (!file) throw redo(`run: no script ${script}`, 'Write the script in <wf-dir>/.draft/ or in .scratch/, then run the command again with its path.');
  const real = realpathSync(file);
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  // The workflows of a linked project are in the records clone, so a script in a wf-dir runs too.
  const homes = [projectRoot, existsSync(wfRoot(projectRoot)) ? realpathSync(wfRoot(projectRoot)) : null].filter(Boolean);
  if (!homes.some((h) => fold(real).startsWith(fold(`${h}${sep}`)))) {
    throw redo(`run: ${real} is outside the project ${projectRoot}. Write the script in <wf-dir>/.draft/ or in .scratch/`, 'Move the script into <wf-dir>/.draft/ or .scratch/ of the project, then run the command again.');
  }
  const mod = await import(`${pathToFileURL(real).href}?run=${Date.now()}`);
  if (typeof mod.default !== 'function') throw redo(`run: ${script} has no default export function; write export default async function ({ wf, open, args }) { ... }`, 'Give the script a default export, export default async function ({ wf, open, args }) { ... }, then run it again.');
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
  if (!['post', 'list', 'read'].includes(verb) || !root || !slug) throw usage('msg: <post|list|read> <root> <slug> are required');
  const projectRoot = resolve(root);
  const to = opt.to ?? null;
  if (verb === 'post') {
    const r = postMessage(projectRoot, slug, { kind: opt.kind, text: opt.text, to });
    if (!to) noteMessage(projectRoot, slug, { kind: opt.kind, from: machineName(), text: opt.text });
    out(opt.json ? r : `posted ${r.id}`);
    return 0;
  }
  if (verb === 'list') {
    // One of the three points of a pull: the messages of other computers come with it.
    if (!to && linkedProject(projectRoot)) pullRecords(recordsHome());
    if (!to) importIssueComments(projectRoot, slug);
    const all = listMessages(projectRoot, slug, { to });
    const rows = opt.unread ? all.filter((m) => !m.read) : all;
    out(opt.json ? rows : rows.length ? rows.map((m) => `${m.read ? ' ' : '*'} ${m.id} (${m.kind} from ${m.from})`).join('\n') : 'no messages');
    return 0;
  }
  if (!id) throw usage('msg read: <id> is required');
  const r = readMessage(projectRoot, slug, id, { to });
  out(opt.json ? r : r.text);
  return 0;
}

/** Start `gh flush` in the background; `[root, slug]` also imports the comments of that workflow's issue. */
/** Refresh the cached PR answers of the close check, detached: the dispatch reads only the cache. */
function closeCheckInBackground(root) {
  if (process.env.SDLC_CLOSE_CHECK === 'off') return;
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'close-check', root], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* the next call checks again */ }
}

function flushInBackground(target = []) {
  inBackground(['gh', 'flush', ...target, '--background']);
}

/** Queue one progress edit for each workflow of the project and start the flush: `gh backfill`, also the last step of a link. */
function backfillProject(projectRoot) {
  const slugs = existsSync(wfRoot(projectRoot)) ? readdirSync(wfRoot(projectRoot), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && frontmatterOf(join(wfRoot(projectRoot), e.name), INDEX_NAME)).map((e) => e.name) : [];
  const queued = backfill(projectRoot, slugs) ?? [];
  if (queued.length) flushInBackground();
  return queued;
}

// The commands that change the state of a workflow: [root, slug] of each, for the GitHub layer.
const CHANGES = {
  record: ['put', 'set', 'edit', 'stage-done', 'migrate'], slice: ['drop', 'move'], board: ['add', 'move', 'regroup', 'remove', 'apply', 'set', 'prose', 'render', 'adopt'], page: ['put'], progress: ['set'], decide: ['add', 'hold'], findings: ['add', 'set'], ship: ['ready', 'finish'], step: ['start', 'done', 'complete', 'stop'], design: ['approve', 'migrate'],
};
function changed(cmd, pos, opt = {}) {
  if (cmd === 'close' || (cmd === 'modernize' && !opt.check)) return pos[0] && pos[1] ? [pos[0], pos[1]] : null;
  // A plan of a migration (--check) changes nothing.
  if (cmd === 'design' && opt.check) return null;
  return CHANGES[cmd]?.includes(pos[0]) && pos[1] && pos[2] ? [pos[1], pos[2]] : null;
}

function runGh(pos, opt) {
  const [verb, root] = pos;
  if (verb === 'backfill') {
    if (!root) throw usage('gh backfill: <root> is required');
    const projectRoot = resolve(root);
    if (!layerOf(projectRoot)) throw ask('gh backfill: the layer is off (records.repo in ~/.sdlc/config.json and records.project in .ai/sdlc-config.json)', 'The GitHub layer is off. To turn it on, set records.repo in ~/.sdlc/config.json and records.project in .ai/sdlc-config.json.');
    const queued = backfillProject(projectRoot);
    out(opt.json ? { queued } : queued.length ? `queued ${queued.length} workflow(s): ${queued.join(', ')}` : 'no workflow');
    return 0;
  }
  if (verb === 'flush') {
    const r = flushOutbox();
    // The result goes to the records log, so the dispatch sees a flush that failed.
    if (r.busy || r.sent || r.left || r.error || r.parked) logRecordsEvent({ step: 'flush', background: Boolean(opt.background), sent: r.sent, left: r.left, error: r.error, ...(r.busy ? { busy: true } : {}), ...(r.parked ? { parked: r.parked } : {}) });
    // The person's comments on the issue of the workflow that a call names reach its inbox here, off the dispatch.
    const [, , slug] = pos;
    const imported = root && slug && layerOf(resolve(root)) ? importIssueComments(resolve(root), slug) : [];
    out(opt.json ? { ...r, imported: imported.length } : `${r.busy ? 'another flush runs' : `sent ${r.sent}, left ${r.left}${r.parked ? `, parked ${r.parked}` : ''}${r.error ? `; stopped: ${r.error}` : ''}`}${imported.length ? `; ${imported.length} new comment(s) in the inbox of ${slug}` : ''}`);
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
  throw usage('gh: <flush|status|backfill> is required');
}

// Commands that run but have no help block: none today. A command must have a help block, so
// `describe` and the unknown-command rule see it.
const HIDDEN_COMMANDS = new Set(['close-check']);

/**
 * The first words (the forms) of a command whose blocks start with a form, such as `record put`
 * or `lease <claim|release|show>`, or null for a command whose first argument is the root.
 * The forms of `design` are the list DESIGN_FORMS of lib/design-cli.mjs: a test holds the two together.
 */
export function formsOf(cmd) {
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
  // A bare form (`wf.mjs record`, `wf.mjs decide add`) asks for the forms: the help, exit 0.
  const bare = bareHelp(cmd, rest);
  if (bare !== null) { out(bare); return 0; }
  const verbs = formsOf(cmd);
  if (verbs && rest.length && !rest[0].startsWith('-') && !verbs.has(rest[0])) {
    process.stderr.write(`wf.mjs: ${cmd} has no form ${rest[0]}. Its forms:\n${known}\n`);
    if (cmd === 'design') {
      process.stderr.write(`${fixLines(agentFix(ARGS_FIX)).join('\n')}\n`);
      // With --json the failure is also one object on stdout, as every other design failure.
      if (rest.includes('--json')) process.stdout.write(`${JSON.stringify({ ok: false, error: `design has no form ${rest[0]}`, fix: agentFix('Run the command again in one of the forms of wf.mjs design.', 'wf.mjs help design') }, null, 2)}\n`);
    }
    return 2;
  }
  const { pos, opt } = flags(rest);
  const code = await runMain(cmd, pos, opt);
  const putSome = cmd === 'record' && pos[0] === 'put' && code === 1 && opt.landed === true;
  // Scripts keep INDEX.md: a change of the index of a workflow refreshes its row.
  if ((code === 0 || putSome) && indexChanged(cmd, pos)) {
    try { await refreshIndexRow(resolve(pos[1]), pos[2]); } catch (e) { process.stderr.write(`wf.mjs: INDEX.md not refreshed: ${e.message}\n`); }
  }
  // `ship ready` with a slug writes its gaps as person tasks and exits 1 when there is one.
  const wrote = code === 0 || putSome || (cmd === 'ship' && pos[0] === 'ready' && code === 1);
  const target = wrote ? changed(cmd, pos, opt) : null;
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
      case 'close-check': {
        const root = resolve(pos[0] ?? '.');
        closeCandidates(root, await scanWorkflowIndexes({ projectRoot: root }));
        return 0;
      }
      case 'run': return await runRun(pos, opt);
      case 'describe': {
        const d = describeAll();
        out(opt.json ? d : describeText(d));
        return 0;
      }
      case 'gh': return runGh(pos, opt);
      case 'records': return await runRecords(pos, opt);
      case 'lease': return await runLease(pos, opt);
      case 'msg': return runMsg(pos, opt);
      case 'page': return runPage(pos, opt);
      case 'design': return await runDesign(pos, opt, out);
      case 'modernize': {
        const [root, slug] = pos;
        if (!root || !slug) throw usage('modernize: <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw noFolder(`modernize: no workflow folder ${dir}`, root);
        const r = modernizeWorkflow(dir, { check: Boolean(opt.check) });
        if (!r.ok) r.fix = agentFix('The workflow folder has no index: list the workflows with status, then run modernize again with a slug that it names.', `wf.mjs status ${word(root)}`);
        if (opt.json) { out(r); return r.ok ? 0 : 1; }
        if (!r.ok) { out(r.reason); printFix(r.fix); return 1; }
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
        if (!root) throw usage('doctor: <root> is required');
        const projectRoot = resolve(root);
        const loose = hookSuites(projectRoot, readProfile(projectRoot)).filter((h) => h.hook === 'pre-push' && !h.suite);
        const warnings = loose.map((h) => `the pre-push command \`${h.command}\` of ${h.source} is in no suite of the test profile; add it to the heavy suite with profile set`);
        out(opt.json ? { ok: !warnings.length, warnings } : warnings.length ? warnings.map((w) => `warn: ${w}`).join('\n') : 'ok: every pre-push command is in a suite');
        return 0;
      }
      case 'setup': {
        const [root] = pos;
        if (!root) throw usage('setup: <root> is required');
        const r = setupProject(resolve(root), { about: opt.about ?? null, ignore: Boolean(opt.ignore) });
        if (opt.json) { out(r); return 0; }
        const lines = [`${r.created ? 'created' : 'kept'} .ai/ and ${r.config}`];
        lines.push(`about: ${r.project.about ?? '(no line yet)'}`);
        const suites = Object.keys(r.profile).filter((k) => r.profile[k]?.command);
        lines.push(`test profile: ${suites.length ? suites.join(', ') : 'none'}`);
        lines.push(budgetLine(r.profile) ?? 'budget: not chosen; ask the budget question of _check-budget.md');
        lines.push(`merge: ${r.facts.method ? `${r.facts.repo} ${r.facts.base} merges by ${r.facts.method}` : r.facts.reason ?? 'the repo allows no merge method'}`);
        lines.push(`.ai/ in git: ${r.ignored === true ? `ignored${r.ignoreAdded ? ' (added to .gitignore)' : ''}` : r.ignored === false ? 'tracked' : 'not a git repo'}`);
        for (const g of r.gaps) lines.push(`gap: ${g.task}`);
        out(lines.join('\n'));
        return 0;
      }
      case 'close': {
        const [root, slug] = pos;
        if (!root || !slug) throw usage('close: <root> <slug> are required');
        const r = closeWorkflow(resolve(root), slug, { reason: opt.reason ?? 'merged', note: opt.note ?? null, decline: Boolean(opt.decline) });
        if (!r.ok) r.fix = agentFix('List the workflows with status, then run close again with a slug that it names.', `wf.mjs status ${word(root)}`);
        if (!r.ok && !opt.json) printFix(r.fix);
        out(opt.json ? r : !r.ok ? r.reason : r.declined ? `${slug} stays open; the close question is not asked again` : r.closed ? `${slug} is closed` : r.reason);
        return r.ok ? 0 : 1;
      }
      case 'status': {
        const [root, slug] = pos;
        if (!root) throw usage('status: <root> is required');
        if (opt.brief) {
          if (!slug) throw usage('status --brief: <slug> is required');
          const b = await statusBrief(resolve(root), slug);
          out(opt.json ? b : briefText(b));
          return b.error ? 1 : 0;
        }
        const s = await statusOf(resolve(root), slug ?? null);
        out(opt.json ? s : statusText(s));
        return s.error ? 1 : 0;
      }
      case 'target': {
        const [root, arg] = pos;
        if (!root) throw usage('target: <root> is required');
        const t = await resolveTarget(resolve(root), arg ?? null);
        out(opt.json ? t : targetText(t));
        return t.error ? 1 : 0;
      }
      case 'index': {
        const [root] = pos;
        if (!root) throw usage('index: <root> is required');
        const r = await reconcileIndex(resolve(root), { write: !opt.check });
        out(opt.json ? r : indexText(r));
        return opt.check && r.changed ? 1 : 0;
      }
      case 'cost': {
        const [root, slug] = pos;
        if (!root || !slug) throw usage('cost: <root> <slug> are required');
        const agg = costSummary(join(wfRoot(resolve(root)), slug));
        out(opt.json ? agg : costText(agg));
        return 0;
      }
      case 'stamp': {
        const [type] = pos;
        if (!type) throw usage('stamp: <type> is required');
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
        if (!['set', 'show', 'watch'].includes(verb) || !root || !slug) throw usage('progress: <set|show|watch> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw noFolder(`progress: no workflow folder ${dir}`, root);
        if (verb === 'set') {
          const change = Object.fromEntries(['stage', 'slice', 'status', 'run', 'driver', 'reason', 'resume'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          writeProgress(dir, change);
        }
        if (verb === 'watch') {
          const frame = () => {
            const p = progressOf(dir, slug);
            const v = runView(resolve(root), slug, { commentaryFile: join(dir, 'commentary.md') });
            return { p, v, over: !p || p.state !== 'running' || v.ended || Boolean(v.driver && !v.driver.alive) };
          };
          for (;;) {
            const { p, v, over } = frame();
            if (opt.json) out({ progress: p, ...v });
            else out(`${opt.once ? '' : `--- ${nowIso()}\n`}${runViewLines(v, progressLine(p)).join('\n')}`);
            if (opt.once || opt.json || over) return 0;
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
        const p = progressOf(dir, slug);
        out(opt.json ? p : progressLine(p));
        return 0;
      }
      case 'defer': {
        const [verb, root, slug] = pos;
        if (verb !== 'check' || !root || !slug) throw usage('defer: check <root> <slug> is required');
        const r = checkDeferrals(resolve(root), slug, { next: opt.next ?? null });
        out(opt.json ? r : r.entries.length ? r.entries.map(deferralLine).join('\n') : 'no open deferrals');
        return r.stop.length ? 1 : 0;
      }
      case 'board': {
        const [verb, root, slug, ...keys] = pos;
        if (!['add', 'move', 'regroup', 'remove', 'apply', 'digest', 'set', 'prose', 'render', 'adopt'].includes(verb) || !root || !slug) throw usage('board: <add|move|regroup|remove|apply|digest|set|prose|render|adopt> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw noFolder(`board: no workflow folder ${dir}`, root);
        const file = opt.board ?? null;
        let r;
        if (verb === 'add') {
          const [kind] = keys;
          if (!kind) throw usage(`board add: <${BOARD_KINDS.join('|')}> is required`);
          // A file holds one entry or a list; flags hold one entry. A file avoids the quoting of a shell.
          const entries = opt.file
            ? JSON.parse(readFileSync(resolve(opt.file), 'utf8'))
            : Object.fromEntries(['key', 'kind', 'thread', 'text', 'why', 'source', 'name', 'area', 'side', 'state'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          r = boardAdd(dir, kind, entries, { file });
        } else if (verb === 'move') {
          if (!keys.length) throw usage('board move: <item>... are required');
          if (!opt.to && !opt.new) throw usage('board move: --to <thread>, or --new <thread> --name n [--area a], is required');
          r = boardMove(dir, keys, opt.to ?? null, { newThread: opt.new ? { key: opt.new, name: opt.name, area: opt.area } : null, file });
        } else if (verb === 'regroup') {
          if (!keys.length || !opt.to) throw usage('board regroup: <thread>... --to <area> are required');
          r = boardRegroup(dir, keys, opt.to, { file });
        } else if (verb === 'apply') {
          if (!opt.file) throw usage('board apply: --file <change.json> is required');
          r = boardApply(dir, JSON.parse(readFileSync(resolve(opt.file), 'utf8')), { file });
        } else if (verb === 'digest') {
          r = boardDigest(dir, { file, close: opt.file ? JSON.parse(readFileSync(resolve(opt.file), 'utf8')) : null, full: Boolean(opt.full), areas: opt.area ? String(opt.area).split(',').map((a) => a.trim()).filter(Boolean) : null });
        } else if (verb === 'set') {
          const key = keys[0] && !keys[0].includes('=') ? keys[0] : null;
          r = boardSet(dir, key, boardFieldArgs(key ? keys.slice(1) : keys), { file });
        } else if (verb === 'prose') {
          const [what] = keys;
          if (!what || (opt.file == null && opt.text == null)) throw usage(`board prose: <${PROSE_KINDS.join('|')}> and --file <text file> or --text x are required`);
          const text = opt.file != null ? readFileSync(resolve(opt.file), 'utf8') : String(opt.text);
          r = boardProse(dir, what, text, { file, session: opt.session ?? null, date: opt.date ?? null, area: opt.area ?? null, heading: opt.heading ?? null });
        } else if (verb === 'render') {
          r = boardRender(dir, { file, check: Boolean(opt.check) });
          if (opt.check) { out(opt.json ? r : `${r.document ?? 'no document'}: ${r.stale ? (r.adopt ? 'written by hand; run board adopt' : 'stale') : 'shows the board'}`); return r.stale ? 1 : 0; }
        } else if (verb === 'adopt') {
          r = boardAdopt(dir, { file });
        } else {
          if (!keys.length) throw usage('board remove: <item>... are required');
          r = boardRemove(dir, keys, { file });
        }
        out(opt.json ? r : `${verb}: ${JSON.stringify(r)}`);
        return 0;
      }
      case 'receipt': {
        // Run the suites of the slice at HEAD; a receipt is written only when every suite passed.
        const [root, slug, slice] = pos;
        if (!root || !slug || !slice) throw usage('receipt: <root> <slug> <slice> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw noFolder(`receipt: no workflow folder ${dir}`, root);
        const file = join(dir, `.test-receipt-${slice}.json`);
        if (opt.check) {
          // A reader reuses the receipt only while the tree is the one that ran.
          if (!existsSync(file)) { out(opt.json ? { reusable: false, reason: 'no receipt' } : 'no receipt'); return 1; }
          const held = JSON.parse(readFileSync(file, 'utf8'));
          const state = receiptState(projectRoot, held);
          out(opt.json ? { ...state, receipt: held } : state.reusable ? `receipt reusable: ${held.commands.join(', ')} passed at ${String(held.sha).slice(0, 8)}` : held.result === 'none' ? `no receipt: ${state.reason}` : `receipt stale: ${state.reason}`);
          return state.reusable ? 0 : 1;
        }
        const g = (args) => spawnSync('git', ['-C', projectRoot, ...args], { encoding: 'utf8', windowsHide: true });
        const head = g(['rev-parse', 'HEAD']);
        if (head.status !== 0) throw ask(`receipt: ${projectRoot} has no commit`, 'The project has no commit yet: make its first commit, then run receipt again.');
        // A change outside .ai that HEAD lacks does not refuse the receipt: it is named, with the
        // hash of the file that the suites run with, so a reader can tell when it changes.
        const dirty = treeChanges(projectRoot);
        const profile = readProfile(projectRoot);
        const names = opt.suites ? String(opt.suites).split(',').map((s) => s.trim()).filter(Boolean) : implementSuites(profile);
        if (!names.length) {
          // No suite for implement: the receipt says so, and the stage goes on. Setup asks once.
          const none = noSuiteReceipt(projectRoot, dir, slice, { now: nowIso() });
          out(opt.json ? { pass: true, runs: [], receipt: file, result: none.result, reason: none.reason ?? null } : `receipt: ${none.result === 'none' ? `none (${NO_SUITE})` : `${file} (kept)`}`);
          return 0;
        }
        const missing = names.find((name) => !profile[name]?.command);
        if (missing) throw noCommand(missing, 'receipt: ');
        const runs = [];
        for (const name of names) {
          const suite = profile[name];
          const t0 = Date.now();
          // The output of the suite goes to a log file, not to the terminal of the agent.
          const r = runSuiteLogged(projectRoot, name, suite.command);
          const seconds = Math.round((Date.now() - t0) / 100) / 10;
          if (!r.error) {
            try { recordRun(projectRoot, name, seconds); } catch (e) { process.stderr.write(`wf.mjs: the time of the ${name} suite was not recorded: ${e.message}\n`); }
          }
          runs.push({ suite: name, command: suite.command, pass: r.status === 0, seconds, log: r.log, ...(r.tail ? { tail: r.tail } : {}) });
          if (r.status !== 0) break;
        }
        const pass = runs.length === names.length && runs.every((r) => r.pass);
        const receipt = { sha: head.stdout.trim(), commands: runs.map((r) => r.command), result: 'pass', at: nowIso(), dirty };
        if (pass) writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
        // A change that HEAD lacks is in no commit of the slice: the receipt records it in dirty.
        const named = dirty.length ? `; recorded ${dirty.length} change(s) that are in no commit of the slice: ${dirty.map((d) => d.path).join(', ')}` : '';
        const failed = runs.find((r) => !r.pass);
        out(opt.json ? { pass, runs, receipt: pass ? file : null, dirty } : pass ? `receipt ${file}: ${runs.map((r) => r.suite).join(', ')} passed at ${receipt.sha.slice(0, 8)}${named}` : [`no receipt: ${failed?.suite} failed`, ...(failed ? suiteLogLines(failed) : [])].join('\n'));
        return pass ? 0 : 1;
      }
      case 'slice': {
        const [verb, root, slug, slice] = pos;
        if (!['drop', 'move'].includes(verb) || !root || !slug || !slice) throw usage('slice: <drop|move> <root> <slug> <slice> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw noFolder(`slice: no workflow folder ${dir}`, root);
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
        if (!root || !slug || !stage) throw usage('brief: <root> <slug> <stage> are required');
        const b = buildBrief({ projectRoot: resolve(root), referenceRoot: REFERENCE_ROOT, slug, stage, slice: slice ?? null, wfCli: join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'wf.mjs') });
        if (opt.json) out(b); else process.stdout.write(b.text);
        return 0;
      }
      case 'inbox': {
        const [root] = pos;
        if (!root) throw usage('inbox: <root> is required');
        const r = await inboxOf(resolve(root));
        out(opt.json ? r : inboxText(r));
        return 0;
      }
      case 'requires': {
        // One JSON object always: the agent reads the content from it.
        const [root, slug, stage] = pos;
        if (!root || !slug || !stage) throw usage('requires: <root> <slug> <stage> are required');
        const modes = String(opt.mode ?? '').split(',').map((m) => m.trim()).filter(Boolean);
        const r = resolveRequires({ projectRoot: resolve(root), referenceDir: REFERENCE_ROOT, slug, stage, modes, slice: opt.slice ?? null, resume: Boolean(opt['on-resume']), maxBytes: opt['max-bytes'] ? Number(opt['max-bytes']) : REQUIRES_MAX_BYTES });
        if (!r.ok) throw refuse(`requires: ${r.error}`, r.fix);
        out(r);
        return r.stop ? 1 : 0;
      }
      case 'standing': {
        const r = runStanding(pos, opt);
        out(opt.json ? r.value : r.text);
        return r.code;
      }
      default:
        process.stderr.write(`${USAGE}\n`);
        return 2;
    }
  } catch (e) {
    process.stderr.write(`wf.mjs: ${e.message}\n${hintOf(cmd, pos, e.message, e.fix, e)}`);
    return 1;
  }
}

// The hint after an error: a slug in the place of the root, or the forms of the command.
// The allowed values of the enum arguments of a form, listed with the forms of a usage error.
const ENUM_ARGS = {
  'decide add': { '--by': [...DECISION_BY, 'standing:<id>'], '--kind': DECISION_KINDS },
  'decide list': { '--by': [...DECISION_BY, 'standing'], '--kind': DECISION_KINDS },
  'step stop': { '--kind': STOP_KINDS },
  'findings add': { '--source': FINDING_SOURCES },
  'findings list': { '--source': FINDING_SOURCES },
  'findings table': { '--source': FINDING_SOURCES },
  'findings metrics': { '--source': FINDING_SOURCES },
  'findings set': { '<status>': FINDING_STATUSES },
  'profile set': { '<suite>': SUITES },
  'profile record': { '<suite>': SUITES },
  'profile run': { '<suite>': SUITES },
  'profile timebox': { '<stage>': Object.keys(STAGE_SUITES) },
  'profile budget': { '--preset': Object.keys(BUDGET_PRESETS) },
  'progress set': { '--status': PROGRESS_STATUSES },
  'record stage-done': { '<stage>': Object.keys(STAGE_FILES) },
  'board add': { '<kind>': BOARD_KINDS },
  'board prose': { '<field>': PROSE_KINDS },
};

/** The verbs that the form line of a help block names (`record put` → [put]), or null. */
function verbsOfForm(line) {
  const t = line.trim().split(/\s+/)[1] ?? '';
  const list = /^<([a-z][a-z|-]*\|[a-z|-]*)>$/.exec(t)?.[1] ?? (/^[a-z][a-z|-]*$/.test(t) ? t : null);
  return list ? list.split('|') : null;
}

/** The help blocks of one verb of a command (every block of the command when `verb` is null). */
function blocksOf(cmd, verb = null) {
  const blocks = headerBlocks(fileURLToPath(import.meta.url)).filter((b) => b.name === cmd);
  return verb == null ? blocks : blocks.filter((b) => verbsOfForm(b.lines[0])?.includes(verb));
}

/**
 * The help of a call that stops before a required argument (`wf.mjs record`, `wf.mjs decide add`):
 * the call asks for the forms. Null when the call is a whole form, or names no form.
 */
export function bareHelp(cmd, rest) {
  if (rest.length > 1 || rest.some((a) => a.startsWith('-'))) return null;
  const verb = rest[0] ?? null;
  const verbs = formsOf(cmd);
  if (verb != null && !verbs?.has(verb)) return null;
  const blocks = blocksOf(cmd, verb);
  if (!blocks.length) return null;
  // With no verb, a command of forms needs one; else the next word of each form must be required.
  const at = verb == null ? 1 : 2;
  const needs = (verb == null && verbs) || blocks.every((b) => (b.lines[0].trim().split(/\s+/)[at] ?? '').startsWith('<'));
  if (!needs) return null;
  const values = verb != null && ENUM_ARGS[`${cmd} ${verb}`];
  return [...blocks.map((b) => b.lines.join('\n')), ...(values ? [valuesLine(values)] : [])].join('\n');
}

const valuesLine = (values) => `values: ${Object.entries(values).map(([k, v]) => `${k} ${v.join('|')}`).join('; ')}`;

// The lines after an error: a slug in the place of the root, the forms and the allowed values of
// a usage error, and last the fix lines (lib/fix.mjs): `fix.who:`, `fix.do:`, and `fix: <command>`
// when a command makes the repair. Every error ends with them: its own fix, the fix of its class,
// or the report of a defect.
function hintOf(cmd, pos, message, fix = null, err = null) {
  const verbs = formsOf(cmd);
  const at = verbs ? 1 : 0;
  const verb = verbs && verbs.has(pos[0]) ? pos[0] : null;
  const root = pos[at];
  const lines = [];
  let f = asFix(fix);
  const isUsage = /are required|is required|needs <|unknown verb|must be one of|is not key=value|is not a stage/.test(message);
  if (/no workflow folder/.test(message) && root && !existsSync(join(resolve(root), '.ai')) && existsSync(join(process.cwd(), '.ai'))) {
    lines.push(`wf.mjs: ${root} is not a project root. The project root comes first: wf.mjs ${cmd} ${at ? `${pos[0]} ` : ''}"<project root>" <slug> ...`);
    f = agentFix('Run the command again with the project root first, then the slug.');
  } else if (/no workflow folder/.test(message) && root) {
    f ??= agentFix('List the workflows with status, then run the command again with a slug that it names.', `wf.mjs status ${word(root)}`);
  }
  if (isUsage && cmd) {
    const blocks = blocksOf(cmd, verb);
    if (blocks.length) lines.push(`wf.mjs: the forms of ${cmd}${verb ? ` ${verb}` : ''}:`, ...blocks.map((b) => b.lines.join('\n')));
    const values = verb && ENUM_ARGS[`${cmd} ${verb}`];
    if (values) lines.push(valuesLine(values));
  }
  if (!f && isUsage) f = agentFix(ARGS_FIX);
  if (!f) f = defectFix('wf.mjs', err ?? new Error(message));
  const fill = (s) => (root && s ? s.replace(/<root>/g, word(root)) : s);
  lines.push(...fixLines({ ...f, ...(f.command ? { command: fill(f.command) } : {}), ...(f.then ? { then: fill(f.then) } : {}) }));
  return `${lines.join('\n')}\n`;
}

const isMain = isMainModule(import.meta.url);
if (isMain) process.exitCode = await main();
