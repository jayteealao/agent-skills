// One-shot smoke test: confirm the Claude Agent SDK can run locally and reach a model.
import { query } from '@anthropic-ai/claude-agent-sdk';

const start = Date.now();
let messages = 0;
let toolUses = 0;
let firstText = null;
const ac = new AbortController();
setTimeout(() => ac.abort(), 60_000);

try {
  for await (const msg of query({
    prompt: "Say only the word 'pong'.",
    options: {
      maxTurns: 1,
      model: 'haiku',
      abortController: ac,
      tools: [],
    },
  })) {
    messages++;
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && firstText === null) firstText = block.text.slice(0, 80);
        if (block.type === 'tool_use') toolUses++;
      }
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`SDK OK in ${elapsed}s — messages=${messages}, tool_uses=${toolUses}, firstText=${JSON.stringify(firstText)}`);
} catch (err) {
  console.error('SDK FAILED:', err?.message || err);
  process.exit(1);
}
