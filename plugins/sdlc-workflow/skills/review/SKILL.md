---
name: review-references
description: Reference library loaded by the /review router. Not user-invocable; do not auto-trigger.
user-invocable: false
---

# Review reference library

This skill is **not user-invocable** and is **not auto-triggered**. It is loaded on demand by the `/review` command in `plugins/sdlc-workflow/commands/review.md`.

Each file under `reference/` is the original body of a former `/review-*` (aggregate) or `/review:*` (per-dimension) command, relocated here unchanged at migration time. The router parses the first positional argument and reads the matching file:

- `reference/_aggregate-<key>.md` — multi-dimension aggregate (loaded by `/review pass <key>`).
- `reference/<key>.md` — single-dimension review (loaded by `/review <key>`).

`router-metadata.json` is the single source of truth for the router's keys, the shim redirects, and the per-key descriptions.

`migration-manifest.json` records each original body's SHA-256 at migration time. The verifier `scripts/verify-router-migration.mjs` checks every reference body still matches its recorded hash, so any unintended drift after the migration is caught in CI.

Do not edit the reference files for the *purpose* of the migration. After PR-1 (router introduction), substantive review-body edits are normal and expected — when one happens, regenerate `migration-manifest.json` so it tracks the new hash, otherwise the verifier fires on every PR.
