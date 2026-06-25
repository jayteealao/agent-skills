---
name: consult
description: Consult external models as READ-ONLY oracles — plan critique, code/implementation review, design analysis, diagnosis, second opinion. Fans out to all available providers by default ($consult <question>); a provider keyword ($consult codex|claude|gemini|openai|<provider>/<model> <question>) narrows to one. Returns a panel of opinions and never edits the repo. Always explicit/opt-in; gated by externalDispatch.enabled.
argument-hint: "[codex|claude|gemini|openai|<provider>/<model>] <question>"
---

# External Output Boundary (MANDATORY)
Consultation prompts and opinions are working context. When the question touches an SDLC workflow, keep artifact paths, stage names, and command internals out of any external-facing output. The panel and the optional fragment are for the developer, not for publishing.

Before executing, read `../../references/native-operating-model.md` and `../../references/artifact-interop.md` (the latter only if you will embed an opinion into an `.ai/` artifact).

# What this is

`$consult` sends a question to one or more external AI models acting as **read-only
oracles** and returns their written opinions — plan critique, code/implementation
review, design trade-off analysis, diagnosis, second opinion. It is **advisory
only**: the sub-agents can Read/Glob/Grep the repo but **cannot Edit, Write, or run
Bash**. It writes no code (write/delegate mode is deferred). It generalizes the
single-model rescue pattern into a **multi-model panel** — by default it fans out
to every available provider in parallel.

Always explicit — never triggered by a hook or automatically inside a stage.
Dispatch sends repo/artifact content to a third party, so it is gated by a single
machine-wide consent flag.

# Step 0 — Resolve

1. **Consent gate.** Dispatch is OFF by default. The runner re-checks
   `externalDispatch.enabled` in `~/.sdlc/hub-config.json` and exits `3` when it is
   not `true`. If off, STOP with: *External-model dispatch is off. Set
   `"externalDispatch": { "enabled": true }` in `~/.sdlc/hub-config.json` to consent.*

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
JSON object `{ results, skipped, bare }`. Exit `0` ok · `2` usage · `3` gate off.

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
one paid model (`$consult openai …`).

Callers: user-invocable, and offered as an optional second opinion by `$wf plan`,
`$review`, and `$wf design`. Supersedes the rescue pattern conceptually; always opt-in.
