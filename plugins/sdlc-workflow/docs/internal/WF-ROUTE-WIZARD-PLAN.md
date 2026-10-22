# WF-ROUTE-WIZARD-PLAN — describe the work, and `/wf` routes it

Status **BUILT in v9.201.0 (W0–W3, W5, W6); W4 (the Desktop band) deferred by D8** · Date **2026-10-20**, updated **2026-10-22** · Owner **jayte**

**As built.** `skills/wf/reference/route.md` holds the router, help and the bare `/wf` question. `SKILL.md` Step 0 items 2, 3 and 7 load it, and item 8 is the disk check; Step 0.5 and the error texts are gone. The Arguments cells are exact; `plan` is two choices (`<slug> [<slice> [text]]` · `<slug> all`) so that `|` always separates single tokens. Two choices differ from section 4: the 35 review dimensions and aliases do not fit the `SKILL.md` word budget, so `review` and `docs` check `<dimension>`, `<aggregate>` and `<primitive>` in their own reference and route a miss (`/wf review the auth changes` dispatches to `review.md`, which routes it); `ship` checks `<env>` and `probe` checks `<path>` the same way. D5 skips the question only for `/wf intake <text>` with no mode word, because an explicit mode writes without a question; a named mode gets the confirm question. The confirm and clarifying questions are intent-bearing, so a headless run prints the question and ends. G3 found `shape` and `slice`: both declared `[focus area]` and read nothing; both now read the text as a focus hint. Tests: `tests/unit/skills/route-wizard.test.mjs` (a grammar matcher runs the section 4.1 rows against the Arguments column), six eval cases.

## 1. Why

To use `/wf` today, the person must know the 19 keys and their argument shapes. When the first word is not a key, Step 0 stops with an error ([SKILL.md](../../skills/wf/SKILL.md) Step 0 item 3). When a stage key gets an unknown slug, Step 0.5 stops with "Did you mean". A bare `/wf` prints the key tables. The Desktop picker band is a key-first picker. It helps a person who knows the key but has forgotten the slug.

The person wants to write what they want in plain words. `/wf` must say how it understood the words, name the command, wait for a yes, and then run the command. The person also wants to ask `/wf` questions about `/wf` itself.

Part of this already exists one level down. `/wf intake <description>` has a suggest-and-confirm classifier ([intake.md](../../skills/wf/reference/intake.md) "Auto-route classification"). That classifier chooses only among intake modes, and the person must type `intake` first.

## 2. Decisions

PO decisions of 2026-10-20:

| Item | Decision |
|---|---|
| D1 — when a typed key wins | **A key wins when the dispatcher can resolve the full command.** When the arguments do not fill the key's dispatch, the text goes to the router. |
| D2 — the intake classifier | **Intake keeps its own classifier.** The router does not copy the intake signal table. |
| D3 — help | **`/wf` answers questions about `/wf`.** |
| D4 — the end of a route | **The router runs the command after the yes.** It does not fill the command into the prompt. |
| D5 — new work | **When intake is the only route, the router asks no question.** It goes to intake at once, and intake asks its own questions. |
| D6 — help sources | **Help reads `SKILL.md` and the reference files only.** It does not read the docs site. |
| D7 — the `plan.md` gaps | **Fix them in this plan** (section 9a). |
| D8 — the Desktop band | **Deferred.** This plan assumes that the mod is off (section 9). |
| D9 — the dispatcher | **No code dispatcher in this plan.** Step 0 stays text that the model follows; no hook and no resolver script (section 4.3). |
| D10 — the disk check | **Step 0 looks at the disk only when a token names something on the disk**: a slug, a slice or a branch (section 4.3). |

## 3. The end state

```
/wf <tokens>
  │
  ├─ the dispatcher resolves the full command ──► the key runs, as today (no question)
  │
  └─ it does not ──► reference/route.md
                       ├─ a question about /wf ──► help answer (read-only, no question)
                       ├─ one clear route      ──► one confirm question ──► yes ──► the key runs
                       ├─ two close routes     ──► one question with both  ──► pick ──► the key runs
                       └─ no clear route       ──► one clarifying question ──► classify again
```

A bare `/wf` asks "What do you want to do?" (section 7). The answer goes into the same router.

The key count stays 19. `route` and `help` are not keys. They are a reference that the dispatcher loads.

