# sdlc-workflow documentation site

A hand-authored static HTML site documenting the sdlc-workflow plugin. Four sections:
`start/` (learning), `guides/` (tasks), `concepts/` (understanding), `reference/`
(lookup). There is **no generator** — every page is a plain HTML file you edit
directly.

## Layout

```
docs/site/
├── index.html      # Landing page
├── style.css       # Shared stylesheet (system fonts, dark mode, print)
├── nav.html        # Sidebar fragment — THE single source of nav + version brand
├── nav.js          # Fetches nav.html into each page's <aside id="sidebar">
├── README.md       # This file
├── start/          # Learning-oriented tutorials
├── guides/         # Task-oriented walkthroughs
├── concepts/       # Understanding-oriented explanations
└── reference/      # Lookup-oriented listings
```

## Serving

The hub daemon serves this tree at `http://127.0.0.1:4173/docs/`. It also works from
any static file server. Over bare `file://` the fetched sidebar is unavailable
(browsers block fetch); pages fall back to a "Contents" link — use a server for the
full experience.

## Authoring rules

- Copy an existing page as the skeleton. Every page: `<p class="lede">` opening
  (the job the page does for the reader), body, `<div class="related">` closing block.
- Pages in subdirectories set `<body data-root="../">`; `index.html` uses `data-root=""`.
- No version numbers in page bodies. The brand lives **only** in `nav.html`
  (`plugin docs · vX.Y.Z`). A release bumps that one line.
- Adding a page = write the file + add one `<li>` to `nav.html`. Nothing else.
- No external CDNs. Diagrams are inline HTML/CSS or inline SVG.
- Controlled vocabulary (CI-enforced by `scripts/verify-doc-legibility.mjs`): say
  "command" not "router", "the dashboard" not "sunflower", "readiness check" not
  "readiness gate", "quick lane" not "compressed flow", "add-on" not "augmentation"
  (each with narrow page exemptions — see the guard).
- Accuracy source of truth is `skills/wf/reference/*.md`, never the root README.

## CI guards

- `npm run verify:docs` (`scripts/verify-doc-site.mjs`): nav brand matches
  `plugin.json`, every nav link resolves to a file on disk, every page on disk is
  reachable from the nav, every page carries the sidebar mount + nav.js include.
- `npm run verify:legibility` (`scripts/verify-doc-legibility.mjs`): lede + related
  blocks present, banned vocabulary absent, no placeholder tokens in `start/` pages.

## After a version bump

Update the one brand line in `nav.html`. `verify:docs` fails until you do.
