// Terminal output: progress bars, the extraction summary, confirmations.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import type { Summary } from '../shared/types.ts';
import type { CleanupStats } from '../features/cleanup/server/ai.ts';
import { openInBrowser } from '../server/http.ts';

const fmt = (s: number | null) => (s == null || !isFinite(s) ? '--:--' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** A one-line progress bar with elapsed and remaining time, redrawn in place. */
export function bar(label: string) {
  const t0 = Date.now(), tty = process.stderr.isTTY;
  let last = 0, lastPct = -10;
  const draw = (done: number, total: number, force = false) => {
    const now = Date.now();
    if (!force && now - last < 150) return;
    last = now;
    const f = total ? Math.min(1, done / total) : 0, el = (now - t0) / 1000;
    const w = 28, fill = Math.round(f * w);
    const line = `${pc.bold(label)} ${pc.cyan('━'.repeat(fill))}${pc.dim('━'.repeat(w - fill))} ${String(Math.round(f * 100)).padStart(3)}% ${fmt(el)} elapsed, ${fmt(f > 0.02 ? el / f - el : null)} left`;
    if (tty) process.stderr.write(`\r\x1b[2K${line}`);
    else if (Math.round(f * 100) >= lastPct + 10) { lastPct = Math.round(f * 100); console.error(`${label} ${lastPct}%`); }
  };
  return {
    update: draw,
    note: (msg: string) => { if (tty) process.stderr.write('\r\x1b[2K'); console.log(msg); },
    done: () => { draw(1, 1, true); if (tty) process.stderr.write('\n'); },
    fail: () => { if (tty) process.stderr.write('\n'); },
  };
}

export function showSummary(s: Summary & { ai: CleanupStats | null }, out: string) {
  const rows: [string, string][] = [['Title', s.title || '(untitled)'], ['Pages', String(s.pages)], ['Blocks to read', `${s.kept} of ${s.blocks}`],
    ['Estimated audio', `about ${Math.round(s.minutes)} min`]];
  const sk = Object.entries(s.skipped).sort((a, b) => b[1] - a[1]);
  if (sk.length) rows.push(['Skipped', sk.map(([r, n]) => `${n} ${r}`).join(', ')]);
  if (s.ai) rows.push(['AI cleanup', `${s.ai.batches - s.ai.failed}/${s.ai.batches} batches, ${s.ai.changed_keep} keep/skip changes, $${(s.ai.cost_usd || 0).toFixed(3)}`]);
  rows.push(['Script', path.join(out, 'script.md')]);
  const w = Math.max(...rows.map(r => r[0].length));
  p.note(rows.map(([k, v]) => `${pc.dim(k.padEnd(w))}  ${v}`).join('\n'), 'Extracted');
}

export async function confirm(message: string, initialValue: boolean, yes?: boolean) {
  if (yes) return true;
  const r = await p.confirm({ message, initialValue });
  return !p.isCancel(r) && r;
}

/** Open a URL, file or folder with the system's default app. */
export const open = (target: string) => openInBrowser(/^https?:/.test(target) ? target : pathToFileURL(path.resolve(target)).href);
