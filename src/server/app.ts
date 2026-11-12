// `readalong ui`: the browser app (built from src/ with Vite into dist/app) and its API, on 127.0.0.1 only.
// Each feature adds its own routes.
import fs from 'node:fs';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { LIBRARY, LOG, log, which } from '../shared/node/util.ts';
import { localOnly } from './guard.ts';
import { ensureBuilt, jsonError, openInBrowser, serveBuiltApp, start } from './http.ts';
import { stopAll } from '../features/jobs/server/jobs.ts';
import { routes as cleanup } from '../features/cleanup/server/routes.ts';
import { routes as jobs } from '../features/jobs/server/routes.ts';
import { routes as library } from '../features/library/server/routes.ts';
import { routes as narration } from '../features/narration/server/routes.ts';
import { routes as player } from '../features/player/server/routes.ts';
import { routes as review } from '../features/review/server/routes.ts';
import { routes as sharing } from '../features/sharing/server/routes.ts';
import { unshare } from '../features/sharing/server/share.ts';
import { routes as voice } from '../features/voice/server/routes.ts';

export function createApp() {
  const app = new Hono();
  app.use('*', localOnly);
  app.use('/api/*', bodyLimit({ maxSize: 300 * 1024 * 1024, onError: c => c.json({ error: 'That file is too large (300 MB at most).' }, 413) }));
  serveBuiltApp(app);
  app.get('/api/env', c => c.json({ claude: !!(process.env.READALONG_CLAUDE || which('claude')) }));
  library(app, { onDelete: unshare });
  review(app);
  cleanup(app);
  voice(app);
  narration(app);
  player(app);
  jobs(app);
  sharing(app);
  app.all('/api/*', c => c.json({ error: 'Not found' }, 404));
  app.onError((e, c) => jsonError(e, c, log));
  return app;
}

/** Is a readalong app already answering on this port? */
export async function runningAt(port: number) {
  try { return (await fetch(`http://127.0.0.1:${port}/api/env`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; }
}

export async function runUi({ port = 8765, openBrowser = true, open = '' } = {}) {
  ensureBuilt();
  fs.mkdirSync(LIBRARY, { recursive: true });
  log('ui start');
  const { port: p } = await start(createApp(), port, '127.0.0.1');
  const url = `http://127.0.0.1:${p}/`;
  console.log(`readalong is running at ${url}  (Ctrl+C to stop)`);
  console.log(`Log: ${LOG}`);
  if (openBrowser) setTimeout(() => openInBrowser(url + open), 600);
  const stop = () => { stopAll(); console.log('\nStopped.'); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return url;
}
