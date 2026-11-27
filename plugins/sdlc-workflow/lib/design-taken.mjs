// The sheets of the design system that the code last took up. A change to the token sheet or the
// component sheet after a design was approved does not undo the approval: the next packet that
// starts takes the change up, and builds it. The records keep a copy of the two sheets as that
// packet took them, so the packet after it is told only what changed since.
//
//   <records>/_design/taken/tokens.css, components.css, taken.json { at, workflow }
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic-write.mjs';
import { commitDesignRecords, designRecordsDir } from './design-records.mjs';
import { COMPONENTS_FILE, TOKENS_FILE, surfaceDir } from './design-surface.mjs';

const SHEETS = [TOKENS_FILE, COMPONENTS_FILE];
const CAP = 30;
const takenDir = (root) => join(designRecordsDir(root), 'taken');
const read = (file) => { try { return readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The innermost rules of a style sheet: selector -> body, comments and spacing left out. */
export function rulesOf(css) {
  const out = new Map();
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { stack.push({ head: text.slice(start, i), at: i + 1, inner: false }); start = i + 1; }
    else if (text[i] === '}') {
      const open = stack.pop();
      if (!open) { start = i + 1; continue; }
      if (!open.inner) {
        const head = [...stack.map((s) => squash(s.head)), squash(open.head)].filter(Boolean).join(' / ');
        out.set(head, (out.has(head) ? `${out.get(head)} ` : '') + squash(text.slice(open.at, i)));
      }
      if (stack.length) stack.at(-1).inner = true;
      start = i + 1;
    } else if (text[i] === ';' && !stack.length) start = i + 1;
  }
  return out;
}

/** The custom properties of a token sheet: the name, with its selector when that is a theme of its own. */
function tokensOf(css) {
  const out = new Map();
  for (const [head, body] of rulesOf(css)) {
    const where = head.includes(',') || head === ':root' ? '' : ` (${head})`;
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) out.set(`${m[1]}${where}`, m[2].trim());
  }
  return out;
}

const diffKeys = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));

/**
 * The classes of each component of the surface: the key itself, and the classes on the elements
 * of its page that carry `data-component="<key>"`.
 */
function componentClasses(root) {
  const out = new Map();
  const dir = join(surfaceDir(root), 'components');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.html')); } catch { return out; }
  for (const f of files) {
    const key = f.slice(0, -5);
    const classes = new Set([key]);
    for (const m of (read(join(dir, f)) ?? '').matchAll(/<[^>]*\bdata-component=["']([^"']+)["'][^>]*>/g)) {
      if (m[1] !== key) continue;
      for (const c of (/\bclass=["']([^"']*)["']/.exec(m[0])?.[1] ?? '').split(/\s+/).filter(Boolean)) classes.add(c);
    }
    out.set(key, [...classes].map((c) => new RegExp(`\\.${esc(c)}(?![\\w-])`)));
  }
  return out;
}

/**
 * What changed in the sheets of the surface since the code last took them up: `{ tokens,
 * components, other }`, or `{ first: true }` when nothing was taken yet, or null when the surface
 * has no sheets. `components` names the components whose rules changed; `other` counts the
 * changed rules that name no component.
 */
export function sheetChanges(root) {
  const now = Object.fromEntries(SHEETS.map((f) => [f, read(join(surfaceDir(root), f))]));
  if (SHEETS.every((f) => now[f] == null)) return null;
  if (!existsSync(join(takenDir(root), 'taken.json'))) return { first: true };
  const was = Object.fromEntries(SHEETS.map((f) => [f, read(join(takenDir(root), f))]));
  const tokens = diffKeys(tokensOf(was[TOKENS_FILE]), tokensOf(now[TOKENS_FILE]));
  const rules = diffKeys(rulesOf(was[COMPONENTS_FILE]), rulesOf(now[COMPONENTS_FILE]));
  const classes = [...componentClasses(root)];
  const named = new Set();
  let other = 0;
  for (const sel of rules) {
    const hit = classes.filter(([, res]) => res.some((re) => re.test(sel))).map(([k]) => k);
    if (hit.length) hit.forEach((k) => named.add(k)); else other++;
  }
  return { tokens, components: [...named].sort(), other };
}

/** Keep the sheets of the surface as the workflow `slug` took them up. */
export function takeSheets(root, slug, { now = new Date() } = {}) {
  const dir = takenDir(root);
  mkdirSync(dir, { recursive: true });
  for (const f of SHEETS) if (existsSync(join(surfaceDir(root), f))) copyFileSync(join(surfaceDir(root), f), join(dir, f));
  writeFileAtomic(join(dir, 'taken.json'), `${JSON.stringify({ at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), workflow: slug }, null, 2)}\n`);
  commitDesignRecords(root, `design: ${slug} takes up the sheets of the design system`);
}

const list = (xs) => (xs.length > CAP ? `${xs.slice(0, CAP).join(', ')} and ${xs.length - CAP} more` : xs.join(', '));

/** The steer that tells a packet what to take up, or null when nothing changed. */
export function takeUpText(changes) {
  if (!changes || changes.first) return null;
  const parts = [];
  if (changes.tokens.length) parts.push(`tokens: ${list(changes.tokens)}`);
  if (changes.components.length) parts.push(`components: ${list(changes.components)}`);
  if (changes.other) parts.push(`${changes.other} other rule(s) of ${COMPONENTS_FILE}`);
  if (!parts.length) return null;
  return `The sheets of the design system changed since the last packet took them up (${parts.join('; ')}). This packet brings the code to them: the slice stage plans the change into a slice, and the build uses the changed tokens and components as the sheets now hold them.`;
}
