// script.md: the editable review file between extraction and narration.
import fs from 'node:fs';
import { cleanForSpeech } from './extract.ts';
import type { Doc } from './types.ts';

const HEADER = `<!--
  readalong script: this is what will be read aloud. Edit freely, then run \`readalong speak <name>\`.
  * Each block starts with a marker like <!-- b12 keep p3 -->. Don't edit the markers except the keep/skip word.
  * Change "keep" to "skip" to leave a block out, or "skip" to "keep" to bring it back.
  * Edit the text under a marker to change what is said (the PDF highlight still follows the original words).
-->
`;
const MARK = /^<!-- b(\d+) (keep|skip)\b[^>]*-->\s*$/gm;

export function writeScript(doc: Doc, file: string) {
  const parts = [HEADER, `# ${doc.title}\n`];
  for (const b of doc.blocks) {
    let note = ` p${b.page + 1}` + (b.kind === 'h' ? ' heading' : b.kind === 'cap' ? ' caption' : '');
    if (!b.keep) note += `: ${b.reason}`;
    parts.push(`<!-- b${b.id} ${b.keep ? 'keep' : 'skip'}${note} -->\n${b.keep ? b.speech : b.text}\n`);
  }
  fs.writeFileSync(file, parts.join('\n'), 'utf8');
}

export function readScript(doc: Doc, file: string) {
  const src = fs.readFileSync(file, 'utf8');
  const byId = new Map(doc.blocks.map(b => [b.id, b]));
  const marks = [...src.matchAll(MARK)];
  marks.forEach((m, i) => {
    const b = byId.get(Number(m[1]));
    if (!b) return;
    const end = i + 1 < marks.length ? marks[i + 1].index! : src.length;
    const text = src.slice(m.index! + m[0].length, end).trim();
    b.keep = m[2] === 'keep';
    if (b.keep) b.speech = cleanForSpeech(text.replace(/\s+/g, ' ')) || b.speech;
  });
  return doc;
}
