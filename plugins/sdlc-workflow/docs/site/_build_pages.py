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
from pathlib import Path
from textwrap import dedent

SITE_ROOT = Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# Sidebar — canonical nav, used by every page.
# `{base}` is replaced with "" or "../" depending on the page depth.
# `{active}` is replaced with the active-link href so we can mark it with class="active".
# ---------------------------------------------------------------------------
SIDEBAR = r"""<aside id="sidebar">
<a class="brand" href="{base}index.html">sdlc-workflow<small>plugin docs · v9.12.0</small></a>
<nav aria-label="Site navigation">
  <h4>Start here</h4>
  <ul>
    <li><a href="{base}index.html" data-href="index.html">Home</a></li>
    <li><a href="{base}tutorials/installation.html" data-href="tutorials/installation.html">Install</a></li>
    <li><a href="{base}tutorials/first-workflow.html" data-href="tutorials/first-workflow.html">First workflow</a></li>
    <li><a href="{base}tutorials/quick-fix-workflow.html" data-href="tutorials/quick-fix-workflow.html">Quick-fix walkthrough</a></li>
  </ul>
  <h4>How to&hellip;</h4>
  <ul>
    <li><a href="{base}how-to/start-workflow.html" data-href="how-to/start-workflow.html">Pick an entry point</a></li>
    <li><a href="{base}how-to/navigate-workflows.html" data-href="how-to/navigate-workflows.html">Navigate workflows</a></li>
    <li><a href="{base}how-to/amend-or-extend.html" data-href="how-to/amend-or-extend.html">Amend or extend</a></li>
    <li><a href="{base}how-to/use-augmentations.html" data-href="how-to/use-augmentations.html">Use augmentations</a></li>
    <li><a href="{base}how-to/use-design.html" data-href="how-to/use-design.html">Use the design pipeline</a></li>
    <li><a href="{base}how-to/triage-pr-comments.html" data-href="how-to/triage-pr-comments.html">Triage PR comments</a></li>
    <li><a href="{base}how-to/author-ship-plan.html" data-href="how-to/author-ship-plan.html">Author a ship plan</a></li>
    <li><a href="{base}how-to/run-a-release.html" data-href="how-to/run-a-release.html">Run a release</a></li>
    <li><a href="{base}how-to/resume-paused-work.html" data-href="how-to/resume-paused-work.html">Resume paused work</a></li>
    <li><a href="{base}how-to/close-workflows.html" data-href="how-to/close-workflows.html">Close workflows</a></li>
  </ul>
  <h4>Reference</h4>
  <ul>
    <li><a href="{base}reference/pipeline.html" data-href="reference/pipeline.html">Pipeline (10 stages)</a></li>
    <li><a href="{base}reference/commands.html" data-href="reference/commands.html">Commands (overview)</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf.html" data-href="reference/wf.html">↳ /wf router</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-quick.html" data-href="reference/wf-quick.html">↳ /wf-quick router</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-meta.html" data-href="reference/wf-meta.html">↳ /wf-meta router</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-design.html" data-href="reference/wf-design.html">↳ /wf-design router</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/wf-docs.html" data-href="reference/wf-docs.html">↳ /wf-docs router</a></li>
    <li style="padding-left: 0.7em;"><a href="{base}reference/review.html" data-href="reference/review.html">↳ /review router</a></li>
    <li><a href="{base}reference/skills.html" data-href="reference/skills.html">Skills</a></li>
    <li><a href="{base}reference/artifacts.html" data-href="reference/artifacts.html">Artifacts</a></li>
    <li><a href="{base}reference/00-index-schema.html" data-href="reference/00-index-schema.html">00-index schema</a></li>
    <li><a href="{base}reference/ship-plan-schema.html" data-href="reference/ship-plan-schema.html">Ship-plan schema</a></li>
    <li><a href="{base}reference/08-handoff-schema.html" data-href="reference/08-handoff-schema.html">Handoff schema</a></li>
    <li><a href="{base}reference/09-ship-run-schema.html" data-href="reference/09-ship-run-schema.html">Ship-run schema</a></li>
    <li><a href="{base}reference/hooks.html" data-href="reference/hooks.html">Hooks</a></li>
    <li><a href="{base}reference/glossary.html" data-href="reference/glossary.html">Glossary</a></li>
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
  </ul>
  <h4>Tips</h4>
  <ul>
    <li><a href="{base}tips/escape-hatches.html" data-href="tips/escape-hatches.html">Escape hatches</a></li>
    <li><a href="{base}tips/tricks.html" data-href="tips/tricks.html">Tricks</a></li>
    <li><a href="{base}tips/anti-patterns.html" data-href="tips/anti-patterns.html">Anti-patterns</a></li>
    <li><a href="{base}tips/faq.html" data-href="tips/faq.html">FAQ</a></li>
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
    sidebar = SIDEBAR.format(base=base)
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
    out.write_text(page, encoding="utf-8")
    print(f"wrote {path}")


# ---------------------------------------------------------------------------
# Page definitions — each entry: (path, title, quadrant, breadcrumb, body, prev, next)
# ---------------------------------------------------------------------------
PAGES = []


# === TUTORIALS ===
PAGES.append((
    "tutorials/quick-fix-workflow.html",
    "Quick-fix walkthrough",
    "tutorial",
    '<a href="../index.html">Home</a> &rsaquo; Tutorials &rsaquo; Quick-fix',
    """
<p style="font-size:1.05rem;color:var(--fg-muted);max-width:60ch;">
For a one-character typo or a one-line patch, the full 10-stage pipeline is overkill. <code>/wf-quick</code> gives you a compressed flow that still leaves an artifact trail — just three files instead of twelve.
</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>The plugin is installed (<a href="installation.html">install tutorial</a>).</td></tr>
<tr><th>You will produce</th><td>Three artifacts under <code>.ai/workflows/&lt;slug&gt;/</code>: <code>00-index.md</code>, <code>01-quick.md</code>, and either <code>05-implement.md</code> or a hotfix-prefixed file.</td></tr>
<tr><th>You will not produce</th><td>A shape, slice, plan, verify, or review artifact. The compressed flow trades that depth for speed.</td></tr>
</table>
</div>

<h2>The scenario</h2>

<p>You spot a typo in a user-facing error message:</p>

<pre><code>// before
throw new Error("Recieved invalid payload");
// after
throw new Error("Received invalid payload");</code></pre>

<p>This is a textbook quick fix: low risk, easy to verify, one file, one line.</p>

<h2>Step 1 — Start a quick-fix workflow</h2>

<pre><code>/wf-quick fix "typo in invalid-payload error message"</code></pre>

<p>Claude asks two or three questions — what file, what's the fix, do you need a test added — and writes:</p>

<ul>
  <li><code>00-index.md</code> with <code>workflow-type: quick</code></li>
  <li><code>01-quick.md</code> — the compressed shape+slice+plan, all in one file</li>
</ul>

<p>The compressed shape skips the deep interview that <code>/wf shape</code> runs. Acceptance criteria for a typo fix are obvious — Claude inlines them rather than re-derive them.</p>

<h2>Step 2 — Implement</h2>

<pre><code>/wf implement &lt;slug&gt;</code></pre>

<p>Implement reads <code>01-quick.md</code> directly (in compressed mode, no separate plan file is needed). It makes the edit, runs the test command, and commits. The workflow-type field on <code>00-index.md</code> tells implement to write <code>05-implement.md</code> as a single file, not per-slice.</p>

<h2>Step 3 — Handoff (or skip straight to commit)</h2>

<p>For a one-line fix on a shared branch, you might not want a separate PR. Set branch-strategy to <code>none</code> during step 1, and the workflow stops at implement — the commit itself is the deliverable.</p>

<p>For a fix on a dedicated feature branch:</p>

<pre><code>/wf handoff &lt;slug&gt;</code></pre>

<p>Hands off to a PR. The PR-readiness block (commitlint, surface drift, doc-mirror, triage, rebase, live check) still runs — quick-fix mode doesn't bypass quality gates, it just reduces the artifact count up front.</p>

<h2>When NOT to use <code>/wf-quick fix</code></h2>

<ul>
  <li><strong>Behaviour change that needs reviewer thought.</strong> Use <code>/wf intake</code> instead — get a real shape.</li>
  <li><strong>Anything that touches more than one file or one slice.</strong> The compressed shape can't carry that complexity without breaking the artifact discipline.</li>
  <li><strong>Anything you want a retro on.</strong> Quick-fix workflows don't get a retro by default.</li>
</ul>

<h2>Related compressed flows</h2>

<p>The <code>/wf-quick</code> router has nine sub-commands beyond <code>fix</code>:</p>

<table>
<thead><tr><th>Command</th><th>For</th><th>Pipeline shape</th></tr></thead>
<tbody>
<tr><td><code>/wf-quick hotfix</code></td><td>Production incident — bypass review for speed</td><td>6-stage, scope-locked</td></tr>
<tr><td><code>/wf-quick rca</code></td><td>Root-cause analysis of a bug or incident</td><td>Single artifact, then forwards to <code>/wf shape</code></td></tr>
<tr><td><code>/wf-quick investigate</code></td><td>"What are 2–3 distinct engineering approaches to this problem?" — solution-options sketcher with tradeoffs; no winner picked</td><td>Single artifact, user picks an option then routes to <code>/wf intake</code> or <code>/wf-quick fix</code></td></tr>
<tr><td><code>/wf-quick discover</code></td><td>"Is my theory about how this code works correct?" — hypothesis-test with FOR/AGAINST/counter-hypothesis evidence</td><td>Single artifact, verdict: holds / partial / fails / inconclusive</td></tr>
<tr><td><code>/wf-quick update-deps</code></td><td>Audit + tiered dependency updates</td><td>4-stage under <code>.ai/dep-updates/&lt;run-id&gt;/</code></td></tr>
<tr><td><code>/wf-quick refactor</code></td><td>Behaviour-preserving refactor with test baseline</td><td>Stage-locked: capture baseline, refactor, re-verify</td></tr>
<tr><td><code>/wf-quick ideate</code></td><td>Brainstorm + rank improvement candidates</td><td>Single artifact under <code>ideation/</code></td></tr>
</tbody>
</table>

<p>See <a href="../how-to/start-workflow.html">Pick an entry point</a> for a decision tree.</p>
""",
    ("tutorials/first-workflow.html", "First workflow"),
    ("how-to/start-workflow.html", "Pick an entry point"),
))


# === HOW-TO ===
PAGES.append((
    "how-to/start-workflow.html",
    "Pick the right entry point",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Pick an entry point',
    """
<p>
You have a change to make. The plugin offers ~15 different starting commands. This page is the decision tree.
</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>Plugin installed.</td></tr>
<tr><th>Goal</th><td>Pick the right <code>/wf</code> or <code>/wf-quick</code> entry that matches the size and shape of your change.</td></tr>
</table>
</div>

<h2>Decision tree</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start{"What kind of change?"}
  start -- "Production incident, must ship in minutes" --> hotfix["/wf-quick hotfix"]
  start -- "Single-file typo, one-line patch" --> fix["/wf-quick fix"]
  start -- "Dependency updates, security or major version" --> deps["/wf-quick update-deps"]
  start -- "Behaviour-preserving refactor" --> refactor["/wf-quick refactor"]
  start -- "Bug report, root cause unknown" --> rca["/wf-quick rca"]
  start -- "Need 2–3 distinct engineering approaches sketched before committing" --> investigate["/wf-quick investigate"]
  start -- "Have a theory about how this code works and want it adjudicated" --> discover["/wf-quick discover"]
  start -- "A real feature or substantive change" --> wf["/wf intake"]

  classDef quick fill:#fef3c7,stroke:#b45309,color:#1f1f1d
  classDef full fill:#dbeafe,stroke:#1d4ed8,color:#1f1f1d
  class hotfix,fix,deps,refactor,rca,investigate,discover quick
  class wf full
</pre>
</div>
<p class="caption">The compressed flows (<code>/wf-quick *</code>) trade artifact depth for speed. The full <code>/wf</code> entry runs the 10-stage pipeline — slower, but you get every step's artifact and adaptive routing.</p>

<h2>By scenario</h2>

<dl>
<dt><strong>"I need to add a new feature."</strong></dt>
<dd><code>/wf intake "&lt;feature description&gt;"</code> — the full lifecycle.</dd>

<dt><strong>"There's a typo / 1-line patch / docs edit."</strong></dt>
<dd><code>/wf-quick fix "&lt;description&gt;"</code> — three artifacts, ~10 minutes.</dd>

<dt><strong>"Production is on fire."</strong></dt>
<dd><code>/wf-quick hotfix "&lt;symptom&gt;"</code> — scope-locked, skips review, but still leaves an artifact trail.</dd>

<dt><strong>"I have a problem in the code and want 2–3 distinct engineering approaches sketched before I pick one."</strong></dt>
<dd><code>/wf-quick investigate "&lt;problem&gt;"</code>. Architecture cartographer + option generator + tradeoff characterizer sub-agents. Produces an A/B/C option set with effort/blast-radius/reversibility/risk for each; <em>no winner is picked</em>. After you pick, route to <code>/wf-quick fix</code> (small) or <code>/wf intake</code> (medium+).</dd>

<dt><strong>"There's a bug. I don't know where it is yet."</strong></dt>
<dd><code>/wf-quick rca "&lt;symptom + repro&gt;"</code>. Root-cause analysis with parallel sub-agents.</dd>

<dt><strong>"The deps are out of date. Some have CVEs."</strong></dt>
<dd><code>/wf-quick update-deps</code>. Audits, tiers (P0 security → P1 major → P2 safe → hold), and applies in priority order.</dd>

<dt><strong>"I want to refactor this without changing behaviour."</strong></dt>
<dd><code>/wf-quick refactor "&lt;area&gt;"</code>. Captures a test baseline first; refactors with incremental green steps; re-verifies parity.</dd>

<dt><strong>"I have a theory about how this code works and want it adjudicated against the codebase."</strong></dt>
<dd><code>/wf-quick discover "&lt;hypothesis&gt;"</code>. FOR / AGAINST / counter-hypothesis sub-agents adjudicate the claim. Verdict is one of <code>holds</code> / <code>partial</code> / <code>fails</code> / <code>inconclusive</code>, with cited evidence. Different from <code>/wf-docs how</code> — that explains how code works; <code>discover</code> tests whether your theory is correct.</dd>

<dt><strong>"I want to read about an unfamiliar subsystem."</strong></dt>
<dd><code>/wf-meta how "&lt;question&gt;"</code> — five-mode question answering. Doesn't write a stage artifact unless you opt in.</dd>
</dl>

<h2>Choosing between <code>/wf</code> and <code>/wf-quick</code></h2>

<p>The hard question. Use this checklist:</p>

<table>
<thead><tr><th>Question</th><th>If yes</th><th>If no</th></tr></thead>
<tbody>
<tr><td>Could someone reasonably ask for a code review on this?</td><td>/wf</td><td>/wf-quick</td></tr>
<tr><td>Does it change observable behaviour that a user might notice?</td><td>/wf</td><td>/wf-quick fix</td></tr>
<tr><td>Are you confident the acceptance criteria are obvious from the description?</td><td>/wf-quick</td><td>/wf (shape will disambiguate)</td></tr>
<tr><td>Will the change touch more than 2 files?</td><td>/wf</td><td>Either</td></tr>
<tr><td>Do you want a retro at the end?</td><td>/wf</td><td>/wf-quick</td></tr>
</tbody>
</table>

<p>Two or more "/wf" answers → run <code>/wf intake</code>. Otherwise the compressed flow is fine.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../tutorials/first-workflow.html">First workflow tutorial</a> — what <code>/wf</code> actually does, end to end.</li>
  <li><a href="../tutorials/quick-fix-workflow.html">Quick-fix walkthrough</a> — what <code>/wf-quick fix</code> looks like in practice.</li>
  <li><a href="../reference/commands.html">Commands reference</a> — every command's arguments and exact behaviour.</li>
  <li><a href="../tips/escape-hatches.html">Escape hatches</a> — when even the compressed flow is too much.</li>
</ul>
</div>
""",
    None,
    ("how-to/navigate-workflows.html", "Navigate workflows"),
))


PAGES.append((
    "how-to/navigate-workflows.html",
    "Navigate existing workflows",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Navigate workflows',
    """
<p>You opened the repo and you can't remember what you were doing. Or you have three workflows in flight and you need to pick one up. This page is the answer.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>One or more <code>.ai/workflows/&lt;slug&gt;/</code> directories exist.</td></tr>
<tr><th>Goal</th><td>Know which workflows are active, where you left off, and how to resume.</td></tr>
</table>
</div>

<h2>See everything at a glance</h2>

<pre><code>/wf-meta status</code></pre>

<p>Lists every active workflow, the current stage, the recommended next command, and any open questions. Use this as your daily entry point.</p>

<h2>Get details on one workflow</h2>

<pre><code>/wf-meta status &lt;slug&gt;</code></pre>

<p>Shows the full progress map (10 stages × not-started/in-progress/complete/skipped/blocked), the slice statuses, and recent activity.</p>

<h2>Pick up where you left off</h2>

<pre><code>/wf-meta resume &lt;slug&gt;</code></pre>

<p>Reads the workflow's full artifact trail, identifies the next unfinished step, and proposes a concrete invocation. Use this when you've context-switched away for hours, days, or weeks.</p>

<h2>Ask what's next</h2>

<pre><code>/wf-meta next &lt;slug&gt;</code></pre>

<p>Like resume, but lighter — answers "what should I run next" without re-reading the full trail. Good when you know the workflow well and just need the next command.</p>

<h2>Reconcile drift with disk</h2>

<pre><code>/wf-meta sync &lt;slug&gt;</code></pre>

<p>Re-reads every artifact on disk and repairs the <code>00-index.md</code> control file if it disagrees with reality. Use after manual edits, after pulling a branch that landed new artifacts, or when something feels off.</p>

<h2>Cheat sheet</h2>

<table>
<thead><tr><th>What you want</th><th>Command</th></tr></thead>
<tbody>
<tr><td>"What am I working on?"</td><td><code>/wf-meta status</code></td></tr>
<tr><td>"Where did I leave off in X?"</td><td><code>/wf-meta resume X</code></td></tr>
<tr><td>"What's the next command for X?"</td><td><code>/wf-meta next X</code></td></tr>
<tr><td>"Index file looks weird — repair it."</td><td><code>/wf-meta sync X</code></td></tr>
<tr><td>"Explain a stage's artifact in plain English."</td><td><code>/wf-meta how X &lt;stage&gt;</code></td></tr>
<tr><td>"Generate a Diátaxis announcement from a shipped workflow."</td><td><code>/wf-meta announce X</code></td></tr>
</tbody>
</table>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../reference/commands.html">Commands reference</a> — every <code>/wf-meta</code> sub-command.</li>
  <li><a href="../reference/00-index-schema.html">00-index schema</a> — the control file fields.</li>
  <li><a href="resume-paused-work.html">Resume paused work</a> — what happens when a ship run is paused.</li>
</ul>
</div>
""",
    ("how-to/start-workflow.html", "Pick an entry point"),
    ("how-to/amend-or-extend.html", "Amend or extend"),
))


PAGES.append((
    "how-to/amend-or-extend.html",
    "Amend or extend a workflow",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Amend or extend',
    """
<p>Review or retro revealed something. Three commands handle the three different things "something" can mean:</p>

<div class="summary">
<table>
<tr><th>If the spec was wrong</th><td><code>/wf-meta amend</code> — correct the definition without overwriting completed work.</td></tr>
<tr><th>If new scope appeared</th><td><code>/wf-meta extend</code> — add new slices to the existing workflow.</td></tr>
<tr><th>If a bug exists</th><td><code>/wf implement &lt;slug&gt; &lt;slice&gt; reviews</code> — fix the implementation. Don't reach for amend.</td></tr>
</table>
</div>

<h2>Amend — the spec was wrong</h2>

<p>Use when review or retro shows that the acceptance criteria, scope, or approach was incorrect. Amend writes versioned amendment files (<code>02-shape-amend-1.md</code>, <code>03-slice-&lt;slug&gt;-amend-1.md</code>); it never overwrites completed artifacts.</p>

<pre><code>/wf-meta amend &lt;slug&gt; from-review    # seed from 07-review-&lt;slice&gt;.md findings
/wf-meta amend &lt;slug&gt; from-retro     # seed from 10-retro.md
/wf-meta amend &lt;slug&gt;                # describe the correction manually
/wf-meta amend ship-plan             # edit one block (A-G) of .ai/ship-plan.md</code></pre>

<p>After amend writes, you usually run <code>/wf plan &lt;slug&gt; &lt;slice&gt;</code> to update the plan, then <code>/wf implement &lt;slug&gt; &lt;slice&gt;</code>.</p>

<h2>Extend — new scope appeared</h2>

<p>Use when review or retro reveals scope that fits the same workflow but doesn't exist as a slice yet. Extend adds slices; it doesn't change existing ones.</p>

<pre><code>/wf-meta extend &lt;slug&gt; from-review
/wf-meta extend &lt;slug&gt; from-retro
/wf-meta extend &lt;slug&gt;</code></pre>

<h2>Implement (reviews mode) — bug exists</h2>

<p>Use when the spec is correct but the implementation is buggy.</p>

<pre><code>/wf implement &lt;slug&gt; &lt;slice&gt; reviews</code></pre>

<p>This is the most common path. Review finds a BLOCKER → implement-reviews fixes it → re-verify → re-handoff.</p>

<h2>Decision rule</h2>

<table>
<thead><tr><th>Finding shape</th><th>Use</th></tr></thead>
<tbody>
<tr><td>"Acceptance criterion is contradictory"</td><td>amend</td></tr>
<tr><td>"The approach assumed X but X doesn't exist"</td><td>amend</td></tr>
<tr><td>"This slice should have been two slices"</td><td>amend (split) + extend (new slice)</td></tr>
<tr><td>"This feature is missing a piece"</td><td>extend</td></tr>
<tr><td>"The code returns 500 when it should return 400"</td><td>implement reviews</td></tr>
<tr><td>"The test doesn't actually cover the edge case"</td><td>implement reviews</td></tr>
</tbody>
</table>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../reference/commands.html">Commands reference</a> — full <code>/wf-meta amend</code> argument matrix.</li>
  <li><a href="triage-pr-comments.html">Triage PR comments</a> — the new T5.1 loop sometimes routes findings to amend.</li>
</ul>
</div>
""",
    ("how-to/navigate-workflows.html", "Navigate workflows"),
    ("how-to/use-augmentations.html", "Use augmentations"),
))


PAGES.append((
    "how-to/use-augmentations.html",
    "Use augmentations",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Use augmentations',
    """
<p>Augmentations are <strong>opt-in</strong> perf and observability slots that propagate through the lifecycle. They register on <code>00-index.md</code> and produce type-specific deliverables that downstream stages consume.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>A workflow exists past <code>shape</code>.</td></tr>
<tr><th>When to add</th><td>Mid-workflow, when shape or plan reveals you need observability, an A/B test, a perf baseline, or a profiling pass.</td></tr>
<tr><th>Where they show up</th><td>04b/04c/05c stage files, plus reviewer-visible mentions in <code>08-handoff.md</code> and <code>09-ship-run-*.md</code>.</td></tr>
</table>
</div>

<h2>The four augmentations</h2>

<table>
<thead><tr><th>Command</th><th>Produces</th><th>When</th></tr></thead>
<tbody>
<tr><td><code>/wf instrument &lt;slug&gt; &lt;slice&gt;</code></td><td><code>04b-instrument-&lt;slice&gt;.md</code> — log/metric/trace design</td><td>Before implement, when the slice changes previously unobserved code paths.</td></tr>
<tr><td><code>/wf experiment &lt;slug&gt; &lt;slice&gt;</code></td><td><code>04c-experiment-&lt;slice&gt;.md</code> — cohort split, feature flag, rollback strategy</td><td>Before implement, when shipping a behaviour change that needs measured rollout.</td></tr>
<tr><td><code>/wf benchmark &lt;slug&gt; &lt;slice&gt;</code></td><td><code>05c-benchmark-&lt;slice&gt;.md</code> — perf baseline + compare-mode results</td><td>Before implement (baseline) and after implement (compare).</td></tr>
<tr><td><code>/wf profile &lt;area&gt;</code></td><td>A profiling report</td><td>Anytime — typically during plan or implement when investigating a hot path.</td></tr>
</tbody>
</table>

<h2>How registration works</h2>

<p>Running an augmentation appends it to the <code>augmentations:</code> array on <code>00-index.md</code>:</p>

<pre><code>augmentations:
  - { kind: instrument, slice: route, ref: 04b-instrument-route.md, registered-at: "2026-05-10T..." }
  - { kind: benchmark,  slice: route, ref: 05c-benchmark-route.md,  registered-at: "..." }</code></pre>

<p>Downstream stages read this array. <code>handoff</code> translates each entry into a reviewer-visible mention (e.g., "Added observability — 3 signals for previously unobserved code paths"). <code>ship</code> translates each into a changelog line.</p>

<h2>When to add what</h2>

<dl>
<dt><strong>Instrument</strong></dt>
<dd>The slice touches a code path that has no logs, metrics, or traces. Default: add an instrument stage and identify N signals worth recording.</dd>

<dt><strong>Experiment</strong></dt>
<dd>The slice changes user-visible behaviour, and you want a measured rollout (feature flag, cohort split, rollback signal) rather than a hard cutover.</dd>

<dt><strong>Benchmark</strong></dt>
<dd>The slice could affect performance — even if you don't expect it to. Adding a baseline is cheap insurance against regression.</dd>

<dt><strong>Profile</strong></dt>
<dd>You suspect a hot path but don't yet know which. Profile is investigative and freestanding — it doesn't have to be tied to a workflow slice.</dd>
</dl>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../explanation/augmentations-model.html">Augmentations model</a> — how registration propagates.</li>
  <li><a href="../reference/commands.html">Commands reference</a> — full argument lists.</li>
  <li><a href="../reference/00-index-schema.html">00-index schema</a> — the <code>augmentations:</code> array shape.</li>
</ul>
</div>
""",
    ("how-to/amend-or-extend.html", "Amend or extend"),
    ("how-to/triage-pr-comments.html", "Triage PR comments"),
))


PAGES.append((
    "how-to/triage-pr-comments.html",
    "Triage PR comments",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Triage PR comments',
    """
<p>You opened a PR via <code>/wf handoff</code>. CodeRabbit, Greptile, Gemini, or a human reviewer left comments. v9.5.0 added <strong>T5.1 — a bounded triage loop</strong> as part of the handoff PR-readiness block. This page is the operator's guide.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>You ran <code>/wf handoff &lt;slug&gt;</code>; a PR exists; reviewers have left at least one comment.</td></tr>
<tr><th>Goal</th><td>Get <code>readiness-verdict: ready</code> stamped on <code>08-handoff.md</code>.</td></tr>
<tr><th>Bound</th><td>5 iterations. After that the loop sets <code>status: awaiting-input</code> and stops.</td></tr>
</table>
</div>

<h2>How the loop works</h2>

<div class="diagram">
<pre class="mermaid">
sequenceDiagram
  participant U as You
  participant T as handoff T5.1
  participant GH as gh GraphQL
  participant I as /wf implement reviews
  loop up to 5 iterations
    T->>GH: reviewThreads(first: 100) filter isResolved=false
    GH-->>T: { threadId, author, file, line, body }
    T->>T: Classify each — 🔴 / 🟡 / 🟢
    T->>U: Triage table (Source | Line | Severity | Summary | Action)
    alt has 🔴 blockers
      T->>I: /wf implement &lt;slug&gt; &lt;slice&gt; reviews (per thread)
      I-->>T: commit sha
    end
    alt has 🟡 suggestions
      T->>U: AskUserQuestion multi-select (apply / defer / decline)
      U-->>T: choices
    end
    T->>GH: resolveReviewThread (per fixed thread)
    T->>GH: re-fetch
    GH-->>T: fresh unresolved set
    alt no new 🔴 AND no untriaged 🟡
      T->>T: exit loop
    end
  end
