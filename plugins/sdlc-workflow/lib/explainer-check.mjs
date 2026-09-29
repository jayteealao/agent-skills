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
   skills/wf/reference/_story-arc.md instead ("The explainer contract").
   This check covers the parts a script can see:
     - the first element is a <p> (the plain summary): at most 3 sentences
       and about 70 words;
     - the body beyond the summary (include JSON not counted) has at least
       about 250 words (stage/master explainer) or 150 (per-slice explainer);
     - visuals: a stage/master explainer has two or more, a per-slice one at
       least one, unless a `<!-- no-visual: <reason> -->` comment says why.
       A visual is an `@include explainer/<known name>`, an inline <svg>, or
       a data-ex interactive block (steps, slider, toggle);
     - an unknown snippet name; a free <svg> without a <title> or with
       hard-coded colours (theme tokens only);
     - data-ex markup: a slider with no frames, a toggle with no panel, a
       step-through with fewer than two steps;
     - each visual directly follows a <p> sentence that says what it shows;
     - the last element is a <p> or a list (the recap) that restates ideas,
       not counts;
     - no <html>, <head> or <body>; no <script> (assets/explainer.js is the
       only script; it runs the declarative data-ex-* markup).
   The floors that depend on the explainer kind (body words, visual count)
   apply only when the caller passes the file name. Every finding is a
   warning. Only a file that does not parse (an unclosed or mismatched tag,
   an unclosed comment) is an error.
   ──────────────────────────────────────────────────────────────────── */

/** The snippet names under components/explainer/ (explainer-v2 spec). */
export const EXPLAINER_SNIPPETS = Object.freeze([
  'sequence', 'comparison', 'cycle', 'dependency', 'layout', 'trend', 'states', 'steps',
]);

// Per-slice explainer stems; every other explainer is a stage or master one.
const SLICE_STEM_RE = /^(?:03-slice|04-plan|05-implement|06-verify|07-review)-.+$/;

export const BODY_MIN_WORDS = Object.freeze({ stage: 250, slice: 150 });
export const MIN_VISUALS = Object.freeze({ stage: 2, slice: 1 });

/**
 * The explainer kind from its file name: 'slice' for a per-slice explainer,
 * 'stage' for a stage or master explainer, null when the name is not an
 * explainer (or no name is given).
 */
export function explainerKind(fileName) {
  const base = String(fileName ?? '').replace(/\\/g, '/').split('/').pop();
  if (!base.endsWith(EXPLAINER_SUFFIX)) return null;
  const stem = base.slice(0, -EXPLAINER_SUFFIX.length);
  return SLICE_STEM_RE.test(stem) ? 'slice' : 'stage';
}

const ATTR_RE = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  for (const m of attrText.matchAll(ATTR_RE)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

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
    const [, comment, closeTag, openTag, attrText, selfClose, txt, stray] = m;
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
      const el = { type: 'el', tag, attrs: parseAttrs(attrText), children: [] };
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

const INCLUDE_RE = /^\s*@include\s+(explainer\/([a-z][a-z0-9-]*))\s*([\s\S]*?)\s*$/;

function isExplainerInclude(node) {
  return node.type === 'comment' && /^\s*@include\s+explainer\//.test(node.text);
}

function includeName(node) {
  return INCLUDE_RE.exec(node.text)?.[2] ?? null;
}

function isKnownInclude(node) {
  return isExplainerInclude(node) && EXPLAINER_SNIPPETS.includes(includeName(node));
}

const attr = (node, name) => (node?.type === 'el' ? node.attrs?.[name] : undefined);
const hasAttr = (node, name) => attr(node, name) !== undefined;

// data-ex attributes that make an element (or its block) interactive.
const INTERACTIVE_ATTRS = ['data-ex-steps', 'data-ex-slider', 'data-ex-toggle'];

function* elementsOf(node) {
  for (const child of node.children ?? []) {
    if (child.type !== 'el') continue;
    yield child;
    yield* elementsOf(child);
  }
}

function* nodesOf(node) {
  for (const child of node.children ?? []) {
    yield child;
    if (child.type === 'el') yield* nodesOf(child);
  }
}

/** A top-level block that the reader sees as a picture. */
function isVisual(node) {
  if (isExplainerInclude(node)) return true;
  if (node.type !== 'el' || node.tag === 'p') return false;
  if (node.tag === 'svg' || node.tag === 'figure') return true;
  const self = [node, ...elementsOf(node)];
  return self.some((el) => el.tag === 'svg' || INTERACTIVE_ATTRS.some((a) => hasAttr(el, a)))
    || [...nodesOf(node)].some(isKnownInclude);
}

function describe(node) {
  if (isExplainerInclude(node)) return `@include ${node.text.trim().split(/\s+/)[1]}`;
  if (node.type === 'el') return `<${node.tag}>`;
  return 'text';
}

// The summary paragraph is two or three sentences, at most about 70 words
// (explainer contract floors).
export const SUMMARY_MAX_SENTENCES = 3;
export const SUMMARY_MAX_WORDS = 70;

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (node.type !== 'el' || RAW_TEXT_TAGS.has(node.tag)) return '';
  const inner = node.children.map(textOf).join('');
  // Block-level (and SVG text) elements are spaced so their words do not run together.
  return SPACED_TAGS.has(node.tag) ? ` ${inner} ` : inner;
}

