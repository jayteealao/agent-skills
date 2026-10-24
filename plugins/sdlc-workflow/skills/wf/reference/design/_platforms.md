# Platform map (`design/_platforms.md`)

The single source for platform forms. The design rules ([animate.md](animate.md), [_motion-recipes.md](_motion-recipes.md), [harden.md](harden.md), [adapt.md](adapt.md), [optimize.md](optimize.md), [overdrive.md](overdrive.md), [polish.md](polish.md), [typeset.md](typeset.md) and the other moves) name a generic term; this file gives the term's form on each platform. A rule never names a platform API outside a code example.

> Load with: `design/_platforms.md`

Platforms: the web; iOS (SwiftUI and UIKit); Android with Jetpack Compose; desktop (macOS with AppKit and Core Animation; Windows with WinUI 3 and `Microsoft.UI.Composition`; an Electron app uses the web column). Checked against the platform documentation on 2026-10-19. The sections from "Layout and input" to "Idioms" were checked on 2026-10-22. Check such a form against the documentation of the project's framework version before you rely on it (Rule 5).

## Rules

1. A rule that needs a platform form names the term and points here.
2. Values stay platform-neutral: durations in ms, curves as four control points, springs as a duration and a bounce.
3. A platform this map does not cover (for example React Native or Android Views) gets the generic rule only. The rule still applies.
4. A terminal UI has no motion form. The frequency and purpose gates, worst-case content and native feel still apply.
5. When a platform form here disagrees with the project's own framework version, the project's version wins; record the difference in the design note.

## Rendering

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **cheap property** — changes without new layout or paint | `transform`, `opacity`, `filter` | Layer `transform`, `opacity`; SwiftUI `.offset`, `.scaleEffect`, `.rotationEffect`, `.opacity` | `Modifier.graphicsLayer { translationX/Y, scaleX/Y, rotationZ, alpha }` | macOS: layer `transform`, `opacity` (layer-backed views). Windows: `Visual.Offset`, `Visual.Scale`, `Visual.Opacity`, `Visual.RotationAngleInDegrees` |
| **paint property** — redraws, moves nothing else | `color`, `background-color`, `box-shadow`, `border-radius`, `clip-path` | Layer `backgroundColor`, `cornerRadius`, `shadowRadius` (set `shadowPath`, or every frame renders the shadow offscreen) | Content drawn in `Modifier.drawBehind { }` / `drawWithContent { }` | macOS: layer `backgroundColor`, `cornerRadius`. Windows: brush and shape changes |
| **layout property** — moves other elements | `width`, `height`, `padding`, `margin`, `top`, `left` | `frame`, `bounds`, Auto Layout `constant`; SwiftUI `.frame`, `.padding` | `Modifier.size`, `.padding`, `animateContentSize()` | macOS: frame and constraints. Windows: `Width`, `Height`, `Margin` |
| **render thread** | The compositor thread | The render server | `RenderThread` | macOS: the window server and Core Animation. Windows: the composition engine (DWM) |
| **app thread** | The main thread | The main thread | The main thread (composition, layout, draw) | The UI thread |
| **layer hint** | `will-change: transform` | `shouldRasterize` for static content only | A `graphicsLayer { }` already makes a layer; `CompositingStrategy.Offscreen` is for alpha correctness, not speed | macOS: `wantsLayer`. Windows: a `Visual` is already a layer |

