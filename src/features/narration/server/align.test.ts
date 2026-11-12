import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align } from './align.ts';

test('align handles expansions and citations', () => {
  const spoken = 'for example, fluent text misleads learners.'.split(' ');
  const printed = 'e.g., fluent text [3] misleads learners.'.split(' ').map(text => ({ text }));
  const m = align(spoken, printed);
  assert.deepEqual([m[2], m[3], m[4]], [[1], [2], [4]]); // fluent, text, misleads
  assert.ok(m.every(x => x.length));                     // every spoken word lights something
});
