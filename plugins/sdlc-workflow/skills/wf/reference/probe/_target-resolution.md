# Probe — target resolution layers (Step 2 of `probe.md`)

Load this file from `probe.md` Step 2 for a non-empty target string `T`. All four layers always run; their results compose into the `target-resolution` block of the slice frontmatter.

### Layer 1 — AC text match

Fuzzy-match `T` against the AC text of every `03-slice-*.md` (or compressed equivalent) read in Step 0. Use token-level overlap, ignoring case and stopwords. Threshold: at least 50% of `T`'s content words appear in the AC text.

- Record each match as `{slice: <slice-slug>, ac-id-or-quote: <text>, score: <0..1>}` in `target-resolution.matched-ac`. Observation compares runtime evidence to each matched AC's exact text.

### Layer 2 — Slice match

Match `T` against slice slugs and slice titles (case-insensitive substring).

- Record each match's slug in `target-resolution.matched-slices`. Observation scopes the drive plan to those slices' surfaces.

### Layer 3 — Surface inference

Extract surface hints from `T` using these heuristics:

- **Route hints** — strings starting with `/` (e.g., `/checkout`, `/api/users`). Record as `inferred-surfaces[].kind: route`.
- **Screen / page hints** — capitalized words paired with "screen", "page", "view", "panel", "drawer", "dialog" (e.g., "Login screen", "Settings page"). Record as `inferred-surfaces[].kind: screen`.
- **Command hints** — words preceded by a CLI prompt indicator (`$ `, `> `, `> npm`, `cargo run`, etc.) or bare command names that match `package.json` `bin` keys. Record as `inferred-surfaces[].kind: command`.
- **Endpoint hints** — `GET /...`, `POST /...`, `<METHOD> /<path>`. Record as `inferred-surfaces[].kind: endpoint`.

Each inferred surface narrows adapter entry points in Step 4 (route hint → `web` adapter; screen hint → `android`/`ios` navigation flow; etc.).

### Layer 4 — Ad-hoc criterion

If Layers 1–3 produced no usable results (no matched AC, no matched slice, no inferred surfaces), the target is treated as a new criterion declared at probe time:

- Set `target-resolution.ad-hoc: true`.
- The criterion text used for comparison during observation is `T` exactly.

Ad-hoc targets are not failures — they are data. The user can promote one to a formal AC via `/wf plan <slug> <slice>` (unbuilt slice) or `/wf intake <slug> <scope>` (new slice); there is no in-place amend.