</pre>
</div>
<p class="caption">The loop fetches, classifies, fixes, resolves, re-fetches — bounded so bot ping-pong can't run forever.</p>

<h2>Re-run handoff to re-triage</h2>

<p>Just re-invoke handoff. Each step is idempotent, so the existing branch/PR/Diátaxis-docs are preserved and only the triage loop re-runs against the latest comment set.</p>

<pre><code>/wf handoff &lt;slug&gt;</code></pre>

<h2>Severity classification</h2>

<table>
<thead><tr><th>🔴 Blocking</th><th>🟡 Suggestion</th><th>🟢 Informational</th></tr></thead>
<tbody>
<tr>
  <td>CHANGES_REQUESTED; correctness; crash; security; data loss; missing migration; breaking API; "must fix" in body.</td>
  <td>Style; naming; doc gap; test gap; refactor recommendation; nit-with-merit.</td>
  <td>Walkthrough; praise; declined-nit acknowledgment; "FYI".</td>
</tr>
</tbody>
</table>

<p>When ambiguous, the loop prefers the more severe class. Bot walkthroughs are not auto-elevated to 🔴 unless they contain explicit blocker-language.</p>

<h2>Override the default bot list</h2>

<p>The loop's default reviewer bots are:</p>

<pre><code>coderabbitai
greptile-dev
gemini-code-assist
chatgpt-codex-connector[bot]</code></pre>

<p>Override per-project by adding <code>review-bots:</code> to <code>00-index.md</code>:</p>

<pre><code>review-bots:
  - my-custom-bot
  - another-bot[bot]</code></pre>

<h2>Deferring comments</h2>

<p>For a 🟡 you want to defer (revisit later, not block this PR), pick "defer" in the AskUserQuestion. The threadId goes into <code>triage-deferred-thread-ids</code> in <code>08-handoff.md</code> frontmatter and <code>has-deferred-comments: true</code> is set. The verdict downgrades to <code>awaiting-input</code> — ship will warn before running.</p>

<h2>Declining comments</h2>

<p>Pick "decline" instead. The loop posts a brief decline rationale as a fresh <code>gh pr comment</code> and resolves the thread. No frontmatter ghost.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../explanation/the-readiness-gate.html">The readiness gate</a> — how triage feeds into <code>readiness-verdict</code>.</li>
  <li><a href="../reference/08-handoff-schema.html">Handoff schema</a> — every triage field.</li>
  <li><a href="amend-or-extend.html">Amend or extend</a> — when triage findings are actually spec issues.</li>
</ul>
</div>
""",
    ("how-to/use-augmentations.html", "Use augmentations"),
    ("how-to/author-ship-plan.html", "Author a ship plan"),
))


PAGES.append((
    "how-to/author-ship-plan.html",
    "Author a ship plan",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Author a ship plan',
    """
<p>Before <code>/wf ship</code> works, the repo needs a <code>.ai/ship-plan.md</code>. You author it once per project.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>Plugin v9.12.0+. A repo open. No existing <code>.ai/ship-plan.md</code> — if one exists, see <a href="../reference/commands.html">amend ship-plan</a> instead.</td></tr>
<tr><th>Goal</th><td>Write <code>.ai/ship-plan.md</code> with required-core Blocks A–G plus any project-specific <code>additional-contracts[]</code>.</td></tr>
<tr><th>Time</th><td>~15–30 minutes the first time. Subsequent runs reuse the plan.</td></tr>
</table>
</div>

<h2>How the flow works — discovery → hypothesis → confirm</h2>

<p>From v9.12.0, <code>init-ship-plan</code> does not start by asking you to pick a template. It starts by <em>reading the repo</em> — CI workflow YAML, infra-as-code (Dockerfile/helm/terraform/fly.toml), package manifests (<code>package.json</code>, <code>pyproject.toml</code>, <code>gradle.properties</code>, <code>Cargo.toml</code>, …), release tooling (<code>release-please-config.json</code>, <code>goreleaser.yml</code>, <code>.changeset/</code>, <code>cliff.toml</code>), and runbook directories. It surfaces a discovery report, then walks you through each contract as a hypothesis to confirm, refine, or replace.</p>

<p>Templates still exist (<code>kotlin-maven-central</code>, <code>npm-public</code>, <code>pypi</code>, <code>container-image</code>, <code>server-deploy</code>, <code>library-internal</code>), but they are now <strong>hypothesis seeds</strong>, not control-flow branches. Pass <code>--from-template &lt;kind&gt;</code> only when you want the conversation to bias toward that shape; discovery still runs.</p>

<h2>Step 1 — Run init</h2>

<pre><code>/wf-meta init-ship-plan                              # discovery-led; no seed
/wf-meta init-ship-plan --from-template npm-public   # discovery-led, biased toward npm-public</code></pre>

<h2>Step 2 — Review the discovery report</h2>

<p>Before any AskUserQuestion, Claude prints a compact bullet summary of what it found — inferred ship-meaning, version source-of-truth candidates, release-workflow candidates, registry hostnames, secret refs, runbook seeds for recovery playbooks, and any <code>additional-contracts</code> the repo suggests (e.g., a Liquibase/Alembic/Flyway directory hints at <code>data-migration</code>).</p>

<p>Correct misreads in plain English: <em>"the helm dir is dead code, ignore it"</em> or <em>"actually we publish to a private registry, not GHCR"</em>. Claude updates the in-memory discovery state before moving on.</p>

<h2>Step 3 — Confirm each contract (Blocks A–G)</h2>

<p>For each required-core block, Claude proposes the inferred value plus alternatives plus <code>Other (describe)</code>. The seven blocks:</p>

<dl>
<dt><strong>A — Ship meaning + environments + cadence</strong></dt>
<dd>What does "ship" mean here? Which environments? How often?</dd>

<dt><strong>B — Versioning contract</strong></dt>
<dd>Scheme (semver/calver/sequential). Source-of-truth files. Bump rule (<code>git-cliff</code>, conventional-commits, <code>changesets</code>, <code>release-please</code>, manual, fixed). Bump command. Prerelease/post-release suffixes.</dd>

<dt><strong>C — CI/CD contract</strong></dt>
<dd>Release trigger. Release workflow file (picked from discovered candidates). Release jobs (pre-filled from the workflow file). Required secrets (pre-filled from <code>${{ secrets.X }}</code> patterns in workflows). Publish dry-run + publish commands.</dd>

<dt><strong>D — Post-publish verification</strong></dt>
<dd>Which checks confirm publish succeeded (registry-api, fresh-resolve, github-release, smoke-test, k8s-rollout-status). Propagation window. Poll interval.</dd>

<dt><strong>E — Rollout strategy + rollback</strong></dt>
<dd>Default rollout (immediate/staged/canary/blue-green/flag). Rollback mechanism. DB migration reversibility.</dd>

<dt><strong>F — Recovery playbooks</strong></dt>
<dd>Seeded from runbook files surfaced in Step 2, plus any defaults the chosen <code>--from-template</code> ships with. Empty otherwise. Grows over time via <code>/wf-meta amend ship-plan</code>.</dd>

<dt><strong>G — Announcements</strong></dt>
<dd>Channels (#releases, mailing list). Optional template path.</dd>
</dl>

<h2>Step 4 — Pick additional contracts (extensions)</h2>

<p>Claude asks whether the project has any contracts the standard Blocks A–G don't cover. Options seeded from discovery: <code>data-migration</code>, <code>feature-flag-rollout</code>, <code>infrastructure-as-code</code>, <code>mobile-app-store</code>, <code>compliance-gate</code>, <code>data-pipeline</code>, <code>schema-registry</code>, <code>Other (describe)</code>. Each picked one becomes an entry in <code>additional-contracts[]</code> with <code>{ id, purpose, fields, enforced-by }</code>. <code>/wf ship</code> ignores these by default; custom hooks or downstream commands opt in by <code>id</code>.</p>

<h2>Step 5 — Confirm + write</h2>

<p>Claude shows a summary table and asks for confirmation. <code>Confirm</code> writes <code>.ai/ship-plan.md</code> at repo root. <code>Adjust</code> goes back to one block (or one additional-contract <code>id</code>). <code>Cancel</code> discards.</p>

<h2>Step 6 — Commit the plan</h2>

<p>Commit <code>.ai/ship-plan.md</code>. It's a project-level contract; every workflow on this repo will ship through it.</p>

<pre><code>git add .ai/ship-plan.md
git commit -m "chore: author ship plan"</code></pre>

<h2>Amending the plan</h2>

<p>When CI/CD changes, secrets rotate, you accumulate enough run experience to add recovery playbooks, or you need to add a new additional-contract:</p>

<pre><code>/wf-meta amend ship-plan</code></pre>

<p>Pick which block (A–G) or which additional-contract <code>id</code> to edit. The amend flow re-runs only that block's hypothesis loop — discovery is skipped because the existing plan is ground truth. <code>plan-version</code> bumps by 1.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="run-a-release.html">Run a release</a> — what happens after the plan exists.</li>
  <li><a href="../reference/ship-plan-schema.html">Ship-plan schema</a> — every field, every value.</li>
  <li><a href="../explanation/idempotency-in-ship.html">Idempotency in ship</a> — why the plan is project-scoped and runs are per-release.</li>
</ul>
</div>
""",
    ("how-to/triage-pr-comments.html", "Triage PR comments"),
    ("how-to/run-a-release.html", "Run a release"),
))


PAGES.append((
    "how-to/run-a-release.html",
    "Run a release",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Run a release',
    """
<p>The plan exists. The handoff stamped <code>readiness-verdict: ready</code>. Time to ship.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td><code>.ai/ship-plan.md</code> exists (<a href="author-ship-plan.html">author it</a>). <code>08-handoff.md</code> exists with <code>readiness-verdict: ready</code>. You're on the workflow branch.</td></tr>
<tr><th>Goal</th><td>A successful ship run captured in <code>09-ship-run-&lt;run-id&gt;.md</code>.</td></tr>
<tr><th>If something fails</th><td>The run pauses with <code>status: awaiting-input</code>. Re-running <code>/wf ship &lt;slug&gt;</code> offers to resume.</td></tr>
</table>
</div>

<h2>The 13 steps</h2>

<div class="diagram">
<pre class="mermaid">
stateDiagram-v2
  [*] --> Orient
  Orient --> PreFlight: handoff verdict = ready
  Orient --> [*]: handoff verdict != ready  (refused)
  PreFlight --> DryRun
  DryRun --> Rollout
  Rollout --> Freshness
  Freshness --> GoNoGo
  GoNoGo --> Merge: go / conditional-go
  GoNoGo --> [*]: no-go
  Merge --> Tag
  Tag --> Watch
  Watch --> Poll
  Watch --> Recovery: failure matched a playbook
  Recovery --> Watch
  Poll --> PostBump
  Poll --> [*]: awaiting-input (bound exceeded)
  PostBump --> Index
  Index --> WriteArtifact
  WriteArtifact --> [*]
</pre>
</div>
<p class="caption">Every step detects its already-done state before acting. Resume picks up at the first empty evidence field.</p>

<h2>Step 1 — Invoke</h2>

<pre><code>/wf ship &lt;slug&gt;</code></pre>

<p>Or <code>/wf ship &lt;slug&gt; staging</code> to override the plan's default environment.</p>

<h2>Step 2 — Answer the per-run questions</h2>

<p>Three categories:</p>
<ul>
  <li><strong>Rollout strategy</strong> — confirm the plan default or override.</li>
  <li><strong>Release window</strong> (freeform) — blackout periods, on-call coverage.</li>
  <li><strong>Stakeholder overrides</strong> (freeform) — anyone you need explicit sign-off from for this run.</li>
</ul>

<p>These are asked once per run and never re-asked on resume.</p>

<h2>Step 3 — Watch</h2>

<p>The run streams progress for each step. For most projects:</p>
<ul>
  <li><strong>Pre-flight</strong> takes seconds (version literal updates + commit).</li>
  <li><strong>Publish dry-run</strong> can take 30s–5min depending on build size.</li>
  <li><strong>Merge</strong> is instant if CI is green.</li>
  <li><strong>Tag + release</strong> is instant.</li>
  <li><strong>Release workflow watch</strong> can take 5–30min (the CI runs the actual publish).</li>
  <li><strong>Post-publish poll</strong> bounded by <code>plan.propagation-window-max-minutes</code>.</li>
</ul>

<h2>If a recovery playbook fires</h2>

<p>When release-workflow watch sees a failure, Claude matches the failure output against <code>plan.recovery-playbooks[].triggers[]</code>. If a playbook matches, you see each step as an AskUserQuestion — confirm each before it runs. The playbook is captured in <code>recovery-actions-taken:</code> on the run artifact.</p>

<h2>If post-publish poll times out</h2>

<p>The run sets <code>status: awaiting-input</code> and lists the still-pending checks. Re-run <code>/wf ship &lt;slug&gt;</code>; pick "resume" when prompted. The poll continues from where it left off.</p>

<h2>If you need to roll back</h2>

<p>Roll back manually per <code>plan.rollback-mechanism</code> (git revert, gh release yank, feature-flag-off, blue-green switch, redeploy prior). Then edit the run frontmatter to set <code>rolled-back: true</code>, <code>rollback-sha</code>, <code>rollback-reason</code>. Consider amending the plan to capture what went wrong:</p>

<pre><code>/wf-meta amend ship-plan    # add a recovery playbook for next time</code></pre>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="resume-paused-work.html">Resume paused work</a> — exactly what "resume" looks like.</li>
  <li><a href="../reference/09-ship-run-schema.html">Ship-run schema</a> — every evidence field.</li>
  <li><a href="../explanation/idempotency-in-ship.html">Idempotency in ship</a> — why each step is safe to re-run.</li>
</ul>
</div>
""",
    ("how-to/author-ship-plan.html", "Author a ship plan"),
    ("how-to/resume-paused-work.html", "Resume paused work"),
))


PAGES.append((
    "how-to/resume-paused-work.html",
    "Resume paused work",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Resume paused work',
    """
<p>Two flavours of "paused": a workflow you context-switched away from, and a ship run that stopped on a failing post-publish check. Both resume the same way.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>A workflow exists. You've stepped away (hours, days, weeks).</td></tr>
<tr><th>Goal</th><td>Pick up at the right point with full context restored.</td></tr>
</table>
</div>

<h2>Case 1 — workflow context-switched</h2>

<p>You ran <code>/wf shape</code> two weeks ago. You don't remember the slug or where you left off.</p>

<pre><code>/wf-meta status                     # list everything
/wf-meta resume &lt;slug&gt;              # pick up</code></pre>

<p>Resume reads every artifact in the workflow directory, identifies the first unfinished stage, and proposes a concrete next invocation. You can accept or override.</p>

<h2>Case 2 — ship run paused</h2>

<p>You ran <code>/wf ship &lt;slug&gt;</code> yesterday. The release workflow succeeded but the registry-api post-publish check is still returning 404 (propagation slow). The run set <code>status: awaiting-input</code>.</p>

<pre><code>/wf ship &lt;slug&gt;</code></pre>

<p>When ship detects a paused run, it offers three choices:</p>

<table>
<thead><tr><th>Choice</th><th>Effect</th></tr></thead>
<tbody>
<tr><td>Resume &lt;run-id&gt;</td><td>Continue from the failed step. Same run-id; same artifact gets new evidence.</td></tr>
<tr><td>Start fresh</td><td>New run-id; prior run stays at <code>status: awaiting-input</code>.</td></tr>
<tr><td>Mark prior as failed, start fresh</td><td>Prior run gets <code>status: failed</code>; new run-id.</td></tr>
</tbody>
</table>

<h2>What "resume" means per step</h2>

<p>Every step in the ship run detects its already-done state:</p>

<ul>
  <li><strong>Pre-flight</strong> — version literal already at target? Skip the write.</li>
  <li><strong>Dry-run</strong> — always safe to re-run.</li>
  <li><strong>Merge</strong> — PR already merged? Capture the <code>mergeCommit.oid</code> and move on.</li>
  <li><strong>Tag</strong> — <code>git rev-parse "v&lt;version&gt;"</code> succeeds? Skip.</li>
  <li><strong>Workflow watch</strong> — already <code>release-workflow-conclusion: success</code>? Skip.</li>
  <li><strong>Post-publish poll</strong> — per-check status (<code>pass</code> / <code>fail</code> / <code>pending</code>). Only re-poll the <code>pending</code> ones.</li>
  <li><strong>Post-release bump</strong> — source-of-truth files already at next dev version? Skip.</li>
</ul>

<h2>When NOT to resume</h2>

<ul>
  <li>The plan changed materially since the paused run started. Inspect <code>plan-version-at-run</code> vs. current <code>plan-version</code>. If they differ, prefer "start fresh" so the new run records the new plan-version.</li>
  <li>The failure was upstream of the run — e.g., the release workflow had a bug that you fixed in CI config. A fresh run gets a fresh release-workflow-run-id, which is cleaner for audit.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="navigate-workflows.html">Navigate workflows</a> — daily lookup commands.</li>
  <li><a href="../explanation/idempotency-in-ship.html">Idempotency in ship</a> — the design property that makes resume safe.</li>
  <li><a href="../reference/09-ship-run-schema.html">Ship-run schema</a> — the evidence fields the resume logic reads.</li>
</ul>
</div>
""",
    ("how-to/run-a-release.html", "Run a release"),
    ("how-to/close-workflows.html", "Close workflows"),
))


PAGES.append((
    "how-to/close-workflows.html",
    "Close a workflow",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Close workflows',
    """
<p>Five reasons to close a workflow. Each writes a <code>99-close.md</code> artifact so the closure is part of the audit trail.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>A workflow exists.</td></tr>
<tr><th>Goal</th><td>Mark the workflow closed with a recorded reason.</td></tr>
</table>
</div>

<h2>Five reasons</h2>

<pre><code>/wf-meta close shipped       &lt;slug&gt;    # work is shipped (most common)
/wf-meta close abandoned     &lt;slug&gt;    # decided not to do this
/wf-meta close superseded    &lt;slug&gt;    # rolled into another workflow
/wf-meta close archived      &lt;slug&gt;    # complete + retired (old code path removed)
/wf-meta close stuck         &lt;slug&gt;    # external blocker, no path forward</code></pre>

<p>"Stuck" is unusual — most stuck workflows are amend or extend opportunities. Use <code>stuck</code> only when the blocker is genuinely outside your control (vendor outage, awaiting compliance review, etc.).</p>

<h2>What close writes</h2>

<p><code>99-close.md</code> with:</p>
<ul>
  <li><code>close-reason</code> field</li>
  <li>One-paragraph rationale (from user prompt)</li>
  <li>Pointer to the final stage that was reached</li>
  <li>Any deferred items that didn't get done</li>
</ul>

<h2>Skip vs. close</h2>

<p>Don't confuse <code>close</code> (workflow is over) with <code>skip</code> (one stage doesn't apply):</p>

<table>
<thead><tr><th>Skip</th><th>Close</th></tr></thead>
<tbody>
<tr><td><code>/wf-meta skip &lt;stage&gt; &lt;slug&gt;</code></td><td><code>/wf-meta close &lt;reason&gt; &lt;slug&gt;</code></td></tr>
<tr><td>Writes a stub artifact so downstream stages' prerequisites are satisfied.</td><td>Marks the entire workflow done.</td></tr>
<tr><td>The workflow continues.</td><td>The workflow stops.</td></tr>
</tbody>
</table>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../tips/escape-hatches.html">Escape hatches</a> — when skipping or closing early is the right call.</li>
  <li><a href="../reference/commands.html">Commands reference</a> — full <code>/wf-meta close</code> behaviour.</li>
</ul>
</div>
""",
    ("how-to/resume-paused-work.html", "Resume paused work"),
    None,
))


PAGES.append((
    "how-to/use-design.html",
    "Use the design pipeline",
    "how-to",
    '<a href="../index.html">Home</a> &rsaquo; How-to &rsaquo; Use the design pipeline',
    """
<p>Drop the design pipeline (<code>/wf-design</code>) into a workflow when the change touches UX or visual surfaces. Three modes, 22 sub-commands, six artifact slots.</p>

<div class="summary">
<table>
<tr><th>Pre-conditions</th><td>For workflow modes: a workflow exists past <code>shape</code> (<code>02-shape.md</code> present). For freestanding mode: nothing.</td></tr>
<tr><th>Goal</th><td>Pick the right design sub-command for the design task at hand.</td></tr>
<tr><th>Project context</th><td>Run <code>/wf-design setup</code> once per project to author <code>PRODUCT.md</code> + <code>DESIGN.md</code>. Most operators will load these as context.</td></tr>
</table>
</div>

<h2>The three invocation modes</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start{"How are you invoking /wf-design?"}
  start -- "/wf-design &lt;slug&gt;" --> a["Mode A — workflow stage 2b<br/>writes 02b-design.md, then routes to craft"]
  start -- "/wf-design &lt;slug&gt; &lt;sub&gt;" --> b["Mode B — workflow + sub-command<br/>runs sub against the workflow"]
  start -- "/wf-design &lt;sub&gt;" --> c["Mode C — freestanding<br/>no workflow, ad-hoc work"]
</pre>
</div>
<p class="caption">The router infers the mode from how many args you pass and whether arg 0 matches a known sub-command vs. an existing slug.</p>

<h2>By task</h2>

<dl>
<dt><strong>"Set up project-level design context (one-time)"</strong></dt>
<dd><code>/wf-design setup</code> — interview-driven; authors <code>PRODUCT.md</code> (audience, voice, register) and <code>DESIGN.md</code> (tokens, components, patterns). Run once per repo. Almost every other sub-command reads these.</dd>

<dt><strong>"Update PRODUCT.md or DESIGN.md after the project's brand or system evolved"</strong></dt>
<dd><code>/wf-design teach</code> — re-runs the relevant interview round and updates the file in place.</dd>

<dt><strong>"Author a design brief for a UI feature workflow"</strong></dt>
<dd><code>/wf-design &lt;slug&gt;</code> (Mode A; sub-command defaults to <code>shape</code>). Writes <code>02b-design.md</code>: register, anti-goals, layout approach, key states, interaction model. Required prerequisite: <code>02-shape.md</code>.</dd>

<dt><strong>"Pin down the visual contract before implementing"</strong></dt>
<dd><code>/wf-design &lt;slug&gt; craft</code>. Writes <code>02c-craft.md</code> — the visual contract reviewers will check against. Includes mock fidelity inventory: which surfaces match the design, which approximate, which are out-of-scope. Required prerequisite: <code>02b-design.md</code>.</dd>

<dt><strong>"Audit an existing design for accessibility, performance, theming, responsive"</strong></dt>
<dd><code>/wf-design &lt;slug&gt; audit</code>. Writes <code>07-design-audit.md</code> with severity-graded findings. Stage gate: requires <code>current-stage</code> ∈ {<code>implement</code>, <code>verify</code>, <code>review</code>, <code>handoff</code>, <code>ship</code>}. Cannot audit code that doesn't exist yet.</dd>

<dt><strong>"Get an expert UX critique of the design"</strong></dt>
<dd><code>/wf-design &lt;slug&gt; critique</code>. Writes <code>07-design-critique.md</code> — visual hierarchy, information architecture, emotional resonance, cognitive load, persona-based testing. Same stage gate as audit.</dd>

<dt><strong>"Pull reusable tokens / components from this work into the design system"</strong></dt>
<dd><code>/wf-design &lt;slug&gt; extract</code>. Writes <code>design-notes/extract-&lt;timestamp&gt;.md</code>. Read-only relative to the workflow; updates <code>DESIGN.md</code>.</dd>

<dt><strong>"Apply a focused transformation to existing UI code"</strong></dt>
<dd>One of the 15 transformation operators. Each modifies code, registers as an augmentation in <code>00-index.md</code>, and writes <code>design-notes/&lt;sub&gt;-&lt;timestamp&gt;.md</code>. Stage gate: <code>current-stage</code> ∈ {<code>implement</code>, <code>verify</code>, <code>review</code>, <code>handoff</code>}.</dd>
</dl>

<h2>The 15 transformation operators (one-liners)</h2>

<table>
<thead><tr><th>Operator</th><th>For</th></tr></thead>
<tbody>
<tr><td><code>animate</code></td><td>Add purposeful motion, micro-interactions, transitions.</td></tr>
<tr><td><code>bolder</code></td><td>Amplify a too-safe / bland design with more visual character.</td></tr>
<tr><td><code>clarify</code></td><td>Improve unclear UX copy, error messages, microcopy, labels.</td></tr>
<tr><td><code>colorize</code></td><td>Add strategic color to a too-monochromatic surface.</td></tr>
<tr><td><code>delight</code></td><td>Add moments of joy, personality, unexpected touches.</td></tr>
<tr><td><code>distill</code></td><td>Strip to essence; remove unnecessary complexity.</td></tr>
<tr><td><code>harden</code></td><td>Accessibility — keyboard nav, screen-reader, contrast, focus.</td></tr>
<tr><td><code>layout</code></td><td>Improve composition, spacing, visual rhythm.</td></tr>
<tr><td><code>onboard</code></td><td>First-run UX — intro, empty states, tooltips, progressive disclosure.</td></tr>
<tr><td><code>optimize</code></td><td>UI performance — loading, rendering, animation, bundle size.</td></tr>
<tr><td><code>overdrive</code></td><td>Push past convention with shaders, spring physics, scroll-driven reveals.</td></tr>
<tr><td><code>polish</code></td><td>Final pre-ship pass — alignment, spacing, micro-detail consistency.</td></tr>
<tr><td><code>quieter</code></td><td>Tone down overstimulating/aggressive designs.</td></tr>
<tr><td><code>typeset</code></td><td>Typography — font choices, hierarchy, sizing, weight, readability.</td></tr>
<tr><td><code>adapt</code></td><td>Responsive — breakpoints, fluid layouts, touch targets.</td></tr>
</tbody>
</table>

<h2>Stage-gate reference</h2>

<table>
<thead><tr><th>Sub-command category</th><th>Allowed stages</th><th>Why</th></tr></thead>
<tbody>
<tr><td>Context (<code>setup</code>, <code>teach</code>)</td><td>Any time</td><td>Project-level files; not workflow-bound.</td></tr>
<tr><td>Planning (<code>shape</code>)</td><td>After <code>02-shape.md</code> exists</td><td>Brief is downstream of shape.</td></tr>
<tr><td>Contract (<code>craft</code>)</td><td>After <code>02b-design.md</code> exists</td><td>Contract is downstream of brief.</td></tr>
<tr><td>Inspection (<code>extract</code>)</td><td>Any stage</td><td>Read-only relative to workflow.</td></tr>
<tr><td>Review (<code>audit</code>, <code>critique</code>)</td><td>implement → ship</td><td>Cannot review code that doesn't exist.</td></tr>
<tr><td>Transformation (15 operators)</td><td>implement → handoff</td><td>Cannot transform code that doesn't exist; cannot transform after ship.</td></tr>
</tbody>
</table>

<h2>How design integrates with the lifecycle</h2>

<ol>
<li><strong>Stage 2 (shape)</strong> writes <code>02-shape.md</code> with <code>docs-needed</code>, including possibly a UI scope. If UI: continue to 2b.</li>
<li><strong>Stage 2b (design shape)</strong> writes <code>02b-design.md</code> with the brief.</li>
<li><strong>Stage 2c (design craft)</strong> writes <code>02c-craft.md</code> with the visual contract. Implement reads it; review checks against it.</li>
<li><strong>Stage 5 (implement)</strong> reads <code>02b/02c</code>; produces UI code.</li>
<li><strong>Optional design review</strong> at any stage from implement onwards: <code>audit</code> and/or <code>critique</code> writes the corresponding <code>07-design-*.md</code>.</li>
<li><strong>Optional transformations</strong> apply focused improvements (harden for a11y, optimize for perf, etc.). Each registers as an augmentation in <code>00-index.md</code>'s <code>augmentations:</code> array.</li>
<li><strong>Stage 8 (handoff)</strong> translates registered design augmentations into reviewer-visible mentions in <code>08-handoff.md</code>.</li>
<li><strong>Stage 9 (ship)</strong> translates them into changelog lines per the External Output Boundary rules.</li>
</ol>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../reference/wf-design.html">Design pipeline reference</a> — every sub-command, every stage gate, every artifact.</li>
  <li><a href="../explanation/augmentations-model.html">Augmentations model</a> — how transformation operators register and propagate.</li>
  <li><a href="../reference/artifacts.html">Artifacts reference</a> — where design artifacts sit in the tree.</li>
