#!/usr/bin/env python3
"""
Generate the remaining sdlc-workflow doc-site pages from compact page-definitions.

This is a one-shot generator. The OUTPUT (the .html files in tutorials/, how-to/, etc.) is the
committed deliverable. The script itself is checked in so future authors can extend pages without
hand-replicating the 60-line sidebar in each file.

Run from docs/site/:
    python3 _build_pages.py

It overwrites every page listed in PAGES below. To edit one page by hand, remove it from PAGES
first or delete it from this script entirely.
"""

import os
import re
import json
from pathlib import Path
from textwrap import dedent

SITE_ROOT = Path(__file__).resolve().parent

# --- Single source of truth for the version stamp -------------------------
# The sidebar brand shows the plugin version. Read it from the manifest so the
# doc-site can never drift from the plugin (Phase 1 / L1 of DOC-SITE-DEVIATIONS).
_PLUGIN_JSON = SITE_ROOT.parent.parent / ".claude-plugin" / "plugin.json"
PLUGIN_VERSION = json.loads(_PLUGIN_JSON.read_text(encoding="utf-8"))["version"]


# ---------------------------------------------------------------------------
# Sidebar — canonical nav, used by every page.
# `{base}` is replaced with "" or "../" depending on the page depth.
# `{active}` is replaced with the active-link href so we can mark it with class="active".
# ---------------------------------------------------------------------------
SIDEBAR = r"""<aside id="sidebar">
<a class="brand" href="{base}index.html">sdlc-workflow<small>plugin docs · v{version}</small></a>
<nav aria-label="Site navigation">
  <h4>Orientation</h4>
  <ul>
    <li><a href="{base}index.html" data-href="index.html">Home</a></li>
    <li><a href="{base}orientation/is-this-for-me.html" data-href="orientation/is-this-for-me.html">Is this for me?</a></li>
    <li><a href="{base}orientation/mental-model.html" data-href="orientation/mental-model.html">How it works</a></li>
    <li><a href="{base}orientation/first-10-minutes.html" data-href="orientation/first-10-minutes.html">First 10 minutes</a></li>
  </ul>
  <h4>Tutorials</h4>
  <ul>
    <li><a href="{base}tutorials/installation.html" data-href="tutorials/installation.html">Install</a></li>
    <li><a href="{base}tutorials/first-workflow.html" data-href="tutorials/first-workflow.html">Full feature walkthrough</a></li>
    <li><a href="{base}tutorials/quick-fix-workflow.html" data-href="tutorials/quick-fix-workflow.html">Quick-fix walkthrough</a></li>
  </ul>
  <h4>How to&hellip;</h4>
  <ul>
    <li><a href="{base}how-to/choose-a-command.html" data-href="how-to/choose-a-command.html">Choose a command</a></li>
    <li><a href="{base}how-to/start-workflow.html" data-href="how-to/start-workflow.html">Pick an entry point</a></li>
    <li><a href="{base}how-to/navigate-workflows.html" data-href="how-to/navigate-workflows.html">Navigate workflows</a></li>
    <li><a href="{base}how-to/amend-or-extend.html" data-href="how-to/amend-or-extend.html">Amend or extend</a></li>
    <li><a href="{base}how-to/use-augmentations.html" data-href="how-to/use-augmentations.html">Use add-ons</a></li>
    <li><a href="{base}how-to/use-design.html" data-href="how-to/use-design.html">Use design</a></li>
    <li><a href="{base}how-to/triage-pr-comments.html" data-href="how-to/triage-pr-comments.html">Triage PR comments</a></li>
    <li><a href="{base}how-to/author-ship-plan.html" data-href="how-to/author-ship-plan.html">Author a ship plan</a></li>
    <li><a href="{base}how-to/run-a-release.html" data-href="how-to/run-a-release.html">Run a release</a></li>
    <li><a href="{base}how-to/resume-paused-work.html" data-href="how-to/resume-paused-work.html">Resume paused work</a></li>
    <li><a href="{base}how-to/close-workflows.html" data-href="how-to/close-workflows.html">Close workflows</a></li>
  </ul>
  <h4>Reference</h4>
  <ul>
    <li><a href="{base}reference/glossary.html" data-href="reference/glossary.html">Glossary</a></li>
    <li><a href="{base}reference/pipeline.html" data-href="reference/pipeline.html">Pipeline (10 stages)</a></li>
    <li><a href="{base}reference/commands.html" data-href="reference/commands.html">Commands</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf.html" data-href="reference/wf.html">↳ /wf</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-quick.html" data-href="reference/wf-quick.html">↳ Quick &amp; standalone</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-design.html" data-href="reference/wf-design.html">↳ /wf design</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/review.html" data-href="reference/review.html">↳ /wf review</a></li>
    <li><a href="{base}reference/skills.html" data-href="reference/skills.html">Skills</a></li>
    <li><a href="{base}reference/artifacts.html" data-href="reference/artifacts.html">Artifacts</a></li>
    <li><a href="{base}reference/00-index-schema.html" data-href="reference/00-index-schema.html">00-index schema</a></li>
    <li><a href="{base}reference/ship-plan-schema.html" data-href="reference/ship-plan-schema.html">Ship-plan schema</a></li>
    <li><a href="{base}reference/08-handoff-schema.html" data-href="reference/08-handoff-schema.html">Handoff schema</a></li>
    <li><a href="{base}reference/09-ship-run-schema.html" data-href="reference/09-ship-run-schema.html">Ship-run schema</a></li>
    <li><a href="{base}reference/hooks.html" data-href="reference/hooks.html">Hooks</a></li>
    <li><a href="{base}reference/serve.html" data-href="reference/serve.html">Serve daemon &amp; hub</a></li>
    <li><a href="{base}reference/tray.html" data-href="reference/tray.html">Tray app</a></li>
    <li><a href="{base}reference/types.html" data-href="reference/types.html">Artifact types</a></li>
  </ul>
  <h4>Explanation</h4>
  <ul>
    <li><a href="{base}explanation/why-this-exists.html" data-href="explanation/why-this-exists.html">Why this exists</a></li>
    <li><a href="{base}explanation/artifacts-over-memory.html" data-href="explanation/artifacts-over-memory.html">Artifacts over memory</a></li>
    <li><a href="{base}explanation/orchestrator-discipline.html" data-href="explanation/orchestrator-discipline.html">Orchestrator discipline</a></li>
    <li><a href="{base}explanation/diataxis-integration.html" data-href="explanation/diataxis-integration.html">Diátaxis integration</a></li>
    <li><a href="{base}explanation/branch-strategy.html" data-href="explanation/branch-strategy.html">Branch strategy</a></li>
    <li><a href="{base}explanation/adaptive-routing.html" data-href="explanation/adaptive-routing.html">Adaptive routing</a></li>
    <li><a href="{base}explanation/augmentations-model.html" data-href="explanation/augmentations-model.html">Augmentations model</a></li>
    <li><a href="{base}explanation/idempotency-in-ship.html" data-href="explanation/idempotency-in-ship.html">Idempotency in ship</a></li>
    <li><a href="{base}explanation/the-readiness-gate.html" data-href="explanation/the-readiness-gate.html">The readiness gate</a></li>
    <li><a href="{base}explanation/build-and-dist.html" data-href="explanation/build-and-dist.html">Build &amp; dist model</a></li>
  </ul>
  <h4>Tips</h4>
  <ul>
    <li><a href="{base}tips/escape-hatches.html" data-href="tips/escape-hatches.html">Escape hatches</a></li>
    <li><a href="{base}tips/tricks.html" data-href="tips/tricks.html">Tricks</a></li>
    <li><a href="{base}tips/anti-patterns.html" data-href="tips/anti-patterns.html">Anti-patterns</a></li>
    <li><a href="{base}tips/faq.html" data-href="tips/faq.html">FAQ</a></li>
  </ul>
  <h4>Changelog</h4>
  <ul>
    <li><a href="{base}whats-new.html" data-href="whats-new.html">What&#8217;s new</a></li>
  </ul>
</nav>
</aside>"""


HEAD_TMPL = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · sdlc-workflow</title>
<link rel="stylesheet" href="{base}style.css">
</head>
<body>
<button class="menu-toggle" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">
  <span class="open-icon" aria-hidden="true">&#9776;</span>
  <span class="close-icon" aria-hidden="true">&times;</span>
