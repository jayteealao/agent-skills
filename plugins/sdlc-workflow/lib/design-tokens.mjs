// The token model of the design surface: DESIGN.md token tables in, typed tokens out.
//
// A token table is a markdown table whose header starts with `Role`. The columns after it are an
// optional `Token` (an alias name), an optional `Kind`, one or more value columns, and an optional
// description column (`Used for`, `Use`, `Notes`, `Purpose`, `Description`). One value column is
// `Value`. Several value columns name themes: `| Role | Light | Dark | Used for |`, or with the
// colour scheme in brackets, `| Role | Moss (dark) | Paper (light) |`. The first value column is the
// default theme. An empty cell of another theme takes the default value.
//
// Each token has a kind. A `Kind` cell names it; otherwise the role prefix does (`space-`, `size-`,
// `radius-`, `font-`, `text-`, `shadow-`, `duration-` ...), and otherwise the section does
// (`## Colors`, `## Typography`, `## Layout`, `## Shapes`, `## Elevation`, `## Motion`, numbered or
// not, with synonyms). A value that is no value of its kind, such as a sentence of prose, is
// refused and reported, never written to the sheet.
//
// The module is pure: lib/design-surface.mjs reads DESIGN.md and writes the files.

export const TOKENS_SCHEMA = 'sdlc/design-tokens/v1';
export const TOKEN_KINDS = Object.freeze(['color', 'font', 'type', 'weight', 'leading', 'space', 'size', 'radius', 'shadow', 'motion', 'layer']);
/** The kinds that every surface needs before a screen is drawn. */
export const REQUIRED_KINDS = Object.freeze(['color', 'font', 'type', 'space', 'size', 'radius']);
/** The kinds whose values are lengths. */
export const LENGTH_KINDS = Object.freeze(['type', 'space', 'size', 'radius']);
export const GENERATED_MARK = 'wf.mjs design tokens writes this file';

const SECTION_KIND = [
  [/^(?:colou?rs?|palette)$/, 'color'],
  [/^(?:typography|type|fonts?|text)$/, 'type'],
  [/^(?:layout|spac(?:e|ing)|siz(?:es|ing)|dimensions?|grid)$/, 'space'],
  [/^(?:elevation|depth|shadows?)$/, 'shadow'],
  [/^(?:shapes?|radi(?:i|us|uses)|corners?)$/, 'radius'],
  [/^(?:motion|animations?|transitions?)$/, 'motion'],
  [/^(?:tokens?|design-tokens?)$/, 'any'],
];
const DESC_COL = /^(?:used for|use|usage|notes?|purpose|description|meaning)$/i;

/** The kind of a `## ` section heading, or null. `## 4. Spacing & Layout` reads as space. */
export function sectionKind(heading) {
  const words = String(heading).replace(/^#+\s*/, '').replace(/^[\d.]+\s*/, '').toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  for (const w of [words.join('-'), ...words]) for (const [re, kind] of SECTION_KIND) if (re.test(w)) return kind;
  return null;
}

/** The kind of a token from its role (or custom property) name, or null when the name does not say. */
export function kindOfName(name) {
  const n = String(name).replace(/^--/, '').toLowerCase();
  if (/^(?:space|spacing|gap|inset|pad|padding|margin|gutter)(?:-|$)/.test(n)) return 'space';
  if (/^(?:radius|radii|rounded|corner|corners|round)(?:-|$)/.test(n)) return 'radius';
  if (/^(?:size|sizes|sizing|width|height|w|h|icon|control|target|avatar|row|header|sidebar|rail|tab|toolbar|bar|dot|max|min)(?:-|$)/.test(n)) return 'size';
  if (/^(?:font|family|face)(?:-|$)/.test(n)) return 'font';
  if (/^(?:text|type|fs|font-size)(?:-(?:xs|sm|md|lg|xl|\d*xl|base|body|caption|label|title|headline|display|\d+)|$)/.test(n)) return 'type';
  if (/^(?:weight|fw)(?:-|$)/.test(n)) return 'weight';
  if (/^(?:leading|line|lh)(?:-|$)/.test(n)) return 'leading';
  if (/^(?:shadow|elevation)(?:-|$)/.test(n)) return 'shadow';
  if (/^(?:duration|ease|easing|motion|delay)(?:-|$)/.test(n)) return 'motion';
  if (/^(?:z|layer)(?:-|$)/.test(n)) return 'layer';
  return null;
}

/** The kind of a row: its Kind cell, else its role name, else its section; a Layout section holds sizes besides the space steps. */
function rowKind(cell, role, section) {
  const k = String(cell ?? '').trim().toLowerCase();
  if (TOKEN_KINDS.includes(k)) return k;
  // Under the colours, `text` and `border` are colours, whatever the name reads like elsewhere.
  if (section === 'color') return 'color';
  const byName = kindOfName(role);
  if (byName) return byName;
  if (section === 'space') return 'size';
  if (section === 'type') return 'type';
  if (section === 'any') return null;
  return section;
}

const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)$/i;
const NAMED = /^(?:transparent|currentcolor|black|white|red|green|blue|gray|grey|orange|yellow|purple|pink|teal|cyan|magenta|navy|maroon|olive|silver|lime|aqua|fuchsia|[a-z]+)$/i;
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|dp|sp|pt|%|vw|vh|ch|ex|svh|dvh|lvh)?$/i;
const FN = /^(?:calc|clamp|min|max)\(.*\)$/i;
const isVar = (v) => /^var\(\s*--[a-z0-9-]+\s*(?:,[^)]*)?\)$/i.test(v);

