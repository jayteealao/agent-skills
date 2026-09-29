// lib/explainer-check.mjs — the explainer shape check (ARTIFACT-SPLIT-PLAN S2,
// W5; rules in skills/wf/reference/_story-arc.md A1–A5). Pure: no file access.
// Shared by scripts/verify-fragment.mjs (the CLI and the --root walk) and
// hooks/post-write-verify.mjs (the write-time nudge).

export const EXPLAINER_SUFFIX = '.explainer.html.fragment';

/** Is this path an explainer fragment (`<stem>.explainer.html.fragment`)? */
export function isExplainerFragmentPath(p) {
  return String(p ?? '').replace(/\\/g, '/').endsWith(EXPLAINER_SUFFIX);
}

/* ── Explainer check (warn-only, W5) ─────────────────────────────────
   `<stem>.explainer.html.fragment` is a free fragment, so the envelope
   contract does not apply. It follows the explainer rules in
   skills/wf/reference/_story-arc.md instead; this check covers the parts a
   script can see:
     - the first element is a <p> (the plain summary);
     - each visual (<svg>, <figure>, `@include explainer/*`) directly follows
       a <p> sentence that says what it shows;
     - the last element is a <p> (the recap);
     - no <html>, <head> or <body>;
     - no <script> (the view's CSP `script-src 'self'` blocks inline scripts,
       so a script in a fragment never runs).
   Every finding is a warning. Only a file that does not parse (an unclosed
   or mismatched tag, an unclosed comment) is an error.
   ──────────────────────────────────────────────────────────────────── */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
// Tags HTML lets an author leave open; a close tag of an ancestor closes them.
const IMPLIED_END = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'thead', 'tbody', 'tfoot']);
const WRAPPER_TAGS = new Set(['div', 'section', 'article', 'main']);

/**
 * Parse a fragment into a light element tree:
 *   { type: 'el', tag, children } | { type: 'text', text } | { type: 'comment', text }
 * Throws Error on a structure that does not parse.
 */
export function parseFragmentTree(text) {
  const root = { type: 'el', tag: '#root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const TOKEN = /<!--([\s\S]*?)-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    const [, comment, closeTag, openTag, , selfClose, txt, stray] = m;
    if (comment !== undefined) {
      top().children.push({ type: 'comment', text: comment });
    } else if (closeTag) {
      const tag = closeTag.toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag && IMPLIED_END.has(stack[i].tag)) i--;
      if (i === 0 || stack[i].tag !== tag) {
        throw new Error(`unexpected </${tag}> (open element: <${top().tag}>)`);
      }
      stack.length = i;
    } else if (openTag) {
      const tag = openTag.toLowerCase();
      const el = { type: 'el', tag, children: [] };
      top().children.push(el);
      if (RAW_TEXT_TAGS.has(tag)) {
        const end = text.toLowerCase().indexOf(`</${tag}`, TOKEN.lastIndex);
        if (end === -1) throw new Error(`unclosed <${tag}>`);
        el.children.push({ type: 'text', text: text.slice(TOKEN.lastIndex, end) });
        const close = text.indexOf('>', end);
        TOKEN.lastIndex = close === -1 ? text.length : close + 1;
      } else if (!selfClose && !VOID_TAGS.has(tag)) {
        stack.push(el);
      }
    } else if (txt !== undefined) {
      top().children.push({ type: 'text', text: txt });
    } else if (stray) {
      if (text.startsWith('<!--', m.index)) throw new Error('unclosed comment');
      top().children.push({ type: 'text', text: '<' });
    }
  }
  const unclosed = stack.slice(1).filter((el) => !IMPLIED_END.has(el.tag));
  if (unclosed.length) throw new Error(`unclosed <${unclosed[unclosed.length - 1].tag}>`);
  return root;
}

function isBlank(node) {
  return node.type === 'text' && !node.text.trim();
}

function isExplainerInclude(node) {
  return node.type === 'comment' && /^\s*@include\s+explainer\//.test(node.text);
}

function isVisual(node) {
  return (node.type === 'el' && (node.tag === 'svg' || node.tag === 'figure')) || isExplainerInclude(node);
}

function describe(node) {
  if (isExplainerInclude(node)) return `@include ${node.text.trim().split(/\s+/)[1]}`;
  if (node.type === 'el') return `<${node.tag}>`;
  return 'text';
}

// A1/A3: the summary paragraph is two to five sentences. A paragraph over this
// many words stops being a summary even when its sentence count is fine.
export const SUMMARY_MAX_SENTENCES = 5;
export const SUMMARY_MAX_WORDS = 90;

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (node.type !== 'el' || RAW_TEXT_TAGS.has(node.tag)) return '';
  return node.children.map(textOf).join('');
}