</button>
<div class="nav-backdrop" aria-hidden="true"></div>
<div class="layout">
"""


FOOT = r"""</main>
</div>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "default" });

  // Mark active sidebar link based on current path
  const here = location.pathname.split("/").slice(-2).join("/").replace(/^\//, "");
  document.querySelectorAll("#sidebar a[data-href]").forEach(a => {
    if (a.dataset.href === here || (here === "" && a.dataset.href === "index.html")) {
      a.classList.add("active");
    }
  });

  // Mobile drawer toggle
  const toggle = document.querySelector(".menu-toggle");
  const backdrop = document.querySelector(".nav-backdrop");
  const setOpen = (open) => {
    document.body.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  if (toggle) toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));
  if (backdrop) backdrop.addEventListener("click", () => setOpen(false));
  document.querySelectorAll("#sidebar a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
</script>
</body>
</html>
"""


QUADRANT_CLASSES = {
    "tutorial": "tutorial",
    "how-to": "howto",
    "reference": "reference",
    "explanation": "explanation",
    "tips": "tips",
}


def render_page(path, title, quadrant, breadcrumb, body, prev=None, nxt=None):
    """Render a single page to docs/site/<path>."""
    rel = path.count("/")
    base = "../" * rel
    sidebar = SIDEBAR.format(base=base, version=PLUGIN_VERSION)
    head = HEAD_TMPL.format(title=title, base=base)
    qclass = QUADRANT_CLASSES[quadrant]

    # Pager
    pager_html = ""
    if prev or nxt:
        prev_html = (
            f'<a class="prev" href="{base}{prev[0]}"><span>← Previous</span>{prev[1]}</a>'
            if prev else "<span></span>"
        )
        nxt_html = (
            f'<a class="next" href="{base}{nxt[0]}"><span>Next →</span>{nxt[1]}</a>'
            if nxt else ""
        )
        pager_html = f'<div class="pager">{prev_html}{nxt_html}</div>'

    page = (
        head
        + sidebar
        + f'<main>\n<div class="breadcrumb">{breadcrumb}</div>\n'
        + f'<span class="quadrant {qclass}">{quadrant}</span>\n'
        + f"<h1>{title}</h1>\n"
        + body
        + pager_html
        + FOOT
    )
    out = SITE_ROOT / path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8-sig", newline="\n")
    print(f"wrote {path}")


# ---------------------------------------------------------------------------
# Page definitions — each entry: (path, title, quadrant, breadcrumb, body, prev, next)
# Note: prev/next in the tuple are unused — pagers are auto-derived from SIDEBAR nav order
# in main() via _nav_order() + _nav_labels().
# ---------------------------------------------------------------------------
PAGES = []


# === ORIENTATION ===

PAGES.append((
    "orientation/is-this-for-me.html",
    "Is this for me?",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Orientation &rsaquo; Is this for me?',
    """
<p class="lede">
You installed a plugin and you're wondering whether it's worth using for your actual work. This page answers that honestly — including the cases where the answer is no.
</p>

<h2>What it actually does for you</h2>

<p>When you ask Claude to implement something, Claude has no memory. The next session starts blank — it can't recall what you scoped last Tuesday, why you chose that architecture, or which edge cases you already decided to skip. You end up re-explaining context that you've already explained.</p>

<p>This plugin makes Claude's reasoning <strong>visible and persistent</strong> by having it write small markdown files next to your code — one per stage of a change. Three weeks later, you can still see why a particular approach was chosen. A new team member can read those files and understand not just <em>what</em> was decided, but <em>why</em>.</p>

<div class="callout callout-info">
<strong>The concrete payoff</strong>
Instead of "Claude, build the health endpoint" (and then re-explaining all the constraints next session), you run <code>/wf intake add-health-endpoint</code>. Claude interviews you, writes a scope document, and every subsequent stage reads that document. You never re-explain scope. The decisions are in files, not conversations.
</div>

<h2>Is this for you? (Quick check)</h2>

<p>You will get the most value if:</p>

<ul>
  <li>You use Claude for non-trivial work — features, refactors, bug investigations, not just one-liners</li>
  <li>You work on a codebase that persists — something you'll come back to, something other people read</li>
  <li>You've ever lost context between sessions and had to re-brief Claude from scratch</li>
  <li>You want a paper trail of decisions (for code review, for your own future self, or for a team)</li>
</ul>

<h2>When NOT to use it</h2>

<p>The plugin adds ceremony. That ceremony pays off on non-trivial changes; it doesn't on tiny ones.</p>

<ul>
  <li><strong>One-line fixes, typos, documentation tweaks:</strong> just ask Claude directly. Or use <code>/wf intake fix</code> for a one-line change that still needs a commit record — it's far lighter than the full pipeline.</li>
  <li><strong>One-off scripts you'll discard:</strong> no need to scope, plan, and verify a throw-away utility.</li>
  <li><strong>Exploratory spiking where you don't yet know the question:</strong> start with plain Claude conversation; switch to <code>/wf intake</code> once the problem is clear enough to scope.</li>
  <li><strong>Teams where no one will ever read the artifact files:</strong> the value is the trail. If the trail goes unread, the cost isn't justified.</li>
</ul>

<h2>What you give up</h2>

<p>Honesty matters here. The plugin asks more of you upfront:</p>

<ul>
  <li>You need to name your work (a <em>slug</em> — just a short stable name like <code>add-health-endpoint</code>)</li>
  <li>You go through a stage sequence rather than a single prompt</li>
  <li>The first few times, the stages feel like overhead. They pay back on changes that take more than one session.</li>
</ul>

<p>If you work best in a fast, freeform conversation loop and the idea of a multi-stage sequence feels wrong for your style — that's a legitimate signal. Don't force it.</p>

<h2>The quick-start test</h2>

<p>The fastest way to find out if it's for you: pick a real change you were going to make today — not a toy — and run the <a href="first-10-minutes.html">10-minute walkthrough</a>. If it feels like it helped, keep going. If it felt like friction without payoff, you have your answer.</p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="mental-model.html">Understand how the commands fit together →</a></li>
  <li><a href="first-10-minutes.html">Run a real change end-to-end in 10 minutes →</a></li>
  <li><a href="../explanation/why-this-exists.html">Read the deeper "why" — AI memory, artifacts, orchestrator discipline →</a></li>
</ul>
</div>
""",
    None, None,
))


PAGES.append((
    "orientation/mental-model.html",
    "How it works",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Orientation &rsaquo; How it works',
    """
<p class="lede">
Before you type your first command, this page gives you the map. One read and you'll know what every command does, why the plugin writes files, and how all the pieces fit together.
</p>

<h2>The five things you type</h2>

<p>The plugin exposes a handful of top-level commands; everything else is a sub-command under one of these. <code>/wf design</code> is a sub-command key of <code>/wf</code>, not a standalone peer.</p>

<table>
<thead><tr><th>Command</th><th>What you reach for it when…</th><th>What it does</th></tr></thead>
<tbody>
<tr>
  <td><code>/wf</code></td>
  <td>You have a real feature, fix, or refactor to ship</td>
  <td>Runs the full 10-stage lifecycle. One stage at a time, each building on the last. 20 keys: the 10 stages (<code>intake</code>, <code>shape</code>, <code>slice</code>, <code>plan</code>, <code>implement</code>, <code>verify</code>, <code>review</code>, <code>handoff</code>, <code>ship</code>, <code>retro</code>), the standalone/drivers <code>design</code>, <code>probe</code>, <code>simplify</code>, <code>auto</code>, <code>yolo</code>, the navigation keys <code>status</code>, <code>recap</code>, lifecycle <code>close</code>, and the routers <code>ship-plan</code>, <code>docs</code>. Observability/rollout/perf work (instrument, experiment, benchmark, profile) are <em>augmentations</em> that <code>shape</code> decides, not keys you type.</td>
</tr>
<tr>
  <td><code>/wf intake &lt;mode&gt;</code></td>
  <td>You want a faster path for small, well-defined changes</td>
  <td>Nine compressed intake modes — <code>fix</code>, <code>hotfix</code>, <code>rca</code>, <code>investigate</code>, <code>discover</code>, <code>refactor</code>, <code>update-deps</code>, <code>ideate</code>, and <code>adopt</code> (reverse-entry: adopt an already-made diff) — plus <code>/wf probe</code> and <code>/wf simplify</code> as top-level keys. The former <code>/wf-quick</code> router is retired.</td>
</tr>
<tr>
  <td><code>/wf status</code> · <code>/wf recap</code></td>
  <td>You want to look up, navigate, or manage your workflows</td>
  <td>Navigation and lifecycle — everything for working <em>with</em> workflows that already exist. Keys: <code>/wf status</code> (dashboard/detail; absorbs the old <code>next</code> and <code>sync</code>), <code>/wf recap</code> (the old <code>resume</code>/<code>how</code>), <code>/wf close</code> (the old <code>skip</code>/<code>close</code>), <code>/wf ship-plan</code> (init/build/edit), and <code>/wf ship &lt;slug&gt; announce</code>. Add scope with <code>/wf intake &lt;slug&gt; &lt;scope&gt;</code>. The former <code>/wf-meta</code> router is retired.</td>
</tr>
<tr>
  <td><code>/wf design</code></td>
  <td>You want design work on a screen, component, or visual artifact</td>
  <td>20 design sub-commands — colorize, polish, audit, critique, the transforms, and more. The design brief (<code>02b-design.md</code>) and visual contract (<code>02c-craft.md</code>) are authored by the normal lifecycle (<code>shape</code> and <code>plan</code>); this key hosts the ad-hoc transforms + analysis operators. <code>/wf design &lt;slug&gt; &lt;transform&gt;</code> builds in-workflow (compressed); <code>/wf design &lt;cmd&gt;</code> runs the full lifecycle</td>
</tr>
<tr>
  <td><code>/wf docs</code></td>
  <td>You want to generate or update documentation</td>
  <td>Generates site pages, API docs, or reference content from your code and artifacts, using the Diátaxis structure. The former <code>/wf-docs</code> router is retired — it is now the <code>/wf docs</code> key</td>
</tr>
<tr>
  <td><code>/wf review</code></td>
  <td>You want a structured code review on a PR or a diff</td>
  <td>33-dimension code review — the single review surface. <code>/wf review &lt;slug&gt;</code> runs the workflow stage; ad-hoc (no slug), run a single dimension inline (<code>/wf review correctness</code>) or a full sweep (<code>/wf review sweep</code>) that fans out one agent per dimension. The former standalone <code>/review</code> skill is folded into this key.</td>
</tr>
</tbody>
</table>

<p>Not sure which one to reach for? <a href="../how-to/choose-a-command.html">The command chooser</a> maps your situation to the right command and sub-command.</p>

<h2>Why the plugin writes files</h2>

<p>Claude has no memory between sessions. When you close a conversation, everything Claude learned about your codebase — the scope you agreed on, the edge cases you ruled out, the reason you chose one approach over another — is gone. The next session starts blank.</p>

<p>The plugin solves this by writing <strong>artifacts</strong> — small markdown files next to your code, one per stage. Each stage reads what previous stages wrote. Instead of re-explaining "we're adding a health endpoint to the payments service and we ruled out the gRPC approach because…", you just point Claude at the artifacts from last session.</p>

<div class="callout callout-info">
<strong>What an artifact looks like</strong>
A file like <code>.ai/workflows/add-health-endpoint/02-shape.md</code> contains YAML frontmatter (stage, status, slug, timestamp) followed by the structured reasoning from the shape stage — the scope, the acceptance criteria, the ruled-out approaches. It's a markdown file you can read, edit, and commit to git.
</div>

<h2>How a full change flows</h2>

<p>Here's the 10-stage sequence a change goes through with <code>/wf</code>. You don't run all 10 in one go — you run one stage, review what Claude produced, and move to the next when you're happy. You can also skip stages, loop back, or branch into parallel slices.</p>

<div class="diagram">
<pre class="mermaid">
flowchart LR
  intake[1·intake] --> shape[2·shape]
  shape -.opt.-> design[2b·design]
  shape --> slice[3·slice]
  design --> slice
  slice --> plan[4·plan]
  plan --> impl[5·implement]
  impl --> verify[6·verify]
  verify --> review[7·review]
  review --> handoff[8·handoff]
  handoff --> ship[9·ship]
  ship --> retro[10·retro]

  classDef def fill:#e8f0fe,stroke:#1d4ed8,stroke-width:1px,color:#1f1f1d
  classDef opt fill:#f5e8fe,stroke:#7c3aed,stroke-dasharray:3 3,color:#1f1f1d
  class intake,shape,slice,plan,impl,verify,review,handoff,ship,retro def
  class design opt
</pre>
<noscript><pre class="diagram-fallback">intake → shape → (design?) → slice → plan → implement → verify → review → handoff → ship → retro</pre></noscript>
</div>

<p>Each stage writes one artifact file. By the time you reach <code>handoff</code>, there is at least one file per stage — and more for multi-slice work or augmentations — capturing every decision you made along the way.</p>

<h2>The dashboard</h2>

<p>The plugin includes a local web viewer — <strong>the dashboard</strong> — that shows all your workflows at a glance. Run <code>npm run hub</code> from the plugin root to start it, then open <code>http://localhost:4173</code>. The dashboard reads the artifact files from <code>.ai/workflows/</code> and renders them in a readable format. Multiple repos can share one hub.</p>

<h2>Putting it all together</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  you["You type a command"] --> cmd["/wf, /wf review, etc."]
  cmd --> stages["Claude runs one or more stages"]
  stages --> artifacts["Writes artifacts to .ai/workflows/&lt;slug&gt;/"]
  artifacts --> next["Next stage reads previous artifacts"]
  artifacts --> dash["Dashboard renders them at localhost:4173"]
  artifacts --> git["You commit them — decisions are in your git history"]
</pre>
<noscript><pre class="diagram-fallback">You type a command → Claude runs stages → writes artifacts → next stage reads previous → dashboard shows them → you commit them</pre></noscript>
</div>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="first-10-minutes.html">Try it now — run your first change end-to-end in 10 minutes →</a></li>
  <li><a href="../how-to/choose-a-command.html">Find the exact command for your situation →</a></li>
  <li><a href="../tutorials/installation.html">Install the plugin →</a></li>
</ul>
</div>
""",
    None, None,
))


PAGES.append((
    "orientation/first-10-minutes.html",
    "First 10 minutes",
    "tutorial",
    '<a href="../index.html">Home</a> &rsaquo; Orientation &rsaquo; First 10 minutes',
    """
<p class="lede">
You have 10 minutes and a real change to make. This walkthrough takes you from a blank slate to a committed PR using <code>/wf intake fix</code> — the fastest path that still leaves a record. Real commands, real output, no placeholders.
</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>Plugin installed. (<a href="../tutorials/installation.html">Not yet? Install first →</a>)</td></tr>
<tr><th>What you'll do</th><td>Fix a real bug in your codebase using a compressed quick-fix workflow</td></tr>
<tr><th>What you'll produce</th><td>Five planning artifact files and a commit. Takes about 10 minutes end-to-end.</td></tr>
<tr><th>Not covered here</th><td>The full 10-stage lifecycle. <a href="../tutorials/first-workflow.html">See the full feature walkthrough →</a></td></tr>
</table>
</div>

<h2>The scenario</h2>

<p>Suppose you found a bug: a user-facing error message says "Recieved" instead of "Received". One file, one line. You want to fix it, write a test (or confirm one exists), and ship it — without spending 30 minutes on ceremony.</p>

<h2>Step 1 — Start the workflow (30 seconds)</h2>

<pre><code>/wf intake fix "typo in invalid-payload error message"</code></pre>

<p>Claude asks you two or three questions: which file, what's the exact fix, do you want a test touched. Answer them in plain language. Claude then writes the compressed planning set — five files — under <code>.ai/workflows/</code>:</p>

<pre><code>.ai/workflows/typo-invalid-payload-error-message/
  00-index.md        ← registry entry (slug, type, branch, status)
  01-fix.md          ← intake brief: restated request, acceptance criteria, assumptions
  02-shape.md        ← scope: in-scope / out-of-scope
  03-slice.md        ← slice roster (one slice for a fix)
  04-plan.md         ← implementation steps</code></pre>

<p>These are plain markdown files you can open and read. The fix mode is a compressed but complete lifecycle — each planning stage is lightweight but present: <code>01-fix.md</code> carries the intake brief, <code>02-shape.md</code> the scope, <code>03-slice.md</code> the slice roster, and <code>04-plan.md</code> the implementation steps. No stage is skipped.</p>

<h2>Step 2 — Implement (5–7 minutes)</h2>

<pre><code>/wf implement typo-invalid-payload-error-message</code></pre>

<p>Claude reads <code>01-fix.md</code>, makes the change, runs your test command, and commits. If there's a test to add or update, it does that first. When it's done, you'll see:</p>

<pre><code>.ai/workflows/typo-invalid-payload-error-message/
  00-index.md
  01-fix.md
  02-shape.md
  03-slice.md
  04-plan.md
  05-implement.md    ← what Claude did, what tests passed, the commit hash</code></pre>

<p>Review the diff before the commit lands if you want to catch anything. <code>/wf implement</code> will pause and show you what it's about to do.</p>

<h2>Step 2b — Verify (1 minute)</h2>

<pre><code>/wf verify typo-invalid-payload-error-message</code></pre>

<p>Runs your test suite and lints, applies the acceptance-criteria gate, and writes <code>06-verify.md</code>. If a check fails, it presents a Fix/Skip/Escalate prompt before moving on.</p>

<h2>Step 2c — Review (1 minute)</h2>

<pre><code>/wf review typo-invalid-payload-error-message</code></pre>

<p>Runs a structured code review and writes <code>07-review.md</code>. Handoff requires this artifact and will refuse if there are unresolved blockers — so don't skip it.</p>

<h2>Step 3 — Handoff to PR (2 minutes)</h2>

<pre><code>/wf handoff typo-invalid-payload-error-message</code></pre>

<p>Handoff runs a <strong>readiness check</strong> — the set of gates that must say "ready" before the plugin will open a PR. For a quick fix, these are lightweight: commitlint, a rebase onto main, a check that no public API surface drifted. If everything passes, Claude opens the PR. The readiness check result lands in:</p>

<pre><code>.ai/workflows/typo-invalid-payload-error-message/
  08-handoff.md      ← readiness verdict, PR URL, what was checked</code></pre>

<p>If a gate fails (say, a test broke), <code>08-handoff.md</code> shows you exactly what failed and how to fix it. Re-run <code>/wf handoff</code> after fixing — it resumes from where it stopped.</p>

<h2>What you just did</h2>

<p>You ran a five-command workflow that took one session. The artifact trail means:</p>
<ul>
  <li>Next time you open Claude, you can run <code>/wf status</code> and see this workflow in the list — closed, with the PR link and commit hash</li>
  <li>A reviewer can read <code>01-fix.md</code> and understand the intent without reading the diff; <code>06-verify.md</code> and <code>07-review.md</code> show what was checked and what was found</li>
  <li>If the same bug pattern appears elsewhere, you have a record of how you thought about it</li>
</ul>

<h2>When to use a fuller workflow instead</h2>

<p>If your change involves more than one file, touches behavior that needs real acceptance criteria, or you think someone will ask "why did you do it this way?" — use <code>/wf intake</code> instead. The full workflow adds stages but the first two (<code>intake</code> → <code>shape</code>) take less than 10 minutes and give you a much richer document to build from.</p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/choose-a-command.html">Find the right command for a bigger or different kind of change →</a></li>
  <li><a href="../tutorials/first-workflow.html">Walk through the full 10-stage lifecycle on a real feature →</a></li>
  <li><a href="../how-to/start-workflow.html">Already have a change in mind? Pick your entry point →</a></li>
</ul>
</div>
""",
    None, None,
))


# === HOW-TO (choose-a-command — new usage map) ===

PAGES.append((
    "how-to/choose-a-command.html",
    "Choose a command",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Choose a command',
    """
<p class="lede">
You know what you want to do. This page maps your situation to the exact command — and where it matters, the exact sub-command — you should type.
</p>

<h2>By situation</h2>

<table>
<thead><tr><th>I want to…</th><th>Command</th><th>Notes</th></tr></thead>
<tbody>
<tr>
  <td>Start a new feature from scratch</td>
  <td><code>/wf intake &lt;description&gt;</code></td>
  <td>Begins the full lifecycle. Claude derives the slug from your description, interviews you on scope, and writes a brief. Best for anything that will take more than one session.</td>
</tr>
<tr>
  <td>Fix a typo or one-line bug</td>
  <td><code>/wf intake fix "description"</code></td>
  <td>Planning-half-only: authors 01-fix → 04-plan + 00-index (5 files) then gates for your approval. Standard <code>/wf implement</code> → verify → review → handoff → ship chain runs afterward. No stage is skipped; the compression is in ceremony, not stages.</td>
</tr>
<tr>
  <td>Fix a production incident right now</td>
  <td><code>/wf intake hotfix "description"</code></td>
  <td>Full standard lifecycle (intake → ship), single-pass, scope-locked to the minimum change that stops the incident. Security review runs by default (07-review defaults to security dimension). No gates are bypassed.</td>
</tr>
<tr>
  <td>Understand why a bug happened</td>
  <td><code>/wf intake rca "description"</code></td>
  <td>Root-cause analysis. Reads code and git history; produces a diagnosis artifact with recommended next step (fix / hotfix / investigate).</td>
</tr>
<tr>
  <td>Explore 2–3 possible approaches before picking one</td>
  <td><code>/wf intake investigate "question"</code></td>
  <td>Produces a single artifact with 2–3 distinct approaches and their trade-offs. No winner is picked — you decide, then route to <code>/wf intake</code> or <code>/wf intake fix</code>.</td>
</tr>
<tr>
  <td>Verify a theory about how the code works</td>
  <td><code>/wf intake discover "hypothesis"</code></td>
  <td>Tests a specific hypothesis with FOR/AGAINST evidence. Verdict: holds / partial / fails / inconclusive.</td>
</tr>
<tr>
  <td>Update dependencies safely</td>
  <td><code>/wf intake update-deps</code></td>
  <td>Audits dependencies, tiers them by risk (P0/P1/P2), and updates in order. A compressed standard lifecycle in-slug under <code>.ai/workflows/&lt;slug&gt;/</code> that self-authors its tiered implement/verify, then routes to <code>/wf review</code>.</td>
</tr>
<tr>
  <td>Refactor without changing behaviour</td>
  <td><code>/wf intake refactor "what to refactor"</code></td>
  <td>Captures a test baseline first, refactors, re-verifies the baseline still holds.</td>
</tr>
<tr>
  <td>Brainstorm and rank improvement candidates</td>
  <td><code>/wf intake ideate "area"</code></td>
  <td>Produces a ranked list written to <code>.ai/workflows/&lt;slug&gt;/01-ideate.md</code>. Good for planning sessions.</td>
</tr>
<tr>
  <td>Triage whether something is worth fixing at all</td>
  <td><code>/wf simplify</code></td>
  <td>3-agent review (reuse / quality / efficiency) across your branch. Never writes code — produces a routing report pointing to the right downstream command for each finding.</td>
</tr>
</tbody>
</table>

<h2>Resuming or managing existing work</h2>

<table>
<thead><tr><th>I want to…</th><th>Command</th></tr></thead>
<tbody>
<tr><td>See all my in-progress workflows</td><td><code>/wf status</code></td></tr>
<tr><td>Pick up a workflow I walked away from</td><td><code>/wf recap &lt;slug&gt;</code></td></tr>
<tr><td>See what stage a workflow is at</td><td><code>/wf status &lt;slug&gt;</code></td></tr>
<tr><td>Add scope to an in-progress workflow</td><td><code>/wf intake &lt;slug&gt; &lt;scope&gt;</code></td></tr>
<tr><td>Mark a workflow done without shipping</td><td><code>/wf close &lt;slug&gt;</code></td></tr>
<tr><td>Sync the workflow registry after manual file changes</td><td><code>/wf status</code></td></tr>
<tr><td>Set up how this repo releases (once per repo)</td><td><code>/wf ship-plan init</code></td></tr>
<tr><td>Audit CI/CD against the ship plan</td><td><code>/wf ship-plan build</code></td></tr>
</tbody>
</table>

<h2>Design and docs work</h2>

<table>
<thead><tr><th>I want to…</th><th>Command</th><th>Notes</th></tr></thead>
<tbody>
<tr>
  <td>Generate a design brief for a screen</td>
  <td><code>/wf shape &lt;slug&gt;</code></td>
  <td>When the work has UI surface, shape authors the design brief (<code>02b-design.md</code>); <code>/wf plan</code> then authors the visual contract (<code>02c-craft.md</code>) and <code>/wf implement</code> builds against it. For a focused, single-move change use a transform: <code>/wf design &lt;slug&gt; &lt;transform&gt;</code>.</td>
</tr>
<tr>
  <td>Recolor a design to match a palette</td>
  <td><code>/wf design &lt;slug&gt; colorize</code></td>
  <td></td>
</tr>
<tr>
  <td>Polish and tighten an existing design</td>
  <td><code>/wf design &lt;slug&gt; polish</code></td>
  <td></td>
</tr>
<tr>
  <td>Audit a design against the design contract</td>
  <td><code>/wf design &lt;slug&gt; audit</code></td>
  <td></td>
</tr>
<tr>
  <td>Get a critique of a design</td>
  <td><code>/wf design &lt;slug&gt; critique</code></td>
  <td></td>
</tr>
<tr>
  <td>Generate or update documentation</td>
  <td><code>/wf docs &lt;sub-command&gt;</code></td>
  <td>Generates site pages, API docs, or reference content. Run <code>/wf docs</code> with no sub-command for the list.</td>
</tr>
</tbody>
</table>

<h2>Code review</h2>

<table>
<thead><tr><th>I want to…</th><th>Command</th><th>Notes</th></tr></thead>
<tbody>
<tr>
  <td>Review a specific dimension of my code (e.g. security)</td>
  <td><code>/wf review &lt;dimension&gt;</code></td>
  <td>Runs one rubric inline. Available dimensions: correctness, security, performance, architecture, accessibility, supply-chain, and 27 more. See <a href="../reference/review.html">the review reference →</a></td>
</tr>
<tr>
  <td>Run a full 33-dimension review and get a verdict</td>
  <td><code>/wf review sweep</code></td>
  <td>Fans out one agent per dimension in parallel. Slower but comprehensive.</td>
</tr>
<tr>
  <td>Review a specific GitHub PR</td>
  <td><code>/wf review &lt;dimension&gt; PR#&lt;number&gt;</code></td>
  <td></td>
</tr>
</tbody>
</table>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="start-workflow.html">See the full decision tree for picking a <code>/wf</code> entry point →</a></li>
  <li><a href="../orientation/mental-model.html">See how all five commands fit together →</a></li>
  <li><a href="../reference/commands.html">Complete reference for all commands and arguments →</a></li>
</ul>
</div>
""",
    None, None,
))


# === CHANGELOG ===

PAGES.append((
    "whats-new.html",
    "What's new",
    "reference",
    '<a href="index.html">Home</a> &rsaquo; What\'s new',
    """
<p class="lede">
User-facing highlights since v9.11, up to v9.123. Each entry links to the relevant reference page for details. The full technical changelog is in <a href="https://github.com/jayteealao/agent-skills/blob/master/plugins/sdlc-workflow/CHANGELOG.md">CHANGELOG.md</a>.
</p>

<h2>v9.123.0 — <code>/review</code> reframed as <code>/wf review</code></h2>
<p>Standalone <code>/review</code> stopped existing as its own invocable command once it folded into the lifecycle, but the plugin/marketplace descriptions and a few reference pages still advertised it as a second top-level command. They now correctly frame <code>/wf</code> as the single command, with code review as its <code>/wf review</code> key — a workflow stage on a slug (<code>/wf review &lt;slug&gt;</code>) or ad-hoc with a dimension (<code>/wf review &lt;dimension&gt;</code>). Also corrected: <code>/wf review</code> does <em>not</em> auto-invoke (the <code>/wf</code> skill is <code>disable-model-invocation</code>). See <a href="reference/commands.html">Commands →</a></p>

<h2>v9.122.0 — Documentation reconciliation</h2>
<p>A full doc-site pass reconciled every page against the v9.121 source of truth after ~33 feature releases. Retired surfaces (standalone <code>/review</code>, <code>/wf-quick</code>/<code>/wf-design</code> routers, <code>amend</code>, the <code>craft</code> design command, and the four augmentation "keys") are no longer taught as live; this changelog is backfilled through v9.121; the <code>/wf</code> reference and schema pages now cover <code>yolo</code>, <code>adopt</code>, <code>steer.md</code>, ship-plan readiness, batch handoff/ship, and the newer frontmatter fields; and the glossary's cross-page anchor links resolve again. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.121.0 — Headless verify: "no display" is a boot choice, not a wall</h2>
<p>Display-dependent verification adapters (Android, iOS, desktop) now boot <strong>headless by default</strong>, so a stage running as a background sub-agent with no attached screen — the common case under <code>/wf yolo</code> — no longer mistakes "no display" for "cannot verify." The Android emulator boots with <code>-no-window</code>, iOS reads the simulator runtime directly, and Linux desktop uses a virtual framebuffer. A missing display is only a lawful defer-reason after the adapter's headless boot has actually been attempted and its probe output recorded. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.120.0 — <code>steer.md</code>: standing instructions every stage honors</h2>
<p>An optional user-owned <code>.ai/workflows/&lt;slug&gt;/steer.md</code> (free prose, no schema) now carries standing constraints, preferences, and vetoes for a workflow — "don't touch the config loader", "prefer the queue approach" — and <strong>every stage reads it at Step 0 and honors it</strong>. Precedence is live-user &gt; <code>steer.md</code> &gt; stage defaults, and steering never overrides a mandatory gate. In an unattended <code>/wf yolo</code> run, a steering veto outranks every auto-resolve default. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.119.0 — <code>/wf handoff</code> and <code>/wf ship</code> are ship-plan aware</h2>
<p>Both release-facing stages now run a shared <strong>ship-plan readiness pre-check</strong> before committing to their work, so a missing or drifted <code>.ai/ship-plan.md</code> is caught early instead of dead-ending the release. It detects a missing plan or drift (vanished plan paths, new version manifests, unlisted CI secrets, migrations with no rollback), then routes you to <code>/wf ship-plan init</code> or <code>/wf ship-plan edit</code> — it never edits the plan itself. See <a href="how-to/author-ship-plan.html">Author a ship plan →</a></p>

<h2>v9.118.0 — <code>/wf intake adopt</code>: bring already-done work into the lifecycle</h2>
<p>A <strong>reverse-entry</strong> intake mode for when the change is <em>already made</em> in your working tree and you only afterward decide it deserves recorded verification. <code>adopt</code> reads the current diff and reconstructs the record backward (<code>01-adopt</code> → <code>02-shape</code> → <code>03-slice</code> → <code>04-plan</code> → <code>05-implement</code>, all stamped <code>provenance: adopted</code>), then lands the workflow at <code>/wf verify</code> so the standard quality tail runs over the adopted change. A confirm-before-write gate shows you the inferred shape first; it never writes or undoes code. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.116–9.117 — <code>study-sources</code>: read real upstream source instead of guessing</h2>
<p>A new read-only skill that grounds work in <strong>actual dependency and upstream source</strong> rather than recalled API shapes. It reads what's already installed first (<code>node_modules</code>, <code>~/.m2</code>, the Gradle/Android/Go/Rust/.NET/Ruby/PHP/Swift/Dart caches) and only fetches into a gitignored <code>.scratch/</code> if absent — nothing it reads enters your repo or git history. A lifecycle-wide Step 0.8 makes it available to every stage; <code>intake rca</code>, <code>intake investigate</code>, <code>plan</code>, <code>implement</code>, and <code>intake update-deps</code> reach for it explicitly. See <a href="reference/skills.html">Skills →</a></p>

<h2>v9.114–9.115 — <code>update-deps</code> autonomy and mandatory changelog citation</h2>
<p><code>/wf yolo</code> can now drive an <code>update-deps</code> workflow autonomously (full plan, defer failures) instead of refusing. And <code>/wf intake update-deps</code> now requires each research batch to ground its breaking-changes in the package's <strong>own changelog or release notes</strong> — reading every intermediate major and citing the exact source. A P0/P1 package with no locatable changelog is marked <code>unverified</code> and recommended <code>hold</code>, not assumed clean. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.113.0 — <code>diataxis</code> skill restored; three passive skills removed</h2>
<p>The <code>diataxis</code> documentation skill returns as a single consolidated skill — the standalone, general-purpose counterpart to the lifecycle-bound <code>/wf docs</code>. At the same time the unused <code>refactoring-patterns</code>, <code>test-patterns</code>, and <code>error-analysis</code> knowledge skills were deleted (never wired into any stage; their content is applied unprompted). The skill surface is now <code>wf</code> plus <code>consult</code>, <code>imagery</code>, <code>uiproto</code>, <code>diataxis</code>, and <code>study-sources</code>. See <a href="reference/skills.html">Skills →</a></p>

<h2>v9.108.0 — <code>/wf yolo</code>: autonomous lifecycle driver</h2>
<p>The no-human-gates sibling of <code>/wf auto</code> (Claude-only). <code>/wf yolo &lt;slug&gt;</code> drives every stage and resolves each gate by a written policy rather than pausing for you, stopping before handoff. It classifies the slug by <code>workflow-type</code> so compressed change-modes (<code>fix</code>/<code>hotfix</code>/<code>refactor</code>) and RCA drive correctly, defers acceptance criteria it genuinely can't verify, and creates or switches to a dedicated branch up front. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.105–9.106 — Branch-scoped batch handoff/ship + revision ledger</h2>
<p><code>/wf handoff</code>, <code>/wf ship</code>, <code>/wf recap</code>, <code>/wf retro</code>, and <code>/wf status</code> now accept a <strong>polymorphic first argument</strong> — a slug, <code>pr#N</code>, or a branch name. A PR/branch argument runs <strong>batch mode</strong> over every slug on the branch: batch handoff opens one shared PR and reports which slugs are ready; batch ship is all-or-nothing across the branch. Revisable artifacts became living documents with a reason-centric <code>revisions:</code> frontmatter ledger, and the dashboard now clusters branch-shared workflows under a <code>⎇ branch</code> header with a readiness chip. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<h2>v9.98–9.102 — <code>/wf</code> becomes the single entry point (20 keys)</h2>
<p>The last sibling routers dissolved into <code>/wf</code>: <code>/wf-meta</code> and <code>/wf-docs</code> are retired (their members are now keys like <code>/wf status</code>, <code>/wf recap</code>, <code>/wf close</code>, <code>/wf ship-plan</code>, <code>/wf docs</code>), the standalone <code>/review</code> skill folded into <code>/wf review</code>, and <code>amend</code> was dropped (corrections are a new slice or a fix; the ship plan uses <code>/wf ship-plan edit</code>). The surface compacted to <strong>20 keys</strong> — 10 stages, 5 standalone/drivers, 2 navigation, 1 lifecycle-control, 2 routers. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.96.0 — Design folds into the lifecycle; <code>craft</code> retired</h2>
<p>UI work now rides the normal <code>shape → plan → implement → verify</code> flow instead of a separate <code>craft</code> command. <code>shape</code> authors the design brief (<code>02b-design.md</code>), <code>plan</code> authors the visual contract (<code>02c-craft.md</code>) and resolves the image gate, and <code>implement</code> applies the contract with a mandatory critique pass. <code>/wf design</code> is now a transforms-and-analysis dispatcher of <strong>20 commands</strong> (15 transforms + <code>audit</code>/<code>critique</code>/<code>extract</code>/<code>setup</code>/<code>teach</code>) — there is no <code>craft</code> command. See <a href="how-to/use-design.html">Use design →</a></p>

<h2>v9.95.0 — Verifiability-first acceptance criteria</h2>
<p>Closes the "verified but actually broken" leak class. Every user-observable acceptance criterion is now authored <em>with</em> its verification path — <code>slice</code> attaches a <code>verify: { method, env, fixture, rung }</code> stub, <code>plan</code> adds a <code>## Verification Strategy</code>, and <code>verify</code> mandates a constraint-resolution ladder before any deferral (static reasoning is never evidence, a mock never satisfies an integration criterion). A write-time hook hard-blocks a <code>result: pass</code> that contradicts its own evidence. See <a href="reference/pipeline.html">Pipeline →</a></p>

<h2>v9.92–9.94 — Narrative story sections, external-model dispatch, and new review dimensions</h2>
<p>Every <code>/wf</code> artifact now opens with a prose <strong>story section</strong> named after its stage (<code>## The Plan</code>, <code>## The Verification</code>) — a self-sufficient lead you can read alone. The plugin also gained opt-in <strong>external-model dispatch</strong> (<code>consult</code> as a read-only oracle, <code>imagery</code>, <code>uiproto</code>; gated behind <code>externalDispatch.enabled</code>), and code review grew to <strong>33 dimensions</strong> with the <code>motion</code> and <code>interface-craft</code> lenses. See <a href="reference/artifacts.html">Artifacts →</a></p>

<h2>v9.90–9.91 — YAGNI build-avoidance ladder</h2>
<p>A simplicity-first ladder now runs through the generative stages: <code>shape</code> asks a scope-restraint question, <code>plan</code> checks stdlib → native-platform → reuse before endorsing new code or a dependency, and <code>implement</code> favors direct calls over wrappers — with a non-negotiable "lazy ≠ negligent" guard that never trims validation, error handling, security, or accessibility. Intentional shortcuts leave an <code>sdlc-debt:</code> marker that <code>verify</code> validates, <code>retro</code> reconciles, and <code>/wf simplify</code> sweeps. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.88.0 — <code>/wf auto</code>: end-to-end lifecycle driver</h2>
<p><code>/wf auto &lt;slug&gt;</code> drives every slice through the full pipeline then runs a final review, stopping before handoff. <code>/wf auto &lt;slug&gt; &lt;slice&gt;</code> drives a single slice and routes to the next. Runs each stage in-process; writes no own artifact. Any gate failure pauses and surfaces the blocking issue. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.87.0 — Retire bespoke compressed-lifecycle prose</h2>
<p>Stale bespoke-artifact prose and the compressed-lifecycle planning documents were retired from the doc-site. Dispatcher and doc-site fixes from the compressed-lifecycle sweep. See <a href="tutorials/quick-fix-workflow.html">Quick-fix walkthrough →</a></p>

<h2>v9.86.0 — Compressed lifecycle: intake modes are standard lifecycles</h2>
<p>The four intake modes (<code>fix</code>, <code>hotfix</code>, <code>refactor</code>, <code>update-deps</code>) are now full standard lifecycles — they write all four planning artifacts (<code>01-*.md</code>, <code>02-shape.md</code>, <code>03-slice.md</code>, <code>04-plan.md</code>) in a single compressed pass, then hand off to the standard <code>/wf implement</code> and <code>/wf verify</code> chain. No stages are skipped. 14 bespoke renderers deleted. See <a href="tutorials/quick-fix-workflow.html">Quick-fix walkthrough →</a></p>

<h2>v9.83.0 — <code>/wf intake</code> modes replace <code>/wf-quick</code></h2>
<p>The standalone <code>/wf-quick</code> router is retired. Its 8 entry-point sub-commands (<code>fix</code>, <code>rca</code>, <code>investigate</code>, <code>discover</code>, <code>hotfix</code>, <code>refactor</code>, <code>update-deps</code>, <code>ideate</code>) are now modes of <code>/wf intake</code>. <code>probe</code> and <code>simplify</code> become standalone <code>/wf</code> keys. The <code>/wf</code> command table grows from 15 to 17 keys. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.82.0 — <code>/wf design</code> replaces <code>/wf-design</code></h2>
<p>The standalone <code>/wf-design</code> router is retired. Design is now one <code>/wf design &lt;slug&gt; &lt;cmd&gt;</code> sub-command — it authors the brief and visual contract then drives the downstream lifecycle itself. The 21 design commands (<code>craft</code>, 15 transforms, <code>audit</code>, <code>critique</code>, <code>extract</code>, <code>setup</code>, <code>teach</code>) are arguments to this one key. See <a href="reference/wf.html">&#47;wf reference →</a></p>

<h2>v9.81.0 — Tray self-heals a running stale process</h2>
<p>After a plugin upgrade, a tray already running from a prior version's bundle is now detected (Windows WMI scan), killed, and respawned from the current bundle at session start. Debounced via a marker file to avoid duplicate respawns from near-simultaneous sessions. Opt out with <code>SDLC_DISABLE_TRAY_HEAL=1</code>. See <a href="reference/tray.html">Tray app →</a></p>

<h2>v9.72.0 — Tray autostart launcher self-heals</h2>
<p>After a plugin upgrade, an enabled autostart launcher kept pointing at the prior version's tray bundle. Session start now calls <code>refreshAutostart</code> headlessly on every logon, re-stamping the launcher to the current bundle even while the tray is not running. Also switches ephemeral <code>fnm</code> node paths to the durable <code>aliases/default</code> node so the launcher survives shell restarts. See <a href="reference/tray.html">Tray app →</a></p>

<h2>v9.70.0 — Free narrative fragments</h2>
<p>Any artifact can now ship any number of <strong>free narrative fragments</strong> named <code>&lt;stem&gt;.&lt;label&gt;.html.fragment</code> — raw inline HTML with no envelope, scoping, or sibling <code>.yaml</code> requirement. The renderer injects them below the page body in filename order. Use them for bespoke diagrams, before/after flows, or interactive widgets. The existing typed fragment contract is unchanged. See <a href="reference/hooks.html">Hooks →</a></p>

<h2>v9.63.0 — Stale-render self-heal</h2>
<p>After a plugin upgrade, quiescent repos whose views were rendered at an older version now self-heal. The hub's reconcile tick (and the standalone daemon's timer) detect version drift between <code>.last-render</code> and the running plugin and spawn a background <code>render-sunflower --clean</code>. Open tabs refresh via the existing live-reload watch. Bounded by a concurrency cap, per-repo cooldown, and max-attempts ceiling. On by default; set <code>staleRender.heal: false</code> to disable. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<h2>v9.49.0 — Branch-aware hub</h2>
<p>The dashboard inbox now groups workflows <strong>repo → branch → slug</strong>. Each slug row shows a liveness badge: <code>merged</code> or <code>branch gone</code> (rendered as visible chips); active and unknown slugs show no badge. Registry identifiers are now repo-scoped (hash of repo root only), so the same slug on two branches appears as two distinct rows. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<h2>v9.47–9.48 — Hard block on missing fragment files</h2>
<p>If you write a rich-tier artifact (one of 14 types) without its companion <code>.yaml</code> fragment, the post-write hook now <strong>exits with an error and blocks the write</strong>. Previously it was a soft reminder. To opt out per-file, add <code>fragment: none</code> frontmatter. To disable project-wide, set <code>hooks.remindMissingFragments: false</code>. See <a href="reference/hooks.html">Hooks →</a></p>

<h2>v9.46.0 — System-tray app</h2>
<p>A tray app (<code>npm run tray</code>) puts dashboard status and controls in your notification area. Supports opt-in logon autostart. No <code>npm install</code> required — helper binaries are committed. See <a href="reference/tray.html">Tray app →</a></p>

<h2>v9.45.0 — No more runtime npm install</h2>
<p>All hooks, the renderer, the serve daemon, and the tray app now run from committed <code>dist/</code> bundles with dependencies inlined via esbuild. A CI freshness gate keeps the bundles in sync with source. See <a href="explanation/build-and-dist.html">Build &amp; dist model →</a></p>

<h2>v9.42–9.43 — Ship-plan inbound pipeline (Blocks H–K)</h2>
<p>The ship plan grew four new blocks covering code-quality gates, local developer experience, repo governance, and security/supply-chain checks. <code>/wf ship-plan build</code> audits your repo against the plan and generates the CI/CD and DX pipeline configuration. See <a href="reference/ship-plan-schema.html">Ship-plan schema →</a></p>

<h2>v9.41.0 — Handoff waits for real CI signal</h2>
<p>Handoff used to snapshot CI status and move on. Now it watches CI to a <strong>terminal state</strong> and waits for bot reviews to settle before triaging. Readiness is now judged on actual signal, not a stale snapshot. See <a href="how-to/triage-pr-comments.html">Triage PR comments →</a></p>

<h2>v9.38.0 — Machine-wide serve config</h2>
<p>Serve, host, port, and Tailscale settings moved from per-repo config to a machine-wide <code>~/.sdlc/hub-config.json</code>. Repos now opt in with one key: <code>view.hub.enabled</code>. The old per-repo <code>view.serve</code> is rejected by the schema. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<h2>v9.33–9.34 — Multi-repo hub, on by default</h2>
<p>One hub process now serves every registered repo at <code>/r/&lt;id&gt;/</code> with an aggregate inbox at <code>/</code>. Hub and serve flipped to default-on in v9.34 — opt out rather than opt in. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<h2>v9.20.0 — Dashboard (Sunflower view layer)</h2>
<p>The local HTML dashboard that renders your artifact files — calm paper-and-ink layout, inline SVG figures, live reload, and Tailscale sharing. See <a href="reference/serve.html">Serve daemon &amp; hub →</a></p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="https://github.com/jayteealao/agent-skills/blob/master/plugins/sdlc-workflow/CHANGELOG.md">Full technical changelog (CHANGELOG.md) →</a></li>
  <li><a href="orientation/mental-model.html">See how all the pieces fit together →</a></li>
</ul>
</div>
""",
    None, None,
))


# === TUTORIALS ===
PAGES.append((
    "tutorials/quick-fix-workflow.html",
    "Quick-fix walkthrough",
    "tutorial",
    '<a href="../index.html">Home</a> &rsaquo; Tutorials &rsaquo; Quick-fix',
    """

<p class="lede">You have a one-line fix — a typo, a wrong constant, a missing null check. You want it done in minutes, not hours, but you still want a record of what changed and why. <code>/wf intake fix</code> is the fast path: it is a <strong>compressed standard lifecycle</strong> — it runs <em>every</em> SDLC stage in a single lightweight pass (skipping none), recording a full intake → shape → slice → plan lifecycle, then hands off to the standard <code>/wf implement</code> → <code>/wf verify</code> → <code>/wf review</code> chain. You get the full quality trail of the long <a href="../reference/glossary.html#command">command</a> <code>/wf</code> without its multi-day ceremony.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>The plugin is installed (<a href="installation.html">install tutorial</a>). You have identified a small, bounded change — one file, one problem.</td></tr>
<tr><th>You will produce</th><td>The planning set <code>.ai/workflows/typo-invalid-payload/00-index.md</code> (a full <code>type: index</code> overview), <code>01-fix.md</code> (<code>type: intake</code>), <code>02-shape.md</code>, <code>03-slice.md</code>, and <code>04-plan.md</code> — then <code>05-implement.md</code> (and review) as the standard chain runs.</td></tr>
<tr><th>What's compressed</th><td>Each stage is single-pass and the whole fix is one un-suffixed slice — no stage is skipped, just expedited. A gate prompts you before implementation begins.</td></tr>
<tr><th>Time</th><td>Roughly 5–10 minutes for a real one-line fix.</td></tr>
</table>
</div>

<h2>The scenario</h2>

<p>You are reviewing a pull request and notice the wrong spelling in a user-facing error message in <code>src/api/parser.js</code>:</p>

<pre><code>// before
throw new Error("Recieved invalid payload");

// after
throw new Error("Received invalid payload");</code></pre>

<p>This is textbook: low risk, one file, one line, easy to verify. It belongs on <code>/wf intake fix</code>, not the full pipeline.</p>

<h2>Step 1 — Start the quick-fix workflow</h2>

<p>Type this in your Claude Code session:</p>

<pre><code>/wf intake fix "typo in invalid-payload error message"</code></pre>

<p>Claude asks two or three focused questions — which file, what the exact change is, whether a test needs updating. Answer them. Claude then creates two files under <code>.ai/workflows/typo-invalid-payload/</code>:</p>

<pre><code>.ai/workflows/typo-invalid-payload/
  00-index.md      ← registry entry for this workflow
  01-fix.md        ← the brief, scope, and acceptance criteria in one file</code></pre>

<p><strong>What <code>00-index.md</code> looks like:</strong></p>

<pre><code>---
schema: sdlc/v1
type: index
slug: typo-invalid-payload
title: "typo in invalid-payload error message"
workflow-type: fix
status: active
current-stage: plan
stage-number: 4
created-at: "2026-06-09T00:00:00Z"
updated-at: "2026-06-09T00:00:00Z"
# ... full 22-field index — see 00-index schema reference
---
# typo-invalid-payload

One-line spelling fix in the invalid-payload error message in src/api/parser.js.</code></pre>

<p><strong>What <code>01-fix.md</code> looks like:</strong></p>

<pre><code>---
schema: sdlc/v1
type: intake
slug: typo-invalid-payload
workflow-type: fix
status: complete
stage-number: 1
created-at: "2026-06-09T00:00:00Z"
updated-at: "2026-06-09T00:00:00Z"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape typo-invalid-payload"
---
# Fix brief — typo-invalid-payload

## Problem
`src/api/parser.js` line 42 spells "Recieved" instead of "Received" in the
thrown Error message. This surfaces directly to API consumers.

## Change
- File: src/api/parser.js
- Line: 42
- Before: `throw new Error("Recieved invalid payload");`
- After:  `throw new Error("Received invalid payload");`

## Acceptance criteria
1. The string "Recieved" no longer appears anywhere in src/api/parser.js.
2. Existing tests continue to pass.
3. No behaviour change.</code></pre>

<p>The compressed fix runs a lightweight shape rather than the deep requirements interview that the full <code>/wf shape</code> stage runs. For a spelling fix the acceptance criteria are obvious, so Claude captures them in a single pass (a real <code>02-shape.md</code>) instead of walking through the full shape interview — the stage is expedited, not skipped.</p>

<h2>Step 2 — Implement</h2>

<pre><code>/wf implement typo-invalid-payload</code></pre>

<p>The <code>implement</code> sub-command (a stage under the full <code>/wf</code> command) reads the un-suffixed <code>04-plan.md</code> (with <code>01-fix.md</code>, <code>02-shape.md</code>, and <code>03-slice.md</code> for context), makes the edit, runs your test command, and commits. It recognizes the compressed change-mode from the <code>workflow-type: fix</code> field in <code>00-index.md</code>, so it reads the single un-suffixed slice and writes one <code>05-implement.md</code> rather than per-slice files:</p>

<pre><code>.ai/workflows/typo-invalid-payload/
  00-index.md
  01-fix.md
  02-shape.md
  03-slice.md
  04-plan.md
  05-implement.md  ← added now</code></pre>

<p><strong>What <code>05-implement.md</code> looks like:</strong></p>

<pre><code>---
type: implement
slug: typo-invalid-payload
---
# Implementation — typo-invalid-payload

## Change made
src/api/parser.js line 42: "Recieved" → "Received"

## Test result
npm test — 47 passed, 0 failed

## Commit
fix(api): correct spelling in invalid-payload error message (a3f19c2)</code></pre>

<h2>Step 3 — Verify and review</h2>

<pre><code>/wf verify typo-invalid-payload</code></pre>

<p>Verify exercises the acceptance criteria from <code>02-shape.md</code> — runs your test command, checks the spelling fix, and records evidence in <code>06-verify.md</code>. If any check fails, verify runs a single-round, user-gated fix loop before proceeding.</p>

<pre><code>/wf review typo-invalid-payload</code></pre>

<p>Review dispatches the relevant dimension sub-agents (correctness, testing) and triages findings with you inline. Fix decisions are handled within the review stage itself. The result is <code>07-review.md</code> with a <code>verdict: ship | ship-with-caveats | dont-ship</code>.</p>

<h2>Step 4 — Handoff or commit directly</h2>

<p>For a one-liner on a shared branch you may not need a separate PR. Set <code>branch-strategy: none</code> during step 1 and the workflow stops here — the commit is the deliverable.</p>

<p>For a fix on its own branch:</p>

<pre><code>/wf handoff typo-invalid-payload</code></pre>

<p>This opens a PR. The PR readiness check (commitlint, surface drift, doc-mirror, triage, rebase, live check) still runs. The fast path reduces the artifact count up front; it does not bypass quality gates on the way out.</p>

<h2>When NOT to use <code>/wf intake fix</code></h2>

<ul>
  <li><strong>The change touches behaviour.</strong> A fix that changes what a function returns is not a one-liner. Use <code>/wf intake</code> to get a real shape.</li>
  <li><strong>More than one file or one area of the codebase.</strong> The fast path cannot carry cross-cutting complexity without breaking the artifact discipline.</li>
  <li><strong>You want a retrospective.</strong> Quick-fix workflows do not get a retro by default. Use <code>/wf</code> if the lesson-learning matters.</li>
</ul>

<h2>The other intake modes and standalone flows</h2>

<p>Each is a focused fast path — smaller artifact footprint than the full pipeline, but still leaving a record:</p>

<table>
<thead><tr><th>Command</th><th>For</th><th>What it produces</th></tr></thead>
<tbody>
<tr><td><code>/wf intake hotfix</code></td><td>Production incident — must ship in minutes</td><td>Full lifecycle single-pass, scope-locked; review defaults to security</td></tr>
<tr><td><code>/wf intake rca</code></td><td>Root-cause analysis from code and git history (static — no running app needed)</td><td><code>01-rca.md</code>, <code>02-shape.md</code> (synthesized minimal shape for <code>/wf plan</code>), <code>00-index.md</code>; recommends <code>/wf plan</code>, <code>/wf intake fix</code>, or <code>/wf intake hotfix</code> as next step</td></tr>
<tr><td><code>/wf probe</code></td><td>Runtime-truth check — drives the running artifact and compares output against acceptance criteria</td><td>Evidence directory + findings artifact (slug required)</td></tr>
<tr><td><code>/wf intake investigate</code></td><td>Sketch 2–3 distinct engineering approaches with tradeoffs before committing to one</td><td>Single artifact with options A/B/C; no winner picked — you choose, then route to <code>/wf intake fix</code> or <code>/wf intake</code></td></tr>
<tr><td><code>/wf intake discover</code></td><td>Test a theory about how the codebase works against real evidence</td><td>Single artifact with verdict: holds / partial / fails / inconclusive</td></tr>
<tr><td><code>/wf intake update-deps</code></td><td>Audit and tier dependency updates (P0 security → P1 major → P2 safe → hold)</td><td>Standard lifecycle in-slug under <code>.ai/workflows/&lt;slug&gt;/</code></td></tr>
<tr><td><code>/wf intake refactor</code></td><td>Behaviour-preserving refactor with test baseline capture and re-verification</td><td>Stage-locked: baseline → refactor → re-verify</td></tr>
<tr><td><code>/wf intake ideate</code></td><td>Brainstorm and rank improvement candidates</td><td><code>01-ideate.md</code> (type: ideation, ranked candidates + adversarial filter log) + <code>00-index.md</code> (type: workflow-index) under <code>.ai/workflows/&lt;slug&gt;/</code></td></tr>
<tr><td><code>/wf intake adopt</code></td><td>Reverse-entry — work already done in the working tree that you want to bring into the lifecycle after the fact</td><td>Reads the existing working-tree diff and reconstructs the record backward (stamped <code>provenance: adopted</code>), landing at <code>/wf verify</code></td></tr>
<tr><td><code>/wf simplify</code></td><td>Three-agent triage of a branch, commit, plan, or codebase — routes findings, never writes code</td><td>Routing report under <code>simplify/</code></td></tr>
</tbody>
</table>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="first-workflow.html">Walk through a full feature workflow →</a></li>
  <li><a href="../how-to/start-workflow.html">Not sure which command fits your change? Use the decision tree →</a></li>
  <li><a href="../reference/commands.html">See every sub-command's arguments and exact behaviour →</a></li>
</ul>
</div>

""",
    None, None,
))


PAGES.append((
    "reference/tray.html",
    "Tray app",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Tray app',
    """

<p class="lede">The tray app is a small menu in your notification area that shows whether the <a href="../reference/glossary.html#dashboard">dashboard</a> is running and lets you control it without opening a terminal. Instead of remembering which command starts the hub or checking a browser tab to see if it is up, you get a persistent icon with a one-line status and the common controls a click away. <span class="badge">v9.46+</span></p>

<p>No extra install is needed. The helper binaries and icons ship with the plugin, so <code>npm install</code> is not required to run the tray.</p>

<h2>Launch it</h2>
<p>You start the tray app yourself — Claude does not. Pick whichever form fits your workflow:</p>
<pre><code>npm run tray
node dist/tray.mjs
.\\scripts\\tray.ps1        # Windows launcher</code></pre>

<p>The tray resolves all paths from its own location and copies its helper binary to <code>~/.sdlc/bin/</code> on first run (in case the plugin directory is read-only).</p>

<h2>Icon states</h2>
<p>The icon in your notification area tells you the hub's health at a glance. Hovering shows a one-line summary — for example: <code>SDLC hub v9.49.0 · 3 repos · up 2h14m · 248 req</code>. The tray polls health every ~5 seconds and updates only when something changes.</p>

<table>
<thead><tr><th>Icon</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td>Full colour</td><td>Hub is healthy.</td></tr>
<tr><td>Grey</td><td>Hub is down.</td></tr>
<tr><td>Amber</td><td>A stale-version hub is running — restart to upgrade.</td></tr>
</tbody>
</table>

<h2>Menu items</h2>
<p>Right-clicking the icon opens the menu. The top row shows the current status; the rest are controls:</p>

<table>
<thead><tr><th>Item</th><th>Does</th></tr></thead>
<tbody>
<tr><td><strong>● status</strong> (top)</td><td>Health summary — <code>healthy</code> / <code>hub down — start it?</code> / <code>stale → restart</code>.</td></tr>
<tr><td>Open dashboard</td><td>Opens <code>http://127.0.0.1:4173/</code> in your browser.</td></tr>
<tr><td>Refresh registry</td><td>Re-scans all repos (<code>POST /__sdlc/registry/refresh</code>).</td></tr>
<tr><td>Health ▸</td><td>Version, pid, uptime, requests, SSE clients, RSS, config hash.</td></tr>
<tr><td>↳ per-repo rows</td><td>One row per registered repo — click to open <code>/r/&lt;id&gt;/</code>.</td></tr>
<tr><td>Restart / Stop hub</td><td>Hub lifecycle controls.</td></tr>
<tr><td>Open hub config… / logs…</td><td>Opens <code>~/.sdlc/hub-config.json</code> or the bootstrap log in your default editor.</td></tr>
<tr><td>Per-repo serve ✓</td><td>Toggles <code>hub-config.perRepoServe</code> (takes effect next session).</td></tr>
<tr><td>Start at login ✓</td><td>Opt-in autostart on logon — see below.</td></tr>
<tr><td>Quit</td><td>Exits the tray app; the hub keeps running.</td></tr>
</tbody>
</table>

<h2>Start at login (opt-in autostart)</h2>
<p>Autostart is off by default. When you toggle <strong>Start at login ✓</strong>, the tray writes a per-user launcher to your OS autostart location:</p>
<ul>
  <li><strong>Windows</strong> — the user Startup folder</li>
  <li><strong>macOS</strong> — LaunchAgents</li>
  <li><strong>Linux</strong> — XDG autostart</li>
</ul>
<p>File presence is the on/off state — no admin rights needed. When the tray starts with autostart enabled it also ensures the hub is running, so the hub comes up at logon before any Claude session starts (the lifecycle call is idempotent and simply adopts an already-running hub). The launcher embeds absolute paths captured at enable-time and self-heals if a plugin upgrade relocates the bundle. Turn autostart off from the same menu item before uninstalling the plugin.</p>

<p>Beyond healing the launcher file, the tray also heals the <em>running process</em> after an upgrade <span class="badge">v9.81</span>. At session start it detects a tray still executing a prior version's bundle (on Windows via a WMI process scan), kills it, and respawns from the current bundle so a stale build cannot linger. A liveness heartbeat <span class="badge">v9.89</span> lets the heal reap even a wedged current-version tray. If you need to disable the running-process heal, set the environment variable <code>SDLC_DISABLE_TRAY_HEAL=1</code>.</p>

<details>
<summary>Technical details — how the tray is built</summary>
<p>The tray speaks its own stdio protocol defined in <code>lib/tray-protocol.mjs</code>, not a third-party tray library. It ships as an ESM bundle at <code>dist/tray.mjs</code> produced by the shared <a href="../explanation/build-and-dist.html">build step</a>. Its native helper binaries and icons are committed to the repository so the app runs without any install step. (<code>sharp</code>, <code>to-ico</code>, and the tray helper toolchain are ad-hoc maintainer dev tools, not committed dependencies — they are only needed when regenerating the icons.)</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="serve.html">See what the tray controls — the serve daemon and hub →</a></li>
  <li><a href="../explanation/build-and-dist.html">Understand why no install is needed — the build and dist model →</a></li>
  <li><a href="../reference/glossary.html">Look up any unfamiliar terms in the glossary →</a></li>
</ul>
</div>

""",
    ("reference/serve.html", "Serve daemon"),
    ("reference/types.html", "Artifact types"),
))


# === EXPLANATION ===
PAGES.append((
    "explanation/why-this-exists.html",
    "Why this exists",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Why this exists',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand the deeper reasoning behind why it is built the way it is.</p>

<h2>The token-limit problem</h2>

<p>An AI assistant has no persistent memory. Each conversation starts from zero. You give it context, it works, the session ends, and everything it reasoned through — trade-offs considered, decisions made, approaches ruled out — vanishes. The output is code. The reasoning is gone.</p>

<p>This is not a bug to be fixed in a future model version. It is structural. Even within a single long conversation, context windows have limits. As a session grows, earlier reasoning falls out of scope. The AI you are working with at step 80 is not carrying the same frame as the one at step 10.</p>

<p>The cost compounds over time. One AI session produces a working feature. A follow-up session three weeks later has to re-discover the original intent from code alone — with no record of what was considered and rejected, what edge cases were deliberately deferred, or what constraints shaped the design. A second developer on the same codebase has even less to go on.</p>

<h2>The artifacts-over-memory solution</h2>

<p>The plugin's answer is to stop relying on AI memory entirely. Instead of trusting that reasoning will survive in a conversation, the plugin requires the AI to write that reasoning into files — <strong>artifacts</strong> (workflow notes committed alongside your code) — at each stage of a workflow.</p>

<p>Each artifact captures the reasoning <em>at the moment it happened</em>: what the spec says and why, what the plan chose and what it ruled out, what got built and what was deferred. The file is the durable record. The conversation is disposable.</p>

<p>The next session reads the artifact trail instead of relying on you to re-explain everything. Resume work after six weeks: one command restores orientation. Hand off to a colleague: they read the stage files, not a chat transcript. Ask "why did we do X?" three months later: search the artifact directory for the slug and read the narrative.</p>

<details>
<summary>Technical details: what "artifact" means structurally</summary>
<p>Each stage writes one file under <code>.ai/workflows/&lt;slug&gt;/</code>. The file has YAML frontmatter with machine-readable state (stage, status, timestamps) and a Markdown body with the human-readable narrative. The frontmatter is what the plugin queries to know where a workflow stands. The body is what a person reads to understand what happened and why.</p>
<p>A <strong>slug</strong> is a short identifier tied to a single unit of work — for example, <code>add-auth-middleware</code>. All artifacts for that work share the same slug directory.</p>
</details>

<h2>How this relates to software development lifecycle discipline</h2>

<p>Software development lifecycle (SDLC) discipline — writing specs before code, planning before implementing, reviewing before shipping — exists precisely because decisions made cheaply at the start are expensive to undo at the end. The standard critique is that the overhead is too high for small changes.</p>

<p>The plugin makes SDLC discipline cheap enough to use routinely. Each stage is a short, structured AI interaction that produces one file. The overhead is minutes, not hours. The artifact trail is the discipline record.</p>

<p>This is not a process methodology. The plugin does not enforce agile, kanban, or any planning framework. It enforces one thing only: that reasoning gets written down before it can be lost.</p>

<h2>What this is not</h2>

<ul>
  <li><strong>Not a project tracker.</strong> Artifacts record reasoning and state, not assignments, deadlines, or velocity. <code>00-index.md</code> answers "what stage is this workflow at" — not "who owns this and when is it due."</li>
  <li><strong>Not a substitute for code review.</strong> Review is itself a stage the plugin orchestrates. It does not replace the humans doing the review.</li>
  <li><strong>Not an automation layer for most commands.</strong> Every stage asks you. The AI proposes; you choose. <code>/wf auto</code> is the deliberate exception: it sequences stages automatically, but it does not suppress any stage&#39;s own quality gates or open a PR on your behalf.</li>
</ul>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../orientation/is-this-for-me.html">Decide whether the plugin fits your situation →</a></li>
  <li><a href="artifacts-over-memory.html">Go deeper on how artifacts replace AI memory →</a></li>
  <li><a href="orchestrator-discipline.html">Understand how stages are kept from collapsing into each other →</a></li>
</ul>
</div>

""",
    None,
    ("explanation/artifacts-over-memory.html", "Artifacts over memory"),
))


