# Single-source cutover runbook (SINGLE-SOURCE-PLAN W7)

Status: **LIVE runbook.** Written before the v9.153.0 release commit, as the
plan requires; corrected in v9.153.1 after the fresh-eyes review (step order,
the cache note, the Claude Code step). Step 0 runs in the release session
against a scratch `CODEX_HOME`. Step 2 runs once per machine, by the operator,
in an interactive Codex session, because hook trust cannot be granted headlessly.

The v9.153.0 release commit deleted `plugins/sdlc-workflow-codex`, renamed the
Codex plugin identity to `sdlc-workflow`, moved the Codex hook wiring to
`hooks/codex.hooks.json`, and collapsed `runtime/` into the plugin root. Every
Codex machine that had the old plugin installed must cut over once. Every
Claude Code machine must update its installed plugin to the same version at the
same time (step 2.6): the shared hub is reaped and respawned by any session
whose runtime version differs from the hub's, so two hosts on two versions reap
each other's hub on every session start (until v9.153.2, which adopts a newer
hub and reaps only an older one).

## 0. Preflight (release session, scratch `CODEX_HOME`)

Prove the merged tree installs and runs before anything is published.

1. Create a scratch home and a local marketplace that points at the merged tree.
   ```bash
   export CODEX_HOME=/tmp/codex-home-preflight
   mkdir -p "$CODEX_HOME"
   codex plugin marketplace add <repo-root>
   codex plugin add sdlc-workflow@agent-skills-marketplace
   ```
   A model call from the scratch home needs `auth.json` copied in from the real
   home. Delete the copy when the preflight ends. A local-path marketplace
   snapshots the working tree as it is, `node_modules/` included (about 120 MB);
   a Git-URL install snapshots the tracked tree only (about 24 MB). The size
   difference is not a packaging defect.
2. Run a headless session in a scratch git repository with an active workflow slug:
   ```bash
   codex exec --dangerously-bypass-hook-trust --skip-git-repo-check "Reply with the list of installed plugin skills."
   ```
   Expected: all 6 skills appear (wf, consult, imagery, uiproto, diataxis,
   study-sources), each with its interface metadata from `agents/openai.yaml`.
3. Confirm the declared hooks fired and no Claude Code hook did: the session's
   rollout names `hooks/codex.hooks.json` commands only; `hooks/hooks.json` never
   loads (plan C3).
4. Run the deployment doctor against the scratch home. Expected: 0 failures.
   ```bash
   CODEX_HOME=/tmp/codex-home-preflight node plugins/sdlc-workflow/scripts/verify-deployment.mjs
   ```
5. Ask `$wf status` in the scratch repo. Expected: the same hub answers that a
   Claude Code session on the machine adopts (`/__sdlc/health` reports one
   `runtimeVersion` and `buildId`).
6. Delete the scratch repository when the preflight ends. The SessionStart hook
   registered it with the machine hub; the hub prunes a registry entry whose
   repository directory no longer exists.

Preflight failure costs an afternoon. The same failure after step 2 costs every
machine's trust state.

## 1. Publish

One atomic release commit: the merged tree, the tree deletion, both in-tree
manifests, the root Claude catalog version, and the root Codex catalog name and
path. Then push. `origin/master` must carry the commit before any machine
migrates. No intermediate SHA may exist in which a catalog points at the
deleted tree.

## 2. Per machine (operator, one window, no Codex session open)

CAUTION: do not open a Codex session while both identities are enabled. Two
plugins expose two `wf` skills and fire two SessionStart hook sets against the
same repository. Remove the old identity BEFORE you add the new one, so no
moment exists in which both are enabled. Run the three commands, then open the
next session.

0. Record the machine before you change it. In the development clone, run:
   ```bash
   npm run doctor
   ```
   Paste the table under §5 as the "before" record. The doctor exits 1
   while any host runs a version other than the tree's; that is the state
   this procedure removes.
1. Close every Codex session (CLI and Desktop) on the machine.
2. Refresh the catalog, remove the old identity, add the new one:
   ```bash
   codex plugin marketplace upgrade agent-skills-marketplace
   codex plugin remove sdlc-workflow-codex@agent-skills-marketplace
   codex plugin add sdlc-workflow@agent-skills-marketplace
   ```
   Per `codex plugin remove --help`, `remove` deletes the old identity's config
   entry and its cached snapshot
   (`~/.codex/plugins/cache/agent-skills-marketplace/sdlc-workflow-codex/`).
   Its `hooks.state` trust entries in `config.toml` may survive the remove
   (not yet observed either way on 0.146.0); step 4 reports them, and they are
   safe to delete by hand. The old plugin-data directory
   (`~/.codex/plugins/data/sdlc-workflow-codex-agent-skills-marketplace/`) is
   orphaned by the rename; the new identity re-creates its own. Delete the old
   one when step 4 passes.
3. Open an interactive Codex session and run `/hooks`. Trust all seven events
   (SessionStart, SubagentStart, PreToolUse, PermissionRequest, PostToolUse,
   Stop, SubagentStop). Trust keys embed the hooks-file relpath and a content
   hash, so the move to `hooks/codex.hooks.json` re-asks once. The Stop event
   runs two commands since the cost ledger landed (`stop-verify.mjs`, then
   `stop-cost.mjs`); that content change re-asks once more.
4. Verify:
   ```bash
   node plugins/sdlc-workflow/scripts/verify-deployment.mjs
   ```
   Expected: 0 failures, 0 warnings. A legacy `sdlc-workflow-codex` entry in
   `config.toml` is a FAIL with the exact `remove` command to run.
