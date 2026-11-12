import type { Hono } from 'hono';
import { startJob } from '../../jobs/server/jobs.ts';
import { projectDir } from '../../library/server/library.ts';

export function routes(app: Hono) {
  app.post('/api/project/:id/ai', async c => {
    const pid = c.req.param('id');
    const { model = 'haiku' } = await c.req.json().catch(() => ({}));
    return c.json(startJob(pid, 'ai', 'ai', { folder: projectDir(pid), model }));
  });
}