function plainText(node) {
  return textOf(node)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sentences in plain text: split after `.`, `!` or `?` followed by white space. */
export function countSentences(text) {
  return String(text ?? '').trim().split(/(?<=[.!?])["')\]]*\s+/).filter((s) => /\w/.test(s)).length;
}

export function countWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter((w) => /\w/.test(w)).length;
}

function* commentsOf(node) {
  for (const child of node.children ?? []) {
    if (child.type === 'comment') yield child;
    else if (child.type === 'el') yield* commentsOf(child);
  }
}

/**
 * Checks on one `@include explainer/<name> <json>` token. The renderer expands
 * the token and throws on JSON that does not parse, so the page loses the
 * visual; a comparison whose bars are all equal (or that has fewer than two
 * bars) is a list, not a chart.
 */
function checkExplainerInclude(commentText) {
  const m = /^\s*@include\s+(explainer\/[a-z][a-z0-9-]*)\s*([\s\S]*?)\s*$/.exec(commentText);
  if (!m) return [];
  const [, name, payload] = m;
  let data = {};
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch (err) {
      return [`explainer: @include ${name} JSON does not parse (${err.message}); the renderer cannot expand it`];
    }
  }
  const warns = [];
  if (name === 'explainer/comparison') {
    const bars = Array.isArray(data?.bars) ? data.bars : [];
    if (bars.length < 2) {
      warns.push(`explainer: @include ${name} has ${bars.length} bar${bars.length === 1 ? '' : 's'}; a comparison needs at least two (write one fact as a sentence)`);
    } else {
      const values = new Set(bars.map((b) => Number(b?.value)));
      if (values.size === 1) {
        warns.push(`explainer: @include ${name} bars all have the value ${[...values][0]}; that is a list, not a chart (use a list or a sentence)`);
      }
    }
  }
  return warns;
}

/**
 * The explainer shape check. Returns `{ errs, warns }` like validateFragment.
 */
export function checkExplainer(text) {
  const errs = [];
  const warns = [];
  let tree;
  try {
    tree = parseFragmentTree(String(text ?? ''));
  } catch (err) {
    errs.push(`explainer does not parse: ${err.message}`);
    return { errs, warns };
  }
  const lower = String(text).toLowerCase();
  for (const tag of ['<html', '<head', '<body']) {
    if (new RegExp(`${tag}[\\s>]`).test(lower)) warns.push(`explainer: remove ${tag}> (a fragment is not a full document)`);
  }
  if (/<script[\s>]/.test(lower)) {
    warns.push("explainer: <script> never runs in the view (CSP script-src 'self'); use CSS-only interaction or remove it");
  }
  // Blocks = top-level nodes without blank text, non-include comments and
  // <style>. A single wrapper element around everything is looked through.
  const blocksOf = (el) => el.children.filter((n) => !isBlank(n)
    && !(n.type === 'comment' && !isExplainerInclude(n))
    && !(n.type === 'el' && n.tag === 'style'));
  let blocks = blocksOf(tree);
  while (blocks.length === 1 && blocks[0].type === 'el' && WRAPPER_TAGS.has(blocks[0].tag)) {
    blocks = blocksOf(blocks[0]);
  }
  if (!blocks.length) {
    warns.push('explainer: empty — open with a plain summary paragraph');
    return { errs, warns };
  }
  const isP = (n) => n?.type === 'el' && n.tag === 'p';
  if (!isP(blocks[0])) {
    warns.push(`explainer: open with a plain summary <p> (first element is ${describe(blocks[0])})`);
  } else {
    const summary = plainText(blocks[0]);
    const sentences = countSentences(summary);
    const words = countWords(summary);
    if (sentences > SUMMARY_MAX_SENTENCES) {
      warns.push(`explainer: the summary <p> has ${sentences} sentences; keep it to two to ${SUMMARY_MAX_SENTENCES} and move detail below it`);
    }
    if (words > SUMMARY_MAX_WORDS) {
      warns.push(`explainer: the summary <p> has ${words} words; keep it under about ${SUMMARY_MAX_WORDS} and move detail below it`);
    }
  }
  for (const c of commentsOf(tree)) {
    if (isExplainerInclude(c)) warns.push(...checkExplainerInclude(c.text));
  }
  blocks.forEach((n, i) => {
    if (!isVisual(n)) return;
    if (!isP(blocks[i - 1])) {
      warns.push(`explainer: put one <p> sentence before ${describe(n)} #${blocks.slice(0, i + 1).filter(isVisual).length} that says what it shows`);
    }
  });
  if (!isP(blocks[blocks.length - 1]) || blocks.length < 2) {
    warns.push('explainer: close with a short recap <p>');
  }
  return { errs, warns };
}

