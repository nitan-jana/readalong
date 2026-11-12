// Small Node-side helpers: where things live, logging, atomic writes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Your read-alongs, one folder each. */
export const LIBRARY = process.env.READALONG_LIBRARY || path.join(os.homedir(), 'readalong-library');

/** Log file in the folder the command was started from. */
export const LOG = process.env.READALONG_LOG || path.join(process.cwd(), 'readalong.log');

/** The repository root (for the built app in dist/). */
export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

export function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  try { fs.appendFileSync(LOG, `[${ts}] ${msg}\n`); } catch { /* logging must never break the app */ }
}

/** Find an executable on PATH (with Windows extensions), or null. */
export function which(name: string): string | null {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      for (const cand of [path.join(dir, name + ext), path.join(dir, name + ext.toLowerCase())]) {
        try { if (fs.statSync(cand).isFile()) return cand; } catch { /* keep looking */ }
      }
    }
  }
  return null;
}

export function slugify(s: string) {
  return (s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'paper').toLowerCase();
}

/** Write JSON atomically: a reader never sees a half-written file. */
export function writeJsonAtomic(file: string, data: unknown) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export const readJson = <T = any>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