## 4. D1 — "the dispatcher resolves the full command"

### 4.1 The rule

The dispatcher resolves the full command when all of these conditions are true:

1. The first token is a key. For a key with sub-keys, the second token is a sub-key.
2. Every required argument is present. A required slug exists in `.ai/workflows/INDEX.md`. Where the key accepts them, `pr#N` and an existing branch also count.
3. Every token after the key fits a token class that the key declares (section 4.2). A free-text tail is allowed only where the key declares one.

When any condition is false, the dispatcher loads `reference/route.md` with all the tokens, the key included.

| Command | Result | Reason |
|---|---|---|
| `/wf plan export` (slug exists) | dispatch | slug resolves |
| `/wf plan export api-client use the cache` (slice exists) | dispatch | `plan` declares a feedback tail after the slice |
| `/wf plan export the API slice first` | route | `the` is not a slice or `all`; the feedback tail of `plan` comes only after a slice |
| `/wf plan export api-clinet use the cache` | route | slice miss; the router offers `api-client` first |
| `/wf plan the migration` | route | `the` is not a slug |
| `/wf plan exprot` | route | slug miss; the router offers `export` first (section 6.3) |
| `/wf implemnt export` | route | not a key; the router offers `implement export` first |
| `/wf implement` | route | the required slug is missing; the router asks which workflow |
| `/wf review the auth changes` | route | `the` is not a slug, a dimension or `sweep` |
| `/wf review security` | dispatch | `security` is a dimension |
| `/wf status` | dispatch | the slug of `status` is optional |
| `/wf status of the export` | route | `of` is not a slug, `deep` or `advise` |
| `/wf intake the dashboard is blank` | dispatch | `intake` declares a description tail; intake's own classifier then runs (D2) |
| `/wf the dashboard is blank` | route | not a key |
| `/wf help` | route | not a key; the router answers help |

### 4.2 The grammar — the Arguments column of `SKILL.md`

The rule needs a grammar for each key. Today a reference resolves its first token by itself. The dispatcher has only the rows of `SKILL.md` and Step 0.5 for five keys.

The Arguments column of the key tables in `SKILL.md` becomes the grammar. The model already reads that column in Step 0. No new file holds the grammar.

1. Make each Arguments cell exact. Each position names its token class: `<slug>`, `<slice>`, `pr#N`, `<branch>`, `<dimension>`, `<primitive>`, `<path>`, a mode word, or a literal word such as `all`, `sweep`, `advise` or `deep`. Square brackets mark an optional position.
2. Mark a free-text tail as `[text]` or `<text>`, and only where the key's reference reads the tail (G3, section 9a). For example, the `plan` cell becomes `<slug> [<slice> [text] | all]`.
3. Deferred with the band (section 9): `hooks/mod/catalog.ts` reads its argument needs from the same column, and a parity test checks the two.

### 4.3 D9 — the dispatcher stays text; the disk check

**Decided 2026-10-21 (D9): no code dispatcher in this plan.** The dispatcher stays Step 0 of `SKILL.md`: text that the model follows. The `wf dispatch: key=… · args=… · reference=…` line that the person sees is model output (Step 0 item 7). This plan adds no hook and no resolver script.

The model checks every token from the Arguments column (section 4.2), with no tool call, except a token that names something on the disk (D10):

| Token class | How Step 0 checks it | Tool calls |
|---|---|---|
| key, sub-key, mode word, `all`, `sweep`, `advise`, `deep`, `pr#N` | against the tables of `SKILL.md`, which are already loaded | 0 |
| `<dimension>`, `<primitive>` | against the dimension and primitive lists in the key's row | 0 |
| `<slug>` | `grep -P "^<slug>\t" .ai/workflows/INDEX.md`, as Step 0.5 does today | 1 |
| `<slug>` and `<slice>` together | the same `grep`, and a `grep` of the roster rows of `.ai/workflows/<slug>/03-slice.md`, in one Bash call | 1 |
| `<branch>` | `git branch --list <branch>`, in the same Bash call as the slug check | 0 more |
| `<text>` | none; the key accepts any text in that position | 0 |

On a miss, the router needs the open workflows and the slices for its near match (section 6.1). The router reads them with one more tool call. A command that resolves never pays for that read.

