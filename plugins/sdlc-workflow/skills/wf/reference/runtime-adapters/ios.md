# Adapter: `ios`

The registry ([../runtime-adapters.md](../runtime-adapters.md)) selects this adapter. [_protocols.md](_protocols.md) owns the enumeration and perturbation rules; this file gives only the steps of this platform.

## Bootstrap
1. **Probe for a booted simulator** — `xcrun simctl list devices | grep Booted`. If one is booted, skip to step 3.
2. **Boot a simulator (runtime boots without a window)** — list available with `xcrun simctl list devices available`. Boot the first iPhone device: `xcrun simctl boot "<device-name>"`. This boots the simulator runtime, which needs no display. Run `open -a Simulator` only when a display is attached and you want a visible window. [_ladder.md](_ladder.md) → Headless boot names the real wall.
3. **Build and install** — `xcodebuild` or `flutter run --debug` or `react-native run-ios`. Resolution attempt before failing: if `xcodebuild` fails on missing pods, try `cd ios && pod install && cd ..` once.

## Enumerate
1. **Recipe rung** — read the navigation model: SwiftUI `navigationDestination` / `NavigationLink` targets, `UITabBarController` items, storyboard segues, and `Info.plist` URL schemes.
2. **Static rung** — grep for pushed/presented view-controller types and collect them.
3. **Traversal rung** — drive from launch via XCUITest or Maestro, screenshot each state, record distinct screens.
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
- **Offline** — Network Link Conditioner's 100% Loss profile, or stop the harness-started backing service.
- **One route failing** — a local stub server returning 500 for a single path.

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
- No iOS simulators available → "Open Xcode → Preferences → Platforms → install at least one iOS Simulator runtime."
- `pod install` fails → "Update CocoaPods (`sudo gem install cocoapods`) and re-run."
- Code signing error → "Open the project in Xcode and select a development team in Signing & Capabilities, then re-run probe."
