// Paths in the app. /p/<name>/… is taken by a read-along's files (pages, audio), so read-alongs live at /r/.
export const paths = {
  library: '/',
  project: (id: string) => `/r/${encodeURIComponent(id)}`,
  play: (id: string) => `/r/${encodeURIComponent(id)}/play`,
};
