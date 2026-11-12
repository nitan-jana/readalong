// #/play/<id>: load a read-along's narration and show the player.
import { useEffect, useState } from 'react';
import type { PlayerData } from '../../../shared/types';
import { api } from '../../../app/api';
import { Player } from './Player';

type Play = PlayerData & { shared?: boolean };

export function PlayerPage({ id }: { id: string }) {
  const [data, setData] = useState<Play | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Play>(`/api/play/${encodeURIComponent(id)}`).then(setData, e => setError(e.message)); }, [id]);
  const back = `#/p/${encodeURIComponent(id)}`;
  if (error) return <main className="home"><p className="err">{error}</p>{!data?.shared && <p><a className="btn" href={back}>Back</a></p>}</main>;
  if (!data) return <main className="home"><p className="hint">Loading…</p></main>;
  if (!data.tracks.length && !data.partial) {
    return <main className="home"><p>This hasn't been narrated yet.</p><p><a className="btn primary" href={back}>Narrate it</a></p></main>;
  }
  return <Player initial={data} base={`/p/${encodeURIComponent(id)}/`} back={data.shared ? undefined : { href: back, label: 'Back' }} />;
}
