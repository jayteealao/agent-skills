# Worst-case content (`design/_worst-case.md`)

The worst data that a real person or system can produce, as one catalog. The `worst` state of every screen draws the surface with these values ([_surface.md](_surface.md)), and `wf.mjs design check` runs its worst-case check in that state ([_craft-floor.md](_craft-floor.md) rule 7). The values are platform-neutral. The breaks are the same on the web, iOS, Android and desktop.

> Load with: `design/_worst-case.md`

## Worst-case content

1. **Map the surface.** List every field that the surface renders, and where each value comes from.
2. **Build the worst case.** For each field, pick the rows below that apply. Keep the values realistic: each one is something a real person could produce. Use `example.com`, `example.org` or `.test` for emails and URLs.
3. **Draw it.** Put the values in the `worst` state of the screen, at every viewport.
4. **Decide each break with the person.** A long name wraps or truncates; a missing image falls back. Record each decision in the `02c-craft.md` `## Mock fidelity inventory`.

## The catalog

**People and names** — very long and hyphenated (`Aleksandra Wiśniewska-Kowalczyk`); long with a suffix (`Christopher Alexander Montgomery III`, naive initials give `CI`); two letters and one letter (`Jo`, `J`); a leading accented capital (`Ólafur Darri Ólafsson`); stacked diacritics clipped by a tight line height (`Đặng Thị Ngọc Hân`); CJK with no spaces (`王秀英`); right-to-left (`نور الهدى عبد الرحمن`); a Persian name with a zero-width non-joiner (`می‌خواهم`); apostrophes and lowercase particles (`Seán O'Brien-Ó Súilleabháin`, `María José de la Cruz y Fernández`); all lowercase (`dana`); an emoji first or a joined emoji sequence (`🦊 Fox`, `👩🏽‍💻 Priya`), which naive character slicing splits; leading, trailing and repeated spaces; no name at all.

**Emails, URLs and identifiers** — unbreakable strings with nowhere to wrap: a 60-character email, the shortest realistic email (`a@b.co`), plus-addressing, many subdomains with a two-part TLD, a long URL whose differing part is at the end, a UUID, a long file name whose version and extension end-truncation hides, a camera file name, handle extremes (`@a`, a 35-character handle).

**Labels, titles and copy from data** — a three-line job title in a secondary slot; a long status badge; a 30-character compound word (`Benachrichtigungseinstellungen`); a translation about 30% longer than English; twelve tags on one item (needs a `+8` overflow); one tag wider than its container; a missing, empty or blank title; markup and entities that must render as literal text; a newline in a single-line field; a 2,000-character pasted description.

**Numbers and money** — `0` (zero states, division by zero); `1` (plurals); `1284` (thousands separator); `1000000` (badge width, compact form); a large currency total; a negative value; floating-point noise (`0.30000000000000004`); a percentage past its bounds (`142%`, `-3%`); `null`, `undefined` or `NaN` rendered literally; locale separators (`1.284` against `1,284`); a value that changes live (width jitter without tabular figures).

**Collections** — 0 items (does an empty state exist?); 1 item; exactly the page size and one more; 1,000+ items unpaginated; one item 10× the size of the others; items with identical names.

**Time** — now ("just now", not "0 seconds ago"); thresholds (12 days, 11 months, 3 years ago); a future date; a zero timestamp (`1970-01-01`); a time that falls on a different day in another time zone; a very long duration that never rolls up. Use the platform's locale-aware date and relative-time formatters, not hand-built strings.

**Images and media** — an image URL that fails; no image at all (the fallback); a 4000×200 panorama and a 200×4000 tall image (distortion, blown-out height); a transparent or dark logo on a dark theme; a slow image (layout shift without fixed dimensions).

**States** — loading (skeletons that do not match the final layout); an error from the API (no error state, or a raw error message); partial data in one list; every status value at once; no permission; the current person in the list ("You"); offline; a slow network; a request that times out.

**Environment** — the narrowest supported width (320 px on the web, the smallest phone, a split-screen window); a narrow side column; a very wide window; the largest system text size or 200% zoom; dark theme; a right-to-left language; touch (hover-only actions are unreachable).

## In later stages

| Stage | Use |
|---|---|
| `implement` | Make the worst case loadable beside the normal demo data, through the development means of the stack: a fixture, a story, a preview or a seed. Do not change production data or a production code path for it. |
| `verify` | Load the worst case, and capture the `worst` state of each screen ([_surface.md](_surface.md)). |
| A `harden` pass | Render the worst case at the narrowest supported width, with the Environment rows applied. Record each break as a finding: the surface and field, the worst value, what broke (`file:line` when code exists), and the fix. Then list the decisions that belong to the person, and what held. |

---

> *The catalog is adapted from Emil Kowalski's `break-ui` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
