// HTTP helpers: file responses with Range support (phones need it to play and seek audio), the built
// app's files, starting a Hono app on a free port, and opening a browser.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Context, Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { ROOT } from '../shared/node/util.ts';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.wav': 'audio/wav', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2' };

/** Resolve a URL path inside root, or null if it tries to leave it. */
export function inside(root: string, rel: string) {
  const r = path.resolve(root);
  let p: string;
  try { p = path.resolve(r, '.' + path.posix.normalize('/' + decodeURIComponent(rel))); } catch { return null; }
  return p === r || p.startsWith(r + path.sep) ? p : null;
}

/** A Response for one file, honouring `Range: bytes=a-b`. */
export function fileResponse(req: Request, file: string | null, { cache = 'no-cache' } = {}) {
  let st: fs.Stats | null = null;
  try { st = file ? fs.statSync(file) : null; } catch { /* missing */ }
  if (!file || !st?.isFile()) return new Response('Not found', { status: 404 });
  const size = st.size;
  const headers: Record<string, string> = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': cache };
  let start = 0, end = size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m) {
    if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], size - 1) : size - 1; }
    else if (m[2]) start = Math.max(0, size - +m[2]);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  if (req.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status, headers });
}

// ---------- the built app (dist/app, from `pnpm build`) ----------
export const DIST = path.join(ROOT, 'dist', 'app');

export function ensureBuilt() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error("The app hasn't been built yet. Run `pnpm build` in the readalong folder.");
  }
}

/** index.html for the app's pages (/ and /r/…), hashed assets cached for good, and the icon. */
export function serveBuiltApp(app: Hono) {
  app.get('/assets/*', c => fileResponse(c.req.raw, inside(DIST, c.req.path), { cache: 'public, max-age=31536000, immutable' }));
  const page = (c: Context) => fileResponse(c.req.raw, path.join(DIST, 'index.html'));
  app.get('/', page);
  app.get('/r/*', page); // client-side routes
  app.get('/favicon.svg', c => fileResponse(c.req.raw, path.join(DIST, 'favicon.svg')));
}

/** JSON errors: 400 for a bad read-along name, the error's own status if it has one, else 500. */
export function jsonError(err: Error & { status?: number }, c: Context, log: (m: string) => void) {
  if (err.message === 'bad project id') return c.json({ error: err.message }, 400);
  if (err.status) return c.json({ error: err.message }, err.status as 404);
  log(`request error ${c.req.path}: ${err.stack || err}`);
  return c.json({ error: err.message }, 500);
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---------- listening ----------
/** The first free port at or after `preferred`. */
export async function freePort(preferred: number, host = '0.0.0.0') {
  for (let p = preferred; p < preferred + 50; p++) {
    const ok = await new Promise<boolean>(resolve => {
      const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
      s.listen(p, host);
    });
    if (ok) return p;
  }
  return 0;
}

/** Start a Hono app on the first free port at or after `port`. */
export async function start(app: Hono, port: number, host: string) {
  const server = http.createServer(getRequestListener(app.fetch));
  const p = await freePort(port, host);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(p, host, resolve); });
  return { server, port: (server.address() as net.AddressInfo).port };
}

/** Open a URL or file with the system's default app. */
export async function openInBrowser(target: string) {
  const { spawn } = await import('node:child_process');
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${target}"`]]
    : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  try {
    spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' })
      .on('error', () => {}).unref();
  } catch { /* no browser: the URL is printed anyway */ }
}
