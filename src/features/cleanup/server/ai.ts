// Optional cleanup with a cheap model through the local `claude` CLI (Claude Code).
// For each block the model decides keep/skip and rewrites the text so it sounds right read aloud.
// READALONG_CLAUDE points at a different executable (handy for testing).
import { spawn } from 'node:child_process';
import { which, errorMessage } from '../../../shared/node/util.ts';
import type { Doc, DocBlock } from '../../pdf/server/types.ts';

const SYSTEM = `You prepare text extracted from a PDF for a text-to-speech narrator.
You get a JSON list of blocks in reading order. Each block has: id, page, pos (where it sits on the page),
size (font size relative to body text, 1.0 = body), kind (p paragraph, h heading, cap caption),
heuristic (what a rule-based filter guessed: keep, or skip with a reason), and text.

For every block return {"id", "keep", "reason", "speech"}:
- keep=false for anything a listener would not want read: running headers/footers, page numbers,
  journal/publisher boilerplate (received/accepted dates, copyright, licence, editor, citation lines, DOIs),
  author affiliations and emails, text that belongs inside figures or tables, equation fragments, footnote
  markers, reference-list entries, and leftovers of broken extraction. Keep the title, author names,
  abstract, headings, body paragraphs, list items and figure/table captions.
- In the title, drop a leading article-type label such as "Review", "Article", "Research Article" or "Perspective".
- reason: one of: "header/footer", "page number", "publisher boilerplate", "affiliation", "metadata",
  "figure/table text", "footnote", "equation", "references", "back matter", "extraction junk", "other".
- speech: the block's text made pleasant to hear, staying faithful. Do NOT summarise, shorten or add content.
  Only: drop citation markers like [12] or (Smith et al., 2020); drop URLs and DOIs; expand abbreviations
  and symbols the way a narrator would say them (e.g. -> for example, i.e. -> that is, et al. -> and colleagues,
  % -> percent, p < .05 -> p less than point oh five, χ² -> chi-squared, ~ -> about); read simple math
  in words; fix words broken by hyphenation or extraction. If keep=false, speech may be "".
Return only {"blocks": [...]} with one entry per input id, in order.`;

const REASONS = ['header/footer', 'page number', 'publisher boilerplate', 'affiliation', 'metadata', 'figure/table text',
  'footnote', 'equation', 'references', 'back matter', 'extraction junk', 'other', ''];
const SCHEMA = { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object',
  required: ['id', 'keep', 'speech'], properties: { id: { type: 'integer' }, keep: { type: 'boolean' },
    reason: { type: 'string', enum: REASONS }, speech: { type: 'string' } } } } } };

export interface CleanupStats { batches: number; failed: number; changed_keep: number; cost_usd: number; errors: string[] }
interface Reply { id: number; keep: boolean; reason?: string; speech?: string }

export function claudePath() {
  return process.env.READALONG_CLAUDE || which('claude');
}

function runClaude(exe: string, model: string, message: string): Promise<{ blocks: Reply[]; cost: number }> {
  // No quoting-sensitive arguments: the instructions travel in stdin (claude.cmd on Windows mangles quotes).
  const args = ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--no-session-persistence',
    '--system-prompt', 'You prepare PDF text for a narrator. Follow the instructions in the message. Reply with JSON only.'];
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe), windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d: Buffer) => (out += d));
    p.stderr.on('data', (d: Buffer) => (err += d));
    p.on('error', reject);
    p.on('close', code => {
      try {
        const env = JSON.parse(out);
        if (env.is_error) return reject(new Error(env.result || `claude exited with ${code}`));
        let data = env.structured_output;
        if (!data) { const m = String(env.result || '').match(/\{[\s\S]*\}/); data = m ? JSON.parse(m[0]) : {}; }
        resolve({ blocks: data.blocks || [], cost: env.total_cost_usd || 0 });
      } catch (e) { reject(new Error(`claude: ${err.trim() || out.slice(0, 200) || errorMessage(e)}`)); }
    });
    p.stdin.end(message);
  });
}

const posOf = (b: DocBlock, pages: Doc['pages']) => {
  const [w, h] = pages[b.page];
  const [x0, y0, x1, y1] = b.bbox;
  const v = y1 < h * 0.12 ? 'top' : y0 > h * 0.88 ? 'bottom' : 'middle';
  const hz = x1 - x0 > w * 0.6 ? 'full-width' : x1 < w * 0.55 ? 'left' : 'right';
  return `${v} ${hz}`;
};

/** Refine keep/skip and speech text in place. progress(doneBatches, totalBatches). */
export async function refine(doc: Doc, { model = 'haiku', batch = 40, workers = 4, progress }: {
  model?: string; batch?: number; workers?: number; progress?: (done: number, total: number) => void;
} = {}): Promise<CleanupStats> {
  const exe = claudePath();
  if (!exe) throw new Error('The `claude` CLI was not found. Install Claude Code and sign in, or skip the AI cleanup.');
  const sizes = doc.blocks.map(b => b.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  const items = doc.blocks.map(b => ({ id: b.id, page: b.page + 1, pos: posOf(b, doc.pages), size: Math.round(b.size / body * 100) / 100,
    kind: b.kind, heuristic: b.keep ? 'keep' : `skip: ${b.reason}`, text: b.text }));
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += batch) batches.push(items.slice(i, i + batch));
  const stats: CleanupStats = { batches: batches.length, failed: 0, changed_keep: 0, cost_usd: 0, errors: [] };
  const byId = new Map(doc.blocks.map(b => [b.id, b]));
  let done = 0, next = 0;
  const work = async () => {
    while (next < batches.length) {
      const chunk = batches[next++];
      const msg = `${SYSTEM}\n\nJSON schema of your reply:\n${JSON.stringify(SCHEMA)}\n\nBlocks:\n${JSON.stringify(chunk)}`;
      try {
        const { blocks, cost } = await runClaude(exe, model, msg);
        stats.cost_usd += cost;
        for (const r of blocks) {
          const b = byId.get(r.id);
          if (!b) continue;
          const keep = !!r.keep;
          let speech = String(r.speech || '').trim();
          if (keep && b.kind === 'p' && speech.length < 0.6 * b.speech.length) speech = b.speech; // never accept a summary
          if (keep !== b.keep) stats.changed_keep++;
          b.keep = keep;
          b.reason = keep ? '' : (r.reason || 'other');
          if (keep && speech) b.speech = speech;
        }
      } catch (e) {
        stats.failed++;
        stats.errors.push(errorMessage(e).slice(0, 200)); // this batch keeps the rule-based result
      }
      progress?.(++done, batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, batches.length) }, work));
  return stats;
}
