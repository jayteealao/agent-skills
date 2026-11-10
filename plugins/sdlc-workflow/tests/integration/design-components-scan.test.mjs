// The scan of the product code: the export forms that real component files use, the names that
// are no component, the cap, and a folder with no git.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SCAN, addComponent, componentNames, scanComponents, verifyComponents } from '../../lib/design-components.mjs';
import { runDesign } from '../../lib/design-cli.mjs';
import { addScreen, initSurface, screenFile } from '../../lib/design-surface.mjs';

// The form of a shadcn file: components made with forwardRef and plain functions, a cva value,
// and one export list at the end.
const BUTTON = `import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva("inline-flex", { variants: { size: { sm: "h-8" } } })

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...props }, ref) => (
  <button className={className} ref={ref} {...props} />
))
Button.displayName = "Button"

export { Button, buttonVariants }
`;
const DIALOG = `import * as DialogPrimitive from "@radix-ui/react-dialog"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
function DialogContent({ children }: { children: React.ReactNode }) { return <div>{children}</div> }
const DialogContext = React.createContext(null)
const DIALOG_SIZES = ["sm", "lg"]
class DialogError extends Error {}

export { Dialog, DialogTrigger, DialogContent, DialogContext, DIALOG_SIZES, DialogError }
`;

test('the names of a file: export lists, forwardRef, aliases and default exports; no constant, error or context', () => {
  assert.deepEqual(componentNames('src/components/ui/button.tsx', BUTTON), ['Button']);
  assert.deepEqual(componentNames('src/components/ui/dialog.tsx', DIALOG), ['Dialog', 'DialogTrigger', 'DialogContent']);
  assert.deepEqual(componentNames('src/components/Card.tsx', 'const Root = (p) => <div {...p} />;\nexport { Root as Card };\n'), ['Card']);
  assert.deepEqual(componentNames('src/components/Badge.tsx', 'function Badge() { return null }\nexport default Badge;\n'), ['Badge']);
  assert.deepEqual(componentNames('src/components/Tag.tsx', 'export default function Tag() { return null }\n'), ['Tag']);
  assert.deepEqual(componentNames('src/components/Memo.tsx', 'export const Row = memo(function Row() { return null });\nexport const Lazy = React.lazy(() => import("./x"));\n'), ['Row', 'Lazy']);
  assert.deepEqual(componentNames('src/components/index.tsx', 'export { Button } from "./button";\n'), ['Button'], 'a name that the file passes on');
  assert.deepEqual(componentNames('src/components/consts.tsx', 'export const MAX_ROWS = 20;\nexport const Sizes = { sm: 1 };\nexport const Label = "x";\nexport class ApiError extends Error {}\nexport const ThemeContext = createContext(null);\nexport type CardProps = {};\n'), []);
  assert.deepEqual(componentNames('src/components/Old.tsx', 'export class Old extends React.Component { render() { return null } }\nexport class Helper {}\n'), ['Old']);
  // Compose and SwiftUI: a private part is a detail of its file.
  assert.deepEqual(componentNames('app/Parts.kt', '@Composable\nfun UsageRow() {}\n@Composable\nprivate fun RowDot() {}\n@Composable\ninternal fun Chip() {}\n'), ['UsageRow', 'Chip']);
  assert.deepEqual(componentNames('ios/Badge.swift', 'struct Badge: View { var body: some View { Text("") } }\nprivate struct Dot: View { var body: some View { Text("") } }\npublic struct Pill: Identifiable, View { }\nstruct Model: Codable { }\n'), ['Badge', 'Pill']);
});

