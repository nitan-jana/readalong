// Heavy work runs in a child process: the voice engine is native code (onnxruntime), and page rendering and
// extraction keep the CPU busy. A child keeps the app responsive, can be cancelled by killing it, and turns
// a native crash into a readable error instead of taking the app down.
import { fork, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOG, errorMessage, log } from '../../../shared/node/util.ts';
import type { VoiceConfig } from '../../voice/server/tts.ts';

const SELF = fileURLToPath(import.meta.url);

/** What each kind of job takes. */
export interface JobArgs {
  sample: { cfg: VoiceConfig; text: string; out: string };
  narrate: { folder: string; cfg: VoiceConfig };
  prepare: { src: string; out: string; ai?: boolean; model?: string; keepBackmatter?: boolean };
  ai: { folder: string; model?: string };
  probe: { step: 'phonemize' | 'load' | 'infer' };
}
export type WorkerKind = keyof JobArgs;

export class Cancelled extends Error {}
export class EngineCrashed extends Error {}

const cancelled = new WeakSet<ChildProcess>();
type Message = ['progress', [number, number]] | ['done', unknown] | ['error', string];

/** Run a job in a child. progress(done, total) as it goes; onStart(child) so the caller can cancel it. */
export function run<K extends WorkerKind>(kind: K, args: JobArgs[K], { progress, onStart }: {
  progress?: (done: number, total: number) => void; onStart?: (child: ChildProcess) => void;
} = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = fork(SELF, ['--child'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, READALONG_LOG: LOG } });
    onStart?.(child);
    let result: unknown, error: string | undefined;
    child.on('message', (m: Message) => {
      if (m[0] === 'progress') progress?.(...m[1]);
      else if (m[0] === 'done') result = m[1];
      else error = m[1];
    });
    child.once('error', e => { error ||= e.message; });
    child.once('exit', (code, signal) => {
      if (cancelled.has(child)) { log(`worker cancelled: ${kind}`); return reject(new Cancelled('Cancelled.')); }
      if (error) return reject(new Error(error));
      if (result === undefined) {
        log(`worker crashed: ${kind} exit ${code} ${signal || ''}`);
        return reject(new EngineCrashed(`The ${kind === 'prepare' ? 'PDF reader' : 'voice engine'} stopped unexpectedly `
          + `(exit ${signal || code}). Details are in ${LOG}. Run \`readalong doctor\` to see which part fails.`));
      }
      resolve(result);
    });
    child.send({ kind, args });
  });
}

export function cancel(child: ChildProcess | undefined) {
  if (child && child.exitCode === null && !child.killed) { cancelled.add(child); child.kill(); }
}

// ---------- the child side ----------
async function job(kind: WorkerKind, args: any, progress: (done: number, total: number) => void): Promise<unknown> {
  const engine = async () => {
    const { Engine } = await import('../../voice/server/tts.ts');
    const seen: Record<string, number> = {};
    return Engine.create(args.cfg || {}, (name, got, total) => { // first run only: log every 10%
      const step = total ? Math.floor((10 * got) / total) : 0;
      if (seen[name] !== step) { seen[name] = step; log(`downloading ${name}: ${step * 10}%`); }
    });
  };
  switch (kind) {
    case 'sample': {
      const a = args as JobArgs['sample'];
      const { encodeMp3 } = await import('../../voice/server/mp3.ts');
      const eng = await engine();
      fs.writeFileSync(a.out, encodeMp3(await eng.synth(a.text)));
      return { device: eng.device };
    }
    case 'narrate': {
      const a = args as JobArgs['narrate'];
      const { narrateProject } = await import('../../narration/server/narrate.ts');
      return { folder: await narrateProject(a.folder, await engine(), { progress }) };
    }
    case 'prepare': {
      const a = args as JobArgs['prepare'];
      const { prepare } = await import('../../library/server/add.ts');
      return prepare(a.src, a.out, { ai: a.ai, aiModel: a.model, keepBackmatter: a.keepBackmatter, progress });
    }
    case 'ai': {
      const a = args as JobArgs['ai'];
      const { loadDoc, saveDoc } = await import('../../pdf/server/document.ts');
      const { refine } = await import('../../cleanup/server/ai.ts');
      const doc = loadDoc(a.folder);
      const stats = await refine(doc, { model: a.model || 'haiku', progress });
      saveDoc(doc, a.folder);
      return stats;
    }
    case 'probe': return probe((args as JobArgs['probe']).step);
  }
}

async function probe(step: JobArgs['probe']['step']) {
  const k = await import('../../voice/server/kokoro.ts');
  if (step === 'phonemize') return { phonemes: await k.phonemize('Hello world, this is a test.') };
  if (step === 'load') { await k.Kokoro.load(); return { device: 'CPU (onnxruntime)' }; }
  const { Engine } = await import('../../voice/server/tts.ts');
  const e = await Engine.create({ voice: 'af_heart' });
  const t0 = performance.now();
  const a = await e.synth('Hello world, this is a test.');
  const secs = a.length / k.SR;
  return { seconds: +secs.toFixed(2), realtime: +(secs / ((performance.now() - t0) / 1000)).toFixed(1) };
}

if (process.argv[2] === '--child' && process.send) {
  // If the app goes away, stop: nobody is waiting for the result.
  let finished = false;
  process.on('disconnect', () => { if (!finished) { log('worker: app went away, stopping'); process.exit(3); } });
  process.once('message', async ({ kind, args }: { kind: WorkerKind; args: any }) => {
    const emit = (m: Message) => { try { process.send!(m); } catch { process.exit(3); } };
    log(`worker start: ${kind} ${JSON.stringify({ ...args, text: undefined })}`);
    try {
      emit(['done', (await job(kind, args, (d, t) => emit(['progress', [d, t]]))) ?? null]);
      log(`worker done: ${kind}`);
    } catch (e) {
      log(`worker error: ${kind}: ${(e as Error).stack || e}`);
      emit(['error', errorMessage(e)]);
    }
    finished = true;
    process.disconnect?.();
  });
}
