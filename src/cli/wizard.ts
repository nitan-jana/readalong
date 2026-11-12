// `readalong` with no command: a guided run, step by step.
import path from 'node:path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { describe } from '../features/voice/server/kokoro.ts';
import { COMMANDS } from './commands.ts';
import { open } from './term.ts';
import { doExtract, doSpeak, hasClaude, play } from './steps.ts';

const PICKS = ['af_heart', 'af_bella', 'af_nicole', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_george', 'bm_fable'];

export async function wizard() {
  p.intro(`${pc.bold('readalong')}: turn a PDF into a narrated read-along`);
  const mode = await p.select({ message: 'How do you want to work?', options: [
    { value: 'cli', label: 'Here in the terminal' }, { value: 'ui', label: 'In the browser app', hint: 'readalong ui' }] });
  if (p.isCancel(mode)) return p.cancel('Stopped.');
  if (mode === 'ui') return COMMANDS.ui([], {});

  const src = await p.text({ message: 'PDF file or URL', validate: v => (v?.trim() ? undefined : 'Paste a path or a link') });
  if (p.isCancel(src)) return p.cancel('Stopped.');
  let ai: boolean | symbol = false;
  if (hasClaude()) {
    ai = await p.confirm({ message: 'Clean up the text with Claude Haiku (via your claude CLI; a few cents)?', initialValue: true });
    if (p.isCancel(ai)) return p.cancel('Stopped.');
  }
  const out = await doExtract(src.trim().replace(/^["']|["']$/g, ''), { ai: ai as boolean, 'ai-model': 'haiku' });

  const review = await p.confirm({ message: 'Review or edit the script before narrating?', initialValue: false });
  if (p.isCancel(review)) return p.cancel('Stopped.');
  if (review) {
    await open(path.join(out, 'script.md'));
    await p.text({ message: 'Edit, save, then press Enter', defaultValue: '' });
  }

  let voice: string | symbol = await p.select({ message: 'Voice', options: [
    ...PICKS.map(n => ({ value: n, label: n, hint: describe(n) })), { value: '', label: 'Other…', hint: 'any voice name or a blend' }] });
  if (p.isCancel(voice)) return p.cancel('Stopped.');
  if (!voice) {
    voice = await p.text({ message: 'Voice name or blend, e.g. af_heart:0.6,bf_emma:0.4', defaultValue: 'af_heart', placeholder: 'af_heart' });
    if (p.isCancel(voice)) return p.cancel('Stopped.');
  }
  const speed = await p.text({ message: 'Speed', defaultValue: '1', placeholder: '1',
    validate: v => (!v || (Number(v) >= 0.5 && Number(v) <= 2) ? undefined : 'A number between 0.5 and 2') });
  if (p.isCancel(speed)) return p.cancel('Stopped.');

  const id = await doSpeak(out, { voice: voice as string, speed: speed || '1' });
  const sh = await p.confirm({ message: 'Share to your phone over Wi-Fi too?', initialValue: false });
  if (!p.isCancel(sh) && sh) {
    const { qrText, startShare } = await import('../features/sharing/server/share.ts');
    const url = await startShare(id);
    console.log(await qrText(url));
    console.log(`Scan with your phone (same Wi-Fi) or open ${pc.bold(url)}`);
  }
  p.outro('Opening the player. Enjoy listening.');
  await play(id);
}
