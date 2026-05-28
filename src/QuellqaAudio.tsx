import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Folder, Repeat, Volume2, Disc, Trash2, Radio, Library, Search, Edit2, Palette } from 'lucide-react';
import * as musicMetadata from 'music-metadata-browser';

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  trackNo: number;
  url: string; // Contains direct base64 audio payload string
  coverArt: string; 
}

interface AlbumGroup {
  albumName: string;
  artistName: string;
  coverArt: string;
  tracks: Track[];
}

type ThemeName = 'industrial' | 'lean' | 'red' | 'gloop' | 'light';

export default function QuellqaAudio() {
  const [activeTab, setActiveTab] = useState<'playing' | 'library'>('library');
  const [masterTracks, setMasterTracks] = useState<Track[]>([]);
  const [activeQueue, setActiveQueue] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<'track' | 'alpha'>('track');
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('industrial');

  const [pitchRate, setPitchRate] = useState<number>(1.0); 
  const [stereoPan, setStereoPan] = useState<number>(0.0); 
  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(4); 
  const isTransitioningRef = useRef<boolean>(false);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);

  const [preamp, setPreamp] = useState<number>(0);
  const [subBass, setSubBass] = useState<number>(0);   
  const [lowMid, setLowMid] = useState<number>(0);     
  const [mid, setMid] = useState<number>(0);         
  const [highMid, setHighMid] = useState<number>(0);   
  const [treble, setTreble] = useState<number>(0);     

  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainANodeRef = useRef<GainNode | null>(null);
  const gainBNodeRef = useRef<GainNode | null>(null);
  const preampNodeRef = useRef<GainNode | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);
  
  const subNodeRef = useRef<BiquadFilterNode | null>(null);
  const lowMidNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const highMidNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebNodeRef = useRef<BiquadFilterNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const themes = {
    industrial: { bg: 'bg-black', text: 'text-white', border: 'border-zinc-900', secondaryBg: 'bg-zinc-950', accentText: 'text-zinc-400', accentBorder: 'border-white', primaryHex: '#ffffff', sliderBg: 'bg-zinc-900' },
    lean: { bg: 'bg-neutral-950', text: 'text-fuchsia-100', border: 'border-purple-950/60', secondaryBg: 'bg-purple-950/20', accentText: 'text-purple-400', accentBorder: 'border-fuchsia-500', primaryHex: '#d946ef', sliderBg: 'bg-purple-950/50' },
    red: { bg: 'bg-neutral-950', text: 'text-rose-100', border: 'border-rose-950/60', secondaryBg: 'bg-rose-950/20', accentText: 'text-rose-500', accentBorder: 'border-rose-600', primaryHex: '#f43f5e', sliderBg: 'bg-rose-950/50' },
    gloop: { bg: 'bg-stone-950', text: 'text-emerald-100', border: 'border-emerald-950', secondaryBg: 'bg-emerald-950/10', accentText: 'text-emerald-400', accentBorder: 'border-emerald-500', primaryHex: '#10b981', sliderBg: 'bg-emerald-950/30' },
    light: { bg: 'bg-stone-50', text: 'text-neutral-900', border: 'border-stone-300', secondaryBg: 'bg-stone-200/60', accentText: 'text-stone-500', accentBorder: 'border-neutral-900', primaryHex: '#171717', sliderBg: 'bg-stone-300' }
  };
  const ui = themes[currentTheme];

  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      const handleMediaCommand = (_event: any, command: string) => {
        if (command === 'play-pause') {
          const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!;
          if (isPlaying) { activeAudio.pause(); setIsPlaying(false); }
          else if (activeQueue.length) { activeAudio.play().catch(() => {}); setIsPlaying(true); }
        } else if (command === 'next') {
          if (currentIdx < activeQueue.length - 1) executeTrackSkip(currentIdx + 1);
        } else if (command === 'prev') {
          if (currentIdx > 0) executeTrackSkip(currentIdx - 1);
        }
      };
      ipcRenderer.on('media-command', handleMediaCommand);
      return () => { ipcRenderer.removeListener('media-command', handleMediaCommand); };
    } catch (e) {}
  }, [isPlaying, currentIdx, activeQueue]);

  useEffect(() => {
    if (currentIdx !== -1 && activeQueue[currentIdx]) {
      const currentTrack = activeQueue[currentIdx];
      document.title = `${currentTrack.title} — ${currentTrack.artist}`;
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('sync-native-media', { title: currentTrack.title, artist: currentTrack.artist, isPlaying });
        ipcRenderer.send('update-rpc', { title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album, isPlaying });
      } catch(e) {}
    } else {
      document.title = "Quellqa VERSION X";
      try { window.require('electron').ipcRenderer.send('update-rpc', null); } catch(e) {}
    }
  }, [currentIdx, activeQueue, isPlaying]);

  const initAudioGraph = () => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const srcA = ctx.createMediaElementSource(audioARef.current!);
    const srcB = ctx.createMediaElementSource(audioBRef.current!);

    const gainA = ctx.createGain(); const gainB = ctx.createGain();
    gainANodeRef.current = gainA; gainBNodeRef.current = gainB;

    const p = ctx.createGain(); const panner = ctx.createStereoPanner();
    pannerNodeRef.current = panner;

    const analyser = ctx.createAnalyser(); analyser.fftSize = 64;
    analyserNodeRef.current = analyser;

    const eqSub = ctx.createBiquadFilter(); eqSub.type = 'lowshelf'; eqSub.frequency.value = 60;
    const eqLowMid = ctx.createBiquadFilter(); eqLowMid.type = 'peaking'; eqLowMid.frequency.value = 230;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 910;
    const eqHighMid = ctx.createBiquadFilter(); eqHighMid.type = 'peaking'; eqHighMid.frequency.value = 4000;
    const eqTreb = ctx.createBiquadFilter(); eqTreb.type = 'highshelf'; eqTreb.frequency.value = 14000;

    srcA.connect(gainA).connect(p); srcB.connect(gainB).connect(p);
    p.connect(panner).connect(eqSub).connect(eqLowMid).connect(eqMid).connect(eqHighMid).connect(eqTreb).connect(analyser).connect(ctx.destination);

    preampNodeRef.current = p; subNodeRef.current = eqSub; lowMidNodeRef.current = eqLowMid; midNodeRef.current = eqMid; highMidNodeRef.current = eqHighMid; trebNodeRef.current = eqTreb;
    gainA.gain.value = volume; gainB.gain.value = 0;
    updateDsp(); startCanvasRenderLoop();
  };

  const updateDsp = () => {
    const now = audioCtxRef.current?.currentTime || 0;
    preampNodeRef.current?.gain.setValueAtTime(Math.pow(10, preamp / 20), now);
    subNodeRef.current?.gain.setValueAtTime(subBass, now);
    lowMidNodeRef.current?.gain.setValueAtTime(lowMid, now);
    midNodeRef.current?.gain.setValueAtTime(mid, now);
    highMidNodeRef.current?.gain.setValueAtTime(highMid, now);
    trebNodeRef.current?.gain.setValueAtTime(treble, now);
    if (pannerNodeRef.current) pannerNodeRef.current.pan.setValueAtTime(stereoPan, now);
    if (audioARef.current) audioARef.current.playbackRate = pitchRate;
    if (audioBRef.current) audioBRef.current.playbackRate = pitchRate;
  };
  useEffect(() => { updateDsp(); }, [preamp, subBass, lowMid, mid, highMid, treble, stereoPan, pitchRate]);

  useEffect(() => {
    if (!audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    if (activeDeckRef.current === 'A' && !isTransitioningRef.current) {
      gainANodeRef.current?.gain.setValueAtTime(volume, now); gainBNodeRef.current?.gain.setValueAtTime(0, now);
    } else if (activeDeckRef.current === 'B' && !isTransitioningRef.current) {
      gainBNodeRef.current?.gain.setValueAtTime(volume, now); gainANodeRef.current?.gain.setValueAtTime(0, now);
    }
  }, [volume]);

  useEffect(() => {
    const handleTimeUpdate = () => {
      const activeAudio = activeDeckRef.current === 'A' ? audioARef.current : audioBRef.current;
      if (!activeAudio || isTransitioningRef.current) return;
      setCurrentTime(activeAudio.currentTime);
      setDuration(activeAudio.duration || 0);

      const remainingTime = activeAudio.duration - activeAudio.currentTime;
      if (remainingTime <= crossfadeDuration && currentIdx < activeQueue.length - 1) {
        triggerLinearCrossfade();
      }
    };
    const handleEnded = () => {
      if (currentIdx === activeQueue.length - 1) {
        if (isLooping) executeTrackSkip(0); else setIsPlaying(false);
      }
    };
    const aElement = audioARef.current; const bElement = audioBRef.current;
    aElement?.addEventListener('timeupdate', handleTimeUpdate); bElement?.addEventListener('timeupdate', handleTimeUpdate);
    aElement?.addEventListener('ended', handleEnded); bElement?.addEventListener('ended', handleEnded);
    return () => {
      aElement?.removeEventListener('timeupdate', handleTimeUpdate); bElement?.removeEventListener('timeupdate', handleTimeUpdate);
      aElement?.removeEventListener('ended', handleEnded); bElement?.removeEventListener('ended', handleEnded);
    };
  }, [currentIdx, activeQueue, isLooping, crossfadeDuration]);

  const triggerLinearCrossfade = () => {
    if (isTransitioningRef.current || !audioCtxRef.current) return;
    isTransitioningRef.current = true;

    const nextIdx = currentIdx + 1;
    const currentDeck = activeDeckRef.current;
    const nextDeck = currentDeck === 'A' ? 'B' : 'A';

    const outgoingAudio = currentDeck === 'A' ? audioARef.current! : audioBRef.current!;
    const incomingAudio = nextDeck === 'A' ? audioARef.current! : audioBRef.current!;
    const outgoingGain = currentDeck === 'A' ? gainANodeRef.current! : gainBNodeRef.current!;
    const incomingGain = nextDeck === 'A' ? gainANodeRef.current! : gainBNodeRef.current!;

    incomingAudio.src = activeQueue[nextIdx].url;
    incomingAudio.playbackRate = pitchRate;
    incomingGain.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
    setIsPlaying(true); incomingAudio.play().catch(() => {});

    const now = audioCtxRef.current.currentTime;
    outgoingGain.gain.setValueAtTime(volume, now); outgoingGain.gain.linearRampToValueAtTime(0, now + crossfadeDuration);
    incomingGain.gain.setValueAtTime(0, now); incomingGain.gain.linearRampToValueAtTime(volume, now + crossfadeDuration);

    setCurrentIdx(nextIdx); activeDeckRef.current = nextDeck;
    setTimeout(() => { outgoingAudio.pause(); outgoingAudio.src = ""; isTransitioningRef.current = false; }, crossfadeDuration * 1000);
  };

  const executeTrackSkip = (targetIdx: number) => {
    if (!activeQueue[targetIdx]) return;
    initAudioGraph();
    isTransitioningRef.current = false;
    const now = audioCtxRef.current!.currentTime;

    const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!;
    const inactiveAudio = activeDeckRef.current === 'A' ? audioBRef.current! : audioARef.current!;
    const activeGain = activeDeckRef.current === 'A' ? gainANodeRef.current! : gainBNodeRef.current!;
    const inactiveGain = activeDeckRef.current === 'A' ? gainBNodeRef.current! : gainANodeRef.current!;

    inactiveAudio.pause(); inactiveAudio.src = ""; inactiveGain.gain.setValueAtTime(0, now);
    activeGain.gain.setValueAtTime(volume, now);
    activeAudio.src = activeQueue[targetIdx].url;
    activeAudio.playbackRate = pitchRate;
    setIsPlaying(true); activeAudio.play().catch(() => {});
    setCurrentIdx(targetIdx);
  };

  const startCanvasRenderLoop = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const canvas = canvasRef.current; const analyser = analyserNodeRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = currentTheme === 'light' ? '#f5f5f4' : '#000000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.25; let barHeight; let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] * 0.45; ctx.fillStyle = ui.primaryHex;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight); x += barWidth;
      }
    };
    render();
  };
  useEffect(() => { startCanvasRenderLoop(); }, [currentTheme]);

  const applyMetadataOverride = (e: React.FormEvent) => {
    e.preventDefault(); if (!editingTrack) return;
    setMasterTracks(masterTracks.map(t => t.id === editingTrack.id ? editingTrack : t));
    setActiveQueue(activeQueue.map(t => t.id === editingTrack.id ? editingTrack : t));
    setEditingTrack(null);
  };

  const triggerNuclearLoadAll = () => {
    if (!masterTracks.length) return;
    const flatQueue = [...masterTracks].sort((x, y) => sortBy === 'alpha' ? x.title.localeCompare(y.title) : x.trackNo - y.trackNo);
    setActiveQueue(flatQueue); setCurrentIdx(0); setActiveTab('playing');
    setTimeout(() => executeTrackSkip(0), 40);
  };

  const albums: AlbumGroup[] = React.useMemo(() => {
    const map: { [key: string]: AlbumGroup } = {};
    const query = searchQuery.toLowerCase().trim();
    const filtered = masterTracks.filter(t => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query) || t.album.toLowerCase().includes(query));

    filtered.forEach(t => {
      const key = (t.album || "Unknown").toLowerCase().trim();
      if (!map[key]) map[key] = { albumName: t.album, artistName: t.artist, coverArt: t.coverArt, tracks: [] };
      map[key].tracks.push(t);
    });
    return Object.values(map).map(a => ({ ...a, tracks: a.tracks.sort((x, y) => sortBy === 'alpha' ? x.title.localeCompare(y.title) : x.trackNo - y.trackNo) }));
  }, [masterTracks, searchQuery, sortBy]);

  const handleImport = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const files = await ipcRenderer.invoke('select-music-dir');
      if (!files || !files.length) return;

      const news: Track[] = [];
      for (let file of files) {
        let title = file.name; let artist = "Unknown Artist"; let album = "Unknown Album"; let trackNo = 0; let art = "";
        
        try {
          // Decode internal file array metadata headers via local base64 allocation string safely
          const response = await fetch(file.audioDataUrl);
          const blob = await response.blob();
          const meta = await musicMetadata.parseBlob(blob);
          if (meta.common) {
            title = meta.common.title || title;
            artist = meta.common.artist || artist;
            album = meta.common.album || album;
            trackNo = meta.common.track.no || trackNo;
            if (meta.common.picture?.[0]) {
              const pic = meta.common.picture[0];
              art = `data:${pic.format};base64,${btoa(pic.data.reduce((d, b) => d + String.fromCharCode(b), ''))}`;
            }
          }
        } catch (e) {}

        news.push({ id: Date.now() + Math.random(), title, artist, album, trackNo, url: file.audioDataUrl, coverArt: art });
      }
      setMasterTracks([...masterTracks, ...news]);
    } catch (err) {}
  };

  return (
    <div className={`flex flex-col h-screen font-mono text-[11px] tracking-tight ${ui.bg} ${ui.text} selection:bg-neutral-800 transition-colors duration-200`}>
      <style>{`
        input[type="range"][orient="vertical"] { writing-mode: vertical-lr; direction: rtl; appearance: slider-vertical; width: 12px; height: 96px; background: transparent; }
        input[type="range"]:not([orient="vertical"])[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 8px; height: 12px; background: ${ui.primaryHex}; cursor: pointer; }
        input[type="range"]:not([orient="vertical"])[type="range"]::-moz-range-thumb { width: 8px; height: 12px; background: ${ui.primaryHex}; cursor: pointer; border: none; }
        input[type="range"][orient="vertical"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 8px; background: ${ui.primaryHex}; cursor: pointer; }
        input[type="range"][orient="vertical"]::-moz-range-thumb { width: 12px; height: 8px; background: ${ui.primaryHex}; cursor: pointer; border: none; }
      `}</style>

      <audio ref={audioARef} crossOrigin="anonymous" /> <audio ref={audioBRef} crossOrigin="anonymous" />
      
      <div className={`h-10 border-b ${ui.border} flex items-center justify-between px-4 titlebar-drag shrink-0`}>
        <div className="flex gap-2 titlebar-nodrag">
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'close')} className="w-3 h-3 rounded-full bg-neutral-700 hover:bg-red-600 transition cursor-pointer" />
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'minimize')} className="w-3 h-3 rounded-full bg-neutral-700 hover:bg-neutral-500 transition cursor-pointer" />
        </div>
        <div className="flex gap-6 titlebar-nodrag font-bold">
          <button onClick={() => setActiveTab('playing')} className={`flex items-center gap-1.5 uppercase transition ${activeTab === 'playing' ? ui.text : 'opacity-40'}`}><Radio size={12}/>Player Studio</button>
          <button onClick={() => setActiveTab('library')} className={`flex items-center gap-1.5 uppercase transition ${activeTab === 'library' ? ui.text : 'opacity-40'}`}><Library size={12}/>Music Library</button>
        </div>
        <div className="flex items-center gap-2 titlebar-nodrag">
          <Palette size={11} className="opacity-40" />
          <select value={currentTheme} onChange={e=>setCurrentTheme(e.target.value as ThemeName)} className={`bg-transparent outline-none border ${ui.border} text-[9px] font-bold uppercase p-0.5 px-1 cursor-pointer`}>
            <option value="industrial" className="bg-black text-white">Default Dark</option>
            <option value="lean" className="bg-neutral-900 text-fuchsia-400">Lean</option>
            <option value="red" className="bg-neutral-900 text-rose-500">Whole Lotta Red</option>
            <option value="gloop" className="bg-stone-900 text-emerald-400">Gloop</option>
            <option value="light" className="bg-white text-black">Light Mode</option>
          </select>
          <span className="text-[9px] font-bold tracking-widest opacity-30 ml-2">VERSION X</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {editingTrack && (
          <div className="absolute inset-0 bg-black bg-opacity-90 z-50 p-8 flex items-center justify-center">
            <form onSubmit={applyMetadataOverride} className={`w-full max-w-sm border ${ui.border} p-6 flex flex-col gap-4 bg-zinc-950 text-white`}>
              <span className="text-[10px] font-bold uppercase opacity-60">Edit Song Information</span>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] opacity-40 uppercase font-bold">Song Title</label>
                <input type="text" value={editingTrack.title} onChange={e=>setEditingTrack({...editingTrack, title: e.target.value})} className="bg-black border border-zinc-800 p-2 text-white outline-none" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] opacity-40 uppercase font-bold">Artist</label>
                <input type="text" value={editingTrack.artist} onChange={e=>setEditingTrack({...editingTrack, artist: e.target.value})} className="bg-black border border-zinc-800 p-2 text-white outline-none" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] opacity-40 uppercase font-bold">Album Name</label>
                <input type="text" value={editingTrack.album} onChange={e=>setEditingTrack({...editingTrack, album: e.target.value})} className="bg-black border border-zinc-800 p-2 text-white outline-none" required />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={()=>setEditingTrack(null)} className="w-1/2 border border-zinc-800 py-2 font-bold uppercase opacity-50 hover:opacity-100 transition">Cancel</button>
                <button type="submit" className="w-1/2 bg-white text-black font-bold uppercase py-2 transition">Save Changes</button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'playing' ? (
          <div className="flex-1 flex">
            <div className={`w-64 border-r ${ui.border} p-4 flex flex-col justify-between shrink-0 overflow-y-auto`}>
              <div className="flex flex-col gap-4">
                <div className={`border ${ui.border} p-3 flex flex-col gap-3 ${ui.secondaryBg}`}>
                  <span className="text-[8px] font-bold tracking-widest opacity-50 uppercase">Playback Adjustments</span>
                  <div>
                    <div className={`flex justify-between text-[8px] font-bold ${ui.accentText} mb-1`}><span>SPEED & PITCH</span><span>{pitchRate.toFixed(2)}x</span></div>
                    <input type="range" min="0.5" max="2.0" step="0.01" value={pitchRate} onChange={e=>setPitchRate(parseFloat(e.target.value))} className={`w-full h-1 ${ui.sliderBg} outline-none appearance-none`} />
                  </div>
                  <div>
                    <div className={`flex justify-between text-[8px] font-bold ${ui.accentText} mb-1`}><span>CROSSFADE TIME</span><span>{crossfadeDuration} seconds</span></div>
                    <input type="range" min="0" max="15" step="1" value={crossfadeDuration} onChange={e=>setCrossfadeDuration(parseInt(e.target.value))} className={`w-full h-1 ${ui.sliderBg} outline-none appearance-none`} />
                  </div>
                </div>

                <div className={`h-40 border ${ui.border} p-3 flex justify-between ${ui.secondaryBg}`}>
                  {[
                    { label: '60Hz', v: subBass, s: setSubBass }, { label: '230Hz', v: lowMid, s: setLowMid }, { label: '910Hz', v: mid, s: setMid }, { label: '4kHz', v: highMid, s: setHighMid }, { label: '14kHz', v: treble, s: setTreble }
                  ].map((c, i) => (
                    <div key={i} className="flex flex-col items-center justify-between w-1/5 h-full">
                      <span className="text-[8px] font-bold opacity-70 h-3">{c.v > 0 ? `+${c.v}` : c.v}</span>
                      <div className="flex-1 flex items-center justify-center my-1"><input type="range" min="-32" max="32" step="1" value={c.v} orient="vertical" onChange={e => c.s(parseFloat(e.target.value))} className="outline-none" /></div>
                      <span className="text-[7px] font-bold opacity-40 tracking-tighter h-3">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 py-3 my-2">
                <span className="text-[8px] font-bold tracking-widest opacity-50 uppercase">Visualiser</span>
                <div className={`w-full h-16 border ${ui.border} relative overflow-hidden`}><canvas ref={canvasRef} width="222" height="64" className="w-full h-full block" /></div>
              </div>

              <div className={`border ${ui.border} p-3 ${ui.secondaryBg}`}>
                <div className="flex justify-between text-[9px] font-bold opacity-70 mb-1"><span>PRE-AMP GAIN</span><span>{preamp > 0 ? `+${preamp}` : preamp} dB</span></div>
                <input type="range" min="-32" max="32" step="0.5" value={preamp} onChange={e => setPreamp(parseFloat(e.target.value))} className={`w-full h-1 ${ui.sliderBg} outline-none appearance-none`} />
              </div>
            </div>

            <div className="flex-1 p-5 flex flex-col">
              <span className="text-[10px] font-bold uppercase mb-3 tracking-widest opacity-40">Current Playing Queue</span>
              <div className={`flex-1 border ${ui.border} overflow-y-auto`}>
                {activeQueue.length ? activeQueue.map((t, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 border-b ${ui.border} cursor-pointer transition group`} style={{ backgroundColor: currentIdx === i ? ui.primaryHex : 'transparent', color: currentIdx === i ? (currentTheme === 'light' ? '#000' : '#000') : 'inherit' }}>
                    <div onClick={() => executeTrackSkip(i)} className="flex-1 flex items-center gap-4 truncate">
                      <span className="text-[9px] font-bold opacity-40">{String(t.trackNo || i + 1).padStart(2, '0')}</span>
                      <span className="font-bold truncate">{t.title}</span>
                      <span className="text-[10px] pl-4 truncate opacity-40">{t.artist}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setEditingTrack(t); }} className="p-1 opacity-0 group-hover:opacity-100 transition"><Edit2 size={11} /></button>
                  </div>
                )) : <div className="h-full flex items-center justify-center opacity-40 tracking-wider p-4 text-center">The queue is completely empty. Go to your library to add songs!</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 flex flex-col overflow-hidden">
            <div className="flex justify-between items-stretch gap-4 mb-6 shrink-0">
              <div className="flex-1 flex flex-col justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider">Music Library Storage</h2>
                <div className={`flex items-center gap-2 border ${ui.border} ${ui.secondaryBg} px-3 py-1.5 mt-2 max-w-md`}>
                  <Search size={12} className="opacity-40" />
                  <input type="text" placeholder="Search songs, artists, albums..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="bg-transparent flex-1 text-inherit outline-none text-[11px] font-mono" />
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-2">
                <div className="flex gap-2">
                  <button onClick={() => setMasterTracks([])} className={`flex items-center gap-2 border ${ui.border} opacity-50 px-4 py-1.5 hover:opacity-100 transition text-[10px] font-bold uppercase`}><Trash2 size={11}/>Clear Library</button>
                  <button onClick={triggerNuclearLoadAll} disabled={!masterTracks.length} className="flex items-center gap-2 border border-red-600 text-red-500 px-4 py-1.5 bg-red-950/10 hover:bg-red-600 hover:text-white disabled:opacity-20 transition text-[10px] font-bold uppercase">☢️ NUKE // LOAD ALL SONGS</button>
                  <button onClick={handleImport} className={`flex items-center gap-2 border ${ui.accentBorder} px-5 py-1.5 transition text-[10px] font-bold uppercase`}><Folder size={11}/>Import Music Files</button>
                </div>
              </div>
            </div>
            
            <div className={`flex-1 border ${ui.border} p-4 overflow-y-auto`}>
              {albums.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {albums.map((a, i) => (
                    <div key={i} onClick={() => { setActiveQueue(a.tracks); setCurrentIdx(0); setActiveTab('playing'); setTimeout(() => executeTrackSkip(0), 25); }} className={`border ${ui.border} p-3 flex flex-col gap-3 group cursor-pointer hover:${ui.accentBorder} transition ${ui.secondaryBg}`}>
                      <div className={`aspect-square border ${ui.border} relative overflow-hidden bg-neutral-900`}>
                        {a.coverArt ? <img src={a.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Disc size={24} className="opacity-20"/></div>}
                        <div className="absolute bottom-1 right-1 bg-black text-white px-1.5 py-0.5 text-[7px] font-bold border border-zinc-800 uppercase opacity-60">{a.tracks.length} tracks</div>
                      </div>
                      <div className="truncate">
                        <div className="font-bold truncate">{a.albumName}</div>
                        <div className="text-[10px] truncate opacity-50 mt-0.5">{a.artistName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center opacity-30 italic tracking-widest text-center p-4">Your library is empty. Click Import Music Files above to load local files!</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`h-6 border-t ${ui.border} px-4 flex items-center gap-3`}>
        <span className="text-[9px] opacity-50">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
        <input type="range" min="0" max={duration || 100} value={currentTime} onChange={e => { const val = parseFloat(e.target.value); if(activeDeckRef.current === 'A') audioARef.current!.currentTime = val; else audioBRef.current!.currentTime = val; }} className={`flex-1 h-1 ${ui.sliderBg} outline-none appearance-none cursor-pointer`} />
        <span className="text-[9px] opacity-50">{Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
      </div>

      <div className={`h-16 border-t ${ui.border} flex items-center justify-between px-6 shrink-0`}>
        <div className="w-1/3 flex items-center gap-3 truncate">
          {currentIdx !== -1 && activeQueue[currentIdx] ? (
            <>
              <div className={`w-10 h-10 border ${ui.border} shrink-0 overflow-hidden flex items-center justify-center bg-neutral-900`}>
                {activeQueue[currentIdx].coverArt ? <img src={activeQueue[currentIdx].coverArt} className="w-full h-full object-cover" /> : <Disc size={16} className="opacity-40" />}
              </div>
              <div className="truncate">
                <div className="text-[12px] font-bold truncate">{activeQueue[currentIdx].title}</div>
                <div className="text-[9px] mt-0.5 uppercase font-bold tracking-widest opacity-40 truncate">{activeQueue[currentIdx].artist} — {activeQueue[currentIdx].album}</div>
              </div>
            </>
          ) : (
            <><div className={`w-10 h-10 border ${ui.border} shrink-0 flex items-center justify-center bg-neutral-900`}><Disc size={16} className="opacity-20" /></div><span className="text-[9px] font-bold tracking-widest opacity-30 uppercase">No track loaded</span></>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => currentIdx > 0 && executeTrackSkip(currentIdx - 1)} disabled={currentIdx <= 0} className={`w-8 h-8 border ${ui.border} flex items-center justify-center transition disabled:opacity-10 hover:${ui.accentBorder}`}><SkipBack size={12} /></button>
          <button onClick={() => { const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!; if(isPlaying){ activeAudio.pause(); setIsPlaying(false); } else if(activeQueue.length){ activeAudio.play().catch(()=>{}); setIsPlaying(true); } }} className={`w-10 h-8 border ${ui.border} flex items-center justify-center transition hover:${ui.accentBorder}`}>{isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}</button>
          <button onClick={() => currentIdx < activeQueue.length - 1 && executeTrackSkip(currentIdx + 1)} disabled={currentIdx === -1 || currentIdx >= activeQueue.length - 1} className={`w-8 h-8 border ${ui.border} flex items-center justify-center transition disabled:opacity-10 hover:${ui.accentBorder}`}><SkipForward size={12} /></button>
          <button onClick={() => setIsLooping(!isLooping)} className="w-8 h-8 border flex items-center justify-center transition ml-2" style={{ backgroundColor: isLooping ? ui.primaryHex : 'transparent', color: isLooping ? '#fff' : 'inherit', borderColor: isLooping ? 'transparent' : 'rgba(120,120,120,0.2)' }}><Repeat size={12} /></button>
        </div>

        <div className="w-1/3 flex items-center justify-end gap-3">
          <div className={`flex items-center gap-2 border ${ui.border} px-3 py-1`}>
            <Volume2 size={11} className="opacity-40" />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} className={`w-14 h-1 ${ui.sliderBg} outline-none appearance-none cursor-pointer`} />
            <span className="text-[9px] font-bold font-mono min-w-6 text-right opacity-60">{Math.round(volume * 100)}%</span>
          </div>
          <div className={`text-[10px] font-bold tracking-widest pl-3 border-l ${ui.border} opacity-40`}>{activeQueue.length ? `[${currentIdx + 1}/${activeQueue.length}]` : '[0/0]'}</div>
        </div>
      </div>
    </div>
  );
}
