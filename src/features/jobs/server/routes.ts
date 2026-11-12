import type { Hono } from 'hono';
import { cancelJob, getJob, jobView, recentJobs } from './jobs.ts';

export function routes(app: Hono) {
  app.get('/api/jobs', c => c.json(recentJobs()));
  app.get('/api/job/:id', c => { const j = getJob(c.req.param('id')); return j ? c.json(jobView(j)) : c.json({ state: 'missing' }, 404); });
  app.post('/api/job/:id/cancel', c => c.json(cancelJob(c.req.param('id')) ?? { state: 'missing' }));
}
