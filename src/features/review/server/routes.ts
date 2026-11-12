import path from 'node:path';
import type { Hono } from 'hono';
import type { Project } from '../../../shared/types.ts';
import { readJson } from '../../../shared/node/util.ts';
import { loadDoc, saveDoc, summary } from '../../pdf/server/document.ts';
import { runningJob } from '../../jobs/server/jobs.ts';
import { finished, projectDir } from '../../library/server/library.ts';

/** Everything the project page shows: pages, blocks (without word boxes), summary, what's running. */
function project(pid: string): Project {
  const d = projectDir(pid);
  const doc = loadDoc(d);
  const pages = readJson<Project['pages']>(path.join(d, 'pages.json'));
  return {
    id: pid, title: doc.title, pages: pages.map(p => ({ ...p, src: `/p/${pid}/${p.src}` })),
    blocks: doc.blocks.map(({ id, page, bbox, kind, keep, reason, text, speech }) => ({ id, page, bbox, kind, keep, reason, text, speech })),
    summary: summary(doc), narrated: finished(d),
    running: { narrate: runningJob(pid, 'narrate')?.id ?? null, ai: runningJob(pid, 'ai')?.id ?? null },
  };
}

export function routes(app: Hono) {
  app.get('/api/project/:id', c => c.json(project(c.req.param('id'))));

  // keep/skip and spoken-text edits
  app.post('/api/project/:id/blocks', async c => {
    const dir = projectDir(c.req.param('id'));
    const doc = loadDoc(dir);
    const byId = new Map(doc.blocks.map(x => [x.id, x]));
    for (const e of (await c.req.json()) as { id: number; keep: boolean; speech?: string }[]) {
      const blk = byId.get(e.id);
      if (!blk) continue;
      blk.keep = !!e.keep;
      blk.reason = blk.keep ? '' : blk.reason || 'skipped by you';
      if (e.speech !== undefined) blk.speech = e.speech;
    }
    saveDoc(doc, dir);
    return c.json({ ok: true, summary: summary(doc) });
  });
}
