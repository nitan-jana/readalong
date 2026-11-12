// Read a PDF with pdf.js: page images, and text as lines → blocks (paragraph-like) with per-word boxes.
// pdf.js gives text fragments in content order with positions and end-of-line marks; we rebuild
// lines and blocks from those (PyMuPDF did that for us in the Python version).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Page } from '../../../shared/types.ts';
import type { PrintedWord, RawBlock } from './types.ts';

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
// pdf.js wants folder "URLs" ending in '/'; in Node it reads them with fs, which accepts forward
// slashes on every OS (D:/x/y/ on Windows), so build them that way rather than with path.sep.
const dataDir = (name: string) => path.join(PDFJS_DIR, name).split(path.sep).join('/') + '/';
const round1 = (v: number) => Math.round(v * 10) / 10;
type Box = [number, number, number, number];

export async function openPdf(file: string) {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(file));
  return lib.getDocument({
    data, verbosity: 0, isEvalSupported: false,
    standardFontDataUrl: dataDir('standard_fonts'), cMapUrl: dataDir('cmaps'), cMapPacked: true,
    iccUrl: dataDir('iccs'), wasmUrl: dataDir('wasm'),
  } as Parameters<typeof lib.getDocument>[0]).promise;
}
type PdfDoc = Awaited<ReturnType<typeof openPdf>>;
type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>;

async function close(doc: PdfDoc) {
  await doc.loadingTask?.destroy?.();
}