## Animation

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **retargetable animation** | CSS transition; Web Animations API (`element.animate`) | SwiftUI `withAnimation` / `.animation` (springs keep velocity when retargeted); `UIViewPropertyAnimator` | `animate*AsState`, `Animatable.animateTo`, `updateTransition` | macOS: `NSAnimationContext`, implicit layer animations. Windows: implicit animations (`Compositor.CreateImplicitAnimationCollection()` on `Visual.ImplicitAnimations`); spring animations retarget best |
| **restarting animation** | CSS `@keyframes` | `CAKeyframeAnimation`; SwiftUI `keyframeAnimator` | `keyframes { }` spec; `rememberInfiniteTransition` | Windows: `Compositor.CreateScalarKeyFrameAnimation()` / `CreateVector3KeyFrameAnimation()` |
| **curve token** (x1, y1, x2, y2) | `cubic-bezier(x1, y1, x2, y2)` | SwiftUI `.timingCurve(x1, y1, x2, y2, duration:)`; UIKit `UICubicTimingParameters(controlPoint1:controlPoint2:)`; `CAMediaTimingFunction(controlPoints:)` | `CubicBezierEasing(x1, y1, x2, y2)` | macOS: `CAMediaTimingFunction(controlPoints:)`. Windows: `Compositor.CreateCubicBezierEasingFunction(p1, p2)` |
| **spring** (duration, bounce) | Motion `{ type: "spring", duration, bounce }` (or `visualDuration`) | SwiftUI `.spring(duration:bounce:)`, `Spring(duration:bounce:)`; `CASpringAnimation(perceptualDuration:bounce:)` | `spring(dampingRatio, stiffness)`; `Spring.DampingRatioNoBouncy` = 1 | macOS: `CASpringAnimation(perceptualDuration:bounce:)`. Windows: `Compositor.CreateSpringVector3Animation()` with `DampingRatio`, `Period` |
| **trigger origin** | `transform-origin`; Base UI sets `--transform-origin` on the positioner | `CALayer.anchorPoint`; SwiftUI `scaleEffect(_:anchor:)` | `graphicsLayer { transformOrigin = TransformOrigin(x, y) }` | macOS: `anchorPoint`. Windows: `Visual.CenterPoint` |
| **entry without a mount flag** | `@starting-style` | SwiftUI `.transition()` on a conditionally inserted view | `AnimatedVisibility(enter = …, exit = …)` | Windows: `ElementCompositionPreview.SetImplicitShowAnimation` (`Microsoft.UI.Xaml.Hosting`) |
| **per-frame value** | Write the element's style or a motion value, never component state | `@GestureState` for drag values; update the moving view's modifier, not a state that rebuilds a large view | Read the value in the layout or draw phase: the lambda modifiers `offset { }`, `graphicsLayer { }`, `drawBehind { }` | The toolkit's animated property, never a rebuild of the tree |

**Spring conversion.** A spring of duration *d* and bounce *b* has a damping ratio of 1 − *b* for *b* ≥ 0, and 1 / (1 + *b*) for *b* < 0. For Compose, stiffness = (2π / *d*)² with *d* in seconds. Example: duration 0.5 s, bounce 0.2 → damping ratio 0.8, stiffness ≈ 158.

**Web libraries.** In Motion, the `x`, `y`, `scale` and `rotate` shorthands and a `transform` string are both hardware-accelerated. A transform driven by a CSS variable is not: that is the "inherited value" trap of [animate.md](animate.md) → Performance.

