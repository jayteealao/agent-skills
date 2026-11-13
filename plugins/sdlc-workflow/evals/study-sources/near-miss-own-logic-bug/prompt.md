---
description: "Near miss: a bug in the repo's own logic, no library symbol."
tags: [study-sources, should-not-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

This function should return the last n items but it returns one too few. Fix it:

```python
def last_n(items, n):
    return items[len(items) - n + 1:]
```