/** Render every page to pages/NNN.jpg (≈1400 px wide). Returns [{ src, w, h }] in PDF points. */
export async function renderPages(file: string, outDir: string, { widthPx = 1400, quality = 78 } = {}): Promise<Page[]> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await openPdf(file);
  fs.mkdirSync(path.join(outDir, 'pages'), { recursive: true });
  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: widthPx / vp1.width });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
    const src = `pages/${String(n).padStart(3, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, src), await canvas.encode('jpeg', quality));
    pages.push({ src, w: vp1.width, h: vp1.height });
    page.cleanup();
  }
  await close(doc);
  return pages;
}

const dehyphenJoin = (lines: string[]) => {
  let out = '';
  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (!out) out = ln;
    else if (out.endsWith('-') && !out.endsWith(' -') && /^\p{Ll}/u.test(ln)) out = out.slice(0, -1) + ln;
    else out += ' ' + ln;
  }
  return out.replace(/\s+/g, ' ').trim();
};

function isBoldFont(page: PdfPage, fontName: string) {
  try {
    if (!page.commonObjs.has(fontName)) return false;
    const f = page.commonObjs.get(fontName) as { bold?: boolean; black?: boolean; name?: string } | null;
    return !!(f && (f.bold || f.black || /bold|black|heavy|semibold|demi/i.test(f.name || '')));
  } catch { return false; }
}

interface Char { c: string; x0: number; x1: number }
interface Line {
  x0: number; x1: number; top: number; bottom: number; base: number; size: number; bold: boolean;
  sizes: Record<string, number>; boldChars: number; chars: Char[]; text: string;
}

/** Lines of one page, each with its characters' horizontal positions. */
async function pageLines(page: PdfPage) {
  await page.getOperatorList(); // loads fonts, so bold can be read from their names
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent({ includeMarkedContent: false });
  const lines: Line[] = [];
  let cur: Line | null = null, prevEOL = true;
  const closeLine = () => { if (cur && cur.chars.some(ch => ch.c.trim())) lines.push(cur); cur = null; };
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const [a, b, c, d, e, f] = it.transform as number[];
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) { if (it.hasEOL) prevEOL = true; continue; } // rotated text
    const size = Math.abs(d) || Math.abs(a);
    const [x, base] = vp.convertToViewportPoint(e, f);
    const str = it.str.normalize('NFKC');
    const w = it.width * (vp.width / page.view[2] || 1);
    if (str.length) {
      const breakLine: boolean = !cur || prevEOL || Math.abs(base - cur.base) > 0.5 * size || x < cur.x1 - size || x > cur.x1 + 3.5 * size;
      if (breakLine || !cur) {
        closeLine();
        cur = { x0: x, x1: x, base, size, top: base - 0.8 * size, bottom: base + 0.22 * size, bold: false, sizes: {}, boldChars: 0, chars: [], text: '' };
      } else if (x > cur.x1 + 0.12 * size && !/\s$/.test(cur.chars.at(-1)?.c || ' ') && !/^\s/.test(str)) {
        cur.chars.push({ c: ' ', x0: cur.x1, x1: x }); // a visible gap between fragments is a space
      }
      const line: Line = cur;
      const cw = w / Math.max(1, [...str].length);
      [...str].forEach((ch, i) => line.chars.push({ c: ch, x0: x + i * cw, x1: x + (i + 1) * cw }));
      line.x1 = Math.max(line.x1, x + w);
      line.top = Math.min(line.top, base - 0.8 * size);
      line.bottom = Math.max(line.bottom, base + 0.22 * size);
      const n = str.replace(/\s/g, '').length;
      line.sizes[size.toFixed(1)] = (line.sizes[size.toFixed(1)] || 0) + n;
      if (n && isBoldFont(page, it.fontName)) line.boldChars += n;
    }
    prevEOL = !!it.hasEOL;
  }
  closeLine();
  for (const l of lines) {
    const tot = Object.values(l.sizes).reduce((s, v) => s + v, 0) || 1;
    l.size = Number(Object.entries(l.sizes).sort((p, q) => q[1] - p[1])[0][0]);
    l.bold = l.boldChars / tot > 0.6;
    l.text = l.chars.map(ch => ch.c).join('').replace(/\s+/g, ' ').trim();
  }
  return { lines, width: vp.width, height: vp.height };
}

/** Group consecutive lines into blocks: a new block on a size/boldness change, a vertical gap,
 * a column change, or a first-line indent after a finished sentence. */
function linesToBlocks(lines: Line[]): Omit<RawBlock, 'page'>[] {
  interface B { lines: Line[]; x0: number; x1: number; top: number; bottom: number; size: number; bold: boolean }
  const blocks: B[] = [];
  let b: B | null = null;
  for (const l of lines) {
    let start = !b;
    if (b) {
      const last = b.lines.at(-1)!;
      const gap = l.top - last.bottom;
      const overlap = Math.min(l.x1, b.x1) - Math.max(l.x0, b.x0);
      const sizeJump = Math.abs(l.size - b.size) > 0.15 * b.size;
      const indent = l.x0 > b.x0 + 0.8 * l.size && /[.!?:"”)]$/.test(last.text) && b.lines.length > 1;
      start = sizeJump || l.bold !== b.bold || gap > 0.5 * l.size || gap < -1.5 * l.size || overlap < 0.3 * Math.min(l.x1 - l.x0, b.x1 - b.x0) || indent;
    }
    if (start || !b) {
      b = { lines: [], x0: l.x0, x1: l.x1, top: l.top, bottom: l.bottom, size: l.size, bold: l.bold };
      blocks.push(b);
    }
    b.lines.push(l);
    b.x0 = Math.min(b.x0, l.x0); b.x1 = Math.max(b.x1, l.x1);
    b.top = Math.min(b.top, l.top); b.bottom = Math.max(b.bottom, l.bottom);
  }
  return blocks.map(bl => {
    const sizes: Record<string, number> = {};
    for (const l of bl.lines) sizes[l.size] = (sizes[l.size] || 0) + l.text.length;
    return {
      bbox: [bl.x0, bl.top, bl.x1, bl.bottom].map(round1) as Box,
      lines: bl.lines.map(l => l.text),
      text: dehyphenJoin(bl.lines.map(l => l.text)),
      size: Number(Object.entries(sizes).sort((p, q) => q[1] - p[1])[0][0]),
      bold: bl.bold,
      words: blockWords(bl.lines),
    };
  });
}

/** Words with boxes, in reading order; a word hyphenated across lines becomes one word with two boxes. */
function blockWords(lines: Line[]): PrintedWord[] {
  interface W { text: string; x0: number; x1: number; line: number; top: number; bottom: number }
  const out: W[] = [];
  lines.forEach((l, li) => {
    let w: W | null = null;
    for (const ch of l.chars) {
      if (!ch.c.trim()) { if (w) out.push(w); w = null; continue; }
      w ??= { text: '', x0: ch.x0, x1: ch.x1, line: li, top: l.top, bottom: l.bottom };
      w.text += ch.c; w.x1 = ch.x1;
    }
    if (w) out.push(w);
  });
  const merged: (PrintedWord & { line: number })[] = [];
  for (const w of out) {
    const box = [w.x0, w.top, w.x1, w.bottom].map(round1) as Box;
    const prev = merged.at(-1);
    if (prev && prev.text.endsWith('-') && prev.line !== w.line && /^\p{Ll}/u.test(w.text) && prev.boxes.length === 1) {
      prev.text = prev.text.slice(0, -1) + w.text; prev.boxes.push(box); prev.line = w.line; continue;
    }
    merged.push({ text: w.text, boxes: [box], line: w.line });
  }
  return merged.map(({ text, boxes }) => ({ text, boxes }));
}

/** All raw blocks of a PDF, in content order per page, plus page sizes and the title from metadata. */
export async function readText(file: string) {
  const doc = await openPdf(file);
  const meta = await doc.getMetadata().catch(() => null);
  const pages: [number, number][] = [], blocks: RawBlock[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { lines, width, height } = await pageLines(page);
    pages.push([width, height]);
    for (const b of linesToBlocks(lines)) blocks.push({ page: n - 1, ...b });
    page.cleanup();
  }
  await close(doc);
  const info = meta?.info as { Title?: string } | undefined;
  return { title: info?.Title || '', pages, blocks };
}
