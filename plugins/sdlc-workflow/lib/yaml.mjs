// A small YAML reader and writer for the frontmatter and records of the plugin.
//
// The reader takes block mappings and sequences (a sequence may sit at the indent of its
// key), flow collections over one or more lines, plain scalars (folded over lines), single-
// and double-quoted scalars, literal and folded block scalars, and comments. A plain scalar
// resolves to null, a boolean, an integer, a float or a string, as YAML 1.2 core does; a
// timestamp stays a string. An anchor on a block value and its alias read back as a copy;
// tags, complex keys, anchors in flow collections and more than one document are refused.
//
// The writer emits block style, or flow style with { flow: true }. A string is plain when
// it reads back as the same string, and double-quoted otherwise; a string with a newline
// is a literal block.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.name = 'YamlError';
    this.line = line;
  }
}

// ---------------------------------------------------------------- scalars

const NULLS = new Set(['', '~', 'null', 'Null', 'NULL']);
const TRUES = new Set(['true', 'True', 'TRUE']);
const FALSES = new Set(['false', 'False', 'FALSE']);

/** Resolve a plain scalar. */
export function resolvePlain(s) {
  if (NULLS.has(s)) return null;
  if (TRUES.has(s)) return true;
  if (FALSES.has(s)) return false;
  if (/^[-+]?(0|[1-9][0-9_]*)$/.test(s)) return Number.parseInt(s.replace(/_/g, ''), 10);
  if (/^0x[0-9a-fA-F_]+$/.test(s)) return Number.parseInt(s.slice(2).replace(/_/g, ''), 16);
  if (/^0o[0-7_]+$/.test(s)) return Number.parseInt(s.slice(2).replace(/_/g, ''), 8);
  if (/^0b[01_]+$/.test(s)) return Number.parseInt(s.slice(2).replace(/_/g, ''), 2);
  if (/^[-+]?(\.[0-9]+|[0-9][0-9_]*(\.[0-9_]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number.parseFloat(s.replace(/_/g, ''));
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return Number.NaN;
  return s;
}

const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ' };

/**
 * Fold the raw lines of a multi-line quoted or plain scalar: a single break is a space, an
 * empty line a newline. A quoted scalar keeps the trailing spaces of a line, as js-yaml does.
 */
function fold(parts, { quoted = false } = {}) {
  let out = '';
  let pendingBreaks = 0;
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const t = quoted
      ? (i === 0 ? p : p.replace(/^[ \t]+/, ''))
      : (i === 0 ? p.replace(/[ \t]+$/, '') : last ? p.replace(/^[ \t]+/, '') : p.trim());
    if (i > 0 && t.trim() === '' && !last) { pendingBreaks += 1; return; }
    if (i > 0) out += pendingBreaks ? '\n'.repeat(pendingBreaks) : ' ';
    pendingBreaks = 0;
    out += t;
  });
  return out;
}

function unescapeDouble(body, line) {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c !== '\\') { out += c; continue; }
    const n = body[(i += 1)];
    if (n in ESCAPES) out += ESCAPES[n];
    else if (n === 'x' || n === 'u' || n === 'U') {
      const len = n === 'x' ? 2 : n === 'u' ? 4 : 8;
      const hex = body.slice(i + 1, i + 1 + len);
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) throw new YamlError(`bad escape \\${n}${hex}`, line);
      out += String.fromCodePoint(Number.parseInt(hex, 16));
      i += len;
    } else if (n === '\n') {
      while (body[i + 1] === ' ' || body[i + 1] === '\t') i += 1;
    } else throw new YamlError(`bad escape \\${n}`, line);
  }
  return out;
}

/** Read a quoted scalar that starts at text[i]. Returns [value, index after the closing quote]. */
function readQuoted(text, i, line) {
  const q = text[i];
  let j = i + 1;
  let raw = '';
  for (;;) {
    if (j >= text.length) throw new YamlError('unterminated quoted scalar', line);
    const c = text[j];
    if (q === "'" && c === "'") {
      if (text[j + 1] === "'") { raw += "'"; j += 2; continue; }
      break;
    }
    if (q === '"' && c === '\\') { raw += c + (text[j + 1] ?? ''); j += 2; continue; }
    if (q === '"' && c === '"') break;
    raw += c;
    j += 1;
  }
  // A quoted scalar over several lines folds its line breaks; an escaped break joins them.
  let value;
  if (q === '"') {
    const joined = raw.replace(/\\\r?\n[ \t]*/g, '');
    value = unescapeDouble(joined.includes('\n') ? fold(joined.split(/\r?\n/), { quoted: true }) : joined, line);
  } else {
    value = raw.includes('\n') ? fold(raw.split(/\r?\n/), { quoted: true }) : raw;
  }
  return [value, j + 1];
}

