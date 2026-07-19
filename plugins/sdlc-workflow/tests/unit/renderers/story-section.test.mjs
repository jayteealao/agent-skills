import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitStorySection } from '../../../renderers/_story.mjs';

test('splitStorySection lifts the leading "## The <Stage>" section', () => {
  const body = [
    '# Plan: checkout-total',
    '',
    '## The Plan',
    'The goal is the checkout total. We avoid a date-picker library.',
    '',
    'Region detection is the hard part.',
    '',
    '## Current State',
    'Nothing built yet.',
  ].join('\n');
  const { storyMarkdown, bodyRest } = splitStorySection(body);
  assert.match(storyMarkdown, /^## The Plan/);
  assert.match(storyMarkdown, /Region detection is the hard part\./);
  assert.doesNotMatch(storyMarkdown, /Current State/);
  // The lifted section is gone from the remainder; the title + later sections stay.
  assert.doesNotMatch(bodyRest, /## The Plan/);
  assert.match(bodyRest, /# Plan: checkout-total/);
  assert.match(bodyRest, /## Current State/);
});

test('splitStorySection only hoists when the FIRST h2 is the story', () => {
  // A non-story first section means there is no lead to hoist, even if a later
  // heading happens to start with "The".
  const body = '# Verify: x\n\n## Verification Summary\nAll green.\n\n## The Reason\nincidental.';
  const { storyMarkdown, bodyRest } = splitStorySection(body);
  assert.equal(storyMarkdown, '');
  assert.equal(bodyRest, body);
});

test('splitStorySection is a no-op for bodies without a story section', () => {
  const body = '# Retro\n\n## What Went Well\n- thing';
  const { storyMarkdown, bodyRest } = splitStorySection(body);
  assert.equal(storyMarkdown, '');
  assert.equal(bodyRest, body);
});

test('splitStorySection handles CRLF, leading title, and empty input', () => {
  const crlf = '# T\r\n\r\n## The Shape\r\nScope decided.\r\n\r\n## Problem\r\nx';
  const { storyMarkdown, bodyRest } = splitStorySection(crlf);
  assert.match(storyMarkdown, /## The Shape/);
  assert.match(storyMarkdown, /Scope decided\./);
  assert.doesNotMatch(bodyRest, /## The Shape/);
  assert.match(bodyRest, /## Problem/);
  assert.deepEqual(splitStorySection(''), { storyMarkdown: '', bodyRest: '' });
  assert.deepEqual(splitStorySection(undefined), { storyMarkdown: '', bodyRest: '' });
});
