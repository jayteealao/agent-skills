// The token model: DESIGN.md token tables in, the token sheet, the model, the layout sheet and the
// token file of the product code out.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATED_MARK, TOKENS_SCHEMA, argbHex, kindOfName, layoutCss, missingKinds, parseTokenTables, platformFileOf, platformTokens, sectionKind, tokensCss, tokensJson, valueProblem,
} from '../../../lib/design-tokens.mjs';
import { readTokenModel, surfaceDir, writeTokens } from '../../../lib/design-surface.mjs';

const MD = `# Design

Token file: \`app/src/main/kotlin/com/shop/ui/DesignTokens.kt\`

## 2. Colours

| Name | Moss (dark) | Paper (light) | Notes |
|---|---|---|---|
| ground | #101510 | #faf9f6 | page |
| accent | #7fbf7f | | links |
| glow | white at 30% | | prose, refused |

## 3. Typography

| Role | Value |
|---|---|
| font-body | Inter, sans-serif |
| text-md | 16px |

## 4. Spacing & Layout

| Role | Value |
|---|---|
| space-sm | 4px |
| space-md | 8px |
| control | 44px |
| tap | big enough |

## Tokens

| Role | Kind | Value |
|---|---|---|
| card-lift | shadow | 0 1px 2px rgb(0 0 0 / 0.2) |
| fast | motion | 150ms |

## Shapes

| Role | Value |
|---|---|
| radius-md | 8px |

## Notes

| Role | Value |
|---|---|
| stray | #000000 |

## Breakpoints

| Breakpoint | Width |
|---|---|
| phone | 375 |
`;

test('a section heading names a kind, numbered or not, and a role prefix names a kind', () => {
  assert.equal(sectionKind('## 4. Spacing & Layout'), 'space');
  assert.equal(sectionKind('## Colours'), 'color');
  assert.equal(sectionKind('## 5 Shapes'), 'radius');
  assert.equal(sectionKind('## Notes'), null);
  assert.deepEqual(['space-2', 'radius-sm', 'size-icon', 'font-body', 'text-lg', 'shadow-1', 'duration-fast', 'z-modal', 'ground'].map(kindOfName),
    ['space', 'radius', 'size', 'font', 'type', 'shadow', 'motion', 'layer', null]);
  assert.equal(valueProblem('color', '#fff'), null);
  assert.match(valueProblem('color', 'Primary actions, focused borders'), /not a colour/);
  assert.equal(valueProblem('space', '16dp'), null);
  assert.equal(valueProblem('type', '14px/20px'), null);
});

test('the tables give typed rows: theme columns, kinds by section, prefix and Kind column, prose refused', () => {
  const rows = parseTokenTables(MD);
  assert.deepEqual(rows.map((r) => [r.role, r.kind]), [
    ['ground', 'color'], ['accent', 'color'], ['font-body', 'font'], ['text-md', 'type'], ['space-sm', 'space'], ['space-md', 'space'],
    ['control', 'size'], ['card-lift', 'shadow'], ['fast', 'motion'], ['radius-md', 'radius'],
  ]);
  assert.deepEqual(rows.themes.slice(0, 2), [{ name: 'moss', scheme: 'dark' }, { name: 'paper', scheme: 'light' }], 'Moss (dark) is the default theme');
  assert.deepEqual(rows[0].values, { moss: '#101510', paper: '#faf9f6' });
  assert.equal(rows[0].usedFor, 'page');
  assert.deepEqual(rows.problems.map((p) => [p.role, p.kind]), [['glow', 'color'], ['tap', 'size']], 'a sentence is no value');
  assert.ok(!rows.some((r) => r.role === 'stray'), 'a table under a heading that names no tokens is not read');
  // The header must start with Role, Name or Token: any other table under Colors is not a token table.
  assert.deepEqual(parseTokenTables('## Colors\n\n| Swatch | Value |\n|---|---|\n| ground | #fff |\n').length, 0);
  assert.deepEqual(parseTokenTables('## Colors\n\n| Token | Value |\n|---|---|\n| ground | #fff |\n').map((r) => r.role), ['ground']);
});

