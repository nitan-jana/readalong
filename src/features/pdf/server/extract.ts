// Decide what to read aloud. Plain heuristics, no network: the optional AI pass (features/cleanup) refines them.
import { readText } from './pdf.ts';
import type { Doc, DocBlock, RawBlock } from './types.ts';

export interface Utterance { kind: DocBlock['kind']; text: string; blocks: number[] }

const BACK_MATTER = /^(?:\d+\.?\s*)?(references|bibliography|works cited|literature cited|acknowledg(e)?ments?|author contributions|funding|conflicts? of interest|competing interests|data availability( statement)?|institutional review board statement|informed consent statement|abbreviations|appendix [a-z]?|supplementary materials)\s*:?\s*$/i;
const STOP_SECTIONS = /^(?:\d+\.?\s*)?(references|bibliography|works cited|literature cited)\s*$/i;
const CAPTION = /^(fig(ure)?\.?|table|scheme|chart|box)\s*[A-Z]?\d+[.:]/i;
const BOILERPLATE = /^(received|accepted|published|revised|academic editor|copyright|citation|licensee|correspondence|e-?mail|https?:\/\/|doi:|www\.|keywords?:|\*?\s*correspondence|this article is an open access)/i;

/** Order blocks for 1- or 2-column pages: top to bottom, and between full-width blocks, left column first. */
function readingOrder(blocks: RawBlock[], width: number) {
  const mid = width / 2, tol = width * 0.04;
  const col = (b: RawBlock) => (b.bbox[2] <= mid + tol ? 0 : b.bbox[0] >= mid - tol ? 1 : -1);
  const sorted = [...blocks].sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  const ordered: RawBlock[] = [];
  let band: RawBlock[] = [];
  const flush = () => { band.sort((a, b) => col(a) - col(b) || a.bbox[1] - b.bbox[1]); ordered.push(...band); band = []; };
  for (const b of sorted) { if (col(b) === -1) { flush(); ordered.push(b); } else band.push(b); }
  flush();
  return ordered;
}

const mostCommon = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

export async function extract(pdfPath: string, { keepBackmatter = false } = {}): Promise<Doc> {
  const { title: metaTitle, pages, blocks: rawAll } = await readText(pdfPath);
  const raw: RawBlock[] = [];
  for (let p = 0; p < pages.length; p++) raw.push(...readingOrder(rawAll.filter(b => b.page === p), pages[p][0]));

  const sizeChars: Record<string, number> = {};
  for (const b of raw) sizeChars[b.size] = (sizeChars[b.size] || 0) + b.text.length;
  const body = Number(mostCommon(sizeChars)) || 10;

  // running headers/footers: text near the page edge that repeats across pages
  const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '#').trim();
  const nearEdge = (b: RawBlock) => b.bbox[1] < pages[b.page][1] * 0.08 || b.bbox[3] > pages[b.page][1] * 0.93;
  const edgeCounts: Record<string, number> = {};
  for (const b of raw) if (nearEdge(b)) edgeCounts[norm(b.text)] = (edgeCounts[norm(b.text)] || 0) + 1;
  const repeatMin = Math.max(2, Math.floor(pages.length * 0.3));

  const doc: Doc = { title: metaTitle || '', pages, blocks: [] };
  let inBack = false, stopped = false;
  raw.forEach((b, i) => {
    const t = b.text, size = b.size;
    const blk: DocBlock = { id: i, page: b.page, bbox: b.bbox, text: t, size, bold: b.bold, kind: 'p', keep: true, reason: '', speech: '', words: b.words };
    const short = t.length < 120 && b.lines.length <= 3;
    if (CAPTION.test(t)) blk.kind = 'cap';
    else if (short && (size >= body * 1.12 || (b.bold && size >= body * 0.95)) && !/[,;]$/.test(t)) blk.kind = 'h';

    if (blk.kind === 'h' && STOP_SECTIONS.test(t)) stopped = true;
    if (blk.kind === 'h' && BACK_MATTER.test(t)) inBack = true;
    else if (blk.kind === 'h' && inBack && !stopped && /^\d+\.?\s+\w/.test(t)) inBack = false;

    const skip = (reason: string) => { blk.keep = false; blk.reason = reason; };
    if (/^[\divxlc\s\-–|/.]+$/i.test(t)) skip('page number');
    else if (nearEdge(b) && (edgeCounts[norm(t)] || 0) >= repeatMin) skip('running header/footer');
    else if (stopped) skip('references');
    else if (inBack && !keepBackmatter) skip('back matter');
    else if (BOILERPLATE.test(t)) skip('publisher boilerplate');
    else if (blk.kind !== 'cap' && size < body * 0.85) skip('small print (footnote, figure text or affiliation)');
    else if (blk.kind === 'p' && b.lines.length >= 4 && b.lines.reduce((s, x) => s + x.length, 0) / b.lines.length < 22) skip('table or figure text');
    else if (blk.kind === 'p' && t.length < 25 && !/[.!?:]$/.test(t)) skip('fragment');
    doc.blocks.push(blk);
  });

  if (!doc.title) {
    const first = doc.blocks.filter(b => b.page === 0);
    if (first.length) doc.title = first.reduce((m, b) => (b.size > m.size || (b.size === m.size && b.bbox[1] < m.bbox[1]) ? b : m)).text.slice(0, 200);
  }
  const titleBlock = doc.blocks.find(b => b.page === 0 && b.text === doc.title);
  if (titleBlock) Object.assign(titleBlock, { kind: 'h', keep: true, reason: '' });
  for (const b of doc.blocks) b.speech = cleanForSpeech(b.text);
  return doc;
}

