# sdlc-workflow documentation site

A multi-page static HTML site that documents the sdlc-workflow plugin in the Diátaxis four-quadrant style (tutorials, how-to, reference, explanation) plus tips and FAQ.

## Local preview

The site is plain HTML — open `index.html` directly in a browser, or serve it locally to make Mermaid diagrams render reliably:

```bash
cd plugins/sdlc-workflow/docs/site
python3 -m http.server 8000
# open http://localhost:8000
```

Or `npx serve .` if you prefer Node.

## Layout

```
docs/site/
├── index.html               # Landing
├── style.css                # Shared stylesheet (system fonts, dark mode, print)
├── nav.html                 # Canonical sidebar nav (source of truth)
├── README.md                # This file
├── tutorials/               # Learning-oriented (Diátaxis: tutorial)
├── how-to/                  # Task-oriented (Diátaxis: how-to)
├── reference/               # Information-oriented (Diátaxis: reference)
├── explanation/             # Understanding-oriented (Diátaxis: explanation)
└── tips/                    # Power-user notes, FAQ, anti-patterns
```

## Diagrams

Diagrams use [Mermaid](https://mermaid.js.org/) loaded via CDN:

```
https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs
```

When the CDN is unreachable (offline, blocked), each diagram block keeps its source as readable text inside the `<pre class="mermaid">` element — you still see the structure, just not the rendered graphic.

## Updating the sidebar

`nav.html` holds the canonical sidebar. Currently the nav is inlined into each HTML page (no build step). When you add or rename a page, update `nav.html` first, then propagate the change to every page's `<aside id="sidebar">…</aside>` block.

If maintaining 30+ identical copies becomes painful, add `tools/regen-nav.sh` that replaces every page's sidebar block with the contents of `nav.html`. The regen script is **not** checked in by default — only add it when it earns its keep.

## Hosting

The site works as-is over `file://`. For a public host:

- **GitHub Pages** — set Source to `/plugins/sdlc-workflow/docs/site/`.
- **Netlify / Cloudflare Pages / Vercel** — point the static-site root at the same directory; no build command.

## Versioning

The site documents the *current* plugin version (read `version` from `plugin.json`). When the plugin's behaviour changes materially, the affected pages are updated in the same PR. Old versions of the docs live in git history; no version selector is maintained.

## Authoring conventions

- Each page declares its Diátaxis quadrant in a colored badge near the top (`<span class="quadrant tutorial">` etc.).
- Each page opens with a one-paragraph statement of what the reader will get from it.
- How-to and tutorial pages open with **Pre-conditions** before the first numbered step.
- Reference pages are alphabetised within sections. No narrative ordering.
- Explanation pages close with a **Related** block linking to the relevant how-to + reference pages.
- Code blocks containing commands a reader should run are introduced by an imperative sentence ending with a colon.
- Diagrams are not decorative. If a diagram doesn't answer a "what do I learn from this?" within 10 seconds, it gets cut or rewritten.

## What's NOT in the site

- Marketing material — no testimonials, no IDE screenshots, no comparison tables with other tools.
- A Claude Code tutorial — readers are assumed to have Claude Code installed.
- Auto-generated docs — every page is hand-authored. The plugin's reference files (`skills/*/reference/*.md`) are the input, not the output.
