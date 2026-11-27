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
 *             every CLI form, each with one example
 *             Example: wf.mjs describe
 *   skill-dir
 *             the absolute folder of the wf skill, the `<skill-dir>` of every reference. An agent
 *             that has no `skill-dir:` line runs it through the stable entry point, never a search
 *             Example: node "$HOME/.sdlc/bin/wf.mjs" skill-dir
 *   records  <link|status|sync|push|flush|close|retry|dismiss|migrate> [<root>] [<project>|<slug>] [--problems] [--dry-run] [--json]
 *             the records repo: link a project (its records move into the clone, and each
 *             workflow gets its issue), show the clone (--problems: only the failed pushes, the
 *             conflicts and the files in no commit, at most 40 lines), pull the work of other
 *             machines, push the clone, close a workflow (send it; it stays owned until the push lands), the
 *             two answers to a records question of the dispatch (retry: commit the workflow again
 *             and push and flush in the background; dismiss: ask again only about a newer
 *             failure), and move the live branches of an older version onto the main branch once.
 *             flush sends the records now and waits for the push: exit 1 when it did not land
 *             (with <slug>: when that workflow was not sent)
 *             Example: wf.mjs records status . --problems
 *             Example: wf.mjs records flush . demo
 *             Example: wf.mjs records migrate --dry-run
 *   records  claim <root> <slug> [--json]
 *             make this computer the owner of a workflow: fetch and apply, write the owner file,
 *             send it. The work starts when the push lands; exit 1 when another computer owns it
 *             Example: wf.mjs records claim . demo
 *   records  take <root> <slug> [--json]
 *             the claim of a workflow that another computer owns, after the person said yes: its
 *             later work there is parked, not lost
 *             Example: wf.mjs records take . demo
 *   records  release <root> <slug> [--to <machine>] [--json]
 *             send the workflow, then give it up (--to: hand it to that computer), then send
 *             that. When a push fails, this computer stays the owner
 *             Example: wf.mjs records release . demo --to laptop
 *   records  decline <root> <slug>
 *             the answer no to a claim or take-over question: the key does not run here (exit 1)
 *             Example: wf.mjs records decline . demo
 *   records  parked <root> [--json]
 *             the copies that a sync parked on conflict branches: another computer owned their
 *             workflow, or the remote changed a workflow with no owner after this computer's
 *             last sync (another computer, or a session on a wf older than the compose sync)
 *             Example: wf.mjs records parked .
 *   records  parked show <root> <branch> [--json]
 *             the files that a parked copy holds and the remote does not
 *             Example: wf.mjs records parked show . conflict/laptop-0123456789ab
 *   records  parked take <root> <branch> <path>
 *             copy one file of a parked copy into the live folder; only the owner of its workflow
 *             Example: wf.mjs records parked take . conflict/laptop-0123456789ab notes/demo/notes.md
 *   records  parked drop <root> <branch>
 *             delete a parked copy, after the person said yes
 *             Example: wf.mjs records parked drop . conflict/laptop-0123456789ab
 *   records  join <url> [--cloud --project <p>] [--json]
 *             clone the records repo for this computer, with the settings of every system (no
 *             line-end conversion, long paths), and check the image store. --cloud: a cloud
 *             session, with no blobs and a sparse checkout of one project, named cloud-<id>
 *             Example: wf.mjs records join ../records.git
 *   records  images <root> [--fetch] [--json]
 *             the images of the records outside git (records.images in the machine config): the
 *             references, the images that wait for the store, and the images that stay on
 *             another computer. --fetch brings the absent images of the project in
 *             Example: wf.mjs records images . --fetch
 *   records  rewrite <list|check|backup|export|mirror|verify> [<dir>] [--archive <path>]... [--json]
 *             the steps of the history rewrite, which change neither the clone nor the remote:
 *             list the images and archives of the history, check that no process writes, make a
 *             bundle and restore it, give the images of HEAD their references (export), write a
 *             rewritten mirror into <dir>, and verify it. The force push is the person's
 *             Example: wf.mjs records rewrite list
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
 *   slice    add <root> <slug> <slice> --scope s (--ac a | --ac-file f) [--title t] [--after x,y] [--before x,y]
 *                [--files f,g] [--complexity c] [--ux-impact u] [--made-for k]
 *                (--placement <05i-issue-k.md> | --by person --decision <id>) [--json]
 *             add a slice to the roster during a run: its slice record and its roster row. Only a
 *             rung-5 placement of issue place, or a decision of the person, adds one; the same
 *             placement a second time changes nothing. --ac is one criterion a line; --ac-file is a
 *             JSON list of criteria (a wf tool call gives ac as a list). --before
 *             names slices that now wait for it, and none of them may have started
 *             Example: wf.mjs slice add . demo cache-key --scope "the cache key includes the user" --ac "Given logout When login Then no stale page" --after auth --placement 05i-issue-t12.md
 *   slice    carry <root> <slug> <slice> --issue <id> --text t
 *                (--placement <05i-issue-k.md> | --by person --decision <id>) [--json]
 *             carry an issue into the scope of a slice whose implement has not started: the slice
 *             record lists it under Carried Issues and sets carried-at, so a plan written
 *             before it is refreshed before the implement. Only a rung-3 or rung-4 placement does it
 *             Example: wf.mjs slice carry . demo web --issue T-12 --text "stale cache key" --placement 05i-issue-t12.md
 *   slice    split <root> <slug> <slice> --part "<slice>:<ac>,<ac>;<new>:<ac>" --decision <id> [--reason r] [--json]
 *             cut a slice that has not started into parts: each acceptance criterion (a 1-based
 *             position, or an AC-<n> label) goes to one part, and the part named after the slice
 *             keeps its slug and its records. The parts run in the order given, the slices that
 *             waited for it wait for the last part, the estimate is divided by the share of
 *             criteria, and its decisions follow the criteria they name (else every part). The
 *             parts are joined by ; (a repeated --part joins the same way)
 *             Example: wf.mjs slice split . demo engine --part "engine:1,2;engine-rules:3,4" --decision D-12
 *   slice    merge <root> <slug> <slice> --from <slice>,<slice> --decision <id> [--reason r] [--json]
 *             join slices that have not started into <slice>: their criteria, carried issues,
 *             estimates and decisions; each slice of --from is dropped, "merged into <slice>".
 *             Refused when the joined estimate passes the step limit (slices.maxSteps)
 *             Example: wf.mjs slice merge . demo api --from api-docs --decision D-13
 *   issue    place <root> <slug> <id> [--apply] [--running a,b] [--review-open] [--final] [--as a] [--json]
 *             place the issue <id> of the talk from its investigation 05i-issue-<key>.md: the
 *             lowest rung of the ladder that holds, written into the record. --apply does it: a
 *             talk request to the stage that takes it, slice carry, slice add, the next packet of
 *             a campaign list, or a held question to the person (outside the confirmed scope,
 *             rung 7). An applied placement is not applied again; a refusal of its target ("cannot:"),
 *             or a target that ended without it, places it one rung higher; an answer of the person
 *             to the held question is applied. --running names the stages that run now
 *             Example: wf.mjs issue place . demo T-12 --apply --running implement:web
 *   report   add <root> [<slug>] --kind bug|feature|docs|friction --title t --body b [--severity high|medium|low]
 *                [--area a] [--stage s] [--command c] [--error e] [--json]
 *             file a report about wf itself, not about the product: a command that fails or
 *             does what its docs do not say, a feature it lacks, a doc that the code contradicts,
 *             a step that cost time for no gain. Triaged when it is filed: its area (the op or
 *             stage it names), its severity, and the earlier report it repeats. Kept on this
 *             computer in <sdlc home>/reports/; the person decides in the Reports app
 *             Example: wf.mjs report add . demo --kind bug --title "campaign split refuses after a stop" --body "..."
 *   report   list [--state new|build|later|reject|built|all] [--json]
 *             the groups of reports, the highest priority first (new ones when no --state)
 *             Example: wf.mjs report list --state build
 *   report   show <id> [--json]
 *             one group: the report, each sighting of it, the choice of the person
 *             Example: wf.mjs report show R-20261127-a1b2c3
 *   report   decide <id> <decision> [--note n] [--json]
 *             the choice of the person on a group, build, later or reject (the Reports app
 *             writes the same file);
 *             an agent of a run is refused
 *             Example: wf.mjs report decide R-20261127-a1b2c3 build --note "next release"
 *   report   built <id> --commit <sha> [--release v] [--note n] [--json]
 *             the commit that built a group the person chose to build
 *             Example: wf.mjs report built R-20261127-a1b2c3 --commit HEAD
 *   decide   add <root> <slug> --answer a [--key k] [--question q] [--kind k] [--by b] [--class c] [--replaces D-1,D-2]
 *                [--packet p] [--slice s] [--files f,g] [--stage s] [--rewrote f,g] [--source s] [--json]
 *             Example: wf.mjs decide add . demo --key db --question "Which database?" --answer postgres
 *   decide   add <root> <slug> --file <answers.json> [--by b] [--stage s] [--json]
 *             record a decision; a live entry with the same key and scope is superseded, and
 *             each record that names it gets superseded-decisions.<old id>: <new id>
 *             Example: wf.mjs decide add . demo --file .ai/workflows/demo/.draft/answers.json
 *   decide   list <root> <slug> [--packet p] [--slice s] [--files f,g] [--by b] [--kind k[,k2]] [--rules] [--since D-012] [--all] [--json]
 *             the live entries in a scope (--all: every entry; --by standing: the cases that a
 *             standing answer settled). Use it to read what is decided;
 *             use decide answered to test one key before a question is asked
 *             Example: wf.mjs decide list . demo --slice api
 *   decide   end <root> <slug> <id> --reason r [--json]
 *             end a live entry that has no successor: a steer that no longer holds, or a note
 *             that was handled; the entry leaves every list and every brief
 *             Example: wf.mjs decide end . demo D-050 --reason "the tests run once for the slice now"
 *   decide   tidy <root> <slug> [--apply] [--full] [--json]
 *             the steers and notes against the roster: those of a slice that is done (ended),
 *             steers that a build stage wrote for one open slice (made notes), and the live
 *             steers left for the person; --apply makes the first two changes, --full lists
 *             the third
 *             Example: wf.mjs decide tidy . demo
 *   rule     add <root> --text t [--key k] [--json]
 *            add a standing rule of the project (.ai/sdlc-config.json `rules`): each brief of each
 *            workflow prints the rules, so a rule of the whole project is written once, not as a
 *            steer of every workflow; a rule with the same key is replaced
 *            Example: wf.mjs rule add . --key one-shared-body --text "One body model for every player."
 *   rule     list <root> [--json]
 *            the standing rules of the project
 *            Example: wf.mjs rule list .
 *   rule     end <root> <key> --reason r [--json]
 *            take a rule out of the project
 *            Example: wf.mjs rule end . one-shared-body --reason "the keeper has its own body now"
 *   rule     candidates <root> [--json]
 *            the steers that say the same in 3 or more workflows of the project
 *            Example: wf.mjs rule candidates .
 *   rule     adopt <root> --from <slug>:<id> [--key k] [--json]
 *            make one steer a rule of the project, and end each steer of any workflow that says the same
 *            Example: wf.mjs rule adopt . --from demo:D-012
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
 *   talk     post <root> <slug> --as a --to x[,y] --text t [--kind info|request|handover|done]
 *                [--refs a,b] [--wants-reply --fallback f] [--key k] [--issue] [--json]
 *             post a message to the agents of the run. --as is your name: <stage>:<slice>,
 *             driver or session. --to is a slice, <stage>:<slice>, driver, session or all; a
 *             slice that has not started reads it when it starts. --wants-reply needs
 *             --fallback, what you do when no reply comes. A message informs or requests; it
 *             never binds, and a decision of the person is never asked here. --issue: an issue
 *             outside your own acceptance criteria, for the placer of the run (--to defaults to
 *             driver; the lead of an orchestrate run is session). Give the reproduction in the
 *             text and the files in --refs: a second report with the same refs joins the open thread
 *             Example: wf.mjs talk post . demo --as verify:api --to web --kind handover --text "fix in abc123: the cache key" --refs abc123
 *             Example: wf.mjs talk post . demo --as implement:api --issue --text "npm test -- cache: stale key after logout" --refs src/cache.ts
 *   talk     reply <root> <slug> <id> --as a --text t [--refs a,b] [--wants-reply --fallback f] [--json]
 *             answer a message in its thread; the reply goes to its sender
 *             Example: wf.mjs talk reply . demo T-4 --as implement:web --text "merged at step 5"
 *   talk     read <root> <slug> --as a [--open] [--all] [--thread id] [--after id] [--peek] [--issues] [--json]
 *             the messages for you that you have not seen, with their receipts written
 *             (--open: every open message for you, for the start of a stage; --all: closed
 *             ones too; --peek: no receipt). Read at each reading point that your prompt names.
 *             --issues: the open issues of the run with their placement and refusals (--all
 *             adds the closed ones); it writes no receipt
 *             Example: wf.mjs talk read . demo --as implement:web
 *   talk     close <root> <slug> <id> --as a [--reason r] [--json]
 *             the matter of a message is handled: its thread leaves every inbox
 *             Example: wf.mjs talk close . demo T-4 --as implement:web --reason "merged"
 *   talk     ping <root> <slug> <id> --as a [--json]
 *             a message is urgent now: an agent that waits sees it at once
 *             Example: wf.mjs talk ping . demo T-4 --as session
 *   talk     wait <root> <slug> --as a [--after id] [--job id] [--key k[,k2]] [--claim r]
 *                [--lease-min n] [--why w] [--seconds n] [--json]
 *             block until a message arrives for you, or what you wait for is there: the end
 *             of a job (--job), the answer of the person to a held question (--key), or a
 *             shared resource (--claim). One call blocks for 4 minutes at most: give the
 *             shell call a timeout of 5 minutes, and run it again at "still waiting"
 *             Example: wf.mjs talk wait . demo --as verify:api --job J-20261125T140001Z-ab12
 *   talk     claim <root> <slug> <resource> --as a [--lease-min n] [--why w] [--json]
 *             ask once for a shared resource of the project; exit 1 when another holds it
 *             Example: wf.mjs talk claim . demo test-machine --as verify:api
 *   talk     release <root> <slug> <resource> --as a [--json]
 *             Example: wf.mjs talk release . demo test-machine --as verify:api
 *   talk     resources <root> <slug> [--json]
 *             the shared resources that the config of the project names (`resources`), and
 *             who holds each one now
 *             Example: wf.mjs talk resources . demo
 *   talk     job <root> <slug> --as a [--name n] [--claim r] [--cwd d] [--json] -- <command>
 *             start a long command as its own process, with its output in a log file, and
 *             return at once. With --claim the job keeps the resource that you hold and gives
 *             it back at its end. Wait for the end with talk wait --job
 *             Example: wf.mjs talk job . demo --as verify:api --name end-run --claim test-machine -- npm test
 *   talk     jobs <root> <slug> [--stop [--as a]] [--json]
 *             the jobs of the workflow; --stop ends the ones that still run (with --as, only
 *             the jobs that this actor started)
 *             Example: wf.mjs talk jobs . demo
 *   talk     list <root> <slug> [--thread id] [--after id] [--open] [--full] [--json]
 *             every thread of the run and who holds each resource: the audit of the talk
 *             Example: wf.mjs talk list . demo --open
 *   control  stop <root> <slug> [--after current|step|plan|implement|verify|review] [--json]
 *             ask the run of <slug> to stop: after the agent that runs now (current, the
 *             default), after the next step that ends (step: step done tells the implement
 *             agent to end), or after the next stage of that name that ends
 *             Example: wf.mjs control stop . demo --after step
 *   control  clear <root> <slug> [--force] [--json]
 *             take the stop request back; one made after the last run ended stays unless --force
 *             Example: wf.mjs control clear . demo
 *   control  show <root> <slug> [--json]
 *             the stop request of <slug>, and where it lands
 *             Example: wf.mjs control show . demo
 *   step     start <root> <slug> <slice> <n> [--title t]
 *             Example: wf.mjs step start . demo api 3 --title "add the route"
 *   step     done <root> <slug> <slice> <n> (--sha s|HEAD | --no-change)
 *             Example: wf.mjs step done . demo api 3 --sha HEAD
 *   step     check <root> <slug> <slice> [--name n (--run "<command>" | --job <id> |
 *                --result not-met|not-run [--sha s|HEAD]) [--optional] [--note t]
 *                [--carried-from <base commit> --base-job <id>]] [--json]
 *             record the result of one slice check of the plan, with the commit that it ran
 *             on. A check is met only by an exit code that wf saw: --run runs the command
 *             here (8 minutes at most), --job takes the exit code and the commit of a job
 *             that ended (talk job). With no --name: the checks of the slice and what blocks
 *             the end of the stage (exit 1 when something blocks). record stage-done refuses
 *             an implement while a required check did not run on the last code of the slice,
 *             and a verify that says pass while a check is not met. --carried-from is for a
 *             red of an earlier slice: --base-job names a job that ran the same check at the
 *             base commit of the slice and failed there
 *             Example: wf.mjs step check . demo api --name "guard set" --run "npm run guards"
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
 *             the old layout into the record files, with redirects.yaml, and work out its
 *             derived fields again (total-slices, best-first-slice, the counts, the roster
 *             copies): run it on a workflow whose stored counts were written by hand
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
 *   slice-files <root> <slug> [<slice> <other slice>] [--json]
 *             the planned files of the slices: with two slices, the files that both change
 *             (`shared`; `known` is false when one of them has no file list); with none, each
 *             pair that shares a file and each depends-on edge whose slices share no file
 *             Example: wf.mjs slice-files . demo api web --json
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
 *            [--no-plan-ahead] [--no-verify-behind] [--pair-slices]
 *             run the yolo driver under Node, each agent as one `codex exec` call; prints the
 *             outcome, and keeps the run's records in .scratch/wf/drive/<run>/. --review-findings:
 *             the slug-wide review fixes only the findings that the campaign walk put in the ledger.
 *             --no-plan-ahead, --no-verify-behind and --pair-slices set the overlap of the walk.
 *            
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
import { STOP_KINDS, stopKind } from '../lib/steps.mjs';
import { hostname } from 'node:os';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBrief } from '../lib/brief.mjs';
import { BOOLEAN_FLAGS } from '../lib/cli-flags.mjs';
import { SKILL_DIR } from '../lib/skill-dir.mjs';
import { putChecked } from '../lib/record-put.mjs';
import { driveArgs, driveScript, readRun } from '../lib/drive.mjs';
import { runView, runViewLines, sandboxProblem, sessionThread, startDetached } from '../lib/drive-detach.mjs';
import { STOP_AFTER, appendJournalLine, appendRunEnd, journalPath, stopCheck, stopLands, writeControl } from './yolo-watch.mjs';
import { WAIT_CALL_MS, heldQuestions, waitForAnswers } from '../lib/decide-wait.mjs';
import { parseJsonLines, stageOf } from '../lib/live-events.mjs';
import { checkConsent, grantConsent, revokeConsent } from '../lib/consent.mjs';
import { closeCandidates, closeWorkflow } from '../lib/closing.mjs';
import { needsSetup, setupProject } from '../lib/setup.mjs';
import { MAX_FAILS, backfill, flushOutbox, issueComments, layerOf, layerStatus, noteMessage, readOutbox } from '../lib/github-layer.mjs';
import { afterChange } from '../lib/after-change.mjs';
import { SAVED, closeRecords, commitWorkflow, dismissRecords, flushRecords, inBackground, linkProject, logRecordsEvent, machineName, migrateLive, productRepoGapLines, productRepoGaps, pullRecords, pushRecords, recordsProblems, recordsStatus, syncRecords } from '../lib/records-sync.mjs';
import { claimWorkflow, dropParked, listParked, releaseWorkflow, showParked, takeParked } from '../lib/records-owners.mjs';
import { recordsLine } from '../lib/records-line.mjs';
import { importComments, listMessages, postMessage, readMessage } from '../lib/messages.mjs';
import { checkPage, pageBrief, putPage } from '../lib/brainstorm-page.mjs';
import { modernizeWorkflow } from '../lib/modernize.mjs';
import { runDesign } from '../lib/design-cli.mjs';
import { baseCheck, defaultRun, finishShip, mergeCommand, readyGaps, shipFacts } from '../lib/last-mile.mjs';
import { addScratchWorktree, removeScratchWorktrees, leftoverBranches } from '../lib/scratch-worktree.mjs';
import { orderReport, orderText, pairOf } from '../lib/slice-files.mjs';
import { addDecision, answeredBy, applyTidy, decisionLine, decisionsOf, dropAnswered, endDecision, importLegacy, liveDecisions, tidyPlan } from '../lib/decisions.mjs';
import { rosterOf } from '../lib/roster-edit.mjs';
import { deriveWorkflow } from '../lib/roster.mjs';
import { addRule, adoptRule, endRule, readRules, ruleCandidates, ruleLine } from '../lib/project-rules.mjs';
import { SAFE_TOKEN, UNSAFE, diskFacts, dispatch, dispatchLine } from '../lib/dispatch.mjs';
import { checkDeferrals, deferralLine, openDeferrals } from '../lib/deferrals.mjs';
import { OPEN_STATUSES, findingsTable, mergeRun, metricsOf, readLedger, setStatus, updateLedger, verdictOf, writeLedger } from '../lib/findings.mjs';
import { markBusy, progressLine, progressOf, readProgress, writeDriverOutcome, writeProgress } from '../lib/progress.mjs';
import { pruneEvidence } from '../lib/evidence.mjs';
import { DRAFT_DIR, INDEX_HEADER, INDEX_NAME, clearKept, docText, draftPath, draftsOf, frontmatterOfDoc, keptPath, listDocs, markSuperseded, migrateWorkflow, outlineOf, putDraft, readDoc, redirectOf, sectionText, setFields, updateFields } from '../lib/records.mjs';
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.mjs';
import { PATH_FORMS, getPath } from '../lib/record-path.mjs';
import { SLICE_STAGES, SMALL_STAGE_FILES, STAGE_FILES, stageDone } from '../lib/stage-done.mjs';
import { addSlice, carrySlice, dropSlice, mergeSlices, moveSlice, splitSlice } from '../lib/slice-ops.mjs';
import { limitsOf } from '../lib/limits.mjs';
import { placeAndApply } from '../lib/issue-apply.mjs';
import { placementLine } from '../lib/issue-place.mjs';
import { DECISIONS as REPORT_DECISIONS, addReport, builtReport, decideReport, groupLine, groups as reportGroups, readAll as readReports, reportsDir } from '../lib/reports.mjs';
import { callerActor, personOnly } from '../lib/actor.mjs';
import { BOARD_KINDS, PROSE_KINDS, boardAdd, boardAdopt, boardApply, boardDigest, boardFieldArgs, boardMove, boardProse, boardRegroup, boardRemove, boardRender, boardSet } from '../lib/board-ops.mjs';
import { appendStep, branchOf, commitIdentity, gitRevParse, lastSlice, planDocOf, planProblems, readPlan, readSteps, sliceRefusal, stepCheckout, whereLine, whereOf } from '../lib/steps.mjs';
import { hostProcess, isMainModule } from '../lib/proc.mjs';
import { writeFileAtomic } from '../lib/atomic-write.mjs';
import { withFileLock } from '../lib/file-lock.mjs';
import { runTalk } from '../lib/talk-cli.mjs';
import { MAX_FIX_ROUNDS, RESULTS as CHECK_RESULTS, addCheck, checkLine, checksOf, fixRounds, isProse, sliceCheckState } from '../lib/slice-checks.mjs';
import { jobState } from '../lib/jobs.mjs';
import { verifyGate } from '../lib/stage-gates.mjs';
import { actorOf, markRead, markSeen, messageLine, readTalk, unreadFor } from '../lib/talk.mjs';
import { STAGE_SUITES, SUITES, BUDGET_PRESETS, budgetLine, noCommand, overLongBudget, profileLines, readBudget, readProfile, recordRun, setBudget, setSuite, timeBox } from '../lib/test-profile.mjs';
import { hookSuites } from '../lib/repo-hooks.mjs';
import { SUITE_LOG_DIR, runSuiteLogged } from '../lib/run-files.mjs';
import { NO_SUITE, implementSuites, noSuiteReceipt, receiptState, treeChanges } from '../lib/test-receipt.mjs';
import { loadRegistry, reservedWords } from '../lib/registry.mjs';
import { scanWorkflowIndexes } from '../lib/workflow-index.mjs';
import { stageYoloDriver } from './stage-yolo-driver.mjs';
import { linkedProject, localWorkflowsRoot, recordsHome, runRoot, workflowDir, workflowsRoot } from '../lib/records-root.mjs';
import { briefText, costSummary, count, statusBrief, statusOf, stepGit } from '../lib/wf-status.mjs';
import { resolveTarget, targetText } from '../lib/wf-target.mjs';
import { refuseNoteToDoneSlice, checkDismissDecision, decideAdd, defOfType, editRecord, holdQuestion, noRecord, pick, recordName, resolveRecord, resolveRef, schemaOf, setRecordPaths, settleQuestion } from '../lib/wf-ops.mjs';
import { inboxOf, inboxText } from '../lib/inbox.mjs';
import { REQUIRES_MAX_BYTES, resolveRequires } from '../lib/requires-resolve.mjs';
import { runStanding } from '../lib/standing.mjs';
import { agentFix, asFix, defectFix, fixLines, personFix, refuse } from '../lib/fix.mjs';

