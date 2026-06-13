# Narrative fragments — the free (unrestricted) fragment tier (v9.70.0)

There are now **two tiers** of `.html.fragment` siblings. They coexist; an
artifact may ship either, both, or neither.

| | **Typed fragment** (Tier 1) | **Narrative fragments** (Tier 2) |
|---|---|---|
| Filename | `<stem>.html.fragment` (exactly one) | `<stem>.<label>.html.fragment` (any number) |
| Contract | Full — see [`fragment-author-contract.md`](fragment-author-contract.md) | **None.** Raw, unrestricted HTML |
| Sibling `.yaml` | Required (gated, exit 2) | Not required, not read |
| Scoping / wrapper | One `<section class="fragment-<name>">`, scoped CSS | Whatever you write — but your `<style>` is auto-contained (see below) |
| Determinism | Must project deterministically from the `.yaml` | No constraint |
| Verifier | `verify-fragment.mjs` enforces the envelope | **Exempt** |
| Who can author | The 5 rich types + the augmentation types | **Every artifact, every subcommand** |
| Rendered as | Owns the rich interactive body, suppresses the static figure | Injected raw-inline below the page body |

This document is about **Tier 2** — the free narrative fragments.

## What they are

A narrative fragment is a chunk of **completely unrestricted HTML** you author to
tell a story the structured renderers can't: a bespoke architecture diagram for
*this* feature, a before/after request-flow, a state machine, a data-model
sketch, an annotated screenshot, a custom interactive widget — anything. The
plugin makes **no demands** on the markup: no required wrapper, no scoped CSS, no
`sdlc:fragment-ready` dispatch, no sibling `.yaml`, no determinism rule. You
write HTML; the page renders it verbatim.

Author **as many as the story needs** (including zero). They are not limited to
the rich-tier artifacts — *any* markdown artifact produced by *any* subcommand
(`/wf`, `/wf-quick`, `/wf-design`, `/wf-docs`, `/wf-meta`, `/review`, …) can
carry them, because they are injected by a central seam that runs for every
renderer and the generic fallback alike.

## Naming + ordering

Write them next to the artifact `.md`, with an arbitrary kebab-case label
between the stem and `.html.fragment`:

```
.ai/workflows/<slug>/04-plan-auth.md
.ai/workflows/<slug>/04-plan-auth.html.fragment            ← Tier 1 (typed, optional)
.ai/workflows/<slug>/04-plan-auth.01-state-machine.html.fragment   ← Tier 2
.ai/workflows/<slug>/04-plan-auth.02-data-model.html.fragment      ← Tier 2
.ai/workflows/<slug>/04-plan-auth.03-rollout-flow.html.fragment    ← Tier 2
```

They render **in filename (label) order**. Prefix the label with `NN-`
(`01-`, `02-`, …) to control the sequence explicitly — that is the only ordering
mechanism, and it is deterministic.

## How they render

Each fragment's raw HTML is wrapped in a single positional
`<section class="nfrag" data-label="<label>">` (purely for spacing and a hairline
separator — it imposes nothing on your content), and all of them are appended
inside one `<section class="narrative-fragments">` **below** the page body the
renderer produced.

> **You chose raw inline, not iframe isolation** (the v9.70.0 decision). That
> means maximum narrative blend — your fragment inherits the page's design
> tokens and flows as part of the document. It is **not a full sandbox**, but as
> of **v9.71.0 your CSS is contained by default**: each fragment's `<style>`
> rules are wrapped in `@scope (.nfrag[data-label="<label>"])`, so a global
> selector (e.g. `body { … }`, `* { … }`, `.card { … }`) can only match inside
> *this* fragment's wrapper — it cannot bleed to the page chrome above or to a
> sibling fragment. Inline `style="…"`, class usage, and design-token
> inheritance are unaffected (the blend is preserved). **Scripts are still not
> sandboxed** — a thrown top-level inline script can affect the page — but on the
> serve path the daemon's `script-src 'self'` CSP already prevents inline
> `<script>` from running at all. Two residual notes: (1) `@scope` needs a
> 2023-era browser; older engines ignore the scoped block, so the fragment
> renders *unstyled* rather than bleeding (safe degradation); (2) if you
> genuinely need page-wide CSS from a fragment, set `view.scopeNarrativeCss:
> false` (below) to inject `<style>` verbatim. If a fragment still breaks a page,
> render with `view.narrativeFragments: false` while you fix it.

The views live under `.ai/_view/` and are **gitignored** — rebuilt on render,
never pushed — so unrestricted HTML here is your own machine rendering your own
output. Even so, prefer not to embed remote `<script src>`/network calls you
don't need.

## Re-rendering / staleness

Editing, adding, or removing a narrative fragment marks its artifact stale, so an
additive render (and the bootstrap freshness pass) re-renders the page. No
version bump or `--clean` is needed for a *content* edit — only the usual
template/version gate applies to plugin upgrades.

## Disabling

Two repo-wide switches in `.ai/sdlc-config.json`:

- `view.narrativeFragments: false` — suppress **all** narrative fragments (the
  typed Tier-1 fragment is unaffected). The escape hatch when a fragment is
  breaking a page and you want to render without it while you fix it.
- `view.scopeNarrativeCss: false` — keep injecting fragments but inject each
  `<style>` **verbatim/unscoped** (the pre-v9.71.0 behaviour), for the rare case
  a fragment genuinely needs to set page-wide CSS. Default is `true` (contain).

## Relationship to the typed tier

Narrative fragments do **not** replace the typed fragment or its sibling `.yaml`.
For the 5 rich types, the typed `.yaml` is still mandatory (the renderer gates the
whole rich figure/table on it) and the typed `.html.fragment` is still the
contract-bound interactive layer. Narrative fragments are **additive on top** —
the free-form storytelling layer that sits below everything else.
