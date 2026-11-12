// The player screen: the PDF's pages with the paragraph, phrase or word being read highlighted, and
// audio controls docked at the bottom. Works while narration is still running: it follows
// progress.json and picks up new parts from narration.json as they're written.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { PdfPage, boxStyle, pointOnPage } from '../../../shared/ui/PdfPage';
import type { Box, Narration, Page, PlayerData } from '../../../shared/types';
import { buildIndex, fmtTime, highlight, hitTest, locate, sectionOf, uttAt, wordAt, phraseRange, type Mode } from './timing';
import { Icon } from '../../../shared/ui/Icon';
import { Progress, fmtDuration } from '../../../shared/ui/Progress';
import './player.css';

const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** localStorage per document (same keys as earlier players, so saved positions carry over). */
function storage(title: string) {
  const key = (k: string) => `ra:${title}:${k}`;
  return {
    get: (k: string) => { try { return localStorage.getItem(key(k)); } catch { return null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(key(k), v); } catch { /* private mode */ } },
  };
}

interface ProgressFile { done: number; total: number; eta_s: number | null; parts: number; finished: boolean }

/** base: where the project's files are served (…/narration.json, progress.json, audio/). */
export function Player({ initial, base, back }: { initial: PlayerData; base: string; back?: { href: string; label: string } }) {
  const store = useMemo(() => storage(initial.title), [initial.title]);
  const [data, setData] = useState<PlayerData>(initial);
  const ix = useMemo(() => buildIndex(data), [data]);
  const au = useRef<HTMLAudioElement>(null);

  // Mutable playback state lives in refs (read from audio events); React state drives what's drawn.
  const live = useRef({ data, ix, tr: 0, rate: Number(store.get('rate')) || 1, waitFor: null as number | null, autoScrollAt: 0, lastTime: -1 });
  live.current.data = data; live.current.ix = ix;

  const [pos, setPos] = useState({ cur: -1, word: -1 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [mode, setModeState] = useState<Mode>((store.get('mode') as Mode) || 'word');
  const [rate, setRateState] = useState(live.current.rate);
  const [follow, setFollow] = useState(true);
  const [seekDrag, setSeekDrag] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState<ProgressFile | null>(null);
  const focusEl = useRef<HTMLElement | null>(null);
  const forceScroll = useRef(false);

  const tick = useCallback(() => {
    const a = au.current, L = live.current;
    if (!a || !L.data.tracks[L.tr]) return;
    const t = a.currentTime, u = uttAt(L.data, L.ix, L.tr, t);
    const w = u >= 0 ? wordAt(L.data.utts[u], t) : -1;
    setPos(p => (p.cur === u && p.word === w ? p : { cur: u, word: w }));
    const g = L.ix.trackStart[L.tr] + t;
    if (Math.abs(g - L.lastTime) >= 0.2) { L.lastTime = g; setTime(g); }
  }, []);

  const load = useCallback((t: number, at: number, play: boolean) => {
    const a = au.current, L = live.current;
    if (!a || !L.data.tracks[t]) return;
    const go = () => { a.currentTime = Math.max(0, at); a.playbackRate = L.rate; if (play) a.play().catch(() => {}); tick(); };
    if (L.tr !== t || !a.getAttribute('src')) {
      L.tr = t; a.src = L.data.tracks[t].src;
      a.addEventListener('loadedmetadata', go, { once: true });
    } else if (a.readyState >= 1) go();
    else a.addEventListener('loadedmetadata', go, { once: true });
  }, [tick]);

  const seekUtt = useCallback((i: number, play = false, word: number | null = null) => {
    const L = live.current, a = au.current;
    if (!a || !L.data.utts.length) return;
    i = Math.max(0, Math.min(L.data.utts.length - 1, i));
    const u = L.data.utts[i];
    const t = word != null && u.w[word] ? u.w[word][0] : u.t;
    setFollow(true); forceScroll.current = true;
    setPos({ cur: i, word: word ?? (u.w.length ? 0 : -1) });
    load(u.tr, t + 0.005, play || !a.paused);
  }, [load]);

  const seekGlobal = useCallback((g: number) => {
    const a = au.current, L = live.current;
    if (!a || !L.data.tracks.length) return;
    const [t, at] = locate(L.ix, Math.max(0, Math.min(L.ix.total - 0.1, g)));
    load(t, at, !a.paused);
  }, [load]);

  const skip = useCallback((d: number) => {
    const a = au.current, L = live.current;
    if (a) seekGlobal(L.ix.trackStart[L.tr] + a.currentTime + d);
  }, [seekGlobal]);

  const toggle = useCallback(() => {
    const a = au.current, L = live.current;
    if (!a) return;
    if (!L.data.tracks.length) { L.waitFor = 0; setWaiting(true); return; }
    if (!a.getAttribute('src')) { load(L.tr, 0, true); return; }
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, [load]);

  const prev = useCallback(() => {
    const a = au.current, u = live.current.data.utts[pos.cur];
    if (a && u && a.currentTime - u.t > 2.5) seekUtt(pos.cur); else seekUtt(pos.cur - 1);
  }, [pos.cur, seekUtt]);
  const next = useCallback(() => seekUtt(pos.cur + 1), [pos.cur, seekUtt]);

  const setMode = (m: Mode) => { setModeState(m); store.set('mode', m); };
  const setRate = (r: number) => {
    live.current.rate = r; setRateState(r); store.set('rate', String(r));
    if (au.current) au.current.playbackRate = r;
  };

  // audio events
  useEffect(() => {
    const a = au.current!;
    let raf = 0;
    const loop = () => { tick(); raf = a.paused ? 0 : requestAnimationFrame(loop); };
    const savePos = () => store.set('pos', JSON.stringify({ tr: live.current.tr, t: a.currentTime }));
    const onPlay = () => { setPlaying(true); if (!raf) raf = requestAnimationFrame(loop); };
    const onPause = () => { setPlaying(false); savePos(); };
    const onEnded = () => {
      const L = live.current;
      if (L.data.tracks[L.tr + 1]) load(L.tr + 1, 0, true);
      else if (L.data.partial) { L.waitFor = L.tr + 1; setWaiting(true); } // resumes when the next part arrives
    };
    a.addEventListener('play', onPlay); a.addEventListener('pause', onPause);
    a.addEventListener('seeked', tick); a.addEventListener('ended', onEnded);
    const iv = setInterval(() => { if (!a.paused) savePos(); }, 5000);
    return () => {
      cancelAnimationFrame(raf); clearInterval(iv);
      a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause);
      a.removeEventListener('seeked', tick); a.removeEventListener('ended', onEnded);
    };
  }, [load, tick, store]);

  // resume where you left off (paused)
  useEffect(() => {
    let start = { tr: 0, t: 0 };
    try { const s = JSON.parse(store.get('pos') || 'null'); if (s && initial.tracks[s.tr]) start = s; } catch { /* ignore */ }
    if (initial.tracks.length) load(start.tr, start.t, false);
  }, []); // once, on first render

  // While narration is still running, follow its progress and pick up new parts as they're written.
  useEffect(() => {
    if (!data.partial) return;
    let stop = false, timer = 0;
    const poll = async () => {
      try {
        const p: ProgressFile = await (await fetch(base + 'progress.json', { cache: 'no-store' })).json();
        if (stop) return;
        setProgress(p); setOffline(false);
        const L = live.current;
        if (p.parts > L.data.tracks.length || p.finished) {
          const N: Narration = await (await fetch(base + 'narration.json', { cache: 'no-store' })).json();
          if (stop) return;
          const nd = { ...L.data, ...N, tracks: N.tracks.map(t => ({ ...t, src: base + t.src })),
            partial: !!N.partial, expected: N.expected || L.data.expected };
          L.data = nd; L.ix = buildIndex(nd); setData(nd);
          if (L.waitFor != null && nd.tracks[L.waitFor]) { const t = L.waitFor; L.waitFor = null; setWaiting(false); load(t, 0, true); }
          else if (!au.current?.getAttribute('src') && nd.tracks.length) load(0, 0, false); // first part just arrived
          if (!N.partial) return;
        }
      } catch { if (!stop) setOffline(true); }
      if (!stop) timer = window.setTimeout(poll, 3000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [data.partial, base, load]);

  // keyboard and lock-screen / headphone controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) return;
      if (e.key === ' ' && !el.closest('button')) { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    addEventListener('keydown', onKey);
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.metadata = new MediaMetadata({ title: data.title, artist: 'readalong' });
      ms.setActionHandler('play', () => au.current?.play());
      ms.setActionHandler('pause', () => au.current?.pause());
      ms.setActionHandler('seekbackward', () => skip(-10));
      ms.setActionHandler('seekforward', () => skip(10));
      ms.setActionHandler('previoustrack', prev);
      ms.setActionHandler('nexttrack', next);
    }
    return () => removeEventListener('keydown', onKey);
  }, [toggle, next, prev, skip, data.title]);

  // what to highlight; recomputed only when the boxes would change
  const u = data.utts[pos.cur];
  const markKey = mode === 'para' || pos.word < 0 || !u ? -1 : mode === 'phrase' ? phraseRange(u, pos.word)[0] : pos.word;
  // (in phrase mode markKey is the phrase's first word, so this only changes when the phrase does)
  const hl = useMemo(() => highlight(u, mode === 'phrase' ? pos.word : markKey, mode), [u, markKey, mode]);

  // keep the highlight in view while playing; stop following when the reader scrolls away
  const keepInView = useCallback((force: boolean) => {
    const el = focusEl.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (force || r.top < 70 || r.bottom > innerHeight - 140) {
      live.current.autoScrollAt = Date.now();
      scrollBy({ top: r.top - innerHeight * 0.33, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }, []);
  useEffect(() => {
    if (forceScroll.current) { forceScroll.current = false; keepInView(true); }
    else if (follow && playing) keepInView(false);
  }, [hl, follow, playing, keepInView]);
  useEffect(() => {
    const onScroll = () => {
      const el = focusEl.current, a = au.current;
      if (!el || !a || a.paused || Date.now() - live.current.autoScrollAt < 1200) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight - 120) setFollow(false);
    };
    addEventListener('wheel', onScroll, { passive: true });
    addEventListener('touchmove', onScroll, { passive: true });
    return () => { removeEventListener('wheel', onScroll); removeEventListener('touchmove', onScroll); };
  }, []);

  const onPageClick = useCallback((p: number, e: MouseEvent<HTMLDivElement>) => {
    const L = live.current, page = L.data.pages[p];
    const { x, y } = pointOnPage(page, e.currentTarget, e.clientX, e.clientY);
    const hit = hitTest(L.data, L.data.pages, p, x, y, mode !== 'para');
    if (hit) seekUtt(hit.utt, true, hit.word);
  }, [mode, seekUtt]);

  const toc = useMemo(() => data.utts.map((x, i) => [i, x] as const).filter(([, x]) => x.k === 'h' && x.x), [data.utts]);
  const where = pos.cur >= 0 ? sectionOf(data, pos.cur, data.title) : 'Ready';
  const loader = !data.partial ? null : offline
    ? <Progress compact label="Narrating" fraction={progress ? progress.done / progress.total : 0} left="can't reach readalong" />
    : <Progress compact
        label={waiting ? 'Waiting for the next part…' : !data.tracks.length ? 'Preparing the first part…' : 'Narrating'}
        fraction={progress ? progress.done / progress.total : 0}
        left={progress ? `${Math.round((progress.done / progress.total) * 100)}%` : ''}
        right={progress?.eta_s != null ? `about ${fmtDuration(progress.eta_s)} left` : ''} />;
  const shown = seekDrag ?? time;

  useEffect(() => { document.title = `${data.title} · readalong`; }, [data.title]);

  return (
    <div className="listen">
      <div className="top">
        {back && <a className="back-link" href={back.href}>← {back.label}</a>}
        <h1>{data.title}</h1>
        {loader}
        <select aria-label="Jump to section" value="" onChange={e => e.target.value !== '' && seekUtt(+e.target.value, true)}>
          <option value="">Contents</option>
          {toc.map(([i, x]) => <option key={i} value={i}>{x.x.replace(/\.$/, '')}</option>)}
        </select>
      </div>

      <Pages pages={data.pages} para={hl.para} marks={hl.marks} mode={mode} focusEl={focusEl} onPageClick={onPageClick} />

      {!follow && playing && (
        <button className="follow" type="button" onClick={() => { setFollow(true); forceScroll.current = true; keepInView(true); }}>
          Back to where it's reading
        </button>
      )}

      <div className="dock" role="region" aria-label="Audio player">
        <div className="pin">
          <input className="seek" type="range" min={0} max={1000} aria-label="Position"
            value={Math.round((shown / ix.total) * 1000)}
            onChange={e => setSeekDrag((+e.target.value / 1000) * ix.total)}
            onPointerUp={() => { if (seekDrag != null) { seekGlobal(seekDrag); setSeekDrag(null); } }}
            onKeyUp={() => { if (seekDrag != null) { seekGlobal(seekDrag); setSeekDrag(null); } }} />
          <div className="row">
            <div className="ctrls">
              <button className="ib" type="button" aria-label="Previous paragraph" title="Previous paragraph (←)" onClick={prev}><Icon name="prev" /></button>
              <button className="ib" type="button" aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => skip(-10)}><Icon name="rew" /></button>
              <button className="play" type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} /></button>
              <button className="ib" type="button" aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => skip(10)}><Icon name="fwd" /></button>
              <button className="ib" type="button" aria-label="Next paragraph" title="Next paragraph (→)" onClick={next}><Icon name="next" /></button>
            </div>
            <div className="info"><b>{where}</b><span>{fmtTime(shown)} / {fmtTime(data.tracks.length ? ix.total : 0)}</span></div>
            <div className="lseg" role="group" aria-label="Highlight">
              {(['para', 'phrase', 'word'] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {{ para: 'Paragraph', phrase: 'Phrase', word: 'Word' }[m]}
                </button>
              ))}
            </div>
            <select aria-label="Speed" value={rate} onChange={e => setRate(+e.target.value)}>
              {RATES.map(r => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
        </div>
      </div>
      <audio ref={au} preload="auto" />
    </div>
  );
}

/** The pages with highlights. Memoized: only re-renders when the highlighted boxes change. */
const Pages = memo(function Pages({ pages, para, marks, mode, focusEl, onPageClick }: {
  pages: Page[]; para: Box[]; marks: Box[]; mode: Mode;
  focusEl: RefObject<HTMLElement | null>;
  onPageClick: (p: number, e: MouseEvent<HTMLDivElement>) => void;
}) {
  focusEl.current = null;
  const setFocus = (first: boolean) => (el: HTMLDivElement | null) => { if (el && first) focusEl.current = el; };
  return (
    <div className="lpages">
      {pages.map((page, p) => (
        <PdfPage key={p} page={page} index={p} eager={p < 3} onClick={e => onPageClick(p, e)}>
          {para.map((b, k) => b[0] === p && (
            <div key={`p${k}`} ref={setFocus(k === 0 && !marks.length)} className="hl para" style={boxStyle(page, b[1], b[2], b[3], b[4], 1.5)} />
          ))}
          {marks.map((b, k) => b[0] === p && (
            <div key={`m${k}`} ref={setFocus(k === 0)} className={`hl ${mode}`} style={boxStyle(page, b[1], b[2], b[3], b[4], 1.5)} />
          ))}
        </PdfPage>
      ))}
    </div>
  );
});
