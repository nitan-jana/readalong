import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Context, Hono } from 'hono';
import type { LibraryItem } from '../../../shared/types.ts';
import { LIBRARY, log, readJson } from '../../../shared/node/util.ts';
import { fileResponse, HttpError, inside } from '../../../server/http.ts';
import { busy, jobView, runningJob, startJob } from '../../jobs/server/jobs.ts';
import { deleteProject, exists, newProjectDir, projectDir, projects } from './library.ts';

/** A read-along's own files: page images, audio, narration.json, progress.json… */
export function projectFile(c: Context) {
  const rest = c.req.path.split('/').slice(3).join('/');
  const p = inside(projectDir(c.req.param('id')!), rest);
  return p ? fileResponse(c.req.raw, p) : c.text('Forbidden', 403);
}

function library(): LibraryItem[] {
  return projects().map(p => {
    const run = runningJob(p.id, 'narrate') || runningJob(p.id, 'ai');
    let pages: number | null = null, minutes: number | null = null;
    try { pages = readJson<unknown[]>(path.join(p.path, 'pages.json')).length; } catch { /* not rendered */ }
    if (p.narrated) {
      try { minutes = Math.round(readJson<{ tracks: { dur: number }[] }>(path.join(p.path, 'narration.json')).tracks.reduce((s, t) => s + t.dur, 0) / 60); } catch { /* none */ }
    }
    const thumb = fs.existsSync(path.join(p.path, 'pages', '001.jpg')) ? `/p/${p.id}/pages/001.jpg` : null;
    return { id: p.id, title: p.title, narrated: p.narrated && !run, pages, minutes, thumb, updated: p.mtime / 1000, job: run ? jobView(run) : null };
  });
}

export function routes(app: Hono, { onDelete }: { onDelete?: (id: string) => void } = {}) {
  app.get('/p/:id', c => c.redirect(`/r/${encodeURIComponent(c.req.param('id'))}/play`));
  app.on(['GET', 'HEAD'], '/p/:id/*', projectFile);
  app.get('/api/library', c => c.json(library()));

  // add a PDF: an upload (the body) or a link ({ url }); reading it runs as a job
  app.post('/api/new', async c => {
    let src: string, name: string;
    if ((c.req.header('content-type') || '').startsWith('application/json')) {
      src = name = String((await c.req.json()).url || '').trim();
      if (!src) throw new HttpError(400, 'Paste a link to a PDF.');
    } else {
      name = decodeURIComponent(c.req.header('x-filename') || 'paper.pdf');
      src = path.join(LIBRARY, '.uploads', `${crypto.randomBytes(8).toString('hex')}.pdf`);
      fs.mkdirSync(path.dirname(src), { recursive: true });
      fs.writeFileSync(src, Buffer.from(await c.req.arrayBuffer()));
    }
    const out = newProjectDir(name);
    const pid = path.basename(out);
    const upload = src.startsWith(path.join(LIBRARY, '.uploads'));
    return c.json(startJob(pid, 'prepare', 'prepare', { src, out, ai: c.req.header('x-ai') === '1' }, s => {
      if (upload) fs.rmSync(src, { force: true });
      return { project: pid, summary: s };
    }));
  });

  app.post('/api/project/:id/delete', c => {
    const pid = c.req.param('id');
    if (!exists(pid)) throw new HttpError(404, 'No such read-along.');
    if (busy(pid)) throw new HttpError(409, "It's still being processed. Cancel that first.");
    onDelete?.(pid);
    deleteProject(pid);
    log(`deleted project ${pid}`);
    return c.json({ ok: true });
  });
}
