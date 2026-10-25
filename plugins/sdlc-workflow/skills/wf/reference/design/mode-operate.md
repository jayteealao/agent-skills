# Operate (`design/mode-operate.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

The design mode reference for a surface where the person completes a task: app UI, dashboards, editors, admin, settings, data tables, tools, authenticated surfaces ([_design-context.md](_design-context.md) → Design modes). The page is first a working product of its category, and the world serves it.

Design stage Step 3b reads `## Directions`. Step 4 reads `## Screens`.

## Directions

**The slop test.** Familiarity is often a feature here. The test: would a person fluent in the best tools of the category trust this interface at once, or pause at every slightly-off component? The failure mode is strangeness without purpose: over-decorated buttons, mismatched form controls, gratuitous motion, display fonts where labels belong, invented affordances for standard tasks. The bar is earned familiarity. The tool disappears into the task.

**What the world lends.** A person who uses tools like this one knows where everything is before they notice the world. The world lends four things only: type, palette, density, and one signature move. It never supplies the layout, the navigation model or the controls.
- Color does real jobs: a committed palette for the shell (a colored rail or header, a tinted ground), state colors, data series, selection, and the signature move. A gray screen with one accent is the category default without its polish, not restraint.
- A world taken from a tool or instrument the audience operates (a terminal, a scope, a control panel, a cockpit), or from a fictional interface, comes back as a costume. Take from it only type, palette, density and a signature move, or replace it.

**Write the shell first.** Write each direction's first viewport as the product's shell: the navigation, the work areas and what each is for, the data the person reads first and its states. Then name where the signature move lives, concretely, so the screen and the build can find it: service health drawn as a transit map, a schedule set in a timetable's column rhythm. A direction whose world shows only as a color scheme has not found its move. Expression never hides the task, the state or a familiar affordance.

**Typography.**
- System faces and workhorse UI faces are correct. One family is often right: a well-tuned sans carries headings, buttons, labels, body and data.
- Use a fixed scale, not a fluid one, at a ratio of 1.125–1.2. More type elements need less contrast between steps.
- Prose keeps a measure of 65–75 characters. Data and compact UI may run denser.

**Color.** Restrained is the default: tinted or plain neutrals and one accent at 10% or less. One surface can earn Committed, such as a dashboard where one category color carries a report.
- Standardize the state vocabulary on every screen: hover, focus, active, disabled, selected, loading, error, warning, success, info.
- Keep the accent for primary actions, current selection and state indicators, not decoration.
- Give sidebars, toolbars and panels a second neutral layer, slightly cooler or warmer than the content surface.

**Motion.** 150–250 ms on most transitions. The person is in flow; do not make them wait for choreography. Motion conveys state, feedback, loading or reveal, nothing else. No orchestrated page-load sequences.

## Screens

Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

**The screen is the product as a person uses it,** in the direction's committed palette: its shell and navigation, a distinct area for each job, and, where there is data, filters over what they scope and charts and tables with clear states.
- Every control is a standard one that the person already knows: buttons, tabs, inputs, selects, filters, tables with sortable headers, navigation that reads as navigation. Use the platform's own controls ([_platforms.md](_platforms.md)).
- Never draw a costume of the world's own interface: a function-key bar or command prompt, an instrument bezel, ruled ledger paper in place of a table. A screen that an engineer could not build from standard components is a picture of the tool.
- The finish bar is the best product in the category: an aligned grid, consistent spacing, a real type scale, clear hierarchy. The signature move adds to a clean screen; it never stands in for one.

**Real content.** Draw with the product name, realistic data with plausible values and units, real labels, and one state worth seeing (an alert, a degraded service, an empty filter result). Never draw placeholder tiles. State colors sit on the palette only where they carry meaning. A headline number that changes over time shows its recent history, with the onset of a change marked.

**Components.** Every interactive component has default, hover, focus, active, disabled, loading and error states. Use skeletons for loading content, not spinners in the content. An empty state teaches the interface. Keep one button shape, one form-control vocabulary and one icon style across the surface. An overlay escapes its clipping container.

**Refuse on an Operate surface:**
- decorative motion that conveys no state;
- an inconsistent component vocabulary: when "save" looks different in two places, one is wrong;
- display faces in labels, buttons or data cells;
- reinvented standard affordances: weird form controls, non-standard modals, custom scrollbar behavior. Theme the scrollbar color from the palette; never change its behavior;
- heavy color or full-saturation accents on inactive states;
- a modal as the first answer. Try inline and progressive options first.

**Permitted on an Operate surface:** system faces and familiar sans defaults; standard navigation (top bar and side nav, breadcrumbs, tabs, command palettes); tight density where the data needs it; the same visual answer on every repeated surface.

**Later directions vary the organization, never the world coverage:** the navigation model (side rail, top bar, command-first), how the work areas divide the screen, which data leads, the density, and where the signature move sits. Each direction differs from the first at thumbnail size. A screen that adds world material, texture or ornament goes the wrong way: on a working screen, more world is a costume.

**Self-check every screen.** With the name covered, does it read as a product of its category? Can the person do the task from it? Is it as clean as the category standard, and more distinctive? When it reads as an artifact of the world first, draw it again with the shell named region by region and the world held to its four contributions.
