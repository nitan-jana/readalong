import type { Hono } from 'hono';
import { qrSvg, startShare } from './share.ts';

export function routes(app: Hono) {
  app.get('/api/share/:id', async c => { const url = await startShare(c.req.param('id')); return c.json({ url, svg: await qrSvg(url) }); });
}
