// The app shell: header with what's running, then the library or a read-along (the player is outside it).
import { useEffect, useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';
import type { Env, Job, Voice } from '../shared/types';
import { Logo } from '../shared/ui/Icon';
import { api } from './api';
import { paths } from './router';
import { useJobs } from '../features/jobs/ui/useJob';
import { ActivityPill } from '../features/jobs/ui/ActivityPill';
import { LibraryPage } from '../features/library/ui/LibraryPage';
import { ProjectPage } from '../features/review/ui/ProjectPage';

interface ShellContext { env: Env | null; voices: Voice[]; jobs: Job[]; setTitle: (t: string) => void }

export function Shell() {
  const jobs = useJobs();
  const [env, setEnv] = useState<Env | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    api<Env>('/api/env').then(setEnv, () => setEnv({ claude: false }));
    api<Voice[]>('/api/voices').then(setVoices, () => {});
  }, []);

  return (
    <>
      <header>
        <Link className="brand" to={paths.library} aria-label="readalong library"><Logo />readalong</Link>
        <span className="crumb">{title}</span>
        <span className="grow" />
        <ActivityPill jobs={jobs} />
      </header>
      <Outlet context={{ env, voices, jobs, setTitle } satisfies ShellContext} />
    </>
  );
}

export function Home() {
  const { env, jobs, setTitle } = useOutletContext<ShellContext>();
  useEffect(() => setTitle(''), [setTitle]);
  return <LibraryPage env={env} jobs={jobs} />;
}

export function Project() {
  const { id = '' } = useParams();
  const { env, voices, setTitle } = useOutletContext<ShellContext>();
  return <ProjectPage key={id} id={id} env={env} voices={voices} onTitle={setTitle} />;
}
