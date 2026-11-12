// Jobs the app runs in the background (reading a PDF, AI cleanup, narration), each in a worker process.
// The app polls them for progress; the same job never runs twice at once on one read-along.
import crypto from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import type { Job, JobKind } from '../../../shared/types.ts';
import { errorMessage, log } from '../../../shared/node/util.ts';
import { title } from '../../library/server/library.ts';
import * as worker from './worker.ts';

interface Running {
  id: string; project: string; kind: JobKind; state: Job['state'];
  done: number; total: number; started: number; ended: number | null;
  error: string | null; result: unknown; samples: [number, number][];
}

const JOBS = new Map<string, Running>();
const PROCS = new Map<string, ChildProcess>();

export const runningJob = (pid: string, kind: JobKind) =>
  [...JOBS.values()].find(j => j.project === pid && j.kind === kind && j.state === 'running');

export const busy = (pid: string) => !!(runningJob(pid, 'narrate') || runningJob(pid, 'ai'));

export function jobView(j: Running): Job {
  const { samples, ...v } = j;
  let eta: number | null = null;
  if (j.state === 'running' && samples.length >= 2) {
    const [t0, d0] = samples[0], [t1, d1] = samples.at(-1)!;
    const rate = (d1 - d0) / Math.max(t1 - t0, 1e-6); // over the last ~90 s
    if (rate > 0 && t1 - t0 >= 10) eta = Math.round((j.total - d1) / rate);
  }
  return { ...v, title: title(j.project), fraction: j.total ? Math.round((j.done / j.total) * 1000) / 1000 : 0, eta_s: eta };
}

export const getJob = (id: string) => JOBS.get(id);

/** Running jobs and those that ended in the last 10 minutes, newest first. */
export function recentJobs() {
  const now = Date.now() / 1000;
  return [...JOBS.values()].filter(j => j.state === 'running' || now - (j.ended || 0) < 600)
    .sort((x, y) => y.started - x.started).map(jobView);
}

/** Start `kind` on a read-along in a worker; returns the running job if it's already going. */
export function startJob<K extends worker.WorkerKind>(pid: string, kind: JobKind, workerKind: K, args: worker.JobArgs[K],
  then: (result: any) => unknown = r => r): Job {
  const existing = runningJob(pid, kind);
  if (existing) return jobView(existing);
  const id = crypto.randomBytes(5).toString('hex');
  const job: Running = { id, project: pid, kind, state: 'running', done: 0, total: 1, started: Date.now() / 1000,
    ended: null, error: null, result: null, samples: [] };
  JOBS.set(id, job);
  const progress = (d: number, t: number) => {
    job.done = d; job.total = Math.max(t, 1);
    // recent progress only: cached sentences finish instantly and would make the estimate far too short
    const now = Date.now() / 1000;
    job.samples.push([now, d]);
    while (job.samples.length > 2 && job.samples[1][0] < now - 90) job.samples.shift();
  };
  worker.run(workerKind, args, { progress, onStart: c => PROCS.set(id, c) })
    .then(r => { job.result = then(r); job.state = 'done'; })
    .catch(e => {
      job.state = e instanceof worker.Cancelled ? 'cancelled' : 'error';
      job.error = errorMessage(e);
      if (!(e instanceof worker.Cancelled)) log(`job ${kind} error: ${(e as Error).stack || e}`);
    })
    .finally(() => { PROCS.delete(id); job.ended = Date.now() / 1000; });
  return jobView(job);
}

export function cancelJob(id: string) {
  worker.cancel(PROCS.get(id));
  const j = JOBS.get(id);
  return j ? jobView(j) : null;
}

export function stopAll() {
  for (const c of PROCS.values()) worker.cancel(c);
}