PAGES.append((
    "explanation/artifacts-over-memory.html",
    "Artifacts over memory",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Artifacts over memory',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand why the plugin writes files instead of relying on Claude's in-context memory.</p>

<h2>The problem: every AI session starts fresh</h2>

<p>When you open a new conversation with Claude, it remembers nothing from previous conversations. It does not know the decisions you made last week, the trade-offs you considered, or the constraints you mentioned three sessions ago. Every session is a blank slate.</p>

<p>That means every time you start a new session, you have to re-explain your project. You have to re-explain what you decided and why. You have to trust that you will remember to mention the right things. If you forget to mention something, the AI will proceed without it.</p>

<p>This is called re-onboarding cost. It is paid every time a new session starts, and it is paid again by any other developer who joins the project later.</p>

<h2>The fix: write the understanding down</h2>

<p>Instead of holding context only in memory, the plugin writes each stage's output to a file on disk. These files are called <a href="../reference/glossary.html">artifacts</a> — plain Markdown files that record what was decided and why at each step of the workflow.</p>

<p>Because the files live on disk, any future session can read them. The next session does not need to be re-onboarded — it reads the trail of artifacts left by previous sessions.</p>

<p>Here is how that looks in practice. Say you run <code>/wf shape</code> on a new feature. The plugin writes a file called <code>02-shape.md</code> describing the spec. A week later you start a new session and run <code>/wf implement</code>. The plugin reads <code>02-shape.md</code> first. It does not ask you to re-explain the spec. It already has it.</p>

<h2>One file per stage</h2>

<p>The plugin produces a separate artifact for each <a href="../reference/glossary.html">stage</a> — a named step in the workflow. Keeping them separate has three benefits.</p>

<p>First, each stage has to commit to its output before the next stage begins. The shape artifact captures the spec before any code is written. The plan artifact captures the approach before implementation starts. If those were merged into a single file written after the fact, the spec would just reflect what got built, not what was asked for.</p>

<p>Second, resuming work is cheap. You can stop after any stage, come back weeks later, and run <code>/wf recap</code>. The command reads the artifact trail and tells you exactly where things stand.</p>

<p>Third, answering "why did we do X?" becomes mechanical. The artifacts are committed files. You can open <code>.ai/workflows/</code>, find the <a href="../reference/glossary.html">slug</a> (the short identifier for this unit of work), and read the relevant stage's notes directly. No AI recall needed.</p>

<h2>The trade-off</h2>

<p>Writing artifacts takes effort. Each stage requires a conversation with the AI and produces a file. For a trivial one-line change this overhead is real and not worthwhile.</p>

<p>That is why the plugin also provides intake modes (<code>/wf intake &lt;mode&gt;</code>), which compress the full pipeline into a focused shorter interaction for small changes.</p>

<p>For larger changes, the artifact cost is paid once and recouped many times over. The spec is written before the code. The plan is written before implementation. The review findings are recorded before fixes are made. Each of those files is available to every future session, every collaborator, and every audit.</p>

<details>
<summary>Technical detail: where artifacts live</summary>
<p>All artifacts are written under <code>.ai/workflows/&lt;slug&gt;/</code> in the repository root. The slug is a short identifier derived from the branch name. Each stage has a numbered filename: <code>01-intake.md</code>, <code>02-shape.md</code>, <code>03-slice.md</code>, and so on. The full list of filenames and their contents is in the <a href="../reference/artifacts.html">artifacts reference</a>.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="why-this-exists.html">See the full problem this solves →</a></li>
  <li><a href="orchestrator-discipline.html">Understand how stages stay in their lane →</a></li>
  <li><a href="../reference/artifacts.html">Look up every file the plugin writes →</a></li>
</ul>
</div>

""",
    ("explanation/why-this-exists.html", "Why this exists"),
    ("explanation/orchestrator-discipline.html", "Orchestrator discipline"),
))


PAGES.append((
    "explanation/orchestrator-discipline.html",
    "Orchestrator discipline",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Orchestrator discipline',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand the rules that govern how Claude behaves when running workflow stages.</p>

<h2>What an orchestrator is</h2>

<p>When you run a command like <code>/wf plan</code>, Claude acts as an <strong>orchestrator</strong> — a coordinator that directs work without doing the work itself. An orchestrator's job is to call the right next step, not to solve the underlying problem in place.</p>

<p>This is a constraint, not a limitation. The plugin enforces it deliberately.</p>

<h2>One role per stage</h2>

<p>Each <a href="../reference/glossary.html#stage">stage</a> (a single named step in a workflow, such as <code>shape</code>, <code>plan</code>, or <code>implement</code>) has exactly one role. It performs that role and stops.</p>

<table>
<thead><tr><th>Stage</th><th>What it does</th><th>What it does not do</th></tr></thead>
<tbody>
<tr><td><code>shape</code></td><td>Defines the goal and acceptance criteria.</td><td>Writes code.</td></tr>
<tr><td><code>plan</code></td><td>Produces a step-by-step implementation plan.</td><td>Implements the plan.</td></tr>
<tr><td><code>implement</code></td><td>Builds against the written plan.</td><td>Redesigns the spec.</td></tr>
<tr><td><code>review</code></td><td>Dispatches reviewers, aggregates findings, triages with the user, and runs a single-round user-gated fix loop (Step 4c).</td><td>Silently fixes findings or auto-loops fixes without user approval.</td></tr>
<tr><td><code>handoff</code></td><td>Packages work for human review.</td><td>Ships to production.</td></tr>
<tr><td><code>ship</code></td><td>Walks the release sequence.</td><td>Writes new code or rewrites the spec.</td></tr>
</tbody>
</table>

<p>If a stage is tempted to step outside its role, it stops and routes to the appropriate stage instead. The plugin's internal reference files contain explicit "if you catch yourself doing X, STOP" lines for each stage.</p>

<h2>The External Output Boundary</h2>

<p>A related rule governs what each stage is allowed to produce outside the workflow itself. This boundary is called the <strong>External Output Boundary</strong>. It is the line between writing a workflow <a href="../reference/glossary.html#artifact">artifact</a> (a file that belongs to the workflow record) and making changes that affect the world — pushing to a remote, sending a message, or deploying. Only the <code>ship</code> stage is permitted to cross that boundary. Every other stage writes only to the workflow's own files.</p>

<p>This means a review stage that finds a critical bug cannot quietly push a fix. It records the finding. The fix goes through <code>implement</code>. The push goes through <code>ship</code>. The boundary is what makes the audit trail trustworthy.</p>

<h2>Why these constraints exist</h2>

<p>Without the orchestrator rule, two things collapse.</p>

<p>First, <strong>artifacts lose meaning</strong>. If <code>plan</code> also writes code, the plan file ends up documenting only what survived implementation. A plan written before the code represents intent. A plan written after represents rationalization. They look the same on disk but serve different purposes.</p>

<p>Second, <strong>failures have nowhere to go</strong>. When <code>implement</code> finds the plan was wrong, it needs a defined path back — a corrective slice via <code>/wf intake &lt;slug&gt; &lt;scope&gt;</code>. When <code>review</code> finds a bug, it runs a user-gated fix loop in-process — every finding the user marks "Fix" dispatches a fix sub-agent inside the same invocation. If that loop cannot resolve the issue, there is a defined escape path: <code>/wf implement … reviews</code>. The discipline creates a graph where every failure has a named next move. Without it, Claude improvises — and improvisation leaves no trace.</p>

<h2>What collapse looks like in practice</h2>

<ul>
  <li><strong>Plan/implement collapse.</strong> Plan and implement happen in one step. The plan becomes a thin commit-message-style narrative written after the fact.</li>
  <li><strong>Review/fix collapse.</strong> Review fixes its own findings silently. The review artifact no longer records what was found versus what was changed.</li>
  <li><strong>Shape/code collapse.</strong> Shape only describes what got built. Future readers cannot tell whether the original goal was ever met.</li>
</ul>

<h2>The cost</h2>

<p>Each routing hop is a context switch. For very small changes this is real overhead. That is why the intake modes (<code>/wf intake &lt;mode&gt;</code>) exist — they compress the full sequence into a focused flow when the change is small enough that the hops add no value.</p>

<p>For larger changes the hops are themselves useful. Every hop is a point where a human can redirect, approve, or stop.</p>

<details>
<summary>Technical details — "STOP" enforcement in reference files</summary>
<p>Each stage's skill file contains a section headed "Out of scope." It lists actions the stage must refuse, with explicit language: "If you catch yourself writing code during plan, STOP." These lines are read by the orchestrator at stage entry. They are not suggestions — they are part of the stage contract that the command layer enforces before handing off to Claude.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="artifacts-over-memory.html">See why every stage writes its own file →</a></li>
  <li><a href="adaptive-routing.html">See how stages offer multiple "next" options when routing →</a></li>
  <li><a href="../how-to/amend-or-extend.html">Amend a plan when implement finds it was wrong →</a></li>
</ul>
</div>

""",
    ("explanation/artifacts-over-memory.html", "Artifacts over memory"),
    ("explanation/diataxis-integration.html", "Diátaxis integration"),
))


