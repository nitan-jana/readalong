// The library: add a PDF (drop, choose, or link), and every read-along so far.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Env, Job, LibraryItem } from '../../../shared/types';
import { api } from '../../../app/api';
import { AddPdf } from './AddPdf';
import { LibraryCard } from './LibraryCard';
import { DeleteDialog, type DeleteTarget } from './DeleteDialog';

export function LibraryPage({ env, jobs }: { env: Env | null; jobs: Job[] }) {
  const [lib, setLib] = useState<LibraryItem[] | null>(null);
  const [del, setDel] = useState<DeleteTarget | null>(null);
  const reload = useCallback(() => { api<LibraryItem[]>('/api/library').then(setLib, () => setLib([])); }, []);

  // keep the cards' status live while something is running, and once more when it stops
  const running = jobs.filter(j => j.state === 'running').map(j => `${j.id}:${Math.round(j.fraction * 100)}`).join();
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running || wasRunning.current) reload();
    wasRunning.current = !!running;
  }, [running, reload]);
  useEffect(() => { reload(); document.title = 'readalong'; }, [reload]);

  return (
    <main className="home">
      <section className="intro">
        <div>
          <h1>Listen to any paper while you follow it on the page.</h1>
          <p>Drop in a PDF. readalong tidies the text, narrates it with a natural voice on your own computer, and highlights each word on the original pages as it's read.</p>
          <div className="steps"><span><b>1</b>Add a PDF</span><span><b>2</b>Check the text</span><span><b>3</b>Narrate and listen</span></div>
        </div>
        <AddPdf env={env} />
      </section>

      <section className="lib">
        <div className="lib-head">
          <h2>Library</h2>
          {lib && lib.length > 0 && <span className="hint">{lib.length} read-along{lib.length > 1 ? 's' : ''}</span>}
        </div>
        <div className="libgrid">
          {lib && !lib.length && <div className="empty">Nothing here yet. Add a PDF above and it will appear in your library.</div>}
          {lib?.map(p => <LibraryCard key={p.id} item={p} onDelete={() => setDel({ id: p.id, title: p.title, busy: !!p.job })} />)}
        </div>
      </section>
      {del && <DeleteDialog target={del} onClose={() => setDel(null)} onDeleted={() => { setDel(null); reload(); }} />}
    </main>
  );
}
