import { useState } from 'react';
import { api } from '../../../app/api';
import { Modal } from '../../../shared/ui/Modal';

export interface DeleteTarget { id: string; title: string; busy: boolean }

export function DeleteDialog({ target, onClose, onDeleted }: { target: DeleteTarget; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState(target.busy ? "It's still being processed: cancel that first." : '');
  const [working, setWorking] = useState(false);
  const del = async () => {
    setWorking(true);
    try { await api(`/api/project/${encodeURIComponent(target.id)}/delete`, { method: 'POST' }); onDeleted(); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  };
  return (
    <Modal label="Delete read-along" onClose={onClose}>
      <b>Delete this read-along?</b>
      <span className="hint">{target.title}</span>
      <span className="hint">This removes its PDF copy, audio and player from your library. It can't be undone.</span>
      <div className="row">
        <button type="button" data-autofocus onClick={onClose}>Keep it</button>
        <button type="button" className="danger solid" disabled={target.busy || working} onClick={del}>Delete</button>
      </div>
      {error && <span className="err">{error}</span>}
    </Modal>
  );
}
