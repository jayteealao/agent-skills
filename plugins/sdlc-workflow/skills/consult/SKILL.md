---
name: consult
description: Consult external models as READ-ONLY oracles — plan critique, code/implementation review, design analysis, diagnosis, second opinion. Fans out to all available providers by default (codex, claude, gemini, openai; a provider keyword narrows to one). Returns a panel of opinions and never edits the repo. The model may invoke it autonomously when a second opinion adds material value; model-initiated runs pin a free subscription CLI (codex/claude).
version: 1.1.0
disable-model-invocation: false
argument-hint: "[codex|claude|gemini|openai|<provider>/<model>] <question>"
---

# External Output Boundary (MANDATORY)
Consultation prompts and opinions are working context. When the question touches an SDLC workflow, treat artifact paths, stage names, and command internals as private — do not echo them into commit messages, PRs, or any external-facing output. The opinion panel and the optional fragment are for the developer, not for publishing.

# What this is

`consult` sends a question to one or more external AI models acting as **read-only
oracles** and brings back their written opinions — a plan critique, a code or
implementation review, a design trade-off analysis, a diagnosis, a second
opinion. It is **advisory only**: the sub-agents can Read/Glob/Grep the repo but
**cannot Edit, Write, or run Bash**. It writes no code and proposes no patch.
(Write/delegate mode is deferred — EXTERNAL-MODEL-DISPATCH-PLAN D12.)

It generalizes the single-model `codex:rescue` pattern into a **multi-model
panel**: by default it fans out to every available provider in parallel and
returns a panel of opinions plus a one-line consensus/divergence read.

The model may invoke this skill **autonomously** when a second opinion adds material
value (the `/wf` stages call out where). It is still never triggered by a hook or by
serving — only by a deliberate model or user decision. Dispatch sends repo and
artifact content to a third party, so autonomous runs pin a free CLI and stay
sparing (see Step 0).

# Step 0 — Resolve the request

1. **Cost safety (autonomous runs).** No consent flag gates `consult` — it runs on
   demand. But when YOU (the model) self-initiate a consult rather than the user
   typing `/consult` explicitly, **pin a free subscription CLI** — pass `codex` (or
   `claude`) as the provider so the run costs nothing per call. Never bare-fan-out
   (which hits the paid REST oracles per-token) on a self-initiated run; reserve the
   paid fan-out for an explicit user request that names a paid provider.

2. **Resolve providers (wf-style positional parse).** Look at the first token of
   `$ARGUMENTS`:
   - If it is a **provider keyword** (`codex`, `claude`, `gemini`, `openai`) or a
     `"<provider>/<model>"` token (contains `/`, routed through the Vercel AI
     Gateway, e.g. `anthropic/claude-opus-4-8`, `openai/gpt-5.5`), **pin** that
     provider; the rest is the question.
   - Otherwise the whole of `$ARGUMENTS` is the question → **fan out** to all
     available providers (the default).
   Pass the resolved provider(s), if any, straight through to the runner; do not
   pre-filter on availability yourself — the runner reports which it skipped.

3. **Infer intent and target from the prose** (no flags, D15). From the question
   and the artifact in context, decide:
   - **intent**: review / critique / diagnose / compare / second-opinion — this
     shapes the prompt preamble, it is not a keyword.
   - **what to read**: a specific path (e.g. `.ai/workflows/<slug>/04-plan.md`), a
     diff (`git diff`, `git diff <base>...HEAD`), or "the repo." Resolve the repo
     root (the git toplevel of the cwd).

# Step 1 — Build the prompt

Compose a single prompt and write it to `.ai/consult/<unix-ts>.prompt.md` (create
`.ai/consult/` if needed; these files are ephemeral and safe to delete — no hooks
fire on them):

- A short **preamble** for the inferred intent — e.g. *"You are a senior reviewer.
  Give a one-line VERDICT, then the key FINDINGS (most material first), then a
  RECOMMENDATION. Be specific and skeptical."*
- The **question** verbatim.
- **Evidence handling (important):** the CLI oracles (`codex`, `claude`) run with
  `cwd=repoRoot` and read the live tree themselves — for them, a path/diff
  *pointer* is enough. The REST oracles (`gemini`, `openai`, gateway models) are
  **prompt-only** — they see nothing but this file. So when REST providers are in
  play, **inline the relevant file/diff content** into the prompt (fenced), within
  reason. One prompt file is sent to every provider; the CLI oracles simply have
  the extra ability to read beyond what you inlined.

# Step 2 — Dispatch read-only (fan-out)

Run the runner (it spawns the CLI oracles isolated + read-only, and calls the REST
APIs; it caps parallelism and never writes):

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/consult/scripts/dispatch.mjs" read-only <repoRoot> <promptFile> [provider ...]
```

- Omit `[provider ...]` for the bare fan-out; pass the pinned provider(s) otherwise.
- It prints one JSON object: `{ results: [{provider, ok, text, costUsd, evidenceScope, error}], skipped: [{provider, reason}], bare }`.
- Exit `0` = well-formed (per-provider failures are inside `results`); `2` = usage
  error.

# Step 3 — Synthesize and embed

1. **Panel.** For each `ok` result, present the provider, its **evidence scope**
   badge (`repo-aware` vs `prompt-only`), its one-line verdict, and 2–4 key
   points. Name every `skipped` provider with its reason. Name any provider whose
   `ok` is false with its error (don't hide failures).

2. **Consensus / divergence — weighted by evidence (the asymmetry caveat).** Add
   one line summarizing where the oracles agree and where they diverge. **A
   `prompt-only` oracle's "disagreement" may just be missing context, not real
   dissent** — weight `repo-aware` opinions more heavily on repo-specific claims,
   and say so when a divergence looks like an evidence artifact rather than a true
   difference of judgment.

3. **Embed (only when consulting ON an artifact).** If the question targets a
   workflow artifact `<stem>.md`, write the panel as a free narrative fragment
   next to it: `<stem>.NN-consult.html.fragment` (e.g.
   `04-plan.01-consult.html.fragment`). It is raw-inlined below the rendered page
   with `@scope` CSS containment (no contract, no sibling `.yaml`). Keep it
   self-contained — semantic HTML, one small scoped `<style>` if needed. For a
   standalone consult with no artifact target, skip the fragment.

# Step 4 — Emit the result

End with the machine-readable block, then a short narrative summary:

```
CONSULT_RESULT:
  providers: <comma-separated providers that returned an opinion>
  skipped: <provider (reason), …  | none>
  verdict: <one-line synthesis — consensus, or the material divergence>
  fragment: <path to the .html.fragment | none>
  cost: <per-token note, see below>
```

**Cost note (C2).** A bare fan-out hits **every** available provider. The
subscription CLIs (`codex`, `claude`) cost nothing per call; the REST oracles
(`gemini`, `openai`, gateway models) bill **per-token to your API key on every
invocation**. To stay free, pin a subscription CLI: `consult codex <question>` or
`consult claude <question>`. To pin one paid model, name it:
`consult openai <question>` or `consult anthropic/claude-opus-4-8 <question>`.

# Callers

`consult` is user-invocable, and the model also **auto-invokes** it when a second
opinion adds material value — at the plan, design, review, and diagnosis (verify /
root-cause) judgment points, including during the autonomous `/wf auto` and
`/wf yolo` drivers. Model-initiated runs pin a free CLI (`codex`/`claude`) and are
used sparingly — only when they materially de-risk a gate. It conceptually
supersedes `codex:rescue` (one model → a multi-model panel) but does not edit that
separate plugin.
