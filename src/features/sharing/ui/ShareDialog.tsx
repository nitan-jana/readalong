// "Share to phone": a QR code for the read-only player on this computer's Wi-Fi address.
import { useEffect, useState } from 'react';
import { api } from '../../../app/api';
import { Modal } from '../../../shared/ui/Modal';

export function ShareDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [share, setShare] = useState<{ url: string; svg: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ url: string; svg: string }>(`/api/share/${encodeURIComponent(id)}`).then(setShare, e => setError(e.message));
  }, [id]);
  return (
    <Modal label="Share to phone" onClose={onClose}>
      <b>Scan with your phone</b>
      {share ? <div className="qr" dangerouslySetInnerHTML={{ __html: share.svg }} /> : <div className="qr" />}
      {share && <code>{share.url}</code>}
      {error && <span className="err">{error}</span>}
      <span className="hint">Your phone must be on the same Wi-Fi. This works while readalong is running.</span>
      <button type="button" data-autofocus onClick={onClose}>Close</button>
    </Modal>
  );
}
