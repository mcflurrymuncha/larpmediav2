import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Folder, Repeat, Volume2, Settings, Disc, Trash2, Radio, Library, Sliders } from 'lucide-react';
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

interface RuntimePalette {
  bg: string;
  panel: string;
  border: string;
  text: string;
  secondary: string;
  accent: string;
  accentText: string;
}

export default function QuellqaAudio() {
  const version = "v7.0 // crossfade-matrix";
  const [activeTab, setActiveTab] = useState<'playing' | 'library'>('library');
  
  // Custom Design Architecture Core
  const [palette, setPalette] = useState<RuntimePalette>(() => {
    try {
      const saved = localStorage.getItem('quellqa_custom_palette');
      return saved ? JSON.parse(saved) : { bg: '#000000', panel: '#050505', border: '#161616', text: '#a1a1aa', secondary: '#52525b', accent: '#dc2626', accentText: '#ffffff' };
    } catch(e) { return { bg: '#000000', panel: '#050505', border: '#161616', text: '#a1a1aa', secondary: '#52525b', accent: '#dc2626', accentText: '#ffffff' }; }
  });

  const [masterTracks, setMasterTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem('quellqa_vault_v7');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const [activeQueue, setActiveQueue] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [rpcEnabled, setRpcEnabled] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Crossfade Parametric State Array
  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(4); // Range: 0 (Instant Gapless) to 12 seconds
  const isTransitioningRef = useRef<boolean>(false);

  // Dual-Deck Tracking Variables
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);

  const [preamp, setPreamp] = useState<number>(0);
  const [bass, setBass] = useState<number>(10);   
  const [mid, setMid] = useState<number>(-4);    
  const [treble, setTreble] = useState<number>(3); 
  const [activePreset, setActivePreset] = useState<string>("Custom");

  // Dual HTML5 Audio Nodes for Overlapping Soundfields
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');

  // Web Audio Processing Graph Routing Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainANodeRef = useRef<GainNode | null>(null);
  const gainBNodeRef = useRef<GainNode | null>(null);
  const preampNodeRef = useRef<GainNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => { localStorage.setItem('quellqa_custom_palette', JSON.stringify(palette)); }, [palette]);
  useEffect(() => { localStorage.setItem('quellqa_vault_v7', JSON.stringify(masterTracks)); }, [masterTracks]);

  // Global Audio Graph Hardware Mounting Function
  const initAudioGraph = () => {
    if (audioCtxRef.current) return;
    
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    // Create dual deck source lines
    const srcA = ctx.createMediaElementSource(audioARef.current!);
    const srcB = ctx.createMediaElementSource(audioBRef.current!);

    // Create target mix fader volume matrix blocks
    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    gainANodeRef.current = gainA;
    gainBNodeRef.current = gainB;

    // Build common master parametric filter arrays
    const p = ctx.createGain();
    const b = ctx.createBiquadFilter(); b.type = 'lowshelf'; b.frequency.value = 140;
    const m = ctx.createBiquadFilter(); m.type = 'peaking'; m.frequency.value = 1000;
    const t = ctx.createBiquadFilter(); t.type = 'highshelf'; t.frequency.value = 5000;

    // Route Deck A and Deck B to master processing block
    srcA.connect(gainA).connect(p);
    srcB.connect(gainB).connect(p);
    p.connect(b).connect(m).connect(t).connect(ctx.destination);

    preampNodeRef.current = p; bassNodeRef.current = b; midNodeRef.current = m; trebleNodeRef.current = t;
    
    // Set baseline channel settings
    gainA.gain.value = 1;
    gainB.gain.value = 0;
    updateDsp();
  };

  const updateDsp = () => {
    const now = audioCtxRef.current?.currentTime || 0;
    preampNodeRef.current?.gain.setValueAtTime(Math.pow(10, preamp / 20), now);
    bassNodeRef.current?.gain.setValueAtTime(bass, now);
    midNodeRef.current?.gain.setValueAtTime(mid, now);
    trebleNodeRef.current?.gain.setValueAtTime(treble, now);
  };
  useEffect(() => { updateDsp(); }, [preamp, bass, mid, treble]);

  // Sync Global Volumes
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    // Keep internal faders scaled based on Master Volume setting
    if (activeDeckRef.current === 'A' && !isTransitioningRef.current) {
      gainANodeRef.current?.gain.setValueAtTime(volume, now);
      gainBNodeRef.current?.gain.setValueAtTime(0, now);
    } else if (activeDeckRef.current === 'B' && !isTransitioningRef.current) {
      gainBNodeRef.current?.gain.setValueAtTime(volume, now);
      gainANodeRef.current?.gain.setValueAtTime(0, now);
    }
  }, [volume]);

  // Master Timeline Lookahead Loop Engine (Manages the Crossfade)
  useEffect(() => {
    const handleTimeUpdate = () => {
      const activeAudio = activeDeckRef.current === 'A' ? audioARef.current : audioBRef.current;
      if (!activeAudio || isTransitioningRef.current) return;

      setCurrentTime(activeAudio.currentTime);
      setDuration(activeAudio.duration || 0);

      // Trigger crossfade sequence when track reaches the threshold window
      const remainingTime = activeAudio.duration - activeAudio.currentTime;
      if (remainingTime <= crossfadeDuration && crossfadeDuration > 0 && currentIdx < activeQueue.length - 1) {
        triggerLinearCrossfade();
      }
    };

    const handleEnded = () => {
      if (crossfadeDuration === 0 && currentIdx < activeQueue.length - 1) {
        // If crossfade is disabled (0s), jump instantly to the next track
        executeTrackSkip(currentIdx + 1);
      } else if (currentIdx === activeQueue.length - 1 && !isLooping) {
        setIsPlaying(false);
      } else if (currentIdx === activeQueue.length - 1 && isLooping) {
        executeTrackSkip(0);
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
  }, [currentIdx, activeQueue, crossfadeDuration, isLooping]);

  // Dynamic Linear Crossfade Automation Graph
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

    // Set up the incoming deck track parameters
    incomingAudio.src = activeQueue[nextIdx].url;
    incomingAudio.volume = 1; 
    incomingGain.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
    incomingAudio.play().catch(() => {});

    // Schedule linear volume adjustments over the crossfade timeline
    const now = audioCtxRef.current.currentTime;
    outgoingGain.gain.setValueAtTime(volume, now);
    outgoingGain.gain.linearRampToValueAtTime(0, now + crossfadeDuration);

    incomingGain.gain.setValueAtTime(0, now);
    incomingGain.gain.linearRampToValueAtTime(volume, now + crossfadeDuration);

    // Swap active target pointers mid-flight
    setCurrentIdx(nextIdx);
    activeDeckRef.current = nextDeck;

    setTimeout(() => {
      outgoingAudio.pause();
      outgoingAudio.src = ""; // Flush the outgoing track data from cache
      isTransitioningRef.current = false;
    }, crossfadeDuration * 1000);
  };

  // Instant Track Cut Function (Used for Manual Skips)
  const executeTrackSkip = (targetIdx: number) => {
    if (!activeQueue[targetIdx]) return;
    initAudioGraph();

    isTransitioningRef.current = false;
    const now = audioCtxRef.current!.currentTime;

    const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!;
    const inactiveAudio = activeDeckRef.current === 'A' ? audioBRef.current! : audioARef.current!;
    const activeGain = activeDeckRef.current === 'A' ? gainANodeRef.current! : gainBNodeRef.current!;
    const inactiveGain = activeDeckRef.current === 'A' ? gainBNodeRef.current! : gainANodeRef.current!;

    // Cut off the secondary audio path completely
    inactiveAudio.pause();
    inactiveAudio.src = "";
    inactiveGain.gain.setValueAtTime(0, now);

    // Direct the active deck route to play the target track immediately
    activeGain.gain.setValueAtTime(volume, now);
    activeAudio.src = activeQueue[targetIdx].url;
    activeAudio.play().catch(() => {});
    
    setCurrentIdx(targetIdx);
    setIsPlaying(true);
  };

  // Discord presence sync script line routing
  useEffect(() => {
    if (currentIdx === -1 || !activeQueue[currentIdx]) return;
    const track = activeQueue[currentIdx];
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('sync-native-media', { title: track.title, artist: track.artist, isPlaying });
      ipcRenderer.send('update-rpc', rpcEnabled ? { title: track.title, artist: track.artist, album: track.album, isPlaying } : null);
    } catch(e){}
  }, [isPlaying, currentIdx, activeQueue, rpcEnabled]);

  const albums: AlbumGroup[] = React.useMemo(() => {
    const map: { [key: string]: AlbumGroup } = {};
    masterTracks.forEach(t => {
      const key = (t.album || "Unknown").toLowerCase();
      if (!map[key]) map[key] = { albumName: t.album, artistName: t.artist, coverArt: t.coverArt, tracks: [] };
      map[key].tracks.push(t);
    });
    return Object.values(map).map(a => ({ ...a, tracks: a.tracks.sort((x, y) => x.trackNo - y.trackNo) }));
  }, [masterTracks]);

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
    setMasterTracks(prev => [...prev, ...news]);
  };

  return (
    <div className="flex flex-col h-screen font-mono text-[11px] tracking-tight" style={{ backgroundColor: palette.bg, color: palette.text }}>
      
      {/* Hidden Dual Hardware Elements */}
      <audio ref={audioARef} crossOrigin="anonymous" />
      <audio ref={audioBRef} crossOrigin="anonymous" />
      
      {/* HEADER TIER */}
      <div className="h-10 border-b flex items-center justify-between px-4 titlebar-drag shrink-0" style={{ borderColor: palette.border }}>
        <div className="flex gap-2 titlebar-nodrag">
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'close')} className="w-3 h-3 rounded-full bg-red-600/30 hover:bg-red-600 transition cursor-pointer" />
          <div onClick={() => window.require('electron').ipcRenderer.send('window-control', 'minimize')} className="w-3 h-3 rounded-full bg-zinc-600/30 hover:bg-zinc-400 transition cursor-pointer" />
        </div>
        <div className="flex gap-4 titlebar-nodrag font-bold">
          <button onClick={() => setActiveTab('playing')} className="flex items-center gap-1.5 uppercase transition" style={{ color: activeTab === 'playing' ? palette.accent : palette.secondary }}><Radio size={12}/>Deck Studio</button>
          <button onClick={() => setActiveTab('library')} className="flex items-center gap-1.5 uppercase transition" style={{ color: activeTab === 'library' ? palette.accent : palette.secondary }}><Library size={12}/>Library</button>
        </div>
        <Settings onClick={() => setShowSettings(!showSettings)} size={14} className="cursor-pointer transition titlebar-nodrag" style={{ color: showSettings ? palette.accent : palette.secondary }} />
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* INTERFACE COLOR MATRIX CONFIGURATION MENU */}
        {showSettings && (
          <div className="absolute inset-0 z-50 p-6 flex gap-6" style={{ backgroundColor: palette.bg }}>
            <div className="w-full flex flex-col gap-4 overflow-y-auto" style={{ borderColor: palette.border }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: palette.accent }}>Hex Synthesis Matrices</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Background Color hex', key: 'bg' },
                  { label: 'Inner Housing structural panel', key: 'panel' },
                  { label: 'Structural Separation Vector line', key: 'border' },
                  { label: 'Primary text font color', key: 'text' },
                  { label: 'Secondary dimmed parametric tags', key: 'secondary' },
                  { label: 'Active processing accent node', key: 'accent' },
                ].map((node) => (
                  <div key={node.key} className="flex items-center justify-between p-2 border rounded" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
                    <span className="font-bold text-[10px] uppercase tracking-tight">{node.label}</span>
                    <input type="color" value={palette[node.key as keyof RuntimePalette]} onChange={(e) => setPalette(prev => ({ ...prev, [node.key]: e.target.value }))} className="w-7 h-5 cursor-pointer bg-transparent border-none" />
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full mt-4 py-2 font-bold text-[10px] uppercase tracking-widest text-center" style={{ backgroundColor: palette.accent, color: palette.accentText }}>Flush Design modifications</button>
            </div>
          </div>
        )}

        {activeTab === 'playing' ? (
          <div className="flex-1 flex">
            
            {/* PARAMETRIC CONFIGURATION HUB BAR */}
            <div className="w-64 border-r p-5 flex flex-col justify-between shrink-0" style={{ borderColor: palette.border }}>
              <div className="flex flex-col gap-4">
                
                {/* CROSSFADE DESIGN BLOCK AREA */}
                <div className="border p-3 rounded flex flex-col gap-2" style={{ backgroundColor: palette.panel, borderColor: palette.border }}>
                  <div className="flex justify-between items-center text-[9px] font-bold">
                    <span style={{ color: palette.accent }}>CROSSFADE TIMELINE</span>
                    <span>{crossfadeDuration} SECONDS</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="12" 
                    step="1" 
                    value={crossfadeDuration} 
                    onChange={e => setCrossfadeDuration(parseInt(e.target.value))}
                    className="w-full h-1 outline-none appearance-none cursor-pointer"
                    style={{ backgroundColor: palette.border }}
                  />
                  <div className="text-[8px] opacity-40 leading-tight">Sets the overlap transition curve window for overlapping tracks. Set to 0 for instant, gapless studio cuts.</div>
                </div>

                <div className="h-32 border p-3 flex justify-between" style={{ backgroundColor: palette.panel, borderColor: palette.border }}>
                  {[{l:'BASS',v:bass,s:setBass},{l:'MID',v:mid,s:setMid},{l:'TREB',v:treble,s:setTreble}].map((c,i)=>(
                    <div key={i} className="flex flex-col items-center justify-between w-1/3">
                      <span className="text-[9px] font-bold">{c.v > 0 ? '+'+c.v : c.v}</span>
                      <input type="range" min="-12" max="12" step="0.5" value={c.v} orient="vertical" onChange={e=>c.s(parseFloat(e.target.value))} className="h-16 w-1 outline-none appearance-none" style={{ backgroundColor: palette.border }} />
                      <span className="text-[8px] font-bold mt-1" style={{ color: palette.secondary }}>{c.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 flex-col items-center justify-center py-4">
                <div className="w-36 h-36 border flex items-center justify-center overflow-hidden" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
                  {activeQueue[currentIdx]?.coverArt ? <img src={activeQueue[currentIdx].coverArt} className="w-full h-full object-cover" /> : <Disc size={35} className="animate-spin-slow" style={{ color: palette.secondary }} />}
                </div>
              </div>

              <div className="border p-3" style={{ backgroundColor: palette.panel, borderColor: palette.border }}>
                <div className="flex justify-between text-[9px] font-bold mb-2"><span>PRE_AMP</span><span>{preamp} DB</span></div>
                <input type="range" min="-12" max="12" step="0.5" value={preamp} onChange={e=>setPreamp(parseFloat(e.target.value))} className="w-full h-1 outline-none appearance-none" style={{ backgroundColor: palette.border }} />
              </div>
            </div>

            {/* CHANNEL ACTIVE DISPATCH QUEUE PANELS */}
            <div className="flex-1 p-5 flex flex-col">
              <span className="text-[10px] font-bold uppercase mb-4 tracking-widest" style={{ color: palette.secondary }}>Active Deck Matrix Stack</span>
              <div className="flex-1 border overflow-y-auto" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
                {activeQueue.length ? activeQueue.map((t,i)=>(
                  <div 
                    key={i} 
                    onClick={() => executeTrackSkip(i)} 
                    className="flex items-center justify-between p-3 border-b cursor-pointer transition" 
                    style={{ 
                      borderColor: palette.border, 
                      backgroundColor: currentIdx === i ? palette.accent : 'transparent',
                      color: currentIdx === i ? palette.accentText : palette.text 
                    }}
                  >
                    <div className="flex items-center gap-4 truncate">
                      <span className="text-[9px] font-bold" style={{ color: currentIdx === i ? palette.accentText : palette.secondary }}>{String(t.trackNo||i+1).padStart(2,'0')}</span>
                      <span className="font-bold truncate">{t.title}</span>
                    </div>
                    <span className="text-[10px] pl-4 shrink-0" style={{ color: currentIdx === i ? palette.accentText : palette.secondary }}>{t.artist}</span>
                  </div>
                )) : <div className="h-full flex items-center justify-center italic opacity-30 tracking-widest">Deck Processing Line Unassigned</div>}
              </div>
            </div>
          </div>
        ) : (
          /* ================= COMPACT LIBRARY PANEL GRIDS ================= */
          <div className="flex-1 p-8 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: palette.accent }}>Integrated Data Storage Vault</h2>
                <p className="text-[10px]" style={{ color: palette.secondary }}>Mounting a storage folder completely replaces the active deck stream array.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setMasterTracks([])} className="flex items-center gap-2 border px-4 py-2 text-[10px] font-bold uppercase" style={{ borderColor: palette.accent, color: palette.accent }}><Trash2 size={12}/>Wipe library</button>
                <label className="flex items-center gap-2 border px-6 py-2 cursor-pointer text-[10px] font-bold uppercase" style={{ borderColor: palette.border, color: palette.text }}>
                  <Folder size={12}/>Mount Audio Block
                  <input type="file" multiple accept="audio/*" onChange={handleImport} className="hidden" />
                </label>
              </div>
            </div>
            
            <div className="flex-1 border p-5 overflow-y-auto" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
              {albums.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {albums.map((a,i)=>(
                    <div key={i} onClick={() => { setActiveQueue(a.tracks); setCurrentIdx(0); setActiveTab('playing'); setTimeout(() => executeTrackSkip(0), 50); }} className="border p-4 flex flex-col gap-4 group cursor-pointer transition" style={{ borderColor: palette.border, backgroundColor: palette.bg }}>
                      <div className="aspect-square border relative overflow-hidden" style={{ borderColor: palette.border }}>
                        {a.coverArt ? <img src={a.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Disc size={30} style={{ color: palette.secondary }}/></div>}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 text-[8px] font-bold border uppercase" style={{ backgroundColor: palette.bg, borderColor: palette.border, color: palette.secondary }}>{a.tracks.length} lines</div>
                      </div>
                      <div className="truncate">
                        <div className="font-bold truncate" style={{ color: palette.text }}>{a.albumName}</div>
                        <div className="text-[10px] truncate mt-0.5" style={{ color: palette.secondary }}>{a.artistName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center opacity-40 italic tracking-widest"><Disc size={40} className="mb-2 animate-spin-slow"/>Empty Storage Vault</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TRACK TIMELINE DISPLAY BAR */}
      <div className="h-6 border-t px-4 flex items-center gap-3" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
        <span className="text-[9px]" style={{ color: palette.secondary }}>
          {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}
        </span>
        <input type="range" min="0" max={duration || 100} value={currentTime} onChange={e=>{ const val = parseFloat(e.target.value); if(activeDeckRef.current === 'A') audioARef.current!.currentTime = val; else audioBRef.current!.currentTime = val; }} className="flex-1 h-1 appearance-none outline-none cursor-pointer" style={{ backgroundColor: palette.border }} />
        <span className="text-[9px]" style={{ color: palette.secondary }}>
          {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
        </span>
      </div>

      {/* RUNTIME TELEMETRY TRACK PANEL FOOTER */}
      <div className="h-20 border-t flex items-center justify-between px-6 shrink-0" style={{ borderColor: palette.border, backgroundColor: palette.panel }}>
        <div className="w-1/3 truncate">
          {currentIdx !== -1 && activeQueue[currentIdx] ? (
            <>
              <div className="text-[13px] font-bold truncate" style={{ color: palette.text }}>{activeQueue[currentIdx].title}</div>
              <div className="text-[10px] mt-1 uppercase font-bold tracking-widest" style={{ color: palette.secondary }}>{activeQueue[currentIdx].artist} // {activeQueue[currentIdx].album}</div>
            </>
          ) : (
            <span className="text-[10px] font-bold tracking-widest" style={{ color: palette.secondary }}>DECK RUNTIME STANDBY</span>
          )}
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => currentIdx > 0 && executeTrackSkip(currentIdx - 1)} disabled={currentIdx <= 0} className="w-9 h-9 border flex items-center justify-center transition disabled:opacity-10" style={{ borderColor: palette.border }}><SkipBack size={13} /></button>
          <button onClick={() => { 
            const activeAudio = activeDeckRef.current === 'A' ? audioARef.current! : audioBRef.current!;
            if(isPlaying){ activeAudio.pause(); setIsPlaying(false); } else if(activeQueue.length){ activeAudio.play().catch(()=>{}); setIsPlaying(true); } 
          }} className="w-12 h-9 border flex items-center justify-center transition" style={{ borderColor: palette.border }}>{isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}</button>
          <button onClick={() => currentIdx < activeQueue.length - 1 && executeTrackSkip(currentIdx + 1)} disabled={currentIdx === -1 || currentIdx >= activeQueue.length - 1} className="w-9 h-9 border flex items-center justify-center transition disabled:opacity-10" style={{ borderColor: palette.border }}><SkipForward size={13} /></button>
          <button onClick={() => setIsLooping(!isLooping)} className="w-9 h-9 border flex items-center justify-center transition ml-3" style={{ backgroundColor: isLooping ? palette.accent : 'transparent', color: isLooping ? palette.accentText : palette.secondary, borderColor: palette.border }}><Repeat size={13} /></button>
        </div>

        <div className="w-1/3 flex items-center justify-end gap-4">
          <div className="flex items-center gap-2 border px-3 py-1.5 rounded" style={{ borderColor: palette.border, backgroundColor: palette.bg }}>
            <Volume2 size={12} style={{ color: palette.secondary }} />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setVolume(parseFloat(e.target.value))} className="w-16 h-1 appearance-none outline-none cursor-pointer" style={{ backgroundColor: palette.border }} />
            <span className="text-[10px] font-bold font-mono min-w-8 text-right" style={{ color: palette.text }}>{Math.round(volume * 100)}%</span>
          </div>
          <div className="text-[11px] font-bold tracking-widest pl-3 border-l" style={{ borderColor: palette.border, color: palette.secondary }}>
            {activeQueue.length ? `[${currentIdx + 1}/${activeQueue.length}]` : '[0/0]'}
          </div>
        </div>
      </div>
    </div>
  );
}
