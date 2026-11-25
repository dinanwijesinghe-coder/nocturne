import { Check, Download, Heart, ListPlus, Loader2, Pause, Play, Plus } from 'lucide-react';
import type { Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';
import { formatTime } from '../utils/lrcParser';
import { getTrackSourceBadge } from '../utils/searchRanking';
import { CoverImage } from './CoverImage';

interface TrackRowProps {
  track: Track;
  index?: number;
  queueContext?: Track[];
  onAddToPlaylistClick?: (track: Track) => void;
}

export function TrackRow({ track, index, queueContext, onAddToPlaylistClick }: TrackRowProps) {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlayPause,
    likedTrackIds,
    toggleLikeTrack,
    addToQueue,
    offlineRecords,
    downloadingIds,
    downloadTrackOffline,
    removeOfflineTrack,
  } = useNocturne();

  const isCurrent = currentTrack?.id === track.id;
  const isLiked = likedTrackIds.includes(track.id);
  const isOffline = offlineRecords.some((r) => r.id === track.id);
  const isDownloading = downloadingIds.has(track.id);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      void playTrack(track, queueContext);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
        isCurrent
          ? 'bg-purple-500/12 border border-purple-400/25'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      {typeof index === 'number' && (
        <span className="hidden sm:inline-block w-6 text-center text-xs font-mono tabular-nums text-zinc-500">
          {index + 1}
        </span>
      )}

      <button
        type="button"
        onClick={handlePlay}
        aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="relative shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      >
        <CoverImage
          src={track.artworkUrl}
          thumbSrc={track.artworkThumbUrl}
          alt={`${track.title} cover`}
          className="w-11 h-11"
        />
        <span
          className={`absolute inset-0 rounded-xl flex items-center justify-center transition-opacity bg-black/55 ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4 text-purple-300 fill-purple-300" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4 text-white fill-white ml-0.5" aria-hidden="true" />
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={handlePlay}
        className="flex-1 min-w-0 text-left py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-lg"
      >
        {(() => {
          const badge = getTrackSourceBadge(track);
          const badgeClass =
            badge.variant === 'official'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
              : badge.variant === 'yt'
                ? 'bg-purple-500/15 text-purple-200 border-purple-400/25'
                : badge.variant === 'audius'
                  ? 'bg-amber-500/12 text-amber-200 border-amber-400/25'
                  : 'bg-white/[0.06] text-zinc-300 border-white/12';

          return (
            <div className="flex items-center gap-2 min-w-0">
              <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-purple-300' : 'text-zinc-100'}`}>
                {track.title}
              </p>
              <span
                data-testid="track-source-badge"
                className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border ${badgeClass}`}
              >
                {badge.label}
              </span>
            </div>
          );
        })()}
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          <span>{track.artist}</span>
          <span aria-hidden="true"> · </span>
          <span>{track.genre}</span>
          <span aria-hidden="true"> · </span>
          <span className="font-mono tabular-nums">{formatTime(track.duration)}</span>
          {isOffline && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="text-purple-300">Offline</span>
            </>
          )}
        </p>
      </button>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => toggleLikeTrack(track)}
          aria-label={isLiked ? `Unlike ${track.title}` : `Like ${track.title}`}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-purple-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <Heart
            className={`w-4 h-4 ${isLiked ? 'text-purple-400 fill-purple-400' : ''}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => (isOffline ? void removeOfflineTrack(track.id) : void downloadTrackOffline(track))}
          aria-label={isOffline ? `Remove offline download for ${track.title}` : `Download ${track.title} offline`}
          disabled={isDownloading}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-purple-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" aria-hidden="true" />
          ) : isOffline ? (
            <Check className="w-4 h-4 text-purple-400" aria-hidden="true" />
          ) : (
            <Download className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => addToQueue(track)}
          aria-label={`Add ${track.title} to queue`}
          className="min-w-[38px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <ListPlus className="w-4 h-4" aria-hidden="true" />
        </button>

        {onAddToPlaylistClick && (
          <button
            type="button"
            onClick={() => onAddToPlaylistClick(track)}
            aria-label={`Save ${track.title} to playlist`}
            className="hidden sm:flex min-w-[40px] min-h-[40px] items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