function repo({ git = true } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'design-scan-'));
  const root = join(top, 'Shop');
  mkdirSync(root, { recursive: true });
  if (git) execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  const put = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
  return { root, put, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('the scan reads a shadcn folder as it is written, and a file with no export of its own by its name', () => {
  const { root, put, done } = repo();
  try {
    put('components.json', JSON.stringify({ aliases: { ui: '@/components/ui' } }));
    put('src/components/ui/button.tsx', BUTTON);
    put('src/components/ui/dialog.tsx', DIALOG);
    put('src/components/ui/sonner.tsx', 'const Toaster = (props) => <Sonner {...props} />\nexport { Toaster }\n');
    put('src/components/ui/use-toast.tsx', 'export function useToast() { return {} }\n');
    put('src/components/ui/chart.tsx', 'export * from "./chart-impl"\n');
    const r = scanComponents(root);
    assert.deepEqual([r.ok, r.truncated, r.total], [true, false, r.components.length]);
    assert.deepEqual(r.components.map((c) => `${c.key}:${c.source}`), ['button:shadcn', 'chart:shadcn', 'dialog:shadcn', 'dialog-trigger:shadcn', 'dialog-content:shadcn', 'toaster:shadcn']);
    assert.ok(r.components.every((c) => c.inLibrary === false));
  } finally { done(); }
});

test('the scan cuts its list after the sort and says so; a folder with no git is refused with a fix', async () => {
  const { root, put, done } = repo();
  try {
    put('src/components/Many.tsx', Array.from({ length: MAX_SCAN + 7 }, (_, i) => `export function Part${i}() { return null }`).join('\n'));
    const r = scanComponents(root);
    assert.deepEqual([r.components.length, r.total, r.truncated], [MAX_SCAN, MAX_SCAN + 7, true]);
    const lines = [];
    assert.equal(await runDesign(['components', 'scan', root], {}, (v) => lines.push(v)), 0);
    assert.match(lines.join('\n'), new RegExp(`the first ${MAX_SCAN} of ${MAX_SCAN + 7}`));
    const json = [];
    await runDesign(['components', 'scan', root], { json: true }, (v) => json.push(v));
    assert.deepEqual(Object.keys(json[0]).sort(), ['components', 'ok', 'total', 'truncated']);
  } finally { done(); }
  const bare = repo({ git: false });
  try {
    // A folder under the temp folder is in no git repo, unless the temp folder itself is one.
    let inRepo = true;
    try { execFileSync('git', ['-C', bare.root, 'rev-parse', '--git-dir'], { stdio: 'ignore' }); } catch { inRepo = false; }
    if (!inRepo) {
      assert.throws(() => scanComponents(bare.root), (e) => /is not a git repository/.test(e.message) && /design component add --code/.test(e.fix.do));
      const out = [];
      assert.equal(await runDesign(['components', 'scan', bare.root], { json: true }, (v) => out.push(v)), 1);
      assert.deepEqual([out[0].ok, out[0].fix.who], [false, 'agent']);
    }
  } finally { bare.done(); }
});

test('a component names code that holds it, and only product code counts as a use', () => {
  const { root, put, done } = repo();
  try {
    put('src/components/OrderRow.tsx', 'export function OrderRow() { return null }\n');
    assert.throws(() => addComponent(root, 'order-row', { code: 'src/components/OrderRow.tsx', name: 'OrderLine' }), (e) => /does not name OrderLine/.test(e.message) && Boolean(e.fix), 'the file must hold the name');
    addComponent(root, 'order-row', { code: 'src/components/OrderRow.tsx', name: 'OrderRow', workflow: 'w1' });
    addScreen(root, 'basket', { workflow: 'w1' });
    writeFileSync(screenFile(root, 'basket'), '<html><body><section data-state="default"><div data-component="order-row">x</div></section></body></html>');
    // A changelog, a story and a test name the component: none of them uses it in the product.
    put('CHANGELOG.md', 'Added OrderRow.\n');
    put('src/components/OrderRow.stories.tsx', 'import { OrderRow } from "./OrderRow";\n');
    put('src/components/OrderRow.test.tsx', 'import { OrderRow } from "./OrderRow";\n');
    const unused = verifyComponents(root, 'w1');
    assert.equal(unused.ok, false);
    assert.match(unused.problems[0], /no file uses OrderRow/);
    put('src/Basket.tsx', 'import { OrderRow } from "./components/OrderRow";\n');
    assert.deepEqual(verifyComponents(root, 'w1'), { ok: true, screens: ['basket'], used: ['order-row'], problems: [] }, 'a new file that git does not ignore counts');
  } finally { done(); }
});