const ABBREV: [RegExp, string][] = [
  [/\be\.g\.,?/g, 'for example,'], [/\bi\.e\.,?/g, 'that is,'], [/\bet al\./g, 'and colleagues'],
  [/\bcf\./g, 'compare'], [/\bvs\./g, 'versus'], [/\bFig\./g, 'Figure'], [/\bFigs\./g, 'Figures'],
  [/\bEq\./g, 'Equation'], [/\bapprox\./g, 'approximately'], [/\bresp\./g, 'respectively'],
  [/%/g, ' percent'], [/\s*&\s*/g, ' and '], [/≈/g, ' approximately '], [/±/g, ' plus or minus '],
  [/≤/g, ' less than or equal to '], [/≥/g, ' greater than or equal to '], [/×/g, ' times '],
];

export function cleanForSpeech(t: string) {
  t = t.replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '');                           // [12], [3,4], [5–9]
  t = t.replace(/\((?:[A-Z][^()]{0,80}?(?:19|20)\d\d[a-z]?(?:;\s*)?)+\)/g, '');       // (Smith et al., 2020; ...)
  t = t.replace(/https?:\/\/\S+|www\.\S+|doi:\s*\S+/g, '');
  for (const [re, rep] of ABBREV) t = t.replace(re, rep);
  t = t.replace(/\s+([.,;:!?])/g, '$1').replace(/\(\s*\)/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Group kept blocks into things to say. A paragraph that runs across a column or page break
 * (no closing punctuation, next block starts lowercase) becomes one utterance with several blocks. */
export function utterances(doc: Doc): Utterance[] {
  const out: Utterance[] = [];
  for (const b of doc.blocks) {
    if (!b.keep || !b.speech.trim()) continue;
    const prev = out.at(-1);
    if (prev && prev.kind === 'p' && b.kind === 'p' && !/[.!?:"”)]$/.test(prev.text) && /^\p{Ll}/u.test(b.speech)) {
      prev.text += ' ' + b.speech; prev.blocks.push(b.id); continue;
    }
    out.push({ kind: b.kind, text: b.speech, blocks: [b.id] });
  }
  for (const u of out) if (u.kind === 'h' && !/[.!?:]$/.test(u.text)) u.text += '.';
  return out;
}
