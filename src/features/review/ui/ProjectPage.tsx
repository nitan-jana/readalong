// One read-along: the PDF's pages on the left (blocks to review), three steps on the right.
// On phones the two halves become tabs.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, Env, Project as ProjectData, Summary, Voice } from '../../../shared/types';
import { PdfPage, boxStyle } from '../../../shared/ui/PdfPage';
import { api, postJson, projectUrl } from '../../../app/api';
import { go } from '../../../app/router';
import { DeleteDialog } from '../../library/ui/DeleteDialog';
import { ShareDialog } from '../../sharing/ui/ShareDialog';
import { NarrateSteps } from '../../narration/ui/NarrateStep';
import { ReviewStep } from './ReviewStep';

const narrow = () => matchMedia('(max-width: 900px)').matches;

export function ProjectPage({ id, env, voices, onTitle }: { id: string; env: Env | null; voices: Voice[]; onTitle: (t: string) => void }) {
  const [P, setP] = useState<ProjectData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'setup' | 'pages'>('setup');
  const [sel, setSel] = useState<number | null>(null);
  const [edited, setEdited] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<'delete' | 'share' | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const p = await api<ProjectData>(projectUrl(id));
      setP(p); onTitle(p.title); document.title = `${p.title} · readalong`;
      return p;
    } catch (e) { setError((e as Error).message); return null; }
  }, [id, onTitle]);
  useEffect(() => { setP(null); setSel(null); setEdited(new Set()); setTab('setup'); load(); }, [load]);

  const setSummary = (s: Summary) => setP(p => (p ? { ...p, summary: s } : p));
  const save = async (changed: Block[]) => {
    const r = await postJson<{ summary: Summary }>(`${projectUrl(id)}/blocks`, changed.map(b => ({ id: b.id, keep: b.keep, speech: b.speech })));
    setSummary(r.summary);
  };
  const update = (b: Block) => setP(p => (p ? { ...p, blocks: p.blocks.map(x => (x.id === b.id ? b : x)) } : p));
  const select = (b: Block) => {
    setSel(b.id);
    if (narrow()) { setTab('setup'); setTimeout(() => editorRef.current?.scrollIntoView({ block: 'center' }), 0); }
    else setTimeout(() => editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };
  const toggleKeep = (b: Block) => {
    const nb = { ...b, keep: !b.keep, reason: b.keep ? (b.reason || 'skipped by you') : '' };
    update(nb); save([nb]); select(nb);
  };

  if (error) return <main className="home"><p className="err">{error}</p><p><button type="button" onClick={() => go(null)}>Back to the library</button></p></main>;
  if (!P) return <main className="home"><p className="hint">Loading…</p></main>;
  const selected = P.blocks.find(b => b.id === sel) ?? null;

  return (
    <main className="proj" data-tab={tab}>
      <div className="ptabs">
        <div className="seg" role="tablist" aria-label="View">
          <button type="button" aria-pressed={tab === 'setup'} onClick={() => { setTab('setup'); scrollTo(0, 0); }}>Narrate</button>
          <button type="button" aria-pressed={tab === 'pages'} onClick={() => { setTab('pages'); scrollTo(0, 0); }}>Pages</button>
        </div>
      </div>

      <div className="pages">
        {P.pages.map((page, i) => (
          <PdfPage key={i} page={page} index={i} eager={i < 2}>
            {P.blocks.filter(b => b.page === i).map(b => (
              <div key={b.id}
                className={`blk ${b.keep ? 'keep' : 'skip'}${sel === b.id ? ' sel' : ''}${edited.has(b.id) ? ' edited' : ''}`}
                style={boxStyle(page, ...b.bbox)}
                title={b.keep ? 'Read aloud' : `Skipped: ${b.reason}`}
                onClick={() => select(b)} onDoubleClick={() => toggleKeep(b)} />
            ))}
          </PdfPage>
        ))}
      </div>

      <aside className="panel">
        <div className="phead">
          <h1>{P.title}</h1>
          <div className="meta">
            {P.running.narrate ? <span className="pill run">Narrating</span>
              : P.narrated ? <span className="pill ok">Ready</span> : <span className="pill">Not narrated</span>}
            <span>{P.pages.length} pages</span><span className="dot" /><span>~{Math.round(P.summary.minutes)} min of audio</span>
          </div>
        </div>

        <ReviewStep P={P} env={env} selected={selected} editorRef={editorRef}
          onClose={() => setSel(null)}
          onChange={(b, textEdited) => { update(b); save([b]); if (textEdited) setEdited(s => new Set(s).add(b.id)); }}
          onReload={load} />

        <NarrateSteps P={P} voices={voices} onShare={() => setDialog('share')}
          onRunning={running => setP(p => (p ? { ...p, running: { ...p.running, narrate: running } } : p))}
          onNarrated={() => setP(p => (p ? { ...p, narrated: true } : p))} />

        <div className="pfoot">
          <button type="button" className="ghost danger" onClick={() => setDialog('delete')}>Delete this read-along…</button>
        </div>
      </aside>

      {dialog === 'delete' && <DeleteDialog target={{ id: P.id, title: P.title, busy: !!(P.running.narrate || P.running.ai) }}
        onClose={() => setDialog(null)} onDeleted={() => { setDialog(null); go(null); }} />}
      {dialog === 'share' && <ShareDialog id={P.id} onClose={() => setDialog(null)} />}
    </main>
  );
}
