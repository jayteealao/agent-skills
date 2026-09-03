# Codex Cutover — removing the legacy generated packaging (Workstream I)

NATIVE-INTEROP-REWRITE-PLAN Workstream I / Phase 8. This is the **final, destructive**
step: it removes the legacy generated Codex packaging so `sdlc-workflow-codex` is the
only Codex execution path. Per the plan's phasing it runs **after** the native plugin
is validated, and it is held for **explicit sign-off** because every action here
deletes committed files or edits a file another session is actively editing.

## What gets removed (verified present + inert, 2026-06-15)

Inside the Claude plugin (`plugins/sdlc-workflow/`):

- `.codex-generated/` — 13 files, the generated Codex wrapper skills.
- `.codex-plugin/` — 1 file, the generated Codex manifest.
- `.codex-plugin.overrides.json` — the wrapper generation config.

These are **inert**: no build script, test, hook, or `package.json` entry references
them (the generator itself was removed earlier, see the router-migration cleanup).
Removing them does not affect the Claude plugin build or tests.

In the Codex repo marketplace (`.agents/plugins/marketplace.json` — currently the
**contested WIP of a parallel session**):

- the `sdlc-workflow` entry (path `./plugins/sdlc-workflow`) is the legacy Codex
  exposure and must be removed, leaving only `sdlc-workflow-codex`.

Also superseded (Decision 22), held under the same sign-off because its removal was
declined earlier this session:

- the eight verb-named prototype skills under `plugins/sdlc-workflow-codex/skills/`
  (`sdlc-deliver`, `sdlc-investigate`, `sdlc-review`, `sdlc-design`, `sdlc-document`,
  `sdlc-optimize`, `sdlc-release`, `sdlc-continuity`)
- `plugins/sdlc-workflow-codex/references/workflow-state.md` (the removed JSON
  continuity model) and any remaining `scripts/workflow-state.mjs` /
  `tests/workflow-state.test.mjs`.

## Procedure (run once, on sign-off)

```sh
# 1. remove the legacy generated packaging from the Claude plugin
git rm -r plugins/sdlc-workflow/.codex-generated \
          plugins/sdlc-workflow/.codex-plugin \
          plugins/sdlc-workflow/.codex-plugin.overrides.json

# 2. remove the superseded handwritten prototype from the Codex package
git rm -r plugins/sdlc-workflow-codex/skills/sdlc-deliver \
          plugins/sdlc-workflow-codex/skills/sdlc-investigate \
          plugins/sdlc-workflow-codex/skills/sdlc-review \
          plugins/sdlc-workflow-codex/skills/sdlc-design \
          plugins/sdlc-workflow-codex/skills/sdlc-document \
          plugins/sdlc-workflow-codex/skills/sdlc-optimize \
          plugins/sdlc-workflow-codex/skills/sdlc-release \
          plugins/sdlc-workflow-codex/skills/sdlc-continuity
rm -f plugins/sdlc-workflow-codex/references/workflow-state.md

# 3. edit .agents/plugins/marketplace.json — delete the `sdlc-workflow` plugin
#    object, keep only `sdlc-workflow-codex`. (Coordinate with the parallel session
#    editing this file so their changes are not clobbered.)

# 4. lock it in — this must now pass:
node plugins/sdlc-workflow-codex/scripts/verify-no-legacy-codex.mjs --post-cutover

# 5. rebuild the Claude plugin + re-run its gates (the removal is inert, but prove it)
cd plugins/sdlc-workflow && npm run build && npm test && npm run verify:docs
```

## After cutover

- Wire `verify:no-legacy --post-cutover` into CI so the legacy cannot return.
- Update the Claude README to stop describing generated Codex packaging.
- Keep `sdlc-workflow-codex` as the only Codex repo-marketplace entry.
