# Codex hook smoke test — live last-mile verification

**Purpose.** The repo-side harness (`tests/hooks.test.mjs`, `tests/runtime-parity.test.mjs`,
`scripts/verify-*.mjs`) already proves the Codex hook *policy* is byte-identical to the
Claude plugin and behaves correctly when spawned in isolation. What it **cannot** prove
is that a real, trusted Codex CLI session actually delivers events to those hooks and
honors their decisions. This checklist closes that last mile by hand.

Run it once per environment after any of: a fresh install, a CLI upgrade, a hook-contract
bump (`HOOK_CONTRACT_VERSION` in `hooks/_adapter.mjs`), or a `hooks.json` change.

Every step names the **hook**, the **action**, and the **observable** — the thing you must
actually see. If the observable is missing, the hook is not wired (almost always: untrusted).

---

## 0. Prerequisites (must pass before any live step)

- [ ] **Repo harness green.** From `plugins/sdlc-workflow-codex/`:
  ```
  npm test                     # verify-claudisms + runtime-parity + hooks (expect 23/23)
  node scripts/verify-deployment.mjs
  ```
  `verify-deployment` must show **0 failures**. A `WARN hook trust: 0/7` here is expected
  until step 1 — it is the exact gap this checklist exists to close.

- [ ] **Trust all 7 hook events.** Open an interactive `codex` session and run `/hooks`,
  then trust every event the plugin registers:
  `SessionStart · SubagentStart · PreToolUse · PermissionRequest · PostToolUse · Stop · SubagentStop`.
  **Untrusted hooks are silently SKIPPED** — this is the single most common reason a live
  smoke test "does nothing." Re-run `node scripts/verify-deployment.mjs` and confirm the
  trust warning is now **7/7 trusted** (0 warnings).

