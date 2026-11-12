// Sharing to a phone: a read-only server on your LAN that serves the app's player for the read-alongs
// you shared, and nothing else.
import os from 'node:os';
import { Hono } from 'hono';
import QRCode from 'qrcode';
import { log } from '../../../shared/node/util.ts';
import { ensureBuilt, jsonError, serveBuiltApp, start } from '../../../server/http.ts';
import { projectFile } from '../../library/server/routes.ts';
import { exists } from '../../library/server/library.ts';
import { playData } from '../../player/server/routes.ts';

export function lanIp() {
  const cands: [number, string][] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // prefer home-network ranges, skip virtual adapters where we can tell
      const score = (/^192\.168\./.test(a.address) ? 3 : /^10\./.test(a.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0)
        - (/vethernet|virtual|vmware|vbox|docker|wsl|br-|tailscale|zt/i.test(name) ? 5 : 0);
      cands.push([score, a.address]);
    }
  }
  cands.sort((x, y) => y[0] - x[0]);
  return cands[0]?.[1] || '127.0.0.1';
}

export const qrText = (url: string) => QRCode.toString(url, { type: 'terminal', small: true });
export const qrSvg = (url: string) => QRCode.toString(url, { type: 'svg', margin: 2, width: 240 });

const SHARE = { started: null as Promise<number> | null, ids: new Set<string>() };

function shareApp() {
  const app = new Hono();
  serveBuiltApp(app);
  app.get('/api/play/:id', c => (SHARE.ids.has(c.req.param('id')) ? c.json({ ...playData(c.req.param('id')), shared: true }) : c.json({ error: 'Not shared.' }, 404)));
  app.on(['GET', 'HEAD'], '/p/:id/*', c => (SHARE.ids.has(c.req.param('id')!) ? projectFile(c) : c.text('Not shared', 404)));
  app.all('*', c => c.json({ error: 'Not available when shared.' }, 404));
  app.onError((e, c) => jsonError(e, c, log));
  return app;
}

/** Share one read-along on the LAN; returns the URL a phone opens. */
export async function startShare(pid: string, port = 8800) {
  ensureBuilt();
  if (!exists(pid)) throw new Error(`No read-along named '${pid}'.`);
  SHARE.started ??= start(shareApp(), port, '0.0.0.0').then(s => s.port);
  const p = await SHARE.started;
  SHARE.ids.add(pid);
  return `http://${lanIp()}:${p}/#/play/${encodeURIComponent(pid)}`;
}

export const unshare = (pid: string) => SHARE.ids.delete(pid);