/** Why a value is no value of its kind, or null when it is one. */
export function valueProblem(kind, value) {
  const v = String(value ?? '').trim().replace(/^`|`$/g, '');
  if (!v) return 'no value';
  if (isVar(v)) return null;
  switch (kind) {
    case 'color':
      // A word list or a sentence is prose: "white at 30%", "Primary actions, focused borders".
      if (/^#[0-9a-f]{3,8}$/i.test(v) || COLOR_FN.test(v)) return null;
      if (NAMED.test(v) && v.length <= 20) return null;
      return 'not a colour (hex, rgb(), hsl(), oklch() or a colour name)';
    case 'type': case 'space': case 'size': case 'radius':
      if (LENGTH.test(v) || FN.test(v) || v === '0') return null;
      // A type token may hold a size with its line height: `14px/20px`.
      if (kind === 'type' && /^[\d.]+[a-z%]*\s*\/\s*[\d.]+[a-z%]*$/i.test(v)) return null;
      return 'not a length (for example 8px, 0.5rem or 16dp)';
    case 'weight':
      return /^(?:[1-9]00|normal|bold|lighter|bolder)$/i.test(v) ? null : 'not a font weight (100 to 900)';
    case 'leading':
      return /^(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%)?$/i.test(v) || v === 'normal' ? null : 'not a line height';
    case 'font':
      // A family list: names, quoted names and commas. A sentence has spaces between lower-case words and no comma or quote.
      return /["',]/.test(v) || /^[A-Za-z][\w-]*$/.test(v) || /^[A-Z][\w ]+$/.test(v) ? null : 'not a font family list';
    case 'shadow':
      return v === 'none' || /\d(?:px|rem|em)?\s/.test(`${v} `) ? null : 'not a shadow (for example 0 1px 2px rgb(0 0 0 / 0.2))';
    case 'motion':
      return /^\d+\.?\d*m?s$/i.test(v) || /^(?:cubic-bezier|steps|linear)\(/i.test(v) || /^(?:ease|ease-in|ease-out|ease-in-out|linear)$/i.test(v) ? null : 'not a duration or an easing';
    case 'layer':
      return /^-?\d+$/.test(v) ? null : 'not a whole number';
    default:
      return null;
  }
}

/** The CSS of a value: dp and sp are pixels on the web. */
export function cssValue(value) {
  return String(value).trim().replace(/^`|`$/g, '').replace(/(\d)(?:dp|sp)\b/gi, '$1px');
}

/** A theme column header: `Dark`, `Moss (dark)`, `Value`. */
function themeOf(header) {
  const m = /^\s*([^()]+?)\s*(?:\((light|dark)\))?\s*$/i.exec(header);
  const name = (m?.[1] ?? header).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const scheme = m?.[2]?.toLowerCase() ?? (name === 'dark' || name === 'light' ? name : null);
  return { name, scheme };
}

/**
 * Read the token tables of DESIGN.md. Returns the rows `[{ role, token, kind, value, values, usedFor }]`
 * with array properties: `themes` ([{ name, scheme }], the default first), `skipped` (Role cells
 * with several names), `problems` ([{ role, kind, value, problem }]) and `ignored` (headings of
 * Role tables that hold no value column).
 */
export function parseTokenTables(text) {
  const out = [];
  const skipped = [];
  const problems = [];
  const ignored = [];
  const themes = [];
  let section = null;
  let heading = '';
  let cols = null;
  const lines = String(text ?? '').split(/\r?\n/);
  const cellsOf = (l) => (/^\s*\|/.test(l) ? l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()) : null);
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^##\s/.test(l)) { section = sectionKind(l); heading = l.replace(/^#+\s*/, '').trim(); cols = null; continue; }
    const cells = cellsOf(l);
    if (!cells) { cols = null; continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const next = cellsOf(lines[i + 1] ?? '');
    const isHeader = next && next.every((c) => /^:?-+:?$/.test(c));
    if (isHeader) {
      cols = null;
      if (!/^(?:role|name|token)$/i.test(cells[0])) continue;
      if (!section && !/token/i.test(heading)) continue;
      const map = { token: -1, kind: -1, desc: -1, values: [] };
      cells.slice(1).forEach((c, n) => {
        const at = n + 1;
        if (/^token$/i.test(c)) map.token = at;
        else if (/^kind$/i.test(c)) map.kind = at;
        else if (DESC_COL.test(c)) { if (map.desc < 0) map.desc = at; }
        else if (map.desc < 0 && c) map.values.push({ at, header: c });
      });
      if (!map.values.length) { ignored.push(heading); continue; }
      const named = map.values.map((v) => (/^value$/i.test(v.header) ? null : themeOf(v.header)));
      if (named.length > 1 && !named[0]) {
        // `| Value | Dark |`: the default theme is the other scheme.
        const other = named.slice(1).find(Boolean);
        named[0] = { name: other?.scheme === 'dark' ? 'light' : other?.scheme === 'light' ? 'dark' : 'default', scheme: other?.scheme === 'dark' ? 'light' : other?.scheme === 'light' ? 'dark' : null };
      }
      map.themes = named.map((t) => t ?? { name: 'default', scheme: null });
      for (const t of map.themes) if (!themes.some((x) => x.name === t.name)) themes.push(t);
      cols = map;
      continue;
    }
    if (!cols || !section && !/token/i.test(heading)) continue;
    const role = cells[0];
    const values = Object.fromEntries(cols.values.map((v, n) => [cols.themes[n].name, (cells[v.at] ?? '').replace(/^`|`$/g, '').trim()]).filter(([, v]) => v));
    const first = cols.themes[0].name;
    const value = values[first] ?? Object.values(values)[0] ?? '';
    if (!role || !value) continue;
    if (!/^[a-z][a-z0-9-]*$/i.test(role.replace(/^`?--|`$/g, ''))) { skipped.push(role); continue; }
    const name = role.replace(/^`?--|`$/g, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const kind = rowKind(cols.kind >= 0 ? cells[cols.kind] : null, name, section) ?? 'other';
    const bad = Object.entries(values).map(([t, v]) => ({ t, v, p: valueProblem(kind, v) })).find((x) => x.p);
    if (bad) { problems.push({ role: name, kind, value: bad.v, theme: bad.t, problem: bad.p }); continue; }
    const token = cols.token >= 0 && /^`?--[a-z0-9-]+`?$/i.test(cells[cols.token] ?? '') ? cells[cols.token].replace(/`/g, '') : null;
    const existing = out.findIndex((r) => r.role === name);
    const row = { role: name, token, kind, value, values, usedFor: cols.desc >= 0 ? cells[cols.desc] || null : null };
    if (existing >= 0) {
      // A second row wins for the themes it names; a theme that only the first row names keeps its value.
      problems.push({ role: name, kind, value, theme: null, problem: `a second row for ${name}: the later row wins for the themes it names` });
      out[existing] = { ...row, values: { ...out[existing].values, ...row.values } };
    } else out.push(row);
  }
  // A table with one `Value` column gives the default theme. When other tables name the themes,
  // that default is the first named theme, never a theme of its own.
  const named = themes.filter((t) => t.name !== 'default');
  if (named.length && named.length < themes.length) {
    const first = named[0].name;
    themes.splice(0, themes.length, ...named);
    for (const r of out) {
      if (!('default' in r.values)) continue;
      const { default: v, ...rest } = r.values;
      r.values = { [first]: v, ...rest };
    }
  }
  for (const [k, v] of Object.entries({ themes, skipped, problems, ignored })) Object.defineProperty(out, k, { value: v });
  return out;
}

const decl = (r, value) => `  --${r.role}: ${cssValue(value)};`;

/** The token sheet: the default theme on `:root` and on its own `[data-theme]`, each other theme on its `[data-theme]`, and the system scheme. */
export function tokensCss(rows) {
  const themes = rows.themes?.length ? rows.themes : [{ name: 'default', scheme: null }];
  const def = themes[0];
  const aliases = rows.flatMap((r) => (r.token && r.token !== `--${r.role}` ? [`  ${r.token}: var(--${r.role});`] : []));
  const head = `/* From the token tables of DESIGN.md. ${GENERATED_MARK}; do not edit it. */`;
  const rootSel = def.name === 'default' ? ':root' : `:root, [data-theme="${def.name}"]`;
  const blocks = [`${rootSel} {\n${[...rows.map((r) => decl(r, r.value)), ...aliases].join('\n')}\n}`];
  const lines = (t) => rows.filter((r) => r.values?.[t.name] && r.values[t.name] !== r.value).map((r) => decl(r, r.values[t.name]));
  for (const t of themes.slice(1)) {
    const body = lines(t);
    if (!body.length) continue;
    // A theme restates every value that differs; the rest come from :root.
    blocks.push(`[data-theme="${t.name}"] {\n${body.join('\n')}\n}`);
    if (t.scheme && t.scheme !== def.scheme) blocks.push(`@media (prefers-color-scheme: ${t.scheme}) {\n  :root:not([data-theme]) {\n${body.map((x) => `  ${x}`).join('\n')}\n  }\n}`);
  }
  return `${head}\n${blocks.join('\n')}\n`;
}

/** The roles of the space scale, smallest first. */
function spaceScale(rows) {
  const px = (v) => { const m = /^(-?[\d.]+)(px|rem|em|dp|sp)?$/i.exec(cssValue(v)); return m ? Number(m[1]) * (/r?em/i.test(m[2] ?? '') ? 16 : 1) : Number.NaN; };
  return rows.filter((r) => r.kind === 'space').map((r) => ({ role: r.role, px: px(r.value) })).sort((a, b) => (Number.isNaN(a.px) || Number.isNaN(b.px) ? 0 : a.px - b.px));
}

/**
 * The layout primitives, from the space scale: stack, row, cluster, grid, split, fill, scroll,
 * center, push and layer. `data-gap` and `data-pad` take the name of a space step without its
 * `space-` prefix. A screen arranges its parts with these, so its own style only places.
 */
export function layoutCss(rows) {
  const scale = spaceScale(rows);
  const mid = scale[Math.min(1, scale.length - 1)]?.role;
  const gap = mid ? `var(--${mid})` : '0';
  const step = (r) => r.role.replace(/^(?:space|gap)-/, '');
  const lines = [
    `/* The layout primitives of the surface, from the space tokens of DESIGN.md. ${GENERATED_MARK}; do not edit it. */`,
    `.l-stack { display: flex; flex-direction: column; gap: ${gap}; min-width: 0; }`,
    `.l-row { display: flex; flex-direction: row; align-items: center; gap: ${gap}; min-width: 0; }`,
    `.l-cluster { display: flex; flex-wrap: wrap; align-items: center; gap: ${gap}; min-width: 0; }`,
    `.l-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--l-min, 16rem), 100%), 1fr)); gap: ${gap}; }`,
    `.l-split { display: flex; gap: ${gap}; min-width: 0; min-height: 0; }`,
    '.l-split > * { min-width: 0; }',
    '.l-fill { flex: 1 1 0; min-width: 0; min-height: 0; }',
    '.l-scroll { overflow: auto; min-height: 0; overscroll-behavior: contain; }',
    '.l-center { display: grid; place-items: center; }',
    '.l-push { margin-inline-start: auto; }',
    '.l-layer { position: relative; }',
    '.l-layer > .l-over { position: absolute; inset: 0; }',
    '.l-start { align-items: flex-start; } .l-end { align-items: flex-end; } .l-between { justify-content: space-between; }',
    '[data-gap="0"] { gap: 0; } [data-pad="0"] { padding: 0; }',
    ...scale.map((r) => `[data-gap="${step(r)}"] { gap: var(--${r.role}); } [data-pad="${step(r)}"] { padding: var(--${r.role}); }`),
  ];
  return `${lines.join('\n')}\n`;
}

/** The machine-readable model: tokens.json. */
export function tokensJson(rows, source) {
  const themes = rows.themes?.length ? rows.themes : [{ name: 'default', scheme: null }];
  return {
    schema: TOKENS_SCHEMA, source: source ?? null,
    themes, default: themes[0].name,
    tokens: rows.map((r) => ({ name: `--${r.role}`, role: r.role, kind: r.kind, value: cssValue(r.value), values: Object.fromEntries(Object.entries(r.values ?? {}).map(([t, v]) => [t, cssValue(v)])), usedFor: r.usedFor ?? null, alias: r.token ?? null })),
  };
}

/** The model from a token sheet alone, for a surface that has no tokens.json yet. */
export function modelFromCss(css) {
  const seen = new Map();
  for (const m of String(css ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) if (!seen.has(m[1])) seen.set(m[1], m[2].trim());
  const tokens = [...seen].map(([name, value]) => {
    const kind = kindOfName(name) ?? (valueProblem('color', value) ? (LENGTH.test(value) ? 'size' : 'other') : 'color');
    return { name, role: name.slice(2), kind, value, values: { default: value }, usedFor: null, alias: null };
  });
  return { schema: TOKENS_SCHEMA, source: null, themes: [{ name: 'default', scheme: null }], default: 'default', tokens, legacy: true };
}

/** The kinds of REQUIRED_KINDS that a model lacks. */
export function missingKinds(model) {
  const have = new Set((model?.tokens ?? []).map((t) => t.kind));
  return REQUIRED_KINDS.filter((k) => !have.has(k));
}

/* ───────────────────────── the platform token files ───────────────────────── */

/** The token file of the product code that `## Overview` names (`Token file: <path>`), or null. */
export function platformFileOf(text) {
  const m = /Token file:\s*`?([^\s`,;]+\.(?:kt|swift|ts|js|mjs|css))`?/i.exec(String(text ?? ''));
  return m ? m[1].replace(/\\/g, '/') : null;
}

const camel = (s) => String(s).replace(/[-_]+([a-z0-9])/gi, (_, c) => c.toUpperCase()).replace(/^(\d)/, '_$1');
const pascalCase = (s) => camel(s).replace(/^[a-z]/, (c) => c.toUpperCase());

/** `#rrggbb[aa]`, `#rgb`, `rgb()` or `rgba()` as 0xAARRGGBB, or null. */
export function argbHex(value) {
  const v = String(value).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return `0x${(h.slice(6, 8) + h.slice(0, 6)).toUpperCase()}`;
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    const two = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `0x${(two(a * 255) + two(+m[1]) + two(+m[2]) + two(+m[3])).toUpperCase()}`;
  }
  return null;
}
const num = (v) => { const m = /^(-?[\d.]+)(px|dp|sp|rem|em)?$/i.exec(cssValue(v)); return m ? Number(m[1]) * (/r?em/i.test(m[2] ?? '') ? 16 : 1) : null; };
const ms = (v) => { const m = /^([\d.]+)(m?s)$/i.exec(String(v)); return m ? Math.round(Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1)) : null; };

