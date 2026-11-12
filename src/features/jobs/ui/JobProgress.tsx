// A job's progress: bar, percentage, time left, and Cancel while it runs.
import { useEffect, useState } from 'react';
import type { Job } from '../../../shared/types';
import { Progress, fmtDuration } from '../../../shared/ui/Progress';

export function JobProgress({ job, label, onCancel }: { job: Job | null; label: string; onCancel?: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { // keep "elapsed" moving between polls
    if (job?.state !== 'running') return;
    const iv = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, [job?.state]);
  const f = job && job.total ? job.done / job.total : 0;
  const running = !job || job.state === 'running';
  return (
    <Progress label={label} fraction={job?.state === 'done' ? 1 : f}
      left={!job ? 'Starting…' : job.state === 'done' ? 'Done' : job.state === 'cancelled' ? 'Cancelled' : `${Math.round(f * 100)}%`}
      right={job?.state === 'running' ? (job.eta_s != null ? `about ${fmtDuration(job.eta_s)} left` : `${fmtDuration(Date.now() / 1000 - job.started)} elapsed`) : ''}
      error={job?.state !== 'cancelled' ? job?.error : null}
      action={onCancel && running && (
        <button type="button" disabled={cancelling} onClick={() => { setCancelling(true); onCancel(); }}>{cancelling ? 'Cancelling…' : 'Cancel'}</button>
      )} />
  );
}
