import type { LibraryItem } from '../../../shared/types';
import { Icon } from '../../../shared/ui/Icon';
import { Link } from 'react-router';
import { paths } from '../../../app/router';

export function LibraryCard({ item: p, onDelete }: { item: LibraryItem; onDelete: () => void }) {
  const href = paths.project(p.id);
  const facts = [p.pages ? `${p.pages} pages` : '', p.minutes ? `${p.minutes} min` : ''].filter(Boolean).join(' · ');
  const canPlay = p.narrated || (p.job && p.job.done > 0);
  const pct = p.job ? Math.round(p.job.fraction * 100) : 0;
  return (
    <article className="lcard">
      <Link className="thumb" to={href} aria-label={`Open ${p.title}`}>
        {p.thumb && <img src={p.thumb} alt="" loading="lazy" />}
        {p.job && <span className="bar"><i style={{ width: `${pct}%` }} /></span>}
      </Link>
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
          {canPlay && <Link className="btn primary" to={paths.play(p.id)}><Icon name="play" className="icon" />Play</Link>}
          <Link className="btn" to={href}>{canPlay ? 'Edit' : 'Open'}</Link>
          <span className="grow" />
          <button type="button" className="ghost" title="Delete" aria-label={`Delete ${p.title}`} onClick={onDelete}><Icon name="trash" className="icon" /></button>
        </div>
      </div>
    </article>
  );
}
