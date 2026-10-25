# Read (`design/mode-read.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

The design mode reference for a surface where the person comes to understand something: docs, articles, guides, help, changelogs, long-form content ([_design-context.md](_design-context.md) → Design modes). The page is first a document of its kind, framed by the world.

Design stage Step 3b reads `## Directions`. Step 4 reads `## Screens`. The typography and consistency rules of [mode-operate.md](mode-operate.md) also apply.

## Directions

**The reader's question leads.** Comprehension and wayfinding stay intact at every step. Documentation reads as documentation, a guide as a guide, an article as an article, a changelog as a changelog.

**The world owns the frame and serves the column.**
- The frame is the masthead, the navigation rail, the ground, the title and section openers, and the way code, tables and callouts are set. There, the world's palette, type and signature move commit fully, so the page could belong to no other product.
- The reading column stays calm: a reading face, real contrast, a real measure, nothing performing behind the text.
- The world never supplies the reading order, and never replaces the navigation with something the reader has to learn.

**Where candidates come from.** Candidates from the world's own publishing traditions transfer best: reference books, type specimens, timetables, field guides, technical manuals, scholarly apparatus, a newspaper's wayfinding. A tool, an instrument or a fictional interface from the audience's world comes back as a costume. Take from it only type, palette, density and a signature move, or replace it.

**Write the shell first.** Write each direction's first viewport as the document's shell: the navigation and where the reader stands in it; the title and the opening that answers or frames the reader's question; the reading column; the way forward (contents, section headings, next and previous). Then name where the world owns the frame and where the signature move lives: a masthead, a colored rail, a running head, a margin system, a numbering scheme, a way of setting code or tables.

**Typography.** The measure and the reading face lead. Body prose keeps 65–75 characters per line. Use monospace for code, parameters and small labels only, never for running text or headings by default. Use a fixed scale at a ratio of 1.125–1.2.

**Color.** Restrained is the default, but the frame may commit: a colored rail, a tinted ground, set code and callouts in the world's palette.

**Motion.** Motion helps wayfinding only: a contents highlight, an anchor jump, a disclosure. Nothing moves behind the text.

## Screens

Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

**The screen is the document as the reader meets it:** a frame the world owns, in the direction's committed palette and type, around a calm reading column.
- Set the column at a real measure: about 65–75 characters with body text near the platform body size (16 px on the web); in a native app, the platform's body text style and its readable width ([_platforms.md](_platforms.md)).
- Give the headings a clear hierarchy, and the wayfinding that carries the reader through.
- Set body text in a reading face with real contrast against its ground.
- Set code, tables, notes and figures in the standard forms that readers know, in the world's type and palette.
- Use the signature move as one system where it earns its place, never as a frame repeated around every element.
- A document never reads as a poster, a magazine cover, or a book photographed open.

**Real content.** Draw with the real title, a real opening paragraph, real section names, and one example of the hardest content the surface holds: a code sample, a reference table, a diagram. Never draw filler text.

**Later directions vary the reading structure and the frame, never the column:** the navigation model (sidebar tree, top tabs, inline contents), the column and margin system, how densely the reference material sits, and where the signature move appears. Each direction differs from the first at thumbnail size. A screen that pushes world material into the reading column makes reading harder and goes the wrong way.

**Self-check every screen.** Can a reader tell where they are and where to go next, and read the body comfortably? Then cover the name: could this be any other product's documentation? If so, the frame has not taken the world; push the masthead, rail, ground and openers further into it. When the screen reads as an artifact of the world before it reads as a document, the world has reached the column; pull it back to the frame.