</ul>
</div>
""",
    ("how-to/use-augmentations.html", "Use augmentations"),
    ("how-to/triage-pr-comments.html", "Triage PR comments"),
))


# === REFERENCE ===
PAGES.append((
    "reference/pipeline.html",
    "Pipeline reference (10 stages)",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Pipeline',
    """
<p>Every stage: position, requires, conditional inputs, produces, default next, skip-to options.</p>

<h2>I/O graph</h2>

<div class="diagram">
<pre class="mermaid">
flowchart LR
  i01["01-intake.md"] --> i02["02-shape.md"]
  i02 -.opt.-> i02b["02b-design.md (brief)"]
  i02b -.opt.-> i02c["02c-craft.md (visual contract)"]
  i02 --> i03["03-slice.md + 03-slice-X.md"]
  i02b --> i03
  i02c --> i03
  i03 --> i04["04-plan-X.md"]
  i02 -.opt.-> i04b["04b-instrument-X.md"]
  i02 -.opt.-> i04c["04c-experiment-X.md"]
  i04 --> i05["05-implement-X.md"]
  i04b --> i05
  i04c --> i05
  i02c -.opt.-> i05
  i05 --> i05c["05c-benchmark-X.md"]
  i05 --> i06["06-verify-X.md"]
  i05 -.opt.-> i07a["07-design-audit.md"]
  i05 -.opt.-> i07b["07-design-critique.md"]
  i06 --> i07["07-review-X.md + per-cmd"]
  i07 --> i08["08-handoff.md"]
  i07a -.-> i08
  i07b -.-> i08
  i08 --> i09r["09-ship-run-runid.md"]
  sp[".ai/ship-plan.md"] --> i09r
  i09r --> i10["10-retro.md"]
  i09r --> idx["09-ship-runs.md"]
</pre>
</div>
<p class="caption">Solid arrows are required reads. Dashed arrows are optional augmentation/design inputs that downstream stages MUST consume when present.</p>

<h2>The 10 stages</h2>

<h3>1 — Intake</h3>
<table class="summary-table">
<tr><th>Command</th><td><code>/wf intake "&lt;description&gt;"</code></td></tr>
<tr><th>Requires</th><td>Nothing. Entry point.</td></tr>
<tr><th>Produces</th><td><code>00-index.md</code>, <code>01-intake.md</code></td></tr>
<tr><th>Default next</th><td><code>/wf shape &lt;slug&gt;</code></td></tr>
<tr><th>Skip-to</th><td><code>/wf plan</code> for trivial changes (rare)</td></tr>
</table>

<h3>2 — Shape</h3>
<table>
<tr><th>Command</th><td><code>/wf shape &lt;slug&gt;</code></td></tr>
<tr><th>Requires</th><td><code>01-intake.md</code></td></tr>
<tr><th>Produces</th><td><code>02-shape.md</code> (deep spec + docs plan)</td></tr>
<tr><th>Conditional inputs</th><td>Web-research sub-agents (best-practice, anti-patterns, gotchas) fire by default. Opt out via <code>--no-research</code>.</td></tr>
<tr><th>Default next</th><td><code>/wf slice &lt;slug&gt;</code></td></tr>
<tr><th>Skip-to</th><td><code>/wf-design shape</code> for UI features → <code>02b-design.md</code></td></tr>
</table>

<h3>2b — Design (optional)</h3>
<table>
<tr><th>Command</th><td><code>/wf-design shape &lt;slug&gt;</code></td></tr>
<tr><th>Requires</th><td><code>02-shape.md</code></td></tr>
<tr><th>Produces</th><td><code>02b-design.md</code> — UX brief, register, anti-goals, visual contract.</td></tr>
<tr><th>When to use</th><td>UI features, dashboards, public-facing surfaces.</td></tr>
</table>

<h3>3 — Slice</h3>
<table>
<tr><th>Command</th><td><code>/wf slice &lt;slug&gt;</code></td></tr>
<tr><th>Requires</th><td><code>02-shape.md</code></td></tr>
<tr><th>Produces</th><td><code>03-slice.md</code> (master index) + <code>03-slice-&lt;slice&gt;.md</code> per slice.</td></tr>
<tr><th>Frontmatter</th><td>Per slice: <code>complexity</code>, <code>depends-on</code>.</td></tr>
</table>

<h3>4 — Plan</h3>
<table>
<tr><th>Command</th><td><code>/wf plan &lt;slug&gt; &lt;slice&gt;</code></td></tr>
<tr><th>Requires</th><td><code>03-slice-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>04-plan-&lt;slice&gt;.md</code></td></tr>
<tr><th>Sub-agents</th><td>Reuse scan, convention scan, web-research — all parallel.</td></tr>
</table>

<h3>5 — Implement</h3>
<table>
<tr><th>Command</th><td><code>/wf implement &lt;slug&gt; &lt;slice&gt;</code> or <code>… reviews</code> for review-driven fixes</td></tr>
<tr><th>Requires</th><td><code>04-plan-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>05-implement-&lt;slice&gt;.md</code> + code + commit</td></tr>
<tr><th>Frontmatter</th><td><code>commit-sha</code>, <code>metric-files-changed</code>, <code>metric-deviations-from-plan</code></td></tr>
</table>

<h3>6 — Verify</h3>
<table>
<tr><th>Command</th><td><code>/wf verify &lt;slug&gt; &lt;slice&gt;</code></td></tr>
<tr><th>Requires</th><td><code>05-implement-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>06-verify-&lt;slice&gt;.md</code> with evidence</td></tr>
</table>

<h3>7 — Review</h3>
<table>
<tr><th>Command</th><td><code>/wf review &lt;slug&gt; &lt;slice&gt;</code></td></tr>
<tr><th>Requires</th><td><code>06-verify-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>07-review-&lt;slice&gt;.md</code> (verdict) + <code>07-review-&lt;slice&gt;-&lt;cmd&gt;.md</code> (per dimension)</td></tr>
<tr><th>Verdict</th><td><code>ship</code> / <code>ship-with-caveats</code> / <code>dont-ship</code></td></tr>
</table>

<h3>8 — Handoff</h3>
<table>
<tr><th>Command</th><td><code>/wf handoff &lt;slug&gt; [slice-slug]</code></td></tr>
<tr><th>Requires</th><td>Every in-scope slice's <code>05-*</code> + <code>07-*</code></td></tr>
<tr><th>Produces</th><td><code>08-handoff.md</code> + PR + Diátaxis docs</td></tr>
<tr><th>PR-readiness block</th><td>T3.5 commitlint, T3.6 surface drift, T3.7 doc-mirror, T5.1 PR triage, T5.2 rebase, T5.3 live check</td></tr>
<tr><th>Gates ship via</th><td><code>readiness-verdict: ready</code></td></tr>
</table>

<h3>9 — Ship</h3>
<table>
<tr><th>Command</th><td><code>/wf ship &lt;slug&gt; [environment]</code></td></tr>
<tr><th>Requires</th><td><code>.ai/ship-plan.md</code> AND <code>08-handoff.md</code> with verdict <code>ready</code></td></tr>
<tr><th>Produces</th><td><code>09-ship-run-&lt;run-id&gt;.md</code> + refreshed <code>09-ship-runs.md</code></td></tr>
<tr><th>Replayable</th><td>13 idempotent steps; resumes from <code>status: awaiting-input</code></td></tr>
</table>

<h3>10 — Retro</h3>
<table>
<tr><th>Command</th><td><code>/wf retro &lt;slug&gt;</code></td></tr>
<tr><th>Requires</th><td>The full artifact trail through ship (or handoff if shipping is external)</td></tr>
<tr><th>Produces</th><td><code>10-retro.md</code> — concrete additions to CLAUDE.md, hooks, tests, CI</td></tr>
</table>
""",
    None,
    ("reference/commands.html", "Commands"),
))


PAGES.append((
    "reference/commands.html",
    "Commands reference",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Commands',
    """
<p>The hub. Every slash command at a glance, with links into the per-router detail pages for depth.</p>

<div class="callout note">
<strong>Looking for detail?</strong>
This page is the overview. For per-command depth — argument hints, what it reads, what it writes, when to use, when NOT to use, interview pattern — drill into the per-router pages:
<ul style="margin-top: 0.4em;">
<li><a href="wf.html">/wf router (in depth)</a> — every lifecycle stage + augmentation</li>
<li><a href="wf-quick.html">/wf-quick router (in depth)</a> — every compressed flow</li>
<li><a href="wf-meta.html">/wf-meta router (in depth)</a> — every nav/management sub-command</li>
<li><a href="wf-design.html">/wf-design router (in depth)</a> — 22 design sub-commands + 3 invocation modes</li>
<li><a href="wf-docs.html">/wf-docs router (in depth)</a> — pipeline + 7 Diátaxis primitives</li>
<li><a href="review.html">/review router (in depth)</a> — 31 dimensions + 7 sweeps</li>
</ul>
</div>

<h2>/wf — the lifecycle router</h2>

<p>Dispatches across 13 lifecycle stages + 4 augmentations. The stage commands all take <code>&lt;slug&gt;</code>; per-slice commands additionally take <code>&lt;slice-slug&gt;</code>.</p>

<table>
<thead><tr><th>Command</th><th>Args</th><th>Stage</th><th>Notes</th></tr></thead>
<tbody>
<tr><td><code>/wf intake</code></td><td><code>"description"</code></td><td>1</td><td>Entry point. Creates the workflow directory and slug.</td></tr>
<tr><td><code>/wf shape</code></td><td><code>&lt;slug&gt;</code></td><td>2</td><td>Deep interview + parallel web research.</td></tr>
<tr><td><code>/wf slice</code></td><td><code>&lt;slug&gt;</code></td><td>3</td><td>Decompose into vertical slices.</td></tr>
<tr><td><code>/wf plan</code></td><td><code>&lt;slug&gt; &lt;slice&gt;</code></td><td>4</td><td>Repo-aware plan with reuse scan.</td></tr>
<tr><td><code>/wf implement</code></td><td><code>&lt;slug&gt; &lt;slice&gt; [reviews]</code></td><td>5</td><td><code>reviews</code> mode applies review-finding fixes.</td></tr>
<tr><td><code>/wf verify</code></td><td><code>&lt;slug&gt; &lt;slice&gt;</code></td><td>6</td><td>Exercises acceptance criteria; captures evidence.</td></tr>
<tr><td><code>/wf review</code></td><td><code>&lt;slug&gt; &lt;slice&gt; [triage]</code></td><td>7</td><td>Multi-domain parallel review.</td></tr>
<tr><td><code>/wf handoff</code></td><td><code>&lt;slug&gt; [slice]</code></td><td>8</td><td>Aggregates complete slices; runs PR-readiness block.</td></tr>
<tr><td><code>/wf ship</code></td><td><code>&lt;slug&gt; [environment]</code></td><td>9</td><td>Plan-driven, replayable.</td></tr>
<tr><td><code>/wf retro</code></td><td><code>&lt;slug&gt;</code></td><td>10</td><td>Extract concrete improvement actions.</td></tr>
<tr><td><code>/wf instrument</code></td><td><code>&lt;slug&gt; &lt;slice&gt;</code></td><td>aug</td><td>Observability augmentation.</td></tr>
<tr><td><code>/wf experiment</code></td><td><code>&lt;slug&gt; &lt;slice&gt;</code></td><td>aug</td><td>Feature flag + cohort design.</td></tr>
<tr><td><code>/wf benchmark</code></td><td><code>&lt;slug&gt; &lt;slice&gt;</code></td><td>aug</td><td>Performance baseline + compare.</td></tr>
<tr><td><code>/wf profile</code></td><td><code>&lt;area&gt;</code></td><td>aug</td><td>Profiling pass (freestanding).</td></tr>
</tbody>
</table>

<h2>/wf-quick — compressed flows</h2>

<table>
<thead><tr><th>Command</th><th>For</th></tr></thead>
<tbody>
<tr><td><code>/wf-quick fix</code></td><td>Trivial, one-file change.</td></tr>
<tr><td><code>/wf-quick hotfix</code></td><td>Production incident (skips review).</td></tr>
<tr><td><code>/wf-quick rca</code></td><td>Root-cause analysis.</td></tr>
<tr><td><code>/wf-quick investigate</code></td><td>Solution-options sketcher — 2–3 distinct engineering approaches with tradeoffs (effort, blast radius, reversibility, risk); no winner picked.</td></tr>
<tr><td><code>/wf-quick discover</code></td><td>Hypothesis-test — adjudicates a code-level theory with FOR/AGAINST/counter-hypothesis evidence. Verdict: holds / partial / fails / inconclusive.</td></tr>
<tr><td><code>/wf-quick update-deps</code></td><td>Tiered dependency updates.</td></tr>
<tr><td><code>/wf-quick refactor</code></td><td>Behaviour-preserving refactor.</td></tr>
<tr><td><code>/wf-quick ideate</code></td><td>Rank improvement candidates.</td></tr>
<tr><td><code>/wf-quick simplify</code></td><td>3-agent review+route triage. Classifies findings and recommends downstream commands (fix / refactor / intake / amend / verify / docs). Never writes code. Scopes: branch (default) / commit / plan / codebase.</td></tr>
</tbody>
</table>

<h2>/wf-meta — navigation and management</h2>

<table>
<thead><tr><th>Command</th><th>Args</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>/wf-meta next</code></td><td><code>[slug]</code></td><td>What's the next command for this workflow?</td></tr>
<tr><td><code>/wf-meta status</code></td><td><code>[slug]</code></td><td>One workflow or all workflows at a glance.</td></tr>
<tr><td><code>/wf-meta resume</code></td><td><code>[slug]</code></td><td>Re-read trail; propose concrete next invocation.</td></tr>
<tr><td><code>/wf-meta sync</code></td><td><code>[slug]</code></td><td>Repair <code>00-index.md</code> against disk reality.</td></tr>
<tr><td><code>/wf-meta amend</code></td><td><code>&lt;scope&gt; &lt;target&gt;</code></td><td>Correct a prior artifact. <code>scope=ship-plan</code> edits <code>.ai/ship-plan.md</code>.</td></tr>
<tr><td><code>/wf-meta extend</code></td><td><code>&lt;scope&gt; &lt;target&gt;</code></td><td>Add new slices to an existing workflow.</td></tr>
<tr><td><code>/wf-meta skip</code></td><td><code>&lt;stage&gt; [slug]</code></td><td>Mark a stage skipped with a stub artifact.</td></tr>
<tr><td><code>/wf-meta close</code></td><td><code>&lt;reason&gt; [slug]</code></td><td>Archive a workflow (shipped/abandoned/superseded/archived/stuck).</td></tr>
<tr><td><code>/wf-meta how</code></td><td><code>&lt;mode&gt; &lt;topic&gt;</code></td><td>Five-mode question answering.</td></tr>
<tr><td><code>/wf-meta announce</code></td><td><code>[slug]</code></td><td>Diátaxis announcement for a completed workflow.</td></tr>
<tr><td><code>/wf-meta init-ship-plan</code></td><td><code>[--from-template &lt;kind&gt;]</code></td><td>Author <code>.ai/ship-plan.md</code> (one-time per project).</td></tr>
</tbody>
</table>

<h2>/wf-design — design pipeline</h2>

<p>22 sub-commands across three modes (workflow stage 2b, workflow + sub-command, freestanding). The main ones: <code>shape</code>, <code>craft</code>, <code>audit</code>, <code>critique</code>, plus 15 transformations (e.g., <code>colorize</code>, <code>typeset</code>, <code>animate</code>, <code>harden</code>, <code>quieter</code>, <code>bolder</code>, <code>delight</code>, <code>distill</code>, <code>clarify</code>, <code>adapt</code>, <code>layout</code>, <code>optimize</code>, <code>polish</code>, <code>overdrive</code>, <code>impeccable</code>) and 3 setup/extract operators (<code>setup</code>, <code>teach</code>, <code>extract</code>).</p>

<h2>/wf-docs — documentation pipeline</h2>

<p>Runs the full pipeline (<code>discover</code> → <code>audit</code> → <code>plan</code> → <code>generate</code> → <code>review</code>) or invokes a single Diátaxis primitive (<code>plan</code>, <code>tutorial</code>, <code>how-to</code>, <code>reference</code>, <code>explanation</code>, <code>readme</code>, <code>review</code>).</p>

<h2>/review — code review</h2>

<p>Per-dimension or named-sweep across 31 dimensions and 7 sweeps via parallel sub-agent dispatch. Driven entirely by an LLM-derived selection — pass the change context and the router picks which dimensions apply.</p>
""",
    ("reference/pipeline.html", "Pipeline"),
    ("reference/skills.html", "Skills"),
))


PAGES.append((
    "reference/skills.html",
    "Skills reference",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Skills',
    """
<p>Six skill routers, each dispatching across sub-commands. Skills are how the model auto-invokes plugin behaviour without an explicit slash command — but every router can also be reached explicitly.</p>

<table>
<thead><tr><th>Skill</th><th>What it routes</th><th>How invoked</th></tr></thead>
<tbody>
<tr><td><code>wf</code></td><td>13 lifecycle stages + 4 augmentations</td><td>Mostly explicit via <code>/wf &lt;stage&gt;</code>.</td></tr>
<tr><td><code>wf-quick</code></td><td>8 compressed flows</td><td>Explicit via <code>/wf-quick &lt;flow&gt;</code>.</td></tr>
<tr><td><code>wf-meta</code></td><td>11 navigation/management sub-commands</td><td>Mostly explicit. <code>init-ship-plan</code> + <code>status</code> are common.</td></tr>
<tr><td><code>wf-design</code></td><td>22 design sub-commands</td><td>Three modes: workflow stage 2b, workflow + sub-command, freestanding.</td></tr>
<tr><td><code>wf-docs</code></td><td>Doc pipeline + 7 Diátaxis primitives</td><td>Explicit or auto when the model detects a doc gap.</td></tr>
<tr><td><code>review</code></td><td>31 review dimensions, 7 sweeps</td><td>Auto-selected based on change context.</td></tr>
</tbody>
</table>

<h2>Skill anatomy</h2>

<p>Every skill router has:</p>
<ol>
  <li>A <code>SKILL.md</code> at <code>skills/&lt;name&gt;/SKILL.md</code> — the dispatcher. It identifies which sub-command was requested and loads the matching reference file.</li>
  <li>A <code>reference/</code> directory with one file per sub-command. The reference file is the actual instructions the model follows.</li>
</ol>

<p>Example: <code>/wf ship &lt;slug&gt;</code> resolves to <code>skills/wf/SKILL.md</code> → reads <code>$ARGUMENTS</code> → loads <code>skills/wf/reference/ship.md</code> → executes its 13 steps.</p>

<h2>Auto-invocation vs. explicit dispatch</h2>

<p>Skills with <code>disable-model-invocation: true</code> in frontmatter (currently: <code>wf-meta</code>) never auto-invoke — the user must explicitly run <code>/wf-meta …</code>. The other skills can auto-invoke when the model detects a triggering condition described in the skill's <code>description</code>.</p>
""",
    ("reference/commands.html", "Commands"),
    ("reference/wf-design.html", "Design pipeline"),
))


PAGES.append((
    "reference/wf-design.html",
    "Design pipeline (/wf-design)",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Design pipeline',
    """
<p>The <code>/wf-design</code> router. Three invocation modes, six sub-command categories, 22 sub-commands, six artifact slots in the workflow tree, plus two repo-root project context files.</p>

<h2>Invocation modes</h2>

<table class="no-mobile-scroll">
<thead><tr><th>Mode</th><th>Form</th><th>Effect</th></tr></thead>
<tbody>
<tr><td>A — workflow stage 2b</td><td><code>/wf-design &lt;slug&gt;</code></td><td>Shorthand for Mode B with sub-command <code>shape</code>. Writes <code>02b-design.md</code>; routes to <code>craft</code> next.</td></tr>
<tr><td>B — workflow + sub-command</td><td><code>/wf-design &lt;slug&gt; &lt;sub&gt; [target]</code></td><td>Runs the sub-command in workflow context. Subject to stage gates.</td></tr>
<tr><td>C — freestanding</td><td><code>/wf-design &lt;sub&gt; [target]</code></td><td>No workflow. Ad-hoc design work outside the lifecycle. No stage gates.</td></tr>
</tbody>
</table>

<p>The dispatcher infers the mode from arg 0: if it matches a known sub-command → Mode C; if it matches an existing slug → Mode A or B.</p>

<h2>Sub-command catalog</h2>

<h3>Context (any stage)</h3>
<table>
<thead><tr><th>Sub</th><th>Writes</th><th>What</th></tr></thead>
<tbody>
<tr><td><code>setup</code></td><td><code>PRODUCT.md</code> + <code>DESIGN.md</code> at repo root</td><td>One-time project-level interview. Audience, voice, register, tokens, components, patterns. Loaded as context by most other operators.</td></tr>
<tr><td><code>teach</code></td><td>Updates <code>PRODUCT.md</code> or <code>DESIGN.md</code> in place</td><td>Re-runs a focused interview round. Use when brand or design system evolves.</td></tr>
</tbody>
</table>

<h3>Planning</h3>
<table>
<thead><tr><th>Sub</th><th>Writes</th><th>Pre-condition</th></tr></thead>
<tbody>
<tr><td><code>shape</code></td><td><code>02b-design.md</code></td><td><code>02-shape.md</code> exists. WARN if <code>02b-design.md</code> already exists.</td></tr>
</tbody>
</table>

<p><code>02b-design.md</code> is the design <strong>brief</strong>: register, anti-goals, layout approach, key states, interaction model. Routes to <code>craft</code> next.</p>

<h3>Contract</h3>
<table>
<thead><tr><th>Sub</th><th>Writes</th><th>Pre-condition</th></tr></thead>
<tbody>
<tr><td><code>craft</code></td><td><code>02c-craft.md</code></td><td><code>02b-design.md</code> exists. WARN if <code>02c-craft.md</code> already exists.</td></tr>
</tbody>
</table>

<p><code>02c-craft.md</code> is the visual <strong>contract</strong> (NOT code). Includes a mock fidelity inventory: which surfaces match the design, which approximate, which are out-of-scope. <code>/wf implement</code> reads it; <code>/wf review</code> checks the implementation against it.</p>

<h3>Read-only inspection</h3>
<table>
<thead><tr><th>Sub</th><th>Writes</th><th>Pre-condition</th></tr></thead>
<tbody>
<tr><td><code>extract</code></td><td><code>design-notes/extract-&lt;timestamp&gt;.md</code> + updates <code>DESIGN.md</code></td><td>Any stage.</td></tr>
</tbody>
</table>

<p>Pulls reusable tokens and components out of the current work into the project's design system context.</p>

<h3>Review</h3>
<table>
<thead><tr><th>Sub</th><th>Writes</th><th>Pre-condition</th></tr></thead>
<tbody>
<tr><td><code>audit</code></td><td><code>07-design-audit.md</code></td><td>Stage gate: <code>implement</code> → <code>ship</code>.</td></tr>
<tr><td><code>critique</code></td><td><code>07-design-critique.md</code></td><td>Stage gate: <code>implement</code> → <code>ship</code>.</td></tr>
</tbody>
</table>

<p><code>audit</code> = technical-quality check (accessibility, performance, theming, responsive design, anti-patterns). Produces severity-graded P0/P1/P2/P3 findings.</p>
<p><code>critique</code> = expert UX review (visual hierarchy, information architecture, emotional resonance, cognitive load). Produces persona-based testing notes.</p>

<h3>Transformation (15 operators)</h3>

<p>Each transformation modifies code, registers an augmentation entry in <code>00-index.md</code>, and writes <code>design-notes/&lt;sub&gt;-&lt;timestamp&gt;.md</code> with rationale + diff summary.</p>

<table>
<thead><tr><th>Sub</th><th>For</th></tr></thead>
<tbody>
<tr><td><code>animate</code></td><td>Purposeful motion, micro-interactions, transitions, hover effects.</td></tr>
<tr><td><code>bolder</code></td><td>Amplify a too-safe design — more visual character without breaking usability.</td></tr>
<tr><td><code>clarify</code></td><td>Better UX copy, error messages, labels, instructions.</td></tr>
<tr><td><code>colorize</code></td><td>Strategic color where the surface is too monochromatic.</td></tr>
<tr><td><code>delight</code></td><td>Moments of joy, personality, unexpected touches.</td></tr>
<tr><td><code>distill</code></td><td>Strip to essence; remove unnecessary complexity.</td></tr>
<tr><td><code>harden</code></td><td>Accessibility — keyboard nav, screen-reader, contrast, focus management.</td></tr>
<tr><td><code>layout</code></td><td>Composition, spacing, visual rhythm; fixes monotonous grids.</td></tr>
<tr><td><code>onboard</code></td><td>First-run UX — intro, empty states, tooltips, progressive disclosure.</td></tr>
<tr><td><code>optimize</code></td><td>UI performance — loading, rendering, animation cost, bundle size.</td></tr>
<tr><td><code>overdrive</code></td><td>Push past convention with shaders, spring physics, 60fps animations.</td></tr>
<tr><td><code>polish</code></td><td>Final pre-ship pass — alignment, spacing, micro-detail consistency.</td></tr>
<tr><td><code>quieter</code></td><td>Tone down overstimulating designs while preserving quality.</td></tr>
<tr><td><code>typeset</code></td><td>Typography — font, hierarchy, sizing, weight, readability.</td></tr>
<tr><td><code>adapt</code></td><td>Responsive — breakpoints, fluid layouts, touch targets, cross-device.</td></tr>
</tbody>
</table>

<h2>Stage gate matrix</h2>

<table class="no-mobile-scroll">
<thead><tr><th>Stage →</th><th>intake</th><th>shape</th><th>slice</th><th>plan</th><th>implement</th><th>verify</th><th>review</th><th>handoff</th><th>ship</th></tr></thead>
<tbody>
<tr><td><strong>setup / teach</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td><strong>shape (design)</strong></td><td>—</td><td>after 02-shape.md</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
<tr><td><strong>craft</strong></td><td>—</td><td>—</td><td>after 02b</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
<tr><td><strong>extract</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td><strong>audit / critique</strong></td><td>—</td><td>—</td><td>—</td><td>—</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td><strong>15 transformations</strong></td><td>—</td><td>—</td><td>—</td><td>—</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr>
</tbody>
</table>

<p>The "transformations cannot run before implement" rule is the load-bearing one: <strong>you cannot transform code that does not exist yet</strong>. Pre-implement, use <code>shape</code> + <code>craft</code> to plan instead.</p>

<h2>Artifact slots — where design files live</h2>

<table class="no-mobile-scroll">
<thead><tr><th>Artifact</th><th>Path</th><th>Sub-command</th></tr></thead>
<tbody>
<tr><td>Design brief</td><td><code>.ai/workflows/&lt;slug&gt;/02b-design.md</code></td><td><code>/wf-design &lt;slug&gt; shape</code></td></tr>
<tr><td>Visual contract</td><td><code>.ai/workflows/&lt;slug&gt;/02c-craft.md</code></td><td><code>/wf-design &lt;slug&gt; craft</code></td></tr>
<tr><td>Design audit</td><td><code>.ai/workflows/&lt;slug&gt;/07-design-audit.md</code></td><td><code>/wf-design &lt;slug&gt; audit</code></td></tr>
<tr><td>Design critique</td><td><code>.ai/workflows/&lt;slug&gt;/07-design-critique.md</code></td><td><code>/wf-design &lt;slug&gt; critique</code></td></tr>
<tr><td>Per-transformation log</td><td><code>.ai/workflows/&lt;slug&gt;/design-notes/&lt;sub&gt;-&lt;timestamp&gt;.md</code></td><td>Any of the 15 transformations or <code>extract</code></td></tr>
<tr><td>Project product context</td><td><code>./PRODUCT.md</code> (repo root)</td><td><code>/wf-design setup</code> (and <code>teach</code>)</td></tr>
<tr><td>Project design-system context</td><td><code>./DESIGN.md</code> (repo root)</td><td><code>/wf-design setup</code> (and <code>teach</code>)</td></tr>
</tbody>
</table>