PAGES.append((
    "explanation/diataxis-integration.html",
    "Diátaxis integration",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Diátaxis integration',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand why the docs site is structured the way it is.</p>

<h2>What Diátaxis is</h2>

<p><a href="https://diataxis.fr/">Diátaxis</a> is a framework for organising technical documentation. It was created by Daniele Procida. The core observation is simple: when someone reads a doc, they are in one of four distinct states of mind, and a document written for one state of mind does not serve someone in a different one.</p>

<p>The four states are:</p>

<table>
<thead><tr><th>Quadrant</th><th>Reader's state of mind</th><th>What they need</th></tr></thead>
<tbody>
<tr><td><strong>Tutorial</strong></td><td>Learning — I want to experience it working</td><td>Guided steps, a clear outcome, no decisions to make yet</td></tr>
<tr><td><strong>How-to guide</strong></td><td>Doing — I know what I want, I need the steps</td><td>Pre-conditions, numbered steps, what to do when it varies</td></tr>
<tr><td><strong>Reference</strong></td><td>Looking up — I need a specific fact right now</td><td>Complete, consistent, no opinions, scannable</td></tr>
<tr><td><strong>Explanation</strong></td><td>Understanding — I want to know why</td><td>Background, trade-offs, context, history</td></tr>
</tbody>
</table>

<p>The problem with most documentation is that a single page tries to serve all four states at once. A how-to guide that explains why each step works is a worse how-to guide — because the reader who just wants the steps has to wade through the explanation. A reference page that drifts into tutorial steps stops being a reliable lookup target. Diátaxis says: write each document for exactly one quadrant, and keep it there.</p>

<h2>Why this matters for generated docs</h2>

<p>Docs are usually produced at the end of a project, quickly, under pressure. The result tends to be a single long document that mixes instructions, background, and reference material — useful to no one in particular.</p>

<p>The plugin treats documentation as a first-class output, planned at the same time as the code. The Diátaxis framework gives the generator a concrete discipline: before writing anything, decide which quadrant it belongs to, then follow only the rules for that quadrant.</p>

<h2>How the plugin applies it</h2>

<p>There are three points where Diátaxis shapes what the plugin does.</p>

<h3>1. The shape stage plans the docs</h3>

<p>The <a href="../reference/glossary.html">shape stage</a> (run via <code>/wf shape</code>) is where a workflow is scoped before any code is written. One of the questions it asks is: what documentation does this work need? The answer is recorded in the workflow's <code>02-shape.md</code> note as <code>docs-needed</code> and <code>docs-types</code>. The available types map directly to the four Diátaxis quadrants, plus <code>plan</code>, <code>readme</code>, and <code>review</code>.</p>

<p>Deciding which docs are needed at shape time — not at the end — means the documentation intent is part of the work definition, not an afterthought.</p>

<h3>2. The handoff stage generates the docs</h3>

<p>The <a href="../reference/glossary.html">handoff stage</a> (run via <code>/wf handoff</code>) reads the docs plan from <code>02-shape.md</code> and generates each requested document. For each document type, it loads the corresponding quadrant template from the plugin's own reference library. That template contains the full discipline for that quadrant: required structure, anti-patterns to avoid, and a self-check list. The generator follows the template for that quadrant and nothing else.</p>

<p>A tutorial generated this way will not drift into explanation. A reference page will not sprout step-by-step instructions. The quadrant boundary is enforced by the template, not by hoping the writer remembers the rule.</p>

<h3>3. The /wf docs key runs a standalone docs cycle</h3>

<p>The <code>/wf docs</code> key runs a discover, audit, plan, generate, and review cycle on a project's existing documentation. It does not require an active workflow. Each document it generates targets exactly one quadrant.</p>

<p>For documentation work entirely outside a <code>/wf</code> lifecycle, a standalone <code>diataxis</code> skill also exists <span class="badge">v9.113</span>. It is the general-purpose counterpart to the lifecycle-bound <code>/wf docs</code>: the same quadrant discipline (classify the request, then enforce the boundary between tutorial, how-to, reference, and explanation), invocable directly for a one-off tutorial, how-to guide, reference page, explanation, README, doc plan, or a review of existing docs. Reach for <code>/wf docs</code> when documentation is a stage of a lifecycle workflow, and the standalone <code>diataxis</code> skill otherwise.</p>

<details>
<summary>Technical detail — where the quadrant templates live</summary>
<p>The per-quadrant templates are stored at <code>skills/wf/reference/docs/&lt;type&gt;.md</code> inside the plugin. Each file contains structure rules, anti-patterns, and a self-check for that quadrant. Handoff loads the file at generation time; it is not embedded in the handoff prompt itself. Editing those files changes what the generator produces.</p>
</details>

<h2>This doc site</h2>

<p>The doc site you are reading now is itself organised by Diátaxis quadrant. The top-level sections — Tutorials, How-to guides, Reference, Explanation — correspond to the four quadrants. Pages are placed in exactly one section. If you are looking for steps to follow, look in How-to guides. If you want to understand a concept, look in Explanation. If you need a complete list of commands or configuration keys, look in Reference.</p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../tutorials/first-workflow.html">Follow a guided first workflow →</a></li>
  <li><a href="../reference/commands.html">See every command listed in one place →</a></li>
  <li><a href="orchestrator-discipline.html">Understand how the plugin runs multi-step work →</a></li>
</ul>
</div>

""",
    ("explanation/orchestrator-discipline.html", "Orchestrator discipline"),
    ("explanation/branch-strategy.html", "Branch strategy"),
))


PAGES.append((
    "explanation/branch-strategy.html",
    "Branch strategy",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Branch strategy',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand how the plugin manages git branches and what each strategy option means in practice.</p>

<p>When you start a workflow, the plugin records a <strong>branch strategy</strong> — a setting that controls how much git work the plugin does on your behalf when handing off code. There are three options: <code>dedicated</code>, <code>shared</code>, and <code>none</code>. You pick once at intake and rarely change it.</p>

<p>The setting lives in the <code>branch-strategy</code> field of <code>00-index.md</code>, the workflow's index file. If you have not read about intake yet, see <a href="../how-to/start-workflow.html">Start a workflow</a>.</p>

<h2>dedicated (default)</h2>

<p>Most feature work lands here. The plugin creates its own git branch (default name: <code>feat/&lt;slug&gt;</code>) and its own pull request. A <strong>slug</strong> is the short identifier the plugin uses to name the workflow and its files — for example, <code>auth-refresh</code>.</p>

<p>What the plugin does at handoff with this strategy:</p>
<ul>
  <li>Pushes the branch to the remote.</li>
  <li>Opens or updates a pull request automatically.</li>
  <li>Watches CI to a terminal state and gives bot reviewers a bounded settle window before triage begins (stage T5.0).</li>
  <li>Triages any review comments through a bounded loop (stage T5.1).</li>
  <li>Rebases onto the base branch with <code>--force-with-lease</code> if the branch falls behind (stage T5.2).</li>
  <li>Re-watches CI (T5.1 fix commits and T5.2 rebase retrigger checks) and captures the final live review decision and readiness verdict into <code>08-handoff.md</code> (stage T5.3).</li>
</ul>

<p>Choose <code>dedicated</code> when your change will be reviewed as a standalone pull request.</p>

<h2>shared</h2>

<p>Some teams merge work onto a long-lived branch — a release train, a shared feature branch, or a main branch that receives small commits directly. Force-pushing onto such a branch would overwrite other contributors' commits.</p>

<p>What the plugin does at handoff with this strategy:</p>
<ul>
  <li>Pushes the branch to the remote.</li>
  <li>Does <em>not</em> open a pull request automatically. You manage PR creation yourself.</li>
  <li>Skips PR comment triage (T5.1) and rebase (T5.2) unconditionally — force-pushing a shared branch is destructive and triage is not automated for non-auto-created PRs.</li>
  <li>Watches CI and captures final readiness (T5.0/T5.3) only if you have manually recorded a <code>pr-number</code> in the workflow index.</li>
</ul>

<p>Choose <code>shared</code> when your branch is one contributor among many and a force-push would be destructive.</p>

<h2>none</h2>

<p>Sometimes a workflow does not ship code at all — a documentation update that lives only locally, a spike you want to explore and discard, or a prototype that should not touch the remote.</p>

<p>What the plugin does at handoff with this strategy:</p>
<ul>
  <li>Writes <code>08-handoff.md</code> as the final deliverable.</li>
  <li>Does <em>not</em> push, open a PR, triage comments, rebase, or run any live check.</li>
</ul>

<p>The handoff artifact itself is the externalised result. Choose <code>none</code> when the workflow is self-contained and git operations add no value.</p>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start{What's the change?}
  start -- Feature; reviewer-friendly PR --> dedicated[branch-strategy: dedicated]
  start -- Joining a long-lived branch others share --> shared[branch-strategy: shared]
  start -- Docs-only / local-only / spike --> none[branch-strategy: none]

  dedicated -.-> dedicated_eff[Push, open PR<br/>--force-with-lease on rebase<br/>T5.1 triage runs<br/>T5.2 rebase runs<br/>T5.3 live check runs]
  shared -.-> shared_eff[Push branch<br/>NO auto-PR<br/>T5.1/T5.2 ALWAYS SKIPPED<br/>T5.0/T5.3 only if pr-number recorded]
  none -.-> none_eff[No git operations<br/>Handoff artifact is the deliverable<br/>T5.0/T5.1/T5.2/T5.3 all skipped]
</pre>
</div>
<p class="caption">Each strategy enables a different subset of the handoff stages.</p>

<h2>Branch liveness <span class="badge">v9.49</span></h2>

<p>Separate from the strategy above, the <strong>dashboard</strong> — the multi-repo overview page served by the plugin — annotates each workflow with a soft liveness badge. This badge describes the current state of the branch in git, and helps you spot stale workflows at a glance. It never blocks a stage.</p>

<details>
<summary>Liveness badge values</summary>
<table>
<thead><tr><th>Badge</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td>(no badge)</td><td>The branch ref exists and has not yet been fully merged into its base (active). Also shown when no branch is declared (<code>branch-strategy: none</code>), git is unavailable, or any error — fails open.</td></tr>
<tr><td><code>merged</code></td><td>The branch tip is an ancestor of the base branch, or the pull request resolved as <code>MERGED</code>. Rendered as a visible chip.</td></tr>
<tr><td><code>planned</code></td><td>The branch ref is not found <em>and</em> the workflow is still at a pre-branch stage (intake, shape, slice, or plan) — its dedicated branch has not been created yet. Distinct from <code>branch gone</code>, which means the branch existed and was deleted. Rendered as a visible chip.</td></tr>
<tr><td><code>branch gone</code></td><td>The branch ref is no longer present locally — typically deleted after merging. Rendered as a visible chip.</td></tr>
</tbody>
</table>
<p>For more about the dashboard, see <a href="../reference/serve.html">Serve daemon &amp; hub</a>.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/start-workflow.html">Pick your branch strategy at intake →</a></li>
  <li><a href="the-readiness-gate.html">See which fields the readiness check computes for each strategy →</a></li>
  <li><a href="../reference/serve.html">Learn how the dashboard uses liveness badges →</a></li>
</ul>
</div>

""",
    ("explanation/diataxis-integration.html", "Diátaxis integration"),
    ("explanation/adaptive-routing.html", "Adaptive routing"),
))


