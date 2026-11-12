import { useEffect, useRef, type ReactNode } from 'react';

/** A centred dialog over a dimmed page; Escape or a click outside closes it. */
export function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-label={label} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" ref={card}>{children}</div>
    </div>
  );
}
