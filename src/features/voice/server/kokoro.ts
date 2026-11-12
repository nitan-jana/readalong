// Kokoro-82M on onnxruntime-node: model files, voices, phonemes and inference.
// Mirrors kokoro-onnx (Python) so both produce the same audio from the same model files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import type { InferenceSession } from 'onnxruntime-node';
import VOCAB from './vocab.json' with { type: 'json' };

const vocab = VOCAB as Record<string, number>;

export const SR = 24000;
export const MAX_PHONEMES = 510;
export const MODEL_DIR = process.env.READALONG_CACHE || path.join(os.homedir(), '.cache', 'readalong');
const MODEL_URLS: Record<string, string> = {
  'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
  'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
};
// The JavaScript espeak-ng build only includes English, so only English voices are offered.
export const LANG_BY_PREFIX: Record<string, string> = { a: 'en-us', b: 'en-gb' };
const LANG_NAMES: Record<string, string> = { a: 'American English', b: 'British English' };

export type DownloadProgress = (file: 'model' | 'voices', done: number, total: number) => void;

export function describe(name: string) {
  const g = ({ f: 'female', m: 'male' } as Record<string, string>)[name[1]] || '';
  return `${LANG_NAMES[name[0]] || '?'}, ${g}`;
}

/** Download a model file once (first run), with a progress callback (done, total bytes). */
export async function ensureModelFile(name: string, onProgress?: (done: number, total: number) => void) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const dest = path.join(MODEL_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  const res = await fetch(MODEL_URLS[name], { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${name} (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  let done = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    done += chunk.length;
    onProgress?.(done, total);
  }
  await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  fs.renameSync(tmp, dest);
  return dest;
}

/** voices-v1.0.bin is a NumPy .npz: a zip of float32 .npy arrays shaped (510, 1, 256). */
function loadVoices(file: string) {
  const out: Record<string, Float32Array> = {};
  for (const [entry, buf] of Object.entries(unzipSync(fs.readFileSync(file)))) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const major = buf[6];
    const hlen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
    const start = (major === 1 ? 10 : 12) + hlen;
    out[entry.replace(/\.npy$/, '')] = new Float32Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + buf.byteLength));
  }
  return out;
}

export async function voiceNames() {
  const v = loadVoices(await ensureModelFile('voices-v1.0.bin'));
  return Object.keys(v).filter(n => n[0] in LANG_BY_PREFIX).sort();
}