Only tokens in `[A-Za-z0-9#._/-]` go into a `grep` or a `git` call. A token with another character cannot be a slug, a slice or a branch, so Step 0 counts it as a miss with no call. Description text never enters a shell command (the surface-sweep rule "never pass `/wf` as Bash argv").

**The mod parser, for the later band plan.** One code parser exists, in the mod. When the mod is on, its `command.run` handler gets every `/wf` command before the model does ([register.ts](../../hooks/mod/register.ts) `on('command.run')`). `wfCommandOf` ([active.ts](../../hooks/mod/active.ts)) splits the command into key, slug and slice, and `stepFor` decides whether to open the picker band. The handler can replace the command text (`return { text }`). The parser prints nothing, and it does not check that a slug or a slice exists. This plan assumes that the mod is off (D8) and does not use this code. A later plan can move the disk check into `command.run`, with a slug and slice table that the handler builds for each command. Then Step 0 needs no tool call when the mod is on.

### 4.4 What changes in Step 0

| Step | Today | After |
|---|---|---|
| 0.2 — no arguments | print the key tables, ask, STOP | ask "What do you want to do?" (section 7) |
| 0.3 — not a key | unknown-key error, STOP | load `route.md` |
| 0.5 — slug miss on five keys | "Did you mean", STOP | load `route.md` with the near match as a candidate |
| 0.5 — a key whose arguments do not fit | the reference resolves the token by itself | load `route.md` |
| sub-key missing (`loop`, `project`) | list the sub-keys, ask, STOP | no change; the list is already a route question |

The Step 0 error texts leave `SKILL.md`. The words that `SKILL.md` saves pay for the disk-check table of section 4.3.

## 5. D2 — intake keeps its classifier

The router does not choose an intake mode from a description. When the router decides that the text is new work, the route is `/wf intake <description>`. Intake branch 4 then runs its own suggest-and-confirm classifier.

The router names an intake mode only when the person names it. "Let me brainstorm the onboarding" names `brainstorm`, so the route is `/wf intake brainstorm the onboarding`. Intake then takes the explicit-mode branch and asks nothing more.

When `/wf intake <description>` is the only route, the router asks no question (D5). It prints the `wf dispatch:` line and loads intake. Intake then asks its own questions. This is safe, because intake writes nothing before those questions. When intake is one of two or more routes, the router asks the confirm question of section 6.3, and intake is one option.

## 6. The router — `reference/route.md`

### 6.1 Inputs

- the tokens that did not resolve, and the reason Step 0 found
- the key tables of `SKILL.md`, which are already loaded
- the open workflows from `INDEX.md`: the slug, the title, `current-stage`, `selected-slice` and `next-invocation` from each `00-index.md`

The router loads no other reference before it classifies.

### 6.2 The targets

| The text is about | Route |
|---|---|
| `/wf` itself: how, what, which, why, the difference between | help (section 8) |
| an open workflow, with no stage named ("keep going on export") | that workflow's `next-invocation` |
| an open workflow and a stage or action ("review the export work", "ship the login PR") | `/wf <key> <slug>` |
| the state of all work ("what should I work on next") | `/wf status advise` |
| the state of one workflow ("where is export") | `/wf status export` |
| checking that built work runs ("does it actually work") | `/wf probe <slug>`, or `/wf probe sweep` with no slug |
| a loop, a project contract, docs or design setup | the matching key or sub-key |
| new work of any kind | `/wf intake <description>` (section 5) |

The router matches an open workflow by slug, by title, and by a near match (Levenshtein distance ≤ 2 or a substring, as Step 0.5 does today).

### 6.3 The confirm question

When the only route is intake, the router skips this question (section 5). For every other route, the router asks one gate question per [_gate-question.md](../../skills/wf/reference/_gate-question.md):

> I read this as: \<one-line restatement\>. Run `/wf <command>`?
> - **\<the best route\> (Recommended)** — one line: what the route does and what it writes.
> - **\<the second route\>** — present only when a second route is close.
> - **Something else** — the person describes the work again, and the router classifies the new text.

The question shows the full command, so the person learns the keys. When the route starts a driver (`auto`, `yolo`, `campaign`) or an outward act (`handoff`, `ship`), the option line says so. The router never runs a route before the yes. It routes to `yolo` only on the yolo host rule of Step 0 item 4.

