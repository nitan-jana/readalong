// Add a PDF: drop it, choose it, or paste a link; reading it runs as a job, then the project opens.
import { useRef, useState } from 'react';
import type { Env, Job } from '../../../shared/types';
import { Icon } from '../../../shared/ui/Icon';
import { api } from '../../../app/api';
import { go } from '../../../app/router';
import { JobProgress } from '../../jobs/ui/JobProgress';
import { useJob } from '../../jobs/ui/useJob';

export function AddPdf({ env }: { env: Env | null }) {
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState('');
  const [ai, setAi] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [aiLabel, setAiLabel] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const useAi = ai && !!env?.claude;
  const { job } = useJob(jobId, j => { if (j.state === 'done') go(j.result.project); });

  const start = async (body: BodyInit, headers: Record<string, string>) => {
    setError(''); setAiLabel(useAi);
    try {
      const j = await api<Job>('/api/new', { method: 'POST', body, headers: { ...headers, 'X-AI': useAi ? '1' : '0' } });
      setJobId(j.id);
    } catch (e) { setError((e as Error).message); }
  };
  const takeFile = (f?: File) => { if (f) start(f, { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(f.name) }); };
  const openUrl = () => { const u = url.trim(); if (u) start(JSON.stringify({ url: u }), { 'Content-Type': 'application/json' }); };
  const busy = job?.state === 'running' || (!!jobId && !job);

  return (
    <div className="addpdf">
      <section className={`drop ${over ? 'over' : ''}`}
        onDragEnter={e => { e.preventDefault(); setOver(true); }} onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={e => { e.preventDefault(); setOver(false); }}
        onDrop={e => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files[0]); }}>
        <div className="glyph"><Icon name="upload" /></div>
        <h2>Drop a PDF here</h2>
        <button className="primary" type="button" disabled={busy} onClick={() => file.current?.click()}>Choose a PDF</button>
        <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={e => { takeFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="or">or paste a link</div>
        <div className="urlrow">
          <input type="url" placeholder="https://…/paper.pdf" aria-label="PDF link" value={url}
            onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && openUrl()} />
          <button type="button" disabled={busy} onClick={openUrl}>Open</button>
        </div>
        <label className="check" title={env?.claude ? undefined : 'Install Claude Code and sign in to enable this'}>
          <input type="checkbox" checked={useAi} disabled={!env?.claude} onChange={e => setAi(e.target.checked)} />
          <span>Clean up the text with Claude Haiku <span className="hint">(uses your <code>claude</code> CLI, a few cents per paper)</span></span>
        </label>
      </section>
      {jobId && job?.state !== 'done' && (
        <JobProgress job={job} label={aiLabel ? 'Reading the PDF and cleaning it up with AI' : 'Reading the PDF'} />
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