PAGES.append((
    "explanation/adaptive-routing.html",
    "Adaptive routing",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Adaptive routing',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand how the plugin decides which stage to run next, and how you can override that decision.</p>

<h2>What adaptive routing means</h2>

<p><strong>Adaptive routing</strong> is the name for the rule that every stage offers more than one valid next move. Instead of a fixed sequence where stage 3 always leads to stage 4, the plugin presents a short menu of viable transitions after each stage completes. You pick. The plugin does not silently choose for you.</p>

<p>The benefit: real work rarely fits a straight line. A review might reveal a design flaw, not just code issues. A feature might be simple enough to skip an intermediate stage entirely. Adaptive routing lets you respond to what you actually found, not what the default assumed you'd find.</p>

<h2>Where the options come from</h2>

<p>Each <a href="../reference/glossary.html">stage</a> writes a <strong>workflow note</strong> (an artifact — a markdown file the plugin creates in your repo to track progress). That note includes a <code>## Recommended Next Stage</code> section. This section lists every valid transition from that stage, with a short reason for each one.</p>

<p>The options follow a four-way pattern:</p>

<table>
<thead><tr><th>Option type</th><th>When to use it</th></tr></thead>
<tbody>
<tr><td><strong>Default (sequential)</strong></td><td>The natural next stage. Safe choice when nothing unexpected came up.</td></tr>
<tr><td><strong>Skip forward</strong></td><td>Jump ahead when an intermediate stage would add no value for this specific change.</td></tr>
<tr><td><strong>Revisit (go back)</strong></td><td>Return to an earlier stage when the current one revealed an upstream problem.</td></tr>
<tr><td><strong>Parallel</strong></td><td>Start a sibling branch — for example, begin planning a second slice while implementing the first.</td></tr>
</tbody>
</table>

<p>You can always press enter to accept the default. The alternatives are there for the cases when you cannot.</p>

<h2>Concrete examples</h2>

<dl>
<dt><strong>After shape</strong></dt>
<dd>Default: run <code>/wf slice</code> to break the shaped idea into work units. If the feature is UI-heavy, shape has already authored the design brief (<code>02b-design.md</code>) and <code>/wf plan</code> will author the visual contract — design rides the normal flow. Alternative: skip slicing entirely and jump to plan for a single-slice feature.</dd>

<dt><strong>After review</strong></dt>
<dd>Default: run <code>/wf handoff</code> to prepare the PR. Alternative: run <code>/wf implement &lt;slug&gt; reviews</code> if the review found issues that must be addressed first. Alternative: add a corrective slice via <code>/wf intake &lt;slug&gt; &lt;scope&gt;</code> if the review revealed the original spec was wrong.</dd>

<dt><strong>After ship</strong></dt>
<dd>Default: run <code>/wf retro</code> to close out the work. Alternative: resume a paused run. Alternative: roll back and amend the plan with a recovery playbook for the next attempt.</dd>
</dl>

<h2>Why it does not become chaos</h2>

<p>Three constraints keep the flexibility manageable:</p>

<ul>
  <li><strong>All valid transitions are enumerated.</strong> The options listed in each workflow note are the complete set. There is no hidden graph of undocumented jumps.</li>
  <li><strong>Skipping writes a stub, not silence.</strong> When you skip a stage, the plugin writes a minimal workflow note marking it as skipped. History stays intact.</li>
  <li><strong>You see all options; you choose.</strong> The plugin proposes. You route. Nothing moves forward without your confirmation.</li>
</ul>

<details>
<summary>Technical detail: how options are generated</summary>
<p>Each stage's reference file (in <code>${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/</code>) contains an <code># Adaptive routing</code> section listing viable transitions as labelled options (Option A, B, C…). The model follows these options to write a <code>## Recommended Next Stage</code> section into the stage artifact. Editing the reference file changes what options are offered — no separate routing engine reads a structured block.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="orchestrator-discipline.html">Understand why every transition is explicit →</a></li>
  <li><a href="../how-to/navigate-workflows.html">Find where you are in a workflow →</a></li>
  <li><a href="../reference/glossary.html">Look up stages, artifacts, and other terms →</a></li>
</ul>
</div>

""",
    ("explanation/branch-strategy.html", "Branch strategy"),
    ("explanation/augmentations-model.html", "Add-ons model"),
))


PAGES.append((
    "explanation/augmentations-model.html",
    "Add-ons model",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Add-ons model',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand the design behind add-ons (precisely: augmentations) and why they are structured as optional bolted-on passes rather than required stages.</p>

<h2>The problem add-ons solve</h2>

<p>A standard workflow has a fixed sequence of stages — plan, design, implement, verify, handoff, ship. That sequence is useful for every feature. But not every feature needs observability signals. Not every change needs a performance baseline. Not every rollout needs a feature flag and a cohort split.</p>

<p>If those capabilities were built into the required stage sequence, you would pay for them on every workflow, even the ones that do not need them. Every simple bug fix would generate an instrument file, a benchmark file, and an experiment file — most of them empty.</p>

<p>Add-ons (augmentations) are the answer. They are passes you bolt on explicitly, only when you need them. The pipeline stays thin by default.</p>

<h2>What "bolted-on" means in practice</h2>

<p>A stage (<a href="../reference/glossary.html">glossary</a>) is a mandatory position in the workflow sequence. An add-on is not a stage — and, since v9.98, it is <strong>not a command you run</strong> either. <code>shape</code> decides which add-ons a piece of work needs (writing an <code>## Augmentation Plan</code> and the <code>augmentations-needed</code> frontmatter), and <code>plan</code>/<code>implement</code>/<code>verify</code> apply them by loading <code>skills/wf/reference/augment/&lt;type&gt;.md</code> as an internal sub-procedure. Applying one writes an <a href="../reference/glossary.html">artifact</a> — a workflow note — and registers it in the slice index so downstream stages know it exists. (<code>rca</code> is the exception — it is still invoked directly, via <code>/wf intake rca</code>.)</p>

<p>The downstream stages (implement, handoff, ship) read the index. If an add-on artifact is registered, they incorporate it. If no add-on artifact is registered, they skip that path entirely. You never have to remove empty placeholders.</p>

<h2>The four add-ons</h2>

<dl>
<dt><strong>instrument</strong> — observability design</dt>
<dd>Use this when the code path you are changing has no logs, metrics, or traces and you want to add them. The add-on writes <code>04b-instrument.md</code> describing the signals to add. The implement stage reads that file and adds the signals alongside the feature code.</dd>

<dt><strong>experiment</strong> — measured rollout</dt>
<dd>Use this when you want to gate a behaviour change behind a feature flag with a defined cohort split and rollback signal. The add-on writes <code>04c-experiment.md</code> with flag wiring, cohort design, and success metrics.</dd>

<dt><strong>benchmark</strong> — performance baseline and comparison</dt>
<dd>Use this when the change could affect performance and you want evidence. Run it before implement to capture a baseline. Run it again after implement to compare. The comparison output feeds into the verify stage's evidence file.</dd>

<dt><strong>rca</strong> — root-cause analysis</dt>
<dd>Use this when the cause of a failure or regression is unknown and needs diagnosis before a fix can be planned. Running <code>/wf intake rca &lt;slug&gt;</code> in slug-mode attaches the analysis as an <code>augmentation-type: rca</code> artifact to an existing workflow, registering it in the slice index for downstream stages to pick up.</dd>
</dl>

<p><strong>Profile</strong> is the fourth thing <code>shape</code> can flag in <code>augmentations-needed</code> (ad-hoc hotspot work) — but its artifact is <code>type: profile</code>, not <code>type: augmentation</code>, so it is not one of the four <code>augmentation-type</code> discriminator values. For a freestanding profiling pass with no active workflow, reach for <code>/wf probe</code>; there is no <code>/wf profile</code> key.</p>

<h2>How registration works</h2>

<p>When <code>plan</code> or <code>implement</code> applies a shape-decided add-on for a slice, the plugin appends an entry to the <code>augmentations</code> array in that slice's index file (<code>00-index.md</code>). That entry is what downstream stages check. The artifact file and the index entry are created together; you do not manage the index manually.</p>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  user["shape decides: augmentations-needed: [instrument]"]
  user --> inst["plan/implement write 04b-instrument.md"]
  inst --> reg["00-index.md augmentations array updated"]
  reg --> impl["/wf implement reads 04b-*.md"]
  reg --> handoff["/wf handoff surfaces it as a reviewer note"]
  reg --> ship["/wf ship translates it to a changelog line"]

  classDef art fill:#dbeafe,stroke:#1d4ed8,color:#1f1f1d
  classDef cmd fill:#fef3c7,stroke:#b45309,color:#1f1f1d
  class user,impl,handoff,ship cmd
  class inst,reg art
</pre>
</div>
<p class="caption">Once <code>shape</code> flags an add-on, it is registered permanently. Every downstream stage that runs after that point picks it up automatically.</p>

<h2>How downstream stages surface add-ons</h2>

<p>Handoff and ship do not repeat your internal artifact names or file paths to the outside world. They translate each registered add-on into a plain-language mention appropriate for its audience.</p>

<table>
<thead><tr><th>Add-on</th><th>In handoff (reviewer note)</th><th>In ship (changelog line)</th></tr></thead>
<tbody>
<tr><td>instrument</td><td>"Added observability — N signals for previously unobserved code paths"</td><td>"Added detailed monitoring for &lt;feature&gt;"</td></tr>
<tr><td>experiment</td><td>"Wrapped behind feature flag with cohort split for measured rollout"</td><td>"Rolled out to N% of users"</td></tr>
<tr><td>benchmark</td><td>"Performance baseline taken; verify-stage comparison: within tripwires / regression"</td><td>Omitted unless the result is user-visible</td></tr>
<tr><td>profile</td><td>Not surfaced in handoff (freestanding)</td><td>Not included in changelog</td></tr>
</tbody>
</table>

<details>
<summary>Technical detail: augmentation-type discriminator</summary>
<p>In the index schema, instrument, experiment, benchmark, and rca share <code>type: augmentation</code> as their top-level type. The specific kind is stored in a separate <code>augmentation-type</code> field. Code that processes augmentations must read <code>augmentation-type</code> to distinguish them — checking <code>type</code> alone is not enough.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/use-augmentations.html">Add an add-on to an active workflow →</a></li>
  <li><a href="../reference/commands.html">See the full add-on command list →</a></li>
  <li><a href="../reference/pipeline.html">Understand the stage pipeline add-ons extend →</a></li>
</ul>
</div>

""",
    ("explanation/adaptive-routing.html", "Adaptive routing"),
    ("explanation/idempotency-in-ship.html", "Idempotency in ship"),
))


