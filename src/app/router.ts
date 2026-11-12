// Hash routes, so the app is one page that back/forward and bookmarks work with.
import { useSyncExternalStore } from 'react';

export const playHref = (id: string) => `#/play/${encodeURIComponent(id)}`;

export type Route = { view: 'home' } | { view: 'project' | 'play'; id: string };

/** Hash routes: #/ the library, #/p/<id> a project, #/play/<id> its player (old #<id> links work too). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    cb => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb); },
    () => location.hash,
  );
  const play = hash.match(/^#\/play\/(.+)$/);
  if (play) return { view: 'play', id: decodeURIComponent(play[1]) };
  const m = hash.match(/^#\/p\/(.+)$/) || hash.match(/^#(?!\/)(.+)$/);
  return m ? { view: 'project', id: decodeURIComponent(m[1]) } : { view: 'home' };
}

export function go(id: string | null) {
  location.hash = id ? `#/p/${encodeURIComponent(id)}` : '#/';
}