const SPACED_TAGS = new Set([
  'p', 'li', 'ul', 'ol', 'div', 'section', 'article', 'figure', 'figcaption', 'table', 'tr', 'td', 'th',
  'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'button', 'label', 'br',
  'svg', 'g', 'text', 'tspan', 'title', 'desc',
]);

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

/** True when more than half of the word tokens carry a digit. */
export function isMostlyNumbers(text) {
  const tokens = String(text ?? '').trim().split(/\s+/).filter((w) => /\w/.test(w));
  if (!tokens.length) return false;
  return tokens.filter((w) => /\d/.test(w)).length * 2 > tokens.length;
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
 * visual; a name with no snippet renders nothing; a comparison whose bars are
 * all equal (or that has fewer than two bars) is a list, not a chart.
 */
function checkExplainerInclude(commentText) {
  const m = INCLUDE_RE.exec(commentText);
  if (!m) return [];
  const [, name, short, payload] = m;
  if (!EXPLAINER_SNIPPETS.includes(short)) {
    return [`explainer: @include ${name} is not a known snippet (use one of ${EXPLAINER_SNIPPETS.join(', ')}, or a free <svg>)`];
  }
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

/* ── free SVG ─────────────────────────────────────────────────────── */

const COLOUR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
const COLOUR_PROP_RE = /(?:^|[;{\s])(fill|stroke|stop-color|flood-color|lighting-color|color|background(?:-color)?)\s*:\s*([^;}"]+)/gi;
const COLOUR_KEYWORDS = /^(?:none|currentcolor|transparent|inherit|initial|unset|revert|context-fill|context-stroke)$/i;

/** A colour value that is not a theme token (hex, rgb(), hsl(), a named colour). */
function isHardColour(value) {
  const v = String(value ?? '').trim().replace(/\s*!important$/i, '');
  if (!v || COLOUR_KEYWORDS.test(v)) return false;
  if (/^var\(/i.test(v) || /^url\(/i.test(v)) return false;
  return true;
}

function hardColoursIn(svg) {
  const found = [];
  for (const el of [svg, ...elementsOf(svg)]) {
    for (const a of COLOUR_ATTRS) {
      if (isHardColour(attr(el, a))) found.push(`${a}="${attr(el, a)}"`);
    }
    const css = [attr(el, 'style') ?? ''];
    if (el.tag === 'style') css.push(textOf({ ...el, tag: 'x' }));
    for (const text of css) {
      for (const m of text.matchAll(COLOUR_PROP_RE)) {
        if (isHardColour(m[2])) found.push(`${m[1]}: ${m[2].trim()}`);
      }
    }
  }
  return found;
}

function checkFreeSvg(svg, n) {
  const warns = [];
  if (![...elementsOf(svg)].some((el) => el.tag === 'title')) {
    warns.push(`explainer: <svg> #${n} has no <title>; give it a <title> that names what it shows`);
  }
  const hard = hardColoursIn(svg);
  if (hard.length) {
    warns.push(`explainer: <svg> #${n} hard-codes colours (${[...new Set(hard)].slice(0, 3).join(', ')}); use theme tokens, var(--…), so it follows light and dark`);
  }
  return warns;
}

/* ── data-ex markup ───────────────────────────────────────────────── */

function checkInteractive(tree) {
  const warns = [];
  const els = [...elementsOf(tree)];
  const groups = (name) => new Set(els.filter((el) => hasAttr(el, name)).map((el) => attr(el, name)));
  const frames = groups('data-ex-frames');
  const panels = groups('data-ex-panel');
  for (const g of groups('data-ex-slider')) {
    if (!frames.has(g)) warns.push(`explainer: slider data-ex-slider="${g}" has no [data-ex-frames="${g}"]; add the precomputed frames`);
  }
  for (const g of groups('data-ex-toggle')) {
    if (!panels.has(g)) warns.push(`explainer: toggle data-ex-toggle="${g}" has no [data-ex-panel="${g}"]; add a panel for each button`);
  }
  for (const el of els.filter((e) => hasAttr(e, 'data-ex-steps'))) {
    const steps = [...elementsOf(el)].filter((e) => hasAttr(e, 'data-ex-step')).length;
    if (steps < 2) warns.push(`explainer: a [data-ex-steps] block has ${steps} [data-ex-step]; a step-through needs at least two`);
  }
  return warns;
}

/**
 * Count the visuals: known snippet includes, inline <svg> elements and
 * interactive data-ex blocks (each step-through, slider group and toggle
 * group is one). An <svg> inside an interactive block (a frame, a panel, a
 * step) is part of that one visual; free <svg> elements are returned for
 * their own checks.
 */
function collectVisuals(tree) {
  let count = 0;
  const svgs = [];
  const groups = new Set();
  const walk = (node, inInteractive) => {
    for (const child of node.children ?? []) {
      if (child.type === 'comment') {
        if (isKnownInclude(child) && !inInteractive) count++;
        continue;
      }
      if (child.type !== 'el') continue;
      let inside = inInteractive;
      if (hasAttr(child, 'data-ex-steps')) {
        if (!inInteractive) count++;
        inside = true;
      }
      for (const [a, kind] of [['data-ex-slider', 'slider'], ['data-ex-toggle', 'toggle']]) {
        if (hasAttr(child, a) && !groups.has(`${kind}:${attr(child, a)}`)) {
          groups.add(`${kind}:${attr(child, a)}`);
          count++;
        }
      }
      if (hasAttr(child, 'data-ex-frames') || hasAttr(child, 'data-ex-panel')) inside = true;
      if (child.tag === 'svg') {
        svgs.push(child);
        if (!inside) count++;
        continue;
      }
      walk(child, inside);
    }
  };
  walk(tree, false);
  return { count, svgs };
}

const NO_VISUAL_RE = /^\s*no-visual\s*:\s*\S/;

/**
 * The explainer shape check. Returns `{ errs, warns }` like validateFragment.
 * `fileName` (optional) is the explainer's path or name; it sets the kind
 * (stage/master or per-slice) that picks the body and visual floors.
 */
export function checkExplainer(text, fileName = null) {
  const errs = [];
  const warns = [];
  let tree;
  try {
    tree = parseFragmentTree(String(text ?? ''));
  } catch (err) {
    errs.push(`explainer does not parse: ${err.message}`);
    return { errs, warns };
  }
  const kind = explainerKind(fileName);
  const lower = String(text).toLowerCase();
  for (const tag of ['<html', '<head', '<body']) {
    if (new RegExp(`${tag}[\\s>]`).test(lower)) warns.push(`explainer: remove ${tag}> (a fragment is not a full document)`);
  }
  if (/<script[\s>]/.test(lower)) {
    warns.push('explainer: remove the <script>; the view runs one script (assets/explainer.js) and inline scripts never run (CSP script-src \'self\'); use data-ex-* markup for interaction');
  }
  // Blocks = top-level nodes without blank text, non-include comments and
  // <style>. A single plain wrapper element around everything is looked through.
  const blocksOf = (el) => el.children.filter((n) => !isBlank(n)
    && !(n.type === 'comment' && !isExplainerInclude(n))
    && !(n.type === 'el' && n.tag === 'style'));
  let blocks = blocksOf(tree);
  while (blocks.length === 1 && blocks[0].type === 'el' && WRAPPER_TAGS.has(blocks[0].tag)
    && !INTERACTIVE_ATTRS.some((a) => hasAttr(blocks[0], a))) {
    blocks = blocksOf(blocks[0]);
  }
  if (!blocks.length) {
    warns.push('explainer: empty — open with a plain summary paragraph');
    return { errs, warns };
  }
  const isP = (n) => n?.type === 'el' && n.tag === 'p';
  const isList = (n) => n?.type === 'el' && (n.tag === 'ul' || n.tag === 'ol');
  const hasSummary = isP(blocks[0]);
  if (!hasSummary) {
    warns.push(`explainer: open with a plain summary <p> (first element is ${describe(blocks[0])})`);
  } else {
    const summary = plainText(blocks[0]);
    const sentences = countSentences(summary);
    const words = countWords(summary);
    if (sentences > SUMMARY_MAX_SENTENCES) {
      warns.push(`explainer: the summary <p> has ${sentences} sentences; keep it to two or ${SUMMARY_MAX_SENTENCES} and move detail below it`);
    }
    if (words > SUMMARY_MAX_WORDS) {
      warns.push(`explainer: the summary <p> has ${words} words; keep it under about ${SUMMARY_MAX_WORDS} and move detail below it`);
    }
  }
  for (const c of commentsOf(tree)) {
    if (isExplainerInclude(c)) warns.push(...checkExplainerInclude(c.text));
  }
  const { count: visuals, svgs } = collectVisuals(tree);
  svgs.forEach((svg, i) => warns.push(...checkFreeSvg(svg, i + 1)));
  warns.push(...checkInteractive(tree));

  if (kind) {
    const body = blocks.slice(hasSummary ? 1 : 0).map(plainText).join(' ');
    const bodyWords = countWords(body);
    const floor = BODY_MIN_WORDS[kind];
    if (bodyWords < floor) {
      warns.push(`explainer: the body has ${bodyWords} words beyond the summary; a ${kind === 'slice' ? 'per-slice' : 'stage'} explainer needs about ${floor} — explain what was built or decided, how it works, why (and what was rejected), and what it means`);
    }
    const escaped = [...commentsOf(tree)].some((c) => NO_VISUAL_RE.test(c.text));
    if (!escaped && visuals < MIN_VISUALS[kind]) {
      warns.push(`explainer: ${visuals} visual${visuals === 1 ? '' : 's'}; a ${kind === 'slice' ? 'per-slice explainer needs at least one' : 'stage explainer normally has two or more'} — add a visual for each part with structure, or say in the text why there is none (<!-- no-visual: <reason> -->)`);
    }
  }

  // A toggle panel or a slider's frames continue the interactive group that
  // the block before them opened (the buttons, the slider, an earlier panel):
  // one sentence introduces the whole group.
  const GROUP_ATTRS = [...INTERACTIVE_ATTRS, 'data-ex-panel', 'data-ex-frames'];
  const interactive = (n) => n?.type === 'el' && [n, ...elementsOf(n)].some((el) => GROUP_ATTRS.some((a) => hasAttr(el, a)));
  const continuesGroup = (n, prev) => n.type === 'el'
    && (hasAttr(n, 'data-ex-panel') || hasAttr(n, 'data-ex-frames'))
    && interactive(prev);
  blocks.forEach((n, i) => {
    if (!isVisual(n)) return;
    if (continuesGroup(n, blocks[i - 1])) return;
    if (!isP(blocks[i - 1])) {
      warns.push(`explainer: put one <p> sentence before ${describe(n)} #${blocks.slice(0, i + 1).filter(isVisual).length} that says what it shows`);
    }
  });
  const last = blocks[blocks.length - 1];
  if (!(isP(last) || isList(last)) || blocks.length < 2) {
    warns.push('explainer: close with a short recap <p> or list');
  } else if (isMostlyNumbers(plainText(last).replace(/^recap:?\s*/i, ''))) {
    warns.push('explainer: the recap is mostly numbers; restate the ideas, not the counts');
  }
  return { errs, warns };
}
