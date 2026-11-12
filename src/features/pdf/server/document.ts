// A read-along's document on disk: doc.json (blocks) plus script.md (the editable copy, which wins).
import fs from 'node:fs';
import path from 'node:path';
import type { Summary } from '../../../shared/types.ts';
import { readJson } from '../../../shared/node/util.ts';
import { utterances } from './extract.ts';
import { readScript, writeScript } from './script.ts';
import type { Doc } from './types.ts';

export function saveDoc(doc: Doc, dir: string) {
  fs.writeFileSync(path.join(dir, 'doc.json'), JSON.stringify(doc));
  writeScript(doc, path.join(dir, 'script.md'));
}

export function loadDoc(dir: string): Doc {
  const doc = readJson<Doc>(path.join(dir, 'doc.json'));
  if (fs.existsSync(path.join(dir, 'script.md'))) readScript(doc, path.join(dir, 'script.md'));
  return doc;
}

export function summary(doc: Doc): Summary {
  const kept = doc.blocks.filter(b => b.keep).length;
  const chars = utterances(doc).reduce((s, u) => s + u.text.length, 0);
  const skipped: Record<string, number> = {};
  for (const b of doc.blocks) if (!b.keep) skipped[b.reason] = (skipped[b.reason] || 0) + 1;
  return { title: doc.title, pages: doc.pages.length, blocks: doc.blocks.length, kept, skipped, chars,
    minutes: Math.round((chars / 15 / 60) * 10) / 10 }; // ~15 characters per second of speech
}
