// Narrating a read-along folder: tracks + narration.json, written as each part is ready, and
// progress.json for progress bars.
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../../../shared/node/util.ts';
import { loadDoc, summary } from '../../pdf/server/document.ts';
import { renderPages } from '../../pdf/server/pdf.ts';
import type { Engine } from '../../voice/server/tts.ts';
import { narrate } from './tracks.ts';

export interface NarrateOptions {
  progress?: (done: number, total: number) => void;
  trackReady?: (parts: number) => void;
  trackMinutes?: number;
  firstTrackMinutes?: number;
}

export async function narrateProject(dir: string, engine: Engine, { progress, trackReady, trackMinutes = 10, firstTrackMinutes = 3 }: NarrateOptions = {}) {
  const doc = loadDoc(dir);
  const pagesFile = path.join(dir, 'pages.json');
  if (!fs.existsSync(pagesFile)) fs.writeFileSync(pagesFile, JSON.stringify(await renderPages(path.join(dir, 'source.pdf'), dir)));
  const audioDir = path.join(dir, 'audio');
  if (fs.existsSync(audioDir)) for (const f of fs.readdirSync(audioDir)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(audioDir, f));
  const expected = Math.round(summary(doc).minutes * 60);
  const status = path.join(dir, 'narration.json');
  const prog = progressFile(path.join(dir, 'progress.json'));
  // The player reads narration.json; it starts out empty and gains a part every few minutes.
  writeJsonAtomic(status, { utts: [], tracks: [], partial: true, expected });
  let parts = 0;
  const narr = await narrate(doc, dir, engine, {
    trackMinutes, firstTrackMinutes,
    progress: (d, t) => { prog.update(d, t, parts); progress?.(d, t); },
    onTrack: partial => {
      parts = partial.tracks.length;
      writeJsonAtomic(status, { ...partial, partial: true, expected });
      prog.update(prog.done, prog.total, parts, true);
      trackReady?.(parts);
    },
  });
  writeJsonAtomic(status, narr);
  prog.finish(narr.tracks.length);
  return dir;
}

/**
 * progress.json: a small file the player polls while narration runs, for its progress bar.
 * { done, total, eta_s, parts, finished } — eta from the last ~90 s, since cached sentences finish
 * instantly and would make an estimate from the start far too short.
 */
function progressFile(file: string) {
  const samples: [number, number][] = [];
  let last = 0;
  const p = {
    done: 0, total: 1,
    update(done: number, total: number, parts: number, force = false) {
      const now = Date.now() / 1000;
      p.done = done; p.total = Math.max(total, 1);
      samples.push([now, done]);
      while (samples.length > 2 && samples[1][0] < now - 90) samples.shift();
      if (!force && now - last < 2) return;
      last = now;
      let eta: number | null = null;
      const [t0, d0] = samples[0], [t1, d1] = samples.at(-1)!;
      if (t1 - t0 >= 10 && d1 > d0) eta = Math.round((p.total - d1) / ((d1 - d0) / (t1 - t0)));
      try { writeJsonAtomic(file, { done, total: p.total, eta_s: eta, parts, finished: false }); } catch { /* best effort */ }
    },
    finish(parts: number) { writeJsonAtomic(file, { done: p.total, total: p.total, eta_s: 0, parts, finished: true }); },
  };
  p.update(0, 1, 0, true);
  return p;
}
