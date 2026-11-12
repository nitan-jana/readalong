import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, uttAt, wordAt, phraseRange, mergeLines, hitTest, locate } from './timing.ts';
import type { Narration, Utt, Word } from '../../../shared/types.ts';

const u = (tr: number, t: number, words: [number, number, 0 | 1][]): Utt => ({ k: 'p', tr, t, e: t + words.length, b: [[0, 10, 10, 100, 40]], x: '',
  wb: words.map((_, i) => [0, 10 + i * 20, 10, 25 + i * 20, 20]),
  w: words.map(([s, end, mark], i): Word => [s, end, [i], mark]) });
const N: Narration = { tracks: [{ src: 'a', dur: 10 }, { src: 'b', dur: 5 }],
  utts: [u(0, 0, [[0, 1, 0], [1, 2, 1], [2, 3, 0]]), u(0, 4, [[4, 5, 0]]), u(1, 0, [[0, 1, 1]])] };

test('index, current utterance and word', () => {
  const ix = buildIndex(N);
  assert.deepEqual(ix.trackStart, [0, 10]);
  assert.equal(ix.total, 15);
  assert.equal(uttAt(N, ix, 0, 3.5), 0);
  assert.equal(uttAt(N, ix, 0, 4.2), 1);
  assert.equal(uttAt(N, ix, 1, 0.5), 2);
  assert.equal(wordAt(N.utts[0], 1.5), 1);
  assert.equal(wordAt(N.utts[0], -1), -1);
  assert.deepEqual(locate(ix, 12), [1, 2]);
});

test('phrases stop at punctuation marks; word boxes merge per line', () => {
  assert.deepEqual(phraseRange(N.utts[0], 0), [0, 1]);
  assert.deepEqual(phraseRange(N.utts[0], 2), [2, 2]);
  assert.deepEqual(mergeLines([[0, 10, 10, 25, 20], [0, 30, 10, 45, 20], [0, 10, 30, 25, 40]]), [[0, 10, 10, 45, 20], [0, 10, 30, 25, 40]]);
});

test('clicking a word finds it; clicking far away finds nothing', () => {
  const pages = [{ src: '', w: 200, h: 200 }];
  assert.deepEqual(hitTest(N, pages, 0, 31, 15, true), { utt: 0, word: 1 });
  assert.equal(hitTest(N, pages, 0, 190, 190, true), null);
});
