# Platform forms: Android (`design/_platforms-android.md`)

The form of each generic term of the design rules on Android with Jetpack Compose. [_platforms.md](_platforms.md) holds the rules of the map and says which file a project reads. Checked against the platform documentation on 2026-10-22. When a form here disagrees with the framework version of the project, the version of the project wins.

> Load with: `design/_platforms-android.md`

## Rendering

| Term | Form |
|---|---|
| **cheap property** — changes without new layout or paint | `Modifier.graphicsLayer { translationX/Y, scaleX/Y, rotationZ, alpha }` |
| **paint property** — redraws, moves nothing else | Content drawn in `Modifier.drawBehind { }` / `drawWithContent { }` |
| **layout property** — moves other elements | `Modifier.size`, `.padding`, `animateContentSize()` |
| **render thread** | `RenderThread` |
| **app thread** | The main thread (composition, layout, draw) |
| **layer hint** | A `graphicsLayer { }` already makes a layer; `CompositingStrategy.Offscreen` is for alpha correctness, not speed |

## Animation

| Term | Form |
|---|---|
| **retargetable animation** | `animate*AsState`, `Animatable.animateTo`, `updateTransition` |
| **restarting animation** | `keyframes { }` spec; `rememberInfiniteTransition` |
| **curve token** (x1, y1, x2, y2) | `CubicBezierEasing(x1, y1, x2, y2)` |
| **spring** (duration, bounce) | `spring(dampingRatio, stiffness)`; `Spring.DampingRatioNoBouncy` = 1. A Material 3 theme holds its springs in `MaterialTheme.motionScheme`: spatial specs for a change of shape or bounds, effects specs for color and alpha, each in a fast, a default and a slow form. Use them before a spring of your own |
| **trigger origin** | `graphicsLayer { transformOrigin = TransformOrigin(x, y) }` |
| **entry without a mount flag** | `AnimatedVisibility(enter = …, exit = …)` |
| **per-frame value** | Read the value in the layout or draw phase: the lambda modifiers `offset { }`, `graphicsLayer { }`, `drawBehind { }` |

## Settings and input

| Term | Form |
|---|---|
| **reduced-motion setting** | No Compose API: Compose scales animation time by `MotionDurationScale`, which follows the system "Remove animations" setting (`ANIMATOR_DURATION_SCALE` = 0); check `ValueAnimator.areAnimatorsEnabled()` for a non-animation fallback |
| **hover pointer** | Hover events from a mouse or stylus only: `Modifier.hoverable(interactionSource)`, `PointerEventType.Enter` |
| **press feedback** | Scale from `interactionSource.collectIsPressedAsState()`; haptics `LocalHapticFeedback.current.performHapticFeedback(HapticFeedbackType.Confirm / ToggleOn / LongPress / VirtualKey)` |
| **system back** | `NavigationBackHandler` with `rememberNavigationEventState` (`androidx.navigationevent.compose`); Navigation 3 handles it. Bind one state to one handler |
| **insets and system bars** | `enableEdgeToEdge()`, `WindowInsets.safeDrawing`, `WindowInsets.ime`, `Modifier.imePadding()` |
| **largest text size** | Font scale 200% (non-linear scaling) |

## Layout and input

| Term | Form |
|---|---|
| **minimum hit area** | 48×48 dp, the touch target of [_craft-floor.md](_craft-floor.md) rule 5; `Modifier.minimumInteractiveComponentSize()` (Material 3 controls apply it) |
| **window size class** | `currentWindowAdaptiveInfo().windowSizeClass`: compact below 600 dp, medium below 840 dp, expanded and wider from 840 dp |
| **coarse pointer** | `PointerType.Touch` on `PointerInputChange.type`; a mouse or stylus reports `PointerType.Mouse` or `PointerType.Stylus` |
| **interrupted gesture** | `detectDragGestures(onDragCancel = …)`; `tryAwaitRelease()` returns false when a press is cancelled |

## Language and accessibility

| Term | Form |
|---|---|
| **start and end edges** | `Modifier.padding(start = …, end = …)`; `Arrangement.Start`; `LocalLayoutDirection`; `Icons.AutoMirrored` icons |
| **locale formatter** | `pluralStringResource(R.plurals.…, count, count)`; `DateTimeFormatter.ofLocalizedDate(…)`; `NumberFormat.getCurrencyInstance(locale)` |
| **high-contrast setting** | The contrast level from `UiModeManager.getContrast()` (Android 14 and later); the "High contrast text" setting has no public API |
| **accessibility semantics** | `Modifier.semantics { contentDescription = …; role = Role.Button }`; `semantics(mergeDescendants = true)`; `liveRegion = LiveRegionMode.Polite` |

## Media and performance

| Term | Form |
|---|---|
| **profiling tools** | Android Studio Profiler; Perfetto; Macrobenchmark with Baseline Profiles; JankStats for field data |
| **deferred media loading** | An image loader such as Coil `AsyncImage` in a `LazyColumn`: items compose only near the viewport |
| **reserved media size** | `Modifier.aspectRatio(ratio)` or a fixed `Modifier.size` on the image and its placeholder |
| **text shown during font load** | A bundled `res/font` face loads before the first draw; a downloadable `GoogleFont` shows the next `Font` of its `FontFamily` until it arrives |
| **long-list virtualization** | `LazyColumn`, `LazyVerticalGrid` with a stable `key` |

## Advanced rendering

| Term | Form |
|---|---|
| **shared-element transition** | `SharedTransitionLayout` with `Modifier.sharedElement()` or `Modifier.sharedBounds()` |
| **scroll-linked animation** | Read `ScrollState.value` or `LazyListState.firstVisibleItemScrollOffset` inside the `graphicsLayer { }` lambda |
| **GPU drawing surface** | The `Canvas` composable; AGSL `RuntimeShader` as a `RenderEffect` (Android 13 and later); OpenGL ES or Vulkan surfaces |

## Type and system parts

| Term | Form |
|---|---|
| **hanging punctuation** | No property: `TextIndent(restLine = …)`, with the block pulled back by the mark's width |
| **balanced wrap** | `TextStyle(lineBreak = LineBreak.Heading)` (the balanced strategy) |
| **even-last-line wrap** | `TextStyle(lineBreak = LineBreak.Paragraph)` (the high-quality strategy) |
| **tabular numerals** | `TextStyle(fontFeatureSettings = "tnum")` |
| **font smoothing** (web only) | — (the system renders text) |
| **system-part colors** | `LocalTextSelectionColors`; `TextFieldDefaults.colors(cursorColor = …)`; the Material `ColorScheme` |

## Feel check tools

Developer option "Animator duration scale" (slow motion); Perfetto; Layout Inspector recomposition counts; a real mid-range device

## Idioms

| Idiom | Form |
|---|---|
| **top-level navigation** | Navigation bar, rail or drawer by width (`NavigationSuiteScaffold`) |
| **on/off control** | Material `Switch` |
| **choice of a few** | `SegmentedButton`; chips (`FilterChip`) |
| **action list** | `ModalBottomSheet`; `AlertDialog` |
| **icons** | Material Symbols |
| **color and depth** | Material color roles (`MaterialTheme.colorScheme`); tonal elevation |
| **screen transitions** | The transitions of the navigation library, driven by the system back gesture (predictive back). A shared-element transition for a container that becomes a screen |
| **font stack** | Roboto (`FontFamily.Default`); `sp` units follow the font scale |
