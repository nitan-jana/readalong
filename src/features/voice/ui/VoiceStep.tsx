// Step 2: pick a voice (or blend two), a speed, and preview it.
import { useRef, useState } from 'react';
import type { Voice } from '../../../shared/types';
import { Icon } from '../../../shared/ui/Icon';
import { voiceSpec, type VoiceChoice } from './voiceChoice';

export function VoiceStep({ voices, choice: c, onChange }: { voices: Voice[]; choice: VoiceChoice; onChange: (c: VoiceChoice) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const set = (patch: Partial<VoiceChoice>) => onChange({ ...c, ...patch });

  // grouped by language, e.g. "American English" → af_heart (female)…
  const groups = new Map<string, Voice[]>();
  for (const v of voices) {
    const g = v.desc.split(',')[0];
    groups.set(g, [...(groups.get(g) ?? []), v]);
  }
  const options = [...groups].map(([g, vs]) => (
    <optgroup key={g} label={g}>
      {vs.map(v => <option key={v.name} value={v.name}>{v.name} ({v.desc.split(', ')[1]})</option>)}
    </optgroup>
  ));

  const preview = async () => {
    setNote('Generating…'); setBusy(true);
    try {
      const r = await fetch('/api/sample?' + new URLSearchParams({ voice: voiceSpec(c), speed: String(c.speed) }));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      const a = audio.current!;
      a.src = URL.createObjectURL(await r.blob());
      await a.play();
      setNote('');
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="step">
      <div className="stephead"><span className="num">2</span><h2>Choose a voice</h2></div>
      <div className="two">
        <label>Voice<select value={c.voice} onChange={e => set({ voice: e.target.value })}>{options}</select></label>
        <label>Blend with<select value={c.voice2} onChange={e => set({ voice2: e.target.value })}><option value="">None</option>{options}</select></label>
      </div>
      {c.voice2 && <label>Mix <input type="range" min={10} max={90} value={c.mix} onChange={e => set({ mix: +e.target.value })} /></label>}
      <label>
        Speed <span style={{ color: 'var(--ink)' }}>{c.speed.toFixed(2)}×</span>
        <input type="range" min={0.7} max={1.5} step={0.05} value={c.speed} onChange={e => set({ speed: +e.target.value })} />
      </label>
      <div className="row">
        <button type="button" disabled={busy} onClick={preview}><Icon name="play" className="icon" />Preview voice</button>
        <audio ref={audio} />
        <span className="hint">{voices.length ? note : 'Loading voices…'}</span>
      </div>
    </section>
  );
}
