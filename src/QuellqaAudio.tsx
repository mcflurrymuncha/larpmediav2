import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Folder, Repeat, Volume2, Disc, Trash2, Radio, Library, Search, Edit2 } from 'lucide-react';
import * as musicMetadata from 'music-metadata-browser';

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  trackNo: number;
  url: string;
  coverArt: string; 
}

interface AlbumGroup {
  albumName: string;
  artistName: string;
  coverArt: string;
  tracks: Track[];
}

// Low-Level IndexedDB Native Core Initialization
const DB_NAME = "QuellqaArchivalDB";
const STORE_NAME = "tracks";

const initIndexedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveTracksToDB = async (tracks: Track[]): Promise<void> => {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    tracks.forEach(track => store.put(track));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const getTracksFromDB = async (): Promise<Track[]> => {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const clearDBStore = async (): Promise<void> => {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

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

  const [pitchRate, setPitchRate] = useState<number>(1.0); 
  const [stereoPan, setStereoPan] = useState<number>(0.0); 
  const [crossfadeDuration] = useState<number>(4); 
  const isTransitioningRef = useRef<boolean>(false);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);

  const [preamp, setPreamp] = useState<number>(0);
  const [subBass, setSubBass] = useState<number>(6);   
  const [lowMid, setLowMid] = useState<number>(3);     
  const [mid, setMid] = useState<number>(-2);         
  const [highMid, setHighMid] = useState<number>(4);   
  const [treble, setTreble] = useState<number>(2);     

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

  // Load from database on startup boot cycle
  useEffect(() => {
    getTracksFromDB().then(tracks => {
      setMasterTracks(tracks);
    }).catch(err => console.error("Database mount failure", err));
  }, []);

  useEffect(() => {
    if (currentIdx !== -1 && activeQueue[currentIdx]) {
      const currentTrack = activeQueue[currentIdx];
      document.title = `Playing: ${currentTrack.title} — ${currentTrack.artist}`;
    } else {
      document.title = "QUELLQA V8.5";
    }
  }, [currentIdx, activeQueue, isPlaying]);

  const initAudioGraph = () => {
    if (audioCtxRef.current) return;
    
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const srcA = ctx.createMediaElementSource(audioARef.current!);
    const srcB = ctx.createMediaElementSource(audioBRef.current!);

    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    gainANodeRef.current = gainA; gainBNodeRef.current = gainB;

    const p = ctx.createGain();
    const panner = ctx.createStereoPanner();
    pannerNodeRef.current = panner;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; 
    analyserNodeRef.current = analyser;

    const eqSub = ctx.createBiquadFilter(); eqSub.type = 'lowshelf'; eqSub.frequency.value = 60;
    const eqLowMid = ctx.createBiquadFilter(); eqLowMid.type = 'peaking'; eqLowMid.frequency.value = 230;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 910;
    const eqHighMid = ctx.createBiquadFilter(); eqHighMid.type = 'peaking'; eqHighMid.frequency.value = 4000;
    const eqTreb = ctx.createBiquadFilter(); eqTreb.type = 'highshelf'; eqTreb.frequency.value = 14000;

    srcA.connect(gainA).connect(p);
    srcB.connect(gainB).connect(p);
    
    p.connect(panner).connect(eqSub).connect(eqLowMid).connect(eqMid).connect(eqHighMid).connect(eqTreb).connect(analyser).connect(ctx.destination);

    preampNodeRef.current = p; 
    subNodeRef.current = eqSub; lowMidNodeRef.current = eqLowMid; 
    midNodeRef.current = eqMid; highMidNodeRef.current = eqHighMid; 
    trebNodeRef.current = eqTreb;
    
    gainA.gain.value = volume;
    gainB.gain.value = 0;
    
    updateDsp();
    startCanvasRenderLoop();
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
      gainANodeRef.current?.gain.setValueAtTime(volume, now);
      gainBNodeRef.current?.gain.setValueAtTime(0, now);
    } else if (activeDeckRef.current === 'B' && !isTransitioningRef.current) {
      gainBNodeRef.current?.gain.setValueAtTime(volume, now);
      gainANodeRef.current?.gain.setValueAtTime(0, now);
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
        if (isLooping) executeTrackSkip(0);
        else setIsPlaying(false);
      }
    };

    const aElement = audioARef.current;
    const bElement = audioBRef.current;
    aElement?.addEventListener('timeupdate', handleTimeUpdate);
    bElement?.addEventListener('timeupdate', handleTimeUpdate);
    aElement?.addEventListener('ended', handleEnded);
    bElement?.addEventListener('ended', handleEnded);

    return () => {
      aElement?.removeEventListener('timeupdate', handleTimeUpdate);
      bElement?.removeEventListener('timeupdate', handleTimeUpdate);
      aElement?.removeEventListener('ended', handleEnded);
      bElement?.removeEventListener('ended', handleEnded);
    };
  }, [currentIdx, activeQueue, isLooping]);

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
    
    setIsPlaying(true); 
    incomingAudio.play().catch(() => {});

    const now = audioCtxRef.current.currentTime;
    outgoingGain.gain.setValueAtTime(volume, now);
    outgoingGain.gain.linearRampToValueAtTime(0, now + crossfadeDuration);

    incomingGain.gain.setValueAtTime(0, now);
    incomingGain.gain.linearRampToValueAtTime(volume, now + crossfadeDuration);

    setCurrentIdx(nextIdx);
    activeDeckRef.current = nextDeck;

    setTimeout(() => {
      outgoingAudio.pause();
      outgoingAudio.src = "";
      isTransitioningRef.current = false;
    }, crossfadeDuration * 1000);
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

    inactiveAudio.pause(); inactiveAudio.src = "";
    inactiveGain.gain.setValueAtTime(0, now);

    activeGain.gain.setValueAtTime(volume, now);
    activeAudio.src = activeQueue[targetIdx].url;
    activeAudio.playbackRate = pitchRate;
    
    setIsPlaying(true);
    activeAudio.play().catch(() => {});
    setCurrentIdx(targetIdx);
  };

  const startCanvasRenderLoop = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const canvas = canvasRef.current;
    const analyser = analyserNodeRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.25;
      let barHeight; let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] * 0.45;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    render();
  };

  const applyMetadataOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;

    const updatedMaster = masterTracks.map(t => t.id === editingTrack.id ? editingTrack : t);
    setMasterTracks(updatedMaster);
    const updatedQueue = activeQueue.map(t => t.id === editingTrack.id ? editingTrack : t);
    setActiveQueue(updatedQueue);

    await saveTracksToDB([editingTrack]);
    setEditingTrack(null);
  };

  const albums: AlbumGroup[] = React.useMemo(() => {
    const map: { [key: string]: AlbumGroup } = {};
    const query = searchQuery.toLowerCase().trim();
    const filtered = masterTracks.filter(t => 
      t.title.toLowerCase().includes(query) || 
      t.artist.toLowerCase().includes(query) || 
      t.album.toLowerCase().includes(query)
    );

    filtered.forEach(t => {
      const key = (t.album || "Unknown").toLowerCase().trim();
      if (!map[key]) map[key] = { albumName: t.album, artistName: t.artist, coverArt: t.coverArt, tracks: [] };
      map[key].tracks.push(t);
    });

    return Object.values(map).map(a => ({
      ...a,
      tracks: a.tracks.sort((x, y) => {
        if (sortBy === 'alpha') return x.title.localeCompare(y.title);
        return x.trackNo - y.trackNo;
      })
    }));
  }, [masterTracks, searchQuery, sortBy]);

  const handleImport = async (e: any) => {
    const files = e.target.files;
    if (!files) return;
    const news: Track[] = [];
    for (let f of files) {
      if (f.name.match(/\.(mp3|wav|flac|m4a)$/i)) {
        try {
          const meta = await musicMetadata.parseBlob(f);
          let art = "";
          if (meta.common.picture?.[0]) {
            const pic = meta.common.picture[0];
            art = `data:${pic.format};base64,${btoa(pic.data.reduce((d, b) => d + String.fromCharCode(b), ''))}`;
          }
          news.push({ id: Date.now() + Math.random(), title: meta.common.title || f.name, artist: meta.common.artist || "Unknown", album: meta.common.album || "Local", trackNo: meta.common.track.no || 0, url: URL.createObjectURL(f), coverArt: art });
        } catch(err) {}
      }
    }
    const globalPlaylist = [...masterTracks, ...news];
    setMasterTracks(globalPlaylist);
    await saveTracksToDB(news); // Stream directly to IndexedDB sectors safely
  };

  const wipeLibrary = async () => {
    setMasterTracks([]); setActiveQueue([]); setCurrentIdx(-1); setIsPlaying(false);
    if (audioRef.current) audioRef.current.src = "";
    await clearDBStore();
  };

  return (
    <div className="flex flex-col h-screen font-mono text-[11px] tracking-tight bg-black text-white selection:bg-zinc-800">
      <style>{`
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 8px; height: 12px; background: #ffffff; cursor: pointer; border-radius: 0px; }
        input[type="range"]::-moz-range-thumb { width: 8px; height: 12px; background: #ffffff; cursor: pointer; border-radius: 0px; border: none; }
      `}</style>

      <audio ref={audioARef} crossOrigin="anonymous" />
      <audio ref={audioBRef} crossOrigin="anonymous" />
      
      {/* HEADER OPERATIONS PANEL */}
      <div className="h-10 border-b border-zinc-900 flex items-center justify-between px-4 titlebar-drag shrink-0 bg-black">
        <div className="flex gap-2 titlebar-nodrag">
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'close')} className="w-3 h-3 rounded-full bg-zinc-900 hover:bg-red-600 transition cursor-pointer" />
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'minimize')} className="w-3 h-3 rounded-full bg-zinc-900 hover:bg-zinc-700 transition cursor-pointer" />
        </div>
        <div className="flex gap-6 titlebar-nodrag font-bold">
          <button onClick={() => setActiveTab('playing')} className={`flex items-center gap-1.5 uppercase transition ${activeTab === 'playing' ? 'text-white' : 'text-zinc-600'}`}><Radio size={12}/>Deck Studio</button>
          <button onClick={() => setActiveTab('library')} className={`flex items-center gap-1.5 uppercase transition ${activeTab === 'library' ? 'text-white' : 'text-zinc-600'}`}><Library size={12}/>Library Vault</button>
        </div>
        <span className="text-[9px] font-bold tracking-widest text-zinc-700">DB_SECURE_V8.5</span>
      </div>

      <div className="flex-1 flex overflow-hidden bg-black relative">
        {editingTrack && (
          <div className="absolute inset-0 bg-black bg-opacity-95 z-50 p-8 flex items-center justify-center">
            <form onSubmit={applyMetadataOverride} className="w-full max-w-sm border border-zinc-900 p-6 flex flex-col gap-4 bg-black">
              <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">Modify Cache ID3 Tags</span>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-zinc-600 uppercase font-bold">Track Title</label>
                <input type="text" value={editingTrack.title} onChange={e=>setEditingTrack({...editingTrack, title: e.target.value})} className="bg-zinc-950 border border-zinc-900 p-2 text-white outline-none" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-zinc-600 uppercase font-bold">Recording Artist</label>
                <input type="text" value={editingTrack.artist} onChange={e=>setEditingTrack({...editingTrack, artist: e.target.value})} className="bg-zinc-950 border border-zinc-900 p-2 text-white outline-none" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-zinc-600 uppercase font-bold">Target Album Compilation</label>
                <input type="text" value={editingTrack.album} onChange={e=>setEditingTrack({...editingTrack, album: e.target.value})} className="bg-zinc-950 border border-zinc-900 p-2 text-white outline-none" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-zinc-600 uppercase font-bold">Index Track Position No</label>
                <input type="number" value={editingTrack.trackNo} onChange={e=>setEditingTrack({...editingTrack, trackNo: parseInt(e.target.value) || 0})} className="bg-zinc-950 border border-zinc-900 p-2 text-white outline-none" required />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={()=>setEditingTrack(null)} className="w-1/2 border border-zinc-900 py-2 font-bold uppercase text-zinc-500 hover:text-white transition">Cancel</button>
                <button type="submit" className="w-1/2 bg-white text-black font-bold uppercase py-2 transition">Commit Tags</button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'playing' ? (
          <div className="flex-1 flex">
            <div className="w-64 border-r border-zinc-900 p-4 flex flex-col justify-between shrink-0 bg-black overflow-y-auto">
              <div className="flex flex-col gap-4">
                <div className="border border-zinc-900 p-3 flex flex-col gap-3 bg-black">
                  <span className="text-[8px] font-bold tracking-widest text-zinc-500 uppercase">Varispeed Sub-system</span>
                  <div>
                    <div className="flex justify-between text-[8px] font-bold text-zinc-400 mb-1"><span>PITCH RATE</span><span>{pitchRate.toFixed(2)}x</span></div>
                    <input type="range" min="0.5" max="2.0" step="0.01" value={pitchRate} onChange={e=>setPitchRate(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-900 outline-none appearance-none" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[8px] font-bold text-zinc-400 mb-1"><span>STEREO BALANCE</span><span>{stereoPan === 0 ? 'CENTER' : stereoPan < 0 ? `L ${Math.abs(Math.round(stereoPan * 100))}%` : `R ${Math.round(stereoPan * 100)}%`}</span></div>
                    <input type="range" min="-1.0" max="1.0" step="0.02" value={stereoPan} onChange={e=>setStereoPan(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-900 outline-none appearance-none" />
                  </div>
                </div>

                <div className="h-40 border border-zinc-900 p-3 flex justify-between bg-black">
                  {[
                    { label: '60Hz', v: subBass, s: setSubBass },
                    { label: '230Hz', v: lowMid, s: setLowMid },
                    { label: '910Hz', v: mid, s: setMid },
                    { label: '4kHz', v: highMid, s: setHighMid },
                    { label: '14kHz', v: treble, s: setTreble }
                  ].map((c, i) => (
                    <div key={i} className="flex flex-col items-center justify-between w-1/5">
                      <span className="text-[8px] font-bold text-zinc-400">{c.v > 0 ? `+${c.v}` : c.v}</span>
                      <input type="range" min="-12" max="12" step="1" value={c.v} orient="vertical" onChange={e => c.s(parseFloat(e.target.value))} className="h-24 w-1 bg-zinc-900 outline-none appearance-none" />
                      <span className="text-[7px] font-bold text-zinc-600 tracking-tighter mt-1">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 py-3 border-t border-b border-zinc-900/50 my-2">
                <span className="text-[8px] font-bold tracking-widest text-zinc-500 uppercase">FFT Frequency Transform</span>
                <div className="w-full h-16 border border-zinc-900 relative bg-black overflow-hidden">
                  <canvas ref={canvasRef} width="222" height="64" className="w-full h-full block" />
                </div>
              </div>

              <div className="border border-zinc-900 p-3 bg-black">
                <div className="flex justify-between text-[9px] font-bold text-zinc-400 mb-1"><span>GAIN PRE_AMP</span><span>{preamp} DB</span></div>
                <input type="range" min="-12" max="12" step="0.5" value={preamp} onChange={e => setPreamp(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-900 outline-none appearance-none" />
              </div>
            </div>

            <div className="flex-1 p-5 flex flex-col bg-black">
              <span className="text-[10px] font-bold uppercase mb-3 tracking-widest text-zinc-600">Active Queue Pipeline</span>
              <div className="flex-1 border border-zinc-900 overflow-y-auto bg-black">
                {activeQueue.length ? activeQueue.map((t, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-3 border-b border-zinc-900 cursor-pointer transition group" 
                    style={{ backgroundColor: currentIdx === i ? '#ffffff' : 'transparent', color: currentIdx === i ? '#000000' : '#ffffff' }}
                  >
                    <div onClick={() => executeTrackSkip(i)} className="flex-1 flex items-center gap-4 truncate">
                      <span className="text-[9px] font-bold" style={{ color: currentIdx === i ? '#000000' : '#52525b' }}>{String(t.trackNo || i + 1).padStart(2, '0')}</span>
                      <span className="font-bold truncate">{t.title}</span>
                      <span className="text-[10px] pl-4 truncate opacity-60" style={{ color: currentIdx === i ? '#222' : '#52525b' }}>{t.artist}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setEditingTrack(t); }} className={`p-1 opacity-0 group-hover:opacity-100 transition rounded ${currentIdx === i ? 'text-black hover:bg-zinc-200' : 'text-zinc-500 hover:text-white'}`}><Edit2 size={11} /></button>
                  </div>
                )) : <div className="h-full flex items-center justify-center italic text-zinc-700 tracking-widest">Deck Workspace Stack Empty</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 flex flex-col overflow-hidden bg-black">
            <div className="flex justify-between items-stretch gap-4 mb-6 shrink-0">
              <div className="flex-1 flex flex-col justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">Archival System Vault</h2>
                <div className="flex items-center gap-2 border border-zinc-900 bg-zinc-950 px-3 py-1.5 mt-2 max-w-md">
                  <Search size={12} className="text-zinc-600" />
                  <input type="text" placeholder="Fuzzy query tracks, artists, unreleased tags..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="bg-transparent flex-1 text-white outline-none border-none text-[11px] font-mono" />
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-2">
                <div className="flex gap-2 text-[9px] items-center">
                  <span className="text-zinc-600 font-bold uppercase">Matrix Sort:</span>
                  <button onClick={()=>setSortBy('track')} className={`px-2 py-0.5 border ${sortBy === 'track' ? 'border-white text-white font-bold' : 'border-zinc-900 text-zinc-600'}`}>Track No</button>
                  <button onClick={()=>setSortBy('alpha')} className={`px-2 py-0.5 border ${sortBy === 'alpha' ? 'border-white text-white font-bold' : 'border-zinc-900 text-zinc-600'}`}>A-Z Title</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={wipeLibrary} className="flex items-center gap-2 border border-zinc-900 text-zinc-500 px-4 py-1.5 hover:bg-zinc-900/50 transition text-[10px] font-bold uppercase"><Trash2 size={11}/>Clear Storage</button>
                  <label className="flex items-center gap-2 border border-white text-white px-5 py-1.5 cursor-pointer hover:bg-white hover:text-black transition text-[10px] font-bold uppercase">
                    <Folder size={11}/>Mount Directory Loop
                    <input type="file" multiple accept="audio/*" onChange={handleImport} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex-1 border border-zinc-900 p-4 overflow-y-auto bg-black">
              {albums.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {albums.map((a, i) => (
                    <div key={i} onClick={() => { setActiveQueue(a.tracks); setCurrentIdx(0); setActiveTab('playing'); setTimeout(() => executeTrackSkip(0), 25); }} className="border border-zinc-900 p-3 flex flex-col gap-3 group cursor-pointer hover:border-white transition bg-black">
                      <div className="aspect-square border border-zinc-900 relative overflow-hidden bg-black">
                        {a.coverArt ? <img src={a.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-zinc-950"><Disc size={24} className="text-zinc-800"/></div>}
                        <div className="absolute bottom-1 right-1 bg-black px-1.5 py-0.5 text-[7px] font-bold border border-zinc-900 uppercase text-zinc-500">{a.tracks.length} lines</div>
                      </div>
                      <div className="truncate">
                        <div className="font-bold truncate text-white">{a.albumName}</div>
                        <div className="text-[10px] truncate text-zinc-600 mt-0.5">{a.artistName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-700 italic tracking-widest">Database Storage Filter Engine Returned Null</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="h-6 border-t border-zinc-900 px-4 flex items-center gap-3 bg-black">
        <span className="text-[9px] text-zinc-500">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
        <input type="range" min="0" max={duration || 100} value={currentTime} onChange={e => { const val = parseFloat(e.target.value); if(activeDeckRef.current === 'A') audioARef.current!.currentTime = val; else audioBRef.current!.currentTime = val; }} className="flex-1 h-1 bg-zinc-900 outline-none appearance-none cursor-pointer" />
        <span className="text-[9px] text-zinc-500">{Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
      </div>

      <div className="h-16 border-t border-zinc-900 flex items-center justify-between px-6 shrink-0 bg-black">
        <div className="w-1/3 truncate">
          {currentIdx !== -1 && activeQueue[currentIdx] ? (
            <>
              <div className="text-[12px] font-bold truncate text-white">{activeQueue[currentIdx].title}</div>
              <div className="text-[9px] mt-0.5 uppercase font-bold tracking-widest text-zinc-600">{activeQueue[currentIdx].artist} // {activeQueue[currentIdx].album}</div>
            </>
          ) : (
            <span className="text-[9px] font-bold tracking-widest text-zinc-700 uppercase">System Standby</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => currentIdx > 0 && executeTrackSkip(currentIdx - 1)} disabled={currentIdx <= 0} className="w-8 h-8 border border-zinc-900 flex items-center justify-center transition disabled:opacity-10 text-white hover:border-white"><SkipBack size={12} /></button>
          <button onClick={() => { 
            const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!;
            if(isPlaying){ activeAudio.pause(); setIsPlaying(false); } else if(activeQueue.length){ activeAudio.play().catch(()=>{}); setIsPlaying(true); } 
          }} className="w-10 h-8 border border-zinc-900 flex items-center justify-center transition text-white hover:border-white">{isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}</button>
          <button onClick={() => currentIdx < activeQueue.length - 1 && executeTrackSkip(currentIdx + 1)} disabled={currentIdx === -1 || currentIdx >= activeQueue.length - 1} className="w-8 h-8 border border-zinc-900 flex items-center justify-center transition disabled:opacity-10 text-white hover:border-white"><SkipForward size={12} /></button>
          <button onClick={() => setIsLooping(!isLooping)} className="w-8 h-8 border flex items-center justify-center transition ml-2" style={{ backgroundColor: isLooping ? '#ffffff' : 'transparent', color: isLooping ? '#000000' : '#52525b', borderColor: isLooping ? 'transparent' : '#1f1f23' }}><Repeat size={12} /></button>
        </div>

        <div className="w-1/3 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 border border-zinc-900 px-3 py-1 bg-black">
            <Volume2 size={11} className="text-zinc-600" />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} className="w-14 h-1 bg-zinc-900 outline-none appearance-none cursor-pointer" />
            <span className="text-[9px] font-bold font-mono min-w-6 text-right text-zinc-400">{Math.round(volume * 100)}%</span>
          </div>
          <div className="text-[10px] font-bold tracking-widest pl-3 border-l border-zinc-900 text-zinc-600">{activeQueue.length ? `[${currentIdx + 1}/${activeQueue.length}]` : '[0/0]'}</div>
        </div>
      </div>
    </div>
  );
}
