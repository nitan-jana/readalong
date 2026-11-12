// MP3 encoding (lamejs, pure JS) and frame-exact durations.
// Sentences are encoded once and cached; a track is the byte concatenation of its sentences' MP3 frames,
// so nothing is re-encoded. Timings come from counting frames, so they stay exact across joins.
import { Mp3Encoder } from '@breezystack/lamejs';
import { SR } from './kokoro.ts';

const KBPS = 64;

export function encodeMp3(f32: Float32Array, sampleRate = SR): Buffer {
  const enc = new Mp3Encoder(1, sampleRate, KBPS);
  const pcm = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
  const chunks: Buffer[] = [];
  const add = (out: Uint8Array | Int8Array) => { if (out.length) chunks.push(Buffer.from(out.buffer, out.byteOffset, out.length)); };
  for (let i = 0; i < pcm.length; i += 1152 * 8) add(enc.encodeBuffer(pcm.subarray(i, i + 1152 * 8)));
  add(enc.flush());
  return Buffer.concat(chunks);
}

const BITRATES: Record<number, number[]> = { // kbps by [mpeg1 ? 1 : 2][index], layer III
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Seconds of audio in an MP3 buffer, counted frame by frame. */
export function mp3Duration(buf: Uint8Array) {
  let i = 0, samples = 0, rate = SR;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3;  // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = layer III
    const bi = buf[i + 2] >> 4, si = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) { i++; continue; }
    const kbps = BITRATES[ver === 3 ? 1 : 2][bi];
    rate = RATES[ver][si];
    const spf = ver === 3 ? 1152 : 576;
    samples += spf;
    i += Math.floor(((spf / 8) * kbps * 1000) / rate) + pad;
  }
  return samples / rate;
}

const silenceCache = new Map<number, { mp3: Buffer; dur: number }>();
/** An MP3 chunk of (about) `seconds` of silence, with its exact frame duration. */
export function silence(seconds: number) {
  const key = Math.round(seconds * 1000);
  let s = silenceCache.get(key);
  if (!s) {
    const mp3 = encodeMp3(new Float32Array(Math.round(SR * seconds)));
    s = { mp3, dur: mp3Duration(mp3) };
    silenceCache.set(key, s);
  }
  return s;
}

/** lamejs output starts this late within each segment (measured: 1105 samples at 24 kHz). */
export const ENCODER_DELAY = 1105 / SR;