// ---------------------------------------------------------------- flow

function flowParser(text, line) {
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < text.length && /[ \t\r\n]/.test(text[i])) i += 1;
      if (text[i] === '#' && (i === 0 || /[ \t\r\n]/.test(text[i - 1]))) { while (i < text.length && text[i] !== '\n') i += 1; continue; }
      return;
    }
  };
  const plain = (inMap) => {
    const start = i;
    while (i < text.length) {
      const c = text[i];
      if (c === ',' || c === ']' || c === '}' || c === '[' || c === '{') break;
      if (c === ':' && (inMap || true) && /[ \t\r\n,\]}]/.test(text[i + 1] ?? ' ')) break;
      if (c === '#' && /[ \t]/.test(text[i - 1] ?? '')) break;
      i += 1;
    }
    return fold(text.slice(start, i).split(/\r?\n/)).trim();
  };
  const node = (inMap) => {
    ws();
    const c = text[i];
    if (c === '[') return seq();
    if (c === '{') return map();
    if (c === '"' || c === "'") { const [v, j] = readQuoted(text, i, line); i = j; return v; }
    if (c === '&' || c === '*' || c === '!') throw new YamlError('anchors, aliases and tags are not supported', line);
    return resolvePlain(plain(inMap));
  };
  const seq = () => {
    i += 1;
    const out = [];
    for (;;) {
      ws();
      if (text[i] === ']') { i += 1; return out; }
      if (i >= text.length) throw new YamlError('unterminated flow sequence', line);
      const start = i;
      const v = node(false);
      ws();
      // A single-pair map inside a sequence: [a: 1].
      if (text[i] === ':') { i += 1; out.push({ [String(v)]: node(false) }); ws(); }
      else out.push(v);
      if (text[i] === ',') { i += 1; continue; }
      if (text[i] === ']') { i += 1; return out; }
      if (i === start) throw new YamlError(`unexpected ${text[i]} in flow sequence`, line);
      throw new YamlError('expected , or ] in flow sequence', line);
    }
  };
  const map = () => {
    i += 1;
    const out = {};
    for (;;) {
      ws();
      if (text[i] === '}') { i += 1; return out; }
      if (i >= text.length) throw new YamlError('unterminated flow mapping', line);
      const k = node(true);
      ws();
      let v = null;
      if (text[i] === ':') { i += 1; v = node(true); ws(); }
      const key = String(k);
      if (Object.hasOwn(out, key)) throw new YamlError(`duplicated mapping key ${key}`, line);
      out[key] = v;
      if (text[i] === ',') { i += 1; continue; }
      if (text[i] === '}') { i += 1; return out; }
      throw new YamlError('expected , or } in flow mapping', line);
    }
  };
  return {
    parse() {
      const v = node(false);
      ws();
      if (i < text.length) throw new YamlError(`unexpected text after a flow collection: ${text.slice(i, i + 20)}`, line);
      return v;
    },
  };
}

/** Whether a flow collection that starts in `text` is closed. */
function flowClosed(text) {
  let depth = 0;
  let q = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (q === '"' && c === '\\') { i += 1; continue; }
      if (c === q) { if (q === "'" && text[i + 1] === "'") { i += 1; continue; } q = null; }
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') depth -= 1;
    else if (c === '#' && /[ \t]/.test(text[i - 1] ?? '')) { while (i < text.length && text[i] !== '\n') i += 1; }
  }
  return depth <= 0;
}

// ---------------------------------------------------------------- block

/** Strip a trailing comment from a line, outside quotes. */
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i += 1; continue; }
      if (c === q) { if (q === "'" && s[i + 1] === "'") { i += 1; continue; } q = null; }
      continue;
    }
    if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:-]/.test(s[i - 1]))) q = c;
    else if (c === '#' && (i === 0 || /[ \t]/.test(s[i - 1]))) return s.slice(0, i).replace(/[ \t]+$/, '');
  }
  return s.replace(/[ \t]+$/, '');
}

/** Find the `: ` that ends a mapping key on a line, outside quotes and flow brackets. Returns its index or -1. */
function keyColon(s) {
  let q = null;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i += 1; continue; }
      if (c === q) { if (q === "'" && s[i + 1] === "'") { i += 1; continue; } q = null; }
      continue;
    }
    if ((c === '"' || c === "'") && i === 0) q = c;
    else if (c === '[' || c === '{') { if (i === 0) return -1; depth += 1; }
    else if (c === ']' || c === '}') depth -= 1;
    else if (c === '#' && i > 0 && /[ \t]/.test(s[i - 1])) return -1;
    else if (c === ':' && depth <= 0 && (i + 1 === s.length || /[ \t]/.test(s[i + 1]))) return i;
  }
  return -1;
}

