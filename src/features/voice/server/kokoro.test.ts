import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPhonemes } from './kokoro.ts';

test('long phoneme strings split at punctuation within the limit', () => {
  const ph = 'abc def, ghi jkl. '.repeat(60);
  const parts = splitPhonemes(ph, 510);
  assert.ok(parts.every(p => [...p].length <= 510));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), ph.trim().replace(/\s+/g, ' '));
});
