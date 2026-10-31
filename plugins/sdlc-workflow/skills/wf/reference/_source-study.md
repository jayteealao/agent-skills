# Source study (single source)

This file owns two rules: read the real source of a dependency, and give evidence for a limitation claim. `SKILL.md` Step 0.8 and the plan, implement, verify and review cards cite it. A stage card keeps its citation line, because a stage agent of a driver does not read `SKILL.md`.

## Read the real source

When the work turns on how a dependency, framework or SDK behaves, and the repo does not already answer it, use the `study-sources` skill. Do not work from a recalled API shape.

- Read the installed source first: `node_modules`, `~/.m2`, the Go, Rust and NuGet caches, the Android SDK `sources/`. Match the version that the project resolved.
- The skill fetches into a gitignored `.scratch/` only when no installed source is present. It is read-only. A read never enters the change, the diff or a record.
- Plan: read the source before a plan step calls the dependency.
- Implement: read the source before you write code against its exact API, types or edge cases.
- Verify: read the source before you rule a criterion met or not met.
- Review: read the source before you assert that code misuses the dependency (a wrong signature, an edge case, a call that cannot work, a claim about its security). Give the same rule to each reviewer sub-agent. This holds in the review stage and in an ad-hoc review.

## A limitation claim carries its evidence

A claim that a dependency capability does not exist (not exposed, removed, broken, "the API can't do X") carries evidence at the site or in the record. The evidence is one of:

- a `study-sources` read of the installed source, with the path that you opened, for example a `node_modules/` path;
- a failing minimal repro;
- an upstream issue link.

Two more rules:

1. **A comment is a hypothesis.** An in-repo comment that claims a limitation is never enough to copy its workaround into new code. Check the claim again first, with one `study-sources` read.
2. **A recalled API shape never justifies a suppression alone.** An `as any` or a `@ts-ignore` cites the type that you read from the installed package, or the repro of the mismatch.

The warn-only hook `limitationClaimLint` flags a limitation comment with no citation when the file is written. It looks for one of these markers within 3 lines of the claim: `source:`, `node_modules/`, `repro:`, `issue: #<n>`, a URL, `study-sources`, or a `.d.ts` path.
