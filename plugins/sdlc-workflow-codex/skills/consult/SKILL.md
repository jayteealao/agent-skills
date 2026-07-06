---
name: consult
description: Consult external models as READ-ONLY oracles — plan critique, code/implementation review, design analysis, diagnosis, second opinion. Fans out to all available providers by default ($consult <question>); a provider keyword ($consult codex|claude|gemini|openai|<provider>/<model> <question>) narrows to one. Returns a panel of opinions and never edits the repo. The model may invoke it autonomously when a second opinion adds material value; model-initiated runs pin a free subscription CLI (codex/claude).
argument-hint: "[codex|claude|gemini|openai|<provider>/<model>] <question>"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../wf/reference/_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

Before executing, read `../../references/native-operating-model.md` and `../../references/artifact-interop.md` (the latter only if you will embed an opinion into an `.ai/` artifact).

# What this is

`$consult` sends a question to one or more external AI models acting as **read-only
oracles** and returns their written opinions — plan critique, code/implementation
review, design trade-off analysis, diagnosis, second opinion. It is **advisory
only**: the sub-agents can Read/Glob/Grep the repo but **cannot Edit, Write, or run
Bash**. It writes no code (write/delegate mode is deferred). It generalizes the
single-model rescue pattern into a **multi-model panel** — by default it fans out
to every available provider in parallel.

The model may invoke this **autonomously** when a second opinion adds material value
(the `$wf` stages call out where). Never triggered by a hook — only by a deliberate
model or user decision. Dispatch sends repo/artifact content to a third party, so
autonomous runs pin a free CLI and stay sparing (see Step 0).

# Step 0 — Resolve

1. **Cost safety (autonomous runs).** No consent flag gates `$consult` — it runs on
   demand. When YOU (the model) self-initiate rather than the user typing `$consult`
   explicitly, **pin a free subscription CLI** — pass `codex` (or `claude`) so the
   run costs nothing. Never bare-fan-out (which bills the paid REST oracles) on a
   self-initiated run; reserve paid fan-out for an explicit user request.

2. **Providers (positional parse).** If the first token is a provider keyword
   (`codex`, `claude`, `gemini`, `openai`) or a `"<provider>/<model>"` token
   (contains `/` → Vercel AI Gateway), pin it; otherwise the whole argument is the
   question → fan out to all available providers.

3. **Intent + target.** Infer review/critique/diagnose/compare from the prose, and
   what to read (a path, a `git diff`, or the repo). Resolve the repo root.

# Step 1 — Build the prompt

Write the prompt to `.ai/consult/<unix-ts>.prompt.md` (ephemeral; create the dir if
needed): a short intent preamble (ask for VERDICT → FINDINGS → RECOMMENDATION) +
the question. **The CLI oracles (`codex`, `claude`) read the live repo
(`cwd=repoRoot`); the REST oracles (`gemini`, `openai`, gateway) are prompt-only —
inline the relevant file/diff content when REST providers are in play.**

# Step 2 — Dispatch read-only (fan-out)

Resolve this skill's own directory `<skill-dir>` (where this SKILL.md is loaded
from) and run its runner:

```bash
node "<skill-dir>/scripts/dispatch.mjs" read-only <repoRoot> <promptFile> [provider ...]
```

It spawns the CLI oracles isolated + read-only (Codex `--sandbox read-only`, Claude
`--tools "Read,Glob,Grep"`), calls the REST APIs, caps parallelism, and prints one
JSON object `{ results, skipped, bare }`. Exit `0` ok · `2` usage.

# Step 3 — Synthesize + embed

Present a panel: per provider, its **evidence-scope** badge (`repo-aware` vs
`prompt-only`), one-line verdict, and key points; name every skipped/errored
provider. Add a consensus/divergence line, **weighting `repo-aware` opinions more
heavily** — a `prompt-only` oracle's "disagreement" may be missing context, not
real dissent. When consulting ON a workflow artifact `<stem>.md`, write the panel
as a free fragment `<stem>.NN-consult.html.fragment` next to it (raw-inline,
`@scope`-contained, no sibling `.yaml`); see `../../references/narrative-fragments.md`.

# Step 4 — Result

```
CONSULT_RESULT:
  providers: <providers that returned an opinion>
  skipped: <provider (reason), … | none>
  verdict: <one-line synthesis — consensus or the material divergence>
  fragment: <path | none>
  cost: <per-token note>
```

**Cost.** A bare fan-out hits every provider; the subscription CLIs (`codex`,
`claude`) are free per call, the REST oracles (`gemini`, `openai`, gateway) bill
per-token on every invocation. Pin a CLI (`$consult codex …`) to stay free, or name
one paid model (`$consult openai …`). Model-initiated auto-runs always pin a free CLI —
the paid REST oracles are never fanned out unattended.

Callers: user-invocable, and the model **auto-invokes** it when a second opinion adds
material value — at the plan, design, review, and diagnosis (verify / root-cause)
gates, including during the autonomous `$wf auto` driver. Model-initiated runs pin a
free CLI (`codex`/`claude`) and stay sparing. Supersedes the rescue pattern conceptually.
