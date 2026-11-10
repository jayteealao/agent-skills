# Platform forms: desktop (`design/_platforms-desktop.md`)

The form of each generic term of the design rules on desktop: macOS with AppKit and Core Animation, and Windows with WinUI 3 and `Microsoft.UI.Composition`. [_platforms.md](_platforms.md) holds the rules of the map and says which file a project reads. Checked against the platform documentation on 2026-10-22. When a form here disagrees with the framework version of the project, the version of the project wins.

> Load with: `design/_platforms-desktop.md`

## Rendering

| Term | Form |
|---|---|
| **cheap property** — changes without new layout or paint | macOS: layer `transform`, `opacity` (layer-backed views). Windows: `Visual.Offset`, `Visual.Scale`, `Visual.Opacity`, `Visual.RotationAngleInDegrees` |
| **paint property** — redraws, moves nothing else | macOS: layer `backgroundColor`, `cornerRadius`. Windows: brush and shape changes |
| **layout property** — moves other elements | macOS: frame and constraints. Windows: `Width`, `Height`, `Margin` |
| **render thread** | macOS: the window server and Core Animation. Windows: the composition engine (DWM) |
| **app thread** | The UI thread |
| **layer hint** | macOS: `wantsLayer`. Windows: a `Visual` is already a layer |

## Animation

| Term | Form |
|---|---|
| **retargetable animation** | macOS: `NSAnimationContext`, implicit layer animations. Windows: implicit animations (`Compositor.CreateImplicitAnimationCollection()` on `Visual.ImplicitAnimations`); spring animations retarget best |
| **restarting animation** | Windows: `Compositor.CreateScalarKeyFrameAnimation()` / `CreateVector3KeyFrameAnimation()` |
| **curve token** (x1, y1, x2, y2) | macOS: `CAMediaTimingFunction(controlPoints:)`. Windows: `Compositor.CreateCubicBezierEasingFunction(p1, p2)` |
| **spring** (duration, bounce) | macOS: `CASpringAnimation(perceptualDuration:bounce:)`. Windows: `Compositor.CreateSpringVector3Animation()` with `DampingRatio`, `Period` |
| **trigger origin** | macOS: `anchorPoint`. Windows: `Visual.CenterPoint` |
| **entry without a mount flag** | Windows: `ElementCompositionPreview.SetImplicitShowAnimation` (`Microsoft.UI.Xaml.Hosting`) |
| **per-frame value** | The toolkit's animated property, never a rebuild of the tree |

## Settings and input

