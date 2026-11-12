import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanForSpeech } from './extract.ts';

test('cleanForSpeech drops citations and expands abbreviations', () => {
  const s = cleanForSpeech('Learners overestimate understanding [12, 14], e.g., in STEM (Smith et al., 2021).');
  assert.ok(!s.includes('[') && !s.includes('Smith'));
  assert.ok(s.includes('for example'));
});
