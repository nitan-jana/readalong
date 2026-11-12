// The voice settings the app remembers between visits.

export interface VoiceChoice { voice: string; voice2: string; mix: number; speed: number }

const KEY = 'readalong:voice';
const DEFAULT: VoiceChoice = { voice: 'af_heart', voice2: '', mix: 50, speed: 1 };

/** "af_heart" or a blend "af_heart:0.50,bf_emma:0.50", as the engine takes it. */
export function voiceSpec(c: VoiceChoice) {
  const m = c.mix / 100;
  return c.voice2 ? `${c.voice}:${(1 - m).toFixed(2)},${c.voice2}:${m.toFixed(2)}` : c.voice;
}

/** The last choice, stored as { voice: spec, speed } (the same format earlier versions saved). */
export function loadVoiceChoice(): VoiceChoice {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s?.voice) return DEFAULT;
    const [a, b] = String(s.voice).split(',');
    return {
      voice: a.split(':')[0], voice2: b ? b.split(':')[0] : '',
      mix: b ? Math.round(parseFloat(b.split(':')[1]) * 100) : 50, speed: Number(s.speed) || 1,
    };
  } catch { return DEFAULT; }
}

export function saveVoiceChoice(c: VoiceChoice) {
  try { localStorage.setItem(KEY, JSON.stringify({ voice: voiceSpec(c), speed: c.speed })); } catch { /* private mode */ }
}