function parseKey(raw, line) {
  const k = raw.trim();
  if (k.startsWith('"') || k.startsWith("'")) {
    const [v, j] = readQuoted(k, 0, line);
    if (k.slice(j).trim()) throw new YamlError(`bad key ${k}`, line);
    return v;
  }
  if (k.startsWith('? ') || k === '?') throw new YamlError('complex keys are not supported', line);
  if (k === '') throw new YamlError('a mapping key is empty', line);
  if (/^[&*!]/.test(k)) throw new YamlError('anchors, aliases and tags are not supported', line);
  return k;
}

class BlockParser {
  constructor(text) {
    this.lines = text.replace(/^﻿/, '').split(/\r?\n/);
    this.i = 0;
    this.anchors = new Map();
  }

  indentOf(n) {
    const l = this.lines[n];
    const m = /^( *)/.exec(l);
    if (/^ *\t/.test(l) && l.trim()) throw new YamlError('a tab in the indentation', n + 1);
    return m[1].length;
  }

  /** Skip blank and comment-only lines; returns the index of the next content line or -1. */
  next() {
    while (this.i < this.lines.length) {
      const t = this.lines[this.i].trim();
      if (t === '' || t.startsWith('#')) { this.i += 1; continue; }
      if (t === '---' || t === '...') {
        if (this.i === 0 || this.lines.slice(0, this.i).every((l) => !l.trim() || l.trim().startsWith('#'))) { this.i += 1; continue; }
        throw new YamlError('a second document is not supported', this.i + 1);
      }
      return this.i;
    }
    return -1;
  }

  parseDocument() {
    const n = this.next();
    if (n < 0) return null;
    const v = this.parseNode(this.indentOf(n));
    if (this.next() >= 0) throw new YamlError('unexpected text after the document', this.i + 1);
    return v;
  }

  /** Parse the node whose first line is at the current index with the given indent. */
  parseNode(indent) {
    const n = this.next();
    const body = this.lines[n].slice(indent);
    if (body === '-' || body.startsWith('- ')) return this.parseSeq(indent);
    if (keyColon(stripComment(body)) >= 0) return this.parseMap(indent);
    return this.parseScalarLines(indent);
  }

  /** A scalar or a flow collection as a whole node (a document or a sequence item of its own). */
  parseScalarLines(indent) {
    const n = this.i;
    return this.inlineValue(this.lines[n].slice(indent).trim(), indent - 1, n);
  }

  parseSeq(indent) {
    const out = [];
    for (;;) {
      const n = this.next();
      if (n < 0 || this.indentOf(n) !== indent) break;
      const body = this.lines[n].slice(indent);
      if (!(body === '-' || body.startsWith('- '))) break;
      const rest = body.slice(1);
      const lead = rest.length - rest.trimStart().length;
      const content = rest.trimStart();
      if (!stripComment(content)) {
        // The item is on the next lines, more indented.
        this.i = n + 1;
        const m = this.next();
        if (m < 0 || this.indentOf(m) <= indent) { out.push(null); continue; }
        out.push(this.parseNode(this.indentOf(m)));
        continue;
      }
      // The item starts on this line: rewrite the dash as indent so a map or a nested
      // sequence parses at the column of its content.
      const col = indent + 1 + lead;
      this.lines[n] = ' '.repeat(col) + content;
      out.push(this.parseItem(col));
    }
    return out;
  }

