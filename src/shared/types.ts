// Shapes shared by the server, the app and the player. Coordinates are PDF points, origin top-left.

/** A rendered page image and its size in points. */
export interface Page { src: string; w: number; h: number }

/** [page, x0, y0, x1, y1] */
export type Box = [number, number, number, number, number];

/** One spoken word: [start s, end s, indexes into Utt.wb, 1 if it ends a phrase] (times within its track). */
export type Word = [number, number, number[], 0 | 1];

/** One utterance: a heading or paragraph as narrated. */
export interface Utt {
  k: 'h' | 'p' | 'cap' | string; // kind
  tr: number;                    // track index
  t: number; e: number;          // start and end within the track, seconds
  b: Box[];                      // the blocks it was read from
  wb: Box[];                     // printed word boxes
  w: Word[];
  x: string;                     // heading text for the contents menu ('' otherwise)
}

export interface Track { src: string; dur: number }

export interface Narration { utts: Utt[]; tracks: Track[]; partial?: boolean; expected?: number }

export interface PlayerData extends Narration { title: string; pages: Page[] }

export interface Summary {
  title: string; pages: number; blocks: number; kept: number; chars: number; minutes: number;
  skipped: Record<string, number>;
}

export interface Block {
  id: number; page: number; bbox: [number, number, number, number];
  kind: string; keep: boolean; reason: string; text: string; speech: string;
}

export interface Project {
  id: string; title: string; pages: Page[]; blocks: Block[]; summary: Summary; narrated: boolean;
  running: { narrate: string | null; ai: string | null };
}

export type JobKind = 'prepare' | 'ai' | 'narrate';

export interface Job {
  id: string; project: string; kind: JobKind; title: string;
  state: 'running' | 'done' | 'error' | 'cancelled' | 'missing';
  done: number; total: number; fraction: number; eta_s: number | null;
  started: number; ended: number | null; error: string | null;
  result: any;
}

export interface LibraryItem {
  id: string; title: string; narrated: boolean; pages: number | null; minutes: number | null;
  thumb: string | null; updated: number; job: Job | null;
}

export interface Voice { name: string; desc: string; lang: string }

export interface Env { claude: boolean }
