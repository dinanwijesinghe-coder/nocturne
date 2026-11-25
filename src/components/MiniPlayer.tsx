import {
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';
import { formatTime } from '../utils/lrcParser';
import { CoverImage } from './CoverImage';

export function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    setNowPlayingOpen,
    setEqOpen,
    setQueueOpen,
    likedTrackIds,
    toggleLikeTrack,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeatMode,
    volume,
    isMuted,
    setVolume,
    toggleMute,
  } = useNocturne();

  if (!currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.id);
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayVolume = isMuted ? 0 : volume;
  const volumePercent = Math.round(displayVolume * 100);
  const effectivelyMuted = isMuted || volume === 0;
  const VolumeIcon = effectivelyMuted ? VolumeX : displayVolume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      {/* Mobile Compact Mini-Player with visible volume & mute controls */}
      <div className="lg:hidden fixed bottom-14 left-0 right-0 z-30 bg-[#14141F]/95 backdrop-blur-xl border-t border-white/10 px-3 pt-1.5 pb-2 flex flex-col gap-1">
        <div
          className="absolute top-0 left-0 h-[2px] bg-gradient-to-r from-purple-500 to-purple-300 transition-all duration-200"
          style={{ width: `${progressPct}%` }}
        />

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setNowPlayingOpen(true)}
            aria-label={`Open full-screen player for ${currentTrack.title}`}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left min-h-[44px]"
          >
            <CoverImage
              src={currentTrack.artworkUrl}
              thumbSrc={currentTrack.artworkThumbUrl}
              alt={currentTrack.title}
              className="w-10 h-10"
              roundedClass="rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-100 truncate">{currentTrack.title}</p>
              <p className="text-[11px] text-zinc-400 truncate">{currentTrack.artist}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => toggleLikeTrack(currentTrack)}
            aria-label={isLiked ? 'Unlike current track' : 'Like current track'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-300"
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'text-purple-400 fill-purple-400' : ''}`} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-purple-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.45)]"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 px-0.5">
          <button
            type="button"
            data-testid="mobile-mini-player-mute-button"
            onClick={toggleMute}
            aria-label={effectivelyMuted ? 'Unmute audio' : 'Mute audio'}
            aria-pressed={effectivelyMuted}
            className={`min-w-[32px] min-h-[28px] flex items-center justify-center rounded-md transition-colors ${
              effectivelyMuted ? 'text-purple-400 bg-purple-500/15' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <VolumeIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <input
            type="range"
            data-testid="mobile-mini-player-volume-slider"
            aria-label="Mini player volume"
            min={0}
            max={1}
            step={0.01}
            value={displayVolume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="nocturne-range flex-1"
          />
          <span className="text-[10px] font-mono tabular-nums text-zinc-400 w-8 text-right">
            {volumePercent}%
          </span>
        </div>
      </div>

      {/* Desktop Full-Width Bottom Player Bar */}
      <div className="hidden lg:flex fixed bottom-0 left-0 right-0 z-30 h-20 bg-[#0D0D14]/95 backdrop-blur-xl border-t border-white/10 px-6 items-center justify-between gap-6">
        {/* Left: Track Info */}
        <div className="flex items-center gap-3 w-72 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => setNowPlayingOpen(true)}
            aria-label={`Expand player for ${currentTrack.title}`}
            className="relative group shrink-0 rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <CoverImage
              src={currentTrack.artworkUrl}
              thumbSrc={currentTrack.artworkThumbUrl}
              alt={currentTrack.title}
              className="w-12 h-12"
            />
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setNowPlayingOpen(true)}
              className="text-sm font-semibold text-zinc-100 hover:text-purple-300 truncate block max-w-full text-left"
            >
              {currentTrack.title}
            </button>
            <p className="text-xs text-zinc-400 truncate">{currentTrack.artist}</p>
          </div>

          <button
            type="button"
            onClick={() => toggleLikeTrack(currentTrack)}
            aria-label={isLiked ? 'Unlike current track' : 'Like current track'}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-purple-300"
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'text-purple-400 fill-purple-400' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {/* Center: Transport & Progress Scrubber */}
        <div className="flex-1 max-w-xl flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label="Toggle shuffle"
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${
                shuffle ? 'text-purple-400' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Shuffle className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={playPrevious}
              aria-label="Previous track"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-200 hover:text-white"
            >
              <SkipBack className="w-4 h-4 fill-current" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.45)] transition-transform active:scale-95"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={playNext}
              aria-label="Next track"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-200 hover:text-white"
            >
              <SkipForward className="w-4 h-4 fill-current" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={cycleRepeatMode}
              aria-label={`Cycle repeat mode (currently ${repeatMode})`}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${
                repeatMode !== 'off' ? 'text-purple-400' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Repeat className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-2.5">
            <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              aria-label="Track seek progress"
              min={0}
              max={Math.max(1, duration)}
              step={0.5}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="nocturne-range flex-1"
            />
            <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: EQ, Queue, Expand & Volume */}
        <div className="flex items-center justify-end gap-2 w-80 shrink-0">
          <button
            type="button"
            onClick={() => setEqOpen(true)}
            aria-label="Open 10-band equalizer"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-purple-300"
          >
            <Sliders className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label="Open queue manager"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-purple-300"
          >
            <ListMusic className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setNowPlayingOpen(true)}
            aria-label="Open full-screen now playing and lyrics"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-300 bg-purple-500/12 hover:bg-purple-500/20 border border-purple-400/25 whitespace-nowrap"
          >
            Lyrics & Player
          </button>

          <div className="flex items-center gap-1.5 w-36 shrink-0">
            <button
              type="button"
              data-testid="mini-player-mute-button"
              onClick={toggleMute}
              aria-label={effectivelyMuted ? 'Unmute audio' : 'Mute audio'}
              aria-pressed={effectivelyMuted}
              className={`min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                effectivelyMuted ? 'text-purple-400 bg-purple-500/15' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <VolumeIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <input
              type="range"
              data-testid="mini-player-volume-slider"
              aria-label="Master volume"
              min={0}
              max={1}
              step={0.01}
              value={displayVolume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="nocturne-range flex-1"
            />
            <span
              data-testid="mini-player-volume-value"
              className="text-[11px] font-mono tabular-nums text-zinc-400 w-8 text-right shrink-0"
            >
              {volumePercent}%
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
