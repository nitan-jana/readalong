// The library: one folder per read-along in ~/readalong-library (or READALONG_LIBRARY):
//   source.pdf, doc.json (blocks), script.md (editable), pages/ + pages.json,
//   audio/ + narration.json (+ progress.json while narrating), .cache/ (sentence audio)
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY, readJson, slugify } from '../../../shared/node/util.ts';

export interface Entry { id: string; title: string; path: string; size: number; narrated: boolean; mtime: number }

/** The folder of a read-along; refuses names that would point outside the library. */
export function projectDir(id: string) {
  const d = path.resolve(LIBRARY, id);
  if (path.dirname(d) !== path.resolve(LIBRARY)) throw new Error('bad project id');
  return d;
}

export const exists = (id: string) => fs.existsSync(path.join(projectDir(id), 'doc.json'));

/** Folder for a new read-along from a file name or URL (made unique if taken). */
export function newProjectDir(src: string) {
  const name = path.basename(src.replace(/[?#].*$/, '')).replace(/\.pdf$/i, '') || 'paper';
  const base = path.join(LIBRARY, slugify(name));
  let out = base, n = 2;
  while (fs.existsSync(out)) out = `${base}-${n++}`;
  return out;
}

export function title(id: string) {
  try { return readJson(path.join(projectDir(id), 'doc.json')).title || id; } catch { return id; }
}

/** Narrated to the end (not just partly)? */
export function finished(dir: string) {
  try { return !readJson(path.join(dir, 'narration.json')).partial; } catch { return false; }
}

export function dirSize(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

/** Every read-along, most recently changed first. */
export function projects(): Entry[] {
  if (!fs.existsSync(LIBRARY)) return [];
  return fs.readdirSync(LIBRARY, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(LIBRARY, d.name, 'doc.json')))
    .map(d => {
      const dir = path.join(LIBRARY, d.name);
      return { id: d.name, title: title(d.name), path: dir, size: dirSize(dir), narrated: finished(dir), mtime: fs.statSync(dir).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function deleteProject(id: string) {
  if (!exists(id)) throw new Error(`No read-along named '${id}' in ${LIBRARY}.`);
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}
