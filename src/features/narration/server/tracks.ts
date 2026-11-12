// Narrate the utterances into MP3 tracks and map every spoken word to its box on the page.
// The result is what the player reads (narration.json).
import fs from 'node:fs';
import path from 'node:path';
import type { Box, Narration, Track, Utt, Word } from '../../../shared/types.ts';
import { utterances } from '../../pdf/server/extract.ts';
import type { Doc } from '../../pdf/server/types.ts';
import { silence } from '../../voice/server/mp3.ts';
import type { Engine } from '../../voice/server/tts.ts';
import { align } from './align.ts';

const round2 = (x: number) => Math.round(x * 100) / 100;

interface Printed { text: string; boxes: Box[]; block: number }

/** Printed words of an utterance's blocks, joining a word hyphenated across a column or page break. */
function printedWords(doc: Doc, blockIds: number[]) {
  const out: Printed[] = [];
  for (const id of blockIds) {
    const b = doc.blocks[id];
    for (const w of b.words || []) {
      const boxes = w.boxes.map(bx => [b.page, ...bx] as Box);
      const prev = out.at(-1);
      if (prev && prev.block !== id && prev.text.endsWith('-') && /^\p{Ll}/u.test(w.text)) {
        prev.text = prev.text.slice(0, -1) + w.text; prev.boxes.push(...boxes); continue;
      }
      out.push({ text: w.text, boxes, block: id });
    }
  }
  return out;
}

/**
 * progress(doneChars, totalChars) after each utterance; onTrack({utts, tracks}) after each finished track,
 * so a player can be used while the rest is still being narrated.
 */
export async function narrate(doc: Doc, out: string, engine: Engine, { trackMinutes = 10, firstTrackMinutes = 3, progress, onTrack }: {
  trackMinutes?: number; firstTrackMinutes?: number;
  progress?: (done: number, total: number) => void; onTrack?: (partial: Narration) => void;
} = {}): Promise<Narration> {
  const utts = utterances(doc);
  const total = utts.reduce((s, u) => s + u.text.length, 0);
  const cacheDir = path.join(out, '.cache', 'tts');
  fs.mkdirSync(path.join(out, 'audio'), { recursive: true });
  const tracks: Track[] = [], data: Utt[] = [];
  let cur: Buffer[] = [], curLen = 0, done = 0;

  const flush = () => {
    if (!cur.length) return;
    const src = `audio/${String(tracks.length).padStart(2, '0')}.mp3`;
    fs.writeFileSync(path.join(out, src), Buffer.concat(cur));
    tracks.push({ src, dur: round2(curLen) });
    cur = []; curLen = 0;
    onTrack?.({ utts: [...data], tracks: [...tracks] });
  };

  for (const u of utts) {
    // a short first track so listening can start early; then cut at a heading (or anywhere if it runs long)
    const limit = (tracks.length ? trackMinutes : firstTrackMinutes) * 60;
    if (curLen > limit && (u.kind === 'h' || curLen > 1.5 * limit)) flush();
    const said = await engine.say(u.text, cacheDir);
    const pw = printedWords(doc, u.blocks);
    const mapping = align(said.words.map(w => w[2]), pw);
    const boxes: Box[] = [], offs: number[][] = [];
    for (const w of pw) { offs.push(w.boxes.map((_, k) => boxes.length + k)); boxes.push(...w.boxes); }
    const start = curLen;
    data.push({
      k: u.kind, tr: tracks.length, t: round2(start), e: round2(start + said.dur),
      b: u.blocks.map(id => [doc.blocks[id].page, ...doc.blocks[id].bbox] as Box),
      wb: boxes,
      // [start, end, box indices, 1 if the word closes a phrase]
      w: said.words.map(([s, e, tok], k) => [round2(start + s), round2(start + e),
        [...new Set(mapping[k].flatMap(j => offs[j]))].sort((x, y) => x - y),
        /[,;:.!?)\]—–]['"”’]?$/.test(tok) ? 1 : 0] as Word),
      x: u.kind === 'h' ? u.text.slice(0, 120) : '',
    });
    cur.push(...said.parts);
    curLen += said.dur;
    const gap = silence(u.kind === 'h' ? 0.75 : 0.5);
    cur.push(gap.mp3);
    curLen += gap.dur;
    done += u.text.length;
    progress?.(done, total);
  }
  flush();
  return { utts: data, tracks };
}