// ---------- phonemes ----------
const PUNCT = /([;:,.!?¡¿—…"«»“”()])/;
let espeakFn: ((text: string, lang: string) => Promise<string[]>) | null = null;
async function espeak(text: string, lang: string) {
  espeakFn ??= (await import('phonemizer')).phonemize;
  return (await espeakFn(text, lang)).join(' ');
}

/** Text to Kokoro phonemes: espeak-ng per stretch between punctuation, with the punctuation put back
 * (Kokoro uses it for pauses and intonation), filtered to the model's vocabulary. */
export async function phonemize(text: string, lang = 'en-us') {
  let out = '';
  for (const part of text.trim().split(PUNCT)) {
    if (!part) continue;
    if (part.length === 1 && PUNCT.test(part)) { out = out.replace(/\s+$/, '') + part + ' '; continue; }
    if (!part.trim()) { out += ' '; continue; }
    out += (await espeak(part, lang)) + ' ';
  }
  // the JS espeak-ng build is a little older than Python's: align its "r-colored o" with what Kokoro was trained on
  out = out.replace(/oːɹ/g, 'ɔːɹ');
  return [...out.replace(/\s+/g, ' ').trim()].filter(c => c in vocab).join('');
}

/** Split phonemes into chunks of at most `max`, preferring punctuation, then spaces. */
export function splitPhonemes(ph: string, max = MAX_PHONEMES) {
  const out: string[] = [];
  let rest = ph;
  while ([...rest].length > max) {
    const chars = [...rest];
    let cut = -1;
    for (let i = max - 1; i > max / 2; i--) if (/[.!?;:,—…]/.test(chars[i])) { cut = i + 1; break; }
    if (cut < 0) for (let i = max - 1; i > 0; i--) if (chars[i] === ' ') { cut = i + 1; break; }
    if (cut < 0) cut = max;
    out.push(chars.slice(0, cut).join('').trim());
    rest = chars.slice(cut).join('').trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Cut leading/trailing silence so sentence boundaries line up with speech. */
export function trim(a: Float32Array, thresh = 0.01) {
  let s = 0, e = a.length - 1;
  while (s < a.length && Math.abs(a[s]) <= thresh) s++;
  while (e > s && Math.abs(a[e]) <= thresh) e--;
  if (s >= e) return a;
  const pad = Math.round(SR * 0.03);
  return a.subarray(Math.max(0, s - pad), Math.min(a.length, e + pad + 1));
}

export function concat(parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

type Ort = typeof import('onnxruntime-node');

export class Kokoro {
  ort: Ort;
  session: InferenceSession;
  voices: Record<string, Float32Array>;
  tokensInput: string;

  constructor(ort: Ort, session: InferenceSession, voices: Record<string, Float32Array>) {
    this.ort = ort;
    this.session = session;
    this.voices = voices;
    this.tokensInput = session.inputNames.includes('input_ids') ? 'input_ids' : 'tokens';
  }

  static async load(onProgress?: DownloadProgress) {
    const ort = await import('onnxruntime-node');
    const modelPath = await ensureModelFile('kokoro-v1.0.onnx', (d, t) => onProgress?.('model', d, t));
    const voicesPath = await ensureModelFile('voices-v1.0.bin', (d, t) => onProgress?.('voices', d, t));
    return new Kokoro(ort, await ort.InferenceSession.create(modelPath), loadVoices(voicesPath));
  }

  /** "af_heart" or a weighted blend like "af_heart:0.6,bf_emma:0.4" → a style table. */
  style(spec: string): Float32Array {
    const parts = spec.split(',').map(p => p.trim()).filter(Boolean).map(p => p.split(':'));
    for (const [n] of parts) {
      if (!this.voices[n] || !(n[0] in LANG_BY_PREFIX)) throw new Error(`Unknown voice '${n}'. Run \`readalong voices\` to list them.`);
    }
    if (parts.length === 1) return this.voices[parts[0][0]];
    const ws = parts.map(p => (p[1] === undefined ? 1 : Number(p[1])));
    const tot = ws.reduce((a, b) => a + b, 0) || 1;
    const out = new Float32Array(this.voices[parts[0][0]].length);
    parts.forEach(([n], i) => { const v = this.voices[n]; for (let j = 0; j < out.length; j++) out[j] += v[j] * (ws[i] / tot); });
    return out;
  }

  async infer(tokens: number[], styleTable: Float32Array, speed: number) {
    const { Tensor } = this.ort;
    const row = Math.min(tokens.length, MAX_PHONEMES) - 1; // one style vector per phoneme count
    const feeds = {
      [this.tokensInput]: new Tensor('int64', BigInt64Array.from([0, ...tokens, 0].map(BigInt)), [1, tokens.length + 2]),
      style: new Tensor('float32', styleTable.slice(row * 256, row * 256 + 256), [1, 256]),
      speed: new Tensor('float32', Float32Array.from([speed]), [1]),
    };
    const res = await this.session.run(feeds);
    return res[this.session.outputNames[0]].data as Float32Array;
  }

  /** Synthesize text (one sentence, typically); long ones are split at punctuation with short pauses. */
  async create(text: string, { voice = 'af_heart', speed = 1, lang }: { voice?: string; speed?: number; lang?: string } = {}) {
    lang = lang || LANG_BY_PREFIX[voice.trim()[0]] || 'en-us';
    const styleTable = this.style(voice);
    const ph = await phonemize(text, lang);
    if (!ph) return new Float32Array(0);
    const chunks = splitPhonemes(ph);
    const parts: Float32Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const tokens = [...chunks[i]].map(c => vocab[c]).filter(t => t !== undefined);
      if (!tokens.length) continue;
      parts.push(trim(await this.infer(tokens, styleTable, speed)));
      if (i < chunks.length - 1) parts.push(new Float32Array(Math.round(SR * (/[.!?]$/.test(chunks[i]) ? 0.25 : 0.1))));
    }
    return concat(parts);
  }
}
