# LIVE-VIEWS-PROBES — what the engine allowed, and what still needs a live session

Date **2026-10-03** · Engine **Claude Code 2.1.286** · Plan [WF-LIVE-VIEWS-PLAN.md](WF-LIVE-VIEWS-PLAN.md) sections 10 and 14.6

The probes of the plan, and the engine rules the build found on the way. A probe marked **pending** needs a live session, the Desktop app, or the person's eyes. The build does not depend on its result: each part that a pending probe blocks keeps its fallback until the probe passes.

## Results

| # | Probe | Result | Effect on the build |
|---|---|---|---|
| P1 | A `Client` region draws and animates in the Desktop app and in the terminal | **pending** (person, Desktop app) | The kit test T11 shows each region advances only on its own `every` timer. Each style draws a plain `Text` where the table has no `Client`. |
| P2 | `Svg` with `isInteractive` runs SMIL on the desktop | **pending** (person, Desktop app) | Style D draws its rings as `Svg` only where the table has `Svg`. |
| P3 | Braille glyph density in Windows Terminal and the Desktop font | **pending** (person) | Style D draws the 5×7 glyphs as braille at 3×2 cells. |
| P4 | Does VS Code draw a `Pane` tree? | **pending** (VS Code) | No VS Code gate; the tests cover `terminal` and `desktop`. |
| P5 | Does an open pane survive the reload that `$.config.set` causes? | **pending** (live session) | The style button stays. The view lives in `$.state` (`liveView`), so a reload keeps the tab and the details state; a closed pane opens again on `/wf-live`. |
| P6 | Is a light pane readable in a dark terminal theme? | **pending** (person) | Style E reads the `theme` row at session start and draws its dark palette in a dark theme (Y7). |
| P7 | Can a hooks module import a plain `.mjs` that `scripts/yolo-watch.mjs` also imports? | **passed** | `lib/live-events.mjs` holds the shared event rules; the mod and the watch script import it. T2 shows both raise the same events from one journal. |
| P8 | Does `$.process` run `git` from a mod on Windows within the hook limit? | **pending** (live session) | The commits fact reads `git` with a 5 s limit, every 20 s at most while the run is live. A failed run leaves the fact empty. |
| P9 | Does `$.prompt.submit` from a button run while a background Workflow is live? | **pending** (live session) | The resume and prepare buttons submit; a refusal is one log line. |
| P10 | Is a second entry in `hooks.json` `modules` loaded and isolated? | **failed**: `modules` takes one module | One module. `register.ts` calls `registerLive(on, ctx)`; the live code hooks its own events with matchers. M4 becomes one log line per hook fault, inside the one module. |
| P11 | The Desktop app draws the picker band and the `wf-dashboard` pane | **pending** (person, Desktop app) | The F5 gates stay: the band and the dashboard draw on the terminal only. T14 shows each tree validates on `desktop`. |
| P12 | Two modules of one plugin share `$.state` keys under one contract | **moot** (P10) | One module. |
| P13 | The theme keys `Text.color` accepts, and the values of the `theme` row | **pending** (person) | The palettes use hex colours, which both tables accept. |
| P14 | A `/config` change reloads a marketplace-installed plugin's module | **pending** (installed plugin) | The drawn values live in `$.state`, so a reload keeps them either way. |

## Engine rules the build found

The static check in `claude plugin validate` and the module loader refused each of these. They are not in the plan, and each one changed the architecture.

1. **One module.** `hooks.json` `modules` takes one path (P10).
2. **One hook per event without a matcher.** A plugin may hook an event once without a matcher. The live code hooks `session.start` with `{ cwd: /./u }`, `turn.start` with a matcher on the text, `command.run` with its command, and the pane's `ui.render` and `ui.close` with its id.
3. **`$` stays where it is.** `$` may be passed only to a function declared at the top level of the same file, never across an import, and never stored, spread or returned. The live code therefore builds a `LiveEngine` from `$` in each hook (one bound function per call it needs) and its helpers are top-level functions that take that facade. `register.ts` does the same with its `Host`.
4. **The result of a call that takes `on` is not kept.** `registerLive` fills a `LiveLink` object that `register.ts` passes in.
5. **A `$.state` atom is written in a const of the file that reads or writes it.** An atom imported from another file, or passed in a variable, is refused. Each file declares its own atoms; `register.ts` writes its values through a `put` that names each atom literally.
6. **`$.env.get` takes a literal name.**
7. **A state contract imports nothing.** `types/index.d.ts` spells `SdlcShaped<T>` itself.
8. **A `Client` is a JSX tag with a literal `module` path,** relative to the file.
9. **`$.fs.read` refuses a file over 4 MiB and has no offset.** The reader reads a large journal through `$.process.run` with `node -e`, from a byte offset, 2 MiB at a time (T3).