/** The token file of the product code, for its language. Returns the text, or null for a language the generator does not write. */
export function platformTokens(model, file) {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  const head = `Generated from the token tables of DESIGN.md. ${GENERATED_MARK}; do not edit it.`;
  const byKind = (k) => model.tokens.filter((t) => t.kind === k);
  const themes = model.themes;
  if (ext === 'css') return `/* ${head} */\n`;
  if (ext === 'kt') {
    const pkg = /\/(?:java|kotlin)\/(.+)\/[^/]+\.kt$/.exec(`/${file}`)?.[1]?.replace(/\//g, '.') ?? null;
    const colorObj = (t) => {
      const lines = byKind('color').map((x) => { const a = argbHex(x.values[t.name] ?? x.value); return a ? `        val ${camel(x.role)} = Color(${a})` : `        // ${x.role}: ${x.values[t.name] ?? x.value} has no ARGB form`; });
      return `    object ${pascalCase(t.name === 'default' ? 'colors' : `colors-${t.name}`)} {\n${lines.join('\n')}\n    }`;
    };
    const dims = (k, unit) => byKind(k).map((x) => { const n = num(x.value); return n == null ? `        // ${x.role}: ${x.value}` : `        val ${camel(x.role)} = ${n}${unit}`; });
    const group = (name, lines) => (lines.length ? `    object ${name} {\n${lines.join('\n')}\n    }` : null);
    return [`// ${head}`, ...(pkg ? [`package ${pkg}`, ''] : []),
      'import androidx.compose.ui.graphics.Color', 'import androidx.compose.ui.unit.dp', 'import androidx.compose.ui.unit.sp', '',
      'object DesignTokens {',
      [...themes.map(colorObj),
        group('Space', dims('space', '.dp')), group('Size', dims('size', '.dp')), group('Radius', dims('radius', '.dp')), group('Type', dims('type', '.sp')),
        group('Motion', byKind('motion').map((x) => (ms(x.value) == null ? `        // ${x.role}: ${x.value}` : `        const val ${camel(x.role)} = ${ms(x.value)}`))),
        group('Fonts', byKind('font').map((x) => `        const val ${camel(x.role)} = ${JSON.stringify(x.value)}`)),
      ].filter(Boolean).join('\n'),
      '}', ''].join('\n');
  }
  if (ext === 'swift') {
    const colorEnum = (t) => `    enum ${pascalCase(t.name === 'default' ? 'colors' : `colors-${t.name}`)} {\n${byKind('color').map((x) => { const a = argbHex(x.values[t.name] ?? x.value); if (!a) return `        // ${x.role}: ${x.value}`; const n = parseInt(a.slice(2), 16); const c = (s) => ((n >>> s) & 255) / 255; return `        static let ${camel(x.role)} = Color(.sRGB, red: ${c(16).toFixed(3)}, green: ${c(8).toFixed(3)}, blue: ${c(0).toFixed(3)}, opacity: ${c(24).toFixed(3)})`; }).join('\n')}\n    }`;
    const dims = (name, k) => { const l = byKind(k).map((x) => { const n = num(x.value); return n == null ? `        // ${x.role}: ${x.value}` : `        static let ${camel(x.role)}: CGFloat = ${n}`; }); return l.length ? `    enum ${name} {\n${l.join('\n')}\n    }` : null; };
    return [`// ${head}`, 'import SwiftUI', '', 'enum DesignTokens {', [...themes.map(colorEnum), dims('Space', 'space'), dims('Size', 'size'), dims('Radius', 'radius'), dims('TypeSize', 'type')].filter(Boolean).join('\n'), '}', ''].join('\n');
  }
  if (['ts', 'js', 'mjs'].includes(ext)) {
    const group = (k) => Object.fromEntries(byKind(k).map((x) => [camel(x.role), x.value]));
    const colors = Object.fromEntries(themes.map((t) => [t.name, Object.fromEntries(byKind('color').map((x) => [camel(x.role), x.values[t.name] ?? x.value]))]));
    const obj = { themes: themes.map((t) => t.name), colors, font: group('font'), type: group('type'), space: group('space'), size: group('size'), radius: group('radius'), shadow: group('shadow'), motion: group('motion'), vars: Object.fromEntries(model.tokens.map((x) => [camel(x.role), `var(${x.name})`])) };
    return `// ${head}\nexport const tokens = ${JSON.stringify(obj, null, 2)}${ext === 'ts' ? ' as const' : ''};\nexport default tokens;\n`;
  }
  return null;
}
