// view-src/code-browser/highlighter.ts
//
// Fine-grained, no-WASM Shiki (CODEBASE-BROWSER-PLAN §4.2): createHighlighterCore
// + the JavaScript RegExp engine (no .wasm to inline, CSP-clean — grammar
// compilation uses the RegExp constructor, NOT eval) + exactly the langs we
// ship. The backend maps extensions honestly (toml/rust/go included), so any
// lang the bundle didn't load falls back to plaintext here rather than 500ing.

import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import warmPaper from './theme-warm-paper.json';

const THEME = 'warm-paper';

// Bundle-size lever (plan §8 "trim langs"): the standalone `typescript`
// grammar is ~190 KiB and a strict subset of what `tsx` tokenizes, so ts/jsx
// requests are ALIASED onto the one tsx grammar instead of shipping three
// overlapping JS-family grammars. `javascript` + `css` ride along anyway as
// hard imports of the `html` grammar.
const LANG_ALIAS: Record<string, string> = {
  typescript: 'tsx',
  jsx: 'tsx',
};

let corePromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  corePromise ??= createHighlighterCore({
    themes: [warmPaper as never],
    langs: [
      import('@shikijs/langs/tsx'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/markdown'),
      import('@shikijs/langs/css'),
      import('@shikijs/langs/html'),
      import('@shikijs/langs/bash'),
      import('@shikijs/langs/yaml'),
      import('@shikijs/langs/python'),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return corePromise;
}

/** Highlight to Shiki HTML; unknown langs degrade to plaintext, never throw. */
export async function highlight(code: string, language?: string): Promise<string> {
  const shiki = await getHighlighter();
  const loaded = shiki.getLoadedLanguages();
  let lang = language ?? 'plaintext';
  if (!loaded.includes(lang)) lang = LANG_ALIAS[lang] ?? 'plaintext';
  if (!loaded.includes(lang)) lang = 'plaintext';
  return shiki.codeToHtml(code, { lang, theme: THEME });
}
