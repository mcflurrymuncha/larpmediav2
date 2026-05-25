import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Heart, Sparkles, Smile, Bomb } from 'lucide-react';
// @ts-ignore
import jsmediatags from 'jsmediatags';

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  trackNo: number;
  url: string;
  coverArt: string; // Base64 Data URL for real embedded image rendering
}

export default function QuellqaAudio() {
  const version = "v1.1.0-KawaiiDeadly";
  
  // --- Audio States ---
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // High-Performance EQ Targets
  const [preamp, setPreamp] = useState<number>(0);
  const [bass, setBass] = useState<number>(6); // Cranking defaults
  const [mid, setMid] = useState<number>(-2);
  const [treble, setTreble] = useState<number>(4);

  // --- Audio Web Anchors ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const preampNodeRef = useRef<GainNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null);

  // Dynamic window title updates
  useEffect(() => {
    if (currentIdx !== -1 && playlist[currentIdx]) {
      document.title = `🌸 ${playlist[currentIdx].title} | Quellqa`;
    } else {
      document.title = `✨ Quellqa Audio ✨`;
    }
  }, [currentIdx, playlist]);

  // Audio Graph Initialization
  const initAudioGraph = () => {
    if (!audioRef.current || audioCtxRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;

    const preampNode = ctx.createGain();
    const bassNode = ctx.createBiquadFilter();
    const midNode = ctx.createBiquadFilter();
    const trebleNode = ctx.createBiquadFilter();

    bassNode.type = 'lowshelf';
    bassNode.frequency.value = 180;

    midNode.type = 'peaking';
    midNode.Q.value = 1.2;
    midNode.frequency.value = 1200;

    trebleNode.type = 'highshelf';
    trebleNode.frequency.value = 4500;

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
    if (preampNodeRef.current) {
      const gainLinear = Math.pow(10, preamp / 20);
      preampNodeRef.current.gain.setValueAtTime(gainLinear, audioCtxRef.current?.currentTime || 0);
    }
    if (bassNodeRef.current) bassNodeRef.current.gain.setValueAtTime(bass, audioCtxRef.current?.currentTime || 0);
    if (midNodeRef.current) midNodeRef.current.gain.setValueAtTime(mid, audioCtxRef.current?.currentTime || 0);
    if (trebleNodeRef.current) trebleNodeRef.current.gain.setValueAtTime(treble, audioCtxRef.current?.currentTime || 0);
  };

  useEffect(() => { updateDspValues(); }, [preamp, bass, mid, treble]);

  // ----------------------------------------------------
  // 🔮 BINARY METADATA ENGINE (Fixes Missing Album Art/Song Info)
  // ----------------------------------------------------
  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const loadedTracks: Track[] = [];
    
    // Process files through an asynchronous sequence mapper
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.mp3') || file.name.toLowerCase().endsWith('.wav')) {
        
        await new Promise<void>((resolve) => {
          jsmediatags.read(file, {
            onSuccess: (tag: any) => {
              const tags = tag.tags;
              
              // Extract and parse binary embedded artwork image metadata
              let coverArtUrl = "";
              if (tags.picture) {
                const { data, format } = tags.picture;
                let base64String = "";
                for (let j = 0; j < data.length; j++) {
                  base64String += String.fromCharCode(data[j]);
                }
                coverArtUrl = `data:${format};base64,${btoa(base64String)}`;
              }

              loadedTracks.push({
                id: i,
                title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                artist: tags.artist || "Unknown Cutie",
                album: tags.album || "Sweet Single",
                trackNo: tags.track ? parseInt(tags.track, 10) : i + 1,
                url: URL.createObjectURL(file),
                coverArt: coverArtUrl
              });
              resolve();
            },
            onError: () => {
              // Fallback parameters if metadata blocks are entirely missing or corrupted
              loadedTracks.push({
                id: i,
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: "Unknown Cutie",
                album: "Sweet Single",
                trackNo: i + 1,
                url: URL.createObjectURL(file),
                coverArt: ""
              });
              resolve();
            }
          });
        });
      }
    }

    loadedTracks.sort((a, b) => a.trackNo - b.trackNo);
    setPlaylist(loadedTracks);
    if (loadedTracks.length > 0) setCurrentIdx(0);
  };

  const startTrackPipeline = (idx: number) => {
    setCurrentIdx(idx);
    setIsPlaying(true);

    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    } else {
      initAudioGraph();
    }

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = playlist[idx].url;
        audioRef.current.play().catch(err => console.log(err));
      }
    }, 50);
  };

  const togglePlayState = () => {
    if (playlist.length === 0) return;
    if (currentIdx === -1) { startTrackPipeline(0); return; }
    if (isPlaying) { audioRef.current?.pause(); setIsPlaying(false); }
    else { audioRef.current?.play(); setIsPlaying(true); }
  };

  return (
    <div className="flex flex-col h-screen bg-[#fff5f7] text-[#4a354f] overflow-hidden selection:bg-[#ffdae0]">
      <audio ref={audioRef} onEnded={nextTrack} crossOrigin="anonymous" />

      <div className="flex flex-1 overflow-hidden">
        
        {/* --- KAWAII SIDEBAR (DEADLY EQUALIZER ENGINE) --- */}
        <div className="w-72 bg-[#ffaec1] flex flex-col items-center py-6 px-4 border-r-4 border-[#ff8fa9] shadow-inner">
          <div className="flex items-center gap-2 mb-6 bg-white/40 px-4 py-2 rounded-full border border-white/60">
            <Bomb className="text-[#d14d72] animate-bounce" size={20} />
            <h1 className="text-xl font-black tracking-wider text-[#4a354f]">QUELLQA</h1>
            <Sparkles className="text-[#ffd25a]" size={16} />
          </div>

          {/* Pre-Amp Volume Adjustments Slider */}
          <div className="w-full px-4 mb-6 bg-white/50 p-3 rounded-2xl border border-[#ff8fa9]">
            <div className="flex justify-between text-[11px] font-black tracking-wide text-[#734a70] mb-1">
              <span>💖 PRE-AMP (GAIN)</span>
              <span>{preamp > 0 ? `+${preamp}` : preamp} dB</span>
            </div>
            <input 
              type="range" min="-12" max="12" step="0.5" value={preamp} 
              onChange={(e) => setPreamp(parseFloat(e.target.value))}
              className="w-full accent-[#ff4d79] bg-white/80 h-2.5 rounded-lg appearance-none cursor-pointer border border-[#ff8fa9]"
            />
          </div>

          {/* 3-Band Vertical Sliders Grid */}
          <div className="flex justify-around items-stretch w-full flex-1 max-h-60 px-2 bg-white/30 rounded-2xl p-4 border border-dashed border-[#ff8fa9]">
            {/* Bass Slider Node */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-white bg-[#ff6b8b] px-1.5 py-0.5 rounded-md shadow-sm">{bass > 0 ? `+${bass}` : bass}</span>
              <input 
                type="range" min="-12" max="12" step="0.5" value={bass} orient="vertical"
                onChange={(e) => setBass(parseFloat(e.target.value))}
                className="accent-[#ff4d79] bg-white w-3 h-full rounded-full appearance-none cursor-pointer shadow-inner"
              />
              <span className="text-[11px] font-black text-center text-[#ff4d79]">BASS<br/><span className="text-[9px] text-[#8c5267]">180Hz</span></span>
            </div>

            {/* Mids Slider Node */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-white bg-[#ff9f63] px-1.5 py-0.5 rounded-md shadow-sm">{mid > 0 ? `+${mid}` : mid}</span>
              <input 
                type="range" min="-12" max="12" step="0.5" value={mid} orient="vertical"
                onChange={(e) => setMid(parseFloat(e.target.value))}
                className="accent-[#ff8736] bg-white w-3 h-full rounded-full appearance-none cursor-pointer shadow-inner"
              />
              <span className="text-[11px] font-black text-center text-[#ff8736]">MIDS<br/><span className="text-[9px] text-[#8c5267]">1.2kHz</span></span>
            </div>

            {/* Treble Slider Node */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-white bg-[#5cdbb5] px-1.5 py-0.5 rounded-md shadow-sm">{treble > 0 ? `+${treble}` : treble}</span>
              <input 
                type="range" min="-12" max="12" step="0.5" value={treble} orient="vertical"
                onChange={(e) => setTreble(parseFloat(e.target.value))}
                className="accent-[#32c499] bg-white w-3 h-full rounded-full appearance-none cursor-pointer shadow-inner"
              />
              <span className="text-[11px] font-black text-center text-[#32c499]">TREBLE<br/><span className="text-[9px] text-[#8c5267]">4.5kHz</span></span>
            </div>
          </div>
        </div>

        {/* --- MAIN DATA GRID: CHROMATIC SONGS TRACKLIST --- */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <label className="flex items-center gap-2 bg-[#ff6b8b] hover:bg-[#ff4d79] text-white font-black px-5 py-3 rounded-2xl cursor-pointer transition transform hover:scale-102 active:scale-98 shadow-md border-b-4 border-[#d14d72]">
              <Sparkles size={18} />
              <span>Unpack Cute Tracks ✨</span>
              <input type="file" multiple accept="audio/*" onChange={handleFolderImport} className="hidden" />
            </label>
            <span className="text-[11px] font-bold text-[#b093b5] bg-white px-3 py-1 rounded-full border border-[#ffdae0]">Stereo DSP Deck Engine Active</span>
          </div>

          {/* Core Table Grid Frame */}
          <div className="bg-white rounded-3xl p-5 flex-1 border-4 border-[#ffdae0] shadow-sm overflow-y-auto">
            <div className="flex text-xs font-black text-[#a182a6] uppercase border-b-2 border-dashed border-[#ffdae0] pb-3 px-4 mb-2">
              <div className="w-12">🍭</div>
              <div className="flex-1">Song Details</div>
              <div className="w-48">Album</div>
            </div>

            {playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-[#b093b5] gap-2">
                <Smile size={36} className="text-[#ff9ea9] animate-pulse" />
                <p className="text-sm font-bold text-center">Feed me some local music files to start blasting your headphones!</p>
              </div>
            ) : (
              playlist.map((track, idx) => (
                <div 
                  key={track.id} 
                  onClick={() => startTrackPipeline(idx)}
                  className={`flex items-center text-sm py-3 px-4 rounded-xl cursor-pointer transition mb-1 group ${
                    currentIdx === idx ? 'bg-[#ffdae0] text-[#ff4d79] font-black' : 'hover:bg-[#fff0f3] text-[#4a354f]'
                  }`}
                >
                  <div className="w-12 font-mono text-[#b093b5] font-black">
                    {currentIdx === idx && isPlaying ? "💝" : String(track.trackNo).padStart(2, '0')}
                  </div>
                  <div className="flex-1 truncate pr-4">
                    <div className="font-bold truncate">{track.title}</div>
                    <div className="text-[11px] text-[#9c829e] font-normal group-hover:text-[#ff6b8b]">{track.artist}</div>
                  </div>
                  <div className="w-48 text-xs text-[#a182a6] truncate font-medium">{track.album}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* --- BOTTOM PLAYER CONTROLS FOOTER BAR --- */}
      <div className="h-28 bg-white border-t-4 border-[#ffdae0] flex items-center justify-between px-8 z-10 shadow-lg">
        
        {/* Track Detail Frame (Left) with Real Dynamic Artwork Hook */}
        <div className="flex items-center gap-4 w-1/3">
          {currentIdx !== -1 ? (
            <>
              {playlist[currentIdx]?.coverArt ? (
                <img 
                  src={playlist[currentIdx].coverArt} 
                  alt="art" 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-[#ff8fa9] shadow-sm animate-spin [animation-duration:12s]" 
                />
              ) : (
                <div className="w-16 h-16 bg-[#ffdae0] rounded-2xl flex items-center justify-center text-[#ff6b8b] border-2 border-[#ff8fa9] shadow-sm">
                  <Heart size={24} fill="currentColor" />
                </div>
              )}
              <div className="overflow-hidden">
                <h3 className="text-sm font-black text-[#4a354f] truncate">{playlist[currentIdx]?.title}</h3>
                <p className="text-xs text-[#ff6b8b] font-bold truncate">{playlist[currentIdx]?.artist}</p>
                <p className="text-[10px] text-[#a182a6] font-medium truncate">💿 {playlist[currentIdx]?.album}</p>
              </div>
            </>
          ) : (
            <p className="text-xs font-bold text-[#b093b5] tracking-wide italic">No cute songs playing...</p>
          )}
        </div>

        {/* Action Controls Strip (Center) */}
        <div className="flex items-center gap-4">
          <button onClick={prevTrack} disabled={currentIdx <= 0} className="text-[#ff9ea9] hover:text-[#ff4d79] disabled:opacity-20 transition transform active:scale-90">
            <SkipBack size={24} fill="currentColor" />
          </button>
          
          <button 
            onClick={togglePlayState}
            className="p-4 rounded-full bg-[#ff4d79] text-white hover:bg-[#ff2458] hover:scale-105 active:scale-95 transition shadow-md border-b-4 border-[#d14d72]"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
          </button>

          <button onClick={nextTrack} disabled={currentIdx === -1 || currentIdx >= playlist.length - 1} className="text-[#ff9ea9] hover:text-[#ff4d79] disabled:opacity-20 transition transform active:scale-90">
            <SkipForward size={24} fill="currentColor" />
          </button>
        </div>

        <div className="w-1/3 flex justify-end text-[10px] font-bold tracking-wider text-[#b093b5] uppercase">
          Quellqa Audio {version}
        </div>
      </div>
    </div>
  );

  function nextTrack() {
    if (currentIdx < playlist.length - 1) startTrackPipeline(currentIdx + 1);
  }

  function prevTrack() {
    if (currentIdx > 0) startTrackPipeline(currentIdx - 1);
  }
}
