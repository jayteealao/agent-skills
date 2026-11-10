# Platform map (`design/_platforms.md`)

The design rules name a generic term, for example "cheap property" or "minimum hit area". The platform files give the form of each term on one platform. This file holds the rules of the map and says which file a project reads. A rule does not name a platform API outside a code example.

> Load with: `design/_platforms.md`

The platform files were checked against the platform documentation on 2026-10-22. These rows were checked again on 2026-11-10: system back, spring, and screen transitions on Android; color and depth on iOS and macOS; the two notes at the end of the web file.

## Which file to read

Read this file, then only the file of each platform of the project. Take the platforms from `stack.platforms` of `00-index.md`. With no `stack`, take them from the top of the repo: Gradle files mean Android, an Xcode project means iOS, `package.json` alone means the web.

| Platform of the project | File |
|---|---|
| `web`, or an Electron app | [_platforms-web.md](_platforms-web.md) |
| `ios` | [_platforms-ios.md](_platforms-ios.md) |
| `android` | [_platforms-android.md](_platforms-android.md) |
| `desktop` (macOS, Windows) | [_platforms-desktop.md](_platforms-desktop.md) |
| a terminal surface (`cli`) | [_platforms-terminal.md](_platforms-terminal.md) |
| a platform that no file covers, for example React Native or Android Views | none: the generic rule still applies |

A screen page of the design surface is an HTML page. When you draw a screen for a native product, draw the native idioms of its platform file, and build the page with the web forms.

## Rules

1. A rule that needs a platform form names the term and points to this map.
2. Values stay platform-neutral: durations in ms, curves as four control points, springs as a duration and a bounce.
3. A platform that no file covers gets the generic rule only. The rule still applies.
4. A terminal surface has no motion form.
5. When a form in a platform file disagrees with the framework version of the project, the version of the project wins. Record the difference in the design note.
6. Translate an idiom. Do not transplant it. Rebuild navigation and controls in the vocabulary of the target platform. Carry the palette intent, the type accent and the motion personality through the theme of the target ([adapt.md](adapt.md)).
7. Use the font stack of the platform, unless the brand face is essential to the direction.

## The terms

Each platform file has one row for each term, under the same section names.

| Section | Terms |
|---|---|
| Rendering | cheap property, paint property, layout property, render thread, app thread, layer hint |
| Animation | retargetable animation, restarting animation, curve token, spring, trigger origin, entry without a mount flag, per-frame value |
| Settings and input | reduced-motion setting, hover pointer, press feedback, system back, insets and system bars, largest text size |
| Layout and input | minimum hit area, window size class, coarse pointer, interrupted gesture |
| Language and accessibility | start and end edges, locale formatter, high-contrast setting, accessibility semantics |
| Media and performance | profiling tools, deferred media loading, reserved media size, text shown during font load, long-list virtualization |
| Advanced rendering | shared-element transition, scroll-linked animation, GPU drawing surface |
| Type and system parts | hanging punctuation, balanced wrap, even-last-line wrap, tabular numerals, font smoothing, system-part colors |
| Feel check tools | the tools that slow, step and record motion |
| Idioms | top-level navigation, on/off control, choice of a few, action list, icons, color and depth, screen transitions, font stack |

## Spring conversion

A spring of duration *d* and bounce *b* has a damping ratio of 1 − *b* for *b* ≥ 0, and 1 / (1 + *b*) for *b* < 0. Where a platform takes a stiffness, stiffness = (2π / *d*)² with *d* in seconds. Example: duration 0.5 s, bounce 0.2 → damping ratio 0.8, stiffness ≈ 158.

## Terminal

The rules of a terminal surface are in [_platforms-terminal.md](_platforms-terminal.md) → Terminal.
