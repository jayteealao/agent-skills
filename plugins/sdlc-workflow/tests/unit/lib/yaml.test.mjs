// lib/yaml.mjs: the reader takes the subset the records use, the writer reads back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { YamlError, isPlainSafe, parse, stringify } from '../../../lib/yaml.mjs';

test('scalars resolve as YAML 1.2 core does, and a timestamp stays text', () => {
  assert.deepEqual(parse('a: ~\nb: true\nc: 12\nd: 1.5\ne: 2026-10-24\nf: "x: y"\ng: \'it\'\'s\'\nh: 0x1F\n'),
    { a: null, b: true, c: 12, d: 1.5, e: '2026-10-24', f: 'x: y', g: "it's", h: 31 });
});

test('block and flow collections, a list at the indent of its key, comments', () => {
  const text = [
    'slices:',
    '- slug: a   # the first',
    '  depends-on: [b, c]',
    '- slug: b',
    'map: {k: v, n: [1, 2]}',
    'nested:',
    '  - - x',
    '    - y',
  ].join('\n');
  assert.deepEqual(parse(text), {
    slices: [{ slug: 'a', 'depends-on': ['b', 'c'] }, { slug: 'b' }],
    map: { k: 'v', n: [1, 2] },
    nested: [['x', 'y']],
  });
});

test('block scalars, folded plain scalars and quoted scalars over lines', () => {
  assert.deepEqual(parse('a: |\n  one\n  two\nb: >-\n  one\n  two\n\n  three\nc: plain\n  folded\n'),
    { a: 'one\ntwo\n', b: 'one two\nthree', c: 'plain folded' });
  assert.deepEqual(parse('k: >\n  vars:\n\n    import\n  tail\n'), { k: 'vars:\n\n  import\ntail\n' });
  assert.deepEqual(parse("s: 'a; \n  b; \n  '\n"), { s: 'a;  b;  ' }, 'a quoted scalar keeps the trailing spaces');
});

test('an anchor on a block value reads back through its alias as a copy', () => {
  const v = parse('a: &id001\n  - x\nb: *id001\n');
  assert.deepEqual(v, { a: ['x'], b: ['x'] });
  assert.notEqual(v.a, v.b);
});

test('the reader refuses what it does not take', () => {
  for (const text of ['a: 1\na: 2\n', 'a: !tag x\n', '? complex: key\n', ':\n', 'a: 1\n---\nb: 2\n', 'a:\n\t- x\n', 'a: *nowhere\n']) {
    assert.throws(() => parse(text), YamlError, JSON.stringify(text));
  }
});

test('stringify writes a value that parses back to the same value', () => {
  const value = {
    type: 'slice',
    'schema-version': 1,
    tags: ['a', 'b: c', '- dash', '#hash', 'true', '12', '2026-10-24', ''],
    nested: { list: [{ x: 1, y: [] }, { z: {} }], none: null, yes: false },
    text: 'line one\nline two\n',
    quote: 'say "hi" \\ back',
  };
  assert.deepEqual(parse(stringify(value)), value);
  assert.equal(stringify(['a', 'b c'], { flow: true }), '[a, b c]');
  assert.equal(stringify({ k: ['x, y'] }, { flow: true }), '{k: ["x, y"]}');
  assert.ok(isPlainSafe('plain words') && !isPlainSafe('yes: no') && !isPlainSafe('null'));
});
