# Single-source cutover runbook (SINGLE-SOURCE-PLAN W7)

Status: **LIVE runbook.** Written before the release commit, as the plan
requires. Step 0 runs in the release session against a scratch `CODEX_HOME`.
Step 2 runs once per machine, by the operator, in an interactive Codex session,
because hook trust cannot be granted headlessly.

The release commit (v9.153.0) deleted `plugins/sdlc-workflow-codex`, renamed
the Codex plugin identity to `sdlc-workflow`, moved the Codex hook wiring to
`hooks/codex.hooks.json`, and collapsed `runtime/` into the plugin root. Every
Codex machine that had the old plugin installed must cut over once. Claude Code
machines re-sync the marketplace as usual and need nothing else.

## 0. Preflight (release session, scratch `CODEX_HOME`)

Prove the merged tree installs and runs before anything is published.

1. Create a scratch home and a local marketplace that points at the merged tree.
   ```bash
   export CODEX_HOME=/tmp/codex-home-preflight
   mkdir -p "$CODEX_HOME"
   codex plugin marketplace add <repo-root>
   codex plugin add sdlc-workflow@agent-skills-marketplace
   ```
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
same repository. Run the four commands, then open the next session.

1. Close every Codex session (CLI and Desktop) on the machine.
2. Refresh the catalog, add the new identity, remove the old one:
   ```bash
   codex plugin marketplace upgrade agent-skills-marketplace
   codex plugin add sdlc-workflow@agent-skills-marketplace
   codex plugin remove sdlc-workflow-codex@agent-skills-marketplace
   ```
   The `remove` is the point of no return: it discards the old identity's trust
   state. Everything before it is additive.
3. Open an interactive Codex session and run `/hooks`. Trust all seven events
   (SessionStart, SubagentStart, PreToolUse, PermissionRequest, PostToolUse,
   Stop, SubagentStop). Trust keys embed the hooks-file relpath and a content
   hash, so the move to `hooks/codex.hooks.json` re-asks once.
4. Verify:
   ```bash
   node plugins/sdlc-workflow/scripts/verify-deployment.mjs
   ```
   Expected: 0 failures, 0 warnings. A legacy `sdlc-workflow-codex` entry in
   `config.toml` is a FAIL with the exact `remove` command to run.
5. Keep the old snapshot cache (`~/.codex/plugins/cache/agent-skills-marketplace/sdlc-workflow-codex/`)
   until step 4 passes on the machine. Then delete it.

## 3. Rollback (per machine)

Re-add the old identity from the last-good SHA and re-trust its hooks:

```bash
codex plugin marketplace add jayteealao/agent-skills --ref <last-good-sha>
codex plugin remove sdlc-workflow@agent-skills-marketplace
codex plugin add sdlc-workflow-codex@agent-skills-marketplace
```

Then open an interactive session, run `/hooks`, and trust the old plugin's
seven events again. Re-adding does NOT restore trust: the hashes are keyed to
file path and content, so rollback pays the manual-trust cost a second time.
That asymmetry is why step 0 exists.

## 4. Field checks after cutover (W8)

- A Claude Code session and a Codex session against the SAME repository adopt
  one hub: `http://127.0.0.1:4173/__sdlc/health` reports one `runtimeVersion`
  and `buildId` from both.
- The seed-memory notice appears once in a fresh Claude Code session and never
  in a Codex session (the `SDLC_HOST` signal).
- A managed-artifact write from Codex lands a render-queue row whose
  `enqueuedBy.host` reads `codex`.
- `$wf` under Codex shows 21 keys; `/wf` under Claude Code shows 22. The extra
  key is `yolo`.
