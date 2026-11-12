import type { Hono } from 'hono';
import { startJob } from '../../jobs/server/jobs.ts';
import { projectDir } from '../../library/server/library.ts';

export function routes(app: Hono) {
  app.post('/api/project/:id/narrate', async c => {
    const pid = c.req.param('id');
    const cfg = await c.req.json().catch(() => ({}));
    return c.json(startJob(pid, 'narrate', 'narrate',
      { folder: projectDir(pid), cfg: { voice: cfg.voice || 'af_heart', speed: Number(cfg.speed) || 1 } },
      () => ({ player: `/r/${encodeURIComponent(pid)}/play` })));
  });
}
