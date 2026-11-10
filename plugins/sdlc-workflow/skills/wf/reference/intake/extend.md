You are running **intake in extension mode**: the path that the dispatcher takes when `/wf intake <existing-slug>` is followed by free scope text, by nothing, or by `from-review`/`from-retro`, and not by a mode keyword.
Extension expands the scope. It adds new slices to an existing workflow, in progress, complete or closed, and it touches no existing slice artifact.

> The External Output Boundary and the rules of the workflow registry and the slug come from `_intake-context.md`, which the `intake` dispatcher loaded before this reference. Do not restate or fork those rules here.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

Extension is a utility flow, not a pipeline stage. It adds new slices. It does not correct existing slices or fix bugs. A defect of built work is fixed by a review run (`/wf review <slug>`), or by `/wf intake <slug> fix` for a change after ship. It is never a new slice.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | New `03-slice-<new-slug>.md` files + updated `03-slice.md` (non-destructive append) |
| Does NOT modify | Any `03-slice-<slug>.md` file with `status: complete` or `status: in-progress` |
| Next | `/wf plan <slug> <new-slice-slug>` for each new slice; `/wf design <slug> amend` first on a design delta (Step 3c) |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `03-slice.md` | artifact | always | |
| `07-review.md` | artifact | mode:from-review | Recommendations |
| `07-review-*.md` | artifact | mode:from-review | Recommendations |
| `findings.yaml` | artifact | mode:from-review | |
| `10-retro.md` | artifact | mode:from-retro | Recommended Improvements; Keep / Change / Drop; Deferred Debt |
| `03-slice-probe-*.md` | artifact | mode:from-probe | |
| `02-shape.md` | artifact | mode:general | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `design/_lane.md` | procedure | always | |
| `intake/extend/_artifacts.md` | procedure | always | |
| `intake/extend/_from-review.md` | procedure | mode:from-review | |
| `03-slice-<slice>.md` | writes | | |

> **Not a compressed slice.** Extension writes full `03-slice-<new-slug>.md` files. The `_compressed-slice.md` override does not apply here: it governs the slug-mode flows of the mode keywords (`fix`/`rca`/`hotfix`/…). The `intake` dispatcher routes extension around that override.

# Role
You expand the scope. You do not solve the problem. Keep the stated order only where a step uses the output of an earlier step or crosses a gate.
- Do not modify any existing slice file.
- Do not change a `status: complete` entry in `03-slice.md`.
- Do not write implementation code or plans.
- The work is: orient, extract the new scope, interview, write the new slice files, update the index.

---

# Step 0 — Orient

