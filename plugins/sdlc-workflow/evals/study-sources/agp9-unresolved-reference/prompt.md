---
description: "A Gradle convention plugin written from memory fails on AGP 9 with unresolved references."
tags: [study-sources, should-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

My build-logic convention plugin broke after moving to Android Gradle Plugin 9.0.0. This is the plugin:

```kotlin
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        extensions.configure<LibraryExtension> {
            compileSdk = 36
            compileOptions {
                sourceCompatibility = JavaVersion.VERSION_17
            }
            buildFeatures { compose = true }
        }
    }
}
```

The build fails with:

```
e: build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt:8:17 Unresolved reference 'sourceCompatibility'.
e: build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt:6:13 Expression 'compileOptions' of type 'CompileOptions' cannot be invoked as a function. Function 'invoke()' is not found.
```

Fix the plugin so it compiles on AGP 9.