// The status and record bodies live in lib/, so the library calls the same functions.
export { briefText, defOfType, setRecordPaths, statusBrief, statusOf };

// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USAGE = 'Usage: wf.mjs <dispatch|skill-dir|status|target|index|cost|stamp|decide|talk|step|progress|profile|defer|brief|findings|record|consent|base|ship|close|setup|gh|records|msg|page|modernize|design|drive> ...';
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
      if (BOOLEAN_FLAGS.has(name)) opt[name] = true;
      else {
        // Git Bash puts its install path in front of `/wf`: the repair is silent, and only a
        // value that it cannot repair warns.
        const { value } = undoGitBashPath(argv[(i += 1)]);
        const warn = unrepairedWarning(`--${name}`, value);
        if (warn) process.stderr.write(warn);
        // `--mode` may repeat (requires): the values join with a comma. `--part` repeats (slice
        // split), one part each: the values join with a semicolon.
        opt[name] = name === 'mode' && opt.mode != null ? `${opt.mode},${value}` : name === 'part' && opt.part != null ? `${opt.part};${value}` : value;
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
  const staged = stageYoloDriver(projectRoot, { slug, takeOver: Boolean(opt['take-over']) });
  const answered = opt.answered ? JSON.parse(readFileSync(resolve(opt.answered), 'utf8')) : null;
  if (answered && !Array.isArray(answered)) throw redo('drive: --answered must name a JSON array of answers', 'Write the answers file as a JSON array of answers, then run drive again.');
  const run = opt.resume || opt.run || `${nowIso().replace(/[-:]/g, '')}-${slug}`;
  const runDir = join(projectRoot, '.scratch', 'wf', 'drive', run);
  // Inside the sandbox of a Codex shell command no agent can start: say so now, not after the first stage fails.
  const sandboxed = process.env.SDLC_CODEX_ENTRY ? null : sandboxProblem();
  if (sandboxed) throw ask(`drive: ${sandboxed}`, 'The person approves this same command to run outside the sandbox of Codex (the approval prompt of the command, or a session with full access). Then run it again.');
  if (opt.detach) return detachDrive({ pos, opt, projectRoot, slug, run, runDir });
  if (opt.resume && !existsSync(runDir)) throw redo(`drive: no earlier run ${run} in .scratch/wf/drive/`, 'Run drive again with no --resume to start a new run, or with the name of a run folder in .scratch/wf/drive/.');
  const args = driveArgs({ projectRoot, referenceRoot: REFERENCE_ROOT, slug, run, staged, slice, answered, delegate: Boolean(opt.delegate), reviewFindings: Boolean(opt['review-findings']), planAhead: !opt['no-plan-ahead'], verifyBehind: !opt['no-verify-behind'], pairSlices: Boolean(opt['pair-slices']) });
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
  const bools = ['delegate', 'review-findings', 'take-over'].filter((k) => opt[k]).map((k) => `--${k}`);
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
  // and the pull runs at a claim or take-over, at `records sync` and at `msg list`.
  const r = dispatch(loadRegistry(PLUGIN_ROOT), safe, diskFacts(projectRoot), { host: opt.host ?? null });
  const linked = linkedProject(projectRoot);
  const layer = layerOf(projectRoot);
  const target = linked || layer ? slugAtDispatch(projectRoot, r, safe) : null;
  // The folder of the workflow that the call names, status too: every reference path is in it.
  const wfSlug = slugAtDispatch(projectRoot, r, safe, { reads: true });
  r.wfDir = wfSlug ? workflowDir(projectRoot, wfSlug) : null;
  // One records line, or none when all is well: the owner of the workflow, the last
  // push, and the last flush of the GitHub layer.
  // A call of the MCP server only reads (SDLC_MCP_READ=1): no claim, no pull, no rebuild, nothing in the background.
  const readOnly = process.env.SDLC_MCP_READ === '1';
  const rec = recordsLine(projectRoot, { target: linked ? target : null, host: opt.host ?? null, claim: !readOnly });
  r.records = rec.line;
  // The registry is generated in the clone: a pull at the claim that moved a folder rebuilds it.
  if (rec.pulled) await reconcileIndex(projectRoot);
  // The open workflows whose branch is merged: the person is asked whether to close each one.
  // A PR answer older than the cache time is checked in the background, for the next call.
  const stale = [];
  r.closeAsk = closeCandidates(projectRoot, await scanWorkflowIndexes({ projectRoot }), { offline: true, stale });
  if (stale.length && !readOnly) closeCheckInBackground(projectRoot);
  // A repo with no .ai/ folder runs the setup before the key. Status and the router only read.
  r.firstRun = Boolean(r.key && r.key !== 'status' && needsSetup(projectRoot));
  // The queued GitHub edits and the person's comments on the issue of the workflow come in the
  // background, so the call does not wait on the network.
  if (!readOnly && layer && (target || readOutbox().length)) flushInBackground(target ? [projectRoot, target] : []);
  r.skillDir = SKILL_DIR;
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
  // The folder of the skill: a sub-agent gets it in its prompt, so it never searches for wf.mjs.
  lines.push(`skill-dir: ${r.skillDir}`);
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
  if (!verb || !root || !slug) throw usage('decide: <add|list|answered|end|tidy|hold|wait|drop|import> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw noFolder(`decide: no workflow folder ${dir}`, root);
  switch (verb) {
    case 'add': {
      if (opt.file) {
        // Every answer of a file in one call: [{ key, question, answer, by, kind, stage, slice, files }].
        const doc = JSON.parse(readFileSync(resolve(opt.file), 'utf8'));
        const list = Array.isArray(doc) ? doc : doc.answers ?? doc.decisions ?? [];
        if (!list.length) throw redo(`decide add: ${opt.file} holds no answers`, 'Write the answers into the file as a JSON array, or give one answer with --answer, then run decide add again.');
        const rows = list.map((a) => decideAdd(dir, a, { by: opt.by ?? null, stage: opt.stage ?? null, kind: opt.kind ?? null, cls: opt.class ?? null }));
        out(opt.json ? rows : rows.flatMap((r) => [decisionLine(r.entry), ...r.superseded.map((id) => `supersedes ${id}`), ...(r.settled ? [`settled ${r.entry.key}`] : [])]).join('\n'));
        return 0;
      }
      refuseNoteToDoneSlice(dir, { kind: opt.kind, slice: opt.slice });
      const r = addDecision(dir, {
        kind: opt.kind, key: opt.key, question: opt.question, answer: opt.answer, by: opt.by,
        scope: scopeOf(opt), stage: opt.stage, source: opt.source, class: opt.class,
        replaces: opt.replaces ? String(opt.replaces).split(',').map((s) => s.trim()).filter(Boolean) : [],
        rewrote: opt.rewrote ? String(opt.rewrote).split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      // Each record that names a superseded entry gets a marker that names the new one.
      const marked = markSuperseded(dir, r.superseded, r.entry.id);
      const settled = !['steer', 'note', 'settled'].includes(r.entry.kind) && settleQuestion(dir, r.entry.key);
      out(opt.json ? { ...r, marked, settled } : [decisionLine(r.entry), ...r.superseded.map((id) => `supersedes ${id}`), ...marked.map((n) => `marked ${n}`), ...(settled ? [`settled ${r.entry.key}`] : [])].join('\n'));
      return 0;
    }
    case 'list': {
      const all = decisionsOf(dir);
      let rows = opt.all ? all : liveDecisions(all, scopeOf(opt), { by: opt.by, kind: opt.kind });
      // --rules: the standing rules of the project come first, so one command gives an agent
      // every rule that binds it.
      let rules = opt.rules ? readRules(resolve(root)) : [];
      // --since <id>: only the entries that are newer, for an agent that reads the list again while it works.
      if (opt.since) {
        const num = (id) => Number(String(id ?? '').replace(/\D/g, '')) || 0;
        const mark = all.find((e) => e.id === opt.since)?.at ?? null;
        rows = rows.filter((e) => num(e.id) > num(opt.since));
        rules = mark ? rules.filter((r) => String(r.at ?? '') > String(mark)) : [];
      }
      if (opt.json) { out(opt.rules ? { rules, decisions: rows } : rows); return 0; }
      const lines = [...rules.map((r) => `RULE ${ruleLine(r)} (project rule)`), ...rows.map(decisionLine)];
      out(lines.length ? lines.join('\n') : opt.since ? `no entries after ${opt.since}` : 'no decisions');
      return 0;
    }
    case 'end': {
      if (!arg) throw usage('decide end: <id> is required');
      const e = endDecision(dir, arg, opt.reason);
      // Each record that names the entry says that it ended.
      const marked = markSuperseded(dir, [arg], 'ended');
      out(opt.json ? { ...e, marked } : [decisionLine(e), ...marked.map((n) => `marked ${n}`)].join('\n'));
      return 0;
    }
    case 'tidy': {
      // The roster says which slices are done: a steer or a note of a done slice has no reader left.
      const statusOf = Object.fromEntries(rosterOf(dir).map((s) => [s.slug, s.status]));
      const plan = opt.apply ? applyTidy(dir, statusOf) : tidyPlan(decisionsOf(dir), statusOf);
      if (opt.apply && plan.end.length) markSuperseded(dir, plan.end.map((r) => r.id ?? r), 'ended');
      if (opt.json) { out({ applied: Boolean(opt.apply), ...plan }); return 0; }
      const did = opt.apply ? '' : 'would be ';
      out([
        `${plan.end.length} ${did}ended: the steer or note of a slice that is complete, skipped or dropped`,
        `${plan.toNote.length} ${did}made a note: a steer that a build stage wrote for one open slice`,
        `${plan.review.length} for the person: live steers with no slice, or of an open slice (${plan.review.reduce((n, r) => n + r.chars, 0)} characters; ${plan.review.filter((r) => r.fromStage).length} written by a build stage)`,
        ...(opt.apply ? [] : ['Run the command again with --apply to make the first two changes. The third list changes only by decide end, decide add --replaces, or rule add.']),
        ...(opt.full ? plan.review.map((r) => `  ${r.id} ${String(r.at ?? '').slice(0, 10)} ${r.fromStage ? '(stage) ' : ''}${r.slice ? `[${r.slice}] ` : ''}${r.key ?? '(no key)'} — ${r.chars} characters`) : []),
      ].join('\n'));
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
      const talkActor = opt.stage ? actorOf(opt.stage, opt.slice) : null;
      const r = waitForAnswers(dir, {
        keys: String(opt.key ?? '').split(','), scope: scopeOf(opt),
        callMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : WAIT_CALL_MS,
        onStart: ({ until, questions }) => line('waiting', { keys: questions.map((q) => q.key), until: new Date(until).toISOString() }),
        // A message of another agent for the stage that waits ends this call: the stage reads it, then waits on.
        interrupt: talkActor ? () => { const u = unreadFor(readTalk(dir), talkActor); return u.messages.length || u.pings.length ? u : null; } : null,
        onEnd: ({ state }) => line('wait-end', { state }),
      });
      if (r.interrupt?.messages.length) markRead(dir, talkActor, r.interrupt.messages.map((m) => m.id));
      if (r.interrupt?.pings.length) markSeen(dir, talkActor);
      out(opt.json ? r : [
        ...(r.interrupt ? [...r.interrupt.messages.map((m) => `message: ${messageLine(m, { full: true })}`), ...r.interrupt.pings.map((p) => `PING about ${p.of} of ${p.from}: "${p.text}" — it is urgent now. Answer it before you wait on.`), 'A message informs or requests; it does not bind. Act on each one or reply with your reason (talk reply), then:'] : []),
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

/** A line of the driver journal for a wait of the talk: the watch reads that the agent waits. */
function talkJournal(projectRoot, slug, stage, slice, event, fields) {
  const journal = journalPath(projectRoot, slug);
  const who = waitingAgent(journal, ['session', 'driver'].includes(stage) ? null : stage, slice && slice !== 'slug-wide' ? slice : null);
  appendJournalLine(journal, null, { ...who, event, fields: JSON.stringify(fields) });
}

// ---------------------------------------------------------------- step


export function runStep(pos, opt) {
  const [verb, root, slug, slice, n] = pos;
  if (!verb || !root || !slug) throw usage('step: <start|done|stop|retry|complete|check|where> <root> <slug> are required');
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
  if (verb === 'check') {
    const refused = sliceRefusal(dir, slug, slice);
    if (refused) throw refuse(`step check: ${refused}`, agentFix('Run the command again with a slice that the error names.'));
    const planBody = planDocOf(dir, slice)?.body ?? '';
    // With no --name: the checks of the slice and what still blocks its end.
    if (!opt.name) {
      const st = sliceCheckState(dir, slice, { checkout, planBody });
      const rows = checksOf(dir, slice);
      if (opt.json) { out({ checks: rows, ...st }); return st.blocking.length ? 1 : 0; }
      out([...(rows.length ? rows.map(checkLine) : ['no check is recorded']), ...st.blocking.map((b) => `blocks the end of the stage: ${b}`), ...(st.unmet.length ? [`${st.unmet.length} not met: verify rules on each one`] : [])].join('\n'));
      return st.blocking.length ? 1 : 0;
    }
    // A check passes by an exit code that wf saw: of a job of this run (--job), or of a command that wf runs here (--run).
    const endedJob = (id, flag) => {
      const j = jobState(projectRoot, slug, id);
      if (j.state !== 'done' || j.stopped || j.timedOut || j.exit == null) throw refuse(`step check: the job ${id} has no exit code (${j.state === 'done' ? (j.stopped ? 'stopped' : 'ended at its time limit') : j.state})`, agentFix(`Wait for the end of the job with talk wait --job ${id}, then run step check again with ${flag} ${id}. A job that was stopped proves nothing: start the check again.`));
      if (!j.head) throw refuse(`step check: the job ${id} did not run in a git checkout`, agentFix('Start the check with talk job --cwd <the checkout>, then run step check again.'));
      return j;
    };
    let proof = null;
    let sha = opt.sha;
    let result = opt.result;
    if (opt.job) {
      const j = endedJob(opt.job, '--job');
      if ((j.dirty ?? []).some((f) => !isProse(f))) throw refuse(`step check: the job ${opt.job} ran on code that was not committed (${j.dirty.filter((f) => !isProse(f)).slice(0, 3).join(', ')})`, agentFix('Commit the work of the slice, run the check again, and record that run.'));
      proof = { by: 'job', id: j.id, exit: j.exit, log: j.log, command: j.command };
      sha = j.head;
      result = j.exit === 0 ? 'met' : 'not-met';
    } else if (opt.run) {
      const before = gitRevParse(checkout, 'HEAD');
      const logDir = join(runRoot(projectRoot), SUITE_LOG_DIR);
      mkdirSync(logDir, { recursive: true });
      const log = join(logDir, `check-${String(opt.name).replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 40)}-${Date.now()}.log`);
      const r = spawnSync(String(opt.run), { cwd: checkout, shell: true, encoding: 'utf8', windowsHide: true, timeout: 8 * 60_000, maxBuffer: 64 * 1024 * 1024 });
      writeFileAtomic(log, `${r.stdout ?? ''}${r.stderr ?? ''}`);
      if (r.error?.code === 'ETIMEDOUT' || r.status == null) throw refuse('step check: the command did not end in 8 minutes', agentFix('A longer check is a job: start it with talk job, wait with talk wait --job, then run step check again with --job <its id>.'));
      proof = { by: 'run', exit: r.status, log, command: String(opt.run) };
      sha = before;
      result = r.status === 0 ? 'met' : 'not-met';
    }
    const row = addCheck(dir, { slice, name: opt.name, result, sha, required: !opt.optional, note: opt.note, carriedFrom: opt['carried-from'], proof, base: opt['base-job'] ? endedJob(opt['base-job'], '--base-job') : null }, {
      resolve: (name) => gitRevParse(checkout, name),
      isAncestor: (base, tip) => spawnSync('git', ['-C', checkout, 'merge-base', '--is-ancestor', base, tip], { windowsHide: true }).status === 0,
    });
    out(opt.json ? row : [checkLine(row), ...(proof && proof.exit !== 0 ? [`output: ${proof.log}`] : [])].join('\n'));
    return 0;
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
    // A step that was committed before its start row was written: the commit is new since the last done step, so it is the commit of this step.
    const lastDone = current.filter((r) => r.event === 'done' && r.step !== step && r.sha).at(-1)?.sha ?? null;
    const committedEarly = Boolean(lastDone) && lastDone !== s;
    if (start?.head && start.head === s && !committedEarly) throw refuse(`step done: ${s.slice(0, 8)} is the HEAD at the start of step ${step}, so the step made no commit. Commit the step first, or run step done with --no-change when the step changed no file`, agentFix('Commit the step, then run step done with --sha HEAD.', commitThenDone));
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
    // A stop that waits on the person is a question, whatever kind the caller gave: it does not count toward the split.
    stop: () => ({ slice, event: 'hard-stop', reason: opt.reason ?? null, kind: stopKind(opt.kind, opt.reason, { held: heldQuestions(dir).some((q) => !q.slice || q.slice === slice) }) }),
    retry: () => ({ slice, event: 'retry' }),
    complete,
  };
  if (!rows[verb]) throw usage(`step: unknown verb ${verb}`);
  // Three fix rounds that left a slice check failing: a fourth is not a fix, the plan is wrong.
  if (verb === 'start') {
    const all = readSteps(dir).filter((r) => r.slice === slice);
    const lastEnd = all.map((r, i) => (r.event === 'complete' || r.event === 'retry' ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
    const runStart = all.slice(lastEnd + 1).find((r) => r.event === 'start')?.at ?? null;
    const rounds = runStart ? fixRounds(dir, slice, runStart) : 0;
    if (rounds >= MAX_FIX_ROUNDS) throw refuse(`step start: route back: ${rounds} fix rounds of ${slice} left a slice check failing (the limit is ${MAX_FIX_ROUNDS})`, agentFix('Stop the implement with step stop --reason "three fix rounds failed", and route back to plan with what the checks showed.', again('stop', slice, ' --reason "three fix rounds failed"')));
  }
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
  // A stop request of the person after a step (control stop --after step) ends the stage after this
  // step: the agent reads `next` and returns, and the driver ends the run cleanly. A stop after the
  // current agent does not cut the agent short.
  let stop = null;
  if (verb === 'done') {
    try { const c = stopCheck(projectRoot, slug); if (c.stop && c.request?.after === 'step') stop = c.reason; } catch { stop = null; }
  }
  const stopNext = stop ? `stop requested (${stop}): end the stage now. Record where it stands, do not start step ${Number(line.step) + 1}, and return.` : null;
  out(opt.json ? { ...line, ...(stopNext ? { next: stopNext } : {}) } : [`${line.event} ${slice}${line.step ? ` step ${line.step}` : ''}${line.sha ? ` ${line.sha.slice(0, 8)}` : ''}${line.noChange ? ' (no change)' : ''}${line.kind && line.kind !== 'fail' ? ` (${line.kind})` : ''}`, ...(stopNext ? [`next: ${stopNext}`] : [])].join('\n'));
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
    markBusy(projectRoot, `the ${a} suite`);
    let r;
    try { r = runSuiteLogged(projectRoot, a, suite.command); } finally { markBusy(projectRoot, null); }
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const pass = r.status === 0;
    const head = pass ? spawnSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || null : null;
    // A time that cannot be recorded is a warning: the suite ran, and its result stands.
    // What went into the profile, so a reader needs no profile show after the run.
    let recorded = null;
    if (!r.error) {
      try { const e = recordRun(projectRoot, a, seconds, { passedAt: head }); recorded = { measuredSeconds: e.measuredSeconds, measuredAt: e.measuredAt }; } catch (e) { process.stderr.write(`wf.mjs: the time of the ${a} suite was not recorded: ${e.message}\n`); }
    }
    const budget = readBudget(profile);
    if (overLongBudget(profile, seconds)) {
      process.stderr.write(`WARNING: the ${a} suite took ${seconds}s, over the long-run budget of ${budget.long}s. Before the next run, offer the faster paths of _long-runs.md: run the touched part, a pilot, a sample, a split, or the packet end.\n`);
    }
    out(opt.json
      ? { suite: a, command: suite.command, seconds, pass, exit: r.status, log: r.log, ...(r.tail ? { tail: r.tail } : {}), ...(head ? { passedAt: head } : {}), recorded }
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
        // The commit of a fix is a commit of this repo.
        let commit = opt.commit ?? null;
        const repo = b === 'fixed' && commit ? stepCheckout(resolve(root)) : null;
        if (repo && gitRevParse(repo, 'HEAD')) {
          const full = gitRevParse(repo, `${commit}^{commit}`);
          if (!full) throw refuse(`findings set: ${commit} is not a commit of this repo`, agentFix('Run findings set again with --commit <the sha of the fix commit>, as git log shows it.'));
          commit = full;
        }
        const entry = setStatus(now, a, b, opt.reason ?? null, { commit, decision: opt.decision ?? null });
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
      const results = drafts.map((p) => putChecked(dir, p, { root: resolve(root) }));
      // A put that refused one draft exits 1, and the drafts that it did put still get the
      // follow-up of a change (the INDEX.md row, the records commit): main reads this mark.
      opt.landed = results.some((r) => !r.errors.length);
      const ev = pruneEvidence(dir);
      out(opt.json ? { results, pruned: ev.pruned } : results.map((r) => (r.errors.length
        ? `refused ${r.name}: ${r.errors.join('; ')}`
        : [`put ${r.name} → ${r.file}${r.section ? `#${r.section}` : ''}`, ...(r.warnings ?? []).map((w) => `warning: ${w}`)].join('\n'))).concat(ev.pruned.map((p) => `pruned evidence ${p}`)).join('\n'));
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
      // An implement ends only when each required slice check ran on the code that the slice ends with.
      let unmet = [];
      if (stage === 'implement' && slice && (opt.status ?? 'complete') === 'complete') {
        const st = sliceCheckState(dir, slice, { checkout: stepCheckout(resolve(root)), planBody: planDocOf(dir, slice)?.body ?? '' });
        if (st.blocking.length) {
          throw refuse(`record stage-done: the implement of ${slice} is not complete: ${st.blocking.join('; ')}`,
            agentFix('Run each check that is named on the code as it is now, and record its result with step check --sha HEAD. A check that cannot run here is recorded with --result not-run only when the plan marks it optional (--optional). Then run record stage-done again.', `wf.mjs step check ${word(root)} ${word(slug)} ${word(slice)}`));
        }
        unmet = st.unmet;
      }
      // A review ends only when each BLOCKER finding has an outcome in the ledger.
      if (stage === 'review' && (opt.status ?? 'complete') === 'complete') {
        const open = readLedger(dir).findings.filter((f) => f.source === 'review' && f.severity === 'BLOCKER' && f.status === 'open' && (!slice || (f.slice ?? null) === null || f.slice === slice));
        if (open.length) throw refuse(`record stage-done: the review has ${open.length} BLOCKER finding${open.length === 1 ? '' : 's'} with no outcome: ${open.map((f) => f.id).join(', ')}`, agentFix('Fix each one and record it with findings set <id> fixed --commit <sha>. When a fix cannot be made, record findings set <id> could-not-fix --reason "<why>" and return it in couldNotFixBlockers.'));
      }
      // A verify passes only on the code that its checks ran on, and an accept names who accepted.
      if (stage === 'verify' && slice) {
        const g = verifyGate(dir, slice, { checkout: stepCheckout(resolve(root)), planBody: planDocOf(dir, slice)?.body ?? '' });
        if (g.blocking.length) throw refuse(`record stage-done: the verify of ${slice} cannot end as it is: ${g.blocking.join('; ')}`, agentFix(g.fix));
      }
      const changes = stageDone(dir, slug, stage, slice ?? null, { next: opt.next ?? null, status: opt.status ?? null });
      // A slug-wide review names the commit it cleared, so a later run that built nothing does not review it again.
      if (stage === 'review' && !slice && (opt.status ?? 'complete') === 'complete' && frontmatterOfDoc(dir, '07-review.md')) {
        const head = gitRevParse(stepCheckout(resolve(root)), 'HEAD');
        const fm = frontmatterOfDoc(dir, '07-review.md');
        if (head && fm['reviewed-head'] !== head) setFields(dir, '07-review.md', { 'reviewed-head': head, ...(fm['updated-at'] ? { 'updated-at': fm['updated-at'] } : {}) });
      }
      // The drafts that were put in this stage are kept until here, for a second edit.
      for (const h of new Set([join(localWorkflowsRoot(resolve(root)), slug), dir])) clearKept(h, { slice: slice ?? null });
      // An implement stage of a project with no suite for implement gets the receipt that says so.
      const none = stage === 'implement' && slice ? noSuiteReceipt(resolve(root), dir, slice, { now: nowIso() }) : null;
      const receipt = none?.result === 'none' ? `; receipt: none (${NO_SUITE})` : '';
      const unmetText = unmet.length ? `; ${unmet.length} check(s) not met go to verify: ${unmet.map((c) => c.name).join(', ')}` : '';
      out(opt.json ? { ...changes, ...(receipt ? { receipt: `none (${NO_SUITE})` } : {}), ...(unmet.length ? { unmetChecks: unmet } : {}) } : `${stage}${slice ? ` ${slice}` : ''} done: progress.${stage}=${changes[`progress.${stage}`]}; next ${changes['next-invocation']}${receipt}${unmetText}`);
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
      writeFileAtomic(path, `---\n${stringifyYaml(doc.frontmatter ?? {})}\n---\n${doc.body ?? ''}`);
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
      const r = editRecord(dir, n, change, { slug, root: resolve(root) });
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
      // The fields that are worked out from the records are worked out again: a count kept by hand is corrected.
      const derived = deriveWorkflow(dir);
      const show = (v) => (v === null || v === undefined ? 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      const lines = derived.map((d) => (d.fields ? `derived ${d.record}: ${Object.entries(d.fields).map(([k, [a, b]]) => `${k} ${show(a)} → ${show(b)}`).join(', ')}` : `derived ${d.record}: in step with the roster`));
      out(opt.json ? { ...r, derived } : [...r.moved.map((m) => `moved ${m.from} → ${m.to}`), ...r.kept.map((k) => `kept ${k}`), ...lines].join('\n') || 'nothing to move');
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
  if (verb === 'leftovers') {
    if (!root || !slug) throw usage('worktree: leftovers <root> <slug> are required');
    const branches = leftoverBranches(resolve(root), slug);
    out(opt.json ? { branches } : branches.length ? branches.map((b) => `${b.branch}: ${b.ahead} commit${b.ahead === 1 ? '' : 's'} that HEAD does not have`).join('\n') : 'no side branch holds work that HEAD does not have');
    return 0;
  }
  throw usage('worktree: <add|remove|leftovers> is required');
}

function runRule(pos, opt) {
  const [verb, root, key] = pos;
  if (!['add', 'list', 'end', 'candidates', 'adopt'].includes(verb) || !root) throw usage('rule: <add|list|end|candidates|adopt> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'list') {
    const rules = readRules(projectRoot);
    out(opt.json ? rules : rules.length ? rules.map(ruleLine).join('\n') : 'no rules');
    return 0;
  }
  if (verb === 'candidates') {
    const c = ruleCandidates(projectRoot);
    out(opt.json ? c : c.length ? c.map((g) => `in ${g.workflows} workflows: ${g.entries[0].slug}:${g.entries[0].id} [${g.key ?? 'no key'}] ${g.text.slice(0, 160)}`).join('\n') : 'no steer repeats in 3 or more workflows');
    return 0;
  }
  if (verb === 'adopt') {
    if (!opt.from) throw usage('rule adopt: --from <slug>:<id> is required');
    const r = adoptRule(projectRoot, { from: opt.from, key: opt.key ?? null });
    out(opt.json ? r : `added ${ruleLine(r.rule)}\nended ${r.ended.length} steer(s) that said the same in ${new Set(r.ended.map((e) => e.slug)).size} workflow(s)`);
    return 0;
  }
  if (verb === 'add') {
    const r = addRule(projectRoot, { key: opt.key ?? key ?? null, text: opt.text });
    out(opt.json ? r : `${r.replaced ? 'replaced' : 'added'} ${ruleLine(r.rule)}`);
    return 0;
  }
  const r = endRule(projectRoot, key, opt.reason);
  out(opt.json ? r : `ended ${ruleLine(r)}`);
  return 0;
}

function runSliceFiles(pos, opt) {
  const [root, slug, a, b] = pos;
  if (!root || !slug || (a && !b)) throw usage('slice-files: <root> <slug> are required, with no slice or with two slices');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw noFolder(`slice-files: no workflow folder ${dir}`, root);
  if (a) {
    const p = pairOf(dir, a, b);
    out(opt.json ? p : !p.known ? `${a} or ${b} has no file list` : p.shared.length ? `${a} and ${b} share: ${p.shared.join(', ')}` : `${a} and ${b} share no file`);
    return 0;
  }
  const r = orderReport(dir);
  out(opt.json ? r : orderText(r));
  return 0;
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
      const tasks = gaps.map((g) => ({ id: `${TASK_PREFIX}${g.code}`, task: g.task, needed: 'ship', at: nowIso() }));
      updateFields(join(wfRoot(projectRoot), slug), INDEX_NAME, (fm) => {
        const kept = (Array.isArray(fm['person-tasks']) ? fm['person-tasks'] : []).filter((t) => !String(t?.id ?? '').startsWith(TASK_PREFIX));
        fm['person-tasks'] = [...kept, ...tasks];
      });
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
    // The merge checks the facts of the workflow in code: the stage does not certify them by its word.
    const wfDirOf = join(wfRoot(projectRoot), slug);
    const stops = [];
    if (verdictOf(readLedger(wfDirOf)) === 'dont-ship') stops.push('the findings ledger says dont-ship: a BLOCKER finding is open');
    const ready = frontmatterOfDoc(wfDirOf, '08-handoff.md')?.['pr-readiness-verdict'];
    if (ready && !['ready', 'not-applicable'].includes(String(ready))) stops.push(`the handoff record says pr-readiness-verdict: ${ready}`);
    const openDef = openDeferrals(wfDirOf);
    if (openDef.length) {
      // An open deferral ships only with the word of the person: --override names that answer in the decision store.
      const over = opt.override ? liveDecisions(decisionsOf(wfDirOf)).find((e) => e.id === opt.override && e.by === 'person') : null;
      if (!over) stops.push(`${openDef.length} runtime-evidence deferral${openDef.length === 1 ? ' is' : 's are'} open (${openDef.map((d) => d.ac ?? d.id ?? d.slice ?? '?').slice(0, 4).join(', ')})`);
    }
    if (stops.length) throw refuse(`ship merge: ${slug} is not ready to merge: ${stops.join('; ')}`, agentFix('Clear each one: fix the BLOCKER findings, run the handoff again, and clear each deferral with its probe (wf.mjs deferrals check). When the person decides to ship with an open deferral, record that answer with decide add --by person and run ship merge again with --override <its id>.'));
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
  if (verb === 'join') {
    if (!root) throw usage('records join: <url> is required');
    const { checkStore, joinRecords } = await import('../lib/records-join.mjs');
    const { composeOn } = await import('../lib/records-compose.mjs');
    const { composeNow } = await import('../lib/records-sync.mjs');
    const j = joinRecords(root, { home: recordsHome(), cloud: Boolean(opt.cloud), project: opt.project ?? null });
    if (!j.ok) { if (opt.json) out(j); else out(`not joined: ${j.reason}`); return 1; }
    const store = await checkStore();
    const sync = composeOn() ? composeNow(j.home) : null;
    const r = { ...j, store, sync: sync ? { ok: sync.ok, pushed: sync.pushed, error: sync.error } : null };
    if (opt.json) { out(r); return store.ok && (!sync || sync.ok) ? 0 : 1; }
    out([
      `joined as ${j.machine} in ${j.home}${j.sparse ? ` (sparse: ${j.sparse.join(', ')})` : ''}`,
      store.store ? (store.ok ? `image store: ${store.store}` : `image store ${store.store} fails: ${store.why}`) : 'image store: none; images stay in git',
      ...(sync ? [sync.ok ? 'first sync: done' : `first sync failed: ${sync.error}`] : []),
      'Next: wf.mjs records link <root> in each product repo; the map finds its project.',
    ].join('\n'));
    return store.ok && (!sync || sync.ok) ? 0 : 1;
  }
  if (verb === 'images') {
    const projectRoot = resolve(root ?? '.');
    const project = linkedProject(projectRoot);
    if (!project) { out(opt.json ? {} : 'records: local; images stay in the project'); return 0; }
    const home = recordsHome();
    const { imagesConfig, imageFiles, readRef, fetchImagesSync } = await import('../lib/records-images.mjs');
    const cfg = imagesConfig();
    const files = imageFiles(home, project);
    const waiting = files.filter((f) => !readRef(join(home, ...f.split('/'))));
    const fetched = opt.fetch ? fetchImagesSync([join(home, project)], { machine: machineName() }) : null;
    const r = { store: cfg ? `${cfg.endpoint}/${cfg.bucket}` : null, images: files.length, waiting: waiting.length, ...(fetched ? { fetched: fetched.fetched?.length ?? 0, local: fetched.local ?? [], failed: fetched.failed ?? [], error: fetched.error } : {}) };
    if (opt.json) { out(r); return fetched?.failed?.length || fetched?.error ? 1 : 0; }
    out([
      r.store ? `store: ${r.store}` : 'store: none (records.images is not set): images stay in git',
      `${r.images} image(s) in ${project}; ${r.waiting} without a reference${cfg ? ' (they go at the next sync)' : ''}`,
      ...(fetched ? [`fetched ${r.fetched}`, ...r.local.map((l) => `on ${l.machine} only: ${l.file}`), ...r.failed.map((f) => `cannot fetch ${f.file}: ${f.why}`), ...(r.error ? [`the fetch stopped: ${r.error}`] : [])] : []),
    ].join('\n'));
    return fetched?.failed?.length || fetched?.error ? 1 : 0;
  }
  if (verb === 'rewrite') {
    const [, step, dir] = pos;
    const home = recordsHome();
    if (!existsSync(join(home, '.git'))) throw refuse(`no records clone at ${home}: a rewrite needs the clone of the records repo`, agentFix('Run it on the computer that holds the records clone (wf.mjs records status).'));
    const rw = await import('../lib/records-rewrite.mjs');
    const archives = [opt.archive ?? []].flat().map(String);
    if (step === 'list') {
      const l = rw.listHistory(home);
      if (opt.json) { out(l); return 0; }
      const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
      out([`images and video: ${l.images.count} file(s), ${mb(l.images.bytes)}`, `other files: ${l.other.count}, ${mb(l.other.bytes)}`, `archives: ${l.archives.length}`, ...l.archives.slice(0, 200).map((a) => `  ${mb(a.bytes)}  ${a.path}`)].join('\n'));
      return 0;
    }
    if (step === 'check') {
      const problems = rw.checkQuiet(home);
      out(opt.json ? problems : problems.length ? problems.join('\n') : 'the clone is quiet');
      return problems.length ? 1 : 0;
    }
    if (step === 'export') {
      const r = await rw.exportImages(home);
      out(opt.json ? r : `${r.uploaded.length} design image(s) sent, ${r.local.length} evidence image(s) kept on this computer (${r.keptLocal} copied into the cache), ${r.failed.length} failed`);
      return r.failed.length ? 1 : 0;
    }
    if (!dir) throw usage(`records rewrite ${step ?? '<step>'}: <dir> is required`);
    if (step === 'backup') {
      const r = rw.backupBundle(home, resolve(dir));
      out(opt.json ? r : `bundle: ${r.bundle}\nrestored and compared: HEAD tree ${r.tree}`);
      return 0;
    }
    if (step === 'mirror') {
      const r = await rw.rewriteMirror(home, resolve(dir), { archives });
      out(opt.json ? r : `mirror: ${r.mirror}\ncommit map: ${r.map}\n${r.dropped} path line(s) dropped`);
      return 0;
    }
    if (step === 'verify') {
      const problems = rw.verifyMirror(home, join(resolve(dir), 'mirror.git'), { archives });
      out(opt.json ? problems : problems.length ? problems.join('\n') : 'the mirror passes: fsck, the same files at HEAD, no removed path in a commit');
      return problems.length ? 1 : 0;
    }
    throw usage('records rewrite: the step is list, check, backup, export, mirror or verify');
  }
  if (verb === 'parked') {
    const [, sub, r0, branch, path] = pos;
    const known = ['show', 'take', 'drop'];
    const at = known.includes(sub) ? sub : null;
    const home = recordsHome();
    const where = at ? r0 : sub;
    if (where && !linkedProject(resolve(where))) { out(opt.json ? [] : 'records: local; no parked copy'); return 0; }
    if (!at) {
      const list = listParked(home);
      out(opt.json ? list : list.length ? list.map((p) => `${p.branch}${p.mine ? ' (this computer)' : ''}`).join('\n') : 'records: no parked copy');
      return 0;
    }
    if (!r0 || !branch) throw usage(`records parked ${at}: <root> <branch> are required`);
    if (at === 'show') {
      const files = showParked(branch, home);
      out(opt.json ? files : files.length ? files.map((f) => `${f.status} ${f.path}`).join('\n') : `${branch} holds nothing that the remote lacks`);
      return 0;
    }
    if (at === 'take') {
      if (!path) throw usage('records parked take: <root> <branch> <path> are required');
      takeParked(resolve(r0), branch, path, home);
      out(`took ${path} from ${branch}; the records sync sends it`);
      return 0;
    }
    dropParked(branch, home);
    out(`dropped ${branch}`);
    return 0;
  }
  if (['claim', 'take', 'release', 'decline'].includes(verb)) {
    if (!root || !arg) throw usage(`records ${verb}: <root> <slug> are required`);
    const projectRoot = resolve(root);
    // The answer no to a claim or take-over question of the dispatch: the key does not run here.
    if (verb === 'decline') { out(`${arg}: not run on this computer; another computer may write it`); return 1; }
    const r = verb === 'release' ? releaseWorkflow(projectRoot, arg, { to: opt.to ?? null }) : claimWorkflow(projectRoot, arg, { take: verb === 'take' });
    if (r.ok && verb !== 'release') await reconcileIndex(projectRoot);
    if (opt.json) { out(r); return r.ok ? 0 : 1; }
    if (r.linked === false) { out('records: local; no owner'); return 0; }
    if (r.ok) {
      if (r.warning) process.stderr.write(`wf.mjs: ${r.warning}\n`);
      out(verb === 'release' ? `${arg}: ${r.owner ? `handed to ${r.owner.machine}` : 'released'}` : `${arg}: owned by ${r.owner.machine}${r.already ? '' : ` (epoch ${r.owner.epoch})`}${r.took ? `, taken over from ${r.took.machine}` : ''}`);
      return 0;
    }
    if (r.owned) {
      out(`${arg}: owned by ${r.owned.machine}${r.facts?.lastPush ? `, last sent at ${r.facts.lastPush}` : ''}${r.facts?.stage ? `, at the stage ${r.facts.stage}` : ''}`);
      printFix(personFix(`Another computer owns ${arg}. Ask the person; after a yes, take it over with wf.mjs records take.`, `wf.mjs records take ${word(root)} ${word(arg)}`));
      return 1;
    }
    out(`not done: ${r.reason}`);
    if (r.fix) printFix(r.fix);
    return 1;
  }
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
    let name = arg;
    // A fresh checkout finds its project in the map: the remote of the product repo in the facts of the computers.
    if (!name) {
      const { productRemote, projectsForRemote } = await import('../lib/records-join.mjs');
      const found = projectsForRemote(recordsHome(), productRemote(projectRoot));
      if (found.length !== 1) throw usage(found.length ? `records link: the remote of this repo belongs to ${found.join(', ')}; give the project` : 'records link: <project> is required: no project of the records has the remote of this repo');
      name = found[0];
    }
    const r = linkProject(projectRoot, name);
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
  if (verb === 'flush') {
    const project = linkedProject(projectRoot);
    if (!project) { out(opt.json ? { landed: true, linked: false } : 'records: local in .ai/workflows/, nothing to send'); return 0; }
    const f = flushRecords({ project, slug: arg ?? null });
    out(opt.json ? { landed: f.landed, reason: f.reason } : f.landed ? `records: sent${arg ? ` ${arg}` : ''}` : `records: not sent: ${f.reason}`);
    if (!f.landed && !opt.json) printFix(personFix('Read the reason above (no network, a refused push, or a workflow that another computer owns), then run wf.mjs records flush again.'));
    return f.landed ? 0 : 1;
  }
  if (verb === 'retry') {
    // The answer yes to a records question of the dispatch: the commit of the workflow again,
    // then the push and the flush in the background. The next /wf call shows their result.
    const linked = linkedProject(projectRoot);
    const done = [];
    if (linked && arg) {
      const c = commitWorkflow(projectRoot, arg, `${linked}/${arg}: the records commit again`);
      if (!c?.commit) { out(`the records commit of ${arg} failed again; wf.mjs records status "${projectRoot}" --problems`); return 1; }
      done.push(c.commit === SAVED ? `saved ${arg}; the records sync sends it` : `committed ${arg}; the push runs in the background`);
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
    out(opt.json ? r : r.pushed ? 'pushed' : `not pushed: ${r.reason ?? (r.offline ? 'offline' : 'unknown')}`);
    return r.pushed ? 0 : 1;
  }
  if (!arg) throw usage(`records ${verb}: <slug> is required`);
  if (verb === 'close') {
    const r = closeRecords(projectRoot, arg);
    // A close that is not sent stays owned by this computer: another one must not continue without this work.
    if (r?.ok && !r.sent) r.fix = agentFix('The workflow is closed on this computer and its push failed, so this computer still owns it. Send it when the remote can be reached.', `wf.mjs records flush ${word(root)} ${word(arg)}`);
    out(opt.json ? r : !r ? 'records: local' : !r.ok ? r.reason : r.sent ? `closed ${arg}${r.pushed ? '' : `; not pushed: ${r.reason ?? 'offline'}`}` : `closed ${arg}, not sent: ${r.reason ?? 'offline'}`);
    if (r?.fix && !opt.json) printFix(r.fix);
    return !r || (r.ok && r.sent) ? 0 : 1;
  }
  throw usage(`records: unknown verb ${verb}`);
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
  record: ['put', 'set', 'edit', 'stage-done', 'migrate'], slice: ['drop', 'move', 'add', 'carry', 'split', 'merge'], issue: ['place'], board: ['add', 'move', 'regroup', 'remove', 'apply', 'set', 'prose', 'render', 'adopt'], page: ['put'], progress: ['set'], decide: ['add', 'hold'], findings: ['add', 'set'], ship: ['ready', 'finish'], step: ['start', 'done', 'complete', 'stop'], design: ['approve', 'migrate'],
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


/** Every CLI form and every library function, each with its text and its example. */
export function describeAll() {
  const entry = (b) => ({
    name: b.name,
    form: b.lines[0],
    about: b.lines.slice(1).filter((l) => !/^\s*Example:/.test(l)).map((l) => l.trim()).join(' '),
    example: b.lines.find((l) => /^\s*Example:/.test(l))?.replace(/^\s*Example:\s*/, '') ?? null,
  });
  return { cli: headerBlocks(fileURLToPath(import.meta.url)).map(entry) };
}

function describeText(d) {
  const block = (e) => [e.form, `    ${e.about}`, ...(e.example ? [`    Example: ${e.example}`] : [])].join('\n');
  return [
    'CLI: wf.mjs <command> ... (one record or one decision)',
    ...d.cli.map(block),
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
// A report about wf itself: filed by an agent, triaged by the code, decided by the person.
async function reportCmd(pos, opt) {
  const [verb, a, b, c] = pos;
  const verbs = ['add', 'list', 'show', 'decide', 'built'];
  if (!verbs.includes(verb)) throw usage(`report: one of ${verbs.join(', ')}`);
  const findGroup = (id) => reportGroups(readReports()).find((g) => g.id === id || g.sightings.some((s) => s.id === id));
  if (verb === 'add') {
    if (!a) throw usage('report add: <root> is required (the project the report comes from)');
    const projectRoot = resolve(a);
    const { allOps } = await import('../lib/ops/forms.mjs');
    const areas = [...allOps().keys(), 'intake', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'ship', 'retro', 'yolo', 'campaign', 'orchestrate', 'probe', 'brainstorm'];
    const version = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
    const context = { project: basename(projectRoot), root: projectRoot, ...(b ? { slug: b } : {}), ...(opt.stage ? { stage: String(opt.stage) } : {}), version, by: callerActor() ?? 'session' };
    let r;
    try {
      r = addReport({ kind: opt.kind, title: opt.title, body: opt.body, severity: opt.severity, area: opt.area, command: opt.command, error: opt.error, context }, { areas });
    } catch (e) { throw refuse(`report add: ${e.message}`, agentFix('Give --kind, a one-line --title and a --body that says what you did, what happened, what you expected, and the workaround you used.')); }
    const g = r.group;
    const seen = r.report.triage.duplicateOf ? `a sighting of ${g.id} (seen ${g.count} times)` : 'a new report';
    const told = g.built ? `; it was built in ${g.built.commit.slice(0, 8)}${g.built.release ? ` (${g.built.release})` : ''}: this wf may be older than that` : g.decision ? `; the person decided ${g.decision.decision}${g.decision.note ? `: ${g.decision.note}` : ''}` : '';
    out(opt.json ? { id: r.report.id, group: g.id, duplicateOf: r.report.triage.duplicateOf ?? null, triage: r.report.triage, state: g.state, decision: g.decision, built: g.built, next: 'Go on with your work: the person decides on the report later.' }
      : `${r.report.id}: ${seen}, ${r.report.triage.area}, ${r.report.triage.severity}${told}. Go on with your work.`);
    return 0;
  }
  if (verb === 'list') {
    const state = String(opt.state ?? 'new');
    const all = reportGroups(readReports());
    const list = state === 'all' ? all : all.filter((g) => g.state === state);
    out(opt.json ? { dir: reportsDir(), groups: list.map(({ report, sightings, ...g }) => ({ ...g, sightings: sightings.map((s) => s.id) })) } : list.length ? list.map(groupLine).join('\n') : `no ${state === 'all' ? '' : `${state} `}reports in ${reportsDir()}`);
    return 0;
  }
  if (!a) throw usage(`report ${verb}: <id> is required`);
  if (verb === 'show') {
    const g = findGroup(a);
    if (!g) throw refuse(`report show: no report ${a}`, agentFix('List the reports with report list --state all.'));
    out(opt.json ? g : [groupLine(g), '', g.report.body, ...(g.report.command ? ['', `command: ${g.report.command}`] : []), ...(g.report.error ? [`error: ${g.report.error}`] : []), ...g.sightings.map((s) => `\n${s.id} ${s.at} ${s.context?.project ?? ''}: ${s.title}\n${s.body}`), ...(g.decision ? ['', `decided ${g.decision.decision} ${g.decision.at}${g.decision.note ? `: ${g.decision.note}` : ''}`] : [])].join('\n'));
    return 0;
  }
  if (verb === 'decide') {
    personOnly('decide what to build');
    if (!REPORT_DECISIONS.includes(b)) throw usage(`report decide: <id> ${REPORT_DECISIONS.join('|')}`);
    let d;
    try { d = decideReport(a, b, { note: opt.note }); } catch (e) { throw refuse(`report decide: ${e.message}`, agentFix('List the reports with report list --state all.')); }
    out(opt.json ? d : `${d.id}: ${d.decision}${d.note ? ` (${d.note})` : ''}`);
    return 0;
  }
  let sha = opt.commit;
  if (sha === 'HEAD' || sha === true) sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || null;
  let d;
  try { d = builtReport(a, { commit: sha, release: opt.release, note: opt.note }); } catch (e) { throw refuse(`report built: ${e.message}`, agentFix('Name the commit that built it with --commit <sha>.')); }
  out(opt.json ? d : `${d.id}: built in ${d.commit.slice(0, 8)}`);
  return 0;
}

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
      answer: cmd === 'decide' && pos[0] === 'add' && opt.answer && ['answer', 'approval', 'try-out', 'delegate'].includes(opt.kind ?? 'answer') ? { question: opt.question ?? null, answer: opt.answer, by: opt.by ?? null } : null,
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
      case 'skill-dir': out(SKILL_DIR); return 0;
      case 'describe': {
        const d = describeAll();
        out(opt.json ? d : describeText(d));
        return 0;
      }
      case 'gh': return runGh(pos, opt);
      case 'records': return await runRecords(pos, opt);
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
      case 'talk': return runTalk(pos, opt, { out, journal: talkJournal, command: pos.slice(3) });
      case 'step': return runStep(pos, opt);
      case 'control': {
        const [action, root, slug] = pos;
        if (!['stop', 'clear', 'show'].includes(action) || !root || !slug) throw usage('control: <stop|clear|show> <root> <slug> are required');
        const projectRoot = resolve(root);
        if (!existsSync(join(wfRoot(projectRoot), slug))) throw noFolder(`control: no workflow folder ${join(wfRoot(projectRoot), slug)}`, root);
        const after = opt.after ?? 'current';
        if (action === 'stop' && !STOP_AFTER.includes(after)) throw refuse(`control stop: --after must be one of ${STOP_AFTER.join(', ')}`, agentFix(`Run control stop again with --after one of ${STOP_AFTER.join(', ')}.`));
        const v = writeControl(projectRoot, slug, action, action === 'stop' ? [after] : opt.force ? ['force'] : []);
        const lands = action !== 'clear' && v?.action === 'stop' ? stopLands(v.after) : null;
        out(opt.json ? { request: v ?? null, ...(lands ? { lands } : {}) } : action === 'clear'
          ? (v ? `kept the request made after the run ended: ${JSON.stringify(v)} (--force takes it back)` : 'no stop request')
          : v ? `${action === 'stop' ? 'stop requested' : 'stop request'}: after ${v.after} (${v.requestedAt})\n${lands}` : 'no stop request');
        return 0;
      }
      case 'profile': return runProfile(pos, opt);
      case 'findings': return runFindings(pos, opt);
      case 'record': return runRecord(pos, opt);
      case 'consent': return runConsent(pos, opt);
      case 'base': return runBase(pos, opt);
      case 'worktree': return runWorktree(pos, opt);
      case 'rule': return runRule(pos, opt);
      case 'slice-files': return runSliceFiles(pos, opt);
      case 'ship': return runShip(pos, opt);
      case 'drive': return await runDrive(pos, opt);
      case 'progress': {
        const [verb, root, slug] = pos;
        if (!['set', 'show', 'watch'].includes(verb) || !root || !slug) throw usage('progress: <set|show|watch> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw noFolder(`progress: no workflow folder ${dir}`, root);
        if (verb === 'set') {
          const change = Object.fromEntries(['stage', 'slice', 'status', 'run', 'driver', 'reason', 'resume'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          // A driver run names the agent host that runs it, so its life is asked of the process, not guessed from silence.
          if (change.driver && change.status === 'running') {
            // A driver that is its own process (the Codex launch) names itself; else the agent host is looked up.
            const own = Number(process.env.SDLC_DRIVER_PID);
            const h = Number.isInteger(own) && own > 0 ? { pid: own } : hostProcess();
            if (h) Object.assign(change, { hostPid: h.pid, host: hostname() });
          }
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
          markBusy(projectRoot, `the ${name} suite`);
          let r;
          try { r = runSuiteLogged(projectRoot, name, suite.command); } finally { markBusy(projectRoot, null); }
          const seconds = Math.round((Date.now() - t0) / 100) / 10;
          if (!r.error) {
            try { recordRun(projectRoot, name, seconds); } catch (e) { process.stderr.write(`wf.mjs: the time of the ${name} suite was not recorded: ${e.message}\n`); }
          }
          runs.push({ suite: name, command: suite.command, pass: r.status === 0, seconds, log: r.log, ...(r.tail ? { tail: r.tail } : {}) });
          if (r.status !== 0) break;
        }
        const pass = runs.length === names.length && runs.every((r) => r.pass);
        const receipt = { sha: head.stdout.trim(), commands: runs.map((r) => r.command), result: 'pass', at: nowIso(), dirty };
        if (pass) writeFileAtomic(file, `${JSON.stringify(receipt, null, 2)}\n`);
        // A change that HEAD lacks is in no commit of the slice: the receipt records it in dirty.
        const named = dirty.length ? `; recorded ${dirty.length} change(s) that are in no commit of the slice: ${dirty.map((d) => d.path).join(', ')}` : '';
        const failed = runs.find((r) => !r.pass);
        out(opt.json ? { pass, runs, receipt: pass ? file : null, dirty } : pass ? `receipt ${file}: ${runs.map((r) => r.suite).join(', ')} passed at ${receipt.sha.slice(0, 8)}${named}` : [`no receipt: ${failed?.suite} failed`, ...(failed ? suiteLogLines(failed) : [])].join('\n'));
        return pass ? 0 : 1;
      }
      case 'report': return await reportCmd(pos, opt);
      case 'issue': {
        const [verb, root, slug, id] = pos;
        if (verb !== 'place' || !root || !slug || !id) throw usage('issue: place <root> <slug> <id> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw noFolder(`issue: no workflow folder ${dir}`, root);
        let r;
        try {
          r = placeAndApply(dir, id, { projectRoot, apply: Boolean(opt.apply), running: opt.running ?? [], reviewOpen: Boolean(opt['review-open']), final: Boolean(opt.final), as: opt.as ?? 'driver' });
        } catch (e) { throw refuse(`issue place: ${e.message}`, agentFix('Read the issue with talk read --issues, write its investigation first when it has none, then run the command again.')); }
        out(opt.json ? r : r.already ? `${id}: placed before${r.waiting ? `, waiting for the answer ${r.waiting}` : ''} — ${r.placement ? placementLine(r.placement) : 'closed'}` : `${id}: ${placementLine(r.placement)}${r.applied ? ' (applied)' : ''}${(r.placement.lower ?? []).map((l) => `\n  rung ${l.rung}: ${l.failed}`).join('')}`);
        return 0;
      }
      case 'slice': {
        const [verb, root, slug, slice] = pos;
        if (!['drop', 'move', 'add', 'carry', 'split', 'merge'].includes(verb) || !root || !slug || !slice) throw usage('slice: <drop|move|add|carry|split|merge> <root> <slug> <slice> are required');
        const projectRoot = resolve(root);
        const dir = join(wfRoot(projectRoot), slug);
        if (!existsSync(dir)) throw noFolder(`slice: no workflow folder ${dir}`, root);
        if (verb === 'split' || verb === 'merge') {
          let r;
          try {
            if (verb === 'split') {
              const parts = String(opt.part ?? '').split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
                const at = p.indexOf(':');
                return at < 1 ? { slice: p, acs: '' } : { slice: p.slice(0, at).trim(), acs: p.slice(at + 1) };
              });
              r = splitSlice(dir, slice, { parts, decision: opt.decision, reason: opt.reason }, { decisions: decisionsOf(dir) });
            } else {
              r = mergeSlices(dir, slice, opt.from, { decision: opt.decision, reason: opt.reason, maxSteps: limitsOf(projectRoot).maxSteps }, { decisions: decisionsOf(dir) });
            }
          } catch (e) {
            throw refuse(`slice ${verb}: ${e.message}`, agentFix(verb === 'split'
              ? 'Record the cut as a decision first (decide add), then run the command again with --decision <its id> and --part "<slice>:<criteria>;<new slice>:<criteria>"; the part named after the slice keeps its slug.'
              : 'Record the merge as a decision first (decide add), then run the command again with --decision <its id> and --from <the slices to merge>.'));
          }
          await reconcileIndex(projectRoot);
          out(opt.json ? r : verb === 'split'
            ? `split ${slice} of ${slug} into ${r.parts.map((p) => `${p.slice} (${p.acs} criteria${p.estimatedSteps ? `, ${p.estimatedSteps} steps` : ''})`).join(', ')}${r.decisions.moved.length + r.decisions.copied.length ? `; decisions moved ${r.decisions.moved.length}, copied ${r.decisions.copied.length}` : ''}`
            : `merged ${r.merged.join(', ')} into ${slice} of ${slug}${r.estimatedSteps ? ` (${r.estimatedSteps} steps)` : ''}${r.decisions.moved.length ? `; decisions moved ${r.decisions.moved.length}` : ''}`);
          return 0;
        }
        if (verb === 'add' || verb === 'carry') {
          let r;
          try {
            r = verb === 'add'
              ? addSlice(dir, { slice, scope: opt.scope, ac: opt['ac-file'] ? JSON.parse(readFileSync(opt['ac-file'], 'utf8')) : opt.ac, title: opt.title, after: opt.after, before: opt.before, files: opt.files, complexity: opt.complexity, uxImpact: opt['ux-impact'], madeFor: opt['made-for'], placement: opt.placement, by: opt.by, decision: opt.decision }, { decisions: decisionsOf(dir) })
              : carrySlice(dir, slice, { issue: opt.issue, text: opt.text, placement: opt.placement, by: opt.by, decision: opt.decision }, { decisions: decisionsOf(dir) });
          } catch (e) { throw refuse(`slice ${verb}: ${e.message}`, agentFix(`Place the issue with issue place first; slice ${verb} takes the record that it writes, as --placement.`)); }
          await reconcileIndex(projectRoot);
          out(opt.json ? r : r.already ? `${slice}: done before by the same placement` : verb === 'add' ? `added ${slice} to ${slug}${r.after.length ? `, after ${r.after.join(', ')}` : ''}` : `carried ${opt.issue} into ${slice}`);
          return 0;
        }
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
  'step check': { '--result': CHECK_RESULTS },
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