5. In a development clone that carried the old tree, delete the leftover
   directory. `git rm` removes tracked files only; gitignored logs under
   `plugins/sdlc-workflow-codex/` keep the empty skeleton alive. The unit
   suite asserts on tracked content since v9.153.1, so the leftover is not a
   test failure, only clutter:
   ```bash
   rm -rf plugins/sdlc-workflow-codex
   ```
6. Update the Claude Code plugin on the same machine to the same version. In
   Claude Code, run `/plugin marketplace update agent-skills-marketplace`, then
   update `sdlc-workflow@agent-skills-marketplace` from the plugin manager; or
   from a shell:
   ```bash
   claude plugin marketplace update agent-skills-marketplace
   ```
   ```bash
   claude plugin update sdlc-workflow@agent-skills-marketplace
   ```
   Restart Claude Code afterwards; the update applies on restart.
   Confirm with `/__sdlc/health`: after one session on each host, the hub
   reports one `runtimeVersion`, and it does not change between the two hosts'
   session starts.
7. Run `npm run doctor` again. Every host row reads `ok` and the verdict row
   reads `OK`; the exit code is 0. Paste the table under §5 as the "after"
   record. The tray's *Run doctor…* item writes the same table to
   `~/.sdlc/doctor.txt`.

## 3. Rollback (per machine)

Re-add the old identity from the last-good SHA and re-trust its hooks:

```bash
codex plugin remove sdlc-workflow@agent-skills-marketplace
codex plugin marketplace remove agent-skills-marketplace
codex plugin marketplace add jayteealao/agent-skills --ref <last-good-sha>
codex plugin add sdlc-workflow-codex@agent-skills-marketplace
```

Remove the marketplace before you re-add it at a ref: `marketplace add` has no
replace flag, so a name that is already configured is expected to be refused
(not yet observed on 0.146.0). `--ref` takes a Git ref; use a tag or a full
40-character commit SHA. Then open an interactive session,
run `/hooks`, and trust the old plugin's seven events again. Re-adding does NOT
restore trust: the hashes are keyed to file path and content, so rollback pays
the manual-trust cost a second time. That asymmetry is why step 0 exists.

## 4. Field checks after cutover (W8)

- A Claude Code session and a Codex session against the SAME repository adopt
  one hub: `http://127.0.0.1:48173/__sdlc/health` reports one `runtimeVersion`
  and `buildId` from both, and the value does not change between the two hosts'
  session starts.
- The seed-memory notice appears once in a fresh Claude Code session and never
  in a Codex session (the `SDLC_HOST` signal).
- A managed-artifact write from Codex lands a render-queue row whose
  `enqueuedBy.host` reads `codex`.
- Since v9.153.2 a session adopts a hub on a NEWER runtime version and reaps
  only an OLDER one, so the two hosts converge on the newest installed version
  instead of reaping each other; the step-2.6 update still matters, because
  the older host's write hooks then render through the newer hub's templates.
- `$wf` under Codex accepts 21 keys; `/wf` under Claude Code accepts 22. The
  extra key is `yolo`. Both hosts show the same 22-row table in `SKILL.md`,
  with `yolo` marked Claude Code only.

## 5. Doctor record (operator machine)

`npm run doctor` writes this table (WIDE-VIEW-REPAIR-PLAN §14.2.1). The
"before" record is the state the procedure in §2 removes; the operator pastes
the "after" record when step 7 exits 0.

### Before — 2026-09-07, tree at 9.153.5, exit 1

```text
shipped (package.json)                                          9.153.5
claude install (user)                                           9.153.5 @ abdca984                                                                                ok
claude install (local: C:\Users\jayte\Documents\dev\Isometric)  9.144.0 @ 203dfa4f                                                                                behind
codex cache (agent-skills-marketplace)                          9.153.5 enabled                                                                                   ok
codex trusted hook events                                       permission_request, post_tool_use, pre_tool_use, session_start, stop, subagent_start, subagent_stop
hub 127.0.0.1:4173                                              9.153.5 build e4d53d559202 pid 60888 by claude · 13 repos                                         ok
hub port owner                                                  pid 60888 (netstat)
active runtime                                                  9.153.5 build e4d53d559202
runtime store                                                   30 builds · 118.8 MB · C:\Users\jayte\.sdlc\runtime                                               gc
registry entries                                                13
registry ephemeral roots                                        worktree: C:\Users\jayte\Documents\dev\Playster\.claude\worktrees\agent-ad60ea59bc98badec; temp: C:\Users\jayte\AppData\Local\Temp\claude\C--Users-jayte-Documents-dev-agent-skills\f97a0867-517e-4597-99e8-fb72757dc22a\scratchpad\preflight-repo  refuse
registry entries with 0 slugs                                   C:\Users\jayte\Documents\dev\agent-skills; C:\Users\jayte\Documents\dev\HomeLab-PDU-V1; C:\Users\jayte\Documents\dev\pi-unified; C:\Users\jayte\Documents\rollover
tailscale                                                       configured (serve) · serve status: |-- / proxy http://127.0.0.1:3000
verdict                                                         claude mixed · codex ok · hub ok                                                                  ACTION
```

Reading: the user-scope Claude Code install and the Codex cache both run the
shipped version; the merge cutover of §2 is already done on this machine. The
one install gap is the Isometric project-local scope (`9.144.0`), which the
plan's exit criterion "hosts on the shipped version 2/2" counts as a host. The
two ephemeral registry roots and the 30-build runtime store are W11.3 and W11.5
work; the doctor only reports them.

### After — pending

The operator updates the Isometric local scope (§2 step 6, run from that
repository), reruns `npm run doctor`, and pastes the table here.
