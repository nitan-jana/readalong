// Keeping the local app local. It listens on 127.0.0.1, but a web page in your browser can still try
// to reach it:
//  - DNS rebinding: a site points its own hostname at 127.0.0.1 and then reads the API as "itself".
//    Requests must name this computer in the Host header (localhost / 127.0.0.1 / [::1]).
//  - Cross-site requests: any site can send a plain POST to 127.0.0.1 (deleting a read-along, starting
//    a paid AI cleanup). Changes are only accepted from the app's own pages, judged by Origin.
import type { MiddlewareHandler } from 'hono';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

const hostname = (hostHeader: string) => hostHeader.replace(/:\d+$/, '').toLowerCase();

export const localOnly: MiddlewareHandler = async (c, next) => {
  if (!LOCAL.has(hostname(c.req.header('host') || ''))) return c.text('Forbidden', 403);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const site = c.req.header('sec-fetch-site');
    let ok = !origin || origin === 'null' ? site !== 'cross-site' : false;
    if (origin && origin !== 'null') { try { ok = LOCAL.has(hostname(new URL(origin).host)); } catch { ok = false; } }
    if (!ok) return c.json({ error: 'Requests from other sites are not allowed.' }, 403);
  }
  await next();
};
