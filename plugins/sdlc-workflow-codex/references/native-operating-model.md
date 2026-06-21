# Native Operating Model

Apply these rules in every skill in this plugin.

## Work from the User's Goal

Treat an actionable request as permission to inspect, edit, and verify the code unless the user explicitly asks for analysis, planning, or review only.

1. Identify the desired outcome, relevant constraints, and a concrete definition of done from the prompt and repository.
2. Read applicable `AGENTS.md` files and follow the closest instructions for every file you touch.
3. Inspect the existing implementation before choosing an approach. Prefer established repository patterns and dependencies.
4. Ask a question only when the answer cannot be discovered and a reasonable assumption risks producing the wrong result.
5. Carry the task through implementation, verification, and a concise result. Do not stop at a proposal when execution is feasible.

## Use Codex's Native Surfaces

- Use the built-in plan or progress tool for nontrivial work when available. Keep it current and proportional to the task.
- Use Goal mode only when the user explicitly requests a persistent goal or has already enabled one.
- Use repository `AGENTS.md` for durable project conventions. Do not invent plugin-specific replacements for repo guidance.
- Use browser or runtime tooling after user-facing changes when it is available and the target is known.
- Use subagents only when the user explicitly asks for subagents or parallel agent work. Parallelize read-heavy work; avoid conflicting parallel edits.
- Keep the user informed during substantial work with short, factual updates.

## Keep Process Lightweight

Do not create lifecycle artifacts for ordinary tasks. Run a structured SDLC workflow only when the user asks for one (`$wf …`), the work will span threads, or continuity would otherwise be lost.

When a workflow IS warranted, the canonical state is the shared `.ai/` artifact tree — the SAME artifacts the Claude host reads and writes, so a workflow started in one host resumes cleanly in the other. There is no separate Codex-only JSON continuity store. Cross-thread continuity comes from reading those artifacts via `$wf-meta status` / `resume` / `next`. The full artifact model, the `schema: sdlc/v1` contract, the next-action mapping, and the mutation lease are described in `artifact-interop.md` — read it before writing any `.ai/` artifact.

## Verify Before Completion

- Run the smallest relevant checks first, then broader checks when risk or shared behavior warrants them.
- Confirm user-visible behavior with runtime evidence when feasible.
- Review the final diff for correctness, scope creep, accidental churn, and missing tests.
- Report checks that could not run and why. Never claim success without evidence.

## Protect External Output

Do not mention internal workflow records, skill names, agent prompts, or tool details in commits, pull requests, release notes, product documentation, or code comments unless the user explicitly requests internal process details.
