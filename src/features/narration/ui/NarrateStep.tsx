// Steps 2 and 3: choose a voice, narrate (with progress), then open the player or share it.
import { useEffect, useState } from 'react';
import type { Job, Project as ProjectData, Voice } from '../../../shared/types';
import { postJson, projectUrl } from '../../../app/api';
import { Link } from 'react-router';
import { paths } from '../../../app/router';
import { JobProgress } from '../../jobs/ui/JobProgress';
import { useJob } from '../../jobs/ui/useJob';
import { VoiceStep } from '../../voice/ui/VoiceStep';
import { loadVoiceChoice, saveVoiceChoice, voiceSpec, type VoiceChoice } from '../../voice/ui/voiceChoice';

export function NarrateSteps({ P, voices, onShare, onRunning, onNarrated }: {
  P: ProjectData; voices: Voice[]; onShare: () => void;
  onRunning: (jobId: string | null) => void; onNarrated: () => void;
}) {
  const [choice, setChoice] = useState<VoiceChoice>(loadVoiceChoice);
  const [jobId, setJobId] = useState<string | null>(P.running.narrate);
  const [early, setEarly] = useState(false);
  const [error, setError] = useState('');
  const { job, cancel } = useJob(jobId, j => {
    onRunning(null);
    if (j.state === 'done') onNarrated();
  });
  const running = job?.state === 'running' || (!!jobId && !job);

  // the player is usable once the first part is written
  useEffect(() => {
    if (!running || early) return;
    const iv = setInterval(async () => {
      const n = await fetch(`/p/${encodeURIComponent(P.id)}/narration.json`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
      if (n?.tracks?.length) setEarly(true);
    }, 5000);
    return () => clearInterval(iv);
  }, [running, early, P.id]);

  const narrate = async () => {
    setError(''); setEarly(false);
    saveVoiceChoice(choice);
    try {
      const j = await postJson<Job>(`${projectUrl(P.id)}/narrate`, { voice: voiceSpec(choice), speed: choice.speed });
      setJobId(j.id); onRunning(j.id);
    } catch (e) { setError((e as Error).message); }
  };

  const ready = (P.narrated && !running) || (running && early);
  return (
    <>
      <VoiceStep voices={voices} choice={choice} onChange={setChoice} />
      <section className={`step go ${ready ? 'done' : ''}`}>
        <div className="stephead"><span className="num">3</span><h2>Narrate</h2></div>
        <button type="button" className={`narrate ${ready ? '' : 'primary big'}`} disabled={running} onClick={narrate}>
          {ready && !running ? 'Narrate again' : 'Narrate'}
        </button>
        {jobId && (job?.state !== 'done' || !ready) && <JobProgress job={job} label="Narrating" onCancel={cancel} />}
        {error && <p className="err">{error}</p>}
        {ready && (
          <div className="row donerow">
            <Link className="btn primary" to={paths.play(P.id)}>{running ? 'Open player (still narrating)' : 'Open player'}</Link>
            <button type="button" onClick={onShare}>Share to phone</button>
          </div>
        )}
      </section>
    </>
  );
}
