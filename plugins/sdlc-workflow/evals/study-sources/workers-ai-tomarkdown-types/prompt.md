---
description: "A TypeScript type error on a Cloudflare Workers AI return type."
tags: [study-sources, should-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

I call Workers AI toMarkdown from a Worker (@cloudflare/workers-types 4.20251101.0):

```ts
const result = await env.AI.toMarkdown({ name: "page.html", blob });
const md = result.document.data;
```

tsc says: error TS2339: Property 'document' does not exist on type 'ConversionResponse | ConversionResponse[]'.

I already tried result[0].document and it still fails. What shape does toMarkdown actually return, and how do I read the markdown?