PAGES.append((
    "explanation/idempotency-in-ship.html",
    "Idempotency in ship",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Idempotency in ship',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand why <code>/wf ship</code> can be safely re-run after a partial failure.</p>

<h2>The core idea</h2>

<p>When a step in a release can be re-run without causing harm — because it checks whether the work is already done before doing it again — that step is called <strong>idempotent</strong> (from mathematics: an operation that produces the same result whether applied once or many times). Every step in <code>/wf ship</code> is designed this way.</p>

<p>In practice, this means: if your release fails halfway through — the registry returned an error, your connection dropped, a check timed out — you can run <code>/wf ship &lt;slug&gt;</code> again and the release picks up where it stopped. Steps that already completed are skipped. Steps that did not complete are retried.</p>

<h2>Why this matters</h2>

<p>A release has side effects that cannot be undone: merging a pull request, creating a git tag, publishing a package. Without the idempotency guarantee, re-running after a partial failure risks merging twice, creating duplicate tags, or publishing conflicting versions. The check-before-act pattern prevents all of these.</p>

<h2>How each step detects it is already done</h2>

<p>Every step follows the same two-phase pattern: first detect, then act. If detection shows the work is done, the step logs a note and moves on.</p>

<div class="diagram">
<pre class="mermaid">
flowchart LR
  step[Step N invoked] --> check{Already done?}
  check -- yes --> noop[No-op; log a note; move on]
  check -- no --> act[Perform the side effect]
  act --> record[Record evidence in run frontmatter]
  noop --> next[Step N+1]
  record --> next
</pre>
</div>
<p class="caption">Resume re-enters the loop at step N. The detection short-circuits and the step is safely skipped.</p>

<p>The table below shows exactly what each step checks. The checks are cheap — reading a file, asking GitHub for PR state, asking git whether a tag exists.</p>

<table>
<thead><tr><th>Step</th><th>Detects already-done by</th></tr></thead>
<tbody>
<tr><td>Pre-flight version bump</td><td>Reading the source-of-truth file; if the version already matches the target, no write happens.</td></tr>
<tr><td>Publish dry-run</td><td>Always safe to re-run; it has no lasting side effects.</td></tr>
<tr><td>Merge</td><td><code>gh pr view --json state,merged</code>; if <code>merged: true</code>, the merge commit is captured and the step is skipped.</td></tr>
<tr><td>Tag</td><td><code>git rev-parse "v&lt;version&gt;"</code>; if the tag exists, the step is skipped.</td></tr>
<tr><td>Workflow watch</td><td>If <code>release-workflow-conclusion: success</code> is already recorded in the run artifact, the step is skipped.</td></tr>
<tr><td>Post-publish poll</td><td>Each individual check is tracked; only checks still at <code>pending</code> are re-polled.</td></tr>
<tr><td>Post-release bump</td><td>If the source-of-truth file already shows the next dev version, no write happens.</td></tr>
</tbody>
</table>

<h2>One edge case: plan-version mismatch</h2>

<p>When a release is paused partway through, the run <a href="../reference/glossary.html#artifact">artifact</a> — the workflow note file that records progress — stores a <code>plan-version-at-run</code> field. If the plugin is updated between the pause and the resume, and the new plugin version has a different plan version, the resume prompt shows a warning.</p>

<p>Resuming is still safe. The shape of the release steps does not change between plan versions — only the contents of the plan file may differ. The warning exists so you are not surprised; it does not block you.</p>

<details>
<summary>Technical details: where evidence is stored</summary>
<p>Each step that completes writes a field into the frontmatter of the run artifact (the <code>09-ship-run-&lt;run-id&gt;.md</code> file, where <code>&lt;run-id&gt;</code> is a UTC compact timestamp such as <code>20260620T1430Z</code>). The detection logic at the start of each step reads these fields. If the field is present and shows success, the step is a no-op. See the <a href="../reference/09-ship-run-schema.html">ship-run schema</a> for the full list of evidence fields.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/resume-paused-work.html">Resume a paused release in practice →</a></li>
  <li><a href="../reference/09-ship-run-schema.html">See all evidence fields in the ship-run schema →</a></li>
  <li><a href="../reference/glossary.html">Look up unfamiliar terms in the glossary →</a></li>
</ul>
</div>

""",
    ("explanation/augmentations-model.html", "Add-ons model"),
    ("explanation/the-readiness-gate.html", "The readiness check"),
))


PAGES.append((
    "explanation/the-readiness-gate.html",
    "The readiness check",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; The readiness check',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand what the readiness check is, which gates it runs, and how to respond when it blocks.</p>

<h2>What the readiness check is</h2>

<p>When you run <code>/wf handoff</code>, the plugin examines several conditions about your branch and writes a single verdict to <code>08-handoff.md</code>. That verdict is called the <strong>readiness check</strong>. The <code>/wf ship</code> command reads it before executing the release — merging the PR, tagging, and running the publish workflow. If the verdict is not <code>ready</code>, ship stops and tells you why.</p>

<p>The verdict has three possible values:</p>

<table>
<tr><th><code>ready</code></th><td>All gates passed. Ship will proceed.</td></tr>
<tr><th><code>awaiting-input</code></th><td>Something needs time or a decision, not a code fix. Ship refuses until you resolve it and re-run handoff.</td></tr>
<tr><th><code>blocked</code></th><td>Something requires a code action before the branch can ship. Ship refuses until you fix the underlying issue and re-run handoff.</td></tr>
</table>

<h2>Why it exists</h2>

<p>Before this check was introduced, the ship command trusted whatever handoff had written and proceeded. Failing CI, reviewer-requested changes, API surface drift, and unresolved comments could all slip through silently.</p>

<p>The readiness check makes those conditions explicit. Handoff is required to compute the verdict. Ship is required to read it. Neither step can skip the check.</p>

<h2>Which gates run</h2>

<p>The verdict is a deterministic function of the fields below. The plugin evaluates them in order and stops at the first failure.</p>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start[Handoff T5.3 begins]
  start --> q1{commitlint-status<br/>= fail?}
  q1 -- yes --> blocked
  q1 -- no --> q2{public-surface-drift<br/>= drift-without-regen?}
  q2 -- yes --> blocked
  q2 -- no --> q3{rebase-status<br/>= conflicts or lease-failure?}
  q3 -- yes --> blocked
  q3 -- no --> q4{live-review-decision<br/>= CHANGES_REQUESTED?}
  q4 -- yes --> blocked
  q4 -- no --> q5{live-checks-failing<br/>is non-empty?}
  q5 -- yes --> blocked
  q5 -- no --> q6{has-deferred-comments<br/>= true?}
  q6 -- yes (with 🔴) --> blocked
  q6 -- yes (only 🟡) --> awaiting[awaiting-input]
  q6 -- no --> q7{live-checks-pending<br/>is non-empty?}
  q7 -- yes --> awaiting
  q7 -- no --> ready

  classDef good fill:#dcfce7,stroke:#15803d,color:#1f1f1d
  classDef soft fill:#fef3c7,stroke:#b45309,color:#1f1f1d
  classDef bad fill:#fee2e2,stroke:#b91c1c,color:#1f1f1d
  class ready good
  class awaiting soft
  class blocked bad
</pre>
</div>
<p class="caption">The verdict is a deterministic function of the contributing fields. No subjective judgement.</p>

<h2>How to respond when it blocks</h2>

<p>The distinction between <code>blocked</code> and <code>awaiting-input</code> tells you what kind of action to take next.</p>

<h3>When the verdict is <code>blocked</code></h3>

<p>Something requires a code action. Here are the conditions that trigger it and what to do:</p>

<ul>
  <li><strong>Commit lint failed</strong> — fix the offending commit message, then re-run handoff.</li>
  <li><strong>Public surface drift</strong> — the public API changed but the generated types were not regenerated. Run the regen step inside <code>/wf implement</code>, then re-run handoff.</li>
  <li><strong>Rebase conflicts or lease failure</strong> — the branch is out of date or has a conflict. Rebase or merge, resolve any conflicts, then re-run handoff.</li>
  <li><strong>Reviewer requested changes</strong> — a reviewer left a "Changes requested" review on the open PR. Address the review, then re-run handoff.</li>
  <li><strong>CI checks failing</strong> — one or more required checks are red. Fix the failing tests or build, then re-run handoff.</li>
  <li><strong>Deferred comments include a red item</strong> — a PR comment marked as a blocker was deferred rather than resolved. Resolve or decline it explicitly, then re-run handoff.</li>
</ul>

<h3>When the verdict is <code>awaiting-input</code></h3>

<p>Something needs time or a decision, not a code fix:</p>

<ul>
  <li><strong>CI checks still running</strong> — wait for them to finish, then re-run handoff.</li>
  <li><strong>Deferred comments are all yellow</strong> — only non-blocking suggestions were deferred. Decide whether to apply or decline each one, then re-run handoff.</li>
</ul>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/triage-pr-comments.html">Triage PR comments and clear deferred items →</a></li>
  <li><a href="../reference/08-handoff-schema.html">See every field the readiness check reads →</a></li>
  <li><a href="../how-to/run-a-release.html">Run a release once the gate opens →</a></li>
</ul>
</div>

""",
    ("explanation/idempotency-in-ship.html", "Idempotency in ship"),
    None,
))