| Term | Form |
|---|---|
| **reduced-motion setting** | macOS: `NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`. Windows: `UISettings.AnimationsEnabled` |
| **hover pointer** | Always present: SwiftUI `.onHover`, `NSTrackingArea`; Windows `PointerEntered` |
| **press feedback** | Scale on press; macOS trackpad `NSHapticFeedbackManager` |
| **system back** | Escape, Cmd+[ or Alt+Left by platform convention |
| **insets and system bars** | Title bar and window chrome; full-screen safe area on macOS |
| **largest text size** | macOS text size; Windows text scaling 225% |

## Layout and input

| Term | Form |
|---|---|
| **minimum hit area** | macOS: 28×28 pt. Windows: 40×40 epx for touch. Electron: the web column |
| **window size class** | The window's own width. macOS: SwiftUI `ViewThatFits`, `GeometryReader`. Windows: `AdaptiveTrigger` (`MinWindowWidth`) in a `VisualStateManager` state |
| **coarse pointer** | Windows: `PointerDeviceType.Touch` on the event's `Pointer.PointerDeviceType`. macOS: no touch screen; the trackpad is a fine pointer |
| **interrupted gesture** | Windows: `PointerCanceled`, `PointerCaptureLost`. macOS: reset drag state on `NSWindow.didResignKeyNotification`; `mouseUp(with:)` may never arrive |

## Language and accessibility

| Term | Form |
|---|---|
| **start and end edges** | macOS: `leadingAnchor`, `userInterfaceLayoutDirection`. Windows: `FlowDirection="RightToLeft"` |
| **locale formatter** | macOS: `FormatStyle`, String Catalog. Windows: `Windows.Globalization.DateTimeFormatting.DateTimeFormatter`, `CurrencyFormatter`; plurals through the ICU that Windows ships |
| **high-contrast setting** | macOS: `NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast`. Windows: contrast themes, `AccessibilitySettings.HighContrast`; a `HighContrast` entry in `ThemeDictionaries` |
| **accessibility semantics** | macOS: `NSAccessibility` (`setAccessibilityLabel`, `setAccessibilityRole`). Windows: UI Automation, `AutomationProperties.Name`, `AutomationProperties.LiveSetting` |

## Media and performance

| Term | Form |
|---|---|
| **profiling tools** | macOS: Instruments. Windows: Windows Performance Recorder and Windows Performance Analyzer; the Visual Studio profiler |
| **deferred media loading** | macOS: `NSCollectionViewPrefetching`. Windows: load item images as `ListView` realizes items (`ContainerContentChanging`) |
| **reserved media size** | Windows: a fixed `Width` and `Height` on the `Image`. macOS: size constraints on the image view |
| **text shown during font load** | Bundled faces load with the app. Windows: a `FontFamily` with an `ms-appx:///` URI |
| **long-list virtualization** | macOS: `NSTableView`, `NSCollectionView` view reuse. Windows: `ItemsRepeater`, `ListView` (virtualized by default) |

## Advanced rendering

| Term | Form |
|---|---|
| **shared-element transition** | macOS: SwiftUI `matchedGeometryEffect`. Windows: `ConnectedAnimationService` |
| **scroll-linked animation** | macOS: observe the clip view's bounds (`NSView.boundsDidChangeNotification`). Windows: `ElementCompositionPreview.GetScrollViewerManipulationPropertySet` with an `ExpressionAnimation` |
| **GPU drawing surface** | macOS: Metal (`MTKView`). Windows: `SwapChainPanel` with Direct3D; Win2D `CanvasControl` |

## Type and system parts

| Term | Form |
|---|---|
| **hanging punctuation** | No property on either platform: the same offset as iOS |
| **balanced wrap** | No system property: break by hand between phrases |
| **even-last-line wrap** | macOS: `lineBreakStrategy` with `.pushOut`. Windows: no system property |
| **tabular numerals** | macOS: `.monospacedDigit()`, `NSFont.monospacedDigitSystemFont(ofSize:weight:)`. Windows: `Typography.NumeralAlignment="Tabular"` |
| **font smoothing** (web only) | — (the system renders text; an Electron app uses the web column) |
| **system-part colors** | macOS: the app's `AccentColor`; `NSTextView.insertionPointColor` and `selectedTextAttributes`. Windows: override `SystemAccentColor`; `SelectionHighlightColor`; `FocusVisualPrimaryBrush` |

## Feel check tools

macOS: Instruments. Windows: Windows Performance Analyzer; Visual Studio live visual tree

## Idioms

| Idiom | Form |
|---|---|
| **top-level navigation** | macOS: a sidebar (`NavigationSplitView`) and the menu bar. Windows: `NavigationView` (left pane or top) |
| **on/off control** | macOS: a checkbox (the `Toggle` default); a switch for a large setting. Windows: `ToggleSwitch` |
| **choice of a few** | macOS: `NSSegmentedControl`. Windows: `RadioButtons`, `SelectorBar` |
| **action list** | A context menu (macOS `NSMenu`; Windows `MenuFlyout`) |
| **icons** | macOS: SF Symbols. Windows: Segoe Fluent Icons |
| **color and depth** | macOS: semantic `NSColor`; from macOS 26, the Liquid Glass material of the system components; vibrancy (`NSVisualEffectView`) on earlier systems. Windows: theme resources; Mica and Acrylic |
| **screen transitions** | macOS: crossfade, no push. Windows: `EntranceNavigationTransitionInfo`, `DrillInNavigationTransitionInfo`, `SlideNavigationTransitionInfo` |
| **font stack** | macOS: SF Pro (`NSFont.systemFont(ofSize:)`). Windows: Segoe UI Variable |
