---
description: "The user asks how a dependency behaves internally."
tags: [study-sources, should-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

In tokio 1.47, when two branches of select! are ready at the same time, which one runs? I want to know what the macro actually does, not the docs summary, because we depend on the order in a shutdown path.
