// The few icons the app and player use, inline so the player stays one self-contained file.
const PATHS = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />,
  prev: <path d="M6 6h2v12H6zM9.5 12 18 6v12z" fill="currentColor" />,
  next: <path d="M16 6h2v12h-2zM14.5 12 6 18V6z" fill="currentColor" />,
  rew: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
      <text x="12" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif">10</text>
    </g>
  ),
  fwd: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
      <text x="12" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif">10</text>
    </g>
  ),
  upload: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" />
    </g>
  ),
  sparkle: (
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  ),
  trash: (
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{PATHS[name]}</svg>;
}

export function Logo() {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent)" />
      <rect x="6" y="7" width="14" height="2" rx="1" fill="var(--accent-ink)" opacity=".55" />
      <rect x="5" y="11.5" width="16" height="3.4" rx="1.7" fill="#f2b84b" />
      <rect x="6" y="17" width="10" height="2" rx="1" fill="var(--accent-ink)" opacity=".55" />
    </svg>
  );
}
