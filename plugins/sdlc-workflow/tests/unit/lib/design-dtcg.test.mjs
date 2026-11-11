// The W3C design token files: export per theme, references for aliases, and the import back to the
// token tables of DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cssOf, dtcgFiles, dtcgToTables, readDtcg, toDtcg } from '../../../lib/design-dtcg.mjs';
import { parseTokenTables, tokensJson } from '../../../lib/design-tokens.mjs';

const DESIGN = `## Colors
| Role | Light (light) | Dark (dark) | Used for |
|---|---|---|---|
| ground | #ffffff | #111111 | page |
| accent | #1f62d0 | #99b9cd | actions |
| link | var(--accent) | | links |

## Layout
| Role | Value |
|---|---|
| space-2 | 8px |

## Shapes
| Role | Value |
|---|---|
| radius-md | 0.5rem |

## Elevation
| Role | Value |
|---|---|
| shadow-raised | 0 8px 24px rgba(0,0,0,0.35) |

## Motion
| Role | Value |
|---|---|
| duration-fast | 120ms |
`;
const model = tokensJson(parseTokenTables(DESIGN), 'DESIGN.md');

test('one file per theme, grouped by kind, with DTCG types and values', () => {
  const files = dtcgFiles(model);
  assert.deepEqual(Object.keys(files), ['light.tokens.json', 'dark.tokens.json']);
  const dark = files['dark.tokens.json'];
  assert.equal(dark.color.ground.$type, 'color');
  assert.equal(dark.color.ground.$value.hex, '#111111');
  assert.equal(dark.color.ground.$description, 'page');
  assert.deepEqual(dark.space['space-2'].$value, { value: 8, unit: 'px' });
  assert.deepEqual(dark.radius['radius-md'].$value, { value: 0.5, unit: 'rem' });
  assert.equal(dark.shadow['shadow-raised'].$type, 'shadow');
  assert.deepEqual(dark.shadow['shadow-raised'].$value.offsetY, { value: 8, unit: 'px' });
  assert.deepEqual(dark.motion['duration-fast'], { $type: 'duration', $value: { value: 120, unit: 'ms' }, $extensions: { 'dev.sdlc.css': '120ms' } });
});

test('an alias is a reference, and a theme with no own value takes the default', () => {
  const light = toDtcg(model, 'light');
  assert.equal(light.color.link.$value, '{color.accent}');
  assert.equal(toDtcg(model, 'dark').space['space-2'].$value.value, 8);
});

test('the import reads DTCG back as the token tables of DESIGN.md, one column per theme', () => {
  const files = dtcgFiles(model);
  const r = dtcgToTables([{ theme: 'light', doc: files['light.tokens.json'] }, { theme: 'dark', doc: files['dark.tokens.json'] }]);
  assert.deepEqual(r.problems, []);
  assert.match(r.markdown, /\| Role \| Kind \| Light \| Dark \| Used for \|/);
  assert.match(r.markdown, /\| ground \| color \| #ffffff \| #111111 \| page \|/);
  assert.match(r.markdown, /\| link \| color \| var\(--accent\) \|  \| links \|/);
  // The tables parse back to the same tokens.
  const again = parseTokenTables(r.markdown);
  assert.deepEqual(again.problems, []);
  assert.equal(again.find((x) => x.role === 'ground').values.dark, '#111111');
});

test('the import reads the forms of other tools: a group $type, string values, references', () => {
  const doc = { spacing: { $type: 'dimension', small: { $value: '4px' }, md: { $value: { value: 8, unit: 'px' } } }, brand: { primary: { $type: 'color', $value: '#ff6600' }, action: { $type: 'color', $value: '{brand.primary}' } } };
  const tokens = readDtcg(doc);
  assert.deepEqual(tokens.map((t) => [t.role, t.kind, t.value]), [['small', 'space', '4px'], ['md', 'space', '8px'], ['primary', 'color', '#ff6600'], ['action', 'color', '{brand.primary}']]);
  const r = dtcgToTables([{ theme: 'default', doc }]);
  assert.match(r.markdown, /\| action \| color \| var\(--primary\) \|/);
  assert.equal(cssOf('cubicBezier', [0.2, 0, 0, 1]), 'cubic-bezier(0.2, 0, 0, 1)');
  assert.equal(cssOf('color', { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5 }), 'rgb(255 0 0 / 0.5)');
});
