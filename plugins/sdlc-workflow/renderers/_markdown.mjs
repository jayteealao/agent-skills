// renderers/_markdown.mjs
// MD → HTML via markdown-it.
//
// v9.24.0: rendered MD is now ALWAYS embedded in the view page, even when a
// `.html.fragment` sibling is present (fragment is "rich projection on top";
// MD is "narrative below"). So this helper is now the primary text-layer
// renderer rather than a fallback.
//
// Customizations:
//   - markdown-it-anchor adds stable `id="…"` to h1–h4 with permalink anchors
//   - fenced code blocks emit `<pre><code class="hljs language-X">` so CSS
//     can theme them via `.prose pre code.language-X` and a future JS
//     enhancer (highlight.js, shiki, prism) can pick them up by class.
//   - tables get `<table class="prose-table">` so they don't collide with the
//     more compact `<table class="files-touched">` and other custom tables.
//   - blockquotes get `<blockquote class="prose-quote">` for similar reasons.
//
// Library choice — current ecosystem (researched 2026-05-22):
//   - markdown-it (current): fast, plugin-rich, streaming. Best fit for our
//     Tailscale-served static site since the renderer runs at build time
//     and we never ship a client-side parser.
//   - unified/remark/rehype: AST-based, more powerful transforms, used by
//     MDX. Heavier API and slower; overkill for our narrow needs.
//   - marked: simpler API, smaller surface; less plugin reach.
// Decision: stay with markdown-it. If we later need MDX-style component
// embedding, switch to unified/remark/rehype.
//
// Syntax-highlighter options if we later want richer code blocks:
//   - highlight.js — zero-config, ~50 KB, auto-detect, regex-based.
//     Best for "ship classes now, theme later."
//   - prism.js — token-based, plugin-driven, ~20 KB + per-language adds.
//   - shiki — VS Code grammars, accurate themes, build-time HTML output
//     with no client JS. Heaviest grammar payload (~500 KB-1 MB).
// We emit `class="hljs language-X"` so highlight.js works out of the box
// if a consumer later includes its CSS + JS bundle.

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const md = new MarkdownIt({
  html: true,          // allow inline HTML inside MD (renderer-emitted snippets)
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (str, lang) => {
    // No actual highlighting at build time (keeps zero JS deps for now),
    // but emit classed code so CSS + future client JS can hook it. The
    // returned HTML replaces markdown-it's default `<pre><code>`.
    const langClass = lang ? ` language-${escapeAttr(lang)}` : '';
    return `<pre><code class="hljs${langClass}">${escapeHtml(str)}</code></pre>`;
  },
});

md.use(anchor, {
  permalink: anchor.permalink.headerLink({ safariReaderFix: true }),
  level: [1, 2, 3, 4],
  slugify: (s) =>
    s.toLowerCase()
     .trim()
     .replace(/[^\w\s-]/g, '')
     .replace(/\s+/g, '-'),
});

// Override table and blockquote open rules to add stable classes — lets
// the calm-reader CSS target `.prose-table` / `.prose-quote` without
// fighting more specific selectors elsewhere on the page.
md.renderer.rules.table_open = () => '<table class="prose-table">\n';
md.renderer.rules.blockquote_open = () => '<blockquote class="prose-quote">\n';

/**
 * Render markdown to HTML.
 *   - h1–h4 carry stable `id="..."` + permalink anchors.
 *   - fenced code blocks emit `<pre><code class="hljs language-X">`.
 *   - tables / blockquotes carry `prose-table` / `prose-quote` classes.
 */
export function md2html(source) {
  if (!source || typeof source !== 'string') return '';
  return md.render(source).trim();
}

/**
 * Render inline markdown (no <p> wrapper) — used for one-line lede paragraphs,
 * frontmatter card values, and breadcrumb labels.
 */
export function mdInline(source) {
  if (!source || typeof source !== 'string') return '';
  return md.renderInline(source).trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s ?? '').replace(/[^\w-]/g, '');
}
