// The steps commands and the wizard share: extract, load a voice, narrate, open the player.
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { LIBRARY, which } from '../shared/node/util.ts';
import { prepare } from '../features/library/server/add.ts';
import { newProjectDir, projectDir } from '../features/library/server/library.ts';
import { narrateProject } from '../features/narration/server/narrate.ts';
import { Engine } from '../features/voice/server/tts.ts';
import { openInBrowser } from '../server/http.ts';
import { bar, showSummary } from './term.ts';

export interface Opts {
  ai?: boolean; 'ai-model'?: string; 'keep-backmatter'?: boolean; voice?: string; speed?: string;
  review?: boolean; 'no-open'?: boolean; port?: string; 'no-browser'?: boolean;
  samples?: string; lang?: string; text?: string; yes?: boolean; help?: boolean;
}

export const hasClaude = () => !!(process.env.READALONG_CLAUDE || which('claude'));

/** A read-along in the library, by name (or its folder path). */
export function projectArg(name: string | undefined, usage: string) {
  if (!name) throw new Error(`Usage: ${usage}`);
  const id = path.basename(path.resolve(name));
  const dir = projectDir(id);
  if (!fs.existsSync(path.join(dir, 'doc.json'))) throw new Error(`No read-along named '${id}' in ${LIBRARY}. See \`readalong list\`.`);
  return { id, dir };
}

export async function doExtract(source: string, opts: Opts) {
  const out = newProjectDir(source);
  let ai = !!opts.ai;
  if (ai && !hasClaude()) { console.log(pc.yellow("The `claude` CLI isn't installed, so skipping the AI cleanup.")); ai = false; }
  const b = bar('Extracting' + (ai ? ' + AI cleanup' : ''));
  b.update(0, 1, true);
  let s;
  try {
    s = await prepare(source, out, { keepBackmatter: !!opts['keep-backmatter'], ai, aiModel: opts['ai-model'], progress: (d, t) => b.update(d, t + 1) });
  } catch (e) { b.fail(); throw e; }
  b.done();
  if (s.ai?.errors?.length) console.log(pc.yellow(`Some AI batches failed and kept the rule-based result: ${s.ai.errors[0]}`));
  showSummary(s, out);
  return out;
}

async function engineFrom(opts: Opts) {
  const voice = opts.voice || 'af_heart', speed = Number(opts.speed) || 1;
  const sp = p.spinner();
  sp.start('Loading the voice model (the first run downloads about 340 MB)');
  let eng: Engine;
  try {
    eng = await Engine.create({ voice, speed }, (name, got, total) => {
      if (total) sp.message(`Downloading the ${name} file: ${Math.round((100 * got) / total)}%`);
    });
  } catch (e) { sp.error('Could not load the voice model'); throw e; }
  sp.stop(`Voice: ${pc.bold(voice)} · speed ${speed} · running on ${eng.device}`);
  return eng;
}

/** Narrate a read-along folder in this process, with a progress bar. Returns its name. */
export async function doSpeak(dir: string, opts: Opts) {
  const eng = await engineFrom(opts);
  const b = bar('Narrating');
  const id = path.basename(dir);
  try {
    await narrateProject(dir, eng, {
      progress: (d, t) => b.update(d, t),
      trackReady: n => { if (n === 1) b.note(`First part ready: ${pc.bold(`readalong play ${id}`)} to start listening; new parts appear as they're narrated.`); },
    });
  } catch (e) { b.fail(); throw e; }
  b.done();
  p.note(`${pc.green(pc.bold('Done.'))} Listen: ${pc.bold(`readalong play ${id}`)} (or open it in ${pc.bold('readalong ui')})\nShare to your phone: ${pc.bold(`readalong serve ${id}`)}`, 'Read-along ready');
  return id;
}

/** Open the player for a read-along: in the running app if there is one, otherwise start the app. */
export async function play(id: string, port = 8765) {
  const { runningAt, runUi } = await import('../server/app.ts');
  const hash = `#/play/${encodeURIComponent(id)}`;
  if (await runningAt(port)) { await openInBrowser(`http://127.0.0.1:${port}/${hash}`); return; }
  await runUi({ port, open: hash });
  await new Promise(() => {});
}