<h2>Integration with lifecycle stages</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TB
  subgraph Project context [authored once]
    P["PRODUCT.md"]
    D["DESIGN.md"]
  end
  subgraph Workflow stages
    s2["02-shape.md"] --> s2b["02b-design.md (brief)"]
    s2b --> s2c["02c-craft.md (visual contract)"]
    s2c --> impl["05-implement-X.md"]
    impl --> audit["07-design-audit.md (optional)"]
    impl --> crit["07-design-critique.md (optional)"]
    impl --> trans["design-notes/X-ts.md (transformation logs, optional)"]
    audit --> handoff["08-handoff.md"]
    crit --> handoff
    trans --> handoff
  end
  P -.context.-> s2b
  P -.context.-> s2c
  D -.context.-> s2b
  D -.context.-> s2c
  D -.context.-> trans
</pre>
</div>
<p class="caption">Solid arrows: workflow stage progression. Dotted arrows: project context loaded by design operators.</p>

<h2>Augmentation registration</h2>

<p>Every transformation operator registers itself in <code>00-index.md</code>'s <code>augmentations:</code> array:</p>

<pre><code>augmentations:
  - { kind: design-harden,  slice: route, ref: design-notes/harden-20260510T1432Z.md, registered-at: "..." }
  - { kind: design-animate, slice: route, ref: design-notes/animate-20260510T1530Z.md, registered-at: "..." }</code></pre>

<p>Handoff translates each registered entry into a reviewer-visible mention (e.g., <em>"Accessibility improvements applied — N components updated, axe-core scan clean"</em>). Ship translates each into a changelog line per the External Output Boundary rules.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../how-to/use-design.html">Use the design pipeline</a> — task-oriented recipes.</li>
  <li><a href="../explanation/augmentations-model.html">Augmentations model</a> — how transformations propagate.</li>
  <li><a href="artifacts.html">Artifacts reference</a> — full file tree including design slots.</li>
  <li><a href="commands.html">Commands reference</a> — every command surface.</li>
</ul>
</div>
""",
    ("reference/skills.html", "Skills"),
    ("reference/artifacts.html", "Artifacts"),
))


# ---------------------------------------------------------------------------
# Per-router detail pages — every command and sub-command at depth
# ---------------------------------------------------------------------------

PAGES.append((
    "reference/wf.html",
    "/wf router — every lifecycle command in depth",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; /wf router',
    """
<p>The lifecycle router. Dispatches across <strong>10 stages</strong> (intake → retro) and <strong>4 augmentations</strong> (instrument, experiment, benchmark, profile). Every command on this page is invoked as <code>/wf &lt;sub&gt; [args]</code>.</p>

<div class="toc">
<h3>On this page</h3>
<ul>
  <li><a href="#wf-intake">/wf intake</a></li>
  <li><a href="#wf-shape">/wf shape</a></li>
  <li><a href="#wf-slice">/wf slice</a></li>
  <li><a href="#wf-plan">/wf plan</a></li>
  <li><a href="#wf-implement">/wf implement</a></li>
  <li><a href="#wf-verify">/wf verify</a></li>
  <li><a href="#wf-review">/wf review</a></li>
  <li><a href="#wf-handoff">/wf handoff</a></li>
  <li><a href="#wf-ship">/wf ship</a></li>
  <li><a href="#wf-retro">/wf retro</a></li>
  <li><a href="#wf-instrument">/wf instrument</a> · <a href="#wf-experiment">experiment</a> · <a href="#wf-benchmark">benchmark</a> · <a href="#wf-profile">profile</a></li>
</ul>
</div>

<h2 id="wf-intake">/wf intake "&lt;description&gt;"</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>1 — the entry point</td></tr>
<tr><th>Requires</th><td>Nothing. This is where workflows start.</td></tr>
<tr><th>Produces</th><td><code>00-index.md</code> (control file), <code>01-intake.md</code> (initial requirements + branch decision)</td></tr>
<tr><th>Default next</th><td><code>/wf shape &lt;slug&gt;</code></td></tr>
</table></div>

<p>Captures the raw ask, generates a stable slug (kebab-case, lowercase), establishes the branch strategy, and writes the control file. Slug is derived from the title and never changes — it's the directory name under <code>.ai/workflows/</code>.</p>

<h4>What it reads</h4>
<ul>
  <li>The free-text description you pass.</li>
  <li>Recent git activity to suggest a base branch.</li>
  <li>Any existing <code>.ai/workflows/*/00-index.md</code> to avoid slug collisions.</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>.ai/workflows/&lt;slug&gt;/00-index.md</code> — control file with slug, title, status, branch-strategy, current-stage.</li>
  <li><code>.ai/workflows/&lt;slug&gt;/01-intake.md</code> — your stated requirements plus structured frontmatter (urgency, scope, constraints).</li>
</ul>

<h4>Interview pattern</h4>
<p>3–6 structured questions via AskUserQuestion: branch strategy (dedicated/shared/none), base branch, urgency, anyone-else-touching-this. Plus freeform: any constraints not captured.</p>

<h4>When to use</h4>
<ul>
  <li>You have a real feature or substantive change to make.</li>
  <li>You want a full lifecycle including review, handoff, and retro.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>One-line typo → <code>/wf-quick fix</code>.</li>
  <li>Production incident → <code>/wf-quick hotfix</code>.</li>
  <li>You have a theory about how the code works and want it adjudicated → <code>/wf-quick discover</code>.</li>
  <li>You have a problem and want 2–3 distinct engineering approaches sketched before picking one → <code>/wf-quick investigate</code>.</li>
</ul>

<hr>

<h2 id="wf-shape">/wf shape &lt;slug&gt;</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>2 — deep interview + research</td></tr>
<tr><th>Requires</th><td><code>01-intake.md</code></td></tr>
<tr><th>Produces</th><td><code>02-shape.md</code> — full mini-spec with acceptance criteria, edge cases, constraints, and the docs plan</td></tr>
<tr><th>Default next</th><td><code>/wf slice &lt;slug&gt;</code></td></tr>
<tr><th>Skip-to</th><td><code>/wf-design &lt;slug&gt;</code> for UI features (Stage 2b)</td></tr>
</table></div>

<p>The deepest interview stage. Shape commits the AI to <em>understanding</em>, not guessing. It dispatches parallel web-research sub-agents (best-practice scan, anti-patterns, gotchas) before asking you to fill in acceptance criteria and the docs plan.</p>

<h4>What it reads</h4>
<ul>
  <li><code>01-intake.md</code></li>
  <li>Project files for tech-stack context (package.json, pyproject.toml, etc.)</li>
  <li>Live web research — best practices for the feature kind, recent vendor changes, known gotchas.</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>02-shape.md</code> with frontmatter: <code>docs-needed</code>, <code>docs-types</code>, <code>has-ui</code>, <code>has-migration</code>.</li>
  <li>Body sections: Goal, Acceptance Criteria, Scope (in/out), Constraints, Edge Cases, Open Questions, Freshness Research, Documentation Plan.</li>
</ul>

<h4>Interview pattern</h4>
<p>15–30 structured questions in 4–6 rounds (AskUserQuestion). Topics: goal, acceptance criteria, in/out scope, edge cases, observability needs, documentation needs.</p>

<h4>When to use</h4>
<ul>
  <li>You need a clear spec before any code is written.</li>
  <li>The change is large enough that misunderstanding it would be expensive.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>The acceptance criteria are obvious from the description (rename, typo, version bump). Use <code>/wf-quick fix</code>.</li>
</ul>

<hr>

<h2 id="wf-slice">/wf slice &lt;slug&gt;</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>3 — decompose into vertical slices</td></tr>
<tr><th>Requires</th><td><code>02-shape.md</code></td></tr>
<tr><th>Produces</th><td><code>03-slice.md</code> (master index) + <code>03-slice-&lt;slice-slug&gt;.md</code> per slice</td></tr>
<tr><th>Default next</th><td><code>/wf plan &lt;slug&gt; &lt;slice&gt;</code></td></tr>
</table></div>

<p>Cuts the shaped work into thin, independently deliverable vertical slices. Each slice can be planned, implemented, verified, and reviewed in parallel. Single-slice features go through one cycle; multi-slice ones can fan out.</p>

<h4>What it reads</h4>
<ul>
  <li><code>02-shape.md</code> — goal, acceptance criteria, scope</li>
  <li><code>02b-design.md</code> if present (UI features)</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>03-slice.md</code> — master index with slice array (slug, status, complexity, depends-on)</li>
  <li><code>03-slice-&lt;slice-slug&gt;.md</code> per slice — goal, acceptance criteria, scope (in/out), complexity (xs/s/m/l/xl), dependencies</li>
</ul>

<h4>When to use</h4>
<ul>
  <li>Whenever shape is complete. Even single-slice work goes through slice (writes one per-slice file).</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>Use <code>/wf-meta skip slice</code> only for compressed flows that already decomposed at <code>/wf-quick</code> time.</li>
</ul>

<hr>

<h2 id="wf-plan">/wf plan &lt;slug&gt; &lt;slice&gt;</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>4 — repo-aware implementation plan</td></tr>
<tr><th>Requires</th><td><code>03-slice-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>04-plan-&lt;slice&gt;.md</code></td></tr>
<tr><th>Default next</th><td><code>/wf implement &lt;slug&gt; &lt;slice&gt;</code></td></tr>
</table></div>

<p>Plan is <em>repo-aware</em>. It dispatches parallel Explore sub-agents: <strong>reuse scan</strong> (does the codebase already have helpers we should use?), <strong>convention scan</strong> (what file/folder shape do existing features follow?), and <strong>web-research</strong> (current best practices for the specific pattern).</p>

<h4>What it reads</h4>
<ul>
  <li><code>03-slice-&lt;slice&gt;.md</code> + <code>02-shape.md</code> + <code>02b-design.md</code> + <code>02c-craft.md</code> if present</li>
  <li>Repo files via Explore sub-agents</li>
  <li>Live web research for current patterns</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>04-plan-&lt;slice&gt;.md</code> — files to touch, order of operations, reuse decisions, test strategy, <code>has-blockers</code> flag, revision count</li>
</ul>

<h4>Auto-review mode</h4>
<p>If <code>04-plan-&lt;slice&gt;.md</code> already exists, re-running plan triggers auto-review: an independent sub-agent reads the plan against the current spec and flags issues. Use this when a review or retro found the plan was incomplete.</p>

<h4>When to use</h4>
<ul>
  <li>Before any implementation. Always.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>Hotfix — <code>/wf-quick hotfix</code> compresses plan into the single artifact.</li>
</ul>

<hr>

<h2 id="wf-implement">/wf implement &lt;slug&gt; &lt;slice&gt; [reviews]</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>5 — execute the plan, commit atomically</td></tr>
<tr><th>Requires</th><td><code>04-plan-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>05-implement-&lt;slice&gt;.md</code> + code + a commit</td></tr>
<tr><th>Default next</th><td><code>/wf verify &lt;slug&gt; &lt;slice&gt;</code></td></tr>
</table></div>

<p>The only stage that writes code. Reads the plan, makes the edits, runs the project's test command, and commits with a message that follows your repo's commit convention.</p>

<h4>Modes</h4>
<ul>
  <li><strong>Default</strong>: <code>/wf implement &lt;slug&gt; &lt;slice&gt;</code> — implements per the plan.</li>
  <li><strong>Reviews</strong>: <code>/wf implement &lt;slug&gt; &lt;slice&gt; reviews</code> — applies review-finding fixes. Reads <code>07-review-&lt;slice&gt;.md</code> and re-implements the targeted fixes.</li>
</ul>

<h4>What it reads</h4>
<ul>
  <li><code>04-plan-&lt;slice&gt;.md</code>, <code>02-shape.md</code>, <code>02b-design.md</code>, <code>02c-craft.md</code>, <code>04b-instrument-&lt;slice&gt;.md</code>, <code>04c-experiment-&lt;slice&gt;.md</code> when present</li>
  <li>Existing repo code touched by the slice</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li>Code edits + tests in your repo</li>
  <li><code>05-implement-&lt;slice&gt;.md</code> with <code>commit-sha</code>, <code>metric-files-changed</code>, <code>metric-lines-added/removed</code>, <code>metric-deviations-from-plan</code>, and a <code>## Plan deviations</code> section if anything diverged</li>
</ul>

<h4>Plan-deviation discipline</h4>
<p>If Claude can't follow the plan exactly (discovered constraint, missing helper, plan was wrong), the deviation is recorded explicitly. The plan stays a plan; the implement file becomes the record of what actually happened.</p>

<hr>

<h2 id="wf-verify">/wf verify &lt;slug&gt; &lt;slice&gt;</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>6 — exercise the acceptance criteria, capture evidence</td></tr>
<tr><th>Requires</th><td><code>05-implement-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>06-verify-&lt;slice&gt;.md</code> with <code>result: pass | fail | partial</code></td></tr>
<tr><th>Default next</th><td><code>/wf review &lt;slug&gt; &lt;slice&gt;</code></td></tr>
</table></div>

<p>Reads the acceptance criteria from <code>02-shape.md</code> and the slice file, then exercises each criterion. Captures evidence: test output, response bodies, screenshots (for UI), benchmark results (if <code>05c-benchmark</code> ran).</p>

<h4>What it reads</h4>
<ul>
  <li>Acceptance criteria from <code>02-shape.md</code> + <code>03-slice-&lt;slice&gt;.md</code></li>
  <li>The just-committed code</li>
  <li>Project test runner command (npm test, pytest, gradle test, etc.)</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>06-verify-&lt;slice&gt;.md</code> with frontmatter: <code>result</code>, <code>metric-checks-run</code>, <code>metric-checks-passed</code>, <code>metric-acceptance-met</code></li>
  <li>Body: evidence per acceptance criterion (test output, curl response, screenshot link, etc.)</li>
</ul>

<h4>If verify fails</h4>
<p>Routes back to <code>/wf implement &lt;slug&gt; &lt;slice&gt;</code> with directed fix. Does NOT loosen acceptance criteria. If the criteria themselves were wrong, route to <code>/wf-meta amend</code>.</p>

<hr>

<h2 id="wf-review">/wf review &lt;slug&gt; &lt;slice&gt; [triage]</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>7 — multi-domain parallel review dispatch</td></tr>
<tr><th>Requires</th><td><code>06-verify-&lt;slice&gt;.md</code></td></tr>
<tr><th>Produces</th><td><code>07-review-&lt;slice&gt;.md</code> (master verdict) + <code>07-review-&lt;slice&gt;-&lt;cmd&gt;.md</code> per dimension</td></tr>
<tr><th>Default next</th><td><code>/wf handoff &lt;slug&gt;</code> (if ship verdict) or <code>/wf implement &lt;slice&gt; reviews</code> (if blockers)</td></tr>
</table></div>

<p>Not a single reviewer. A dispatch orchestrator that reads shape and slice, decides which of the 31 review dimensions matter for this change, and runs each as a parallel sub-agent. Findings are aggregated, de-duplicated, and triaged with you.</p>

<h4>What it reads</h4>
<ul>
  <li>Every prior artifact: shape, slice, plan, implement, verify, design</li>
  <li>The current diff (HEAD vs base)</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li>Per dimension: <code>07-review-&lt;slice&gt;-&lt;cmd&gt;.md</code> with severity-graded findings</li>
  <li>Master: <code>07-review-&lt;slice&gt;.md</code> with <code>verdict: ship | ship-with-caveats | dont-ship</code>, <code>commands-run</code>, all finding counts</li>
</ul>

<h4>Triage mode</h4>
<p><code>/wf review &lt;slug&gt; &lt;slice&gt; triage</code> re-opens prior findings and walks the user through deferred items.</p>

<hr>

<h2 id="wf-handoff">/wf handoff &lt;slug&gt; [slice]</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>8 — package for PR; run PR-readiness block</td></tr>
<tr><th>Requires</th><td>Every in-scope slice's <code>05-*</code> + <code>07-*</code></td></tr>
<tr><th>Produces</th><td><code>08-handoff.md</code> + Diátaxis docs + branch pushed + PR opened</td></tr>
<tr><th>Default next</th><td><code>/wf ship &lt;slug&gt;</code> if verdict <code>ready</code></td></tr>
</table></div>

<p>Aggregates ALL complete slices into one PR by default. Pass a slice slug as the second arg only when each slice ships as its own PR. The big v9.5.0 addition is the <strong>PR-readiness block</strong>: commitlint pass, public-surface drift check, doc-mirror regen, PR comment triage loop, rebase onto base, live PR readiness check. Outputs a single <code>readiness-verdict</code> that ship gates on.</p>

<h4>What it reads</h4>
<ul>
  <li>Every workflow artifact through review</li>
  <li>The git branch + base branch state</li>
  <li>Optional <code>00-index.md</code> config: <code>public-surface</code>, <code>docs-mirror</code>, <code>review-bots</code></li>
</ul>

<h4>What it writes</h4>
<ul>
  <li>Diátaxis docs per <code>02-shape.md</code> docs plan (loads <code>skills/wf-docs/reference/&lt;type&gt;.md</code> primitive verbatim)</li>
  <li><code>08-handoff.md</code> with the full PR-readiness frontmatter block</li>
  <li>Pushed branch + new or updated PR</li>
</ul>

<p>See <a href="08-handoff-schema.html">Handoff schema</a> for every frontmatter field; <a href="../how-to/triage-pr-comments.html">Triage PR comments</a> for the T5.1 loop; <a href="../explanation/the-readiness-gate.html">The readiness gate</a> for how the verdict is computed.</p>

<hr>

<h2 id="wf-ship">/wf ship &lt;slug&gt; [environment]</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>9 — plan-driven, replayable release</td></tr>
<tr><th>Requires</th><td><code>.ai/ship-plan.md</code> AND <code>08-handoff.md</code> with <code>readiness-verdict: ready</code></td></tr>
<tr><th>Produces</th><td><code>09-ship-run-&lt;run-id&gt;.md</code> + refreshed <code>09-ship-runs.md</code></td></tr>
<tr><th>Default next</th><td><code>/wf retro &lt;slug&gt;</code></td></tr>
</table></div>

<p>Walks the 13-step ship sequence. Each step is independently re-runnable (detects already-done state before acting). Resumes paused runs.</p>

<h4>13 steps</h4>
<ol>
  <li>Orient — read plan, handoff verdict, detect paused runs.</li>
  <li>Pre-flight — version bump, secrets check, changelog regen.</li>
  <li>Publish dry-run — mandatory if plan has one.</li>
  <li>Rollout questions — strategy, window, stakeholders.</li>
  <li>Freshness delta — research only what changed since last successful run.</li>
  <li>Go/No-Go — AskUserQuestion gate.</li>
  <li>Merge — gh pr merge (only if ship-meaning includes merging).</li>
  <li>Tag + release — for <code>tag-on-main</code> trigger.</li>
  <li>Release-workflow watch — gh run watch; recovery playbooks on failure.</li>
  <li>Post-publish polling — per <code>plan.post-publish-checks</code>, bounded by propagation window.</li>
  <li>Post-release version bump — for projects with snapshots / dev versions.</li>
  <li>Update <code>09-ship-runs.md</code> index.</li>
  <li>Write the run artifact.</li>
</ol>

<p>See <a href="../how-to/run-a-release.html">Run a release</a> for the walkthrough and <a href="09-ship-run-schema.html">Ship-run schema</a> for the artifact contract.</p>

<hr>

<h2 id="wf-retro">/wf retro &lt;slug&gt;</h2>

<div class="summary"><table>
<tr><th>Stage</th><td>10 — extract lessons; close out</td></tr>
<tr><th>Requires</th><td>The full artifact trail through ship (or handoff if shipping is external)</td></tr>
<tr><th>Produces</th><td><code>10-retro.md</code></td></tr>
</table></div>

<p>Reads every artifact in the workflow and proposes <strong>concrete improvement actions</strong> for the project: additions to <code>CLAUDE.md</code>, new hooks, missing test coverage, missing CI checks, missing command configurations.</p>

<h4>What it reads</h4>
<ul>
  <li>Every artifact in <code>.ai/workflows/&lt;slug&gt;/</code> from intake through ship</li>
  <li>The workflow's <code>po-answers.md</code> for moments where the user redirected the AI</li>
</ul>

<h4>What it writes</h4>
<ul>
  <li><code>10-retro.md</code> with: workflow-outcome (completed/abandoned/partial), <code>metric-improvement-count</code>, <code>metric-stages-completed</code></li>
  <li>Body: lessons learned + concrete suggested additions, ready to copy into CLAUDE.md / hooks / etc.</li>
</ul>

<h4>When to skip</h4>
<p>Compressed flows (<code>/wf-quick</code>) skip retro by default. The full pipeline should not — small lessons compound. Anti-pattern: skipping retro on "small" work.</p>

<hr>

<h2 id="wf-instrument">/wf instrument &lt;slug&gt; &lt;slice&gt;</h2>

<div class="summary"><table>
<tr><th>Type</th><td>Augmentation — observability</td></tr>
<tr><th>Requires</th><td><code>02-shape.md</code> + a defined slice</td></tr>
<tr><th>Produces</th><td><code>04b-instrument-&lt;slice&gt;.md</code></td></tr>
<tr><th>Registers as</th><td>Entry in <code>00-index.md</code>'s <code>augmentations:</code> array</td></tr>
</table></div>

<p>Designs the observability for a slice: which logs, metrics, traces to add. Implement reads the augmentation file and adds the signals. Handoff translates to "Added observability — N signals for previously unobserved code paths".</p>

<h4>When to use</h4>
<ul>
  <li>The slice changes code paths that have no logs/metrics/traces.</li>
  <li>The change is behaviour you want to monitor in production.</li>
</ul>

<hr>

<h2 id="wf-experiment">/wf experiment &lt;slug&gt; &lt;slice&gt;</h2>

<div class="summary"><table>
<tr><th>Type</th><td>Augmentation — feature flag + cohort design</td></tr>
<tr><th>Produces</th><td><code>04c-experiment-&lt;slice&gt;.md</code></td></tr>
</table></div>

<p>For behaviour changes you want to gate behind a flag with a measured rollout. Writes the cohort split design, success metrics, rollback signal. Implement reads it and adds the gating code.</p>

<h4>When to use</h4>
<ul>
  <li>The slice changes user-visible behaviour and you want a slow rollout.</li>
  <li>You need an explicit rollback signal beyond "revert the merge".</li>
</ul>

<hr>

<h2 id="wf-benchmark">/wf benchmark &lt;slug&gt; &lt;slice&gt;</h2>

<div class="summary"><table>
<tr><th>Type</th><td>Augmentation — perf baseline + compare</td></tr>
<tr><th>Produces</th><td><code>05c-benchmark-&lt;slice&gt;.md</code></td></tr>
</table></div>

<p>Two-phase: run before implement to capture baseline; run after implement (compare mode) to diff against baseline. Compare output flows into <code>06-verify-&lt;slice&gt;.md</code> evidence and into handoff as "Performance baseline taken; verify-stage comparison: &lt;within tripwires | regression&gt;".</p>

<h4>When to use</h4>
<ul>
  <li>The change could plausibly affect performance, even if you don't expect it to.</li>
  <li>You want regression insurance.</li>
</ul>

<hr>

<h2 id="wf-profile">/wf profile &lt;area&gt;</h2>

<div class="summary"><table>
<tr><th>Type</th><td>Augmentation — freestanding profiling pass</td></tr>
<tr><th>Slice-bound</th><td>No — doesn't need a workflow slice</td></tr>
<tr><th>Produces</th><td>A profiling report</td></tr>
</table></div>

<p>The only freestanding augmentation. Investigate where time is spent in the named area. Language-detect, static-analysis rubric, dynamic-profiling commands per language, structured-output contract.</p>

<h4>When to use</h4>
<ul>
  <li>You suspect a hot path but don't know where.</li>
  <li>You need to plan a perf improvement before committing to it.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="wf-quick.html">/wf-quick router</a> — the compressed alternatives to <code>/wf intake</code>.</li>
  <li><a href="wf-meta.html">/wf-meta router</a> — navigation and management.</li>
  <li><a href="pipeline.html">Pipeline reference</a> — the 10-stage flow these commands implement.</li>
  <li><a href="../tutorials/first-workflow.html">First workflow tutorial</a> — these commands in practice.</li>
</ul>
</div>
""",
    ("reference/skills.html", "Skills"),
    ("reference/wf-quick.html", "/wf-quick router"),
))


PAGES.append((
    "reference/wf-quick.html",
    "/wf-quick router — compressed flows in depth",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; /wf-quick router',
    """
<p>The compressed-flow router. Nine entries trade artifact depth for speed (or — for <code>simplify</code> — review the work that already exists). Each writes fewer files than the full <code>/wf</code> pipeline. Set <code>workflow-type</code> in the index so downstream stages know they're in compressed mode.</p>

<div class="toc">
<h3>On this page</h3>
<ul>
  <li><a href="#fix">/wf-quick fix</a></li>
  <li><a href="#hotfix">/wf-quick hotfix</a></li>
  <li><a href="#rca">/wf-quick rca</a></li>
  <li><a href="#investigate">/wf-quick investigate</a></li>
  <li><a href="#discover">/wf-quick discover</a></li>
  <li><a href="#update-deps">/wf-quick update-deps</a></li>
  <li><a href="#refactor">/wf-quick refactor</a></li>
  <li><a href="#ideate">/wf-quick ideate</a></li>
  <li><a href="#simplify">/wf-quick simplify</a></li>
</ul>
</div>

<h2 id="fix">/wf-quick fix "&lt;description&gt;"</h2>

<div class="summary"><table>
<tr><th>workflow-type</th><td><code>quick</code></td></tr>
<tr><th>Produces</th><td><code>00-index.md</code>, <code>01-quick.md</code>, <code>05-implement.md</code> (3 artifacts total)</td></tr>
<tr><th>Stages skipped</th><td>shape, slice, plan, verify, review, retro</td></tr>
</table></div>

<p>For one-character typos, one-line patches, single-file docs edits. The compressed shape skips shape's deep interview — acceptance criteria are inlined.</p>

<h4>Interview pattern</h4>
<p>2–3 questions: what file, what's the fix, do you want a test added.</p>

<h4>When to use</h4>
<ul>
  <li>One file. One change. Reviewers won't have questions.</li>
  <li>You'd be embarrassed to run a full <code>/wf</code> pipeline for this.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>The change touches more than 2 files — escalate to <code>/wf intake</code>.</li>
  <li>The acceptance criteria need thinking — escalate to <code>/wf intake</code>.</li>
</ul>

<hr>

<h2 id="hotfix">/wf-quick hotfix "&lt;symptom&gt;"</h2>

<div class="summary"><table>
<tr><th>workflow-type</th><td><code>hotfix</code></td></tr>
<tr><th>Pipeline shape</th><td>6-stage, scope-locked. Files named <code>hf-*.md</code>.</td></tr>
<tr><th>Bypasses</th><td>Review (by design)</td></tr>
</table></div>

<p>Production is on fire. Bypass review for speed; still leave an artifact trail for post-incident learning.</p>

<h4>Pipeline shape</h4>
<ol>
  <li><code>hf-01-intake.md</code> — symptom, impact, who's affected, who paged.</li>
  <li><code>hf-02-shape.md</code> — minimal acceptance criteria, scope lock (in/out is strict).</li>
  <li><code>hf-03-plan.md</code> — narrow fix plan.</li>
  <li><code>hf-04-implement.md</code> — the fix, with commit-sha.</li>
  <li><code>hf-05-verify.md</code> — minimal verify, captures revert plan.</li>
  <li><code>hf-06-postmortem.md</code> — incident timeline + retro action items.</li>
</ol>

<h4>Scope-lock discipline</h4>
<p>Anything outside the symptom is rejected. If the user asks "while we're in there can we also…" — the answer is "no, file a separate workflow". The lock is what makes hotfix safe.</p>

<h4>When to use</h4>
<ul>
  <li>Sev1/Sev2 production incident.</li>
  <li>The fix is small and the cost of not shipping fast is high.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>The scope is uncertain. Run <code>/wf-quick rca</code> first to find the cause.</li>
  <li>The fix is risky — escalate to <code>/wf intake</code> for proper review.</li>
</ul>

<hr>

<h2 id="rca">/wf-quick rca "&lt;symptom + repro&gt;"</h2>

<div class="summary"><table>
<tr><th>Produces</th><td><code>01-rca.md</code></td></tr>
<tr><th>Forwards to</th><td><code>/wf shape</code> (which reads <code>01-rca.md</code> as rich context)</td></tr>
</table></div>

<p>Root-cause analysis with parallel sub-agents. Reproduces the bug, captures the failing trace, identifies the cause without committing to a fix. Output is forwardable: subsequent <code>/wf shape</code> reads <code>01-rca.md</code> as context behind the synthesized spec.</p>

<h4>Sub-agent dispatch</h4>
<ul>
  <li><strong>Repro agent</strong> — minimal reproduction.</li>
  <li><strong>Code-path trace agent</strong> — flow from input to symptom.</li>
  <li><strong>Recent-change agent</strong> — git log/blame for the affected files.</li>
  <li><strong>Dependency agent</strong> — recent changes to deps or platform that could be the cause.</li>
</ul>

<h4>When to use</h4>
<ul>
  <li>You have a bug report but don't yet know what's wrong.</li>
  <li>The fix isn't obvious — you need diagnosis first.</li>
</ul>

<hr>

<h2 id="investigate">/wf-quick investigate "&lt;problem&gt;"</h2>

<div class="summary"><table>
<tr><th>Produces</th><td><code>01-investigate.md</code> with 2–3 distinct engineering approaches and tradeoffs</td></tr>
<tr><th>Forwards to</th><td>User picks an option, then <code>/wf-quick fix</code> (small) or <code>/wf intake</code> (medium+). No <code>02-shape.md</code> is synthesized — the downstream command does shape on the chosen option.</td></tr>
</table></div>

<p><strong>Solution-options sketcher.</strong> Takes a code-level problem ("checkout p99 latency is 2s", "auth flow is brittle under concurrent writes") and produces 2–3 genuinely distinct engineering approaches grounded in the existing architecture. Three parallel sub-agents:</p>
<ul>
  <li><strong>Architecture cartographer</strong> — maps the relevant area (entry points, call graph, data touched, integration boundaries, architectural constraints, recent churn).</li>
  <li><strong>Option generator</strong> — proposes 2–3 approaches that differ in <em>mechanism</em>, not just surface choices. Also records what was considered and rejected.</li>
  <li><strong>Tradeoff characterizer</strong> — scores each option on effort, blast radius, reversibility, top risks (specific failure modes, not generic warnings), and operational fit.</li>
</ul>
<p>The artifact ends with a side-by-side comparison table. <strong>No winner is picked — you pick.</strong></p>

<h4>When to use</h4>
<ul>
  <li>You have a concrete problem in the code and want a structured set of approaches to compare before committing.</li>
  <li>You're tempted to grab the first solution that comes to mind — and want a forcing function to consider alternatives first.</li>
  <li>You're between <code>/wf-quick fix</code> (too small, no design pass) and <code>/wf intake</code> → <code>/wf shape</code> (commits to one design with acceptance criteria).</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>You have a symptom and want to find the root cause → <code>/wf-quick rca</code>.</li>
  <li>You want to understand how the area works, not generate options → <code>/wf-docs how</code>.</li>
  <li>You already know which approach you want → skip straight to <code>/wf-quick fix</code> or <code>/wf intake</code>.</li>
</ul>

<hr>

<h2 id="discover">/wf-quick discover "&lt;hypothesis&gt;"</h2>

<div class="summary"><table>
<tr><th>Produces</th><td><code>01-discover.md</code> with a verdict: <code>holds</code> / <code>partial</code> / <code>fails</code> / <code>inconclusive</code></td></tr>
<tr><th>Forwards to</th><td>If <code>holds</code> → no required follow-up (proceed however you intended). If <code>fails</code> → <code>/wf-quick rca</code> (if hypothesis was an explanation for bad behavior) or <code>/wf-docs how</code> (if you need to actually learn the code). If <code>inconclusive</code> → run the runtime signal it names.</td></tr>
</table></div>

<p><strong>Hypothesis-test workflow.</strong> Takes a code-level theory ("the rate-limiter is a token bucket in <code>middleware/</code>", "auth validates JWTs before checking session state", "module M handles concurrency via mutexes not channels") and adjudicates it against the codebase. Three parallel sub-agents:</p>
<ul>
  <li><strong>Evidence FOR</strong> — searches for code that supports the hypothesis; cites <code>file:line</code> for every supporting snippet.</li>
  <li><strong>Evidence AGAINST</strong> — actively tries to falsify the hypothesis; looks for contradicting code, drift signals from <code>git log</code>, configuration that changes behavior at runtime.</li>
  <li><strong>Counter-hypotheses</strong> — proposes 1–3 alternative explanations that fit the same observable behavior, ranked by plausibility.</li>
</ul>
<p>Synthesis produces a convergent verdict — exactly one of <code>holds</code>, <code>partial</code>, <code>fails</code>, or <code>inconclusive</code> — with confidence and cited evidence on both sides. The verdict is justified, not asserted.</p>

<h4>When to use</h4>
<ul>
  <li>You believe X about how the code works and want it adjudicated before you act on the belief.</li>
  <li>You're about to make a change that depends on an assumption — confirm the assumption first.</li>
  <li>You're disagreeing with a colleague about how something works and want a sourced verdict.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>You don't have a theory yet — you just want to understand the area → <code>/wf-docs how</code>.</li>
  <li>You have a symptom, not a theory, and want to find the cause → <code>/wf-quick rca</code>.</li>
  <li>You want to compare multiple approaches to a problem → <code>/wf-quick investigate</code>.</li>
</ul>

<hr>

<h2 id="update-deps">/wf-quick update-deps</h2>

<div class="summary"><table>
<tr><th>Produces</th><td><code>.ai/dep-updates/&lt;run-id&gt;/</code> tree: scan, research, plan, implement, verify</td></tr>
</table></div>

<p>Tiered dependency updates. Audits the dep tree, classifies findings into P0 (security) / P1 (major version) / P2 (safe minor/patch) / hold, applies them in priority order with verification between tiers.</p>

<h4>Pipeline</h4>
<ol>
  <li><code>scan.md</code> — dep inventory + audit results (npm audit, pip-audit, etc.)</li>
  <li><code>research.md</code> — per-package release notes, breaking changes</li>
  <li><code>plan.md</code> — tiered update plan</li>
  <li><code>implement.md</code> — what was updated, blocked, committed</li>
  <li><code>verify.md</code> — post-update test results</li>
</ol>

<hr>

<h2 id="refactor">/wf-quick refactor "&lt;area&gt;"</h2>

<div class="summary"><table>
<tr><th>workflow-type</th><td><code>refactor</code></td></tr>
<tr><th>Files</th><td><code>rf-*.md</code> prefixed</td></tr>
</table></div>

<p>Behaviour-preserving refactor with test baseline. Captures the test suite output as a baseline BEFORE refactoring, refactors with incremental green steps, re-verifies parity.</p>

<h4>Pipeline shape</h4>
<ol>
  <li><code>rf-01-baseline.md</code> — capture current test output + behaviour</li>
  <li><code>rf-02-plan.md</code> — refactor plan with checkpoint commits</li>
  <li><code>rf-03-implement.md</code> — incremental changes with checkpoint verifies</li>
  <li><code>rf-04-parity.md</code> — final parity check against baseline</li>
</ol>

<h4>When NOT to use</h4>
<ul>
  <li>The refactor changes behaviour. That's not a refactor — that's a feature. Use <code>/wf intake</code>.</li>
</ul>

<hr>

<h2 id="ideate">/wf-quick ideate "&lt;focus area&gt;"</h2>

<div class="summary"><table>
<tr><th>Produces</th><td><code>.ai/ideation/&lt;focus&gt;-&lt;timestamp&gt;.md</code></td></tr>
</table></div>

<p>Brainstorm + rank improvement candidates for a focus area. Output: a ranked list with effort estimates and impact guesses. Useful before sprint planning or as input to <code>/wf intake</code> (medium+ candidates) or <code>/wf-quick fix</code> (small candidates).</p>

<hr>

<h2 id="simplify">/wf-quick simplify [scope] [target]</h2>

<div class="summary"><table>
<tr><th>Scopes</th><td><code>branch</code> (default) · <code>commit &lt;sha&gt;</code> · <code>plan &lt;slug&gt; &lt;slice&gt;</code> · <code>codebase [&lt;path&gt;]</code></td></tr>
<tr><th>Produces</th><td><code>.ai/simplify/&lt;run-id&gt;.md</code> — findings + per-finding routing assignments</td></tr>
<tr><th>Pattern</th><td>Three parallel sub-agents (Code Reuse, Code Quality, Efficiency). Adapted from Claude Code's bundled <code>simplify</code> skill, but realigned to sdlc-workflow's orchestrator discipline.</td></tr>
<tr><th>Does NOT</th><td>Write code, commit, push, edit plans, or run downstream commands. <strong>Simplify routes; it never fixes.</strong></td></tr>
</table></div>

<p>Review-and-route triage utility. Aggregates findings across three rubrics, asks you which to accept, and then <strong>classifies each accepted finding</strong> by routing it to the appropriate downstream command (<code>/wf-quick fix</code>, <code>/wf-quick refactor</code>, <code>/wf intake</code>, <code>/wf-meta amend</code>, <code>/wf-docs</code>, etc.). The output is a queue of copy-pasteable next commands — you run them; simplify doesn't.</p>

<div class="callout insight">
<strong>Why no direct fixes?</strong>
The plugin's orchestrator discipline: plan plans, implement implements, review reviews. Simplify routes. A trivial fix deserves <code>/wf-quick fix</code>'s artifact trail; a structural change deserves <code>/wf intake</code>'s shape+plan+review; a plan-level issue deserves <code>/wf-meta amend</code>'s versioned amendment. Letting simplify silently rewrite code would bypass all three.
</div>

<h4>The four scopes</h4>

<table class="no-mobile-scroll">
<thead><tr><th>Scope</th><th>Input the agents read</th><th>When to use</th></tr></thead>
<tbody>
<tr><td><code>branch</code> (default)</td><td><code>git diff &lt;base&gt;...HEAD</code> — only what's new on this branch</td><td>Before opening a PR; pre-handoff sanity pass.</td></tr>
<tr><td><code>commit &lt;sha&gt;</code></td><td><code>git show &lt;sha&gt;</code> (single) or <code>git diff &lt;range&gt;</code></td><td>Triage a specific commit before pushing.</td></tr>
<tr><td><code>plan &lt;slug&gt; &lt;slice&gt;</code></td><td>The plan file's prose + structure</td><td>Catch over-engineering / missed reuse before <code>/wf implement</code>.</td></tr>
<tr><td><code>codebase [&lt;path&gt;]</code></td><td>Directory subtree (capped at ~500 files)</td><td>Periodic codebase audit; surface improvement candidates by route.</td></tr>
</tbody>
</table>

<h4>The three sub-agents</h4>

<table>
<thead><tr><th>Agent</th><th>What it looks for</th></tr></thead>
<tbody>
<tr><td><strong>Code Reuse</strong></td><td>Inline logic that should use an existing helper; new functions that duplicate existing ones; ad-hoc string/path/env handling.</td></tr>
<tr><td><strong>Code Quality</strong></td><td>Redundant state; parameter sprawl; copy-paste with slight variation; leaky abstractions; stringly-typed code; unnecessary wrapper components; unnecessary comments narrating WHAT (vs non-obvious WHY).</td></tr>
<tr><td><strong>Efficiency</strong></td><td>N+1 patterns; missed concurrency; hot-path bloat; no-op state updates; TOCTOU existence checks; memory leaks; overly broad reads.</td></tr>
</tbody>
</table>

<h4>The routing matrix</h4>

<p>For each accepted finding, simplify assigns a route. Bias toward the smallest scope that fully addresses the finding — never escalate a finding to bigger process than it deserves.</p>

<table class="no-mobile-scroll">
<thead><tr><th>Route</th><th>Downstream command</th><th>Use when</th></tr></thead>
<tbody>
<tr><td><code>route-fix</code></td><td><code>/wf-quick fix "..."</code></td><td>Trivial mechanical cleanup, ≤1 file, no behaviour change.</td></tr>
<tr><td><code>route-refactor</code></td><td><code>/wf-quick refactor "..."</code></td><td>Behaviour-preserving restructure across multiple files.</td></tr>
<tr><td><code>route-intake</code></td><td><code>/wf intake "..."</code></td><td>Substantive change with possible behaviour impact, or architectural issue.</td></tr>
<tr><td><code>route-amend-plan</code></td><td><code>/wf-meta amend &lt;slug&gt; &lt;slice&gt;</code></td><td>Plan-scope only — accompanies a proposed-delta block.</td></tr>
<tr><td><code>route-amend-shape</code></td><td><code>/wf-meta amend &lt;slug&gt;</code></td><td>Finding implicates the workflow's shaped spec.</td></tr>
<tr><td><code>route-verify</code></td><td><code>/wf verify &lt;slug&gt; &lt;slice&gt;</code></td><td>Inadequate test coverage; verify can surface deeper gaps.</td></tr>
<tr><td><code>route-add-test</code></td><td><code>/wf-quick fix "add test for X"</code></td><td>Specific missing test addable as a one-file fix.</td></tr>
<tr><td><code>route-docs</code></td><td><code>/wf-docs &lt;primitive&gt;</code></td><td>Doc gap not picked up by handoff's Diátaxis generation.</td></tr>
<tr><td><code>route-handoff-config</code></td><td>Edit <code>00-index.md</code> config keys</td><td>Drift in handoff's surface / mirror config inputs.</td></tr>
<tr><td><code>route-noop</code></td><td>—</td><td>Informational; recorded but no action.</td></tr>
</tbody>
</table>

<h4>Plan-scope adaptation</h4>
<p>The agents read the plan as prose rather than a diff. Findings become "plan step duplicates earlier step", "plan over-specifies parameters", "plan does redundant work" — same rubrics, different surface. Every accepted plan-scope finding gets <code>route: route-amend-plan</code> with an accompanying <code>proposed-delta</code> block. Apply via <code>/wf-meta amend &lt;slug&gt; &lt;slice&gt;</code>.</p>

<h4>Severity defaults</h4>
<table>
<tr><th>high / med / low</th><td>Default triage: accept (include in routing assignments)</td></tr>
<tr><th>nit</th><td>Default triage: skip</td></tr>
</table>
<p>The user can override per-finding via AskUserQuestion (<code>accept / skip / defer</code>). False positives are skipped with a one-line reason and not argued.</p>

<h4>Examples</h4>

<pre><code># Pre-handoff triage of the current branch — produces a routing report
/wf-quick simplify

# Same, with explicit base branch
/wf-quick simplify branch main

# Last commit only
/wf-quick simplify commit HEAD

# Specific commit
/wf-quick simplify commit 8a1f3c2

# Range
/wf-quick simplify commit HEAD~3..HEAD

# Sanity-check a plan before implementing it
/wf-quick simplify plan dark-mode-toggle-settings route

# Periodic codebase audit, scoped to a directory
/wf-quick simplify codebase src/auth/</code></pre>

<h4>Output shape</h4>
<p>The chat return is a queue of suggested invocations sorted by route priority (<code>route-intake</code> first — biggest process — through <code>route-fix</code> and <code>route-docs</code>). Each is copy-pasteable. The artifact at <code>.ai/simplify/&lt;run-id&gt;.md</code> persists the full routing trail.</p>

<h4>When NOT to use</h4>
<ul>
  <li>You want simplify to fix things directly. <strong>It won't.</strong> The point of the routing is that each finding gets the right level of process. If you want one-shot cleanup, run simplify, take a single <code>route-fix</code> invocation, and run that — it'll be quick.</li>
  <li>You want behaviour-preserving restructure with test baseline — go straight to <code>/wf-quick refactor</code>.</li>
  <li>You're already in <code>/wf review</code>. The review stage runs the broader rubric across 31 dimensions; simplify is the focused 3-agent version for outside-of-workflow use.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="wf.html">/wf router</a> — the full alternative.</li>
  <li><a href="../how-to/start-workflow.html">Pick an entry point</a> — decision tree.</li>
  <li><a href="../tutorials/quick-fix-workflow.html">Quick-fix tutorial</a> — fix in practice.</li>
</ul>
</div>
""",
    ("reference/wf.html", "/wf router"),
    ("reference/wf-meta.html", "/wf-meta router"),
))


PAGES.append((
    "reference/wf-meta.html",
    "/wf-meta router — navigation and management in depth",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; /wf-meta router',
    """
<p>The navigation/management router. 11 sub-commands. None produce stage artifacts — they manage existing workflows or answer questions about them. <code>disable-model-invocation: true</code>, so you always invoke them explicitly.</p>

<div class="toc">
<h3>On this page</h3>
<ul>
  <li><a href="#next">/wf-meta next</a></li>
  <li><a href="#status">/wf-meta status</a></li>
  <li><a href="#resume">/wf-meta resume</a></li>
  <li><a href="#sync">/wf-meta sync</a></li>
  <li><a href="#amend">/wf-meta amend</a></li>
  <li><a href="#extend">/wf-meta extend</a></li>
  <li><a href="#skip">/wf-meta skip</a></li>
  <li><a href="#close">/wf-meta close</a></li>
  <li><a href="#how">/wf-meta how</a></li>
  <li><a href="#announce">/wf-meta announce</a></li>
  <li><a href="#init-ship-plan">/wf-meta init-ship-plan</a></li>
</ul>
</div>

<h2 id="next">/wf-meta next [slug]</h2>

<div class="summary"><table>
<tr><th>Reads</th><td><code>00-index.md</code> for the named slug (or active workflow)</td></tr>
<tr><th>Writes</th><td>Nothing — reports only</td></tr>
</table></div>

<p>Lightweight "what's next" lookup. Reads the index's <code>recommended-next-command</code> and <code>recommended-next-invocation</code> fields and reports them. Use when you know the workflow well and just want the next command.</p>

<h4>When to use</h4>
<ul>
  <li>You know which workflow you're in; you just forgot the next slash command.</li>
</ul>

<h4>When NOT to use</h4>
<ul>
  <li>You've been away for days and need full re-orientation — use <code>resume</code> instead.</li>
</ul>

<hr>

<h2 id="status">/wf-meta status [slug]</h2>

<div class="summary"><table>
<tr><th>Reads</th><td>Every <code>.ai/workflows/*/00-index.md</code> (or one if slug given)</td></tr>
<tr><th>Writes</th><td>Nothing</td></tr>
</table></div>

