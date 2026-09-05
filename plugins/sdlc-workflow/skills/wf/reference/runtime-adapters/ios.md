# Adapter: `ios`

## Detection signals
- `*.xcodeproj` or `*.xcworkspace`
- `Package.swift` declaring an iOS platform target
- `ios/Runner.xcodeproj` (Flutter), `ios/<Project>.xcodeproj` (React Native)

## Bootstrap
1. **Probe for a booted simulator** — `xcrun simctl list devices | grep Booted`. If one is booted, skip to step 3.
2. **Boot a simulator (runtime boots without a window)** — list available with `xcrun simctl list devices available`. Boot the first iPhone device: `xcrun simctl boot "<device-name>"`. This boots the simulator **runtime** — it does not need a display, and `xcrun simctl io booted screenshot` reads its framebuffer directly. `open -a Simulator` only opens the *visible window* onto that runtime; run it **only** when a display is attached and you want a live window (skip it in a background subagent / headless host — the boot above is sufficient to build, install, drive via `simctl`, and screenshot). "No display" therefore never blocks this adapter; a missing simulator *runtime* does.
3. **Build and install** — `xcodebuild` or `flutter run --debug` or `react-native run-ios`. Resolution attempt before failing: if `xcodebuild` fails on missing pods, try `cd ios && pod install && cd ..` once.

## Enumerate
Inventory destinations **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the navigation model: SwiftUI `navigationDestination` / `NavigationLink` targets, `UITabBarController` items, storyboard segues, and `Info.plist` URL schemes.
2. **Static rung** — grep for pushed/presented view-controller types and collect them.
3. **Traversal rung** — drive from launch via XCUITest or Maestro, screenshot each state, record distinct screens. The count is a FLOOR.
`ios` ships no recipe-rung automation beyond reading source; rungs 2-3 are the normal path and are fully supported.

## Drive
- **Preferred — existing XCUITest or Detox flows.** Run with `xcodebuild test -scheme <scheme>` or `detox test`.
- **Fallback — simctl interactions.** Limited compared to Android adb:
  - `xcrun simctl io booted recordVideo <file.mov>` for video capture
  - `xcrun simctl openurl booted <url>` for deep links
  - Direct UI tap automation via simctl is not first-class; prefer XCUITest or Maestro (which supports iOS as of Maestro 1.30+).

## Observe
- **Screenshots** — `xcrun simctl io booted screenshot <evidence-dir>/<slug>.png`. **Read the screenshot** to confirm the expected state.
- **Console logs** — `xcrun simctl spawn booted log stream --predicate 'process == "<app-name>"'` (run as a background capture, terminate after the criterion completes).
- **Crash reports** — `~/Library/Logs/DiagnosticReports/` for the host; `xcrun simctl get_app_container booted <bundle-id>` to locate app container logs.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **Offline** — Network Link Conditioner's 100% Loss profile, or stop the harness-started backing service.
- **One route failing** — a local stub server returning 500 for a single path.
Restore before teardown and record both the perturbation and the restore.

## Tear down
- If this run booted the simulator, shut it down: `xcrun simctl shutdown booted`.
- Leave the app installed; install is idempotent.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png        # screenshot
  <criterion-or-target-slug>.log        # console log stream excerpt
  <criterion-or-target-slug>.mov        # video (if recorded)
```

## Remediation hints
- No iOS simulators available → "Open Xcode → Preferences → Platforms → install at least one iOS Simulator runtime." (Note: "no simulator *runtime*" is the real wall — a headless host with no display is **not** blocked, since `simctl boot` + `simctl io booted screenshot` need no window.)
- `pod install` fails → "Update CocoaPods (`sudo gem install cocoapods`) and re-run."
- Code signing error → "Open the project in Xcode and select a development team in Signing & Capabilities, then re-run probe."
