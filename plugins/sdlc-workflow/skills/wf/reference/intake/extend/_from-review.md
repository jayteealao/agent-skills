# The `from-review` seed (extension)

Load this file only when the seed of the extension is `from-review` ([../extend.md](../extend.md), Step 1). Only the person starts this seed: a review never routes a finding here.

Read `## Recommendations` of every review record (`07-review.md`, and each `07-review-<slice-slug>.md`; `record get` each). Take only the new scope that the person names: a capability that was never in the scope of this workflow. A defect of built work is not extension scope: the review fixes it in place.

Signs of new scope that the person names:
- The person says "this feature should also do X, but X was never scoped".
- The person describes a gap that needs new code paths, not a correction of existing ones.

Signs that a finding is a bug fix, not extension scope:
- The finding points to incorrect logic, a wrong output, or a missing validation.
- The finding cites code that already exists but is broken.
- The finding is about how something works, not about what it is missing.

Extract the extension candidates that qualify. Group related findings into candidate slices. Summarise each candidate:
- what new capability is needed;
- which existing slices it relates to (context, not modification);
- why a fix of an existing slice cannot address it;
- a rough complexity estimate (xs/s/m/l/xl).

When no finding qualifies, do not stop. Say so, and fall back to the general interview: "Review findings are all implementation bugs — no new scope emerged from them (a review run fixes those: `/wf review <slug>`). Describe the new scope you want to add, or reply `cancel`." On `cancel`, stop. Otherwise go on with the general seed.
