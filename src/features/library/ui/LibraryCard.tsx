import type { LibraryItem } from '../../../shared/types';
import { Icon } from '../../../shared/ui/Icon';
import { playHref } from '../../../app/router';

export function LibraryCard({ item: p, onDelete }: { item: LibraryItem; onDelete: () => void }) {
  const href = `#/p/${encodeURIComponent(p.id)}`;
  const facts = [p.pages ? `${p.pages} pages` : '', p.minutes ? `${p.minutes} min` : ''].filter(Boolean).join(' · ');
  const canPlay = p.narrated || (p.job && p.job.done > 0);
  const pct = p.job ? Math.round(p.job.fraction * 100) : 0;
  return (
    <article className="lcard">
      <a className="thumb" href={href} aria-label={`Open ${p.title}`}>
        {p.thumb && <img src={p.thumb} alt="" loading="lazy" />}
        {p.job && <span className="bar"><i style={{ width: `${pct}%` }} /></span>}
      </a>
      <div className="lbody">
        <h3>{p.title}</h3>
        <div className="meta">
          {p.job
            ? <span className="pill run">{p.job.kind === 'ai' ? 'Cleaning up' : 'Narrating'} {pct}%</span>
            : <span className={`pill ${p.narrated ? 'ok' : ''}`}>{p.narrated ? 'Ready' : 'Not narrated'}</span>}
          {facts && <span>{facts}</span>}
        </div>
        <div className="pid" title="Folder name">{p.id}</div>
        <div className="lactions">
          {canPlay && <a className="btn primary" href={playHref(p.id)}><Icon name="play" className="icon" />Play</a>}
          <a className="btn" href={href}>{canPlay ? 'Edit' : 'Open'}</a>
          <span className="grow" />
          <button type="button" className="ghost" title="Delete" aria-label={`Delete ${p.title}`} onClick={onDelete}><Icon name="trash" className="icon" /></button>
        </div>
      </div>
    </article>
  );
}
