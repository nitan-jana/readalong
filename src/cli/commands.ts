// `readalong <command>`: each command, by name.
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { LIBRARY, LOG } from '../shared/node/util.ts';
import { deleteProject, dirSize, projects } from '../features/library/server/library.ts';
import { confirm, open, bar } from './term.ts';
import { doExtract, doSpeak, play, projectArg, type Opts } from './steps.ts';

type Command = (args: string[], o: Opts) => Promise<unknown>;

export const COMMANDS: Record<string, Command> = {
  async make([source], o) {
    if (!source) throw new Error('Usage: readalong make <pdf or url>');
    const out = await doExtract(source, o);
    if (o.review) {
      await open(path.join(out, 'script.md'));
      await p.text({ message: 'Edit the script, save it, then press Enter to start narrating', defaultValue: '' });
    }
    const id = await doSpeak(out, o);
    if (!o['no-open']) await play(id);
  },

  async extract([source], o) {
    if (!source) throw new Error('Usage: readalong extract <pdf or url>');
    const out = await doExtract(source, o);
    console.log(`Edit ${pc.bold(path.join(out, 'script.md'))} if you like, then run: ${pc.bold(`readalong speak ${path.basename(out)}`)}`);
  },

  async speak([name], o) {
    const { id, dir } = projectArg(name, 'readalong speak <name>');
    await doSpeak(dir, o);
    if (!o['no-open']) await play(id);
  },

  async play([name], o) {
    const { id } = projectArg(name, 'readalong play <name>');
    await play(id, Number(o.port) || 8765);
  },

  async voices(_, o) {
    const k = await import('../features/voice/server/kokoro.ts');
    let names = await k.voiceNames();
    if (o.lang) names = names.filter(n => o.lang!.split(',').some(x => n.startsWith(x.trim())));
    console.log(pc.bold('Kokoro voices') + pc.dim(' (af_heart is the default; English only in this version)'));
    for (const n of names) console.log(`  ${n.padEnd(14)} ${pc.dim(k.describe(n))}`);
    if (!o.samples) return;
    const { Engine } = await import('../features/voice/server/tts.ts');
    const { encodeMp3 } = await import('../features/voice/server/mp3.ts');
    const kok = await k.Kokoro.load();
    fs.mkdirSync(o.samples, { recursive: true });
    const text = o.text || 'Fluent explanations can feel like understanding, even when they are not.';
    const b = bar('Writing samples');
    for (const [i, n] of names.entries()) {
      fs.writeFileSync(path.join(o.samples, `${n}.mp3`), encodeMp3(await new Engine(kok, { voice: n }).synth(text)));
      b.update(i + 1, names.length);
    }
    b.done();
    console.log(`Samples in ${path.resolve(o.samples)}`);
    await open(o.samples);
  },

  async serve([name], o) {
    const { id, dir } = projectArg(name, 'readalong serve <name>');
    if (!fs.existsSync(path.join(dir, 'narration.json'))) throw new Error(`'${id}' hasn't been narrated yet. Run \`readalong speak ${id}\` first.`);
    const { qrText, startShare } = await import('../features/sharing/server/share.ts');
    const url = await startShare(id, Number(o.port) || 8800);
    console.log(await qrText(url));
    console.log(`Scan with your phone (same Wi-Fi) or open ${pc.bold(url)}\nPress Ctrl+C to stop.`);
    await new Promise(() => {});
  },

  async doctor() {
    const { doctor } = await import('../features/jobs/server/doctor.ts');
    p.note(`Checking the voice engine step by step. Each step runs in its own process,\nso a crash is reported instead of closing this window. Log: ${LOG}`, 'doctor');
    const ok = await doctor(s => console.log(s));
    console.log(ok ? pc.green(pc.bold('All good.')) : `${pc.red(pc.bold('A step failed.'))} Send the lines above (or the log) to get it fixed.`);
    if (!ok) process.exitCode = 1;
  },

  async list() {
    const items = projects();
    if (!items.length) return console.log(`Your library is empty (${LIBRARY}).`);
    console.log(pc.bold(`Library: ${LIBRARY}`));
    const w = Math.max(4, ...items.map(x => x.id.length));
    console.log(pc.dim(`  ${'name'.padEnd(w)}  narrated  ${'size'.padStart(7)}  title`));
    for (const x of items) {
      console.log(`  ${x.id.padEnd(w)}  ${(x.narrated ? 'yes' : 'no').padEnd(8)}  ${`${Math.round(x.size / 1e6)} MB`.padStart(7)}  ${x.title.slice(0, 60)}`);
    }
  },

  async delete(names, o) {
    if (!names.length) throw new Error('Usage: readalong delete <name>... (see `readalong list`)');
    const items = new Map(projects().map(x => [x.id, x]));
    const missing = names.filter(n => !items.has(n));
    if (missing.length) throw new Error(`Not in the library: ${missing.join(', ')} (see \`readalong list\`)`);
    for (const n of names) { const x = items.get(n)!; console.log(`  ${n}: ${x.title.slice(0, 70)} (${Math.round(x.size / 1e6)} MB)`); }
    if (!(await confirm(`Delete ${names.length} read-along(s)? This can't be undone`, false, o.yes))) return;
    for (const n of names) deleteProject(n);
    console.log(pc.green('Deleted.'));
  },

  async clean([only], o) {
    const targets: string[] = [];
    if (fs.existsSync(LIBRARY)) {
      for (const d of fs.readdirSync(LIBRARY, { withFileTypes: true })) {
        if (!d.isDirectory() || (only && d.name !== only)) continue;
        const c = path.join(LIBRARY, d.name, '.cache');
        if (fs.existsSync(c)) targets.push(c);
      }
      if (!only && fs.existsSync(path.join(LIBRARY, '.uploads'))) targets.push(path.join(LIBRARY, '.uploads'));
    }
    if (!targets.length) return console.log('Nothing to clean.');
    const size = targets.reduce((s, t) => s + dirSize(t), 0);
    for (const t of targets) console.log(`  ${t}`);
    console.log(`${targets.length} folder(s), ${Math.round(size / 1e6)} MB of cached sentence audio and uploads.`);
    if (!(await confirm('Delete them?', true, o.yes))) return;
    for (const t of targets) fs.rmSync(t, { recursive: true, force: true });
    console.log(`${pc.green('Cleaned.')} Finished read-alongs still play; re-narrating will synthesize everything again.`);
  },

  async ui(_, o) {
    const { runUi } = await import('../server/app.ts');
    await runUi({ port: Number(o.port) || 8765, openBrowser: !o['no-browser'] });
    await new Promise(() => {});
  },
};
