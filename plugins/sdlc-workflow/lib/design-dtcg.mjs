// The tokens in the format of the W3C Design Tokens Community Group (DTCG), so they travel to and
// from Figma variables, Penpot and Tokens Studio.
//
// Export: one `<theme>.tokens.json` file for each theme, each holding every token in that theme,
// grouped by kind. A tool that imports variables takes one file for each mode. An alias
// (`var(--accent)`) becomes a reference (`{color.accent}`).
//
// Import: one or more DTCG files, each a theme (its name from the file name, `dark.tokens.json`
// → dark), read back as the token tables of DESIGN.md. DESIGN.md stays the source: the import
// prints the tables, and the design agent puts them into DESIGN.md and runs `design tokens`.
//
// Pure: no file is read or written here.

import { argbHex, cssValue, kindOfName } from './design-tokens.mjs';

const TYPE_OF = { color: 'color', font: 'fontFamily', type: 'dimension', space: 'dimension', size: 'dimension', radius: 'dimension', weight: 'fontWeight', leading: 'number', layer: 'number', shadow: 'shadow' };
const GROUP_ORDER = ['color', 'font', 'type', 'weight', 'leading', 'space', 'size', 'radius', 'shadow', 'motion', 'layer', 'other'];

/** `8px` → `{ value: 8, unit: 'px' }`; rem and em keep their unit; anything else stays a string. */
function dimension(v) {
  const m = /^(-?[\d.]+)(px|rem|em)?$/i.exec(cssValue(v));
  return m ? { value: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() } : String(v);
}
/** A colour as the DTCG colour object, with its hex; a colour with no sRGB form stays a string. */
function color(v) {
  const a = argbHex(v);
  if (!a) return String(v);
  const n = a.slice(2);
  const [al, r, g, b] = [0, 2, 4, 6].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  return { colorSpace: 'srgb', components: [r, g, b].map((x) => Math.round(x * 1000) / 1000), alpha: Math.round(al * 1000) / 1000, hex: `#${n.slice(2).toLowerCase()}` };
}
/** `0 8px 24px rgba(0,0,0,0.35)` → the DTCG shadow object, or null. */
function shadow(v) {
  const s = String(v).trim();
  const col = /(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/i.exec(s)?.[1] ?? null;
  const rest = s.replace(col ?? '', ' ').trim().split(/\s+/);
  const inset = rest.includes('inset');
  const nums = rest.filter((x) => x !== 'inset').map(dimension);
  if (!col || nums.length < 2 || nums.some((n) => typeof n === 'string')) return null;
  const [offsetX, offsetY, blur = { value: 0, unit: 'px' }, spread = { value: 0, unit: 'px' }] = nums;
  return { color: color(col), offsetX, offsetY, blur, spread, ...(inset ? { inset: true } : {}) };
}
function motion(v) {
  const s = String(v).trim();
  const d = /^([\d.]+)(m?s)$/i.exec(s);
  if (d) return { $type: 'duration', $value: { value: Number(d[1]), unit: d[2].toLowerCase() } };
  const b = /^cubic-bezier\(([^)]+)\)$/i.exec(s);
  if (b) return { $type: 'cubicBezier', $value: b[1].split(',').map(Number) };
  return null;
}

/** One theme of a token model as a DTCG document. */
export function toDtcg(model, theme) {
  const byName = new Map(model.tokens.map((t) => [t.name, t]));
  const ref = (v) => {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(String(v).trim());
    const t = m ? byName.get(m[1]) : null;
    return t ? `{${t.kind}.${t.role}}` : null;
  };
  const doc = {};
  for (const t of model.tokens) {
    const raw = t.values?.[theme] ?? t.value;
    const group = GROUP_ORDER.includes(t.kind) ? t.kind : 'other';
    let token;
    const alias = ref(raw);
    if (alias) token = { $type: TYPE_OF[t.kind] ?? (t.kind === 'motion' ? 'duration' : 'string'), $value: alias };
    else if (t.kind === 'color') token = { $type: 'color', $value: color(raw) };
    else if (['type', 'space', 'size', 'radius'].includes(t.kind)) token = { $type: 'dimension', $value: dimension(raw) };
    else if (t.kind === 'font') token = { $type: 'fontFamily', $value: String(raw).split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean) };
    else if (t.kind === 'weight') token = { $type: 'fontWeight', $value: /^\d+$/.test(raw) ? Number(raw) : String(raw) };
    else if (t.kind === 'leading' || t.kind === 'layer') token = { $type: 'number', $value: Number.isFinite(Number(raw)) ? Number(raw) : String(raw) };
    else if (t.kind === 'shadow') { const s = shadow(raw); token = s ? { $type: 'shadow', $value: s } : { $type: 'string', $value: String(raw) }; }
    else if (t.kind === 'motion') token = motion(raw) ?? { $type: 'string', $value: String(raw) };
    else token = { $type: 'string', $value: String(raw) };
    if (t.usedFor) token.$description = t.usedFor;
    // The raw CSS value too, so a round trip keeps a value that the DTCG form cannot hold.
    token.$extensions = { 'dev.sdlc.css': cssValue(raw) };
    (doc[group] ??= {})[t.role] = token;
  }
  return doc;
}

/** The file of each theme: `{ '<theme>.tokens.json': doc }`. */
export function dtcgFiles(model) {
  const themes = model.themes?.length ? model.themes.map((t) => t.name) : ['default'];
  return Object.fromEntries(themes.map((t) => [`${t}.tokens.json`, toDtcg(model, t)]));
}

