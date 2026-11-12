// "Clean up with AI": runs the Claude Haiku pass over the blocks as a job, then reloads the project.
import { useState } from 'react';
import type { Env, Job } from '../../../shared/types';
import { Icon } from '../../../shared/ui/Icon';
import { postJson, projectUrl } from '../../../app/api';
import { JobProgress } from '../../jobs/ui/JobProgress';
import { useJob } from '../../jobs/ui/useJob';

export function CleanupButton({ project, runningJob, env, onDone }: {
  project: string; runningJob: string | null; env: Env | null; onDone: () => Promise<unknown>;
}) {
  const [jobId, setJobId] = useState<string | null>(runningJob);
  const [msg, setMsg] = useState('');
  const { job } = useJob(jobId, async j => {
    if (j.state !== 'done') return;
    const r = j.result;
    await onDone();
    setJobId(null);
    setMsg(`Done: ${r.changed_keep} blocks switched between read and skipped${r.failed ? `, ${r.failed} batches failed` : ''}. Cost about $${(r.cost_usd || 0).toFixed(3)}.`);
  });
  const run = async () => {
    setMsg('');
    try { setJobId((await postJson<Job>(`${projectUrl(project)}/ai`, { model: 'haiku' })).id); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <>
      <div className="row">
        <button type="button" disabled={!env?.claude || job?.state === 'running'} onClick={run}>
          <Icon name="sparkle" className="icon" />Clean up with AI
        </button>
        {!env?.claude && <span className="hint">needs the claude CLI</span>}
      </div>
      {jobId && <JobProgress job={job} label="Cleaning up with Claude Haiku" />}
      {msg && <p className="hint">{msg}</p>}
    </>
  );
}
