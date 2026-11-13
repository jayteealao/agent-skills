---
description: "Near miss: a rename inside the repo needs no dependency source."
tags: [study-sources, should-not-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Rename the function getUser to fetchUser in this snippet and update both call sites:

```ts
export function getUser(id: string) { return db.users.find(id); }
const a = getUser("1");
const b = getUser("2");
```
