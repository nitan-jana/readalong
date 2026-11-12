import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import type { Narration, Page, PlayerData } from '../../../shared/types.ts';
import { readJson } from '../../../shared/node/util.ts';
import { HttpError } from '../../../server/http.ts';
import { projectDir, title } from '../../library/server/library.ts';

/** The player's data: title, page images and the narration so far, with URLs the browser can use. */
export function playData(pid: string): PlayerData {
  const d = projectDir(pid);
  if (!fs.existsSync(path.join(d, 'pages.json'))) throw new HttpError(404, 'No such read-along.');
  const base = `/p/${encodeURIComponent(pid)}/`;
  let narr: Narration = { utts: [], tracks: [], partial: false };
  try { narr = readJson<Narration>(path.join(d, 'narration.json')); } catch { /* not narrated yet */ }
  return { title: title(pid), ...narr, pages: readJson<Page[]>(path.join(d, 'pages.json')).map(p => ({ ...p, src: base + p.src })),
    tracks: narr.tracks.map(t => ({ ...t, src: base + t.src })) };
}

export function routes(app: Hono) {
  app.get('/api/play/:id', c => c.json(playData(c.req.param('id'))));
}
