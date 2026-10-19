# Platform map (`design/_platforms.md`)

The single source for platform forms. The design rules ([animate.md](animate.md), [_motion-recipes.md](_motion-recipes.md), [harden.md](harden.md), [adapt.md](adapt.md), [optimize.md](optimize.md)) name a generic term; this file gives the term's form on each platform. A rule never names a platform API outside a code example.

> Load with: `design/_platforms.md`

Platforms: the web; iOS (SwiftUI and UIKit); Android with Jetpack Compose; desktop (macOS with AppKit and Core Animation; Windows with WinUI 3 and `Microsoft.UI.Composition`; an Electron app uses the web column). Checked against the platform documentation on 2026-10-19.

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

## Feel check tools

| Platform | Tools |
|---|---|
| Web | DevTools Animations panel (slow playback, step); Performance panel (dropped frames, long tasks); remote debugging on a real phone |
| iOS | Simulator → Debug → Slow Animations; Instruments "Animation Hitches"; a real device |
| Android (Compose) | Developer option "Animator duration scale" (slow motion); Perfetto; Layout Inspector recomposition counts; a real mid-range device |
| Desktop | macOS: Instruments. Windows: Windows Performance Analyzer; Visual Studio live visual tree |

## Sources

MDN and developer.chrome.com (web), developer.apple.com (iOS, macOS), developer.android.com (Compose), learn.microsoft.com (Windows App SDK), motion.dev (Motion), base-ui.com (Base UI). Rechecked with [DESIGN-CRAFT-PORT-PLAN.md](../../../../docs/internal/DESIGN-CRAFT-PORT-PLAN.md) W0.