PAGES.append((
    "explanation/build-and-dist.html",
    "Build & dist model",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Build &amp; dist model',
    """

<p class="lede">You do not need this page to use the plugin. Read it if you want to understand how the plugin's hooks and server are built and shipped — relevant if you are debugging a hook that seems stale.</p>

<h2>The problem the dist model solves</h2>
<p>Claude Code plugins do not run <code>npm install</code> for you, and <code>node_modules</code> is excluded from the repository. A hook that imports a third-party library such as <code>markdown-it</code> or <code>js-yaml</code> would crash on a fresh checkout with <code>Cannot find package …</code>.</p>
<p>Since <span class="badge">v9.45</span> the plugin avoids that problem by bundling each entry point together with its dependencies before committing. The resulting files live in <code>dist/</code> and are checked into source control. Anyone who clones the repository gets working hooks immediately — no install step required.</p>

<h2>What runs from <code>dist/</code></h2>
<p>Every piece of the plugin that executes at runtime is served from a committed bundle:</p>
<ul>
  <li>The seven hooks: <code>pre-write-validate</code>, <code>post-write-verify</code>, <code>post-write-auto-stage</code>, <code>post-write-render</code>, <code>session-start-orient</code>, and the two advisory External-Output-Boundary guards <code>leak-guard-bash</code> and <code>leak-guard-write</code> (default off).</li>
  <li>The renderer and serve daemons: <code>render-sunflower.mjs</code>, <code>render-sunflower-serve.mjs</code>, and <code>hub-serve.mjs</code>.</li>
  <li>Several maintenance and coordination helpers: <code>hub-ensure.mjs</code> (render-queue drain trigger), <code>hub-upgrade.mjs</code> (runtime upgrade), <code>tray-heal.mjs</code> (stale-tray reconcile), and <code>verify-runtime.mjs</code> (integrity check).</li>
  <li>The tray app: <code>tray.mjs</code>.</li>
</ul>
<p>The loader (<code>lib/entrypoint.mjs</code>) picks the bundle at <code>dist/&lt;name&gt;.mjs</code> when it exists. It falls back to the source file in <code>scripts/</code> only if no bundle is present — that is the state before the first build on a fresh maintainer checkout.</p>

<h2>The one rule for maintainers</h2>
<p>Source files live in <code>scripts/</code>, <code>hooks/</code>, <code>lib/</code>, <code>renderers/</code>, and <code>components/</code>. After editing any of those you must rebuild before committing:</p>
<pre><code>npm install            # installs the dev toolchain — never needed at user runtime
npm run build          # rebuilds dist/ from source
npm run sync:codex     # mirrors the rebuilt runtime into the Codex plugin tree (keeps buildId in lockstep)
npm test               # runs the test suite (against source, not dist/)
npm run hooks:install  # optional: points core.hooksPath at .githooks/ (you supply the hook scripts)</code></pre>

<div class="callout warn">
<strong>The test suite runs against source, not dist.</strong> A passing <code>npm test</code> does not prove <code>dist/</code> is current. A CI freshness gate catches this: it rebuilds and compares. Stale bundles fail CI, and an un-rebuilt <code>dist/</code> means production runs old code even when tests are green.
</div>

<details>
<summary>Technical details — how the build works</summary>
<p>The build script calls <code>esbuild</code> for each entry point with code-splitting enabled. Shared dependencies (<code>markdown-it</code>, <code>js-yaml</code>, <code>ajv</code>, and shared library helpers) are extracted into <code>dist/chunk-&lt;hash&gt;.mjs</code> shared chunks. Entry-point bundles import those chunks at runtime — no package resolution needed. No dynamic requires, no runtime <code>npm install</code>. <code>npm run hooks:install</code> only runs <code>git config core.hooksPath .githooks</code>, pointing Git at a <code>.githooks/</code> directory where you would supply your own hook scripts — it does not write or install any hook file, and no such scripts are committed today.</p>
</details>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../reference/hooks.html">See what each hook does at runtime →</a></li>
  <li><a href="../reference/serve.html">Understand the serve daemon and hub →</a></li>
  <li><a href="../reference/tray.html">See how the tray app is shipped →</a></li>
</ul>
</div>

""",
    ("explanation/the-readiness-gate.html", "The readiness check"),
    None,
))


# === TIPS ===
PAGES.append((
    "tips/escape-hatches.html",
    "Escape hatches",
    "tips",
    '<a href="../index.html">Home</a> &rsaquo; Tips &rsaquo; Escape hatches',
    """

<p class="lede">The workflow is not always the right tool. Here is how to skip, bypass, or lighten specific parts without losing the artifact trail — the record of what changed and why.</p>

<h2>Most common: just skip the plugin entirely</h2>

<p>The plugin is opt-in. If you are fixing a typo, reverting a bad commit, or doing any change you would never want to revisit, just commit and push. Nothing breaks. No stub to close. Move on.</p>

<h2>Need some trail but not the full flow?</h2>

<p>Use the intake modes (<code>/wf intake &lt;mode&gt;</code>), which compress the full workflow into a focused single call. They still write artifacts for every stage (intake brief, shape, slice, plan) but in a single compressed pass, then hand off to the standard <code>/wf implement</code> and <code>/wf verify</code> chain.</p>

<pre><code>/wf intake fix</code></pre>

<p>For a hotfix where production is down, review is scoped to the security rubric rather than a full review sweep:</p>

<pre><code>/wf intake hotfix</code></pre>

<p>The review stage still runs — it defaults to <code>/wf review &lt;slug&gt; security</code> (auth, tokens, crypto, permissions) — keeping the audit trail complete while staying fast.</p>

<h2>Skip a slice mid-workflow</h2>

<p>You are part-way through a multi-slice workflow and one slice is not worth running. Use <code>/wf close</code> with the slice name — it absorbs the former <code>skip</code> sub-command, now scoped to a slice rather than a single pipeline stage:</p>

<pre><code>/wf close my-slug &lt;slice&gt;</code></pre>

<p>This marks the slice terminated so downstream prerequisites are satisfied, and writes a slice skip record. The skip is recorded — you stay accountable for it.</p>

<h2>Walk away and resume later</h2>

<p>Artifacts are written to disk as they are produced. If you need to stop mid-workflow, just stop. Nothing is lost. Resume when ready:</p>

<pre><code>/wf recap my-slug</code></pre>

<h2>Abandon a workflow that went the wrong direction</h2>

<p>You started a workflow and the approach turned out to be wrong. Do not delete the directory — that breaks the audit trail. Close it with a reason instead:</p>

<pre><code>/wf close my-slug cancelled</code></pre>

<p>The workflow stops appearing as active. The artifacts remain for reference.</p>

<h2>Skip the PR-readiness check</h2>

<p>The readiness check (a computed verdict on whether your PR is ready to ship) requires a live PR to inspect. If you are not using a PR-based branch strategy, set <code>branch-strategy: none</code> at intake. The readiness check is then skipped automatically — it has nothing to inspect.</p>

<h2>Suppress the sibling-fragment hard block</h2>

<p>Rich-tier artifacts — review, plan, design, ship-run, post-incident review, and add-ons (optional workflow extensions) — must land alongside a sibling <code>.yaml</code> file. The <code>post-write-verify</code> hook exits with an error if the sibling is missing. This exists because without the <code>.yaml</code> the dashboard falls back to a plain render and loses structured data.</p>

<p>Two ways to opt out:</p>

<ul>
  <li>Add <code>fragment: none</code> to the frontmatter of a single artifact to exempt just that file.</li>
  <li>Set <code>hooks.remindMissingFragments: false</code> in <code>.ai/sdlc-config.json</code> to disable the block project-wide.</li>
</ul>

<p>Prefer authoring the fragment. The opt-out exists for migrations and edge cases, not routine use.</p>

<h2>The plugin asks too many questions at intake</h2>

<p>If intake feels like an interview you did not sign up for, that is a signal the change is small enough for an intake mode. Decline the current intake and re-run with <code>/wf intake fix</code> or another mode.</p>

<h2>What is not a valid escape hatch</h2>

<ul>
  <li><strong>Do not hand-edit artifact frontmatter to fix a stage status.</strong> Use <code>/wf status</code> — it reconciles the index against disk reality automatically.</li>
  <li><strong>Do not delete the workflow directory to start over.</strong> Close it first (<code>/wf close my-slug cancelled</code>), then start a fresh workflow. The closed record belongs in the trail.</li>
  <li><strong>Do not edit <code>readiness-verdict: blocked</code> to <code>ready</code> by hand.</strong> The verdict is computed from real signals. Overwriting it hides the problem, not the risk.</li>
</ul>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="anti-patterns.html">See what breaks the trail (anti-patterns) →</a></li>
  <li><a href="../how-to/close-workflows.html">Close a workflow cleanly →</a></li>
  <li><a href="../reference/glossary.html">Look up any term used here →</a></li>
</ul>
</div>

""",
    None,
    ("tips/tricks.html", "Tricks"),
))


PAGES.append((
    "tips/tricks.html",
    "Tricks",
    "tips",
    '<a href="../index.html">Home</a> &rsaquo; Tips &rsaquo; Tricks',
    """

<p class="lede">Patterns that make the workflow faster or more useful once you are past the basics. Each entry below names the situation it fits.</p>

<h2>Run two slices in parallel</h2>
<p><strong>When:</strong> your work was split into multiple <a href="../reference/glossary.html">slices</a> (independent sub-scopes of a single workflow) and you want both done at the same time.</p>
<p>Open two Claude Code sessions on the same repository and run <code>/wf plan</code> and <code>/wf implement</code> on different slices simultaneously. Each stage writes to its own file inside <code>.ai/workflows/&lt;slug&gt;/</code>, so the two sessions never touch the same file.</p>

<h2>Re-run handoff to pick up new review-bot comments</h2>
<p><strong>When:</strong> a PR has been sitting for a day or two and bots have added more feedback since you last triaged.</p>
<p>Just run <code>/wf handoff &lt;slug&gt;</code> again. The command is additive — it preserves the prior handoff revision, re-watches CI, runs a fresh triage pass on new comments, and appends a revision section to <code>08-handoff.md</code>. You do not need to replay earlier pipeline stages.</p>

<h2>Explore unfamiliar code before planning</h2>
<p><strong>When:</strong> you are about to plan a change in a part of the codebase you have not worked in before.</p>
<p>Run the <code>deep-research</code> skill first — it dispatches parallel explore sub-agents and synthesises an explanation of the unfamiliar code. Plan then has the context it needs and produces better acceptance criteria. (To explain an existing workflow artifact instead, use <code>/wf recap &lt;slug&gt; &lt;focus&gt;</code>.)</p>
<pre><code>deep-research "how does the auth middleware validate JWT tokens here?"
/wf plan add-token-refresh default-slice</code></pre>

<h2>Narrow the review-bot list to reduce noise</h2>
<p><strong>When:</strong> your team uses only one or two review bots and the triage step is cluttered with comments from others.</p>
<p>The default bot list (<code>coderabbitai</code>, <code>greptile-dev</code>, <code>gemini-code-assist</code>, <code>chatgpt-codex-connector[bot]</code>) is intentionally broad. Narrow it in your workflow's <code>00-index.md</code> registry entry:</p>
<pre><code>review-bots:
  - coderabbitai</code></pre>
<p>Triage runs faster and the handoff artifact is less noisy.</p>

<h2>Send one slice per PR instead of bundling all slices</h2>
<p><strong>When:</strong> your work has multiple slices and reviewers prefer smaller, focused PRs.</p>
<p>By default <code>/wf handoff &lt;slug&gt;</code> bundles all complete slices into one PR. To open a PR for a single slice only, pass the slice name as a second argument:</p>
<pre><code>/wf handoff add-health-endpoint api-slice</code></pre>

<h2>Record a surprise failure in the ship plan</h2>
<p><strong>When:</strong> a ship run hit a failure mode the plan did not anticipate and you have now resolved it.</p>
<p>Run <code>/wf ship-plan edit</code> after fixing the issue. Add the failure and its resolution to the recovery playbooks block in the plan. The plan then carries that institutional knowledge for every future ship on the same project.</p>

<h2>Add an add-on only where it matters</h2>
<p><strong>When:</strong> one slice needs benchmarking or instrumentation but others do not.</p>
<p>An <a href="../reference/glossary.html">add-on</a> (an optional stage that extends a specific slice with extra analysis, such as <code>instrument</code> or <code>benchmark</code>) writes a single file scoped to that slice. Add it only where the cost of running it is justified — leave it off the rest. Register it in the <code>augmentations:</code> array of <code>00-index.md</code> for the slice you want it on.</p>

<h2>Skip shape and slice for a trivial change</h2>
<p><strong>When:</strong> the change is a single-file edit that does not need the full scoping interview, but you still want a commit record.</p>
<p>Use a compressed intake mode — <code>/wf intake fix</code> collapses shape and slice into a single planning pass, writing all the planning artifacts at once before handing off to <code>/wf implement</code>:</p>
<pre><code>/wf intake fix "rename FooBar to FooBaz"
/wf plan &lt;slug&gt; default-slice</code></pre>
<p>Manual stage-skipping is gone — the compressed modes (<code>fix</code>, <code>hotfix</code>, <code>refactor</code>, <code>update-deps</code>) are the supported way to shorten the lifecycle. If you are unsure which fits, see the entry-point guide linked below.</p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../how-to/start-workflow.html">Choose an entry point for your change →</a></li>
  <li><a href="anti-patterns.html">See what goes wrong when these patterns are misapplied →</a></li>
  <li><a href="escape-hatches.html">Learn how to bypass a stage safely when you need to →</a></li>
</ul>
</div>

""",
    ("tips/escape-hatches.html", "Escape hatches"),
    ("tips/anti-patterns.html", "Anti-patterns"),
))


