
# Ruby, PHP, Swift, Dart sources

These four ecosystems all install **readable source** into a local cache or the project
tree — no decompilation needed. Read what's installed; fetch only if absent.

## Ruby (RubyGems / Bundler)

Gems unpack to source on install:

```
$GEM_HOME/gems/<gem>-<version>/           # e.g. ~/.gem/ruby/3.x/gems/ or vendor/bundle/...
```

```bash
gem which <lib>                            # file path of a required lib
bundle show <gem>                          # dir for a bundled gem in this project
gem unpack <gem> --version <v> --target .scratch/sources/ruby/   # fetch + unpack a gem
```

## PHP (Composer)

Composer installs full source into the project's `vendor/`:

```
vendor/<vendor>/<package>/                 # already in the project tree
```

```bash
composer show <vendor>/<package> -p        # path + version
# Not installed? fetch without wiring it into the project:
composer require <vendor>/<package>:<version> -d .scratch/sources/php/ --no-scripts --no-plugins
```

## Swift (SwiftPM)

SwiftPM checks out dependency source into the build dir:

```
<project>/.build/checkouts/<package>/      # full source, per resolved Package.resolved
~/Library/Caches/org.swift.swiftpm/        # shared cache (macOS)
```

```bash
swift package show-dependencies            # resolved graph + versions
swift package resolve                      # populate .build/checkouts from Package.resolved
# Or clone the package repo at the resolved tag → see git-sources.md
```

CocoaPods projects keep source under `Pods/<Pod>/`; Carthage under `Carthage/Checkouts/`.

## Dart / Flutter (pub)

The pub cache holds decompressed package source:

```
~/.pub-cache/hosted/pub.dev/<package>-<version>/    # hosted packages
~/.pub-cache/git/<...>/                              # git deps
```

```bash
dart pub cache list                        # JSON of every cached package + path
flutter pub get                            # populate the cache for a project
```

Flutter's own framework source ships in the SDK: `<flutter-sdk>/packages/flutter/lib/`.

## Common tips

- Always match the version the lockfile resolved (`Gemfile.lock`, `composer.lock`,
  `Package.resolved`, `pubspec.lock`).
- All four keep real source locally — reach for [git-sources.md](git-sources.md) only for
  upstream `HEAD` or a package that isn't installed.
