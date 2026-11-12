// Step 1: what will be read. Stats, the block editor, and the optional AI cleanup.
import type { RefObject } from 'react';
import type { Block, Env, Project as ProjectData } from '../../../shared/types';
import { CleanupButton } from '../../cleanup/ui/CleanupButton';
import { BlockEditor } from './BlockEditor';

export function ReviewStep({ P, env, selected, editorRef, onClose, onChange, onReload }: {
  P: ProjectData; env: Env | null; selected: Block | null; editorRef: RefObject<HTMLDivElement | null>;
  onClose: () => void; onChange: (b: Block, textEdited: boolean) => void; onReload: () => Promise<ProjectData | null>;
}) {
  const s = P.summary;
  return (
    <section className="step">
      <div className="stephead"><span className="num">1</span><h2>Check what will be read</h2></div>
      <div className="stats">
        <div className="stat"><b>{s.kept}</b><span>blocks read</span></div>
        <div className="stat"><b>{s.blocks - s.kept}</b><span>skipped</span></div>
        <div className="stat"><b>{Math.round(s.minutes)}</b><span>min of audio</span></div>
      </div>
      <div className="legend">
        <span><i className="sw keep" />read aloud</span>
        <span><i className="sw skip" />skipped</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>Click a block on the pages to edit it. Double-click to switch it between read and skipped.</p>
      {selected && <BlockEditor key={selected.id} block={selected} ref={editorRef} onClose={onClose} onChange={onChange} />}
      <CleanupButton project={P.id} runningJob={P.running.ai} env={env} onDone={onReload} />
    </section>
  );
}
