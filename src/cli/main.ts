// readalong: turn a PDF into a narrated read-along.
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { errorMessage } from '../shared/node/util.ts';
import { COMMANDS } from './commands.ts';
import type { Opts } from './steps.ts';
import { wizard } from './wizard.ts';

const USAGE = `${pc.bold('readalong')}: turn a PDF into a narrated read-along.

  readalong                       step-by-step setup in the terminal
  readalong ui                    open the browser app
  readalong make paper.pdf        PDF (or URL) -> read-along in one go
  readalong extract paper.pdf     stop after extraction so you can edit script.md
  readalong speak <name>          narrate an extracted (and maybe edited) read-along
  readalong play <name>           open a read-along's player in the app
  readalong voices                list voices, or write samples to compare them
  readalong serve <name>          share a read-along with your phone over Wi-Fi
  readalong doctor                check the voice engine step by step
  readalong list                  list the read-alongs in your library
  readalong delete <name>...      delete read-alongs from your library
  readalong clean [name]          delete cached sentence audio from previous runs

Options
  --ai                 clean up with a cheap model through your local \`claude\` CLI
  --ai-model NAME      model for --ai (default: haiku)
  --keep-backmatter    also read acknowledgments, funding, etc.
  --voice NAME         af_heart, bm_george... or a blend 'af_heart:0.6,bf_emma:0.4'
  --speed N            speaking speed, e.g. 0.9 or 1.15
  --review             (make) pause to edit script.md before narrating
  --no-open            don't open the player when narration is done
  --port N             port for serve (8800) or ui (8765)
  --no-browser         (ui) don't open a browser
  --samples DIR        (voices) write one clip per voice
  --lang a,b           (voices) filter by prefix: a = American, b = British English
  -y, --yes            don't ask for confirmation
`;

const OPTIONS = {
  ai: { type: 'boolean' }, 'ai-model': { type: 'string', default: 'haiku' },
  'keep-backmatter': { type: 'boolean' }, voice: { type: 'string', default: 'af_heart' }, speed: { type: 'string', default: '1' },
  review: { type: 'boolean' }, 'no-open': { type: 'boolean' }, port: { type: 'string' }, 'no-browser': { type: 'boolean' },
  samples: { type: 'string' }, lang: { type: 'string' }, text: { type: 'string' }, yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
} as const;

export async function main(argv = process.argv.slice(2)) {
  let o: Opts, positionals: string[];
  try { ({ values: o, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })); }
  catch (e) { console.error(pc.red(errorMessage(e))); console.log(USAGE); process.exit(2); }
  const [cmd, ...rest] = positionals;
  if (o.help || cmd === 'help') return console.log(USAGE);
  process.once('SIGINT', () => { console.log('\nStopped.'); process.exit(130); });
  try {
    if (!cmd) return await wizard();
    const fn = COMMANDS[cmd];
    if (!fn) { console.error(pc.red(`Unknown command: ${cmd}`)); console.log(USAGE); process.exit(2); }
    await fn(rest, o);
  } catch (e) {
    console.error(pc.red(errorMessage(e)));
    if (process.env.READALONG_DEBUG) console.error((e as Error).stack);
    process.exit(1);
  }
}
