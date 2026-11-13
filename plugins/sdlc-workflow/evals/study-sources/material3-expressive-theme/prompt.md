---
description: "A Compose call to an experimental Material 3 API does not compile."
tags: [study-sources, should-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

With androidx.compose.material3:material3:1.4.0 this line in my theme does not compile:

```kotlin
MaterialExpressiveTheme(colorScheme = scheme, motionScheme = MotionScheme.expressive()) { content() }
```

The error is: Cannot access 'fun MaterialExpressiveTheme(colorScheme: ColorScheme? = ..., motionScheme: MotionScheme? = ..., shapes: Shapes? = ..., typography: Typography? = ..., content: @Composable () -> Unit): Unit': it is internal in 'androidx.compose.material3'.

What is the right way to get the expressive theme and motion scheme in this version?
