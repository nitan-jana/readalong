// Following background jobs from the browser: one job until it ends, or everything that's running.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job } from '../../../shared/types';
import { api } from '../../../app/api';

/** Follow a job until it finishes. onDone runs once, with the final state. */
export function useJob(id: string | null, onDone?: (j: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!id) { setJob(null); return; }
    let stop = false, timer = 0;
    const poll = async () => {
      let j: Job;
      try { j = await api<Job>(`/api/job/${id}`); } catch { if (!stop) timer = window.setTimeout(poll, 2000); return; }
      if (stop) return;
      setJob(j);
      if (j.state === 'running') timer = window.setTimeout(poll, 700);
      else done.current?.(j);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  const cancel = useCallback(() => id && api(`/api/job/${id}/cancel`, { method: 'POST' }), [id]);
  return { job, cancel };
}

/** Everything running (and anything that failed recently), polled for the header and library. */
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    let stop = false, timer = 0;
    const poll = async () => {
      let list: Job[] = [];
      try { list = await api<Job[]>('/api/jobs'); } catch { /* server restarting */ }
      if (stop) return;
      setJobs(prev => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
      timer = window.setTimeout(poll, list.some(j => j.state === 'running') ? 2000 : 5000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  return jobs;
}