After the yes, the router prints the `wf dispatch:` line and loads the reference of the chosen command. The key's own Step 2 summary ends the run.

### 6.4 The clarifying question

When no route is clear, the router asks one question with at most four options, plus the free-text answer. When the second answer is also unclear, the router lists the key tables and stops. The router never asks more than two questions before it runs a route or stops.

### 6.5 What the router never does

- The router never runs a command without the person's yes.
- The router never writes an artifact. The routed key writes.
- The router never chooses an intake mode that the person did not name (D2).
- The router never creates or renames a slug.

## 7. A bare `/wf`

The skill asks one question:

> What do you want to do?
> - **Continue `<slug>` — next: `/wf <next-invocation>`** — for the three most recent open workflows
> - **Ask a question about /wf**
> - **Show all keys**
> - free text: describe the work

A free-text answer goes to the router. "Show all keys" prints the key tables and stops, as today. "Continue" is the confirm question already, so it runs at once.

## 8. D3 — help

### 8.1 What counts as help

The text asks about `/wf` itself. Examples: "help", "how do I ship a hotfix", "what does campaign do", "what is the difference between fix and rca", "why did verify stop", "which key reviews a PR". A question about the code of the project is not help. "Why does the export fail" is new work (`rca` through intake).

### 8.2 The sources, in this order

1. The key tables of `SKILL.md`, which are already loaded.
2. The `description` and `argument-hint` frontmatter of the key's reference file.
3. The section of the reference file that the question names. For an intake mode, this is `reference/intake/<mode>.md`.

Help reads no docs site page (D6). The reference files are what the keys run, so an answer from them cannot drift from the behaviour.

### 8.3 The answer

- The answer is read-only. Help asks no confirm question and writes nothing.
- The answer names the source file of each fact.
- When the question is about a task ("how do I ship a hotfix"), the answer ends with the command and one gate question: run it now, or stop. That question is the same confirm question as section 6.3.
- The Step 2 summary is `wf help: <topic>`, with `Artifacts: none`.

## 9. The Desktop band — deferred

**Decided 2026-10-21 (D8): this plan assumes that the mod is off.** The router, help and the bare `/wf` question live in the skill only. They work the same on every host. This plan does not change `hooks/mod/`. The band is a later plan.

Today the band opens the key picker on a bare `/wf` ([picker.ts](../../hooks/mod/picker.ts) `stepFor`). When the mod is on, the band keeps doing this. The skill's question of section 7 then appears only when the band is off, or when the person sends a bare `/wf` without the band.

The recommendation for the later plan: the band's first step becomes the question of section 7. It shows the "Continue" rows, an "Ask about /wf" row, a "Show all keys" row that opens the key picker of today, and a text input with the label "Describe it". A row or the input sends the text as `/wf <text>`. The router then runs in the turn. The band never classifies by itself, because the classifier is the model.

## 9a. D7 — the `plan.md` gaps

A read of `plan.md` Step 0 item 6 on 2026-10-20 found two gaps. Both are in `plan.md`, not in the dispatcher.

**G1 — the text after a slice is lost when the slice has no plan.** `/wf plan <slug> <slice> <text>` uses the text only in mode (c), directed fix, which needs an existing `04-plan-<slice>.md`. Mode (e), single plan, does not read the text. The model can use the text informally, or it can drop it.

The fix: in mode (e), the text is **planning guidance**.
1. Write the text to `po-answers.md` with `stage: plan` and `kind: guidance`.
2. Give the text to every research sub-agent as a PO directive.
3. Do not ask a discovery question that the text already answers. Cite the text in the plan's `## Applied Learnings` or the decision that it settles.

**G2 — the slice name is not checked.** Step 0 item 1 takes the second argument as the slice name and does not compare it with the roster in `03-slice.md`. A typo can make `04-plan-<typo>.md` for a slice that does not exist.

The fix: Step 0 checks the slice name against the roster before it chooses a mode. On a miss, it stops with the near match: *"Unknown slice `<name>` in `<slug>`. Did you mean `<best-match>`? Retry: `/wf plan <slug> <best-match> <text>`"*. `plan.md` keeps this check although the dispatcher also checks the slice (section 4.3). The reference must not depend on the dispatcher for a check that protects a write.

