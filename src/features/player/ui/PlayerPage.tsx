// /r/<id>/play: load a read-along's narration and show the player.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { PlayerData } from '../../../shared/types';
import { api } from '../../../app/api';
import { paths } from '../../../app/router';
import { Player } from './Player';

type Play = PlayerData & { shared?: boolean };

export function PlayerPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Play | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    api<Play>(`/api/play/${encodeURIComponent(id)}`).then(setData, e => setError(e.message));
  }, [id]);
  const back = paths.project(id);
  if (error) return <main className="home"><p className="err">{error}</p>{!data?.shared && <p><Link className="btn" to={back}>Back</Link></p>}</main>;
  if (!data) return <main className="home"><p className="hint">Loading…</p></main>;
  if (!data.tracks.length && !data.partial) {
    return <main className="home"><p>This hasn't been narrated yet.</p><p><Link className="btn primary" to={back}>Narrate it</Link></p></main>;
  }
  return <Player key={id} initial={data} base={`/p/${encodeURIComponent(id)}/`} back={data.shared ? undefined : { to: back, label: 'Back' }} />;
}
