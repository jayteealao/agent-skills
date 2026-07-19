
# Android sources — framework, Jetpack, AARs

Android has three distinct source layers: the **platform framework** (the `android.*`
APIs), **Jetpack/AndroidX libraries** (shipped as AARs via Maven/Gradle), and **AOSP**
(the OS itself). Each has its own fetch path.

## Platform framework source (`android.*`)

The SDK ships framework source per API level — the truth for `Activity`, `View`, etc.:

```
$ANDROID_HOME/sources/android-<api>/android/...      # e.g. sources/android-34/
```

Install it if absent:

```bash
sdkmanager "sources;android-34"
# then read $ANDROID_HOME/sources/android-34/
```

Online mirror for any version/symbol: **cs.android.com** (Android Code Search) — the
canonical AOSP browser.

## Jetpack / AndroidX libraries (AARs)

AndroidX artifacts resolve through Gradle like any JVM dep, but package as **`.aar`**
(a zip: `classes.jar` + resources + manifest). Their `-sources.jar` is published to
Google's Maven repo.

```bash
# Locate a cached AAR and peek inside
find ~/.gradle/caches -name '<artifact>-<version>.aar' 2>/dev/null
unzip -o <path>.aar -d .scratch/sources/android/<artifact>-<version>-aar/   # classes.jar, res/, AndroidManifest.xml
unzip -o .scratch/sources/android/<artifact>-<version>-aar/classes.jar \
      -d .scratch/sources/android/<artifact>-<version>-classes/             # bytecode

# Prefer the -sources.jar (real source). It lives under Google's Maven layout:
find ~/.gradle/caches -name '<artifact>-<version>-sources.jar' 2>/dev/null
curl -sL "https://dl.google.com/android/maven2/<group/path>/<artifact>/<version>/<artifact>-<version>-sources.jar" \
  -o .scratch/sources/android/<artifact>-<version>-sources.jar
```

See [jvm.md](jvm.md) for `mvn dependency:sources` / decompilation — the same tools apply to
`classes.jar` when no source JAR exists.

## AOSP (the OS itself)

Full AOSP is huge and uses `repo`, not a single git clone. For reading, prefer **Android
Code Search (cs.android.com)** or clone a single project mirror from
`https://android.googlesource.com/<project>` at the right tag (see [git-sources.md](git-sources.md)).

## Tips

- Match `compileSdk` / the AndroidX version your `build.gradle` resolved.
- Kotlin-first AndroidX libraries: read the `.kt` in `-sources.jar`, not decompiled Java.
- `classes.jar` inside an AAR is bytecode — only useful decompiled; always try
  `-sources.jar` first.
