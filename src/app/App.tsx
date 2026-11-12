// The app shell: header with what's running, then the library or a read-along; the player is its own screen.
import { useEffect, useState } from 'react';
import type { Env, Voice } from '../shared/types';
import { Logo } from '../shared/ui/Icon';
import { api } from './api';
import { go, useRoute, type Route } from './router';
import { useJobs } from '../features/jobs/ui/useJob';
import { ActivityPill } from '../features/jobs/ui/ActivityPill';
import { LibraryPage } from '../features/library/ui/LibraryPage';
import { ProjectPage } from '../features/review/ui/ProjectPage';
import { PlayerPage } from '../features/player/ui/PlayerPage';

export function App() {
  const route = useRoute();
  // the player is a full screen of its own (it's also what a phone sees through "Share to phone")
  if (route.view === 'play') return <PlayerPage key={route.id} id={route.id} />;
  return <Shell route={route} />;
}

function Shell({ route }: { route: Exclude<Route, { view: 'play' }> }) {
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
        <button className="brand" type="button" aria-label="readalong library" onClick={() => go(null)}><Logo />readalong</button>
        <span className="crumb">{route.view === 'project' ? title : ''}</span>
        <span className="grow" />
        <ActivityPill jobs={jobs} />
      </header>
      {route.view === 'project'
        ? <ProjectPage key={route.id} id={route.id} env={env} voices={voices} onTitle={setTitle} />
        : <LibraryPage env={env} jobs={jobs} />}
    </>
  );
}