<p>Daily entry point. With no slug, lists every active workflow with current stage, slice status, blockers, recent activity. With a slug, shows the full progress map (10 stages × 5 states) + slice statuses + recent artifact writes.</p>

<h4>When to use</h4>
<ul>
  <li>Daily startup — "what's in flight?"</li>
  <li>Context-recovery — "what was I working on?"</li>
</ul>

<hr>

<h2 id="resume">/wf-meta resume [slug]</h2>

<div class="summary"><table>
<tr><th>Reads</th><td>Every artifact in the workflow</td></tr>
<tr><th>Writes</th><td>Optionally <code>90-resume.md</code> with the orientation summary</td></tr>
</table></div>

<p>Heavyweight re-orientation. Reads the full artifact trail, identifies the first unfinished step, proposes a concrete next invocation. Use after being away for hours, days, or weeks.</p>

<h4>What it computes</h4>
<ul>
  <li>Last completed stage</li>
  <li>Stages skipped (with reasons)</li>
  <li>Slices in-progress vs. complete</li>
  <li>Open questions in <code>po-answers.md</code></li>
  <li>Whether a paused ship run exists</li>
</ul>

<hr>

<h2 id="sync">/wf-meta sync [slug]</h2>

<div class="summary"><table>
<tr><th>Reads</th><td>Every file on disk under <code>.ai/workflows/&lt;slug&gt;/</code></td></tr>
<tr><th>Writes</th><td>Updated <code>00-index.md</code> + <code>00-sync.md</code> (report)</td></tr>
</table></div>

