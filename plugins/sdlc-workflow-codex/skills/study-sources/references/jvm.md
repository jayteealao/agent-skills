
# Java / Kotlin / JVM sources

JVM artifacts (`.jar`) ship **compiled bytecode**, not source. But Maven Central and most
repos publish a companion **`-sources.jar`** for each release, and build tools cache these
locally. Get the source JAR; fall back to decompiling only when no source is published.

## Local caches

```
# Maven
~/.m2/repository/<group/as/path>/<artifact>/<version>/
    <artifact>-<version>.jar            # bytecode
    <artifact>-<version>-sources.jar    # source (if downloaded)

# Gradle
~/.gradle/caches/modules-2/files-2.1/<group>/<artifact>/<version>/<hash>/
    <artifact>-<version>-sources.jar
```

Find and unpack an already-cached source JAR:

```bash
find ~/.m2 ~/.gradle/caches -name '<artifact>-<version>-sources.jar' 2>/dev/null
unzip -o <path>-sources.jar -d .scratch/sources/jvm/<artifact>-<version>/
```

## Fetch the source JAR when it isn't cached

```bash
# Maven — download the -sources classifier
mvn dependency:get -Dartifact=<group>:<artifact>:<version>:jar:sources
mvn dependency:sources        # all deps of the current project

# Gradle — add to build to resolve sources, or use the IDE "download sources" action
#   (IntelliJ/Eclipse fetch -sources.jar into the caches above)

# Direct from Maven Central
curl -sL "https://repo1.maven.org/maven2/<group/path>/<artifact>/<version>/<artifact>-<version>-sources.jar" \
  -o .scratch/sources/jvm/<artifact>-<version>-sources.jar
```

## When no source is published — decompile

```bash
# CFR (single self-contained jar) — good default
java -jar cfr.jar <artifact>-<version>.jar --outputdir .scratch/sources/jvm/<artifact>-decompiled/
# Alternatives: Fernflower (bundled in IntelliJ), Procyon
```

Decompiled output loses comments and exact generics — treat it as approximate. Prefer a
real `-sources.jar` whenever one exists.

## Kotlin

Kotlin libraries follow the same Maven/Gradle mechanics. `-sources.jar` contains the
original `.kt`. Note Kotlin metadata (`@Metadata`) drives things decompiled Java won't show
— read real `.kt` source, not decompiled bytecode, for Kotlin-specific behavior.

## Tips

- Match the version your build resolved (`mvn dependency:tree`, `gradle dependencies`).
- The JDK's own source ships in `$JAVA_HOME/lib/src.zip` — unzip to read `java.*` classes.
