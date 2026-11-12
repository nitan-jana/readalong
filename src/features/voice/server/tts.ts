// Narrate text one sentence at a time: exact sentence timing, word timing estimated within each sentence.
// Each sentence is cached as MP3 (plus its speech length), keyed by voice, speed and text.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Kokoro, phonemize, LANG_BY_PREFIX, SR, type DownloadProgress } from './kokoro.ts';
import { encodeMp3, mp3Duration, silence, ENCODER_DELAY } from './mp3.ts';

export const SENT_SPLIT = /(?<=[.!?])["”’)]?\s+(?=["“(]?[A-Z0-9])/;
const SENTENCE_GAP = 0.28;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export interface VoiceConfig { voice?: string; speed?: number }

/** One utterance, spoken: its MP3 pieces in order, length, and [start, end, word] timings. */
export interface Said { parts: Buffer[]; dur: number; words: [number, number, string][] }

export class Engine {
  k: Kokoro;
  voice: string;
  speed: number;
  lang: string;
  name: string;
  device = 'CPU (onnxruntime)';
  private ph = new Map<string, number>();

  constructor(kokoro: Kokoro, { voice = 'af_heart', speed = 1 }: VoiceConfig = {}) {
    this.k = kokoro;
    this.voice = voice;
    this.speed = Number(speed) || 1;
    this.k.style(voice); // validates the voice name(s) early
    this.lang = LANG_BY_PREFIX[voice.trim()[0]] || 'en-us';
    this.name = `kokoro|${voice}|${this.speed}|${this.lang}`;
  }

  static async create(cfg: VoiceConfig = {}, onProgress?: DownloadProgress) {
    return new Engine(await Kokoro.load(onProgress), cfg);
  }

  synth(sentence: string) {
    return this.k.create(sentence, { voice: this.voice, speed: this.speed, lang: this.lang });
  }

  /** Relative spoken length of a word: its phoneme count, plus a beat for trailing punctuation. */
  async weight(word: string) {
    const core = word.trim();
    let n = this.ph.get(core);
    if (n === undefined) {
      try { n = [...(await phonemize(core.replace(/[^\p{L}\p{N}'\s-]/gu, ''), this.lang)).replace(/[ˈˌː\s]/g, '')].length; }
      catch { n = core.length; }
      n = Math.max(1, n);
      this.ph.set(core, n);
    }
    return n + (/[,;:—–]$/.test(core) ? 3 : 0);
  }

  async sentence(sent: string, cacheDir: string) {
    const key = crypto.createHash('sha1').update(`${this.name}|${sent}`).digest('hex').slice(0, 20);
    const mp3File = path.join(cacheDir, `${key}.mp3`), meta = path.join(cacheDir, `${key}.json`);
    if (fs.existsSync(mp3File) && fs.existsSync(meta)) {
      return { mp3: fs.readFileSync(mp3File), speech: JSON.parse(fs.readFileSync(meta, 'utf8')).speech as number };
    }
    const audio = await this.synth(sent);
    const mp3 = encodeMp3(audio.length ? audio : new Float32Array(SR / 10));
    const speech = audio.length / SR;
    fs.writeFileSync(mp3File, mp3);
    fs.writeFileSync(meta, JSON.stringify({ speech }));
    return { mp3, speech };
  }

  async say(text: string, cacheDir: string): Promise<Said> {
    fs.mkdirSync(cacheDir, { recursive: true });
    const sentences = text.split(SENT_SPLIT).filter(s => s && s.trim());
    if (!sentences.length) sentences.push(text);
    const parts: Buffer[] = [], words: Said['words'] = [];
    let pos = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      const { mp3, speech } = await this.sentence(sent, cacheDir);
      const toks = sent.split(/\s+/).filter(Boolean);
      const ws: number[] = [];
      for (const t of toks) ws.push(await this.weight(t));
      const total = ws.reduce((a, b) => a + b, 0) || 1;
      // kokoro output is trimmed to speech; keep a small margin at each end
      const lead = 0.02 * speech, tail = 0.04 * speech;
      let t = pos + ENCODER_DELAY + lead;
      toks.forEach((tok, j) => {
        const d = ((speech - lead - tail) * ws[j]) / total;
        words.push([round3(t), round3(t + d), tok]);
        t += d;
      });
      parts.push(mp3);
      pos += mp3Duration(mp3);
      if (i < sentences.length - 1) {
        const gap = silence(SENTENCE_GAP);
        parts.push(gap.mp3);
        pos += gap.dur;
      }
    }
    return { parts, dur: pos, words };
  }
}
