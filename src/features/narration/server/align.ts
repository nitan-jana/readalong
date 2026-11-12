// Line spoken words up with printed words, so the highlight follows the PDF even where the spoken text
// differs (expanded abbreviations, dropped citations, AI rewrites).
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Longest-common-subsequence matches between a and b, as [i, j] pairs in order. */
function lcsPairs(a: string[], b: string[]) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** For each spoken token, the indices of the printed words it lights up. */
export function align(spoken: string[], printed: (string | { text: string })[]): number[][] {
  const a = spoken.map(norm), b = printed.map(w => norm(typeof w === 'string' ? w : w.text));
  const res: number[][] = spoken.map(() => []);
  const pairs = lcsPairs(a, b);
  let pi = 0, pj = 0;
  const gap = (i1: number, i2: number, j1: number, j2: number) => {  // unmatched stretch: spread the printed words over the spoken ones
    const n = i2 - i1, m = j2 - j1;
    if (!n || !m) return;
    for (let k = 0; k < n; k++) {
      const lo = j1 + Math.floor((k * m) / n);
      const hi = Math.max(lo + 1, j1 + Math.floor(((k + 1) * m) / n));
      res[i1 + k] = Array.from({ length: hi - lo }, (_, x) => lo + x);
    }
  };
  for (const [i, j] of pairs) { gap(pi, i, pj, j); res[i] = [j]; pi = i + 1; pj = j + 1; }
  gap(pi, a.length, pj, b.length);
  // spoken words with no printed counterpart (expanded abbreviations…) borrow a neighbour
  let last: number[] | null = null;
  for (let k = 0; k < res.length; k++) { if (res[k].length) last = res[k].slice(-1); else if (last) res[k] = last; }
  let nxt: number[] | null = null;
  for (let k = res.length - 1; k >= 0; k--) { if (res[k].length) nxt = res[k].slice(0, 1); else if (nxt) res[k] = nxt; }
  return res;
}
