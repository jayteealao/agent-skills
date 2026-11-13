---
name: study-sources
description: Reads the real source of a library, framework or SDK at the version the project resolved, so code is written against the actual API instead of a remembered one. Use this skill before writing code that calls a dependency API you have not read in this repo; whenever a compile or type error names a library symbol (Unresolved reference, has no exported member, cannot find symbol, has no attribute, is not a function); when a stack trace leads into node_modules, site-packages or a cached JAR; when a version may be newer than you know; or when the user asks how a library works or to pull down a repo. Reads the copy already on disk first (node_modules, Gradle and Maven sources jars, Android SDK sources, Cargo, Go, NuGet, pub caches) and clones into a gitignored .scratch/ only when it is missing. Read-only.
version: 1.0.0
disable-model-invocation: false
argument-hint: "[<git-url> | <package>@<version> | <ecosystem>] <what you need to learn>"
---

# Study sources

Read [_host-invocation.md](../wf/reference/_host-invocation.md) first. It defines the invocation
spelling, `<skill-dir>`, and the `$ARGUMENTS` token for your host.

Ground your work in **real upstream source** rather than recalled API shapes. When a
task turns on how a library, framework, or SDK actually behaves — its exact function
signatures, its edge cases, an error string, a private helper, a version-specific change —
read the source. This skill maps **where each ecosystem already keeps readable source on
disk**, and **how to fetch it into `.scratch/` when it isn't local yet**.

Two habits make this reliable:

1. **Read what's installed before you clone.** Most ecosystems cache decompressed source
   locally — `node_modules/`, `~/.m2`, the Gradle/Cargo/NuGet/Go caches, the Android SDK's
   `sources/`. Reading the version the project actually resolved is faster and *more
   correct* than cloning `main`, which may be ahead of the pinned release.
2. **Everything fetched lands in `.scratch/`.** This directory is gitignored (repo-wide),
   so cloned repos and unpacked archives never pollute the working tree, `git status`, or
   the project's history. Keep one sub-folder per source, e.g.
   `.scratch/sources/<ecosystem>/<name>@<version>/`.

## Guardrails

- **Read-only.** This skill fetches source to *study*. Do not build, install, run, or
  execute anything you pull in — you are reading code, not adopting a dependency.
- **`.scratch/` only.** Never clone or unpack into the project tree. If `.scratch/` is not
  already ignored, add it to `.gitignore` before fetching (do not fetch into a tracked
  path). Confirm with `git check-ignore -q .scratch/` when unsure (the trailing slash
  matters: a `.scratch/` pattern matches only a directory, and the folder may not exist yet).
- **Prefer the resolved version.** Match what the project's lockfile / build resolved, not
  the latest tag, unless the user explicitly wants upstream `HEAD`.
- **Shallow and narrow.** Clone with `--depth 1` and, for large monorepos, a sparse or
  blobless checkout (see [references/git-sources.md](references/git-sources.md)). You want
  the code to read, not the full history.
- **Network is a fallback.** Reach the network only when the source isn't already on disk.
  In sandboxed/offline runs, exhaust local caches first and tell the user if a fetch needs
  network access.

## The universal workflow

1. **Name the target.** Which package/repo, and — critically — *which version*? Read the
   project's lockfile or manifest to resolve it (`package-lock.json`/`pnpm-lock.yaml`,
   `requirements.txt`/`poetry.lock`, `pom.xml`/`*.gradle`, `go.mod`, `Cargo.lock`,
   `*.csproj`, `Gemfile.lock`, `composer.lock`, `pubspec.lock`, `Package.resolved`).
2. **Check the local cache first.** Use the map below to look where that ecosystem already
   stores decompressed source. If it's there, read it in place — no fetch.
3. **Fetch into `.scratch/` if missing.** Use the ecosystem's own "download source" path
   (source JARs, `pip download`, `go mod download`, `cargo vendor`, `npm pack`, etc.), or
   clone the Git repo at the matching tag. Land it under `.scratch/sources/…`.
4. **Read narrowly.** Grep for the symbol, type, or string you need. Note the
   `file:line` and the exact version you read, so any claim you make is traceable.

## Ecosystem cache map — look here before fetching

| Ecosystem | Already-decompressed source on disk | Reference |
|---|---|---|
| **Any Git host** (GitHub/GitLab/Bitbucket/…) | — (clone into `.scratch/`) | [git-sources.md](references/git-sources.md) |
| **JavaScript / TypeScript** | `node_modules/<pkg>/`; pnpm store `~/.local/share/pnpm/store` / `node_modules/.pnpm/`; Yarn Berry `.yarn/cache` (zipped) | [javascript.md](references/javascript.md) |
| **Python** | active venv `…/site-packages/<pkg>/`; system `site-packages`; `pip download --no-binary` for sdist | [python.md](references/python.md) |
| **Java / Kotlin / JVM** | Maven `~/.m2/repository/…` (`-sources.jar`); Gradle `~/.gradle/caches/modules-2/…` | [jvm.md](references/jvm.md) |
| **Android** | SDK `$ANDROID_HOME/sources/android-<api>/`; AARs in Gradle cache; AndroidX / AOSP via `cs.android.com` | [android.md](references/android.md) |
| **Go** | module cache `$GOPATH/pkg/mod/<module>@<version>/` (read-only) | [go.md](references/go.md) |
| **Rust** | registry `~/.cargo/registry/src/<index>/<crate>-<version>/` | [rust.md](references/rust.md) |
| **.NET / C#** | NuGet `~/.nuget/packages/<pkg>/<version>/` (lib DLLs; source via SourceLink/decompile) | [dotnet.md](references/dotnet.md) |
| **Ruby / PHP / Swift / Dart** | RubyGems `$GEM_HOME/gems/`; Composer `vendor/`; SwiftPM `.build/checkouts/`; Dart pub cache `~/.pub-cache/hosted/…` | [ruby-php-swift-dart.md](references/ruby-php-swift-dart.md) |
| **C / C++ / system** | system headers `/usr/include`; vcpkg/conan caches; else clone upstream | [native-c-cpp.md](references/native-c-cpp.md) |

If `$ARGUMENTS` opens with a Git URL, treat it as a clone request →
[git-sources.md](references/git-sources.md). If it names a `package@version` or an
ecosystem keyword, route to that ecosystem's reference. Otherwise infer the ecosystem from
the project's manifests and the map above.

## When NOT to use this

- The answer is already in the project's own tree — read that first.
- The library's public docs fully cover the question and version drift isn't a risk (still
  prefer source for exact signatures and edge cases).
- You'd be fetching just to run or build it — that's a dependency-adoption task, not a
  study task; this skill only reads.
