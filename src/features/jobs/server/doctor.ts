// `readalong doctor`: versions, model files, then each stage of the voice engine in its own process,
// so a crash is reported instead of closing the terminal.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { errorMessage, log } from '../../../shared/node/util.ts';
import { MODEL_DIR } from '../../voice/server/kokoro.ts';
import { run, type JobArgs } from './worker.ts';

export async function doctor(print: (line: string) => void = console.log) {
  const req = createRequire(import.meta.url);
  const lines = [`node ${process.version} on ${process.platform} (${process.arch})`];
  for (const pkg of ['onnxruntime-node', 'phonemizer', 'pdfjs-dist', '@napi-rs/canvas', '@breezystack/lamejs']) {
    try { lines.push(`${pkg} ${req(`${pkg}/package.json`).version}`); } catch { lines.push(`${pkg} missing`); }
  }
  for (const n of ['kokoro-v1.0.onnx', 'voices-v1.0.bin']) {
    const p = path.join(MODEL_DIR, n);
    lines.push(`${n}: ${fs.existsSync(p) ? fs.statSync(p).size + ' bytes' : 'not downloaded yet'}`);
  }
  for (const l of lines) { print(l); log('doctor: ' + l); }
  for (const step of ['phonemize', 'load', 'infer'] as JobArgs['probe']['step'][]) {
    const t0 = Date.now();
    let msg: string, ok = true;
    try { const r = await run('probe', { step }); msg = `[ok]   ${step} (${((Date.now() - t0) / 1000).toFixed(1)}s): ${JSON.stringify(r)}`; }
    catch (e) { ok = false; msg = `[FAIL] ${step}: ${errorMessage(e)}`; }
    print(msg); log('doctor: ' + msg);
    if (!ok) return false;
  }
  return true;
}
