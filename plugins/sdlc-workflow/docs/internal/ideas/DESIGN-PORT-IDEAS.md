# Design port ideas, ranked by impact

Features of other agentic design tools that `/wf design` does not have. Research date: 2026-10-25.

## How this list was made

Four research agents covered about 90 sources: commercial AI design tools, open-source design agents on GitHub, design QA and design-system tools, design features in coding agents, and about 25 research papers. Each candidate was then checked against the design code (`lib/design-*.mjs`, `skills/wf/canvas/canvas.js`, `skills/wf/reference/design/`). A candidate that the code already covers is not in this list.

Most sources are vendor pages, READMEs or paper abstracts. Some are third-party reviews. The agents did not open every source in full, so check a source before you build from it.

## How the ranking works

The rank is the impact on the promise of the design stage: the person approves exactly what they mean, and the built product matches what they approved. An idea ranks high when it closes a gap in that chain, between the approval and the build, or between the person's intent and the screen. An idea ranks lower when it only makes the work faster or nicer, or when it needs a paid service or real users.

Effort is a guess: **S** is a day or less, **M** is a few days, **L** is a week or more.

The "Today" line says what the code does now, from the code check.

---

## Tier 1: the approval and the build stay the same

### 1. Pixel diff in verify, with capture hygiene — M

Verify runs a deterministic diff (odiff or pixelmatch, with a threshold) between each approval picture and the built capture before an agent reads them. The diff boxes the regions that changed, and the agent explains only those boxes. Capture hygiene makes the pictures reproducible: mask regions with a color, inject a capture-only stylesheet, freeze animations and the caret, and wait for fonts. Per-region match levels (strict, layout-only, ignore content) separate real drift from the mock data that real data replaces.

- From: Argos, Playwright `toHaveScreenshot`, BackstopJS, Applitools match levels, impeccable `comp-diff` (SSIM and Lab palette per region).
- Sources: https://argos-ci.com/md, https://playwright.dev/docs/api/class-pageassertions, https://applitools.com/docs/eyes/concepts/best-practices/match-levels, https://github.com/pbakaus/impeccable
- Today: verify pairs the pictures, and an agent lists the differences by eye. The repo has no diff tool.
- Impact: "no difference" becomes a fact that the tool checks, not an agent's opinion. This is the last link between the approval and the build.

### 2. Token lint in the screen check — S

A new check in `design-check.mjs` finds raw hex, px, radius and font values in the screen HTML and CSS that are not `var(--<role>)`. Each failure suggests the nearest token, ranked by value closeness, naming and how often the token is used. On accept, the agent replaces them in bulk. The move is `colorize` or `polish`.

- From: Figma Check designs (no LLM), Motiff Consistency Checker, Locofy Design Optimiser, stylelint-declaration-strict-value, 21st Design Bug Bot.
- Sources: https://help.figma.com/hc/en-us/articles/39592284074263, https://motiff.com/blog/ai-consistency-checker
- Today: the screen check measures contrast, target size, viewport fit, worst case and states, and does not read tokens. Only the post-build `audit` scores hard-coded values.
- Impact: the agent drifts away from `tokens.css` while it draws. Drift in the screen becomes drift in the build.

### 3. Mocks drawn with the real components — L

The design agent reads the project's own components (a shadcn registry, Storybook, the repo) and draws screens with them, not with look-alike HTML. The visual contract carries a map from each screen part to a code import (a Code Connect map), so implement reuses the component and does not rebuild it.

- From: Bolt Design System Agents, v0 shadcn registry, Figma Make kits and Code Connect, Subframe, Builder Fusion, superdesign `<sd-component>`, shadcn MCP, Storybook MCP `docs-show`.
- Sources: https://bolt.new/blog/bolt-design-system-agents, https://ui.shadcn.com/docs/mcp, https://github.com/superdesigndev/superdesign-skill
- Today: screens are standalone pages, and `_surface.md` forbids importing product code into a screen. A component map would keep that rule, because it maps parts and imports no code.
- Impact: it shrinks the gap that verify must close, at the source.

### 4. A design-detector hook during implement — M

