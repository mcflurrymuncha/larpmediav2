import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Folder, X, Minus } from 'lucide-react';
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

export default function QuellqaAudio() {
  const version = "v2 // opium";
  
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Cleaned baseline defaults optimized for extreme structural sub-kick response
  const [preamp, setPreamp] = useState<number>(0);
  const [bass, setBass] = useState<number>(10);   // Brutal, heavy floor signature
  const [mid, setMid] = useState<number>(-4);    // Cleaned mid scoop
  const [treble, setTreble] = useState<number>(3); // Sharp metal accents

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const preampNodeRef = useRef<GainNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    if (currentIdx !== -1 && playlist[currentIdx]) {
      document.title = playlist[currentIdx].title.toLowerCase();
    } else {
      document.title = "quellqa";
    }
  }, [currentIdx, playlist]);

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
    bassNode.frequency.value = 140; // Dropped frequency wall for hard sub kicks

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
      if (file.name.toLowerCase().endsWith('.mp3') || file.name.toLowerCase().endsWith('.wav')) {
        try {
          const metadata = await musicMetadata.parseBlob(file);
          const common = metadata.common;
          let coverArtUrl = "";
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            coverArtUrl = `data:${pic.format};base64,${btoa(new Uint8Array(pic.data).reduce((d, b) => d + String.fromCharCode(b), ''))}`;
          }
          loadedTracks.push({
            id: i,
            title: common.title || file.name.replace(/\.[^/.]+$/, ""),
            artist: common.artist || "UNKNOWN ARTIST",
            album: common.album || "UNKNOWN",
            trackNo: common.track.no || i + 1,
            url: URL.createObjectURL(file),
            coverArt: coverArtUrl
          });
        } catch (err) {
          loadedTracks.push({
            id: i,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "UNKNOWN ARTIST",
            album: "UNKNOWN",
            trackNo: i + 1,
            url: URL.createObjectURL(file),
            coverArt: ""
          });
        }
      }
    }
    loadedTracks.sort((a, b) => a.trackNo - b.trackNo);
    setPlaylist(loadedTracks);
    if (loadedTracks.length > 0) setCurrentIdx(0);
  };

  const startTrackPipeline = (idx: number) => {
    setCurrentIdx(idx);
    setIsPlaying(true);
    if (audioCtxRef.current?.state === 'suspended') { audioCtxRef.current.resume(); } else { initAudioGraph(); }

    const track = playlist[idx];
    try { window.require('electron').ipcRenderer.send('update-rpc', { title: track.title, artist: track.artist, album: track.album, isPlaying: true }); } catch (e) {}

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = track.url;
        audioRef.current.play().catch(err => console.log(err));
      }
    }, 50);
  };

  const togglePlayState = () => {
    if (playlist.length === 0) return;
    if (currentIdx === -1) { startTrackPipeline(0); return; }
    const track = playlist[currentIdx];
    if (isPlaying) { audioRef.current?.pause(); setIsPlaying(false); }
    else { audioRef.current?.play(); setIsPlaying(true); }
    try { window.require('electron').ipcRenderer.send('update-rpc', { title: track.title, artist: track.artist, album: track.album, isPlaying: !isPlaying }); } catch (e) {}
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white selection:bg-[#222222] tracking-tight font-mono text-xs">
      <audio ref={audioRef} onEnded={() => { if (currentIdx < playlist.length - 1) startTrackPipeline(currentIdx + 1); }} crossOrigin="anonymous" />

      {/* STRIPPED LINEAR TITLEBAR */}
      <div className="h-8 bg-black border-b border-[#111111] flex items-center justify-between px-3 titlebar-drag shrink-0 z-50">
        <div className="flex items-center gap-1.5 titlebar-nodrag">
          <button onClick={() => runWindowAction('close')} className="w-2.5 h-2.5 bg-[#222222] hover:bg-red-900 transition" />
          <button onClick={() => runWindowAction('minimize')} className="w-2.5 h-2.5 bg-[#222222] hover:bg-zinc-700 transition" />
        </div>
        <div className="text-[10px] text-[#444444] tracking-[0.2em] font-bold uppercase">{version}</div>
        <div className="w-10" />
      </div>

      {/* CORE FRAME LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LINEAR EQUALIZER COCKPIT */}
        <div className="w-64 bg-black flex flex-col p-4 border-r border-[#111111] justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-[#444444] font-bold mb-6">DB_DECK_PARAM</div>
            
            {/* Minimalist Vertical Engine Arrays */}
            <div className="bg-[#050505] border border-[#111111] p-4 flex justify-between items-stretch h-52">
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className="text-[9px] text-[#666666] font-bold">{bass > 0 ? `+${bass}` : bass}</span>
                <input type="range" min="-12" max="12" step="0.5" value={bass} orient="vertical" onChange={(e) => setBass(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className="text-[9px] text-[#444444] font-bold tracking-tighter">BASS</span>
              </div>
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className="text-[9px] text-[#666666] font-bold">{mid > 0 ? `+${mid}` : mid}</span>
                <input type="range" min="-12" max="12" step="0.5" value={mid} orient="vertical" onChange={(e) => setMid(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className="text-[9px] text-[#444444] font-bold tracking-tighter">MID</span>
              </div>
              <div className="flex flex-col items-center justify-between w-1/3">
                <span className="text-[9px] text-[#666666] font-bold">{treble > 0 ? `+${treble}` : treble}</span>
                <input type="range" min="-12" max="12" step="0.5" value={treble} orient="vertical" onChange={(e) => setTreble(parseFloat(e.target.value))} className="op-slider op-slider-vertical" />
                <span className="text-[9px] text-[#444444] font-bold tracking-tighter">TREB</span>
              </div>
            </div>
          </div>

          {/* Core Master Attenuation Slider */}
          <div className="bg-[#050505] border border-[#111111] p-3">
            <div className="flex justify-between text-[9px] text-[#555555] mb-2 font-bold tracking-wider">
              <span>PRE_AMP</span>
              <span>{preamp} DB</span>
            </div>
            <input type="range" min="-12" max="12" step="0.5" value={preamp} onChange={(e) => setPreamp(parseFloat(e.target.value))} className="w-full h-1 appearance-none bg-[#111111] cursor-pointer op-slider" />
          </div>
        </div>

        {/* TRACK CONSOLE WINDOW */}
        <div className="flex-1 flex flex-col p-4 bg-black">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] text-[#444444] font-bold tracking-widest">DIR_LOADER</div>
            <label className="flex items-center gap-1.5 border border-[#222222] hover:border-[#444444] text-white font-bold text-[10px] px-3 py-1.5 cursor-pointer transition">
              <Folder size={12} />
              <span>IMPORT</span>
              <input type="file" multiple accept="audio/*" onChange={handleFolderImport} className="hidden" />
            </label>
          </div>

          <div className="flex-1 border border-[#111111] overflow-y-auto bg-[#020202]">
            {playlist.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#333333] font-bold tracking-widest text-[10px]">
                NO_AUDIO_MOUNTED
              </div>
            ) : (
              <div className="divide-y divide-[#0a0a0a]">
                {playlist.map((track, idx) => (
                  <div 
                    key={track.id}
                    onClick={() => startTrackPipeline(idx)}
                    className={`flex items-center justify-between p-2.5 cursor-pointer transition text-[11px] ${
                      currentIdx === idx ? 'bg-[#111111] text-white font-bold' : 'hover:bg-[#080808] text-[#777777]'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="w-4 text-[#333333] font-mono">{String(track.trackNo).padStart(2, '0')}</span>
                      <span className="truncate uppercase tracking-tight">{track.title}</span>
                    </div>
                    <span className="text-[10px] text-[#333333] truncate pl-4 uppercase tracking-tighter w-40 text-right">{track.artist}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SYSTEM OPERATIONS STRIP (FOOTER) */}
      <div className="h-16 bg-black border-t border-[#111111] flex items-center justify-between px-4 shrink-0 z-10">
        {/* Dynamic Context Readout */}
        <div className="w-1/3 flex items-center gap-3">
          {currentIdx !== -1 ? (
            <div className="leading-tight truncate uppercase">
              <div className="text-[11px] font-bold tracking-tight text-white truncate">{playlist[currentIdx]?.title}</div>
              <div className="text-[9px] text-[#555555] font-bold truncate mt-0.5">{playlist[currentIdx]?.artist}</div>
            </div>
          ) : (
            <span className="text-[10px] text-[#222222] font-bold tracking-widest">DECK_STANDBY</span>
          )}
        </div>

        {/* Structural Navigation Buttons */}
        <div className="flex items-center gap-1">
          <button onClick={() => { if (currentIdx > 0) startTrackPipeline(currentIdx - 1); }} disabled={currentIdx <= 0} className="w-8 h-8 border border-[#111111] hover:border-[#222222] flex items-center justify-center text-[#555555] hover:text-white disabled:opacity-10 transition">
            <SkipBack size={12} />
          </button>
          <button onClick={togglePlayState} className="w-10 h-8 border border-[#222222] hover:border-[#444444] flex items-center justify-center text-white transition">
            {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
          </button>
          <button onClick={() => { if (currentIdx < playlist.length - 1) startTrackPipeline(currentIdx + 1); }} disabled={currentIdx === -1 || currentIdx >= playlist.length - 1} className="w-8 h-8 border border-[#111111] hover:border-[#222222] flex items-center justify-center text-[#555555] hover:text-white disabled:opacity-10 transition">
            <SkipForward size={12} />
          </button>
        </div>

        {/* Matrix Position Metadata Readout */}
        <div className="w-1/3 flex justify-end text-[10px] text-[#333333] font-bold tracking-wider">
          {playlist.length > 0 ? `POS // [${currentIdx + 1}.${playlist.length}]` : 'IDX_NULL'}
        </div>
      </div>
    </div>
  );
}
