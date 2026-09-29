# RCA rich view: sibling `.yaml` (Step 5b of `intake/rca.md`)

The sunflower view renders the RCA page from a sibling `.yaml` written next to the RCA `.md`. **Without the `.yaml` the page silently degrades to plain prose**: the incident timeline, the causal chain, the severity heatmap, and the metric row never appear (`rca.mjs` returns `renderSimple` when the sibling YAML is absent). The managed-artifact enforcement ([_host-invocation.md](../../_host-invocation.md)) reminds you if you forget; write it now, while the incident is still in context.

For the RCA `.md` you just wrote (`01-rca.md`, or `augmentations/<rca-id>.md` for an RCA augmentation):

Write the sibling **`<stem>.yaml`**, the structured data. The required core is the **diagnosis set**: `incident:`, `title:`, `started_at:`, `chain:` (causal steps, root last), `timeline:` (the contributing events — at, kind, title, who). The **resolution set** (`resolved_at:`, `metrics.time_to_mitigate`, resolution/mitigation timeline events, `heatmap:`) is required only for a **post-incident** RCA (the artifact's `status` is past fix-routing); a pre-fix diagnosis (`status: ready-for-fix-routing`) omits what has not happened yet. Never fabricate a resolution timeline to satisfy a schema. Schema: `siblingYamlSchemas.rca` in `tests/frontmatter.schema.json` (the pre-fix variant is keyed on the artifact's `status`, not author discretion).

Do not write the typed `<stem>.html.fragment`: the renderer generates it from the `.yaml`, per [_fragment-authoring.md](../../_fragment-authoring.md) Step F1.

## Sibling YAML — `five_whys[]` block

When the RCA artifact reaches a definite root cause through a sequential ladder of questions (the classic 5-whys technique), record the chain in the sibling `<rca-id>.yaml` under a top-level `five_whys:` key. The view-layer renderer expands this into a collapsible drill panel below the causal-chain figure. Without this block the panel is omitted; the rest of the RCA still renders normally.

When to emit:
- Root cause confidence is `high` or `medium` AND the diagnosis actually laddered through ≥3 questions.
- Skip when the root cause was named directly from a stack trace with no intermediate reasoning steps (the 5-whys structure would be artificial).

Shape (between 1 and 7 steps; mark the final step as `root: true`):

```yaml
# excerpt from <rca-id>.yaml — riding alongside the existing artifact: rca block
five_whys:
  - question: "Why did checkout return 500 for 12k users?"
    answer:   "Stripe webhook handler timed out at p99."
  - question: "Why did the webhook handler time out?"
    answer:   "Each event re-fetched the full customer record."
  - question: "Why did each event re-fetch?"
    answer:   "The memoisation key included a request-scoped trace id."
  - question: "Why was the trace id in the key?"
    answer:   "Copy-pasted from a per-request cache. Nobody noticed in review."
    root: true
```

Authoring rules:
- Each `answer` is one sentence: long enough to be a causal claim, short enough to read in the collapsed-detail panel without scrolling.
- Set `root: true` on exactly one step (the final one). If multiple plausible roots survived investigation, pick the strongest and note the alternatives in `01-rca.md` `## Root cause` instead.
- The chain must end where `## Root cause` points; if they disagree, fix `## Root cause` first.
