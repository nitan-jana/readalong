// The progress loader used for every long-running step (reading, AI cleanup, narration), in the app's
// panels and in the player's header.
import type { ReactNode } from 'react';
import './progress.css';

export const fmtDuration = (s: number) =>
  s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

export function Progress({ label, fraction, left, right, action, error, compact }: {
  label: ReactNode; fraction: number; left?: ReactNode; right?: ReactNode;
  action?: ReactNode; error?: string | null; compact?: boolean;
}) {
  return (
    <div className={`job${compact ? ' compact' : ''}`} role="status">
      <div className="row"><b className="grow">{label}</b>{action}</div>
      <div className="bar2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
        <i style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%` }} />
      </div>
      {(left || right) && <div className="meta"><span>{left}</span><span>{right}</span></div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