## Settings and input

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **reduced-motion setting** | `@media (prefers-reduced-motion: reduce)` | SwiftUI `@Environment(\.accessibilityReduceMotion)`; `UIAccessibility.isReduceMotionEnabled` | No Compose API: Compose scales animation time by `MotionDurationScale`, which follows the system "Remove animations" setting (`ANIMATOR_DURATION_SCALE` = 0); check `ValueAnimator.areAnimatorsEnabled()` for a non-animation fallback | macOS: `NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`. Windows: `UISettings.AnimationsEnabled` |
| **hover pointer** | `@media (hover: hover) and (pointer: fine)` | iPadOS pointer only: `.hoverEffect`, `.onContinuousHover`, `UIPointerInteraction` | Hover events from a mouse or stylus only: `Modifier.hoverable(interactionSource)`, `PointerEventType.Enter` | Always present: SwiftUI `.onHover`, `NSTrackingArea`; Windows `PointerEntered` |
| **press feedback** | `:active` scale | Scale on press; haptics `.sensoryFeedback(_:trigger:)` or `UIImpactFeedbackGenerator` | Scale from `interactionSource.collectIsPressedAsState()`; haptics `LocalHapticFeedback.current.performHapticFeedback(HapticFeedbackType.Confirm / ToggleOn / LongPress / VirtualKey)` | Scale on press; macOS trackpad `NSHapticFeedbackManager` |
| **system back** | Browser history | The interactive back swipe (`interactivePopGestureRecognizer`) | `NavigationBackHandler` with `rememberNavigationEventState` (`androidx.navigationevent.compose`); Navigation 3 handles it; `PredictiveBackHandler` and `BackHandler` are the older APIs | Escape, Cmd+[ or Alt+Left by platform convention |
| **insets and system bars** | `env(safe-area-inset-*)` with `viewport-fit=cover`; `dvh` units; `<meta name="theme-color">` | Safe area (`safeAreaInsets`, `.ignoresSafeArea` only for backgrounds) | `enableEdgeToEdge()`, `WindowInsets.safeDrawing`, `WindowInsets.ime`, `Modifier.imePadding()` | Title bar and window chrome; full-screen safe area on macOS |
| **largest text size** | Browser zoom 200% and the text-size setting | Dynamic Type, accessibility sizes | Font scale 200% (non-linear scaling) | macOS text size; Windows text scaling 225% |

## Layout and input

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **minimum hit area** | 44×44 CSS px; a small control extends its hit area with padding or a pseudo-element | 44×44 pt | 48×48 dp; `Modifier.minimumInteractiveComponentSize()` (Material 3 controls apply it) | macOS: 28×28 pt. Windows: 40×40 epx for touch. Electron: the web column |
| **window size class** | Width breakpoints in media or container queries: `@media (width >= 600px)`, `@container` | `horizontalSizeClass` and `verticalSizeClass` (compact or regular): SwiftUI `@Environment(\.horizontalSizeClass)`; UIKit `traitCollection.horizontalSizeClass` | `currentWindowAdaptiveInfo().windowSizeClass`: compact below 600 dp, medium below 840 dp, expanded and wider from 840 dp | The window's own width. macOS: SwiftUI `ViewThatFits`, `GeometryReader`. Windows: `AdaptiveTrigger` (`MinWindowWidth`) in a `VisualStateManager` state |
| **coarse pointer** | `@media (pointer: coarse)`; `@media (any-pointer: coarse)` when touch is one input of several | Touch is the primary input; an iPad with a trackpad adds a **hover pointer** | `PointerType.Touch` on `PointerInputChange.type`; a mouse or stylus reports `PointerType.Mouse` or `PointerType.Stylus` | Windows: `PointerDeviceType.Touch` on the event's `Pointer.PointerDeviceType`. macOS: no touch screen; the trackpad is a fine pointer |
| **interrupted gesture** | `pointercancel` and `lostpointercapture`; the window's `blur`; capture with `setPointerCapture` | UIKit `touchesCancelled(_:with:)` and a recognizer state of `.cancelled`; SwiftUI `@GestureState` resets on cancel, and `onEnded` does not run | `detectDragGestures(onDragCancel = …)`; `tryAwaitRelease()` returns false when a press is cancelled | Windows: `PointerCanceled`, `PointerCaptureLost`. macOS: reset drag state on `NSWindow.didResignKeyNotification`; `mouseUp(with:)` may never arrive |

## Language and accessibility

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **start and end edges** | Logical properties: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`; `dir="rtl"`; flip a direction icon under `:dir(rtl)` | `.leading` and `.trailing`; `leadingAnchor`; `NSDirectionalEdgeInsets`; `.flipsForRightToLeftLayoutDirection(true)` | `Modifier.padding(start = …, end = …)`; `Arrangement.Start`; `LocalLayoutDirection`; `Icons.AutoMirrored` icons | macOS: `leadingAnchor`, `userInterfaceLayoutDirection`. Windows: `FlowDirection="RightToLeft"` |
| **locale formatter** | `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules`, `Intl.RelativeTimeFormat` | `FormatStyle` (`date.formatted(…)`, `.currency(code:)`); plurals in a String Catalog (`.xcstrings`) | `pluralStringResource(R.plurals.…, count, count)`; `DateTimeFormatter.ofLocalizedDate(…)`; `NumberFormat.getCurrencyInstance(locale)` | macOS: `FormatStyle`, String Catalog. Windows: `Windows.Globalization.DateTimeFormatting.DateTimeFormatter`, `CurrencyFormatter`; plurals through the ICU that Windows ships |
| **high-contrast setting** | `@media (forced-colors: active)`; `@media (prefers-contrast: more)` | Increase Contrast: SwiftUI `@Environment(\.colorSchemeContrast)` is `.increased`; `UIAccessibility.isDarkerSystemColorsEnabled` | The contrast level from `UiModeManager.getContrast()` (Android 14 and later); the "High contrast text" setting has no public API | macOS: `NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast`. Windows: contrast themes, `AccessibilitySettings.HighContrast`; a `HighContrast` entry in `ThemeDictionaries` |
| **accessibility semantics** | Native elements first; then `role`, `aria-label`, `aria-live` | SwiftUI `.accessibilityLabel`, `.accessibilityAddTraits`, `.accessibilityElement(children: .combine)`; UIKit `accessibilityLabel`, `accessibilityTraits` | `Modifier.semantics { contentDescription = …; role = Role.Button }`; `semantics(mergeDescendants = true)`; `liveRegion = LiveRegionMode.Polite` | macOS: `NSAccessibility` (`setAccessibilityLabel`, `setAccessibilityRole`). Windows: UI Automation, `AutomationProperties.Name`, `AutomationProperties.LiveSetting` |

## Media and performance

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **profiling tools** | DevTools Performance panel and Lighthouse; field data from the `web-vitals` library; bundle size with `npx source-map-explorer dist/main.js` | Instruments (Time Profiler, Animation Hitches, Allocations); MetricKit for field data | Android Studio Profiler; Perfetto; Macrobenchmark with Baseline Profiles; JankStats for field data | macOS: Instruments. Windows: Windows Performance Recorder and Windows Performance Analyzer; the Visual Studio profiler |
| **deferred media loading** | `loading="lazy"` on images and iframes below the first viewport; `fetchpriority="high"` on the hero | `AsyncImage` in a `LazyVStack` or `List` loads when its row appears; UIKit `UICollectionViewDataSourcePrefetching` | An image loader such as Coil `AsyncImage` in a `LazyColumn`: items compose only near the viewport | macOS: `NSCollectionViewPrefetching`. Windows: load item images as `ListView` realizes items (`ContainerContentChanging`) |
| **reserved media size** | `width` and `height` attributes, or `aspect-ratio` | A placeholder with `.aspectRatio(_:contentMode:)` or a fixed frame | `Modifier.aspectRatio(ratio)` or a fixed `Modifier.size` on the image and its placeholder | Windows: a fixed `Width` and `Height` on the `Image`. macOS: size constraints on the image view |
| **text shown during font load** | `font-display: swap` (or `optional`); a metric-matched fallback with `size-adjust` | A bundled face (`UIAppFonts`) loads before the first draw; a downloaded face shows the system face until it arrives | A bundled `res/font` face loads before the first draw; a downloadable `GoogleFont` shows the next `Font` of its `FontFamily` until it arrives | Bundled faces load with the app. Windows: a `FontFamily` with an `ms-appx:///` URI |
| **long-list virtualization** | A virtual list (TanStack Virtual); `content-visibility: auto` on long off-screen sections | SwiftUI `List`, `LazyVStack`; UIKit `UICollectionView` cell reuse | `LazyColumn`, `LazyVerticalGrid` with a stable `key` | macOS: `NSTableView`, `NSCollectionView` view reuse. Windows: `ItemsRepeater`, `ListView` (virtualized by default) |

## Advanced rendering

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **shared-element transition** | View Transitions: `document.startViewTransition()` and `view-transition-name` | SwiftUI `matchedGeometryEffect`; `.navigationTransition(.zoom(sourceID:in:))` with `.matchedTransitionSource` | `SharedTransitionLayout` with `Modifier.sharedElement()` or `Modifier.sharedBounds()` | macOS: SwiftUI `matchedGeometryEffect`. Windows: `ConnectedAnimationService` |
| **scroll-linked animation** | `animation-timeline: scroll()` or `view()`, behind `@supports`; Motion `useScroll` | SwiftUI `.scrollTransition`, `.visualEffect`, `onScrollGeometryChange`; UIKit `scrollViewDidScroll(_:)` | Read `ScrollState.value` or `LazyListState.firstVisibleItemScrollOffset` inside the `graphicsLayer { }` lambda | macOS: observe the clip view's bounds (`NSView.boundsDidChangeNotification`). Windows: `ElementCompositionPreview.GetScrollViewerManipulationPropertySet` with an `ExpressionAnimation` |
| **GPU drawing surface** | `<canvas>` with WebGL2 or WebGPU; `OffscreenCanvas` in a worker | Metal (`MTKView`); SwiftUI `Canvas`; the shader modifiers `.colorEffect` and `.layerEffect` with `ShaderLibrary` | The `Canvas` composable; AGSL `RuntimeShader` as a `RenderEffect` (Android 13 and later); OpenGL ES or Vulkan surfaces | macOS: Metal (`MTKView`). Windows: `SwapChainPanel` with Direct3D; Win2D `CanvasControl` |

## Type and system parts

| Term | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **hanging punctuation** | `hanging-punctuation: first` (Safari only); elsewhere a negative `text-indent` on a block that opens with a quotation mark | No property: indent the other lines by the mark's width (`NSParagraphStyle.headIndent`) and pull the block start back by the same width | No property: `TextIndent(restLine = …)`, with the block pulled back by the mark's width | No property on either platform: the same offset as iOS |
| **balanced wrap** | `text-wrap: balance` | No system property: break by hand between phrases | `TextStyle(lineBreak = LineBreak.Heading)` (the balanced strategy) | No system property: break by hand between phrases |
| **even-last-line wrap** | `text-wrap: pretty` | `NSParagraphStyle` `lineBreakStrategy` with `.pushOut` | `TextStyle(lineBreak = LineBreak.Paragraph)` (the high-quality strategy) | macOS: `lineBreakStrategy` with `.pushOut`. Windows: no system property |
| **tabular numerals** | `font-variant-numeric: tabular-nums` | SwiftUI `.monospacedDigit()`; UIKit `UIFont.monospacedDigitSystemFont(ofSize:weight:)` | `TextStyle(fontFeatureSettings = "tnum")` | macOS: `.monospacedDigit()`, `NSFont.monospacedDigitSystemFont(ofSize:weight:)`. Windows: `Typography.NumeralAlignment="Tabular"` |
| **font smoothing** (web only) | `-webkit-font-smoothing: antialiased`, once at the root; only macOS browsers apply it | — (the system renders text) | — (the system renders text) | — (the system renders text; an Electron app uses the web column) |
| **system-part colors** | `::selection`, `caret-color`, `scrollbar-color`, `accent-color`, `outline-color` on `:focus-visible`, `text-decoration-color` | `.tint()` and `tintColor` color the caret, the selection and the controls; scroll indicators take only a light or dark style | `LocalTextSelectionColors`; `TextFieldDefaults.colors(cursorColor = …)`; the Material `ColorScheme` | macOS: the app's `AccentColor`; `NSTextView.insertionPointColor` and `selectedTextAttributes`. Windows: override `SystemAccentColor`; `SelectionHighlightColor`; `FocusVisualPrimaryBrush` |

## Feel check tools

| Platform | Tools |
|---|---|
| Web | DevTools Animations panel (slow playback, step); Performance panel (dropped frames, long tasks); remote debugging on a real phone |
| iOS | Simulator → Debug → Slow Animations; Instruments "Animation Hitches"; a real device |
| Android (Compose) | Developer option "Animator duration scale" (slow motion); Perfetto; Layout Inspector recomposition counts; a real mid-range device |
| Desktop | macOS: Instruments. Windows: Windows Performance Analyzer; Visual Studio live visual tree |

## Idioms

Translate an idiom; do not transplant it. Rebuild navigation and controls in the target's vocabulary. Carry the palette intent, the type accent and the motion personality through the target's theme ([adapt.md](adapt.md)).

| Idiom | Web | iOS | Android (Compose) | Desktop |
|---|---|---|---|---|
| **top-level navigation** | A top bar or a sidebar; a bottom bar only in a phone web app | Tab bar (`TabView`); a sidebar on iPad (`.tabViewStyle(.sidebarAdaptable)`, `NavigationSplitView`) | Navigation bar, rail or drawer by width (`NavigationSuiteScaffold`) | macOS: a sidebar (`NavigationSplitView`) and the menu bar. Windows: `NavigationView` (left pane or top) |
| **on/off control** | A switch (`role="switch"`) or a checkbox | `Toggle` (a switch) | Material `Switch` | macOS: a checkbox (the `Toggle` default); a switch for a large setting. Windows: `ToggleSwitch` |
| **choice of a few** | A radio group or segmented buttons | A segmented control (`Picker` with `.pickerStyle(.segmented)`) | `SegmentedButton`; chips (`FilterChip`) | macOS: `NSSegmentedControl`. Windows: `RadioButtons`, `SelectorBar` |
| **action list** | A menu or a dialog | An action sheet (`.confirmationDialog`); a context menu | `ModalBottomSheet`; `AlertDialog` | A context menu (macOS `NSMenu`; Windows `MenuFlyout`) |
| **icons** | The project's icon set | SF Symbols | Material Symbols | macOS: SF Symbols. Windows: Segoe Fluent Icons |
| **color and depth** | Design tokens | Semantic system colors; materials (`.ultraThinMaterial`) | Material color roles (`MaterialTheme.colorScheme`); tonal elevation | macOS: semantic `NSColor`; vibrancy (`NSVisualEffectView`). Windows: theme resources; Mica and Acrylic |
| **screen transitions** | None by default; View Transitions when the direction asks for them | System push and sheet | Container transform, shared axis, fade through | macOS: crossfade, no push. Windows: `EntranceNavigationTransitionInfo`, `DrillInNavigationTransitionInfo`, `SlideNavigationTransitionInfo` |
| **font stack** | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | SF Pro through text styles (`.font(.body)`) and Dynamic Type; `-apple-system` in a web view | Roboto (`FontFamily.Default`); `sp` units follow the font scale | macOS: SF Pro (`NSFont.systemFont(ofSize:)`). Windows: Segoe UI Variable |

Use the native font stack unless the brand face is essential to the direction.

## Terminal

A terminal surface has no motion form (Rule 4). Draw and check it with these rules.

1. Draw a light board and a dark board. Use a real, named color scheme for each, and state the scheme on the board.
2. Check the contrast of ANSI yellow (SGR 33) and bright black (SGR 90) on the ground of each scheme. In Campbell, yellow is about 7.5:1 and bright black about 4.3:1. In Solarized Light, yellow is about 3.0:1 and bright black is above 12:1.
3. Do not set text in a color below 4.5:1 on its ground. Never make yellow or bright black the only signal of a state: the person's own scheme can differ.
4. Draw one board at 80 columns by 24 rows. It sets the height budget: the result and the next command fit in 24 rows.
5. Print each path in a form that pastes into every target shell: an absolute path, in double quotes when it has a space. Do not print `~`. Not every shell expands it.
6. Print a "done" line only after an end-to-end check of the path it reports.

Capture each terminal board through the ANSI render, with `campbell` for the dark board and `solarized-light` for the light board:

```
node "<skill-dir>/scripts/design-boards.mjs" ansi <input.txt> --scheme <campbell|solarized-light> --out <file.html>
```

## Sources

MDN and developer.chrome.com (web), developer.apple.com (iOS, macOS), developer.android.com (Compose), learn.microsoft.com (Windows App SDK), motion.dev (Motion), base-ui.com (Base UI).
