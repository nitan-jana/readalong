// Pure lookups over the narration data: where are we, what to highlight, what was clicked.
import type { Box, Narration, Page, Utt } from '../../../shared/types.ts';

export interface Index {
  trackStart: number[]; // global start time of each track
  total: number;        // total seconds narrated so far
  byTrack: number[][];  // utterance indexes per track, in time order
}

export function buildIndex(n: Narration): Index {
  const trackStart: number[] = [];
  let acc = 0;
  for (const t of n.tracks) { trackStart.push(acc); acc += t.dur; }
  const byTrack: number[][] = n.tracks.map(() => []);
  n.utts.forEach((u, i) => byTrack[u.tr]?.push(i));
  return { trackStart, total: acc || 1, byTrack };
}

/** The utterance playing at time t of track tr (the last one that has started). */
export function uttAt(n: Narration, ix: Index, tr: number, t: number): number {
  const list = ix.byTrack[tr] ?? [];
  let lo = 0, hi = list.length - 1, r = list[0] ?? -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (n.utts[list[m]].t <= t + 0.03) { r = list[m]; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** The word of utterance u being spoken at time t, or -1 before the first. */
export function wordAt(u: Utt, t: number): number {
  const w = u.w;
  let lo = 0, hi = w.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (w[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** Words around wi up to the phrase marks (commas, full stops…), capped so a phrase stays short. */
export function phraseRange(u: Utt, wi: number): [number, number] {
  const w = u.w;
  let s = wi, e = wi;
  while (s > 0 && !w[s - 1][3] && wi - s < 7) s--;
  while (e < w.length - 1 && !w[e][3] && e - s < 9) e++;
  return [s, e];
}

/** Join word boxes that sit on the same line into one box per line. */
export function mergeLines(boxes: Box[]): Box[] {
  const out: Box[] = [];
  const sorted = boxes.slice().sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  for (const b of sorted) {
    const l = out.at(-1);
    const h = b[4] - b[2];
    if (l && l[0] === b[0] && Math.abs(l[2] - b[2]) < h * 0.5 && b[1] - l[3] < h * 1.2) {
      l[3] = Math.max(l[3], b[3]); l[4] = Math.max(l[4], b[4]); l[2] = Math.min(l[2], b[2]);
    } else out.push(b.slice() as Box);
  }
  return out;
}

export type Mode = 'para' | 'phrase' | 'word';

/** What to draw: the paragraph's blocks, plus the current word or phrase as line boxes. */
export function highlight(u: Utt | undefined, wi: number, mode: Mode): { para: Box[]; marks: Box[] } {
  if (!u) return { para: [], marks: [] };
  const ids: number[] = [];
  if (mode !== 'para' && wi >= 0 && u.w.length) {
    const [s, e] = mode === 'phrase' ? phraseRange(u, wi) : [wi, wi];
    for (let k = s; k <= e; k++) ids.push(...u.w[k][2]);
  }
  return { para: u.b, marks: mergeLines([...new Set(ids)].map(i => u.wb[i])) };
}

/** The utterance (and word, unless reading by paragraph) at a click on a page, or null if none nearby. */
export function hitTest(n: Narration, pages: Page[], p: number, x: number, y: number, byWord: boolean) {
  let best = -1, bestD = 1e9;
  n.utts.forEach((u, i) => u.b.forEach(b => {
    if (b[0] !== p) return;
    const d = Math.max(b[1] - x, 0, x - b[3]) + Math.max(b[2] - y, 0, y - b[4]);
    if (d < bestD) { bestD = d; best = i; }
  }));
  if (best < 0 || bestD > 30 || !pages[p]) return null;
  const u = n.utts[best];
  let word: number | null = null;
  if (byWord) {
    const k = u.w.findIndex(w => w[2].some(j => {
      const b = u.wb[j];
      return b[0] === p && x >= b[1] - 2 && x <= b[3] + 2 && y >= b[2] - 2 && y <= b[4] + 2;
    }));
    if (k >= 0) word = k;
  }
  return { utt: best, word };
}

/** Track and offset for a global time. */
export function locate(ix: Index, g: number): [number, number] {
  let t = ix.trackStart.length - 1;
  while (t > 0 && ix.trackStart[t] > g) t--;
  return [Math.max(t, 0), g - (ix.trackStart[t] ?? 0)];
}

export function fmtTime(s: number) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

/** The heading the reader is in, for the "where" line. */
export function sectionOf(n: Narration, u: number, fallback: string) {
  for (let i = u; i >= 0; i--) { const x = n.utts[i]; if (x?.k === 'h' && x.x) return x.x.replace(/\.$/, ''); }
  return fallback;
}