PAGES.append((
    "tips/anti-patterns.html",
    "Anti-patterns",
    "tips",
    '<a href="../index.html">Home</a> &rsaquo; Tips &rsaquo; Anti-patterns',
    """

<p class="lede">Common ways the workflow breaks down, and how to avoid them. Each entry follows the same shape: what you see, why it happens, and what to do instead.</p>

<h2>Treating BLOCKER findings as suggestions</h2>

<p><strong>Symptom.</strong> The review <a href="../reference/glossary.html#artifact">artifact</a> (a workflow note in <code>.ai/workflows/&lt;slug&gt;/</code>) carries BLOCKER-severity findings, but <code>/wf handoff</code> was run anyway with no implement-reviews pass in between. The findings stay in the file; nothing else changes.</p>

<p><strong>Why it happens.</strong> BLOCKER is a label in a text file. Nothing prevents you from scrolling past it. The temptation is to treat it as a strong suggestion rather than a stop sign, especially under deadline pressure.</p>

<p><strong>Fix.</strong> Return to <code>/wf implement</code> and address the findings. If you genuinely disagree that the finding is a blocker, write that reasoning explicitly in the review artifact's <code>## Fix Status</code> section. Once the disagreement is on the record, handoff can proceed — and the artifact preserves your reasoning for future readers.</p>

<h2>Letting plan and implement drift silently</h2>

<p><strong>Symptom.</strong> The plan artifact says "use the existing route-registration helper." The implement artifact wrote a new helper instead. The <code>## Plan deviations</code> section in the implement artifact is empty.</p>

<p><strong>Why it happens.</strong> The plan was written before the code was touched. Decisions change during implementation. If there is no habit of recording those changes, the plan silently lies.</p>

<p><strong>Fix.</strong> Every time implementation departs from plan, write the departure into the implement artifact's <code>## Plan deviations</code> section — even one sentence. A future reader (or a future you) will need to know the plan was overridden and why.</p>

<h2>Skipping retro on "small" work</h2>

<p><strong>Symptom.</strong> <code>10-retro.md</code> is absent from most completed workflows. The justification is always "it was just a small change."</p>

<p><strong>Why it happens.</strong> Retro looks optional when a change is small. The compounding effect only becomes visible when you realise you have shipped 50 small changes and captured zero lessons from any of them.</p>

<p><strong>Fix.</strong> Treat retro as mandatory for any workflow that includes a ship run, including workflows started with an intake mode like <code>/wf intake fix</code>. Retro is five minutes.</p>

<h2>Hand-editing the readiness check result</h2>

<p><strong>Symptom.</strong> The handoff artifact reads <code>readiness-verdict: ready</code> while the same file also shows <code>live-checks-failing: [build, test]</code>. The <a href="../reference/glossary.html#readiness-check">readiness check</a> (the computed gate that <code>/wf ship</code> reads before proceeding) was bypassed by directly editing the field.</p>

<p><strong>Why it happens.</strong> The verdict field is plain text. Editing it is easier than fixing the underlying problem. The artifact stops complaining; the problem is still there.</p>

<p><strong>Fix.</strong> Fix the contributing fields — the failing checks — not the verdict. If CI is genuinely passing and the field is stale, re-run <code>/wf handoff</code> to recompute rather than editing by hand.</p>

<h2>Authoring a ship plan that mirrors the README</h2>

<p><strong>Symptom.</strong> The ship plan's <code>recovery-playbooks</code> section is empty. <code>secrets-staleness-threshold-days</code> and <code>db-migrations-reversible</code> are absent or at default. The plan is essentially <code>npm publish</code>.</p>

<p><strong>Why it happens.</strong> The happy path is easy to describe. The plan's value is in the unhappy path — recovery steps, secret rotation cadence, rollback procedures — and those only become obvious after something goes wrong.</p>

<p><strong>Fix.</strong> Treat the ship plan as a living document. Amend it every time a release teaches you something: a 401 that cost an hour, a propagation delay you didn't expect, a rollback that worked or didn't. The plan should encode what is not obvious from reading the repo.</p>

<h2>Using a quick command to avoid the full pipeline</h2>

<p><strong>Symptom.</strong> <code>01-fix.md</code> describes a feature touching five files, a migration, and a new API surface. The intake mode was chosen because the deadline was close, not because the change was small.</p>

<p><strong>Why it happens.</strong> Intake modes are shorter. Under pressure, "shorter" looks like "faster." For a change that genuinely fits an intake mode — a single-file fix, a copy edit, a config tweak — it is faster. For a larger change, intake modes write a single-pass, lightweight plan (shape, slice, and plan in one compressed session), which increases the chance of implementation surprises for genuinely large or high-risk work.</p>

<p><strong>Fix.</strong> Run <code>/wf close &lt;slug&gt; superseded</code> to close the old workflow, then restart with <code>/wf intake</code>. The intake modes are for changes that fit the compressed shape, not for changes you're hoping will fit it.</p>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="escape-hatches.html">See legitimate ways to skip or override stages →</a></li>
  <li><a href="../explanation/orchestrator-discipline.html">Understand why these patterns matter →</a></li>
  <li><a href="faq.html">Read common troubleshooting questions →</a></li>
</ul>
</div>

""",
    ("tips/tricks.html", "Tricks"),
    ("tips/faq.html", "FAQ"),
))


PAGES.append((
    "tips/faq.html",
    "FAQ",
    "tips",
    '<a href="../index.html">Home</a> &rsaquo; Tips &rsaquo; FAQ',
    """

<p class="lede">Real questions from people who just installed the plugin — answered without assuming you already know how it works.</p>

<dl>

<dt><strong>Why does <code>/wf ship</code> refuse to start?</strong></dt>
<dd>
  <p>Two things can block it.</p>
  <ol>
    <li><strong>No ship plan yet.</strong> Run <code>/wf ship-plan init</code> to create <code>.ai/ship-plan.md</code>. Ship reads this file for release instructions before it does anything else.</li>
    <li><strong>Readiness check failed.</strong> The <a href="../reference/glossary.html">readiness check</a> — a pass/fail verdict written into <code>08-handoff.md</code> — must say <code>ready</code>. If it doesn't, run <code>/wf handoff</code> to refresh it, then look at the contributing field to see what to fix.</li>
  </ol>
</dd>

<dt><strong>Do I really need all 10 stages for a one-line fix?</strong></dt>
<dd>
  <p>No. For small, self-contained changes use <code>/wf intake fix</code> instead of <code>/wf</code>. That intake mode is a compressed standard lifecycle — it runs every stage single-pass rather than skipping any, so review and the quality gates still run. You get a complete but lightweight artifact trail without the full ceremony of a feature workflow. Save the full flow for changes that genuinely need a written spec, coordinated review, or a staged rollout.</p>
</dd>

<dt><strong>What happens if I lose the artifact files?</strong></dt>
<dd>
  <p>The plugin stops working for that workflow. Every command reads and writes to files under <code>.ai/workflows/&lt;slug&gt;/</code> — these are the <a href="../reference/glossary.html">artifacts</a> (the workflow notes that carry state from stage to stage). If those files are deleted or lost, there is no hidden backup. Commit the <code>.ai/workflows/</code> directory to version control. The plugin does not enforce this, but the value of the audit trail depends entirely on those files persisting.</p>
</dd>

<dt><strong>Can I use this on a repo that is already mid-development?</strong></dt>
<dd>
  <p>Yes. The plugin does not require a clean slate. Run <code>/wf intake &lt;description&gt;</code> to start a new workflow for whatever you are working on now. The <a href="../reference/glossary.html">slug</a> — the stable identifier for a workflow, stored as a directory name under <code>.ai/workflows/</code> — is scoped to a single piece of work, not to the whole repo. You can have as many slugs as you have concurrent tracks of work. Existing branches, commits, and files are unaffected.</p>
</dd>

<dt><strong>Why does the plugin write so many files?</strong></dt>
<dd>
  <p>Each file is one <a href="../reference/glossary.html">stage</a> in the workflow — a named step with its own artifact. The files exist so that you (and Claude Code) can re-enter any stage without replaying everything from the beginning. They also form a plain-markdown audit trail you can read, diff, and commit like any other source file. If the volume feels like noise, consider <code>/wf intake &lt;mode&gt;</code> for smaller work items — it produces far fewer files.</p>
</dd>

<dt><strong>Why is my slug different from my title?</strong></dt>
<dd>The <a href="../reference/glossary.html">slug</a> is a kebab-case, lowercase, stable identifier derived from the title at intake. Titles can have punctuation, capitals, and spaces; slugs cannot. Once set, the slug never changes — it is the directory name under <code>.ai/workflows/</code>. If you need a different slug, close the workflow and start a new one.</dd>

<dt><strong>Why does the shape stage ask so many questions for something simple?</strong></dt>
<dd>That is usually a signal to switch commands. Shape runs a deep interview — a 20-question baseline across five rounds, extending only while blocking ambiguity remains — designed for changes that need a written spec. If the questions feel out of proportion to the change, run <code>/wf intake fix</code> instead. You can always run full shape later if the scope grows.</dd>

<dt><strong>My PR has a bot comment I don't want to triage. Can I ignore it?</strong></dt>
<dd>Depends on the comment type. Walkthrough summaries (informational) are classified as low-priority and never block the readiness check. Suggestion comments from bots may be classified as needing a response. If the triage loop cycles five times (the maximum) without resolving, the readiness check flips to <code>awaiting-input</code> and stops — at that point you need to either act on the bot's suggestions or dismiss them explicitly so the loop can complete.</dd>

<dt><strong>How do I roll back a release?</strong></dt>
<dd>Run <code>/wf ship &lt;slug&gt; rollback</code> (optionally naming a specific run id). It reads the completed run's recorded steps, authors a reversal runbook with each step marked reversible or irreversible — irreversible ones (sent announcements, published packages, forward-only migrations) surface as mitigations rather than being silently skipped — waits for your explicit Go, executes, verifies the prior state with the ship plan's rollback checks, and records everything in <code>09-rollback-&lt;run-id&gt;.md</code> while stamping the original run <code>rolled-back: true</code>. Give the ship plan's rollout block a <code>rollback-cmd</code> and <code>rollback-verify-cmd</code> so the runbook can redeploy and verify automatically; without them it degrades to a git-level reversal (revert commit + release supersede) and says so.</dd>

<dt><strong>Do I need to run <code>npm install</code> before using the plugin?</strong></dt>
<dd>No. Since v9.45.0 the plugin ships with committed <code>dist/</code> bundles — all dependencies are bundled in. A fresh install works with no runtime <code>npm install</code>. You only need <code>npm install</code> and <code>npm run build</code> if you are editing the plugin source itself (hooks, lib, renderers, or components). See <a href="../explanation/build-and-dist.html">Build &amp; dist model</a> for details.</dd>

<dt><strong>How do I correct or extend a workflow, and how is that different from <code>implement reviews</code>?</strong></dt>
<dd>There is no more <code>amend</code>. To correct a spec or add new work items (called <a href="../reference/glossary.html">slices</a>), add a new slice via <code>/wf intake &lt;slug&gt; &lt;new scope&gt;</code> — this replaces both the former <code>amend</code> and <code>extend</code>, keeping provenance clean by construction. <code>/wf implement &lt;slug&gt; reviews</code> fixes implementation bugs found in code review (the slug argument is required). Ship-plan corrections use <code>/wf ship-plan edit</code>. <a href="../how-to/amend-or-extend.html">Full decision rule →</a></dd>

<dt><strong>Does the plugin work without git?</strong></dt>
<dd>Most of it, yes — but there is a sanctioned "continue without git" path with limits. Since v9.110 every <code>/wf</code> dispatch (not just handoff/ship) first confirms the project is a git repo via <code>git rev-parse --show-toplevel</code>; in a non-git directory it fires a mandatory prompt offering to run <code>git init</code>. If you decline, artifacts still write to <code>.ai/workflows/</code> as plain markdown, but the hub registers repos by git identity — so a non-git repo returns <code>skipped-not-git</code> (a silent no-op, v9.112) on every registration: no dashboard or view ever renders, and slug branches cannot exist until you run <code>git init</code> and re-run. Handoff and ship also have features that require a git branch (CI polling, PR triage). Set <code>branch-strategy: none</code> when running <code>/wf intake</code> — this value is recorded in the workflow index and causes handoff and ship to skip branch-dependent steps (CI polling, PR triage). The artifact trail still works and is still useful without version control.</dd>

</dl>

<div class="related">
<h3>Where next</h3>
<ul>
  <li><a href="../tutorials/first-workflow.html">Walk through a complete workflow from scratch →</a></li>
  <li><a href="../tips/anti-patterns.html">See what to avoid when using the plugin →</a></li>
  <li><a href="../how-to/amend-or-extend.html">Decide whether to amend, extend, or implement reviews →</a></li>
</ul>
</div>

""",
    ("tips/anti-patterns.html", "Anti-patterns"),
    None,
))


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
# SIDEBAR is the single source of truth for BOTH nav structure and reading
# order. Parse it once: page order (for pagers) and clean labels (for pager
# link text). Pages not generated here (index + the hand-authored tutorials and
# serve/types reference pages) still appear in the order so adjacency is correct.
def _nav_order():
    return re.findall(r'data-href="([^"]+\.html)"', SIDEBAR)


def _nav_labels():
    labels = {}
    for path, text in re.findall(r'data-href="([^"]+\.html)">([^<]+)</a>', SIDEBAR):
        clean = re.sub(r"^[^\w/]+", "", text).strip()          # drop leading "↳ "
        clean = re.sub(r"\s*\([^)]*\)\s*$", "", clean)          # drop "(overview)" / "(10 stages)"
        labels[path] = clean
    return labels


def _render_nav_file():
    """nav.html — the standalone canonical sidebar (base=""). GENERATED; do not hand-edit."""
    note = (
        "<!-- GENERATED by _build_pages.py from the SIDEBAR constant — do NOT hand-edit.\n"
        "     Edit SIDEBAR in _build_pages.py and re-run `python3 _build_pages.py`.\n"
        "     This is the canonical sidebar; every page inlines a copy of it. -->\n"
    )
    (SITE_ROOT / "nav.html").write_text(
        note + SIDEBAR.format(base="", version=PLUGIN_VERSION) + "\n",
        encoding="utf-8", newline="\n",
    )
    print("wrote nav.html")


# Hand-authored pages: NOT generated from PAGES, but they still inline the
# sidebar. Keep their bespoke <main> bodies; replace only the <aside> so the
# whole site is single-sourced from SIDEBAR (version brand + nav structure).
_EXTERNAL_PAGES = [
    "index.html",
    "tutorials/installation.html",
    "tutorials/first-workflow.html",
    "reference/serve.html",
    "reference/types.html",
]


def _patch_external_sidebars():
    """Replace the inlined <aside id="sidebar">…</aside> in every hand-authored page
    with the canonical sidebar rendered at that page's depth."""
    for rel in _EXTERNAL_PAGES:
        f = SITE_ROOT / rel
        html = f.read_text(encoding="utf-8")
        base = "../" * rel.count("/")
        rendered = SIDEBAR.format(base=base, version=PLUGIN_VERSION)
        new, n = re.subn(r'<aside id="sidebar">.*?</aside>', lambda _m: rendered, html,
                         count=1, flags=re.S)
        if n != 1:
            raise SystemExit(f"{rel}: sidebar patch matched {n} blocks (expected exactly 1)")
        f.write_text(new, encoding="utf-8", newline="\n")
        print(f"patched sidebar in {rel}")


def main():
    print(f"Generating {len(PAGES)} pages under {SITE_ROOT}")
    nav = _nav_order()
    pos = {p: i for i, p in enumerate(nav)}
    labels = _nav_labels()

    def pager_for(path):
        i = pos.get(path)
        if i is None:                       # page not in nav → keep no pager
            return None, None
        prev = nav[i - 1] if i > 0 else None
        nxt = nav[i + 1] if i < len(nav) - 1 else None
        prev_t = (prev, labels.get(prev, prev)) if prev else None
        nxt_t = (nxt, labels.get(nxt, nxt)) if nxt else None
        return prev_t, nxt_t

    for entry in PAGES:
        path, title, quadrant, breadcrumb, body = entry[0], entry[1], entry[2], entry[3], entry[4]
        prev, nxt = pager_for(path)         # pagers derived from nav order, not stored tuples
        render_page(path, title, quadrant, breadcrumb, body, prev, nxt)

    _render_nav_file()
    _patch_external_sidebars()
    print("done.")


if __name__ == "__main__":
    main()
