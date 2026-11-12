// Edit one block: how it's spoken, and whether it's read at all.
import { useState, type RefObject } from 'react';
import type { Block } from '../../../shared/types';

export function BlockEditor({ block: b, ref, onClose, onChange }: {
  block: Block; ref: RefObject<HTMLDivElement | null>; onClose: () => void; onChange: (b: Block, textEdited: boolean) => void;
}) {
  const [speech, setSpeech] = useState(b.speech);
  const [saved, setSaved] = useState(false);
  const where = `page ${b.page + 1}${b.kind === 'h' ? ', heading' : b.kind === 'cap' ? ', caption' : ''}`;
  return (
    <div className="editor" ref={ref}>
      <div className="row"><span className="where grow">{where}</span><button type="button" className="ghost" aria-label="Close editor" onClick={onClose}>✕</button></div>
      <div className="orig">{b.text}</div>
      <label>Spoken as<textarea value={speech} onChange={e => setSpeech(e.target.value)} /></label>
      <div className="row">
        <div className="seg" role="group" aria-label="Read or skip">
          <button type="button" aria-pressed={b.keep} onClick={() => onChange({ ...b, keep: true, reason: '' }, false)}>Read</button>
          <button type="button" aria-pressed={!b.keep} onClick={() => onChange({ ...b, keep: false, reason: b.reason || 'skipped by you' }, false)}>Skip</button>
        </div>
        <span className="hint grow">{b.keep ? '' : b.reason}</span>
        <button type="button" className="primary" onClick={() => {
          onChange({ ...b, speech: speech.trim() }, true);
          setSaved(true); setTimeout(() => setSaved(false), 1200);
        }}>{saved ? 'Saved' : 'Save'}</button>
      </div>
    </div>
  );
}
