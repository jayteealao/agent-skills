// renderers/_markdown.mjs
// MD → HTML via markdown-it with anchor-IDs enabled. The renderer's MD path
// only fires for artifacts without a `.html.fragment` sibling — fragment-
// bearing artifacts bypass this helper entirely (see _components.mjs for the
// fragment path, v9.20.1+).

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const md = new MarkdownIt({
  html: true,          // allow inline HTML inside MD (renderer-emitted snippets)
  linkify: true,
  typographer: true,
  breaks: false,
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

/**
 * Render markdown to HTML. Code blocks preserve language hints so the calm-
 * reader CSS can style them via `pre code[class^="language-"]`.
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
