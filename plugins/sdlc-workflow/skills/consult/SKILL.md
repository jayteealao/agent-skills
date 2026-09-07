---
name: consult
description: Consult external models as READ-ONLY oracles — plan critique, code/implementation review, design analysis, diagnosis, second opinion. Fans out to all available providers by default (codex, claude, gemini, openai; a provider keyword narrows to one). Returns a panel of opinions and never edits the repo. The model may invoke it autonomously when a second opinion adds material value; model-initiated runs pin a free subscription CLI (codex/claude).
version: 1.1.0
disable-model-invocation: false
argument-hint: "[codex|claude|gemini|openai|<provider>/<model>] <question>"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../wf/reference/_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# What this is

`consult` sends a question to one or more external AI models acting as **read-only
oracles** and brings back their written opinions — a plan critique, a code or
implementation review, a design trade-off analysis, a diagnosis, a second
opinion. It is **advisory only**: the oracles can read and search the repo but
**cannot edit, write, or run commands**. It writes no code and proposes no patch.

The model **auto-invokes** this skill at the judgment points the `/wf` stages call
out (plan, shape, design, review, verify/diagnosis, handoff) — not rarely, but
whenever those stages' **objective** triggers fire. It is still never triggered by a
hook or by serving — only by a deliberate model or user decision. The cost caution
applies to *provider choice, not frequency*: a self-initiated run pins a **free**
subscription CLI (`codex`/`claude`), which costs nothing per call, so fire it freely
at the designated gates. "Sparing" governs only the **paid** REST oracles (`gemini`,
`openai`, gateway models) — never fan those out unattended (see Step 0).

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
- The **question**, exact.
- **Evidence handling (important):** the CLI oracles (`codex`, `claude`) run with
  `cwd=repoRoot` and read the live tree themselves — for them, a path/diff
  *pointer* is enough. The REST oracles (`gemini`, `openai`, gateway models) are
  **prompt-only** — they see nothing but this file. So when REST providers are in
  play, **inline the relevant file/diff content** into the prompt (fenced), within
  reason. One prompt file is sent to every provider; the CLI oracles simply have
  the extra ability to read beyond what you inlined.

# Step 2 — Dispatch read-only (fan-out)

Run the runner (`<skill-dir>` resolves per [_host-invocation.md](../wf/reference/_host-invocation.md);
the runner spawns the CLI oracles isolated + read-only, and calls the REST APIs; it
caps parallelism and never writes):

```bash
node "<skill-dir>/scripts/dispatch.mjs" read-only <repoRoot> <promptFile> [provider ...]
```

- Omit `[provider ...]` for the bare fan-out; pass the pinned provider(s) otherwise.
- It prints one JSON object: `{ results: [{provider, ok, text, costUsd, usage, evidenceScope, error}], skipped: [{provider, reason}], bare }`.
- When the question is about a workflow slug, set `SDLC_COST_SLUG=<slug>` and `SDLC_COST_KEY=<stage key>` on the command. The runner then appends each provider's `usage` as an `external` row to `.ai/workflows/<slug>/cost.jsonl` (see [_consult-triggers.md](../wf/reference/_consult-triggers.md)). Without the variable, no row is written.
- Exit `0` = well-formed (per-provider failures are inside `results`); `2` = usage
  error.

# Step 3 — Synthesize and embed

Build the panel per [panel.md](panel.md): one entry per `ok` provider with its evidence-scope badge, one-line verdict, and key points; every `skipped` or failed provider named with its reason and, for `auth`, its `remedy`. When fewer providers returned than were requested, lead with the degradation (**Panel of 1** — treat it as one opinion, not a consensus); an `auth` failure is not an environmental wall, it is a login, and the dispatcher says which one. Add the consensus/divergence line, weighted by evidence scope. When the question targets a workflow artifact, write the panel as a `<stem>.NN-consult.html.fragment` next to it per panel.md.

# Step 4 — Emit the result

End with the machine-readable block, then a short narrative summary:

```
CONSULT_RESULT:
  providers: <comma-separated providers that returned an opinion>
  skipped: <provider (reason), … | none>
  failed: <provider (kind: reason), … | none>   # ok:false — kind ∈ auth|sandbox|not-found|unknown
  panel-size: <N of M requested>                # N < M ⇒ degraded; say so in the narrative too
  remedies: <provider: command, … | none>       # actionable fixes for auth failures
  verdict: <one-line synthesis — consensus, or the material divergence>
  fragment: <path to the .html.fragment | none>
  cost: <per-token note, see below>
```

**Cost note.** A bare fan-out bills the REST oracles (`gemini`, `openai`, gateway models) per token on every invocation; the subscription CLIs cost nothing per call. To stay free, pin one: `/consult codex <question>` or `/consult claude <question>`. To pin one paid model, name it: `/consult openai <question>` or `/consult <provider>/<model> <question>`.