test('the token sheet: the default theme on :root, each other theme on its data-theme, and the system scheme', () => {
  const css = tokensCss(parseTokenTables(MD));
  assert.match(css, /^\/\* From the token tables of DESIGN\.md\. wf\.mjs design tokens writes this file/);
  assert.match(css, /:root, \[data-theme="moss"\] \{\n {2}--ground: #101510;/);
  assert.match(css, /\[data-theme="paper"\] \{\n {2}--ground: #faf9f6;\n\}/);
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\n {2}:root:not\(\[data-theme\]\) \{\n {4}--ground: #faf9f6;/);
  assert.doesNotMatch(css, /\[data-theme="paper"\] \{[^}]*--accent/, 'an empty cell takes the default value');
  const one = tokensCss(parseTokenTables('## Colors\n\n| Role | Token | Value |\n|---|---|---|\n| ground | --color-paper | #fff |\n'));
  assert.match(one, /:root \{\n {2}--ground: #fff;\n {2}--color-paper: var\(--ground\);\n\}/);
});

test('the layout sheet has the primitives and a gap and pad step for each space token', () => {
  const css = layoutCss(parseTokenTables(MD));
  for (const cls of ['l-stack', 'l-row', 'l-cluster', 'l-grid', 'l-split', 'l-fill', 'l-scroll', 'l-center', 'l-push', 'l-layer']) assert.match(css, new RegExp(`\\.${cls}\\b`));
  assert.match(css, /\.l-stack \{[^}]*gap: var\(--space-md\)/);
  assert.match(css, /\[data-gap="sm"\] \{ gap: var\(--space-sm\); \} \[data-pad="sm"\] \{ padding: var\(--space-sm\); \}/);
  assert.match(css, /\[data-gap="md"\]/);
  assert.match(layoutCss(parseTokenTables('')), /\.l-stack \{[^}]*gap: 0;/, 'no space token: no gap');
});

test('the model names each token with its kind and its value in each theme', () => {
  const j = tokensJson(parseTokenTables(MD), 'DESIGN.md');
  assert.equal(j.schema, TOKENS_SCHEMA);
  assert.equal(j.default, 'moss');
  assert.equal(j.source, 'DESIGN.md');
  assert.deepEqual(j.tokens[0], { name: '--ground', role: 'ground', kind: 'color', value: '#101510', values: { moss: '#101510', paper: '#faf9f6' }, usedFor: 'page', alias: null });
  assert.deepEqual(missingKinds(j), []);
  assert.deepEqual(missingKinds({ tokens: [{ kind: 'color' }] }), ['font', 'type', 'space', 'size', 'radius']);
  assert.equal(tokensJson(parseTokenTables('## Layout\n\n| Role | Value |\n|---|---|\n| gap | 6dp |\n')).tokens[0].value, '6px', 'dp is pixels on the web');
});

test('the token file of the code: Kotlin and TypeScript, with colours as ARGB', () => {
  assert.equal(platformFileOf(MD), 'app/src/main/kotlin/com/shop/ui/DesignTokens.kt');
  assert.equal(platformFileOf('# no file'), null);
  const j = tokensJson(parseTokenTables(MD));
  const kt = platformTokens(j, 'app/src/main/kotlin/com/shop/ui/DesignTokens.kt');
  assert.ok(kt.includes(GENERATED_MARK));
  assert.match(kt, /^package com\.shop\.ui$/m);
  assert.match(kt, /object DesignTokens \{/);
  assert.match(kt, /object ColorsMoss \{\n {8}val ground = Color\(0xFF101510\)/);
  assert.match(kt, /object ColorsPaper \{\n {8}val ground = Color\(0xFFFAF9F6\)/);
  assert.match(kt, /val spaceMd = 8\.dp/);
  assert.match(kt, /val textMd = 16\.sp/);
  assert.match(kt, /const val fast = 150/);
  const ts = platformTokens(j, 'src/theme/tokens.ts');
  assert.match(ts, /export const tokens = \{/);
  assert.match(ts, / as const;\nexport default tokens;\n$/);
  const obj = JSON.parse(/export const tokens = (\{[\s\S]*\}) as const;/.exec(ts)[1]);
  assert.equal(obj.colors.paper.ground, '#faf9f6');
  assert.equal(obj.space.spaceSm, '4px');
  assert.equal(obj.vars.radiusMd, 'var(--radius-md)');
  assert.equal(platformTokens(j, 'x.dart'), null);
  assert.deepEqual([argbHex('#abc'), argbHex('#11223344'), argbHex('rgba(255, 0, 0, 0.5)'), argbHex('oklch(1 0 0)')], ['0xFFAABBCC', '0x44112233', '0x80FF0000', null]);
});

test('design tokens writes the sheet, the model and the layout sheet, and the code token file only when missing or generated', () => {
  const top = mkdtempSync(join(tmpdir(), 'design-tokens-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  try {
    writeFileSync(join(root, 'DESIGN.md'), MD);
    const rows = writeTokens(root);
    const dir = surfaceDir(root);
    for (const f of ['tokens.css', 'tokens.json', 'layout.css']) assert.ok(existsSync(join(dir, f)), f);
    const model = readTokenModel(root);
    assert.equal(model.legacy, undefined);
    assert.equal(model.tokens.length, 10);
    const kt = join(root, 'app/src/main/kotlin/com/shop/ui/DesignTokens.kt');
    assert.deepEqual(rows.platform, { file: 'app/src/main/kotlin/com/shop/ui/DesignTokens.kt', written: true });
    assert.match(readFileSync(kt, 'utf8'), /object DesignTokens/);
    // A generated file is written again; a file that a person wrote stays.
    writeTokens(root);
    writeFileSync(kt, 'object DesignTokens { /* by hand */ }\n');
    const again = writeTokens(root);
    assert.equal(again.platform.written, false);
    assert.match(again.platform.reason, /a person wrote this file/);
    assert.equal(readFileSync(kt, 'utf8'), 'object DesignTokens { /* by hand */ }\n');
    // A sheet with no tokens.json reads as a legacy model.
    rmSync(join(dir, 'tokens.json'));
    const legacy = readTokenModel(root);
    assert.equal(legacy.legacy, true);
    assert.ok(legacy.tokens.some((t) => t.name === '--space-sm' && t.kind === 'space'));
  } finally { rmSync(top, { recursive: true, force: true }); }
});