/* ───────────────────────── import ───────────────────────── */

const px = (o) => (o && typeof o === 'object' && 'value' in o ? `${o.value}${o.unit ?? 'px'}` : String(o));
/** A DTCG value as a CSS value, or null for a form this reader does not know. */
export function cssOf(type, value) {
  if (typeof value === 'string' && /^\{[^}]+\}$/.test(value)) return value;
  switch (type) {
    case 'color':
      if (typeof value === 'string') return value;
      if (value?.hex) return value.alpha != null && value.alpha < 1 ? `${value.hex}${Math.round(value.alpha * 255).toString(16).padStart(2, '0')}` : value.hex;
      if (Array.isArray(value?.components)) return `rgb(${value.components.map((c) => Math.round(c * 255)).join(' ')} / ${value.alpha ?? 1})`;
      return null;
    case 'dimension': return typeof value === 'number' ? `${value}px` : px(value);
    case 'fontFamily': return Array.isArray(value) ? value.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ') : String(value);
    case 'fontWeight': case 'number': return String(value);
    case 'duration': return px(value).replace(/px$/, 'ms');
    case 'cubicBezier': return Array.isArray(value) ? `cubic-bezier(${value.join(', ')})` : String(value);
    case 'shadow': {
      const one = (s) => `${s.inset ? 'inset ' : ''}${px(s.offsetX)} ${px(s.offsetY)} ${px(s.blur ?? 0)} ${px(s.spread ?? 0)} ${cssOf('color', s.color)}`;
      return Array.isArray(value) ? value.map(one).join(', ') : typeof value === 'object' ? one(value) : String(value);
    }
    default: return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  }
}

const KIND_OF_TYPE = { color: 'color', fontFamily: 'font', fontWeight: 'weight', duration: 'motion', cubicBezier: 'motion', shadow: 'shadow' };
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** The tokens of one DTCG document: `[{ path, role, kind, value, description }]`. A group's `$type` passes to its tokens. */
export function readDtcg(doc) {
  const out = [];
  const walk = (node, path, inherited) => {
    if (!node || typeof node !== 'object') return;
    const type = node.$type ?? inherited;
    if ('$value' in node) {
      const value = cssOf(type, node.$value);
      const role = kebab(path.at(-1));
      const group = kebab(path[0] ?? '');
      const kind = KIND_OF_TYPE[type] ?? (type === 'dimension' ? kindOfName(role) ?? kindOfName(group) ?? 'size' : type === 'number' ? (kindOfName(role) ?? kindOfName(group) ?? 'layer') : kindOfName(group) ?? kindOfName(role) ?? 'other');
      out.push({ path: path.join('.'), role, kind, value, description: node.$description ?? null, css: node.$extensions?.['dev.sdlc.css'] ?? null });
      return;
    }
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, [...path, k], type);
  };
  walk(doc, [], null);
  return out;
}

const SECTION = { color: '## Colors', font: '## Typography', type: '## Typography', weight: '## Typography', leading: '## Typography', space: '## Layout', size: '## Layout', radius: '## Shapes', shadow: '## Elevation & Depth', layer: '## Elevation & Depth', motion: '## Motion', other: '## Tokens' };

/**
 * DTCG files as the token tables of DESIGN.md. `files` is `[{ theme, doc }]`, the default theme
 * first. A reference `{group.name}` becomes `var(--name)`. Returns `{ markdown, tokens, problems }`.
 */
export function dtcgToTables(files) {
  const themes = files.map((f) => f.theme);
  const rows = new Map();
  const problems = [];
  for (const { theme, doc } of files) {
    for (const t of readDtcg(doc)) {
      const value = t.css ?? (t.value && /^\{[^}]+\}$/.test(t.value) ? `var(--${kebab(t.value.slice(1, -1).split('.').at(-1))})` : t.value);
      if (value == null) { problems.push(`${theme}: ${t.path} has a value that this reader does not know`); continue; }
      const row = rows.get(t.role) ?? { role: t.role, kind: t.kind, values: {}, usedFor: t.description };
      if (rows.has(t.role) && row.kind !== t.kind) problems.push(`${t.path}: the role ${t.role} has two kinds (${row.kind}, ${t.kind}); the first stays`);
      row.values[theme] = value;
      rows.set(t.role, row);
    }
  }
  const header = themes.length > 1
    ? `| Role | Kind | ${themes.map((t) => (t === 'dark' || t === 'light' ? `${t[0].toUpperCase()}${t.slice(1)}` : t)).join(' | ')} | Used for |`
    : '| Role | Kind | Value | Used for |';
  const sep = `|${'---|'.repeat(themes.length + 3)}`;
  const bySection = new Map();
  for (const r of rows.values()) {
    const s = SECTION[r.kind] ?? SECTION.other;
    if (!bySection.has(s)) bySection.set(s, []);
    const first = r.values[themes[0]] ?? '';
    const cells = themes.map((t, i) => (i > 0 && r.values[t] === first ? '' : r.values[t] ?? ''));
    bySection.get(s).push(`| ${r.role} | ${r.kind} | ${cells.join(' | ')} | ${r.usedFor ?? ''} |`);
  }
  const markdown = [...bySection].map(([s, lines]) => `${s}\n\n### Token roles\n${header}\n${sep}\n${lines.join('\n')}\n`).join('\n');
  return { markdown, tokens: rows.size, problems };
}