<p>Reconciles the control file with disk reality. Re-reads every artifact, detects drift (e.g., an artifact exists on disk but isn't in <code>workflow-files</code>), and rebuilds the index. Writes a sync report.</p>

<h4>When to use</h4>
<ul>
  <li>After pulling a branch that landed new artifacts.</li>
  <li>After manual edits to <code>00-index.md</code>.</li>
  <li>When status/resume produce unexpected output.</li>
</ul>

<h4>Anti-pattern</h4>
<p>Don't hand-edit <code>00-index.md</code> to "fix" status fields. Use sync instead — it reads ground truth from the artifacts on disk.</p>

<hr>

<h2 id="amend">/wf-meta amend &lt;scope&gt; [target]</h2>

<div class="summary"><table>
<tr><th>Scopes</th><td><code>&lt;slug&gt; from-review</code> · <code>&lt;slug&gt; from-retro</code> · <code>&lt;slug&gt; &lt;slice&gt;</code> · <code>ship-plan</code></td></tr>
<tr><th>Writes</th><td>Versioned amendment artifacts: <code>02-shape-amend-N.md</code>, <code>03-slice-&lt;slug&gt;-amend-N.md</code>, OR a block edit of <code>.ai/ship-plan.md</code></td></tr>
</table></div>

<p>Corrects a prior artifact's <em>definition</em> (spec, criteria, scope, approach) without overwriting completed work. Writes versioned amendment files. Never touches files with <code>status: complete</code>.</p>

<h4>Workflow modes</h4>
<table>
<thead><tr><th>Form</th><th>Effect</th></tr></thead>
<tbody>
<tr><td><code>amend &lt;slug&gt; from-review</code></td><td>Seeds amendment from <code>07-review-&lt;slice&gt;.md</code> findings flagged as spec errors.</td></tr>
<tr><td><code>amend &lt;slug&gt; from-retro</code></td><td>Seeds from <code>10-retro.md</code> items tagged as "scope was misunderstood" etc.</td></tr>
<tr><td><code>amend &lt;slug&gt; &lt;slice&gt;</code></td><td>Direct slice amendment — user describes the correction.</td></tr>
<tr><td><code>amend &lt;slug&gt;</code></td><td>General amendment — interview-driven discovery.</td></tr>
<tr><td><code>amend ship-plan</code></td><td>Edits one block (A–G) of <code>.ai/ship-plan.md</code>; bumps <code>plan-version</code>.</td></tr>
</tbody>
</table>

<h4>When to use vs. extend vs. implement reviews</h4>
<ul>
  <li><strong>amend</strong> — the spec was wrong.</li>
  <li><strong>extend</strong> — new scope appeared that doesn't fit existing slices.</li>
  <li><strong>implement reviews</strong> — the spec is fine, the implementation has a bug.</li>
</ul>

<hr>

<h2 id="extend">/wf-meta extend &lt;scope&gt; [target]</h2>

<div class="summary"><table>
<tr><th>Scopes</th><td><code>&lt;slug&gt; from-review</code> · <code>&lt;slug&gt; from-retro</code> · <code>&lt;slug&gt;</code></td></tr>
<tr><th>Writes</th><td>New per-slice files with <code>extension-round</code> in frontmatter</td></tr>
</table></div>

<p>Adds new slices to an existing workflow when review or retro reveals scope that fits the workflow but doesn't exist as a slice yet.</p>

<h4>What it preserves</h4>
<ul>
  <li>Existing slices' status (no change).</li>
  <li>The original shape — extends don't overwrite shape; if shape needs fixing, that's amend.</li>
</ul>

<hr>

<h2 id="skip">/wf-meta skip &lt;stage&gt; [slug]</h2>

<div class="summary"><table>
<tr><th>Writes</th><td>A stub artifact for the skipped stage (e.g., <code>06-verify-&lt;slice&gt;.md</code> with <code>status: skipped</code>)</td></tr>
</table></div>

<p>Marks a stage as skipped without running it. The stub artifact satisfies downstream prerequisite checks but records the skip reason. Use sparingly — every skip is accountability for what got bypassed.</p>

<h4>When to use</h4>
<ul>
  <li>Verify keeps finding flakes you don't want to chase right now — <code>skip verify</code> with a reason.</li>
  <li>Review skipped on a hotfix.</li>
</ul>

<h4>Anti-pattern</h4>
<p>Don't skip review on regular workflows. The whole point of review is catching what you missed.</p>

<hr>

<h2 id="close">/wf-meta close &lt;reason&gt; [slug]</h2>

<div class="summary"><table>
<tr><th>Reasons</th><td><code>shipped</code> · <code>abandoned</code> · <code>superseded</code> · <code>archived</code> · <code>stuck</code></td></tr>
<tr><th>Writes</th><td><code>99-close.md</code> with reason + rationale</td></tr>
</table></div>

<p>Archives a workflow at any stage. The workflow stops being "active" in status output but stays on disk as audit trail.</p>

<h4>Reason semantics</h4>
<table>
<thead><tr><th>Reason</th><th>Use when</th></tr></thead>
<tbody>
<tr><td><code>shipped</code></td><td>Most common. Work is shipped, retro done (or skipped intentionally).</td></tr>
<tr><td><code>abandoned</code></td><td>Decided not to do this work.</td></tr>
<tr><td><code>superseded</code></td><td>Rolled into another workflow that subsumed it.</td></tr>
<tr><td><code>archived</code></td><td>Complete + retired (e.g., the code path it shipped was later removed).</td></tr>
<tr><td><code>stuck</code></td><td>External blocker with no path forward (vendor outage, compliance hold).</td></tr>
</tbody>
</table>

<hr>

<h2 id="how">/wf-meta how &lt;mode&gt; &lt;topic&gt;</h2>

<div class="summary"><table>
<tr><th>Modes</th><td>5: quick · codebase · research · artifact-explain · findings-explain</td></tr>
<tr><th>Writes</th><td>Optional <code>90-how-&lt;topic&gt;.md</code> or <code>.ai/research/&lt;topic&gt;-&lt;ts&gt;.md</code></td></tr>
</table></div>

<p>Question-answering router. Five modes for different question shapes:</p>

<table>
<thead><tr><th>Mode</th><th>For</th></tr></thead>
<tbody>
<tr><td><strong>quick</strong> (default)</td><td>"What does X return when Y?" — short code answer.</td></tr>
<tr><td><strong>codebase</strong></td><td>"How does the auth middleware work?" — parallel Explore agents + synthesis.</td></tr>
<tr><td><strong>--research</strong></td><td>"State of the art in zero-downtime migrations" — 6–8 web agents, 200+ sources.</td></tr>
<tr><td><strong>artifact-explain</strong></td><td>"Explain &lt;slug&gt; plan in plain English" — translates an artifact.</td></tr>
<tr><td><strong>findings-explain</strong></td><td>"Explain review findings for &lt;slug&gt;" — same but for review/verify output.</td></tr>
</tbody>
</table>

<h4>When to use</h4>
<ul>
  <li>Before planning work in an unfamiliar subsystem — codebase mode.</li>
  <li>Stuck explaining what an artifact says — artifact-explain.</li>
  <li>Open architecture question — research mode.</li>
</ul>

<hr>

<h2 id="announce">/wf-meta announce [slug]</h2>

<div class="summary"><table>
<tr><th>Requires</th><td>A completed workflow (typically through retro or close)</td></tr>
<tr><th>Writes</th><td><code>announce.md</code> in the workflow directory</td></tr>
</table></div>

<p>Produces a Diátaxis-aligned external announcement. Reads handoff + ship-run + retro to extract the user-visible change, translates per External Output Boundary rules, and writes a copy-pasteable announcement for #releases / release-notes / blog.</p>

<hr>

<h2 id="init-ship-plan">/wf-meta init-ship-plan [--from-template &lt;kind&gt;]</h2>

<div class="summary"><table>
<tr><th>Templates</th><td><code>kotlin-maven-central</code>, <code>npm-public</code>, <code>pypi</code>, <code>container-image</code>, <code>server-deploy</code>, <code>library-internal</code></td></tr>
<tr><th>Writes</th><td><code>.ai/ship-plan.md</code> at repo root (project-level, NOT under <code>.ai/workflows/</code>)</td></tr>
<tr><th>Run frequency</th><td>Once per project. Use <code>amend ship-plan</code> to edit.</td></tr>
</table></div>

<p>One-time setup for the plan-driven ship stage. Loads the chosen template, asks 13 grouped questions covering blocks A–G, writes the plan.</p>

<h4>The 7 blocks</h4>
<table>
<thead><tr><th>Block</th><th>What</th></tr></thead>
<tbody>
<tr><td>A</td><td>Ship meaning + environments + cadence</td></tr>
<tr><td>B</td><td>Versioning contract (scheme, source-of-truth files, bump rule)</td></tr>
<tr><td>C</td><td>CI/CD contract (release trigger, workflow file, required secrets)</td></tr>
<tr><td>D</td><td>Post-publish verification checks</td></tr>
<tr><td>E</td><td>Rollout + rollback strategy</td></tr>
<tr><td>F</td><td>Recovery playbooks (grow over time)</td></tr>
<tr><td>G</td><td>Stakeholder + announcement channels</td></tr>
</tbody>
</table>

<p>See <a href="ship-plan-schema.html">Ship-plan schema</a> for every field; <a href="../how-to/author-ship-plan.html">Author a ship plan</a> for the walkthrough.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="wf.html">/wf router</a> — the lifecycle commands these manage.</li>
  <li><a href="../how-to/navigate-workflows.html">Navigate workflows</a> — using status/resume/next in practice.</li>
  <li><a href="../how-to/amend-or-extend.html">Amend or extend</a> — the decision rule between the two.</li>
</ul>
</div>
""",
    ("reference/wf-quick.html", "/wf-quick router"),
    ("reference/wf-docs.html", "/wf-docs router"),
))


PAGES.append((
    "reference/wf-docs.html",
    "/wf-docs router — documentation pipeline + Diátaxis primitives",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; /wf-docs router',
    """
<p>The documentation router. Two surfaces: a <strong>5-stage pipeline</strong> for project-wide doc audits, and <strong>7 Diátaxis primitives</strong> for single-document generation. Handoff also loads these primitives directly when generating per-feature docs.</p>

<div class="toc">
<h3>On this page</h3>
<ul>
  <li><a href="#pipeline">The 5-stage pipeline</a> — discover, audit, plan, generate, review</li>
  <li><a href="#primitives">The 7 Diátaxis primitives</a> — plan, tutorial, how-to, reference, explanation, readme, review</li>
</ul>
</div>

<h2 id="pipeline">The 5-stage doc pipeline</h2>

<p>For a full project-wide doc cycle. Each stage writes to <code>.ai/docs/&lt;run-id&gt;/</code>.</p>

<h3>/wf-docs discover</h3>
<div class="summary"><table>
<tr><th>Stage</th><td>1 — inventory</td></tr>
<tr><th>Writes</th><td><code>.ai/docs/&lt;run-id&gt;/discover.md</code></td></tr>
</table></div>
<p>Walks the repo, inventories every existing doc file (README, docs/, in-code docstrings, comments in config files), records frontmatter, classifies by Diátaxis quadrant, captures last-modified date.</p>

<h3>/wf-docs audit</h3>
<div class="summary"><table>
<tr><th>Stage</th><td>2 — accuracy + freshness + quadrant fit</td></tr>
<tr><th>Writes</th><td><code>.ai/docs/&lt;run-id&gt;/audit.md</code></td></tr>
</table></div>
<p>For each inventoried doc: checks accuracy against current code, flags freshness (last-modified vs. relevant code change), and judges quadrant fit (e.g., this "tutorial" is actually a reference page in disguise).</p>

<h3>/wf-docs plan</h3>
<div class="summary"><table>
<tr><th>Stage</th><td>3 — prioritized action plan</td></tr>
<tr><th>Writes</th><td><code>.ai/docs/&lt;run-id&gt;/plan.md</code></td></tr>
</table></div>
<p>Translates audit into actions: create / update / rewrite / delete per doc, prioritized P0–P3. P0 = factually wrong + actively used. P3 = quadrant fit issue with no urgency.</p>

<h3>/wf-docs generate</h3>
<div class="summary"><table>
<tr><th>Stage</th><td>4 — write the docs</td></tr>
<tr><th>Writes</th><td><code>.ai/docs/&lt;run-id&gt;/generate.md</code> + actual doc files in the repo</td></tr>
</table></div>
<p>Executes the plan. For each doc to write, loads the matching Diátaxis primitive and follows it verbatim. The primitive enforces the quadrant's rules (e.g., "tutorial steps are imperative with stated outcomes").</p>

<h3>/wf-docs review</h3>
<div class="summary"><table>
<tr><th>Stage</th><td>5 — independent review of the generated docs</td></tr>
<tr><th>Writes</th><td>Updates to <code>generate.md</code></td></tr>
</table></div>
<p>An independent sub-agent reviews each generated doc against its Diátaxis primitive's self-check. Flags mixed-quadrant content, missing pre-conditions, prose-pseudocode, etc.</p>

<hr>

<h2 id="primitives">The 7 Diátaxis primitives</h2>

<p>Single-document generation. Each primitive is a reference body at <code>skills/wf-docs/reference/&lt;type&gt;.md</code>. Loaded by:</p>
<ul>
  <li>Handoff (Stage 8) when generating per-feature docs from a workflow's docs plan.</li>
  <li><code>/wf-docs &lt;primitive&gt;</code> for one-off generation.</li>
  <li><code>/wf-docs generate</code> (pipeline stage 4) when executing audit-driven actions.</li>
</ul>

<h3>plan</h3>
<p>The docs-planning primitive. Takes a feature context + audience and outputs a Diátaxis plan: which quadrants are needed, what each should cover, where each lives.</p>
<p>Loaded when shape's docs-plan needs detail beyond the shape file.</p>

<h3>tutorial</h3>
<p>Learning-oriented. Imperative voice. Pre-conditions stated up front. Every step has an expected observable outcome ("you should see…"). One worked example end-to-end. Anti-patterns: optional digressions, mixing in reference detail.</p>

<h3>how-to</h3>
<p>Task-oriented. Numbered steps. Pre-conditions + goal stated up front. Variations as separate steps, not branches inside a step. Anti-patterns: explaining concepts ("how does X work"), mixing in tutorial scaffolding.</p>

<h3>reference</h3>
<p>Information-oriented. Alphabetised within sections. Exhaustive. No opinions. Frontmatter-style summary tables. Anti-patterns: narrative ordering, "first do X then Y" prose.</p>

<h3>explanation</h3>
<p>Understanding-oriented. Discursive prose. Trade-offs, history, comparison with alternatives. May reference how-to and reference but doesn't substitute for them. Anti-patterns: imperative steps, exhaustive lookup tables.</p>

<h3>readme</h3>
<p>Composite — a single README mixes all four quadrants intentionally, but each section is one quadrant. Structure: brief intro (explanation), quick start (tutorial), common tasks (how-to), API summary (reference), and explicit pointers to deeper docs.</p>

<h3>review</h3>
<p>Quality-check primitive. Reads a doc + identifies its declared quadrant, then checks the body against that quadrant's rules. Outputs P0–P3 findings.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../explanation/diataxis-integration.html">Diátaxis integration</a> — how the plugin applies the framework.</li>
  <li><a href="wf.html#wf-handoff">/wf handoff</a> — handoff loads these primitives during T3 doc generation.</li>
  <li><a href="../how-to/start-workflow.html">Pick an entry point</a> — when to run the doc pipeline standalone vs. via handoff.</li>
</ul>
</div>
""",
    ("reference/wf-meta.html", "/wf-meta router"),
    ("reference/review.html", "/review router"),
))


PAGES.append((
    "reference/review.html",
    "/review router — 31 dimensions and 7 sweeps",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; /review router',
    """
<p>The code-review router. Two modes: <strong>single-dimension</strong> (<code>/review &lt;dim&gt; [target]</code>) runs one reviewer inline against a broad rubric, and <strong>sweep</strong> (<code>/review sweep &lt;aggregate&gt; [target]</code>) dispatches one sub-agent per dimension in the aggregate's composition, collecting findings in parallel.</p>

<p>Three names overlap (<code>architecture</code>, <code>infra</code>, <code>security</code>) — the dimension wins on a bare invocation; the sweep needs the literal <code>sweep</code> keyword.</p>

<div class="toc">
<h3>On this page</h3>
<ul>
  <li><a href="#how-it-works">How dispatch works</a></li>
  <li><a href="#sweeps">The 7 sweeps</a></li>
  <li><a href="#dimensions">The 31 dimensions — by category</a></li>
  <li><a href="#integration">Integration with /wf review</a></li>
</ul>
</div>

<h2 id="how-it-works">How dispatch works</h2>

<table>
<thead><tr><th>Mode</th><th>Form</th><th>Cost</th><th>Use when</th></tr></thead>
<tbody>
<tr><td>Single dimension</td><td><code>/review correctness</code> · <code>/review security ./src/auth.ts</code></td><td>One sub-agent</td><td>You know which axis to investigate.</td></tr>
<tr><td>Sweep</td><td><code>/review sweep all</code> · <code>/review sweep pre-merge worktree</code></td><td>N sub-agents in parallel</td><td>You want defensive breadth.</td></tr>
</tbody>
</table>

<p>Sub-agents dispatch in a single message (parallel). Sequential dispatch defeats the purpose of sweep mode and the router enforces parallelism.</p>

<h4>Target argument</h4>
<p>Optional. If omitted, the reviewer scopes to the current diff (HEAD vs base). Accepts: a file path, a directory, a PR number (<code>#123</code>), the literal <code>worktree</code> (uncommitted changes), or <code>repo</code> (everything).</p>

<h4>Severity routing</h4>
<table>
<tr><th>BLOCKER</th><td>Correctness, security, data loss, crash. Routes back to <code>/wf implement &lt;slug&gt; &lt;slice&gt; reviews</code>.</td></tr>
<tr><th>HIGH</th><td>Should fix; might ship with caveats. Same routing or carry as caveat.</td></tr>
<tr><th>MED / LOW / NIT</th><td>Style, naming, nit-with-merit. Ship.</td></tr>
</table>

<hr>

<h2 id="sweeps">The 7 sweeps</h2>

<table class="no-mobile-scroll">
<thead><tr><th>Sweep</th><th>Composition</th><th>When</th></tr></thead>
<tbody>
<tr><td><code>all</code></td><td>All 31 dimensions</td><td>Pre-major-release defensive review. Most expensive.</td></tr>
<tr><td><code>pre-merge</code></td><td>correctness, security, testing, performance, observability, refactor-safety, docs, ci</td><td>Standard pre-merge gate.</td></tr>
<tr><td><code>quick</code></td><td>correctness, testing, style-consistency</td><td>Smoke check before opening a PR.</td></tr>
<tr><td><code>security</code></td><td>security, infra-security, supply-chain, privacy, data-integrity</td><td>Security-focused review.</td></tr>
<tr><td><code>architecture</code></td><td>architecture, scalability, reliability, maintainability, overengineering, refactor-safety</td><td>Architecture review.</td></tr>
<tr><td><code>infra</code></td><td>infra, infra-security, ci, release, observability, cost</td><td>Infrastructure/devops change review.</td></tr>
<tr><td><code>ux</code></td><td>accessibility, frontend-accessibility, ux-copy, frontend-performance</td><td>UI feature review.</td></tr>
</tbody>
</table>

<hr>

<h2 id="dimensions">The 31 dimensions — by category</h2>

<h3>Correctness & data</h3>
<table>
<tr><th><code>correctness</code></th><td>Logic bugs, off-by-one, missing edge cases, error handling, return values.</td></tr>
<tr><th><code>data-integrity</code></th><td>Schema constraints, foreign keys, transactions, unique violations, race conditions on writes.</td></tr>
<tr><th><code>migrations</code></th><td>Forward + reverse SQL migrations, data backfills, deployment ordering, idempotency.</td></tr>
<tr><th><code>api-contracts</code></th><td>Breaking changes in public APIs, missing version bumps, deprecation handling.</td></tr>
</table>

<h3>Security & privacy</h3>
<table>
<tr><th><code>security</code></th><td>Auth/authz, input validation, secrets handling, SQL injection, XSS, CSRF.</td></tr>
<tr><th><code>infra-security</code></th><td>IAM policies, network policies, secret storage, container security.</td></tr>
<tr><th><code>supply-chain</code></th><td>Dependency risk, lock-file integrity, registry sources, build provenance.</td></tr>
<tr><th><code>privacy</code></th><td>PII handling, GDPR/CCPA, data retention, telemetry boundaries.</td></tr>
</table>

<h3>Performance & cost</h3>
<table>
<tr><th><code>performance</code></th><td>Algorithmic complexity, query efficiency, hot paths, allocations.</td></tr>
<tr><th><code>frontend-performance</code></th><td>Bundle size, render cost, layout thrash, image optimization.</td></tr>
<tr><th><code>scalability</code></th><td>Behavior under load, fan-out, contention, caching shape.</td></tr>
<tr><th><code>cost</code></th><td>Cloud-spend implications, query cost, storage growth.</td></tr>
</table>

<h3>Reliability & ops</h3>
<table>
<tr><th><code>reliability</code></th><td>Failure modes, retries, timeouts, circuit breakers, degraded paths.</td></tr>
<tr><th><code>observability</code></th><td>Logs, metrics, traces — are the signals there?</td></tr>
<tr><th><code>logging</code></th><td>Log shape, levels, correlation IDs, log volume.</td></tr>
<tr><th><code>backend-concurrency</code></th><td>Races, deadlocks, mutex shape, atomicity boundaries.</td></tr>
</table>

<h3>Infrastructure & release</h3>
<table>
<tr><th><code>infra</code></th><td>Terraform, K8s manifests, deployment topology, environment parity.</td></tr>
<tr><th><code>ci</code></th><td>Pipeline correctness, cache shape, parallelism, flakes.</td></tr>
<tr><th><code>release</code></th><td>Versioning, changelog, rollback path, feature-flag wiring.</td></tr>
</table>

<h3>Architecture & maintenance</h3>
<table>
<tr><th><code>architecture</code></th><td>Module boundaries, layering, coupling, dependency direction.</td></tr>
<tr><th><code>maintainability</code></th><td>Code clarity, naming, function shape, comment quality.</td></tr>
<tr><th><code>overengineering</code></th><td>Speculative abstractions, premature interfaces, unused flexibility.</td></tr>
<tr><th><code>refactor-safety</code></th><td>For refactor PRs: behavior preserved, tests covering parity.</td></tr>
<tr><th><code>code-simplification</code></th><td>Specific opportunities to remove code without losing function.</td></tr>
<tr><th><code>style-consistency</code></th><td>Matches existing project conventions (not a generic style guide).</td></tr>
</table>

<h3>UX & accessibility</h3>
<table>
<tr><th><code>accessibility</code></th><td>WCAG compliance, semantic HTML, keyboard nav, screen-reader support.</td></tr>
<tr><th><code>frontend-accessibility</code></th><td>Component-level a11y, focus management, ARIA, color contrast.</td></tr>
<tr><th><code>ux-copy</code></th><td>UX writing — labels, errors, empty states, microcopy clarity.</td></tr>
</table>

<h3>Testing & docs</h3>
<table>
<tr><th><code>testing</code></th><td>Coverage, test shape, fixture quality, integration vs unit balance.</td></tr>
<tr><th><code>docs</code></th><td>Docs accuracy, Diátaxis fit, what's missing.</td></tr>
<tr><th><code>dx</code></th><td>Developer experience — error messages, debuggability, onboarding pain.</td></tr>
</table>

<hr>

<h2 id="integration">Integration with /wf review</h2>

<p><code>/wf review &lt;slug&gt; &lt;slice&gt;</code> uses this router under the hood. The lifecycle review:</p>

<ol>
  <li>Reads shape + slice + plan + implement to understand <em>what the feature does</em>.</li>
  <li>Reasons about which review dimensions matter (not keyword-driven — feature-driven).</li>
  <li>Dispatches one sub-agent per chosen dimension in parallel.</li>
  <li>Each writes to <code>07-review-&lt;slice&gt;-&lt;dimension&gt;.md</code>.</li>
  <li>The orchestrator aggregates, deduplicates by file:line and root cause, triages with the user.</li>
  <li>Writes master <code>07-review-&lt;slice&gt;.md</code> with verdict.</li>
</ol>

<p>You can also use <code>/review</code> standalone — when you want to spot-check a specific file outside a workflow, or run a sweep on a long-lived branch.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="wf.html#wf-review">/wf review stage</a> — using these dimensions inside a workflow.</li>
  <li><a href="wf.html#wf-implement">/wf implement reviews</a> — applying review findings.</li>
  <li><a href="../how-to/triage-pr-comments.html">Triage PR comments</a> — handoff's bot-comment loop, similar dispatch model.</li>
</ul>
</div>
""",
    ("reference/wf-docs.html", "/wf-docs router"),
    ("reference/wf-design.html", "/wf-design router"),
))


PAGES.append((
    "reference/artifacts.html",
    "Artifacts reference",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Artifacts',
    """
<p>Every artifact file the plugin writes. Listed in the order they appear in a workflow.</p>

<h2>Workflow directory tree</h2>

<pre><code>.ai/
├── ship-plan.md                         # Project-level. Authored once via /wf-meta init-ship-plan.
├── workflows/&lt;slug&gt;/
│   ├── 00-index.md                      # Control file (pure YAML frontmatter, no body)
│   ├── 00-sync.md                       # Written by /wf-meta sync if run
│   ├── 01-intake.md                     # Initial requirements
│   ├── 02-shape.md                      # Deep spec + docs plan
│   ├── 02b-design.md                    # Design brief (UX register, anti-goals) — /wf-design &lt;slug&gt; shape
│   ├── 02c-craft.md                     # Visual contract (NOT code) — /wf-design &lt;slug&gt; craft
│   ├── 02-shape-amend-N.md              # Written by /wf-meta amend
│   ├── 03-slice.md                      # Master slice index
│   ├── 03-slice-&lt;slug&gt;.md               # Per-slice definition
│   ├── 03-slice-&lt;slug&gt;-amend-N.md       # Per-slice amendment
│   ├── 04-plan.md                       # Plan master index (multi-slice workflows)
│   ├── 04-plan-&lt;slug&gt;.md                # Per-slice plan
│   ├── 04b-instrument-&lt;slug&gt;.md         # Optional — observability augmentation
│   ├── 04c-experiment-&lt;slug&gt;.md         # Optional — experiment augmentation
│   ├── 05-implement.md                  # Master index
│   ├── 05-implement-&lt;slug&gt;.md           # Per-slice implement record
│   ├── 05c-benchmark-&lt;slug&gt;.md          # Optional — perf augmentation
│   ├── 06-verify.md                     # Master index
│   ├── 06-verify-&lt;slug&gt;.md              # Per-slice verification
│   ├── 07-review-&lt;slug&gt;.md              # Per-slice master review
│   ├── 07-review-&lt;slug&gt;-&lt;cmd&gt;.md        # Per-slice per-dimension findings
│   ├── 07-design-audit.md               # /wf-design &lt;slug&gt; audit — accessibility/perf/theming/responsive
│   ├── 07-design-critique.md            # /wf-design &lt;slug&gt; critique — UX critique
│   ├── 08-handoff.md                    # Aggregated handoff + PR-readiness block
│   ├── 09-ship-run-&lt;run-id&gt;.md          # Per-release artifact
│   ├── 09-ship-runs.md                  # Per-workflow run index
│   ├── 10-retro.md                      # Lessons learned
│   ├── 99-close.md                      # Written by /wf-meta close
│   ├── 90-next.md / 90-resume.md        # Optional helpers
│   ├── 90-how-&lt;topic&gt;.md                # Written by /wf-meta how
│   ├── design-notes/                    # /wf-design transformation + extract operators
│   │   ├── animate-&lt;ts&gt;.md              # one file per transformation (animate, bolder, clarify, …)
│   │   ├── extract-&lt;ts&gt;.md              # read-only inspection / token + component extraction
│   │   └── &lt;sub&gt;-&lt;ts&gt;.md                # 15 transformation operators total
│   └── po-answers.md                    # Cumulative product-owner answers log
├── ideation/&lt;focus&gt;-&lt;ts&gt;.md             # /wf-quick ideate output
├── research/&lt;topic&gt;-&lt;ts&gt;.md             # /wf-meta how (research mode)
├── simplify/&lt;run-id&gt;.md                 # /wf-quick simplify run (branch/commit/plan/codebase)
├── dep-updates/&lt;run-id&gt;/                # /wf-quick update-deps tree
└── docs/&lt;run-id&gt;/                       # /wf-docs pipeline tree

# Project-level design context (authored by /wf-design setup)
PRODUCT.md                               # Product/brand context (audience, voice, register)
DESIGN.md                                # Design system context (tokens, components, patterns)
</code></pre>

<h2>Shared frontmatter contract</h2>

<p>Every artifact file's first lines are YAML frontmatter between <code>---</code> markers, containing at minimum:</p>

<table>
<tr><th><code>schema</code></th><td>Always <code>sdlc/v1</code>.</td></tr>
<tr><th><code>type</code></th><td>One of: <code>index</code>, <code>intake</code>, <code>shape</code>, <code>slice</code>, <code>plan</code>, <code>implement</code>, <code>verify</code>, <code>review</code>, <code>handoff</code>, <code>ship</code>, <code>ship-run</code>, <code>ship-runs-index</code>, <code>ship-plan</code>, <code>retro</code>, <code>design</code>, <code>design-brief</code>, <code>critique</code>, <code>audit</code>, <code>sync-report</code>, <code>resume</code>, <code>skip</code>, <code>amendment</code>.</td></tr>
<tr><th><code>slug</code></th><td>Must match the directory name (slug stability invariant; enforced by the validator).</td></tr>
</table>

<p>Stage files additionally have <code>stage-number</code>, <code>status</code>, <code>created-at</code>, <code>updated-at</code>. See the per-schema reference pages for each artifact's full field set.</p>
""",
    ("reference/wf-design.html", "Design pipeline"),
    ("reference/00-index-schema.html", "00-index schema"),
))


PAGES.append((
    "reference/00-index-schema.html",
    "00-index.md schema",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; 00-index schema',
    """
<p>The control file. Pure YAML frontmatter, no markdown body. Every stage reads it; every stage that completes updates it.</p>

<h2>Required fields</h2>

<table>
<thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>schema</code></td><td>literal</td><td><code>sdlc/v1</code></td></tr>
<tr><td><code>type</code></td><td>literal</td><td><code>index</code></td></tr>
<tr><td><code>slug</code></td><td>string</td><td>Stable identifier; matches directory name.</td></tr>
<tr><td><code>title</code></td><td>string</td><td>Human-readable task name.</td></tr>
<tr><td><code>status</code></td><td>enum</td><td><code>active</code> / <code>complete</code> / <code>blocked</code> / <code>abandoned</code></td></tr>
<tr><td><code>current-stage</code></td><td>string</td><td>Most recently started stage name.</td></tr>
<tr><td><code>stage-number</code></td><td>number</td><td>1–10.</td></tr>
<tr><td><code>updated-at</code></td><td>ISO 8601</td><td>Real timestamp from <code>date -u</code>.</td></tr>
<tr><td><code>selected-slice-or-focus</code></td><td>string</td><td>Currently active slice slug.</td></tr>
<tr><td><code>open-questions</code></td><td>array</td><td>Unanswered questions blocking progress.</td></tr>
<tr><td><code>next-command</code></td><td>string</td><td>Command name (e.g., <code>wf-shape</code>).</td></tr>
<tr><td><code>next-invocation</code></td><td>string</td><td>Full slash command, ready to copy.</td></tr>
<tr><td><code>workflow-files</code></td><td>array</td><td>All artifacts written so far.</td></tr>
<tr><td><code>progress</code></td><td>map</td><td>10 stage names → <code>not-started</code> / <code>in-progress</code> / <code>complete</code> / <code>skipped</code> / <code>blocked</code></td></tr>
<tr><td><code>slices</code></td><td>array</td><td>Per-slice summary objects (slug, status, complexity, depends-on).</td></tr>
<tr><td><code>branch-strategy</code></td><td>enum</td><td><code>dedicated</code> / <code>shared</code> / <code>none</code></td></tr>
<tr><td><code>branch</code></td><td>string</td><td>Feature branch name (default <code>feat/&lt;slug&gt;</code>).</td></tr>
<tr><td><code>base-branch</code></td><td>string</td><td>Branch to merge back into.</td></tr>
</tbody>
</table>

<h2>Optional fields (set as stages run)</h2>

<table>
<tr><th><code>pr-url</code></th><td>Set by handoff.</td></tr>
<tr><th><code>pr-number</code></th><td>Set by handoff.</td></tr>
<tr><th><code>augmentations</code></th><td>Array of <code>{ kind, slice, ref, registered-at }</code> objects.</td></tr>
<tr><th><code>workflow-type</code></th><td>For compressed flows: <code>quick</code>, <code>rca</code>, <code>investigate</code>, <code>hotfix</code>, <code>refactor</code>, <code>update-deps</code>, <code>discover</code>, <code>ideate</code>.</td></tr>
</table>

<h2>v9.5.0 PR-readiness config keys</h2>

<p>Optional. Drive the handoff PR-readiness block. Each block is independent — handoff skips the corresponding step silently if the key is absent.</p>

<pre><code>public-surface:
  kind: kotlin-api | openapi | graphql-schema | typescript-dts | sql-ddl
  regen-cmd: "command that regenerates the surface mirror"
  files:
    - path/to/surface/mirror

docs-mirror:
  regen-cmd: "command that regenerates doc mirrors"
  source-paths: ["glob of doc sources"]
  mirror-paths: ["glob of generated mirrors"]

review-bots:
  - coderabbitai
  - greptile-dev
  - gemini-code-assist
  - "chatgpt-codex-connector[bot]"</code></pre>
""",
    ("reference/artifacts.html", "Artifacts"),
    ("reference/ship-plan-schema.html", "Ship-plan schema"),
))


PAGES.append((
    "reference/ship-plan-schema.html",
    "Ship-plan schema (.ai/ship-plan.md)",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Ship-plan schema',
    """
<p>The project-level ship contract. One per repo. Authored via <code>/wf-meta init-ship-plan</code>. Lives at <code>.ai/ship-plan.md</code> (repo root, NOT under <code>.ai/workflows/</code>).</p>

<p>The schema is split into a <strong>required core</strong> (Blocks A–G — fixed field names that <code>/wf ship</code> reads) and <strong>open extensions</strong> (<code>additional-contracts[]</code> — a typed list of project-specific contracts that <code>/wf ship</code> ignores unless a consumer opts in by <code>id</code>). The <code>template-hint</code> field records which <code>--from-template &lt;kind&gt;</code> seed (if any) biased the authoring conversation; it is informational only.</p>

<h2>Block A — Ship meaning + environments + cadence</h2>
<pre><code>ship-meaning: publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip
ship-environments:
  - { name: staging, auto-promote: false }
  - { name: production, auto-promote: false }
ship-cadence: on-demand | per-merge | weekly | release-train</code></pre>

<h2>Block B — Versioning contract</h2>
<pre><code>version-scheme: semver | calver | sequential | none
version-source-of-truth:
  - { path: package.json,   field: version }
  - { path: pyproject.toml, field: project.version }
version-bump-rule: git-cliff | conventional-commits | manual | fixed
version-bump-cmd: "command"
prerelease-suffix: none | -SNAPSHOT | -alpha | -beta | -rc
post-release-version: next-snapshot | next-dev | none
post-release-version-cmd: "command or empty"</code></pre>

<h2>Block C — CI/CD contract</h2>
<pre><code>ci-pipeline:
  pre-merge-checks: [build, test, lint, ...]
  release-trigger: tag-on-main | merge-to-main | manual-dispatch | branch-push
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [validate, build, publish]
  publish-dry-run-cmd: "./gradlew publishToMavenLocal"
  publish-cmd: "./gradlew publishAndReleaseToMavenCentral"
  required-secrets:
    - { name: "SECRET_NAME", purpose: "short description" }
  secrets-staleness-threshold-days: 90</code></pre>

<h2>Block D — Post-publish verification</h2>
<pre><code>post-publish-checks:
  - { kind: registry-api,   cmd: "...", expect: "..." }
  - { kind: fresh-resolve,  cmd: "...", expect: "..." }
  - { kind: github-release, cmd: "...", expect: "..." }
  - { kind: smoke-test,     cmd: "...", expect: "..." }
  - { kind: k8s-rollout-status, cmd: "kubectl rollout status ...", expect: "..." }
propagation-window-min-minutes: 5
propagation-window-max-minutes: 30
poll-interval-seconds: 60</code></pre>

<h2>Block E — Rollout + rollback</h2>
<pre><code>rollout-strategy: immediate | staged | canary | feature-flag
rollout-stages: ["10%", "50%", "100%"]   # only when staged/canary
rollback-mechanism: git-revert | gh-release-yank | feature-flag-off | blue-green-switch | redeploy-prior
rollback-time-estimate-min: 5
db-migrations-reversible: true | false | n/a</code></pre>

<h2>Block F — Recovery playbooks</h2>
<pre><code>recovery-playbooks:
  - id: signing-failure
    triggers: ["gpg signing failed", "InvalidSignatureException"]
    steps:
      - "Re-export key: gpg --export-secret-keys --armor ..."
      - "Re-upload: gh secret set SIGNING_KEY ..."
      - "Re-run failed workflow: gh run rerun $RUN_ID"</code></pre>
<p>Empty for new plans. Grows over time as runs hit new failure modes and the user amends the plan.</p>

<h2>Block G — Stakeholder + announcement</h2>
<pre><code>announcement:
  channels: ["#releases", "release-notes@example.com"]
  template-path: ".ai/release-announcement-template.md"</code></pre>

<h2>Extensions — additional-contracts[]</h2>
<pre><code>additional-contracts:
  - id: data-migration
    purpose: "Liquibase migrations must be reviewed by DBA before any release"
    fields:
      tool: liquibase
      reversibility-policy: forward-only
      dba-review-required: true
    enforced-by: "Pull request label + /wf ship pre-merge check"
  - id: feature-flag-rollout
    purpose: "All user-facing changes go behind a LaunchDarkly flag"
    fields:
      provider: launchdarkly
      flag-naming-convention: "release.<slug>"
      cleanup-policy: "remove after 30 days at 100%"
    enforced-by: "Code review checklist"</code></pre>
<p>Open schema. Each entry is <code>{ id, purpose, fields: { ... }, enforced-by: "..." }</code>. <code>/wf ship</code> does not read this list; consumers (custom hooks, downstream commands) opt in by <code>id</code>. Authored during <code>/wf-meta init-ship-plan</code> Step 3; amendable via <code>/wf-meta amend ship-plan</code> by passing the <code>id</code> at the "Other" prompt.</p>

<h2>Template-hint field</h2>
<p><code>template-hint</code> records the <code>--from-template &lt;kind&gt;</code> seed (if any) that biased the authoring conversation: <code>kotlin-maven-central</code>, <code>npm-public</code>, <code>pypi</code>, <code>container-image</code>, <code>server-deploy</code>, <code>library-internal</code>, or <code>none</code>. Informational only — no downstream code reads it. Useful for retro analysis ("which template best matched this project's eventual plan?") and for telling later amend conversations which seed values to compare against.</p>

<h2>Plan-version field</h2>
<p><code>plan-version</code> starts at 1 and bumps by 1 every time <code>/wf-meta amend ship-plan</code> writes a change. Runs record <code>plan-version-at-run</code> for retro analysis.</p>
""",
    ("reference/00-index-schema.html", "00-index schema"),
    ("reference/08-handoff-schema.html", "Handoff schema"),
))


PAGES.append((
    "reference/08-handoff-schema.html",
    "Handoff schema (08-handoff.md)",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Handoff schema',
    """
<p>The handoff artifact. Aggregates all complete slices. Writes the PR. Gates ship via <code>readiness-verdict</code>.</p>

<h2>Frontmatter — base fields</h2>
<pre><code>schema: sdlc/v1
type: handoff
slug: &lt;slug&gt;
slice-slugs: [&lt;slug-1&gt;, ...]
handoff-mode: aggregate | single-slice
status: complete
stage-number: 8
created-at: &lt;ISO 8601&gt;
updated-at: &lt;ISO 8601&gt;
pr-title: "&lt;PR title&gt;"
pr-url: "&lt;url or empty&gt;"
pr-number: &lt;N or 0&gt;
branch: "&lt;branch&gt;"
base-branch: "&lt;target&gt;"
has-migration: true | false
has-config-change: true | false
has-docs-changes: true | false
docs-generated: [&lt;paths&gt;]</code></pre>

<h2>v9.5.0 PR-readiness block fields</h2>

<table>
<thead><tr><th>Field</th><th>Values</th><th>From step</th></tr></thead>
<tbody>
<tr><td><code>commitlint-status</code></td><td>pass | warn | fail | skipped</td><td>T3.5</td></tr>
<tr><td><code>public-surface-drift</code></td><td>none | regenerated | drift-without-regen | skipped</td><td>T3.6</td></tr>
<tr><td><code>docs-mirror-status</code></td><td>up-to-date | regenerated | skipped</td><td>T3.7</td></tr>
<tr><td><code>triage-iterations</code></td><td>integer 0-5</td><td>T5.1</td></tr>
<tr><td><code>triage-fixes-applied</code></td><td>integer</td><td>T5.1</td></tr>
<tr><td><code>triage-fixes-skipped</code></td><td>integer</td><td>T5.1</td></tr>
<tr><td><code>triage-deferred-thread-ids</code></td><td>array of threadId strings</td><td>T5.1</td></tr>
<tr><td><code>has-deferred-comments</code></td><td>true | false</td><td>T5.1</td></tr>
<tr><td><code>rebase-status</code></td><td>fast-forward | rebased-clean | conflicts | lease-failure | skipped</td><td>T5.2</td></tr>
<tr><td><code>rebase-onto-sha</code></td><td>sha of base at rebase time</td><td>T5.2</td></tr>
<tr><td><code>live-review-decision</code></td><td>APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null</td><td>T5.3</td></tr>
<tr><td><code>live-checks-failing</code></td><td>array of check names</td><td>T5.3</td></tr>
<tr><td><code>live-checks-pending</code></td><td>array of check names</td><td>T5.3</td></tr>
<tr><td><code>readiness-verdict</code></td><td><strong>ready | awaiting-input | blocked</strong></td><td>computed</td></tr>
</tbody>
</table>

<h2>Verdict computation</h2>

<p><code>readiness-verdict: ready</code> requires ALL of:</p>
<ul>
  <li><code>live-review-decision</code> ∈ {<code>APPROVED</code>, <code>null</code>}</li>
  <li><code>live-checks-failing</code> is empty</li>
  <li><code>commitlint-status</code> ≠ <code>fail</code></li>
  <li><code>public-surface-drift</code> ≠ <code>drift-without-regen</code></li>
  <li><code>rebase-status</code> ∈ {<code>fast-forward</code>, <code>rebased-clean</code>, <code>skipped</code>}</li>
  <li><code>has-deferred-comments</code> = false</li>
</ul>

<p><code>blocked</code> when any of those hard-fail. <code>awaiting-input</code> for the soft fails (pending checks, deferred suggestions, required reviewers haven't responded).</p>
""",
    ("reference/ship-plan-schema.html", "Ship-plan schema"),
    ("reference/09-ship-run-schema.html", "Ship-run schema"),
))


PAGES.append((
    "reference/09-ship-run-schema.html",
    "Ship-run schema (09-ship-run-&lt;run-id&gt;.md)",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Ship-run schema',
    """
<p>Per-release artifact. One file per ship run. Accumulating (never overwritten).</p>

<h2>Frontmatter</h2>
<pre><code>schema: sdlc/v1
type: ship-run
slug: &lt;slug&gt;
run-id: "&lt;YYYYMMDDTHHMMZ&gt;"       # UTC compact ISO-8601
status: complete | awaiting-input | failed | rolled-back
plan-ref: ../../ship-plan.md
plan-version-at-run: 1
created-at: &lt;ISO&gt;
updated-at: &lt;ISO&gt;

# Per-run inputs
environment: &lt;env name&gt;
version: "&lt;chosen version&gt;"
prior-version: "&lt;last release tag&gt;"
go-nogo: go | conditional-go | no-go
merge-strategy: rebase | squash | merge | none

# Per-run evidence (set as steps complete; absent = not yet run)
head-sha-at-start: "&lt;sha&gt;"
pre-flight-status: pass | warn | fail
publish-dry-run-passed: true | false | skipped
merge-sha: "&lt;sha or empty&gt;"
release-tag: "&lt;vX.Y.Z or empty&gt;"
release-workflow-run-id: "&lt;gh run id or empty&gt;"
release-workflow-conclusion: success | failure | cancelled | empty
post-publish-checks:
  - { kind: &lt;kind&gt;, status: pass | fail | pending, observed-at: &lt;iso&gt;, evidence: "..." }
post-release-bump-sha: "&lt;sha or empty&gt;"

# Per-run outcomes
recovery-actions-taken: [&lt;playbook-id&gt;, ...]
rolled-back: true | false
rollback-sha: "&lt;sha or empty&gt;"
rollback-reason: ""
announcements-sent: [&lt;channel&gt;, ...]</code></pre>

<h2>Status state machine</h2>

<table>
<tr><th><code>complete</code></th><td>Every step finished. <code>go-nogo</code> can still be <code>no-go</code> (it stopped after step 5 by user choice).</td></tr>
<tr><th><code>awaiting-input</code></th><td>A step paused. Re-running ship offers to resume.</td></tr>
<tr><th><code>failed</code></th><td>A recovery playbook ran but didn't restore success; user marked the run failed.</td></tr>
<tr><th><code>rolled-back</code></th><td>The release was published but later rolled back. <code>rollback-sha</code> + <code>rollback-reason</code> populated.</td></tr>
</table>

<h2>Run index (09-ship-runs.md)</h2>

<pre><code>schema: sdlc/v1
type: ship-runs-index
slug: &lt;slug&gt;
updated-at: &lt;iso&gt;
runs:
  - { run-id, version, environment, status, go-nogo, notes }</code></pre>

<p>The markdown body is a table regenerated from the <code>runs:</code> array on every ship run.</p>
""",
    ("reference/08-handoff-schema.html", "Handoff schema"),
    ("reference/hooks.html", "Hooks"),
))


PAGES.append((
    "reference/hooks.html",
    "Hooks reference",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Hooks',
    """
<p>The plugin ships four hooks. They live under <code>plugins/sdlc-workflow/hooks/</code> and are wired up via <code>hooks.json</code>.</p>

<h2>validate-workflow-write (PreToolUse)</h2>

<p>Fires before any tool writes to <code>*/.ai/workflows/*.md</code>. Blocks writes that violate:</p>
<ul>
  <li><strong>Filename convention</strong> — <code>NN-stagename.md</code> or <code>NNa-stagename.md</code> (substages like <code>02b-design.md</code>).</li>
  <li><strong>YAML frontmatter</strong> — must exist between <code>---</code> markers, must contain <code>schema</code>, <code>type</code>, <code>slug</code>.</li>
  <li><strong>Schema version</strong> — <code>schema: sdlc/v1</code>.</li>
  <li><strong>Slug stability</strong> — frontmatter <code>slug</code> must match the directory name.</li>
</ul>

<p>Note: <code>.ai/ship-plan.md</code> at repo root bypasses this hook — the path pattern doesn't match.</p>

<h2>auto-stage (PostToolUse)</h2>

<p>Fires after tool writes to <code>.ai/workflows/*.md</code>. Auto-stages the changed artifact in git so the user doesn't have to remember.</p>

<h2>pre-compact (PreCompact)</h2>

<p>Fires before the conversation is compacted. Captures the workflow context (current slug, current stage, recent artifacts) so the post-compact assistant can rebuild orientation.</p>

<h2>workflow-discovery (SessionStart)</h2>

<p>Fires once per session. Reads <code>.ai/workflows/*/00-index.md</code> and surfaces active workflows as session context.</p>

<h2>Where to find them</h2>

<pre><code>plugins/sdlc-workflow/hooks/
├── hooks.json
└── scripts/
    ├── validate-workflow-write.sh
    ├── auto-stage.sh
    ├── pre-compact.sh
    └── workflow-discovery.sh</code></pre>
""",
    ("reference/09-ship-run-schema.html", "Ship-run schema"),
    ("reference/glossary.html", "Glossary"),
))


PAGES.append((
    "reference/glossary.html",
    "Glossary",
    "reference",
    '<a href="../index.html">Home</a> &rsaquo; Reference &rsaquo; Glossary',
    """
<dl>
<dt><strong>Augmentation</strong></dt><dd>Opt-in perf/observability slot (<code>instrument</code>, <code>experiment</code>, <code>benchmark</code>, <code>profile</code>) that registers on <code>00-index.md</code> and propagates to downstream stages.</dd>

<dt><strong>Artifact</strong></dt><dd>A YAML-fronted markdown file written by a stage. Lives under <code>.ai/workflows/&lt;slug&gt;/</code> (or <code>.ai/ship-plan.md</code> at repo root). Commit-ed alongside code.</dd>

<dt><strong>Base branch</strong></dt><dd>The branch the workflow's feature branch will merge back into. Captured in <code>00-index.md</code>.</dd>

<dt><strong>Branch strategy</strong></dt><dd>One of <code>dedicated</code> (workflow has its own branch + PR), <code>shared</code> (workflow contributes to an existing collaborative branch), <code>none</code> (no branch operations).</dd>

<dt><strong>Compressed flow</strong></dt><dd>A <code>/wf-quick</code> entry that collapses the 10-stage pipeline into fewer artifacts. <code>fix</code>, <code>hotfix</code>, <code>rca</code>, <code>investigate</code>, <code>discover</code>, <code>update-deps</code>, <code>refactor</code>, <code>ideate</code>.</dd>

<dt><strong>Conditional input</strong></dt><dd>An artifact that's optional to exist but mandatory to consume when it does exist. Listed in each stage's preamble.</dd>

<dt><strong>Dispatch</strong></dt><dd>A skill router resolving a sub-command argument to a specific reference file and following its instructions.</dd>

<dt><strong>External Output Boundary</strong></dt><dd>The discipline that workflow context (artifact paths, stage names, slash-command names) never leaks into external outputs (commit messages, PR bodies, release notes, user docs).</dd>

<dt><strong>Freshness pass</strong></dt><dd>A web-research sub-agent run that gathers current external information (vendor advisories, platform status, recent CVEs) before a stage finalises.</dd>

<dt><strong>Frontmatter</strong></dt><dd>YAML between <code>---</code> markers at the top of every artifact. Contains all machine-readable state.</dd>

<dt><strong>Plan-version</strong></dt><dd>Integer counter on <code>.ai/ship-plan.md</code> that bumps on every amend. Runs stamp the current value as <code>plan-version-at-run</code>.</dd>

<dt><strong>Primitive</strong></dt><dd>A focused, single-purpose reference file (e.g., the Diátaxis primitives under <code>skills/wf-docs/reference/</code>). Skill routers load primitives verbatim.</dd>

<dt><strong>Readiness verdict</strong></dt><dd>The single field on <code>08-handoff.md</code> that ship gates on. <code>ready | awaiting-input | blocked</code>.</dd>

<dt><strong>Router</strong></dt><dd>A skill (<code>wf</code>, <code>wf-quick</code>, etc.) that dispatches across multiple sub-commands.</dd>

<dt><strong>Run-id</strong></dt><dd>UTC compact ISO-8601 timestamp (<code>YYYYMMDDTHHMMZ</code>) identifying a single ship run.</dd>

<dt><strong>Slice</strong></dt><dd>A thin, independently deliverable vertical cut of the shaped work. Has its own plan, implement, verify, and review artifacts.</dd>

<dt><strong>Slug</strong></dt><dd>The stable identifier for a workflow. Matches the directory name under <code>.ai/workflows/</code>. Set at intake, never changes.</dd>

<dt><strong>Stage</strong></dt><dd>One of the 10 lifecycle positions (intake, shape, slice, plan, implement, verify, review, handoff, ship, retro).</dd>

<dt><strong>Triage loop</strong></dt><dd>The bounded T5.1 step in handoff that fetches unresolved PR review threads, classifies them, fixes blockers via <code>/wf implement reviews</code>, and resolves threads after fixes commit. Max 5 iterations.</dd>
</dl>
""",
    ("reference/hooks.html", "Hooks"),
    None,
))


# === EXPLANATION ===
PAGES.append((
    "explanation/why-this-exists.html",
    "Why this exists",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Why this exists',
    """
<p>AI coding assistants are powerful and forgetful. The plugin exists to address the second half of that sentence.</p>

<h2>The problem</h2>

<p>You ask an AI to add a feature. Over the next two hours of conversation the AI makes hundreds of decisions: which file to put what in, which library to use, what to name the function, where to put the test, what edge cases to handle, what to skip for now, what to defer. The output is code. The reasoning is gone the moment the session ends.</p>

<p>A week later you (or a colleague) need to make a follow-up change. The questions multiply:</p>
<ul>
  <li>Why was it built this way? Was a simpler approach considered?</li>
  <li>What edge cases were intentionally skipped vs. accidentally missed?</li>
  <li>What did the original requirements actually say?</li>
  <li>Which parts have tests because they matter, vs. because they were easy to test?</li>
</ul>

<p>The code answers <em>none</em> of these. Git blame answers some. The PR description answers a few if it was good. Most of the reasoning lives in the original Slack thread, or a stale Notion doc, or only in the head of whoever paired with the AI at the time.</p>

<h2>The plugin's bet</h2>

<p>The reasoning <em>can</em> be captured if the AI is required to write it down, stage by stage, into files that get committed alongside the code. The plugin makes this required, not optional.</p>

<p>Each stage writes one artifact under <code>.ai/workflows/&lt;slug&gt;/</code>. The artifact has YAML frontmatter with machine-readable state and a markdown body with human-readable narrative. The body answers the "why". The frontmatter answers "what's the state of this workflow."</p>

<h2>What this is NOT</h2>

<ul>
  <li><strong>Not a process tool.</strong> The plugin doesn't enforce a particular software development methodology (agile, kanban, waterfall). It enforces <em>artifact discipline</em> within whatever methodology you use.</li>
  <li><strong>Not Jira.</strong> The artifacts are co-located with the code. They are not a project tracker. <code>00-index.md</code> answers "what stage", not "who's working on this and when's it due."</li>
  <li><strong>Not a substitute for code review.</strong> Review is itself a stage. The plugin orchestrates it; it doesn't replace it.</li>
  <li><strong>Not a way to automate decisions.</strong> Every stage asks you. The AI proposes; you choose.</li>
</ul>

<h2>What changes for the user</h2>

<p>Concretely: you spend more time at the start (intake, shape) and less time at the end (debugging, fielding "why did we do X?" questions). The artifact trail front-loads the reasoning. The plugin's design assumes this trade-off is worth it — because most software work is more expensive to maintain than to write, and clear reasoning compounds over time.</p>

<p>If that bet doesn't match your situation — say you're doing throwaway prototyping, or one-off scripts that won't be maintained — use <code>/wf-quick</code> to get a lighter shape, or skip the plugin entirely. There's no wrong answer.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="artifacts-over-memory.html">Artifacts over memory</a> — the core mechanic.</li>
  <li><a href="orchestrator-discipline.html">Orchestrator discipline</a> — what keeps stages from collapsing into each other.</li>
  <li><a href="../tutorials/first-workflow.html">First workflow</a> — what the artifact trail looks like in practice.</li>
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
<p>The plugin's central mechanic. Worth understanding before you write off any stage as "too heavy".</p>

<h2>The conversation as ephemeral state</h2>

<p>An AI conversation has perfect memory <em>within itself</em> and zero memory between itself and any other conversation. Each new session is a stranger that has to be re-onboarded — about the code, the team, the goals, the constraints, the trade-offs already considered.</p>

<p>Re-onboarding is expensive. Re-onboarding produces inconsistent results, because the user has to remember to mention each piece of context every time. Worse, it produces <em>drift</em> — small inaccuracies in how the AI describes prior decisions accumulate into wrong assumptions.</p>

<h2>The artifact as durable state</h2>

<p>Make the AI write down its understanding at each stage, and the next conversation can read what the previous wrote. The artifact is the source of truth; the conversation is the latest interaction with it.</p>

<p>Concretely: a shape file describes the spec. A plan file describes the approach. An implement file describes what got built. A review file describes what's missing. A handoff file describes what's shippable. A retro file describes what to improve. Each is committed. Each is queryable by file. Each survives context resets.</p>

<h2>Consequences</h2>

<ul>
  <li><strong>Stages don't collapse.</strong> If shape and implement were both done in a single conversation, they'd merge into a vague "we built this thing". With separate files, the AI has to commit to shape <em>before</em> implement, and implement has to honour what shape said (or explicitly deviate, recording why).</li>
  <li><strong>Resume is cheap.</strong> Walk away after stage 4. Come back six weeks later. <code>/wf-meta resume</code> reads the trail, restores orientation in seconds.</li>
  <li><strong>Handoff is the artifact, not the conversation.</strong> The next developer reads <code>02-shape.md</code> and <code>05-implement-route.md</code> — not a recap conversation with the AI.</li>
  <li><strong>Audit is mechanical.</strong> Three weeks later: "why did we do X?" → grep <code>.ai/workflows/</code> for the slug; read the relevant stage's narrative.</li>
</ul>

<h2>The cost</h2>

<p>Honesty: artifacts cost effort. The interview at shape can run 30 questions. Each stage is one more file to write and one more dialog to engage. For trivial changes this is genuine waste — hence <code>/wf-quick</code>, which compresses the pipeline.</p>

<p>For non-trivial changes the cost is paid in time-of-doing and refunded in time-of-maintaining. The plugin's design assumes maintenance dominates over time. That's not always true; the framework lets you choose.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="why-this-exists.html">Why this exists</a> — the problem this mechanic solves.</li>
  <li><a href="orchestrator-discipline.html">Orchestrator discipline</a> — what keeps artifacts from drifting.</li>
  <li><a href="../reference/artifacts.html">Artifacts reference</a> — every file the plugin writes.</li>
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
<p>Every command in the plugin operates under a deliberate constraint: it is an <strong>orchestrator</strong>, not a problem-solver. This page explains what that means and why it matters.</p>

<h2>The rule</h2>

<table>
<thead><tr><th>Stage</th><th>What it DOES</th><th>What it DOES NOT do</th></tr></thead>
<tbody>
<tr><td><code>shape</code></td><td>Shapes a spec.</td><td>Writes code.</td></tr>
<tr><td><code>plan</code></td><td>Produces a plan.</td><td>Implements it.</td></tr>
<tr><td><code>implement</code></td><td>Builds against the plan.</td><td>Designs anew.</td></tr>
<tr><td><code>review</code></td><td>Dispatches reviewers, aggregates findings.</td><td>Fixes findings.</td></tr>
<tr><td><code>handoff</code></td><td>Packages for review.</td><td>Ships.</td></tr>
<tr><td><code>ship</code></td><td>Walks the release sequence.</td><td>Writes code or designs the spec.</td></tr>
</tbody>
</table>

<p>If a stage is tempted to step outside its role, it stops and routes to the appropriate stage. The plugin's reference files contain explicit "if you catch yourself …, STOP" lines.</p>

<h2>Why this constraint</h2>

<p>Two reasons. First, <strong>artifact clarity</strong>. If <code>plan</code> also wrote code, the plan file would document only what survived implementation. The plan as an independent document — written <em>before</em> the code — is more useful precisely because it represents intent rather than post-hoc rationalization.</p>

<p>Second, <strong>routing visibility</strong>. When implement finds the plan was wrong, it has somewhere to go (<code>/wf-meta amend</code>). When review finds a bug, it has somewhere to go (<code>/wf implement … reviews</code>). When ship finds a stale verify, it has somewhere to go (<code>/wf verify</code>). The discipline creates a graph where every failure has a defined next move.</p>

<h2>What this prevents</h2>

<ul>
  <li><strong>Plan/implement collapse.</strong> Without the discipline, plan and implement happen together and the plan becomes a thin commit-message-style retroactive narrative.</li>
  <li><strong>Review/fix collapse.</strong> Without the discipline, review fixes its own findings silently — the review artifact loses value because it doesn't record what was found vs. what was fixed.</li>
  <li><strong>Shape/code collapse.</strong> Without the discipline, shape only describes what got built, not what was asked for. Future-you can't tell whether the original goal was met.</li>
</ul>

<h2>The cost</h2>

<p>The cost is process — each routing hop is a context switch. For tiny changes this is genuine overhead, which is why <code>/wf-quick</code> exists. For non-tiny changes the explicit hops are themselves valuable: every hop is a chance for a human to redirect.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="adaptive-routing.html">Adaptive routing</a> — how stages offer multiple "next" options.</li>
  <li><a href="artifacts-over-memory.html">Artifacts over memory</a> — why each stage's output needs to be its own file.</li>
  <li><a href="../how-to/amend-or-extend.html">Amend or extend</a> — what to do when a stage finds upstream issues.</li>
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
<p>The plugin applies the <a href="https://diataxis.fr/">Diátaxis framework</a> — tutorials, how-to, reference, explanation — across the documentation lifecycle.</p>

<h2>What Diátaxis says</h2>

<p>Diátaxis posits that documentation users land in one of four modes:</p>

<table>
<thead><tr><th>Quadrant</th><th>User need</th><th>Shape of writing</th></tr></thead>
<tbody>
<tr><td>Tutorials</td><td>Learning by doing</td><td>Imperative steps, expected outcomes, one worked example.</td></tr>
<tr><td>How-to guides</td><td>Doing a task</td><td>Pre-conditions + numbered steps + variations.</td></tr>
<tr><td>Reference</td><td>Looking something up</td><td>Information-oriented, exhaustive, no opinions.</td></tr>
<tr><td>Explanation</td><td>Understanding</td><td>Discursive, trade-offs, history.</td></tr>
</tbody>
</table>

<p>A document that tries to satisfy two or three of these at once tends to satisfy none. The framework's strength is the discipline to keep them separate.</p>

<h2>How the plugin applies it</h2>

<p>Three integration points:</p>

<h3>1. Shape stage authors the docs plan</h3>
<p><code>/wf shape</code> asks "what docs does this work need?" — and gives you the four quadrant types to pick from. The answer goes into <code>02-shape.md</code> frontmatter as <code>docs-needed</code> + <code>docs-types</code>.</p>

<h3>2. Handoff generates the docs</h3>
<p><code>/wf handoff</code> reads the docs plan and, for each requested type, loads the matching Diátaxis primitive from <code>skills/wf-docs/reference/&lt;type&gt;.md</code>. The primitive contains the full discipline for that quadrant — structure, rules, anti-patterns, self-check. Handoff follows it verbatim.</p>

<h3>3. /wf-docs runs the full pipeline standalone</h3>
<p><code>/wf-docs</code> runs an audit → plan → generate → review cycle on the project's existing docs. Each generated doc is one quadrant, never mixed.</p>

<h2>Why this matters</h2>

<p>Docs are usually treated as a final step that someone reluctantly does. Diátaxis-aware generation flips that: the docs plan is decided at shape (before any code), the generation is mechanical (each primitive enforces its quadrant's rules), and the review is automated.</p>

<p>The Diátaxis discipline keeps the docs <em>useful</em>. A "reference" page that creeps into explanation no longer works for either audience. A how-to that mixes in tutorial steps confuses both.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../reference/skills.html">Skills reference</a> — the <code>wf-docs</code> router.</li>
  <li><a href="../reference/commands.html">Commands reference</a> — <code>/wf-docs</code> sub-commands.</li>
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
<p>The plugin's branch-strategy field on <code>00-index.md</code> is one of three values. Pick at intake; rarely change later.</p>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start{What's the change?}
  start -- Feature; reviewer-friendly PR --> dedicated[branch-strategy: dedicated]
  start -- Joining a long-lived branch others share --> shared[branch-strategy: shared]
  start -- Docs-only / local-only / spike --> none[branch-strategy: none]

  dedicated -.-> dedicated_eff[Push, open PR<br/>--force-with-lease on rebase<br/>T5.1 triage runs<br/>T5.2 rebase runs<br/>T5.3 live check runs]
  shared -.-> shared_eff[Push branch<br/>NO auto-PR<br/>T5.2 SKIPPED (no force-push)<br/>T5.1/T5.3 only if PR exists]
  none -.-> none_eff[No git operations<br/>Handoff doc IS the deliverable<br/>T4/T5/T5.1/T5.2/T5.3 all skipped]
</pre>
</div>
<p class="caption">Each strategy enables a different subset of the handoff PR-readiness block.</p>

<h2>dedicated (default)</h2>

<p>The workflow has its own branch (default name: <code>feat/&lt;slug&gt;</code>) and its own PR. This is the normal case for a feature or substantive change.</p>

<p>Implications:</p>
<ul>
  <li>Handoff pushes the branch and opens (or updates) a PR.</li>
  <li>T5.2 rebases onto base with <code>--force-with-lease</code> when the branch falls behind.</li>
  <li>T5.1 triages PR comments through a bounded loop.</li>
  <li>T5.3 captures live PR state into <code>08-handoff.md</code>.</li>
</ul>

<h2>shared</h2>

<p>Multiple workflows contribute to one long-lived branch (a release train, a team-shared feature branch). Force-pushing would clobber other people's work.</p>

<p>Implications:</p>
<ul>
  <li>Handoff pushes the branch but does NOT automatically open a PR. The user manages PR creation.</li>
  <li>T5.2 (rebase + force-push) is skipped.</li>
  <li>T5.1 and T5.3 run only if a <code>pr-number</code> is captured manually.</li>
</ul>

<h2>none</h2>

<p>No git operations at all. Used for documentation-only workflows, local prototyping that won't ship, or workflows that complete on the user's working copy.</p>

<p>Implications:</p>
<ul>
  <li>Handoff writes <code>08-handoff.md</code> as the deliverable but does not push, PR, triage, rebase, or check.</li>
  <li>The handoff artifact itself is the externalised result.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="the-readiness-gate.html">The readiness gate</a> — which fields the gate computes for each strategy.</li>
  <li><a href="../how-to/start-workflow.html">Pick an entry point</a> — branch strategy is captured at intake.</li>
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
<p>Every stage offers a default <em>and</em> alternatives. The pipeline is a spine, not a railroad.</p>

<h2>The four-option pattern</h2>

<p>At the end of every stage, the artifact's <code>## Recommended Next Stage</code> section lists ALL viable options — not just the sequential default. Typical shape:</p>

<table>
<tr><th>Option A (default)</th><td>The natural sequential next stage.</td></tr>
<tr><th>Option B (skip-to)</th><td>Jump forward when an intermediate stage adds no value for this specific change.</td></tr>
<tr><th>Option C (revisit)</th><td>Go back when this stage revealed an upstream problem.</td></tr>
<tr><th>Option D (parallel)</th><td>Run a sibling stage (e.g., plan another slice while implementing one).</td></tr>
</table>

<p>The default exists so you can hit enter and move forward. The alternatives exist because real work doesn't fit one path.</p>

<h2>Examples</h2>

<dl>
<dt><strong>After shape</strong></dt>
<dd>Default: <code>/wf slice</code>. Alt: <code>/wf-design shape</code> if the feature is UI-heavy. Alt: skip slice for single-slice features and go straight to plan.</dd>

<dt><strong>After review</strong></dt>
<dd>Default: <code>/wf handoff</code>. Alt: <code>/wf implement &lt;slice&gt; reviews</code> if findings need fixing first. Alt: <code>/wf-meta amend</code> if findings show the spec was wrong.</dd>

<dt><strong>After ship</strong></dt>
<dd>Default: <code>/wf retro</code>. Alt: resume a paused run. Alt: roll back manually + amend the plan with a new recovery playbook.</dd>
</dl>

<h2>Why this isn't chaos</h2>

<p>Three properties keep it tractable:</p>

<ul>
  <li><strong>Each stage's "next" options are explicitly enumerated</strong> in its reference file. There's no implicit graph — every transition is documented.</li>
  <li><strong>Every option writes its own artifact.</strong> Skipping doesn't erase history; the skip writes a stub.</li>
  <li><strong>You see all options, you pick.</strong> The AI proposes; the user routes. The plugin never silently picks the non-default for you.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="orchestrator-discipline.html">Orchestrator discipline</a> — why every transition is explicit.</li>
  <li><a href="../how-to/navigate-workflows.html">Navigate workflows</a> — the meta-commands that help you find where you are.</li>
</ul>
</div>
""",
    ("explanation/branch-strategy.html", "Branch strategy"),
    ("explanation/augmentations-model.html", "Augmentations model"),
))


PAGES.append((
    "explanation/augmentations-model.html",
    "Augmentations model",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; Augmentations model',
    """
<p>Instrument, experiment, benchmark, profile — the four augmentations. They're not stages; they're <em>opt-in slots</em> that add depth where it's needed.</p>

<h2>Registration → propagation flow</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  user["User runs /wf instrument my-slug route"]
  user --> inst["04b-instrument-route.md written"]
  inst --> reg["00-index.md augmentations array appended"]
  reg --> impl["/wf implement reads 04b-*.md"]
  reg --> handoff["/wf handoff translates each to reviewer-visible mention"]
  reg --> ship["/wf ship translates each to changelog line"]

  classDef art fill:#dbeafe,stroke:#1d4ed8,color:#1f1f1d
  classDef cmd fill:#fef3c7,stroke:#b45309,color:#1f1f1d
  class user,impl,handoff,ship cmd
  class inst,reg art
</pre>
</div>
<p class="caption">An augmentation isn't a one-off — it registers and downstream stages consume it.</p>

<h2>Why "augmentation" not "stage"</h2>

<p>Stages are mandatory positions in the pipeline. Augmentations are conditional. A simple feature might never need observability; adding an instrument stage to every workflow would be friction. Making it an explicit opt-in keeps the pipeline thin by default.</p>

<h2>The four kinds</h2>

<dl>
<dt><strong>instrument</strong> — observability design</dt>
<dd>For code paths that have no logs/metrics/traces. Output: <code>04b-instrument-&lt;slice&gt;.md</code> with the signals to add. Implement reads it and adds the signals.</dd>

<dt><strong>experiment</strong> — measured rollout</dt>
<dd>For behaviour changes you want to gate behind a flag with a cohort split. Output: <code>04c-experiment-&lt;slice&gt;.md</code> with flag wiring, cohort design, success metrics, rollback signal.</dd>

<dt><strong>benchmark</strong> — perf baseline + compare</dt>
<dd>For changes that could affect performance. Output: <code>05c-benchmark-&lt;slice&gt;.md</code>. Run before implement to capture baseline; run after implement to compare. The compare-mode output goes into <code>06-verify-&lt;slice&gt;.md</code>'s evidence.</dd>

<dt><strong>profile</strong> — hot-path investigation</dt>
<dd>The only freestanding augmentation. Doesn't need a slice context. Output: an analysis of where time is spent in the named area.</dd>
</dl>

<h2>How downstream stages translate them</h2>

<table>
<thead><tr><th>Kind</th><th>In handoff (reviewer-visible)</th><th>In ship (changelog line)</th></tr></thead>
<tbody>
<tr><td>instrument</td><td>"Added observability — N signals for previously unobserved code paths"</td><td>"Added detailed monitoring for &lt;feature&gt;"</td></tr>
<tr><td>experiment</td><td>"Wrapped behind feature flag with cohort split for measured rollout"</td><td>"Rolled out to N% of users"</td></tr>
<tr><td>benchmark</td><td>"Performance baseline taken; verify-stage comparison: &lt;within tripwires / regression&gt;"</td><td>(typically omitted unless user-visible)</td></tr>
<tr><td>profile</td><td>Freestanding; not in handoff</td><td>Not in changelog</td></tr>
</tbody>
</table>

<p>The External Output Boundary applies: no workflow paths or stage names leak into the external mentions.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../how-to/use-augmentations.html">Use augmentations</a> — when to add each.</li>
  <li><a href="../reference/commands.html">Commands reference</a> — full augmentation command list.</li>
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
<p>The single most load-bearing property of the v9.5.0 ship rewrite. Without it, "replayable releases" would be marketing.</p>

<h2>The promise</h2>

<p>Run <code>/wf ship &lt;slug&gt;</code>. Something fails — registry returns 401, post-publish check times out, your laptop dies. Re-run <code>/wf ship &lt;slug&gt;</code>. The release continues from where it stopped, not from scratch.</p>

<h2>The mechanism</h2>

<p>Every step in the 13-step run sequence detects its already-done state <em>before</em> performing its side effect.</p>

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
<p class="caption">Each step is two phases: detect, then act. Resume just re-enters the loop at step N and the detection short-circuits.</p>

<h2>Per-step detection</h2>

<table>
<thead><tr><th>Step</th><th>Detects already-done by</th></tr></thead>
<tbody>
<tr><td>Pre-flight version bump</td><td>Reading the source-of-truth file; if the literal matches the target version, no write.</td></tr>
<tr><td>Publish dry-run</td><td>Always safe to re-run; no side effects.</td></tr>
<tr><td>Merge</td><td><code>gh pr view --json state,merged</code>; if <code>merged: true</code>, capture <code>mergeCommit.oid</code> and skip.</td></tr>
<tr><td>Tag</td><td><code>git rev-parse "v&lt;version&gt;"</code>; if it succeeds, skip.</td></tr>
<tr><td>Workflow watch</td><td>If <code>release-workflow-conclusion: success</code> already recorded, skip.</td></tr>
<tr><td>Post-publish poll</td><td>Per-check status; only re-poll checks at <code>pending</code>.</td></tr>
<tr><td>Post-release bump</td><td>Source-of-truth file already at next dev version → skip.</td></tr>
</tbody>
</table>

<h2>Why this is hard to get wrong (but easy to get right)</h2>

<p>The detection is mostly free — <code>gh pr view</code>, <code>git rev-parse</code>, reading a file. The discipline is in remembering to do it. The plugin's reference file makes it explicit per step rather than implicit.</p>

<p>The plan-version is the one piece of meta-state: a run records <code>plan-version-at-run</code>. If a paused run's <code>plan-version-at-run</code> mismatches the current plan-version, the resume prompt warns. (Resuming is still safe — the plan's <em>shape</em> doesn't change between versions, only contents — but the user should know.)</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../how-to/resume-paused-work.html">Resume paused work</a> — exercising this property in practice.</li>
  <li><a href="../reference/09-ship-run-schema.html">Ship-run schema</a> — the evidence fields the detection reads.</li>
</ul>
</div>
""",
    ("explanation/augmentations-model.html", "Augmentations model"),
    ("explanation/the-readiness-gate.html", "The readiness gate"),
))


PAGES.append((
    "explanation/the-readiness-gate.html",
    "The readiness gate",
    "explanation",
    '<a href="../index.html">Home</a> &rsaquo; Explanation &rsaquo; The readiness gate',
    """
<p>The contract between handoff and ship. v9.5.0's <code>readiness-verdict</code> is the only state ship will accept.</p>

<h2>What the gate is</h2>

<p>A single field on <code>08-handoff.md</code> with three possible values:</p>

<table>
<tr><th><code>ready</code></th><td>Ship will proceed.</td></tr>
<tr><th><code>awaiting-input</code></th><td>Soft fail. Ship refuses; the user can re-run handoff after resolving.</td></tr>
<tr><th><code>blocked</code></th><td>Hard fail. Ship refuses; the user needs to fix something before handoff can re-verdict.</td></tr>
</table>

<h2>How the verdict is computed</h2>

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

<h2>Why it exists</h2>

<p>Before v9.5.0, ship looked at handoff and trusted it. Many failures (failing CI, requested changes, drift in the API surface, unresolved review comments) would slip through because handoff didn't <em>check</em> for them.</p>

<p>The gate makes the check explicit. Handoff has to compute the verdict; ship has to read it. Neither can pretend the other handled the check.</p>

<h2>Soft-fail vs. hard-fail</h2>

<p>The distinction matters because it affects what the user does next:</p>

<ul>
  <li><strong>Hard fail (blocked)</strong>: something requires <em>code</em> action. Failing CI needs a fix. Requested changes need addressing. Surface drift needs reconciling. The user goes back to <code>/wf implement</code> or fixes the upstream issue, then re-runs handoff.</li>
  <li><strong>Soft fail (awaiting-input)</strong>: something needs <em>time</em> or <em>a decision</em>. Pending checks need to finish running. Deferred suggestions need a final apply/decline decision. The user waits or decides, then re-runs handoff.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../how-to/triage-pr-comments.html">Triage PR comments</a> — the T5.1 step that feeds <code>has-deferred-comments</code>.</li>
  <li><a href="../reference/08-handoff-schema.html">Handoff schema</a> — every field the verdict reads.</li>
  <li><a href="../how-to/run-a-release.html">Run a release</a> — what happens once the gate opens.</li>
</ul>
</div>
""",
    ("explanation/idempotency-in-ship.html", "Idempotency in ship"),
    None,
))


# === TIPS ===
PAGES.append((
    "tips/escape-hatches.html",
    "Escape hatches",
    "tips",
    '<a href="../index.html">Home</a> &rsaquo; Tips &rsaquo; Escape hatches',
    """
<p>The plugin imposes structure. Sometimes you don't want structure. Here's how to bypass it without going off the rails.</p>

<h2>Decision tree</h2>

<div class="diagram">
<pre class="mermaid">
flowchart TD
  start{"Do I need an artifact trail<br/>for this change?"}
  start -- "Definitely not (trivial, throwaway)" --> bypass["Just commit; skip the plugin"]
  start -- "Maybe — for posterity but not detail" --> quick["/wf-quick fix"]
  start -- "Yes, but compressed" --> compressed["/wf-quick &lt;flow&gt;"]
  start -- "Yes, full" --> full["/wf intake"]

  quick --> skip{"Want even less?"}
  skip -- "skip review for hotfix" --> hotfix["/wf-quick hotfix"]
  skip -- "skip a single stage" --> skipone["/wf-meta skip &lt;stage&gt;"]
</pre>
</div>

<h2>Common escape hatches</h2>

<dl>
<dt><strong>"This is a one-line README typo."</strong></dt>
<dd>Just commit. The plugin is opt-in, not required.</dd>

<dt><strong>"I need to skip review because production is on fire."</strong></dt>
<dd><code>/wf-quick hotfix</code>. Bypasses review by design. Still leaves a hotfix artifact for post-incident learning.</dd>

<dt><strong>"I don't want to author a ship plan yet."</strong></dt>
<dd>Stop at handoff. The PR is enough; you can merge it manually. Skip the ship stage entirely.</dd>

<dt><strong>"Verify keeps finding flakes I don't want to fix right now."</strong></dt>
<dd><code>/wf-meta skip verify &lt;slug&gt;</code>. Writes a stub so review and handoff don't reject the workflow. You stay accountable for the skip in <code>00-index.md</code>.</dd>

<dt><strong>"I want to walk away mid-workflow and not lose anything."</strong></dt>
<dd>Just stop. Artifacts are durable. Resume with <code>/wf-meta resume</code> whenever.</dd>

<dt><strong>"I started a workflow but it turned out to be the wrong approach entirely."</strong></dt>
<dd><code>/wf-meta close abandoned &lt;slug&gt;</code>. Writes a close artifact with your reason; the workflow stops being "active" in status.</dd>

<dt><strong>"The plugin is asking too many questions."</strong></dt>
<dd>The intake question count is one indicator that this change might want <code>/wf-quick</code> instead. Decline and re-run with the compressed flow.</dd>

<dt><strong>"I want to ship without running the new PR-readiness block."</strong></dt>
<dd>Set <code>branch-strategy: none</code> at intake. The PR-readiness block requires a PR to inspect, so it skips entirely. You're responsible for code review yourself.</dd>
</dl>

<h2>What's NOT a valid escape hatch</h2>

<ul>
  <li><strong>Don't edit artifact frontmatter to "fix" a stage status.</strong> Use <code>/wf-meta sync</code> instead — it reads disk reality and rebuilds the index without you having to invent values.</li>
  <li><strong>Don't delete the workflow directory to "start over".</strong> Close + start fresh. The closed workflow is part of the audit trail.</li>
  <li><strong>Don't ignore <code>readiness-verdict: blocked</code> by hand-editing it to <code>ready</code>.</strong> The verdict is computed for a reason; bypassing the gate hides real problems.</li>
</ul>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="anti-patterns.html">Anti-patterns</a> — common mistakes the plugin invites.</li>
  <li><a href="../how-to/close-workflows.html">Close workflows</a> — clean shutdown.</li>
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
<p>Power-user moves once you're past the basics.</p>

<h2>Parallel slice plan + implement</h2>

<p>Multi-slice workflows can plan and implement multiple slices in parallel — each writes its own per-slice file. Open two Claude Code sessions on the same repo (or use background sub-agents) and run plan+implement on different slices simultaneously. The artifacts don't conflict.</p>

<h2>Re-run handoff to refresh PR triage</h2>

<p>A PR sits for a few days. Bots have added more comments. Just re-run <code>/wf handoff &lt;slug&gt;</code>. Every step is idempotent — only the triage loop materially re-runs, picking up new comments.</p>

<h2>Use <code>/wf-meta how</code> before plan on unfamiliar code</h2>

<p>If you're about to plan a change in a part of the codebase you don't know, run <code>/wf-meta how &lt;question&gt;</code> first. The codebase-exploration mode dispatches Explore sub-agents in parallel and synthesises an explanation. Plan then has the context it needs.</p>

<h2>Set <code>review-bots:</code> to scope triage</h2>

<p>The default bot list (<code>coderabbitai</code>, <code>greptile-dev</code>, <code>gemini-code-assist</code>, <code>chatgpt-codex-connector[bot]</code>) is generous. If your team only uses one or two, narrow the list in <code>00-index.md</code>:</p>

<pre><code>review-bots:
  - coderabbitai</code></pre>

<p>Triage runs faster and produces less noise.</p>

<h2>Bundle related slices into one handoff</h2>

<p>By default <code>/wf handoff &lt;slug&gt;</code> aggregates ALL complete slices into one PR. If you want one PR per slice, pass the slice slug as the second arg: <code>/wf handoff &lt;slug&gt; &lt;slice&gt;</code>.</p>

<h2>Amend a plan after a ship failure</h2>

<p>A run hit a failure mode the plan didn't capture. After resolving:</p>

<pre><code>/wf-meta amend ship-plan</code></pre>

<p>Add the failure to Block F (recovery playbooks) so the next run's recovery dispatch knows how to handle it. The plan accrues organisation knowledge over time.</p>

<h2>Use augmentations selectively per slice</h2>

<p>Not every slice needs instrument or benchmark. Add them only to the slices where they matter. <code>04b-instrument-*.md</code> is per-slice for a reason.</p>

<h2>Skip-to from intake for trivial changes</h2>

<p>For a one-file change that doesn't merit shape's deep interview, you can skip from intake straight to plan:</p>

<pre><code>/wf intake "rename FooBar to FooBaz"
/wf-meta skip shape &lt;slug&gt;
/wf-meta skip slice &lt;slug&gt;
/wf plan &lt;slug&gt; &lt;default-slice&gt;</code></pre>

<p>Or just use <code>/wf-quick fix</code>, which does the same thing in one command.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="../how-to/start-workflow.html">Pick an entry point</a> — when each entry pays off.</li>
  <li><a href="anti-patterns.html">Anti-patterns</a> — the inverse of these tricks.</li>
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
<p>What the plugin doesn't fix — and what it can mask if you're not careful.</p>

<h2>Treating BLOCKER findings as suggestions</h2>

<p>Review produces severity levels for a reason. BLOCKER means "must fix" — the workflow's routing explicitly sends you back to <code>/wf implement</code>. Marking the verdict as "ship with caveats" instead is a way to make the artifact stop complaining; it doesn't make the issue go away.</p>

<p><strong>Symptom:</strong> <code>07-review-*.md</code> has BLOCKER findings, but handoff was run anyway with no implement-reviews pass.</p>

<p><strong>Better:</strong> if you genuinely don't think the BLOCKER is a blocker, write that explicitly in the review's <code>## Fix Status</code> section with reasoning. Then handoff can proceed and the artifact records the disagreement.</p>

<h2>Letting plan and implement drift</h2>

<p>The plan said "use the existing route-registration helper". Implement found a reason to write a new helper. If the deviation isn't recorded in <code>05-implement-*.md</code>'s <code>## Plan deviations</code>, the plan file silently lies.</p>

<p><strong>Symptom:</strong> Plan and implement disagree, no deviation recorded.</p>

<p><strong>Better:</strong> Force the deviation into the artifact. Future-you reading the plan needs to know it was overridden.</p>

<h2>Skipping retro on "small" work</h2>

<p>Retro is short. Five minutes. The temptation to skip it on small changes accumulates — the small lessons are exactly the ones that compound. If you've shipped 50 small changes and never retro'd any, the project has 50 missed learning opportunities.</p>

<p><strong>Symptom:</strong> <code>10-retro.md</code> is missing from most workflows.</p>

<p><strong>Better:</strong> Make retro mandatory for any workflow with a ship-run. Compressed flows (<code>/wf-quick</code>) skip retro by design; the full pipeline shouldn't.</p>

<h2>Hand-editing readiness-verdict</h2>

<p>The verdict is computed from contributing fields. Setting it to <code>ready</code> when contributing fields say otherwise bypasses the check ship was designed to enforce.</p>

<p><strong>Symptom:</strong> <code>readiness-verdict: ready</code> with <code>live-checks-failing: [build, test]</code>.</p>

<p><strong>Better:</strong> Fix the contributing fields. If CI is genuinely fine and the field is wrong, re-run handoff to recompute.</p>

<h2>Authoring a ship plan that mirrors README</h2>

<p>The plan should encode <em>what's not obvious from reading the repo</em> — recovery playbooks, secret rotation cadence, post-publish propagation behaviour, rollback steps. If your plan is just <code>npm publish</code> with no playbooks, you're not capturing the value the plan exists to capture.</p>

<p><strong>Symptom:</strong> Plan has empty <code>recovery-playbooks</code>; no <code>secrets-staleness-threshold-days</code>; no <code>db-migrations-reversible</code>.</p>

<p><strong>Better:</strong> Treat the plan as living. Amend it every time a release teaches you something — a 401, a propagation delay, a rollback that worked or didn't.</p>

<h2>Conflating compressed flows with shortcuts</h2>

<p><code>/wf-quick</code> is for changes that fit the compressed shape, not for "I'm in a hurry". A feature with five files and a migration does not fit <code>/wf-quick fix</code> just because you're trying to land it by EOD.</p>

<p><strong>Symptom:</strong> <code>01-quick.md</code> describes scope that needs slicing.</p>

<p><strong>Better:</strong> Close the quick workflow as <code>superseded</code> and restart with <code>/wf intake</code>.</p>

<div class="related">
<h3>Related</h3>
<ul>
  <li><a href="escape-hatches.html">Escape hatches</a> — legitimate bypasses.</li>
  <li><a href="../explanation/orchestrator-discipline.html">Orchestrator discipline</a> — why these patterns matter.</li>
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
<dl>
<dt><strong>Why does <code>/wf ship</code> refuse to start?</strong></dt>
<dd>Two possibilities. Either <code>.ai/ship-plan.md</code> doesn't exist (run <code>/wf-meta init-ship-plan</code>), or <code>08-handoff.md</code> has <code>readiness-verdict ≠ ready</code> (re-run <code>/wf handoff</code> to refresh, or fix the contributing field).</dd>

<dt><strong>Why didn't my augmentation propagate to the changelog?</strong></dt>
<dd>Check <code>00-index.md</code> — the augmentation should appear in the <code>augmentations:</code> array. If it's missing, the augmentation command didn't register it (rare; could be a bug). If it's present but ship didn't mention it, check whether ship's changelog generation read the array — open <code>09-ship-run-*.md</code> and look at <code>## Pre-flight</code>.</dd>

<dt><strong>Why is my slug different from my title?</strong></dt>
<dd>The slug is a kebab-case, lowercase, stable identifier derived from the title at intake. Titles can have punctuation, capitals, and spaces; slugs can't. Once set, the slug never changes — it's the directory name under <code>.ai/workflows/</code>.</dd>

<dt><strong>Can I rename a slug?</strong></dt>
<dd>Not really. The slug is in every artifact's frontmatter and the validator enforces slug-equals-directory-name. The safer path is to close the workflow and start a new one with the new slug.</dd>

<dt><strong>My PR has a CodeRabbit summary I don't want to triage. Can I ignore it?</strong></dt>
<dd>Yes. T5.1 classifies walkthroughs as 🟢 (informational), which are noted but never resolved. They don't block the readiness verdict.</dd>

<dt><strong>The triage loop hit the 5-iteration bound. What now?</strong></dt>
<dd>The verdict goes to <code>awaiting-input</code> and the loop stops. Typically this means a bot is re-commenting after every fix; you need to either decline the suggestions or amend the plan/config that's triggering the bot's response.</dd>

<dt><strong>How do I roll back a release?</strong></dt>
<dd>Per <code>plan.rollback-mechanism</code>. After rolling back manually, edit <code>09-ship-run-*.md</code> to set <code>rolled-back: true</code> + <code>rollback-sha</code> + <code>rollback-reason</code>. Then consider amending the plan with a recovery playbook for the failure mode you just hit.</dd>

<dt><strong>Does the plugin work for non-git projects?</strong></dt>
<dd>Most stages, yes. Handoff and ship's branch-related features require git, but you can set <code>branch-strategy: none</code> and the artifact trail still works.</dd>

<dt><strong>Can I commit <code>.ai/workflows/</code> selectively?</strong></dt>
<dd>Yes. There's no enforcement that artifacts get committed. But the value of the plugin scales with how persistent the trail is — uncommitted artifacts disappear with the working tree.</dd>

<dt><strong>What's the difference between <code>amend</code>, <code>extend</code>, and <code>implement reviews</code>?</strong></dt>
<dd><code>amend</code> corrects the spec. <code>extend</code> adds new slices. <code>implement reviews</code> fixes implementation bugs. <a href="../how-to/amend-or-extend.html">Full decision rule here</a>.</dd>

<dt><strong>Why does shape ask 30 questions for something simple?</strong></dt>
<dd>That's a signal the change probably wants <code>/wf-quick fix</code> instead. Shape is the deep interview stage — if it doesn't pay off, you're in the wrong flow.</dd>

<dt><strong>Can I use the plugin with another AI assistant (not Claude Code)?</strong></dt>
<dd>The artifact files are plain markdown + YAML — they're portable. The orchestration runs in Claude Code's skill router system, so the slash commands themselves are Claude Code-specific.</dd>
</dl>
""",
    ("tips/anti-patterns.html", "Anti-patterns"),
    None,
))


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
def main():
    print(f"Generating {len(PAGES)} pages under {SITE_ROOT}")
    for entry in PAGES:
        if len(entry) == 7:
            path, title, quadrant, breadcrumb, body, prev, nxt = entry
        else:
            path, title, quadrant, breadcrumb, body = entry
            prev, nxt = None, None
        render_page(path, title, quadrant, breadcrumb, body, prev, nxt)
    print("done.")


if __name__ == "__main__":
    main()
