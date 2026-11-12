import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { run } from '../../jobs/server/worker.ts';
import { describe, voiceNames } from './kokoro.ts';

export function routes(app: Hono) {
  app.get('/api/voices', async c => c.json((await voiceNames()).map(n => ({ name: n, desc: describe(n), lang: n[0] }))));

  // a short clip in the chosen voice (synthesized in a worker, like narration)
  app.get('/api/sample', async c => {
    const q = c.req.query();
    const out = path.join(os.tmpdir(), `readalong-sample-${crypto.randomBytes(6).toString('hex')}.mp3`);
    try {
      await run('sample', { cfg: { voice: q.voice || 'af_heart', speed: Number(q.speed || 1) },
        text: q.text || 'Fluent explanations can feel like understanding, even when they are not.', out });
      return c.body(fs.readFileSync(out), 200, { 'Content-Type': 'audio/mpeg' });
    } finally { fs.rmSync(out, { force: true }); }
  });
}
