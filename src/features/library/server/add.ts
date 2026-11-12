// Adding a PDF: fetch or copy it, extract what to read, optionally clean up with AI, render the pages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extract } from '../../pdf/server/extract.ts';
import { renderPages } from '../../pdf/server/pdf.ts';
import { saveDoc, summary } from '../../pdf/server/document.ts';
import type { CleanupStats } from '../../cleanup/server/ai.ts';

export async function fetchPdf(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (readalong)' }, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
      throw new Error("That URL didn't return a PDF. Open it in a browser, download the PDF, and use the file.");
    }
    fs.writeFileSync(dest, buf);
  } else {
    const p = src.replace(/^~(?=$|[\\/])/, os.homedir());
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
    if (path.resolve(p) !== path.resolve(dest)) fs.copyFileSync(p, dest);
  }
  return dest;
}

export interface PrepareOptions {
  keepBackmatter?: boolean; ai?: boolean; aiModel?: string;
  progress?: (done: number, total: number) => void;
}

/** Fetch the PDF into `out`, extract text, optionally run the AI pass, render pages. */
export async function prepare(src: string, out: string, { keepBackmatter = false, ai = false, aiModel = 'haiku', progress }: PrepareOptions = {}) {
  fs.mkdirSync(out, { recursive: true });
  const pdf = await fetchPdf(src, path.join(out, 'source.pdf'));
  const doc = await extract(pdf, { keepBackmatter });
  let stats: CleanupStats | null = null;
  if (ai) {
    const { refine } = await import('../../cleanup/server/ai.ts');
    stats = await refine(doc, { model: aiModel, progress });
  }
  saveDoc(doc, out);
  const pages = await renderPages(pdf, out);
  fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify(pages));
  return { ...summary(doc), ai: stats };
}