1. **Resolve the slug.** The `intake` dispatcher took the existing slug on disk as `<slug>` (an exact `<wf-dir>/00-index.md` match) before it routed here: use it. When you arrive with no slug, infer the most recent active workflow from the index of each workflow in `.ai/workflows/` (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`, per [_records.md](../_records.md)). When that is ambiguous, ask one gate question per [_gate-question.md](../_gate-question.md) that lists the options.
2. **Resolve the seed** from the rest of `$ARGUMENTS`:
   - `from-review`: extract the new scope that the person names from the review records. Only the person starts this seed: a review never routes a finding here. A defect of built work is fixed by a review run (`/wf review <slug>`), or by `/wf intake <slug> fix` for a change after ship. It is never a new slice.
   - `from-retro`: extract the new scope from the findings of `10-retro.md`.
   - `from-probe`: extract the new scope from the probe slices of the workflow (`03-slice-probe-*.md`): the findings whose remedy is a new capability, not a fix of built work.
   - `from-simplify`: extract the new scope from the `/wf intake simplify` findings routed here. The finding entry (id, files, rationale, severity) travels in the invocation text.
   - **Free scope text, or nothing:** the general extension. The person describes the new scope. The free text after the slug is your starting description; when it is empty, the interview of Step 2 draws it out.
3. **Parse the index** (`record get "<root>" <slug> index`): `title`, `slug`, `current-stage`, `status`, `selected-slice`, `workflow-files`, `workflow-type`.

3b. **Shape pre-flight (entry guard).** Extension needs a slice roster, and branch 2 of the dispatcher routes any slug on disk here, also a workflow that cannot have one. Check before you read further:
   - **An analysis parent** (`workflow-type: rca` / `discover` / `investigate` / `ideate`) has no roster, and never will. Stop: *"`<slug>` is a `<type>` analysis workflow — it has no slice roster to extend. Route its decision instead: record the pick/route (`/wf intake <type> <slug> …`) or start the follow-on work with `/wf intake "<scope>" from <slug>`."*
   - **Another workflow with no roster:** stop, and name the command of its type: *"`<slug>` is a `<type>` workflow — it has no slice roster to extend. Run `<command>`."*, where `<command>` is:
     - `brainstorm` → `/wf intake brainstorm <slug>`
     - `audit` → `/wf intake audit <slug>`, or `/wf intake <slug> close` when its routes are done
     - `task` → `/wf intake task <slug>`
     - `optimize` → `/wf loop optimize <slug>`
     - `prototype` → `/wf loop prototype <slug>`
     - `simplify` → one of its `recommended-routes` (the index lists them), or `/wf intake "<scope>" from <slug>`
   - **A standard parent before the slice** (`workflow-type: feature` or unset, and no `03-slice.md` record yet: `record get "<root>" <slug> 03-slice.md` exits 1) has not reached slicing. Stop: *"`<slug>` has no slice roster yet (stage: `<current-stage>`). Fold the new scope into the normal path instead: run `/wf intake <slug>` / `/wf slice <slug>` (its `next-invocation`), which absorbs the scope without an extension round."*
4. **Parse the `slices:` array of `03-slice.md`** (`record get "<root>" <slug> 03-slice.md`). For each entry, note its `slug`, `status` and `depends-on`. This is the existing slice inventory, and nothing may break it.
5. **Check every `03-slice-<slug>.md` record** that `workflow-files` lists (`record get` each). Note which are `status: complete`, `status: in-progress` and `status: defined`.
6. **Use the seed source** that the Requires table names for the seed (`record list "<root>" <slug>` gives the names, and `record get` reads each): every `07-review-*.md` for `from-review` (extension candidates often come from sibling reviews), `10-retro.md` for `from-retro`, and `02-shape.md` with the live entries of the decision store (`decide list`, per [_decisions.md](../_decisions.md)) for the general seed.
7. **Summarise the current state in chat:**
   ```
   Workflow: <title> (<slug>)
   Stage: <current-stage> | Status: <status>
   Existing slices: <N> (<N-complete> complete, <N-in-progress> in-progress, <N-defined> defined)
   Extending with: <free scope text, or "from-review" / "from-retro">
   ```

---

# Step 1 — Extract New Scope

By the seed:

## `from-review` seed

Follow [extend/_from-review.md](extend/_from-review.md) in full. It takes only the new scope that the person names from the review records, and it falls back to the general interview when no finding qualifies.

## `from-retro` seed

From `10-retro.md`, extract the items that imply new development work: `## Recommended Improvements`, the `change` items of `## Keep / Change / Drop`, and the `act-now` items of `## Deferred Debt`. Group them into candidate slices.

## General seed

The free scope text of the person, when there is any, is the starting description. The discovery interview of Step 2 sharpens it into precise slices. When the slug is a work packet (`origin-packet` set), the interview does not ask again about the confirmed scope of the work packet or about a carried decision. When no text was given, the interview draws out the scope from nothing. Go straight to the interview.

---

# Step 2 — Discovery Interview

Ask targeted gate questions per [_gate-question.md](../_gate-question.md), up to 4 per round, until the slice grouping, the order, the dependencies and the scope boundaries are fixed. Never pad to a count.

**What to ask about.** Write questions specific to the artifacts of this workflow and to the extracted candidates:

- **What new work needs doing?** (General seed only.) Sharpen the scope text of the person. What capability is missing? What problem does it solve that the original slices did not? Cite the original shape to anchor the question.
- **Slice grouping.** For each candidate (from-review, from-retro), or for the described new work: one slice or several? Ask with the content of the candidate and the tradeoff of size and complexity.
- **Insertion position.** Do the new slices come after all existing slices, or between them? Do dependencies on existing slices constrain the order? Ask specifically about dependencies on slices that are in progress or defined (not yet implemented).
- **Priority among new slices.** When several new slices are added, which is planned and implemented first? Ask whether risk, value, a dependency or a timeline drives it.
- **Scope boundaries.** For each new slice candidate, ask what is deliberately not in it: what is deferred, left out, or handled by a later slice.

Rules:
- Cite the actual findings or retro items when you ask about from-review or from-retro candidates.
- Confirm the proposed slice slugs with the person: propose readable kebab-case names.
- Ask about the dependencies on existing slices explicitly: the person knows whether the order of implementation matters.
- Record every answer with `decide add --stage extend` per [_decisions.md](../_decisions.md). The first `decide add` creates the store when the workflow has none (a compressed-mode parent has none).

---

# Step 3 — Confirm New Slices (one confirmation)

Extension is additive by contract: it never modifies existing slices, so one confirmation is enough. In the last interview round, present the proposed slices in one message: each slug, goal, complexity and depends-on, and the sentence "Existing slices are not modified." Include the UX impact of the new scope (Step 3c) in the same message. Ask the person to confirm. When the person asks for changes, apply them, and confirm the changed slices in the same exchange. When the person declines, stop.

---

# Step 3b — Intent-risk & charter delta (required for the new scope)

New scope enters the lifecycle here without passing through `intake default` or `shape`, so this step covers it with the intent-fidelity ledgers. This step computes the deltas and holds them. Step 6 is the single writer of the index: nothing here touches `00-index.md`.

1. **RIM delta.** For the confirmed new slices, ask: what are the most likely ways this new scope could be misread? It is the same misreading pass that `intake/default.md` Step 6a runs. Each distinct risk becomes a drafted `intent-risks` entry.
   - Extension has no later shape run to judge the entries, so write each entry adjudicated in place. The interview of Step 2 is where it is judged: `status: adjudicated`, `decision:` from the answer of the interview, `adjudicated-by: 03-slice-<new-slug>.md#risks`, and `po-ratified: true` with the id of the decision-store entry.
   - Leave an entry `open` only when the interview really could not resolve it. It then appears in `## Risks` of the new slice and in the drafted `open-questions` addition, and it blocks ship until it is cleared.
2. **Charter delta.** When the new scope adds a load-bearing commitment that the existing charter does not cover, draft the ledger addition: `C<next>`, `source:` the new slice file, `po-ratified: true` (the confirmation gate of Step 3 is the ratification). Do not rewrite or renumber existing commitments.
3. **Zero-delta escape.** When the new scope really adds no misreading risk and no new commitment (a purely mechanical extension), say so in one line in the Extension Round section of `03-slice.md`. It is an explicit declaration, never a silent skip.

# Step 3c — Design delta

Classify the UX impact of the new scope per `design/_lane.md`, and record the value of each new slice as `ux-impact` in its slice file. A design delta exists when design is needed and a new slice touches a surface or a state that `02c-craft.md` does not list in `surfaces:`. The amend adds screens for the new surfaces on the design surface, and records a new approval (`design/_surface.md`). Hold the result for Step 6.

# Step 4 — Write New Slice Files

For each confirmed new slice, write the draft of `03-slice-<new-slug>.md`, and put it, per the template in `intake/extend/_artifacts.md`: the frontmatter (`status: defined`, `source`, `source-ref`, `extension-round`, refs to `04-plan-<new-slug>.md` and `05-implement-<new-slug>.md`) and the body (Goal, Why This Slice Exists, Scope, Acceptance Criteria, Dependencies on Other Slices, Risks).

# Step 5 — Update Master Slice Index (non-destructive)

Get the current `03-slice.md` (`record get "<root>" <slug> 03-slice.md`). Change it in these ways:

1. **Increment `total-slices`** by the number of new slices.
2. **Append the new entries** to the `slices:` YAML array, per the roster entry in `intake/extend/_artifacts.md`. Do not modify existing entries.
3. **Update `updated-at`** to the current ISO 8601 timestamp.
4. **Append a new section** to the markdown body: the `## Extension Round <N>` section of `intake/extend/_artifacts.md` (the source, the New Slices Added table, the Motivation).
5. **Reconcile the counts that the author wrote in the existing body.** The body that the slice stage wrote has slice numbers that the rendered view prints exactly. They do not recompute from the roster, so they go stale as soon as `total-slices` grows. Two places:
   - **A summary sentence that states a slice total** (for example "These 5 slices cover…"): change the number to the new total, so the prose agrees with the header, the figure and the metric row. Those come from the roster and are already correct.
   - **The `## Recommended Order` list:** append the new slices as more numbered entries, each with a one-line reason, so the order shows the full set. Continue the numbering: do not renumber, reorder or remove existing lines.

   This is the only edit to the existing body text. It is clerical: it corrects a stale count and extends a list. It is not a change to existing slice entries, slice files or `status: complete` rows.

Do not modify any existing slice entry in the `slices:` array. Do not change `status: complete` on a done slice. Item 5 touches only prose that the author wrote, never the roster. Then write the draft of `03-slice.md`, and put it.

---

# Step 6 — Update Index (the single authoritative index write)

This is the one step that writes `00-index.md`: every earlier step only computed. Get the index (`record get "<root>" <slug> index`), and apply these additively:

1. `updated-at` → the current ISO 8601 timestamp.
2. Append every new `03-slice-<new-slug>.md` file to `workflow-files`.
3. Append the **RIM delta** entries of Step 3b to `intent-risks`, and the **charter delta** entries to the `charter` ledger. Never rewrite or renumber existing entries. Append each `open` risk to `open-questions`.
4. **Point the forward pointers at the new work.** Without this, `/wf status` and the resume point at a slice that is already done.
   - Set `next-command: wf-plan` and `next-invocation: "/wf plan <slug> <first-new-slice-slug>"`.
   - When `00-index.md` records `origin-packet`, set `next-invocation: "/wf campaign <source-slug>"` instead: the walk runs the driver on the new slice.
   - On a design delta of Step 3c, instead raise `ux-impact`, and set `next-command: wf-design`, `next-invocation: "/wf design <slug> amend"` (it draws the new screens) and `progress.design: in-progress`. With no `02c-craft.md`, set `"/wf design <slug>"`, and leave `progress.design`.
   - When `03-slice.md` has `best-first-slice` and every earlier slice is complete or skipped, set it to the first new slice.
5. **Revive a complete or closed parent.** Extension means the workflow has live work again. When `status` is `complete` or `closed`, set `status: active` and `current-stage: slice`. Leave `close-reason` and `closed-at` in place as history: the revival is visible, not erased.

Do not change `selected-slice` or any field not listed above. Write the draft of `00-index.md`, and put it at once, per [_control-file-ownership.md](../_control-file-ownership.md).

---

# Chat return contract
Return per [_chat-return.md](../_chat-return.md): a narrative lead (what this extension added, the key decisions and counts, the top risk), then this receipt:
- `slug: <slug>`
- `wrote:` the list of new slice files written, and `03-slice.md` (updated)
- `new-slices:` the new slice slugs, with one-line goals
- `extension-source:` from-review | from-retro | user request
- `options:`
  - `/wf design <slug> amend` — draw the new surfaces first (default on a Step 3c design delta)
  - `/wf campaign <source-slug>` — continue the walk (default when `origin-packet` is set)
  - `/wf plan <slug> <first-new-slice-slug>` — plan the first new slice (default otherwise)
  - `/wf plan <slug> all` — if you want to plan all new slices in parallel
  - `/wf status <slug>` — see full workflow state including all slices
- at most 2 bullets on the dependency order, when new slices depend on work in progress