- [ ] **Know your two side-effect directories** (referred to below as `$DATA` and `$REPO`):
  - `$REPO` — a scratch git repo you will drive the session in (create one, `git init`).
  - `$DATA` — the plugin-local writable dir (`PLUGIN_DATA`). Artifacts to watch there:
    `activation.json`, `permission-auto-allow.log`, `turns/<session>.json`.
    If you don't know its path, add a temporary `console.error` is *not* needed — instead
    read it back from the activation step below (the file's existence is the marker).

- [ ] **Seed one workflow slug** in `$REPO` so the hooks have something managed to act on:
  ```
  mkdir -p $REPO/.ai/workflows/smoke
  ```

---

## 1. SessionStart — activation, silently

- **Action:** Start a fresh `codex` session with cwd = `$REPO`.
- [ ] **Observable A (silence):** No workflow-orientation banner is printed. SessionStart is
  pure background maintenance — it must NOT emit orientation text.
  *(Mirrors `hooks.test.mjs` → "session-start emits NO orientation".)*
- [ ] **Observable B (activation record):** `$DATA/activation.json` now exists and its
  `pluginVersion` / `runtimeBuildId` match the installed plugin. This is written **once**
  after the hub is confirmed.
  *(Mirrors "session-start writes activation once after the hub is confirmed".)*
- [ ] **Observable C (idempotent):** Start a second session. `activation.json` is **not**
  rewritten (same mtime / same bytes) — same baseline ⇒ no re-activation.

> If A shows a banner, or B never appears, the SessionStart hook is untrusted or the hub
> did not confirm. Re-check step 0.

---

## 2. PreToolUse — deny a bogus managed write *before* it lands

- **Action:** In the session, ask Codex to write a managed artifact with an **invalid schema**:
  ```
  Create .ai/workflows/smoke/01-intake.md with this exact content:
  ---
  schema: bogus/v1
  type: intake
  slug: smoke
  ---
  # intake
  ```
- [ ] **Observable (deny):** The write is **denied/blocked** with a validation reason
  mentioning `schema` / `sdlc/v1`. The file must NOT be created on disk.
  *(Mirrors "pre-tool-use DENY emits the modern permissionDecision envelope + legacy exit 2".)*
- [ ] Confirm on disk: `.ai/workflows/smoke/01-intake.md` does **not** exist.

> PreToolUse matches `apply_patch | Edit | Write`. If Codex uses `apply_patch` and the deny
> still fires, that also exercises the adapter's patch-envelope parsing — good.

---

## 3. PostToolUse + Stop — the enforcement boundary (Codex can't undo a patch)

Because a completed `apply_patch` cannot be rolled back in PostToolUse, enforcement lands on
the Stop hook. This is the most Codex-specific behavior — verify it deliberately.

- **Action:** Force a bogus artifact onto disk *outside* the pre-hook (write it with a shell
  command so PreToolUse doesn't intercept), then let the turn try to end:
  ```
  # via a shell tool call inside the session, or an apply_patch Codex chooses:
  printf '%s\n' '---' 'schema: bogus/v1' 'type: intake' 'slug: smoke' '---' '# intake' \
    > $REPO/.ai/workflows/smoke/01-intake.md
  ```
- [ ] **Observable A (ledger):** `$DATA/turns/<session>.json` now lists
  `.ai/workflows/smoke/01-intake.md` in `paths` — PostToolUse recorded the touched artifact.
  *(Mirrors "post-tool-use BLOCKS an invalid managed artifact + records the ledger".)*
- [ ] **Observable B (Stop blocks):** The turn does **not** end cleanly — the Stop hook
  re-checks the ledger, finds the invalid artifact, and blocks with a repair continuation.
- [ ] **Observable C (bounded repair):** If the artifact stays invalid, the Stop block
  repeats at most **`REPAIR_CEILING` (3)** times, then releases with a hard-failure note
  containing "repair attempts" — it must NOT loop forever.
  *(Mirrors "stop-verify blocks on a ledgered invalid artifact, then bounds the repair loop".)*
- [ ] **Recovery:** Fix the artifact (`schema: sdlc/v1`, valid intake body). The next Stop
  passes clean and clears the ledger (`turns/<session>.json` emptied / renamed `.done`).

---

## 4. PostToolUse — a valid managed write passes untouched

- **Action:** Ask Codex to write a **valid** artifact:
  ```
  Create .ai/workflows/smoke/01-intake.md with schema: sdlc/v1 and a proper intake body.
  ```
- [ ] **Observable:** No block. The file lands, and (unless render is suppressed) a rendered
  view is produced. A non-managed write (e.g. `notes.md`) must also pass with no hook noise.
  *(Mirrors "post-tool-use exits 0 when no managed artifact is touched".)*

---

## 5. SubagentStart — context injection for children

- **Action:** Trigger a subagent from within the session (any task that spawns one) while an
  **active** slug exists (`00-index.md` present with `status: active`).
- [ ] **Observable:** The subagent's context includes the active slug + stage
  (e.g. `` `smoke` (stage: …) ``) and the **External Output Boundary** reminder
  ("children read, parent writes"). Closed workflows are excluded.
  *(Mirrors "subagent-start injects active-slug + boundary context; silent with no workflows".)*
- [ ] **Negative:** With no `INDEX.md` / active slug, subagent start is **silent**.

---

## 6. PermissionRequest — auto-allow runtime invocations only

- **Action:** Let the plugin invoke one of its own runtime scripts (e.g. a render/hub-ensure
  spawn happens naturally on a managed write in step 4), or trigger one.
- [ ] **Observable A (allow + log):** The runtime-dist invocation is auto-allowed, and
  `$DATA/permission-auto-allow.log` gains a line naming the script
  (e.g. `post-write-render.mjs`).
  *(Mirrors "permission-request hook: emits allow for runtime dist, silent otherwise, logs the allow".)*
- [ ] **Observable B (no opinion otherwise):** An unrelated command (e.g. `rm -rf node_modules`)
  gets **no** auto-allow — the hook stays silent and the normal approval flow applies.

---

## 7. SubagentStop — same enforcement as Stop

- **Action:** Repeat step 3's bogus-artifact scenario but end a **subagent** turn (not the
  root turn).
- [ ] **Observable:** SubagentStop runs the same `stop-verify.mjs` and blocks the subagent
  from returning until the managed artifact is valid, with the same repair ceiling.

---

## Pass criteria

The Codex hooks are live-verified in-sync when **every** box above is checked and:

- **7/7 events trusted** (`verify-deployment` clean, no trust warning), and
- Each hook's observable matched the behavior the repo harness asserts for it.

If any observable is missing, the fault is almost always one of: **untrusted hook** (step 0),
**wrong cwd** (project root not resolving to `$REPO`), or **stale install** (re-run
`verify-deployment` — a `buildId`/version mismatch means the synced runtime is behind; re-sync
before retrying).

## Teardown

```
rm -rf $REPO           # scratch repo
# $DATA/activation.json, turns/, permission-auto-allow.log are safe to leave;
# they re-initialize on the next trusted session.
```
