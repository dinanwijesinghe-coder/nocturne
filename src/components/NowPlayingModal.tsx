import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Gauge,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';
import { webAudioEngine } from '../services/webAudioEngine';
import { formatTime, getActiveLyricIndex } from '../utils/lrcParser';
import { formatAudioQualityBadge } from '../utils/streamQuality';
import { CoverImage } from './CoverImage';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_OPTIONS: Array<{ id: 'off' | '15m' | '30m' | '45m' | '60m' | 'end_of_track'; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: '15m', label: '15 min' },
  { id: '30m', label: '30 min' },
  { id: '45m', label: '45 min' },
  { id: '60m', label: '60 min' },
  { id: 'end_of_track', label: 'End of track' },
];

export function NowPlayingModal() {
  const {
    isNowPlayingOpen,
    setNowPlayingOpen,
    currentTrack,
    activeStreamMeta,
    isPlaying,
    currentTime,
    duration,
    togglePlayPause,
    seekTo,
    skipBy,
    playNext,
    playPrevious,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeatMode,
    playbackSpeed,
    setPlaybackSpeed,
    crossfadeSeconds,
    setCrossfadeSeconds,
    sleepTimer,
    setSleepTimerMode,
    sleepRemainingSeconds,
    likedTrackIds,
    toggleLikeTrack,
    offlineRecords,
    downloadTrackOffline,
    removeOfflineTrack,
    lyrics,
    isLoadingLyrics,
    importCustomLrc,
    setEqOpen,
    setQueueOpen,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    dataSaver,
    showToast,
  } = useNocturne();

  const [mobilePane, setMobilePane] = useState<'player' | 'lyrics' | 'settings'>('player');
  const [showLrcPaste, setShowLrcPaste] = useState(false);
  const [lrcDraft, setLrcDraft] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);
  const lrcFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeLyricIndex = useMemo(() => {
    return getActiveLyricIndex(lyrics.synced, currentTime);
  }, [lyrics.synced, currentTime]);

  // Auto-scroll active lyric into view
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIndex]);

  // Throttled lightweight canvas visualizer (fftSize = 128 => 64 bins, ~30fps cap, pauses when stopped)
  useEffect(() => {
    if (!isNowPlayingOpen || dataSaver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const barCount = 32;
    const gap = 4;
    const barWidth = (w - gap * (barCount - 1)) / barCount;

    // Pre-allocate typed bin buffer matching fftSize = 128 and single reusable gradient
    const buffer = new Uint8Array(64);
    const barGradient = ctx.createLinearGradient(0, 0, 0, h);
    barGradient.addColorStop(0, '#E9D5FF');
    barGradient.addColorStop(0.45, '#A855F7');
    barGradient.addColorStop(1, 'rgba(168, 85, 247, 0.22)');

    const renderFrame = (timeMs: number, animate: boolean) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = barGradient;
      const hasRealFft = animate ? webAudioEngine.getFrequencyData(buffer) : false;

      for (let i = 0; i < barCount; i += 1) {
        let magnitude = 0.08 + 0.04 * Math.sin(i * 0.6);
        if (animate) {
          const fftVal = hasRealFft ? buffer[i] / 255 : 0;
          const gentleWave = 0.18 + 0.26 * Math.abs(Math.sin(timeMs * 0.0035 + i * 0.45));
          magnitude = Math.max(fftVal, gentleWave * 0.55);
        }

        const barHeight = Math.max(4, magnitude * (h - 6));
        const x = i * (barWidth + gap);
        const y = h - barHeight;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    if (!isPlaying) {
      renderFrame(0, false);
      return;
    }

    let rafId = 0;
    let lastDrawMs = 0;
    const FRAME_INTERVAL_MS = 33; // ~30fps throttle to keep audio & main thread smooth

    const draw = (timeMs: number) => {
      if (timeMs - lastDrawMs >= FRAME_INTERVAL_MS) {
        lastDrawMs = timeMs;
        renderFrame(timeMs, true);
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isNowPlayingOpen, isPlaying, dataSaver]);

  if (!isNowPlayingOpen || !currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.id);
  const isOffline = offlineRecords.some((r) => r.id === currentTrack.id);
  const qualityBadgeLabel = formatAudioQualityBadge(activeStreamMeta, currentTrack);
  const displayVolume = isMuted ? 0 : volume;
  const volumePercent = Math.round(displayVolume * 100);
  const effectivelyMuted = isMuted || volume === 0;
  const VolumeIcon = effectivelyMuted ? VolumeX : displayVolume < 0.5 ? Volume1 : Volume2;

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?track=${encodeURIComponent(currentTrack.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${currentTrack.title} — ${currentTrack.artist}`,
          text: `Listen to ${currentTrack.title} on Nocturne`,
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Share link copied to clipboard', 'success');
      }
    } catch {
      showToast('Share link ready', 'info');
    }
  };

  const handleLrcFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importCustomLrc(currentTrack.id, text);
    e.target.value = '';
  };

  const handleLrcPasteSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lrcDraft.trim()) return;
    await importCustomLrc(currentTrack.id, lrcDraft);
    setLrcDraft('');
    setShowLrcPaste(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      className="fixed inset-0 z-50 bg-[#09090E] text-zinc-100 flex flex-col overflow-hidden"
    >
      {/* Subtle top ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[540px] h-[280px] rounded-full bg-purple-600/20 blur-[120px]"
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-3.5 border-b border-white/8 shrink-0">
        <button
          type="button"
          onClick={() => setNowPlayingOpen(false)}
          aria-label="Collapse now playing view"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.06]"
        >
          <ChevronDown className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="text-center min-w-0 px-2">
          <p className="text-[11px] font-medium text-purple-300 truncate">
            {currentTrack.isPodcast ? 'Now Playing Podcast' : 'Now Playing'}
          </p>
          <p className="text-xs text-zinc-400 truncate">
            {currentTrack.album || currentTrack.showTitle || currentTrack.genre}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share track link"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-purple-300 hover:bg-white/[0.06]"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label="Open queue"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-purple-300 hover:bg-white/[0.06]"
          >
            <ListMusic className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile View Switcher */}
      <div className="lg:hidden relative z-10 px-4 pt-3 shrink-0">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#13131D] border border-white/8">
          {(['player', 'lyrics', 'settings'] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              onClick={() => setMobilePane(pane)}
              className={`py-2 text-xs font-medium rounded-lg capitalize transition-colors ${
                mobilePane === pane
                  ? 'bg-purple-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {pane === 'settings' ? 'Audio & Timer' : pane}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start h-full">
          {/* Left Column: Art, Visualizer & Transport */}
          <div className={`lg:col-span-6 flex flex-col items-center ${mobilePane !== 'player' ? 'hidden lg:flex' : 'flex'}`}>
            <div className="w-full max-w-[330px]">
              <CoverImage
                src={currentTrack.artworkUrl}
                thumbSrc={currentTrack.artworkThumbUrl}
                alt={`${currentTrack.title} album art`}
                className="w-full aspect-square shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
                roundedClass="rounded-3xl"
              />

              {/* Live Audio Visualizer */}
              <div className="mt-3 h-11 rounded-xl bg-[#111119] border border-white/8 px-3 py-1.5 flex items-center justify-center">
                {dataSaver ? (
                  <p className="text-[11px] text-zinc-500">Visualizer paused (Data Saver active)</p>
                ) : (
                  <canvas
                    ref={canvasRef}
                    data-testid="audio-visualizer"
                    width={360}
                    height={36}
                    className="w-full h-full"
                  />
                )}
              </div>

              {/* Track Title & Quick Actions */}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-white truncate">
                    {currentTrack.title}
                  </h2>
                  <p className="text-sm text-zinc-400 truncate mt-0.5">
                    {currentTrack.artist} · {currentTrack.genre}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      data-testid="audio-quality-badge"
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold tracking-wide bg-purple-500/18 text-purple-200 border border-purple-400/35"
                    >
                      {qualityBadgeLabel}
                    </span>
                    {dataSaver && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.06] text-zinc-300 border border-white/10">
                        DATA SAVER
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => (isOffline ? void removeOfflineTrack(currentTrack.id) : void downloadTrackOffline(currentTrack))}
                    aria-label={isOffline ? 'Remove offline download' : 'Download track offline'}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border ${
                      isOffline
                        ? 'border-purple-400/40 bg-purple-500/15 text-purple-300'
                        : 'border-white/10 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {isOffline ? <Check className="w-4 h-4" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleLikeTrack(currentTrack)}
                    aria-label={isLiked ? 'Unlike track' : 'Like track'}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:text-purple-300"
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'text-purple-400 fill-purple-400' : ''}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Scrubber */}
              <div className="mt-4">
                <input
                  type="range"
                  aria-label="Playback position"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.25}
                  value={Math.min(currentTime, Math.max(1, duration))}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="nocturne-range w-full"
                />
                <div className="flex justify-between text-xs font-mono tabular-nums text-zinc-400 mt-1.5">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Main Transport */}
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  aria-label="Toggle shuffle"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl ${
                    shuffle ? 'text-purple-400 bg-purple-500/12' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Shuffle className="w-5 h-5" aria-hidden="true" />
                </button>

                {currentTrack.isPodcast ? (
                  <button
                    type="button"
                    onClick={() => skipBy(-15)}
                    aria-label="Skip back 15 seconds"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white"
                  >
                    <RotateCcw className="w-5 h-5" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={playPrevious}
                    aria-label="Previous track"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white"
                  >
                    <SkipBack className="w-6 h-6 fill-current" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-15 h-15 rounded-full bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center shadow-[0_0_28px_rgba(168,85,247,0.55)] transition-transform active:scale-95"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-white" aria-hidden="true" />
                  ) : (
                    <Play className="w-6 h-6 fill-white ml-1" aria-hidden="true" />
                  )}
                </button>

                {currentTrack.isPodcast ? (
                  <button
                    type="button"
                    onClick={() => skipBy(15)}
                    aria-label="Skip forward 15 seconds"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white"
                  >
                    <RotateCw className="w-5 h-5" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={playNext}
                    aria-label="Next track"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white"
                  >
                    <SkipForward className="w-6 h-6 fill-current" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={cycleRepeatMode}
                  aria-label={`Cycle repeat mode (${repeatMode})`}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl ${
                    repeatMode !== 'off' ? 'text-purple-400 bg-purple-500/12' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Repeat className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Master Volume & Mute Control */}
              <div className="mt-4 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
                <button
                  type="button"
                  data-testid="main-player-mute-button"
                  onClick={toggleMute}
                  aria-label={effectivelyMuted ? 'Unmute audio' : 'Mute audio'}
                  aria-pressed={effectivelyMuted}
                  className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                    effectivelyMuted
                      ? 'text-purple-400 bg-purple-500/15 border border-purple-400/30'
                      : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <VolumeIcon className="w-4 h-4" aria-hidden="true" />
                </button>

                <input
                  type="range"
                  data-testid="main-player-volume-slider"
                  aria-label="Main player volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={displayVolume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="nocturne-range flex-1"
                />

                <span
                  data-testid="main-player-volume-value"
                  className="text-xs font-mono tabular-nums text-zinc-300 w-10 text-right shrink-0"
                >
                  {volumePercent}%
                </span>
              </div>

              {/* Quick EQ trigger */}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setEqOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/25 flex items-center gap-2"
                >
                  <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                  10-Band Studio EQ
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Synced Lyrics & Smart Controls */}
          <div className={`lg:col-span-6 space-y-6 ${mobilePane === 'player' ? 'hidden lg:block' : 'block'}`}>
            {/* Synced Lyrics Card */}
            <section
              aria-label="Synced Lyrics"
              className={`${mobilePane === 'settings' ? 'hidden lg:block' : 'block'} rounded-2xl bg-[#12121B]/90 border border-white/10 p-5`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    Synced Lyrics
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {lyrics.synced.length > 0
                      ? 'Tap any line to seek · Auto-scrolling'
                      : 'LRCLIB & custom .lrc lyrics'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={lrcFileInputRef}
                    type="file"
                    accept=".lrc,.txt"
                    onChange={handleLrcFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => lrcFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    Import .LRC
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLrcPaste((v) => !v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-300 bg-purple-500/12 hover:bg-purple-500/20 border border-purple-400/25 flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    Paste .LRC
                  </button>
                </div>
              </div>

              {showLrcPaste && (
                <form onSubmit={handleLrcPasteSave} className="mb-4 space-y-2">
                  <textarea
                    rows={4}
                    value={lrcDraft}
                    onChange={(e) => setLrcDraft(e.target.value)}
                    placeholder="[00:04.50] Paste timestamped .lrc lyrics here..."
                    className="w-full rounded-xl bg-[#09090E] border border-white/12 p-3 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLrcPaste(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-400"
                    >
                      Save Lyrics
                    </button>
                  </div>
                </form>
              )}

              <div className="h-64 sm:h-72 overflow-y-auto pr-2 space-y-2">
                {isLoadingLyrics ? (
                  <div className="space-y-3 py-4">
                    <div className="h-4 w-3/4 rounded bg-white/8 animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-white/8 animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-white/8 animate-pulse" />
                  </div>
                ) : lyrics.synced.length > 0 ? (
                  lyrics.synced.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    return (
                      <button
                        key={`${line.time}-${idx}`}
                        ref={isActive ? activeLyricRef : undefined}
                        type="button"
                        onClick={() => seekTo(line.time)}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-all block ${
                          isActive
                            ? 'text-lg sm:text-xl font-bold text-purple-300 bg-purple-500/15 shadow-[0_0_24px_rgba(168,85,247,0.22)]'
                            : 'text-sm sm:text-base text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="font-mono text-[11px] text-zinc-500 mr-2.5 tabular-nums">
                          {formatTime(line.time)}
                        </span>
                        <span>{line.text}</span>
                      </button>
                    );
                  })
                ) : lyrics.source === 'none' && !lyrics.synced.length ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-purple-300">
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <p className="text-sm font-semibold text-zinc-200">
                        {currentTrack.isPodcast ? 'Episode Notes' : 'Lyrics Unavailable'}
                      </p>
                      <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
                        {lyrics.plain}
                      </p>
                    </div>
                    {!currentTrack.isPodcast && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => lrcFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10"
                        >
                          Upload .LRC File
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLrcPaste(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/25"
                        >
                          Paste Synced Lyrics
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed py-2">
                    {lyrics.plain}
                  </p>
                )}
              </div>
            </section>

            {/* Playback Speed, Crossfade & Sleep Timer */}
            <section
              aria-label="Playback Engine Controls"
              className={`${mobilePane === 'lyrics' ? 'hidden lg:block' : 'block'} rounded-2xl bg-[#12121B]/90 border border-white/10 p-5 space-y-5`}
            >
              {/* Playback Speed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    Playback Speed
                  </span>
                  <span className="text-xs font-mono text-purple-300 tabular-nums">{playbackSpeed}x</span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {SPEED_OPTIONS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setPlaybackSpeed(sp)}
                      className={`py-2 rounded-lg text-xs font-mono transition-colors ${
                        playbackSpeed === sp
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Crossfade Slider (0-12s) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="crossfade-slider" className="text-xs font-semibold text-zinc-200">
                    Smooth Crossfade
                  </label>
                  <span className="text-xs font-mono text-purple-300 tabular-nums">
                    {crossfadeSeconds === 0 ? 'Off' : `${crossfadeSeconds}s`}
                  </span>
                </div>
                <input
                  id="crossfade-slider"
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={crossfadeSeconds}
                  onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
                  className="nocturne-range w-full"
                />
              </div>

              {/* Sleep Timer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    Sleep Timer
                  </span>
                  {sleepRemainingSeconds !== null && (
                    <span className="text-xs font-mono text-purple-300 tabular-nums">
                      {formatTime(sleepRemainingSeconds)} left
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {SLEEP_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSleepTimerMode(opt.id)}
                      className={`py-2 px-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                        sleepTimer.mode === opt.id
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
