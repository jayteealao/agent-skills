# RCA rich view: sibling `.yaml` + fragment (Step 5b of `intake/rca.md`)

The sunflower view renders the RCA page from a sibling `.yaml` + `.html.fragment` written next to the RCA `.md`. **Without the `.yaml` the page silently degrades to plain prose**: the incident timeline, the causal chain, the severity heatmap, and the metric row never appear (`rca.mjs` returns `renderSimple` when the sibling YAML is absent). The managed-artifact enforcement ([_host-invocation.md](../../_host-invocation.md)) reminds you if you forget; author them now, while the incident is still in context.

For the RCA `.md` you just wrote (`01-rca.md`, or `augmentations/<rca-id>.md` for an RCA augmentation):

1. Write the sibling **`<stem>.yaml`**, the structured data. The required core is the **diagnosis set**: `incident:`, `title:`, `started_at:`, `chain:` (causal steps, root last), `timeline:` (the contributing events — at, kind, title, who). The **resolution set** (`resolved_at:`, `metrics.time_to_mitigate`, resolution/mitigation timeline events, `heatmap:`) is required only for a **post-incident** RCA (the artifact's `status` is past fix-routing); a pre-fix diagnosis (`status: ready-for-fix-routing`) omits what has not happened yet. Never fabricate a resolution timeline to satisfy a schema. Schema: `siblingYamlSchemas.rca` in `tests/frontmatter.schema.json` (the pre-fix variant is keyed on the artifact's `status`, not author discretion).
2. Write the sibling **`<stem>.html.fragment`**, the body-only interactive layer.

## Fragment shape

The fragment is one `<section class="fragment-rca" data-artifact="rca" data-incident="<INC-id>">` that reproduces the gallery's RCA fragment 1:1:

- **Horizontal SVG timeline**: circles per event (alert / escalation / deploy / mitigation / resolution), each wrapped in `<a href="#evt-N">` so the right-side `<aside class="rca-detail-panel">` swaps on `:target`.
- **Causal-chain SVG**: 4 boxes + arrows; the root-cause box uses the `--blocker` colour.
- **Severity heatmap grid**: rows = systems, columns = 30-min buckets, cells tinted `s0`–`s3` from the YAML's `heatmap.systems[name][bucket]`.
- Contributing-causes and mitigations-applied as `.callout-warn` / `.callout-info` blocks.

Authoring rules (verifier Check 7 enforces):

- Inline `<style>` scoped under `.fragment-rca` / `.rca-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-rca')`. CSS-only `:target` navigation drives the detail panel; JS only enhances hover/focus and Esc-to-reset.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'rca', artifact: 'rca', incident: '<INC-id>', counts: { events: <n>, causes: <n>, mitigations: <n> } } }))`.
- Inline SVG only. Data deterministic from the sibling `.yaml`.

Full contract: [`reference/fragment-author-contract.md`](../../../../../reference/fragment-author-contract.md). Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../../../reference/fragments-gallery.html).

## Use `@include` for shared chrome

The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): `rca.mjs` already emits the heading and the metric-row, and draws the timeline + causal-chain figures (suppressing its static copies when the fragment is present). Do not repeat the metric-row in the fragment; start at the interactive timeline:

```html
<section class="fragment-rca" data-artifact="rca" data-incident="INC-2026-0512">
  <!-- page owns the heading + metric-row (body-only) — fragment starts at the timeline -->

  <svg class="rca-timeline"> …incident timeline (anchors → :target panels)… </svg>
  <aside class="rca-detail-panel"> …per-event detail blocks… </aside>
  <svg class="rca-chain"> …4-box causal chain… </svg>
  <table class="rca-heatmap"> …systems × buckets, s0–s3 tinted cells… </table>

  <!-- @include callout { "kind": "warn", "title": "Load-test gate not enforced", "body": "…" } -->
  <!-- @include callout { "kind": "info", "title": "Mitigation: memoise Stripe", "body": "…" } -->

  <!-- @include fragment-ready { "name": "rca", "artifact": "rca",
       "detailJson": "{\"incident\":\"INC-2026-0512\",\"counts\":{\"events\":5,\"causes\":3,\"mitigations\":2}}" } -->
</section>
```

Snippet catalogue: `metric-row`, `callout`, `verdict`, `severity-chip`, `fragment-ready`, `files-touched-row`, `diff-block`.

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
- Set `root: true` on exactly one step (the final one). If multiple plausible roots survived investigation, pick the strongest and note the alternatives in Section 4 of `01-rca.md` instead.
- The chain must end where Section 4 ("Root cause") points; if they disagree, fix Section 4 first.
