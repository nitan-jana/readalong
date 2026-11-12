// The header's "what's running" pill, on every screen; click it to jump to that read-along.
import type { Job } from '../../../shared/types';
import { go } from '../../../app/router';

const VERB: Record<string, string> = { narrate: 'Narrating', ai: 'Cleaning up', prepare: 'Reading' };

export function ActivityPill({ jobs }: { jobs: Job[] }) {
  const run = jobs.filter(j => j.state === 'running');
  const failed = !run.length && jobs.find(j => j.state === 'error' && Date.now() / 1000 - (j.ended || 0) < 120);
  let text: string, project: string, err = false;
  if (run.length) {
    const j = run[0];
    const eta = j.eta_s == null ? '' : j.eta_s < 60 ? ' · <1 min left' : ` · ~${Math.round(j.eta_s / 60)} min left`;
    text = `${VERB[j.kind] ?? j.kind} ${j.title} · ${Math.round(j.fraction * 100)}%${eta}${run.length > 1 ? ` (+${run.length - 1} more)` : ''}`;
    project = j.kind === 'prepare' ? '' : j.project;
  } else if (failed) {
    text = `${failed.title}: ${failed.kind} failed`; project = failed.project; err = true;
  } else return null;
  return (
    <button className={`activity ${err ? 'err' : ''}`} type="button" title="Open the read-along being processed"
      onClick={() => project && go(project)}>{text}</button>
  );
}
