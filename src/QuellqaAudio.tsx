import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Folder, Repeat, Volume2, Settings, Sun, Moon, Disc } from 'lucide-react';
import * as musicMetadata from 'music-metadata-browser';

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  trackNo: number;
  url: string;
  coverArt: string; 
  rpcArt: string;   
}

export default function QuellqaAudio() {
  const version = "QUELLQA V5";
  
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  
  const [isLightMode, setIsLightMode] = useState<boolean>(false);
  const [rpcEnabled, setRpcEnabled] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);

  const [preamp, setPreamp] = useState<number>(0);
  const [bass, setBass] = useState<number>(10);   
  const [mid, setMid] = useState<number>(-4);    
  const [treble, setTreble] = useState<number>(3); 

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const preampNodeRef = useRef<GainNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    if (currentIdx !== -1 && playlist[currentIdx]) {
      document.title = playlist[currentIdx].title;
    } else {
      document.title = "QUELLQA";
    }
  }, [currentIdx, playlist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (currentIdx === -1) return;
    const track = playlist[currentIdx];
    
    try {
      window.require('electron').ipcRenderer.send('sync-native-media', {
        title: track.title,
        artist: track.artist,
        album: track.album,
        isPlaying: isPlaying
      });
    } catch(e){}

    if (!rpcEnabled) {
      try { window.require('electron').ipcRenderer.send('update-rpc', null); } catch(e){}
    } else if (rpcEnabled) {
      try { 
        window.require('electron').ipcRenderer.send('update-rpc', { 
          title: track.title, 
          artist: track.artist, 
          album: track.album, 
          isPlaying: isPlaying,
          rpcArt: track.rpcArt 
        }); 
      } catch (e) {}
    }
  }, [isPlaying, currentIdx, rpcEnabled]);

  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      const handleMediaCommand = (_event: any, command: string) => {
        if (command === 'play-pause') togglePlayState();
        if (command === 'next') { if (currentIdx < playlist.length - 1) startTrackPipeline(currentIdx + 1); }
        if (command === 'prev') { if (currentIdx > 0) startTrackPipeline(currentIdx - 1); }
      };
      ipcRenderer.on('media-command', handleMediaCommand);
      return () => { ipcRenderer.removeListener('media-command', handleMediaCommand); };
    } catch(e){}
  }, [currentIdx, playlist, isPlaying]);

  const runWindowAction = (action: 'close' | 'minimize') => {
    try { window.require('electron').ipcRenderer.send('window-control', action); } catch(e){}
  };

  const initAudioGraph = () => {
    if (!audioRef.current || audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;

    const preampNode = ctx.createGain();
    const bassNode = ctx.createBiquadFilter();
    const midNode = ctx.createBiquadFilter();
    const trebleNode = ctx.createBiquadFilter();

    bassNode.type = 'lowshelf';
    bassNode.frequency.value = 140; 

    midNode.type = 'peaking';
    midNode.Q.value = 1.5;
    midNode.frequency.value = 1000;

    trebleNode.type = 'highshelf';
    trebleNode.frequency.value = 5000;

    source.connect(preampNode);
    preampNode.connect(bassNode);
    bassNode.connect(midNode);
    midNode.connect(trebleNode);
    trebleNode.connect(ctx.destination);

    preampNodeRef.current = preampNode;
    bassNodeRef.current = bassNode;
    midNodeRef.current = midNode;
    trebleNodeRef.current = trebleNode;

    updateDspValues();
  };

  const updateDspValues = () => {
    if (preampNodeRef.current) preampNodeRef.current.gain.setValueAtTime(Math.pow(10, preamp / 20), audioCtxRef.current?.currentTime || 0);
    if (bassNodeRef.current) bassNodeRef.current.gain.setValueAtTime(bass, audioCtxRef.current?.currentTime || 0);
    if (midNodeRef.current) midNodeRef.current.gain.setValueAtTime(mid, audioCtxRef.current?.currentTime || 0);
    if (trebleNodeRef.current) trebleNodeRef.current.gain.setValueAtTime(treble, audioCtxRef.current?.currentTime || 0);
  };

  useEffect(() => { updateDspValues(); }, [preamp, bass, mid, treble]);

  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const loadedTracks: Track[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nameLower = file.name.toLowerCase(;
      if (nameLower.endsWith('.mp3') || nameLower.endsWith('.wav') || nameLower.endsWith('.m4a') || nameLower.endsWith('.flac')) {
        
        const cleanFilename = file.name.replace(/\.[^/.]+$/, "");
        
        try {
          const metadata = await musicMetadata.parseBlob(file);
          const common = metadata.common;
          let coverArtUrl = "";
          let rpcArtUrl = "";
          
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            const imgBlob = new Blob([pic.data], { type: pic.format });
            coverArtUrl = URL.createObjectURL(imgBlob);

            const base64String = btoa(
              pic.data.reduce((data, byte) => data + String.fromCharCode(byte), "")
            );
            rpcArtUrl = `data:${pic.format};base64,${base64String}`;
          }
          
          loadedTracks.push({
            id: Date.now() + i,
            title: common.title?.trim() || cleanFilename,
            artist: common.artist?.trim() || "UNKNOWN ARTIST",
            album: common.album?.trim() || "LOCAL TRACK",
            trackNo: common.track.no || i + 1,
            url: URL.createObjectURL(file),
            coverArt: coverArtUrl,
            rpcArt: rpcArtUrl
          });
        } catch (err) {
          loadedTracks.push({
            id: Date.now() + i,
            title: cleanFilename,
            artist: "UNKNOWN ARTIST",
            album: "LOCAL TRACK",
            trackNo: i + 1,
            url: URL.createObjectURL(file),
            coverArt: "",
            rpcArt: ""
          });
        }
      }
    }
    loadedTracks.sort((a, b) => a.trackNo - b.trackNo);
    const updatedPlaylist = [...playlist, ...loadedTracks];
    setPlaylist(updatedPlaylist);
    if (currentIdx === -1 && updatedPlaylist.length > 0) setCurrentIdx(0);
  };

  const startTrackPipeline = (idx: number) => {
    if (!playlist[idx]) return;
    setCurrentIdx(idx);
    setIsPlaying(true);
    if (audioCtxRef.current?.state === 'suspended') { audioCtxRef.current.resume(); } else { initAudioGraph(); }

    const track = playlist[idx];
    if (audioRef.current) {
      audioRef.current.src = track.url;
      audioRef.current.play().catch(err => console.log(err));
    }
  };

  const togglePlayState = () => {
    if (playlist.length === 0) return;
    if (currentIdx === -1) { startTrackPipeline(0); return; }
    if (isPlaying) { 
      audioRef.current?.pause(); 
      setIsPlaying(false); 
    } else { 
      audioRef.current?.play(); 
      setIsPlaying(true); 
    }
  };

  const handleTrackEnded = () => {
    if (isLooping && currentIdx !== -1) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.log(err));
      }
    } else if (currentIdx < playlist.length - 1) {
      startTrackPipeline(currentIdx + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const themeBg = isLightMode ? 'bg-[#F5F5F5] text-black selection:bg-zinc-200' : 'bg-black text-[#EEEEEE] selection:bg-[#222222]';
  const themeBorder = isLightMode ? 'border-zinc-300' : 'border-[#111111]';
  const themeSubBorder = isLightMode ? 'border-zinc-200' : 'border-[#0a0a0a]';
  const themeCard = isLightMode ? 'bg-white' : 'bg-[#050505]';
  const themeWindowInner = isLightMode ? 'bg-zinc-100' : 'bg-[#020202]';
  const themeMutedText = isLightMode ? 'text-zinc-400' : 'text-[#666666]';
  const themeDeepText = isLightMode ? 'text-zinc-500' : 'text-[#444444]';
  const themeBrightText = isLightMode ? 'text-black font-bold' : 'text-white font-semibold';
  const themeTrackItemActive = isLightMode ? 'bg-zinc-200 text-black font-bold' : 'bg-[#111111] text-white font-bold';
  const themeTrackItemHover = isLightMode ? 'hover:bg-zinc-100 text-zinc-700' : 'hover:bg-[#080808] text-[#BBBBBB]';

  return (
    <div className={`flex flex-col h-screen tracking-tight font-mono text-xs ${themeBg} transition-colors duration-100`}>
      <audio ref={audioRef} onEnded={handleTrackEnded} crossOrigin="anonymous" />

      {/* TITLEBAR PANEL */}
      <div className={`h-8 border-b flex items-center justify-between px-3 titlebar-drag shrink-0 z-50 ${themeBorder}`}>
        <div className="flex items-center gap-1.5 titlebar-nodrag">
          <button onClick={() => runWindowAction('close')} className="w-2.5 h-2.5 bg-[#222222] hover:bg-red-900 transition rounded-full" />
          <button onClick={() => runWindowAction('minimize')} className="w-2.5 h-2.5 bg-[#222222] hover:bg-zinc-700 transition rounded-full" />
        </div>
        <div className={`text-[10px] tracking-[0.2em] font-bold ${themeDeepText}`}>{version}</div>
        <button 
          onClick={() => setShowSettings(!showSettings)} 
          className={`titlebar-nodrag p-1 transition ${showSettings ? 'text-red-500' : `${themeDeepText} hover:text-white`}`}
        >
          <Settings size={13} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {showSettings && (
          <div className={`absolute inset-0 z-40 p-6 flex flex-col gap-6 ${isLightMode ? 'bg-[#F5F5F5]' : 'bg-black'}`}>
            <div className="flex justify-between items-center border-b pb-2 border-zinc-800">
              <span className={`text-[11px] tracking-widest ${themeBrightText}`}>SYSTEM_CONFIG_BOARD</span>
              <button onClick={() => setShowSettings(false)} className="text-red-500 font-bold hover:underline">[CLOSE]</button>
            </div>
            <div className="flex flex-col gap-4 max-w-sm">
              <div className="flex items-center justify-between p-3 border rounded border-zinc-800">
                <div>
                  <div className={`font-bold ${themeBrightText}`}>UI_VISUAL_THEME</div>
                  <div className={`text-[10px] ${themeMutedText}`}>Toggle Light Mode or Industrial Black</div>
                </div>
                <button 
                  onClick={() => setIsLightMode(!isLightMode)}
                  className={`w-10 h-6 border flex items-center justify-center rounded transition ${isLightMode ? 'bg-black text-white border-black' : 'bg-white text-black border-white'}`}
                >
                  {isLightMode ? <Moon size={12} /> : <Sun size={12} />}
                </button>
              </div>
              <div className="flex items-center justify-between p-3 border rounded border-zinc-800">
                <div>
                  <div className={`font-bold ${themeBrightText}`}>DISCORD_RPC_FEED</div>
                  <div className={`text-[10px] ${themeMutedText}`}>Stream live telemetry data to your Discord profile. If Disabled, it shows that you are in the menu.</div>
                </div>
                <button 
                  onClick={() => setRpcEnabled(!rpcEnabled)}
                  className={`px-2 h-6 border font-bold text-[10px] transition rounded ${rpcEnabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                >
                  {rpcEnabled ? "ACTIVE" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PARAMETRIC CONTROLS STACK */}
        <div className="w-64 flex flex-col p-4 border-r justify-between shrink-0 border-zinc-900">
          <div>
            <div className={`text-[10px] tracking-widest font-bold mb-4 ${themeDeepText}`}>DB_DECK_PARAM</div>
            <div className={`border p-4 flex justify-between items-stretch h-40 ${themeCard} ${themeBorder}`}>
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className={`text-[9px] font-bold ${themeMutedText}`}>{bass > 0 ? `+${bass}` : bass}</span>
                <input type="range" min="-12" max="12" step="0.5" value={bass} orient="vertical" onChange={(e) => setBass(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className={`text-[9px] font-bold tracking-tighter ${themeDeepText}`}>BASS</span>
              </div>
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className={`text-[9px] font-bold ${themeMutedText}`}>{mid > 0 ? `+${mid}` : mid}</span>
                <input type="range" min="-12" max="12" step="0.5" value={mid} orient="vertical" onChange={(e) => setMid(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className={`text-[9px] font-bold tracking-tighter ${themeDeepText}`}>MID</span>
              </div>
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className={`text-[9px] font-bold ${themeMutedText}`}>{treble > 0 ? `+${treble}` : treble}</span>
                <input type="range" min="-12" max="12" step="0.5" value={treble} orient="vertical" onChange={(e) => setTreble(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className={`text-[9px] font-bold tracking-tighter ${themeDeepText}`}>TREB</span>
              </div>
            </div>
          </div>

          {/* ABSOLUTE FIXED 1:1 SQUARE ARTWORK CONTAINER */}
          <div className="my-2 flex-1 flex flex-col justify-center items-center">
            <div className={`w-48 h-48 border flex items-center justify-center overflow-hidden shrink-0 ${themeBorder} ${themeCard}`}>
              {currentIdx !== -1 && playlist[currentIdx]?.coverArt ? (
                <img 
                  src={playlist[currentIdx].coverArt} 
                  alt="Cover Art" 
                  className="w-full h-full object-cover select-none block" 
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full">
                  <Disc size={36} className={`${themeDeepText} animate-spin-slow transform-gpu`} />
                  <span className={`text-[8px] tracking-widest mt-2 uppercase font-bold ${themeDeepText}`}>NO_ART_MOUNT</span>
                </div>
              )}
            </div>
          </div>

          <div className={`border p-3 ${themeCard} ${themeBorder}`}>
            <div className={`flex justify-between text-[9px] mb-2 font-bold tracking-wider ${themeDeepText}`}>
              <span>PRE_AMP</span>
              <span>{preamp} DB</span>
            </div>
            <input type="range" min="-12" max="12" step="0.5" value={preamp} onChange={(e) => setPreamp(parseFloat(e.target.value))} className="w-full h-1 appearance-none bg-zinc-800 cursor-pointer op-slider" />
          </div>
        </div>

        {/* WORKSPACE MATRIX */}
        <div className="flex-1 flex flex-col p-4">
          <div className="flex justify-between items-center mb-4 gap-4">
            <div className={`text-[10px] font-bold tracking-widest ${themeDeepText}`}>DIR_LOADER</div>
            
            <label className={`flex items-center gap-1.5 border font-bold text-[10px] px-3 py-1.5 cursor-pointer transition shrink-0 ${isLightMode ? 'border-zinc-400 hover:bg-zinc-200 text-black' : 'border-[#222222] hover:border-[#444444] text-white'}`}>
              <Folder size={12} />
              <span>IMPORT ALBUM</span>
              <input type="file" multiple accept="audio/*" onChange={handleFolderImport} className="hidden" />
            </label>
          </div>

          <div className={`flex-1 border overflow-y-auto ${themeWindowInner} ${themeBorder}`}>
            {playlist.length === 0 ? (
              <div className={`h-full flex items-center justify-center font-bold tracking-widest text-[10px] ${themeMutedText}`}>
                NO_AUDIO_MOUNTED
              </div>
            ) : (
              <div className={`divide-y ${themeSubBorder}`}>
                {playlist.map((track, idx) => (
                  <div 
                    key={track.id}
                    onClick={() => startTrackPipeline(idx)}
                    className={`flex items-center justify-between p-2.5 cursor-pointer transition text-[11px] ${
                      currentIdx === idx ? themeTrackItemActive : `${themeTrackItemHover}`
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={`w-4 font-mono font-bold ${currentIdx === idx ? 'text-white' : themeDeepText}`}>{String(idx + 1).padStart(2, '0')}</span>
                      <span className="truncate uppercase tracking-tight">{track.title}</span>
                    </div>
                    <span className={`text-[10px] truncate pl-4 uppercase tracking-tighter w-40 text-right ${currentIdx === idx ? 'text-white' : themeMutedText}`}>{track.artist}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SCRIB TRACK DECK */}
      <div className={`h-6 border-t px-4 flex items-center gap-3 ${themeBorder} ${themeCard}`}>
        <span className={`text-[9px] font-bold font-mono ${themeMutedText}`}>{formatTime(currentTime)}</span>
        <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleScrubChange} className="flex-1 h-1 appearance-none bg-zinc-800 cursor-pointer timeline-scrub" />
        <span className={`text-[9px] font-bold font-mono ${themeMutedText}`}>{formatTime(duration)}</span>
      </div>

      {/* OPERATIONS CONSOLE FOOTER */}
      <div className={`h-16 border-t flex items-center justify-between px-4 shrink-0 z-10 ${themeBorder} ${isLightMode ? 'bg-white' : 'bg-black'}`}>
        <div className="w-1/3 flex items-center gap-3">
          {currentIdx !== -1 ? (
            <div className="leading-tight truncate uppercase">
              <div className={`text-[12px] tracking-tight truncate ${themeBrightText}`}>{playlist[currentIdx]?.title}</div>
              <div className={`text-[9px] font-bold truncate mt-0.5 ${themeMutedText}`}>{playlist[currentIdx]?.artist} // {playlist[currentIdx]?.album}</div>
            </div>
          ) : (
            <span className={`text-[10px] font-bold tracking-widest ${themeDeepText}`}>DECK_STANDBY</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => { if (currentIdx > 0) startTrackPipeline(currentIdx - 1); }} disabled={currentIdx <= 0} className={`w-8 h-8 border flex items-center justify-center transition disabled:opacity-10 ${isLightMode ? 'border-zinc-300 hover:bg-zinc-100 text-black' : 'border-[#111111] hover:border-[#222222] text-[#AAAAAA] hover:text-white'}`}>
            <SkipBack size={12} />
          </button>
          <button onClick={togglePlayState} className={`w-10 h-8 border flex items-center justify-center transition ${isLightMode ? 'border-zinc-400 bg-black text-white hover:bg-zinc-800' : 'border-[#222222] hover:border-[#444444] text-white'}`}>
            {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
          </button>
          <button onClick={() => { if (currentIdx < playlist.length - 1) startTrackPipeline(currentIdx + 1); }} disabled={currentIdx === -1 || currentIdx >= playlist.length - 1} className={`w-8 h-8 border flex items-center justify-center transition disabled:opacity-10 ${isLightMode ? 'border-zinc-300 hover:bg-zinc-100 text-black' : 'border-[#111111] hover:border-[#222222] text-[#AAAAAA] hover:text-white'}`}>
            <SkipForward size={12} />
          </button>
          <button onClick={() => setIsLooping(!isLooping)} className={`w-8 h-8 border flex items-center justify-center transition ml-2 ${isLooping ? 'bg-red-600 text-white border-red-600 font-bold' : isLightMode ? 'border-zinc-300 text-zinc-400 hover:text-black' : 'border-[#111111] text-[#666666] hover:text-white hover:border-[#222222]'}`}>
            <Repeat size={12} />
          </button>
        </div>

        <div className="w-1/3 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 border px-2.5 py-1 rounded border-zinc-800 bg-[#020202] bg-opacity-20">
            <Volume2 size={11} className={themeMutedText} />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-16 h-1 appearance-none bg-zinc-800 cursor-pointer op-slider" />
            <span className="text-[9px] font-bold font-mono text-zinc-400 w-6 text-right">{Math.round(volume * 100)}%</span>
          </div>
          <div className={`text-[10px] font-bold tracking-wider font-mono pl-2 border-l border-zinc-800 ${themeMutedText}`}>
            {playlist.length > 0 ? `[${currentIdx + 1}/${playlist.length}]` : 'NULL'}
          </div>
        </div>
      </div>
    </div>
  );
}