  /** A sequence item that starts at column `col` of the current line. */
  parseItem(col) {
    const n = this.i;
    const body = this.lines[n].slice(col);
    if (body === '-' || body.startsWith('- ')) return this.parseSeq(col);
    if (keyColon(stripComment(body)) >= 0 && !/^[[{]/.test(body)) return this.parseMap(col);
    return this.inlineValue(body.trim(), col - 1, n);
  }

  parseMap(indent) {
    const out = {};
    for (;;) {
      const n = this.next();
      if (n < 0) break;
      const ind = this.indentOf(n);
      if (ind < indent) break;
      if (ind > indent) throw new YamlError('bad indentation of a mapping entry', n + 1);
      const line = stripComment(this.lines[n].slice(indent));
      if (line === '-' || line.startsWith('- ')) break;
      const c = keyColon(line);
      if (c < 0) throw new YamlError(`expected a mapping key: ${line.slice(0, 40)}`, n + 1);
      const key = parseKey(line.slice(0, c), n + 1);
      if (Object.hasOwn(out, key)) throw new YamlError(`duplicated mapping key ${key}`, n + 1);
      const rest = this.lines[n].slice(indent + c + 1).trimStart();
      out[key] = this.valueAfterKey(rest, indent, n);
    }
    return out;
  }

  /** The value of `key:` with `rest` on the same line, the key at `indent`. */
  valueAfterKey(rest, indent, n) {
    const value = stripComment(rest);
    if (value === '') {
      this.i = n + 1;
      const m = this.next();
      if (m < 0) return null;
      const ind = this.indentOf(m);
      const body = this.lines[m].slice(ind);
      // A sequence may sit at the indent of its key.
      if (ind === indent && (body === '-' || body.startsWith('- '))) return this.parseSeq(indent);
      if (ind <= indent) return null;
      return this.parseNode(ind);
    }
    return this.inlineValue(rest, indent, n);
  }

  /** A value that starts on line n, after a key or a dash at column `indent`. */
  inlineValue(rest, indent, n) {
    const first = rest.trim();
    if (/^[|>]/.test(first)) return this.blockScalar(first, indent, n);
    const anchor = /^&([^\s[\]{},]+)(?:[ \t]+|$)/.exec(first);
    if (anchor) {
      const after = first.slice(anchor[0].length);
      const v = stripComment(after) === '' ? this.valueAfterKey('', indent, n) : this.inlineValue(after, indent, n);
      this.anchors.set(anchor[1], v);
      return v;
    }
    const alias = /^\*([^\s[\]{},]+)$/.exec(stripComment(first).trim());
    if (alias) {
      if (!this.anchors.has(alias[1])) throw new YamlError(`unknown alias *${alias[1]}`, n + 1);
      this.i = n + 1;
      return structuredClone(this.anchors.get(alias[1]));
    }
    if (/^[&*!]/.test(first)) throw new YamlError('tags are not supported', n + 1);
    if (first.startsWith('[') || first.startsWith('{')) {
      let text = first;
      let end = n;
      while (!flowClosed(text) && end + 1 < this.lines.length) { end += 1; text += `\n${this.lines[end]}`; }
      this.i = end + 1;
      return flowParser(text, n + 1).parse();
    }
    if (first.startsWith('"') || first.startsWith("'")) {
      // Keep the trailing spaces of the first line: a quoted scalar over lines keeps them.
      let text = rest.trimStart();
      let end = n;
      for (;;) {
        try {
          const [v, j] = readQuoted(text, 0, n + 1);
          if (stripComment(text.slice(j)).trim()) throw new YamlError('unexpected text after a quoted scalar', end + 1);
          this.i = end + 1;
          return v;
        } catch (e) {
          if (!/unterminated/.test(e.message) || end + 1 >= this.lines.length) throw e;
          end += 1;
          text += `\n${this.lines[end]}`;
        }
      }
    }
    // A plain scalar continues on the lines that are more indented than its key.
    const parts = [stripComment(first)];
    let end = n;
    while (end + 1 < this.lines.length) {
      const l = this.lines[end + 1];
      if (l.trim() === '') { parts.push(''); end += 1; continue; }
      if (/^ *#/.test(l) || this.indentOf(end + 1) <= indent) break;
      parts.push(stripComment(l.trim()));
      end += 1;
    }
    while (parts.length > 1 && parts.at(-1) === '') { parts.pop(); end -= 1; }
    // Skip the trailing blank lines that the loop took.
    this.i = end + 1;
    const s = parts.length > 1 ? fold(parts) : parts[0];
    return resolvePlain(s);
  }

  blockScalar(header, indent, n) {
    const m = /^([|>])([1-9]?)([+-]?)([1-9]?)\s*(#.*)?$/.exec(header);
    if (!m) throw new YamlError(`bad block scalar header ${header}`, n + 1);
    const literal = m[1] === '|';
    const chomp = m[3] || '';
    const explicit = Number(m[2] || m[4] || 0);
    let end = n + 1;
    const raw = [];
    let blockIndent = explicit ? indent + explicit : 0;
    while (end < this.lines.length) {
      const l = this.lines[end];
      if (l.trim() === '') { raw.push(''); end += 1; continue; }
      const ind = /^( *)/.exec(l)[1].length;
      if (!blockIndent) blockIndent = ind;
      if (ind < blockIndent || ind <= indent) break;
      raw.push(l.slice(blockIndent));
      end += 1;
    }
    // Trailing blank lines belong to the chomping, not to the next node.
    let trailing = 0;
    while (raw.length && raw.at(-1) === '') { raw.pop(); trailing += 1; }
    this.i = end;
    let text;
    if (literal) text = raw.join('\n');
    else {
      // Folding: a break between two plain lines is a space; each empty line is a newline; the
      // break next to a more-indented line stays.
      text = raw[0] ?? '';
      let prev = raw[0] ?? '';
      let empties = 0;
      for (const l of raw.slice(1)) {
        if (l === '') { text += '\n'; empties += 1; continue; }
        const kept = /^\s/.test(l) || /^\s/.test(prev);
        text += empties ? (kept ? '\n' : '') + l : (kept ? '\n' : ' ') + l;
        prev = l;
        empties = 0;
      }
    }
    if (!raw.length) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return text;
    if (chomp === '+') return `${text}\n${'\n'.repeat(trailing)}`;
    return `${text}\n`;
  }
}

/** Parse one YAML document of the supported subset. */
export function parse(text) {
  return new BlockParser(String(text ?? '')).parseDocument();
}

// ---------------------------------------------------------------- writer

const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`]/;

/** Whether a string can be written plain and read back as the same string. */
export function isPlainSafe(s) {
  if (s === '' || s !== s.trim() || /[\n\r\t\0-\x08\x0b\x0c\x0e-\x1f\x7f﻿]/.test(s)) return false;
  if (INDICATOR_START.test(s) && !/^-[^\s]/.test(s)) return false;
  if (/^-[^\s]/.test(s) && /^-\d|^-\./.test(s)) return false;
  if (/: |:$| #|^#/.test(s)) return false;
  if (resolvePlain(s) !== s) return false;
  if (/^\d{4}-\d\d-\d\d/.test(s)) return false;
  return true;
}

function quote(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}"`;
}

function scalar(v, { flow = false } = {}) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '.nan';
    if (v === Infinity) return '.inf';
    if (v === -Infinity) return '-.inf';
    return String(v);
  }
  if (v instanceof Date) return quote(v.toISOString());
  const s = String(v);
  if (flow) return isPlainSafe(s) && !/[,[\]{}]/.test(s) ? s : quote(s);
  return isPlainSafe(s) ? s : quote(s);
}

function flowOf(v) {
  if (Array.isArray(v)) return `[${v.map(flowOf).join(', ')}]`;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return `{${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${scalar(k, { flow: true })}: ${flowOf(x)}`).join(', ')}}`;
  }
  return scalar(v, { flow: true });
}

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

function literalBlock(s, pad) {
  const chomp = s.endsWith('\n') ? (s.endsWith('\n\n') ? '+' : '') : '-';
  const body = (chomp === '' ? s.slice(0, -1) : chomp === '+' ? s.replace(/\n+$/, (m) => m.slice(1)) : s).split('\n');
  const keep = /^ /.test(s) ? '2' : '';
  return `|${keep}${chomp}\n${body.map((l) => (l ? pad + l : '')).join('\n')}`;
}

function block(v, depth) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return v.map((item) => {
      if (isMap(item) && Object.keys(item).length) {
        const inner = block(item, depth + 1);
        return `${pad}- ${inner.slice(pad.length + 2)}`;
      }
      if (Array.isArray(item) && item.length) return `${pad}-\n${block(item, depth + 1)}`;
      return `${pad}- ${valueText(item, depth + 1)}`;
    }).join('\n');
  }
  if (isMap(v)) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return entries.map(([k, x]) => {
      const key = scalar(k);
      if (isMap(x) && Object.keys(x).length) return `${pad}${key}:\n${block(x, depth + 1)}`;
      if (Array.isArray(x) && x.length) return `${pad}${key}:\n${block(x, depth + 1)}`;
      return `${pad}${key}: ${valueText(x, depth + 1)}`;
    }).join('\n');
  }
  return pad + valueText(v, depth);
}

function valueText(v, depth) {
  if (Array.isArray(v)) return v.length ? flowOf(v) : '[]';
  if (isMap(v)) return Object.keys(v).length ? flowOf(v) : '{}';
  if (typeof v === 'string' && v.includes('\n')) return literalBlock(v, '  '.repeat(depth));
  return scalar(v);
}

/** Write a value as YAML: block style, or flow style with { flow: true }. No trailing newline. */
export function stringify(value, { flow = false } = {}) {
  if (flow) return flowOf(value);
  if (isMap(value) || Array.isArray(value)) return block(value, 0);
  return valueText(value, 0);
}