While implement edits UI files, a post-write hook runs the mechanical rules (contrast, overflow, token drift, the visual contract's screen keys) and puts the findings into the agent's context. A deeper pass over every touched file runs at Stop.

- From: impeccable `reference/hooks.md` and its 62 deterministic rules (CLI and browser extension).
- Source: https://github.com/pbakaus/impeccable
- Today: the hooks verify the records. No hook checks UI code against the design during implement.
- Impact: the build fails early, while the code is written, not at verify.

### 5. Element-level fidelity and root cause in verify — M

Verify matches the built screen's elements to the approved screen's elements. It reports missing blocks, missing text, and deltas in position and color. Under each difference, it lists the tag, class, box and computed CSS that changed. We own both DOMs, so this needs no vision model.

- From: Design2Code metrics (Block-Match, text, position, color), Applitools Root Cause Analysis.
- Sources: https://arxiv.org/abs/2403.03163, https://applitools.com/docs/eyes/concepts/reviewing-tests/root-cause-analysis
- Today: no DOM comparison.
- Impact: a difference names the CSS property that drifted and the move that fixes it.

### 6. Redraw the current screen first, and capture a live URL — M

Before a redesign of an existing screen, the agent redraws the current screen exactly, with no changes, as the baseline. Every variant then differs from the truth, not from an invented page. A capture command takes a live URL into screen pages, plus a DESIGN.md draft with DTCG tokens read from computed styles, each with a confidence score.

- From: superdesign-skill (Step 3a), Dembrandt, Claude Design web capture, Paper Snapshot, design-md-chrome, stitch-skills `extract-static-html`, dyad theme from a site.
- Sources: https://github.com/superdesigndev/superdesign-skill, https://themenonlab.blog/blog/dembrandt-extract-website-design-system-tokens-cli, https://www.anthropic.com/news/claude-design-anthropic-labs, https://github.com/bergside/design-md-chrome
- Today: the stage changes an existing screen page in place. Import takes a canvas, a claude.ai design project, a folder, a zip or images, and not a URL.
- Impact: `setup` and `extract` start from the product as it is. Brownfield redesigns stop inventing a "before".

## Tier 2: the person's input is exact

### 7. Strokes, scoped edits and inline text on the canvas — M

On the canvas, the person draws on a screen: a closed loop means "this thing", an arrow means "move", a cross means "remove". A tap on an element plus an instruction becomes a request scoped to that element, with its selector and a cropped picture. Several open comments go to the agent as one batch, which becomes one revision and one commit. Cmd-click selects several elements for one request. Copy edits write straight to the page with no agent turn.

- From: Lovable (select, edit, draw, comment), v0 Design Mode, Stitch annotate, impeccable `live.md`, tldraw make-real, bananatape, Agentation, Windsurf "Send element", Cursor Design Mode.
- Sources: https://docs.lovable.dev/features/design.md, https://v0.app/docs/design-mode, https://github.com/tldraw/make-real, https://github.com/benjitaylor/agentation
- Today: comments store a selector, a point, the state and the viewport. The canvas has no strokes, no inline edit and no batch revision.
- Impact: the person reviews on the phone, where typing is slow and pointing is fast.

### 8. Knobs per screen — M

The agent declares 0 to 4 coarse knobs per screen or per variant (`range`, `steps`, `toggle`), each bound to a CSS variable. The canvas shows one control per knob. A change re-renders the screen at once and costs no agent turn. On approval, the chosen values go into `tokens.css` or the page, and the agent receives only the values that changed.

- From: Claude Design knobs and Tweaks, impeccable `live.md` §7, Magic Patterns Controls, the `playground` skill.
- Sources: https://www.anthropic.com/news/claude-design-anthropic-labs, https://github.com/pbakaus/impeccable
- Today: no knobs.
- Impact: "a bit tighter" becomes a drag, not another decision round.

### 9. Check modes: color scheme, contrast preference, motion, locale — M

The check runs each screen in more modes, as extra columns on the canvas: dark color scheme, `forced-colors`, `prefers-contrast`, reduced motion, a long-word locale and RTL. Each mode keeps its own approval picture. Headless Chromium emulates the media features over the DevTools protocol.

- From: Chromatic modes (viewport, theme, locale), Polypane simulators, Chrome DevTools Rendering, Framer AI Translate.
- Sources: https://chromatic.com/docs/modes, https://polypane.app/docs/simulators
- Today: the check renders each screen in one color scheme only. `harden.md` and `_platforms.md` name these preferences, but the check does not render them.
- Impact: dark mode and RTL failures are common, and no check catches them today.

### 10. Interaction states — M

The check captures and checks hover, focus, active, disabled and open-menu states beside the five data states. It forces each state through the DevTools protocol (`CSS.forcePseudoState`) and runs the contrast and target checks on it.

- From: Vercel Toolbar accessibility audit (it records interactions to test hover and focus).
- Source: https://vercel.com/docs/vercel-toolbar
- Today: the moves describe hover and focus. The check measures only the five data states.
- Impact: focus rings and contrast often fail in these brief states.

### 11. A display-bug check — S

A new check finds overlapping text and element boxes, broken images, and the literal text `undefined`, `null`, `NaN` or `[object Object]` in every state.

- From: OwlEye and Nighthawk (display bugs: occlusion, overlap, missing image, null value).
- Source: https://arxiv.org/abs/2205.13945
- Today: no such check.
- Impact: cheap and deterministic, and it catches defects that the person can miss on a small screen.

### 12. Play mode on the canvas — S

A play mode opens a screen full size and follows its links, so the person clicks through a flow. A control switches the state in the middle of the flow.

- From: Stitch play button, Claude Design, Visily, Replit Design.
- Source: https://www.unite.ai/google-stitch-review/
- Today: links between screens draw the flows on the canvas, but the canvas has no play mode.
- Impact: the person approves a journey, not only single frames.

### 13. A taste profile — M

Every pick and rejection, with the person's reason, goes to a taste profile in the design record whose weight fades over time. Directions and critique read the nearest examples, and the agent warns when a request goes against the profile.

- From: gstack `design-consultation` (`taste-profile.json`), DesignPref (designers agree at α=0.25; per-person retrieval beats a majority judge).
- Sources: https://github.com/garrytan/gstack, https://arxiv.org/abs/2511.20513
- Today: Step 3b writes the reasons into one workflow's contract. `direction.md` keeps open decisions. Nothing learns across workflows.
- Impact: each round starts closer to what this person wants.

### 14. Controlled variants — S

A variant request carries a range (refine, explore or reimagine), locks on the aspects that must not change (layout, color, imagery, font, copy) and a count.

- From: Google Stitch Generate Variations, MagicPath, Variant.
- Sources: https://tutorialsdojo.com/what-google-stitch-actually-does-and-where-it-falls-short/, https://abduzeedo.com/variant-ai-design-tool-thinks-scrolls
- Today: Step 3b draws three directions on named axes. A move pass changes one screen. No range and no locks.
- Impact: a decision round becomes a controlled experiment, not a reroll.

## Tier 3: stronger checks and a cleaner approval

### 15. Accessibility-tree snapshot and focus-order overlay — M

Each state keeps a YAML ARIA snapshot next to its picture, and verify diffs it line by line. The canvas draws numbered focus stops and arrows over a screen, and flags a stop where the visual order and the DOM order differ.

- From: Playwright `toMatchAriaSnapshot`, Argos ARIA diffs, Accessibility Insights FastPass tab stops, Polypane, Stark.
- Sources: https://playwright.dev/docs/aria-snapshots, https://accessibilityinsights.io/docs/web/getstarted/fastpass
- Today: no snapshot and no overlay.
- Impact: a picture does not show semantic drift. The person approves keyboard order at a glance.

### 16. Failures grouped by root cause — S

The check groups failures that share a cause, for example one token that causes 12 contrast failures, and offers one move per group. Similar differences in verify are grouped for one decision.

- From: A11YRepair, Percy Visual Review Agent, Applitools auto-maintenance.
- Sources: https://www.emergentmind.com/papers/2606.21926, https://browserstack.com/docs/percy/review-agent/overview
- Today: each failure is a separate line with its own move.
- Impact: fewer and coherent fixes, and the tokens stay consistent.

### 17. A verdict for each picture, ignore by fingerprint, and an accessibility debt baseline — M

Each screen × viewport × state gets its own verdict, so the person can reject one state without reopening the whole design. Verify can silence one known change by its fingerprint, not by masking a region. The accessibility violations present at approval become a baseline, and verify fails only on new ones.

- From: Chromatic (per-mode approval, accessibility regression baseline), Argos (ignore a change, flaky score), Happo.
- Sources: https://chromatic.com/docs/accessibility, https://argos-ci.com/changelog/2025-07-20-ignore-changes
- Today: one approval commit covers every screen of the workflow.
- Impact: existing debt in a brownfield app stops blocking the stage.

### 18. A flow map before the screens — M

When a feature adds several screens, the agent first draws a sitemap or user-flow map, and the person approves the structure before any pixels.

- From: Relume (sitemap, then wireframes), Tempo Labs (PRD and flow diagram first), Whimsical, Visily.
- Source: https://relume.io/
- Today: flows come from the links of drawn screens, after the drawing.
- Impact: structure is settled before style, so screen rounds rework less.

### 19. Simulated users — L

Persona agents try the brief's key tasks through the linked screen pages in a headless browser. The report gives step counts, misclicks, dead ends and a short interview per persona.

- From: UXAgent, AgentA/B, PerceptUI, Uxia, Synthetic Users, Maze misclick metrics.
- Sources: https://arxiv.org/abs/2504.09407, https://arxiv.org/abs/2504.09723
- Today: the persona critique reads the screens. No agent does the tasks.
- Impact: usability evidence before the approval, from real clicks on the mocks.

### 20. Shared shell templates — S

The nav, the sidebar and other shell parts are drawn once as templates, and every screen includes them.

- From: superdesign-skill `references/COMPONENTS.md`.
- Source: https://github.com/superdesigndev/superdesign-skill
- Today: each screen page holds its own copy of the shell.
- Impact: screens stay consistent, and a shell change is one edit.

### 21. Compatibility with the DESIGN.md spec — M

`/wf design sync` reads and writes the open DESIGN.md spec of Google Stitch. It adds `lint` (broken refs, orphaned tokens, component contrast), `diff` with a regression flag, and export to Tailwind v4 `@theme` and DTCG 2025.10 `.tokens.json`.

- From: google-labs-code/design.md, DTCG 2025.10, Style Dictionary v5.
- Sources: https://github.com/google-labs-code/design.md, https://www.w3.org/community/design-tokens/
- Today: `tokens.css` is the only output. No DTCG.
- Impact: other agents and Stitch can read our DESIGN.md, and the approved tokens reach the codebase with no second copy.

### 22. Distinguishing variations, chips and a style dropper — M

The variants change only the 3 to 5 properties that change the look most. Those properties show as chips, and the person mixes chips into the next round. A style dropper puts the look of one variant on the layout of another.

- From: Apple Celestial, DesignWeaver (CHI'25), Variant.
- Sources: https://machinelearning.apple.com/research/we-notice, https://arxiv.org/abs/2502.09867
- Today: Step 3b mixes directions in words ("the layout of 2 and the type of 3").
- Impact: the person steers without design words.

### 23. One agent and one branch per direction — M

Each direction gets its own sub-agent and branch. The canvas shows a tree of drafts, and the person forks any node.

- From: Stitch Agent Manager, superdesign parallel generation and branch mode, Onlook branches, Cursor parallel agents.
- Sources: https://docs.superdesign.dev/features/design-agent/parallel-generation, https://github.com/onlook-dev/onlook
- Today: the directions are drawn as explore sketches. History is a line of commits.
- Impact: separate context per direction, and risky ideas stay off the approved line.

### 24. A live variant mode in the real dev server — L

The person clicks an element in the running app. The agent writes N variants, hot reload swaps them in, and the accepted variant goes into the source as a small diff.

- From: impeccable `live` and `generate`, Onlook, Builder Fusion (minimal-diff PRs), v0.
- Sources: https://github.com/pbakaus/impeccable, https://www.builder.io/blog/designers-can-ship-without-engineering-handoffs
- Today: decision rounds happen only on standalone screen pages.
- Impact: closes a verify mismatch without a new design round.

### 25. More compare views on the canvas — S

Add overlay with an opacity slider, onion skin, swipe and a diff view between the approval picture and the built capture, or between two commits.

- From: Argos, Happo, Pixelay, PerfectPixel.
- Source: https://docs.hypermatic.com/pixelay/compare-designs
- Today: the canvas has side-by-side compare with a past commit, and the capture beside its screen.
- Impact: small differences show on a phone screen.

### 26. A richer comparison board — S

The direction gate adds a rating, notes and "more like this" to each option. Submit writes `feedback.json`. Regenerate writes a pending file, and the agent reloads the board with new options.

- From: gstack `design-shotgun`, superpowers visual companion (click-to-choose writes an events file).
- Sources: https://github.com/garrytan/gstack, https://github.com/obra/superpowers
- Today: one gate question: pick a number, mix numbers, or run another round.
- Impact: a richer signal per round.

### 27. Directions dealt from a catalog — M

A script deals the directions from a catalog of visual worlds: one lead and challengers on equal cards. A re-roll in a plainer, safer or bolder register never repeats a world already shown. Each direction spec can carry a typicality weight, so variety becomes a measured choice.

- From: impeccable `roll`, ui-ux-pro-max `styles.csv`, awesome-design-md, the vibe-design-agents paper (typicality weights).
- Sources: https://github.com/pbakaus/impeccable, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, https://arxiv.org/abs/2609.15078
- Today: the agent picks 3 of 7 candidates from the mode file, plus the canon.
- Impact: breaks the drift toward the model's favorite look.

### 28. A predicted attention check — M

A saliency model runs on each screen. The check fails when the primary action is outside the region with the most attention, and the move is `bolder` or `layout`.

- From: UEyes (public data and models), Attention Insight, Uizard Focus Predictor, UX Pilot heatmap and gaze order.
- Sources: https://userinterfaces.aalto.fi/ueyeschi23, https://attentioninsight.com/features, https://uxpilot.ai/ai-ux-audit
- Today: no attention check.
- Impact: a hierarchy check that measures. The vendors say the maps are estimates.

### 29. Console errors and layout shift during capture — S

A screen capture fails on a console error, an uncaught exception or a failed request. The check also measures layout shift from the loading state to the default state.

- From: Marker.io, Meticulous, Vercel Layout Shift tool, Windsurf (console errors to the agent).
- Source: https://vercel.com/docs/vercel-toolbar
- Today: the check throws only when its own measurement script fails. It does not read the page console.
- Impact: a screen with a broken script can still look right in a picture.

### 30. Re-sync with impeccable 4.7.0 and 4.7.1 — S

Port the rules added after our port: `straggler` (a last line of one word), `unbalanced-heading`, a side stripe on a status row, hard offset shadows, contrast over sheared and blended backgrounds, and exemptions for legal text and hidden mockups.

- Source: https://github.com/pbakaus/impeccable (tag skill-v4.7.0, commit "Release 4.7.1 (#1159)").
- Today: our moves come from v4.7.0, without the detector rules.
- Impact: direct additions to the craft floor at low cost.

### 31. A spacing rhythm and alignment check — S

A new check flags uneven gaps between siblings and edges that almost align.

- From: Locofy Design Optimiser.
- Source: https://www.locofy.ai/docs/lightning
- Today: no such check.
- Impact: a mechanical polish check that headless Chromium can measure.

### 32. Score and prune variants, and judge in both orders — M

A UIClip-style model scores each variant, and the weak half is dropped before the person sees it. Every A/B judgement by an agent runs as A,B and again as B,A, and a win counts only when both orders agree.

- From: UIClip (UIST'24), WiserUI-Bench (order bias in models).
- Sources: https://arxiv.org/abs/2404.12500, https://arxiv.org/abs/2505.05026
- Today: no scoring and no order check.
- Impact: the person spends attention only on strong options.

### 33. Proof that the screenshot was read — S

Before a verdict on a picture counts, a sub-agent with no context must quote details from the picture that it could not guess from the spec.

- From: Ghostlight MCP, wshobson `ui-visual-validator` ("the goal is NOT met until proven").
- Sources: https://glama.ai/mcp/servers/banditburai/ghostlight, https://github.com/wshobson/agents
- Today: no such check.
- Impact: guards against a verdict written from the spec, not from the picture.

### 34. Better critique: boxed findings, UICrit examples, round limits — S

Each critique finding carries a box on the picture, and a second pass tightens the box and the text. Few-shot examples come from the UICrit dataset. Critique rotates its guideline set or stops after a fixed number of rounds.

- From: UICrit (few-shot gave a 55% gain), iterative visual prompting, Duan et al. (critique helps less with each round).
- Sources: https://github.com/google-research-datasets/uicrit, https://arxiv.org/abs/2412.16829, https://arxiv.org/html/2403.13139v1
- Today: critique writes text findings.
- Impact: the person sees where each finding is, as with check failures.

## Tier 4: grounding and content

### 35. Pattern references in the brief — M

For each screen type (onboarding, checkout, paywall), the brief fetches 5 to 10 real references and shows them beside the directions.

- From: Mobbin MCP, Refero MCP. Both need a paid key, so this is optional.
- Source: https://doc.refero.design/mcp/getting-started
- Today: references are files that the person adds.
- Impact: directions rest on proven patterns.

### 36. A logo check — S

After drawing, the agent checks each logo position for the exact brand asset, and rejects initials, emoji and invented SVGs.

- From: superdesign-skill "logo render postcondition".
- Source: https://github.com/superdesigndev/superdesign-skill
- Impact: a deterministic check of a mistake that the person sees at once.

### 37. Real assets in mocks — M

Tools extract logos and images from a source picture, remove backgrounds, and generate imagery that fits the brand.

- From: screenshot-to-code agent tools, Figma `generate_image`, Lovable, Readdy.
- Source: https://github.com/abi/screenshot-to-code
- Impact: grey boxes weaken the person's judgement.

### 38. Realistic mock content from connectors — M

Mock data comes from real records (Notion, Linear, analytics), with private data masked.

- From: Magic Patterns connectors, Bolt.
- Source: https://www.magicpatterns.com/docs/documentation/features/overview.md
- Impact: production-like data exposes real worst cases.

### 39. APCA contrast beside WCAG — S

The contrast check also reports the APCA Lc value and the minimum font size for the actual weight. A palette builder can make color roles from contrast targets, so contrast passes by construction.

- From: apca-w3, Huetone, Leonardo (Adobe), Radix custom palettes.
- Sources: https://github.com/Myndex/apca-w3, https://leonardocolor.io
- Impact: a sharper move for thin and large text.

## Tier 5: handoff and reach

### 40. A graded report with a regression baseline — S

The design review gives a grade per category plus an AI-slop grade, stored as a baseline, with a regression mode against it. The fix loop makes one commit per fix, with before and after pictures.

- From: gstack `design-review`.
- Source: https://github.com/garrytan/gstack
- Impact: one trend across rounds, and each fix can be reverted alone.

### 41. One sticky PR comment — S

One comment per PR carries the design check results, a score and the diffs, and is rewritten on each push. It never blocks the merge.

- From: 21st Design Bug Bot, Argos, reg-suit.
- Source: https://21st.dev/design-bug-bot
- Impact: the design results are where code reviewers already look.

### 42. An MCP server for the design surface — M

The design server also serves screens, tokens, the contract and comments as MCP tools for agents on other hosts.

- From: Stitch, Subframe, Magic Patterns, Anima, Relume, Framer.
- Source: https://www.subframe.com/
- Impact: an implement agent anywhere can read the visual contract live.

### 43. Export of approved screens — M

Approved screens go to Figma, Penpot or `.pen` frames, or to a PDF deck of the decision round.

- From: Figma Make "copy design", Stitch, Penpot MCP, pencil, Claude Design (PDF, PPTX).
- Source: https://help.figma.com/hc/en-us/articles/35710574222487
- Impact: designers continue in their own tool, and the approval reaches people who never open the canvas.

### 44. A lo-fi switch — S

Early rounds show the screens as wireframes, with the same elements and no styling.

- From: Visily, Uizard, Figma First Draft.
- Source: https://www.banani.co/blog/visily-ai-review
- Impact: the person reviews structure without the distraction of style.

### 45. Voice comments from the phone — M

The person taps an element on the phone canvas and speaks the comment.

- From: Stitch voice mode, Cursor 3.7 point-and-speak.
- Source: https://nervegna.substack.com/p/vibe-design-is-real-inside-google
- Impact: faster review away from the desk.

### 46. A walkthrough video of an approved flow — S

A script records the play-through of an approved flow as a video.

- From: stitch-skills `remotion`.
- Source: https://github.com/google-labs-code/stitch-skills
- Impact: a shareable record of the approval.

## Smaller ideas

These are smaller, narrower or already partly covered. They are ranked by impact too.

47. **Desktop and native capture.** Scan a running Electron or WebView2 window over CDP, and capture from the iOS Simulator and the Android emulator. Today the check judges every platform in Chromium only. Source: impeccable 4.7.0 `detect --cdp`.
48. **Cross-engine capture.** Add WebKit and Firefox to the check and to verify. Today the check runs Chromium only. Source: https://happo.io
49. **Ask before drawing from a sketch.** On an image or sketch import, the agent asks 1 to 3 questions before it draws. Experts preferred models that ask. Source: https://huggingface.co/papers/2410.16232
50. **Hand-sketch import.** A photo of a paper wireframe becomes a screen page, with a grouping pass that builds the page block by block. Sources: Uizard Wireframe Scanner, DesignCoder https://arxiv.org/html/2506.13663v1
51. **Screen recording import.** A recorded interaction becomes a linked flow. Source: https://github.com/abi/screenshot-to-code
52. **Layout as boxes first.** Draft a CSS-box wireframe with normalized coordinates, check it, then style it. Source: LayoutGPT https://arxiv.org/abs/2305.15393
53. **Insert mode.** The person drops a sized placeholder on a screen and writes a prompt, and the agent fills that slot. Source: impeccable `live.md`.
54. **Agent-built custom checks.** The person describes a rule in words, and the agent writes it as a new check for the screen check. Source: Figma Config 2026 agent skills.
55. **Bulk property swap.** List every unique value of a property across the screens, then replace all matches. Source: pencil `replace_all_matching_properties`.
56. **Per-screen override files.** A screen keeps only its deviations from DESIGN.md in its own file. Sources: ui-ux-pro-max `pages/<page>.md`, impeccable `.impeccable/surfaces/`.
57. **Searchable design knowledge.** The agent looks up styles, palettes, font pairs and UX rules with BM25 over data files, instead of loading long prose. Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
58. **Fingerprinted resume.** A resume file keeps the SHA-256 of each context file, so a later round skips discovery unless a hash changed. Source: superdesign-skill `references/RESUME.md`.
59. **Starter design-system library.** Brand DESIGN.md files and tagged style guides as starting directions. Sources: VoltAgent/awesome-design-md, pencil `get_style_guide`.
60. **A sameness self-test.** The agent works a similar prompt and checks whether it reaches the same plan, before it draws. Source: anthropics frontend-design `SKILL.md`. Possibly partly covered by the craft floor; not checked.
61. **Storybook in verify.** Pick the stories affected by the change and run their accessibility tests next to the screen pictures. Source: Storybook MCP `stories-changed`, `test-run`.
62. **Numbered labels on pictures.** Overlay numbered labels and keep an element list per screen, so the person and critique can say "#7". Sources: ScreenAI https://arxiv.org/abs/2402.04615, agent-browser `--annotate` (seen in a fork).
63. **A request queue.** The person sends edits while the agent is busy, and they run afterwards. Source: Lovable.
64. **@-mentions in comments.** Mention screens, tokens and assets in a comment thread. Source: Framer AI.
65. **Mirrored interaction.** A scroll or click in one viewport repeats in all viewports on the canvas. Sources: Polypane, Responsively, Sizzy.
66. **Restricted sharing of the publish page.** A password or organization-only access for the published canvas. Sources: Figma Make, Claude Design.
67. **Live multiplayer.** Several people and the agent in one canvas session. Sources: Claude Design, Magic Patterns, MagicPath.
68. **Human micro-tests.** First-click and five-second tests on the publish page. Sources: UXtweak, Maze. Needs real users.
69. **A/B variant pairs.** An approval carries two variants and a test plan linked to analytics. Sources: Webflow Optimize, Framer. Needs an analytics service.

## Not recommended

- **Variants from several model providers, then merged.** From screenshot-to-code. It goes against the rule that consult is not a `/wf` step. Keep it out, or make it strictly opt-in.