**G3 — the same gap in other keys.** W1 writes a free-text tail into the grammar only where a reference reads that tail. A test checks that each declared tail names the mode that reads it. When W1 finds another key that accepts a tail and drops it, W1 records the key here, and W5 fixes it.

## 10. Open points

1. **Deferred 2026-10-21 (D8):** the Desktop band. This plan assumes that the mod is off (section 9).
2. **Decided 2026-10-20 (D5):** the router skips its question when intake is the only route.
3. **Decided 2026-10-21 (D9, D10): no code dispatcher. Step 0 looks at the disk only when a token names something on the disk** (section 4.3). Each look is one tool call, and each tool call adds one model round-trip of a few seconds. The five stage keys make one call today (Step 0.5). `handoff`, `ship`, `retro`, `probe`, `auto`, `yolo`, `campaign` and `loop` gain one call when a slug is typed. `status`, `review <dimension>`, `intake <text>` and `docs <primitive>` make none.
4. **Decided 2026-10-20 (D6):** help reads `SKILL.md` and the reference files only.

## 11. Shared touch points

- `skills/wf/SKILL.md`: Step 0 items 2, 3 and 7, Step 0.5, the description, and the error texts that leave.
- `skills/wf/reference/route.md` (new).
- `tests/evals/cases/unknown-key.json`: the expected result changes from the error to a route question.
- `prose-budget.json` and the load baseline (`node scripts/measure-load.mjs --write`).
- `skills/wf/reference/plan.md`: Step 0 items 1 and 6 (section 9a).
- `_host-invocation.md`: the router and help run on every host.
- The docs site: `reference/commands.html` and `guides/choose-your-entry.html`; `README.md`; `CHANGELOG.md`.

## 12. Waves

All waves edit `SKILL.md` or the grammar, so they run one after another.

| Wave | Content | Depends on |
|---|---|---|
| W0 | Red tests and evals first (section 13) | — |
| W1 | The exact Arguments column (section 4.2), the disk-check table in Step 0 (section 4.3), the tail-reader test (G3); behaviour on a full command does not change | W0 |
| W2 | `route.md`: the targets, the confirm and clarifying questions, the intake skip (D5); Step 0 items 3 and 0.5 load it | W1 |
| W3 | Help (section 8) and the bare `/wf` question (section 7) | W2 |
| W4 | Deferred: the Desktop band, the catalog parity test (section 9), and the disk check in the mod's `command.run` (section 4.3) | — |
| W5 | `plan.md` G1 and G2 (section 9a), and each key that W1 records under G3 | W1 |
| W6 | Docs site, README, evals, pins, CHANGELOG; one release | W2–W5 |

W5 edits `plan.md` and no file that W2 or W3 edit. W5 can run in parallel with W2 and W3.

## 13. Tests (red first)

- The dispatcher (evals): each row of the table in section 4.1 gives the result in its row.
- No `grep` or `git` call in Step 0 gets a token from the free-text tail, or a token with a character outside the safe set.
- A full command loads no `route.md`, and its core load does not grow by more than the disk-check table.
- The router: a slug miss offers the near match first; a typo key offers the corrected key first; "keep going on `<slug>`" offers that workflow's `next-invocation`.
- The router asks at most two questions before it runs a route or stops, and it writes no artifact.
- D2: a description without a mode word routes to `/wf intake <description>`; a description that names `brainstorm` routes to `/wf intake brainstorm …`.
- D5: when intake is the only route, the router asks no question and loads intake; when intake is one of two routes, the router asks.
- The disk check: `status`, `review security`, `intake <text>` and `docs reference` make no tool call in Step 0; `plan <slug>` and `plan <slug> <slice>` make one.
- Help: "what does campaign do" gives a read-only answer with source files and writes nothing; "how do I ship a hotfix" ends with the confirm question; "why does the export fail" is not help; help reads no file under `docs/site/`.
- G1: `/wf plan <slug> <slice> <text>` with no plan writes the text to `po-answers.md` as `kind: guidance`, and the plan cites the text.
- G2: `/wf plan <slug> <typo>` stops with the near match and writes no plan file.
- G3: every free-text tail in the grammar names the mode of its reference that reads the tail.
- The bare `/wf` question lists at most three open workflows, newest first.
- Evals: `unknown-key` expects a route question. New evals: `route-description`, `route-typo-key`, `route-slug-miss`, `help-key`, `help-task`.
