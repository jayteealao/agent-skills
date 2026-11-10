# Platform forms: iOS (`design/_platforms-ios.md`)

The form of each generic term of the design rules on iOS, with SwiftUI and UIKit. [_platforms.md](_platforms.md) holds the rules of the map and says which file a project reads. Checked against the platform documentation on 2026-10-22. When a form here disagrees with the framework version of the project, the version of the project wins.

> Load with: `design/_platforms-ios.md`

## Rendering

| Term | Form |
|---|---|
| **cheap property** — changes without new layout or paint | Layer `transform`, `opacity`; SwiftUI `.offset`, `.scaleEffect`, `.rotationEffect`, `.opacity` |
| **paint property** — redraws, moves nothing else | Layer `backgroundColor`, `cornerRadius`, `shadowRadius` (set `shadowPath`, or every frame renders the shadow offscreen) |
| **layout property** — moves other elements | `frame`, `bounds`, Auto Layout `constant`; SwiftUI `.frame`, `.padding` |
| **render thread** | The render server |
| **app thread** | The main thread |
| **layer hint** | `shouldRasterize` for static content only |

## Animation

| Term | Form |
|---|---|
| **retargetable animation** | SwiftUI `withAnimation` / `.animation` (springs keep velocity when retargeted); `UIViewPropertyAnimator` |
| **restarting animation** | `CAKeyframeAnimation`; SwiftUI `keyframeAnimator` |
| **curve token** (x1, y1, x2, y2) | SwiftUI `.timingCurve(x1, y1, x2, y2, duration:)`; UIKit `UICubicTimingParameters(controlPoint1:controlPoint2:)`; `CAMediaTimingFunction(controlPoints:)` |
| **spring** (duration, bounce) | SwiftUI `.spring(duration:bounce:)`, `Spring(duration:bounce:)`; `CASpringAnimation(perceptualDuration:bounce:)` |
| **trigger origin** | `CALayer.anchorPoint`; SwiftUI `scaleEffect(_:anchor:)` |
| **entry without a mount flag** | SwiftUI `.transition()` on a conditionally inserted view |
| **per-frame value** | `@GestureState` for drag values; update the moving view's modifier, not a state that rebuilds a large view |

## Settings and input

| Term | Form |
|---|---|
| **reduced-motion setting** | SwiftUI `@Environment(\.accessibilityReduceMotion)`; `UIAccessibility.isReduceMotionEnabled` |
| **hover pointer** | iPadOS pointer only: `.hoverEffect`, `.onContinuousHover`, `UIPointerInteraction` |
| **press feedback** | Scale on press; haptics `.sensoryFeedback(_:trigger:)` or `UIImpactFeedbackGenerator` |
| **system back** | The interactive back swipe (`interactivePopGestureRecognizer`) |
| **insets and system bars** | Safe area (`safeAreaInsets`, `.ignoresSafeArea` only for backgrounds) |
| **largest text size** | Dynamic Type, accessibility sizes |

## Layout and input

| Term | Form |
|---|---|
| **minimum hit area** | 44×44 pt, the touch target of [_craft-floor.md](_craft-floor.md) rule 5 |
| **window size class** | `horizontalSizeClass` and `verticalSizeClass` (compact or regular): SwiftUI `@Environment(\.horizontalSizeClass)`; UIKit `traitCollection.horizontalSizeClass` |
| **coarse pointer** | Touch is the primary input; an iPad with a trackpad adds a **hover pointer** |
| **interrupted gesture** | UIKit `touchesCancelled(_:with:)` and a recognizer state of `.cancelled`; SwiftUI `@GestureState` resets on cancel, and `onEnded` does not run |

## Language and accessibility

| Term | Form |
|---|---|
| **start and end edges** | `.leading` and `.trailing`; `leadingAnchor`; `NSDirectionalEdgeInsets`; `.flipsForRightToLeftLayoutDirection(true)` |
| **locale formatter** | `FormatStyle` (`date.formatted(…)`, `.currency(code:)`); plurals in a String Catalog (`.xcstrings`) |
| **high-contrast setting** | Increase Contrast: SwiftUI `@Environment(\.colorSchemeContrast)` is `.increased`; `UIAccessibility.isDarkerSystemColorsEnabled` |
| **accessibility semantics** | SwiftUI `.accessibilityLabel`, `.accessibilityAddTraits`, `.accessibilityElement(children: .combine)`; UIKit `accessibilityLabel`, `accessibilityTraits` |

## Media and performance

| Term | Form |
|---|---|
| **profiling tools** | Instruments (Time Profiler, Animation Hitches, Allocations); MetricKit for field data |
| **deferred media loading** | `AsyncImage` in a `LazyVStack` or `List` loads when its row appears; UIKit `UICollectionViewDataSourcePrefetching` |
| **reserved media size** | A placeholder with `.aspectRatio(_:contentMode:)` or a fixed frame |
| **text shown during font load** | A bundled face (`UIAppFonts`) loads before the first draw; a downloaded face shows the system face until it arrives |
| **long-list virtualization** | SwiftUI `List`, `LazyVStack`; UIKit `UICollectionView` cell reuse |

## Advanced rendering

| Term | Form |
|---|---|
| **shared-element transition** | SwiftUI `matchedGeometryEffect`; `.navigationTransition(.zoom(sourceID:in:))` with `.matchedTransitionSource` |
| **scroll-linked animation** | SwiftUI `.scrollTransition`, `.visualEffect`, `onScrollGeometryChange`; UIKit `scrollViewDidScroll(_:)` |
| **GPU drawing surface** | Metal (`MTKView`); SwiftUI `Canvas`; the shader modifiers `.colorEffect` and `.layerEffect` with `ShaderLibrary` |

## Type and system parts

| Term | Form |
|---|---|
| **hanging punctuation** | No property: indent the other lines by the mark's width (`NSParagraphStyle.headIndent`) and pull the block start back by the same width |
| **balanced wrap** | No system property: break by hand between phrases |
| **even-last-line wrap** | `NSParagraphStyle` `lineBreakStrategy` with `.pushOut` |
| **tabular numerals** | SwiftUI `.monospacedDigit()`; UIKit `UIFont.monospacedDigitSystemFont(ofSize:weight:)` |
| **font smoothing** (web only) | — (the system renders text) |
| **system-part colors** | `.tint()` and `tintColor` color the caret, the selection and the controls; scroll indicators take only a light or dark style |

## Feel check tools

Simulator → Debug → Slow Animations; Instruments "Animation Hitches"; a real device

## Idioms

| Idiom | Form |
|---|---|
| **top-level navigation** | Tab bar (`TabView`); a sidebar on iPad (`.tabViewStyle(.sidebarAdaptable)`, `NavigationSplitView`) |
| **on/off control** | `Toggle` (a switch) |
| **choice of a few** | A segmented control (`Picker` with `.pickerStyle(.segmented)`) |
| **action list** | An action sheet (`.confirmationDialog`); a context menu |
| **icons** | SF Symbols |
| **color and depth** | Semantic system colors. From iOS 26, the system bars and controls use the Liquid Glass material: take it from the system components, or `.buttonStyle(.glass)` and `.glassProminent` for a button, and `.glassEffect(_:in:)` inside a `GlassEffectContainer` for a custom control (`UIGlassEffect` in UIKit). Keep glass on the control layer, not on content. Earlier systems use materials (`.ultraThinMaterial`) |
| **screen transitions** | System push and sheet |
| **font stack** | SF Pro through text styles (`.font(.body)`) and Dynamic Type; `-apple-system` in a web view |
