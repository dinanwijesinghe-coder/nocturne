import { ArrowDown, ArrowUp, ListMusic, Play, Trash2, X } from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';
import { formatTime } from '../utils/lrcParser';
import { CoverImage } from './CoverImage';

export function QueueModal() {
  const {
    isQueueOpen,
    setQueueOpen,
    queue,
    queueIndex,
    currentTrack,
    playTrack,
    moveQueueItem,
    removeFromQueue,
    clearQueue,
    autoplaySimilar,
    setAutoplaySimilar,
  } = useNocturne();

  if (!isQueueOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Queue Manager"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#111119] border border-white/12 p-5 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5">
            <ListMusic className="w-5 h-5 text-purple-400" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-white">Queue Manager</h2>
              <p className="text-xs text-zinc-400">{queue.length} tracks in sequence</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearQueue}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.05]"
            >
              Clear Upcoming
            </button>
            <button
              type="button"
              onClick={() => setQueueOpen(false)}
              aria-label="Close queue"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Autoplay similar tracks toggle */}
        <div className="py-3 border-b border-white/8 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs font-semibold text-zinc-200">Autoplay similar tracks</p>
            <p className="text-[11px] text-zinc-400">Continue playing matching music when queue ends</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoplaySimilar}
            aria-label="Toggle autoplay similar tracks"
            onClick={() => setAutoplaySimilar(!autoplaySimilar)}
            className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
              autoplaySimilar ? 'bg-purple-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                autoplaySimilar ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1.5">
          {queue.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">Queue is empty.</p>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex && currentTrack?.id === track.id;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                    isCurrent
                      ? 'bg-purple-500/15 border-purple-400/30'
                      : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void playTrack(track)}
                    aria-label={`Play ${track.title} from queue`}
                    className="relative shrink-0"
                  >
                    <CoverImage src={track.artworkUrl} thumbSrc={track.artworkThumbUrl} alt={track.title} className="w-10 h-10" />
                    {!isCurrent && (
                      <span className="sr-only">
                        <Play className="w-3 h-3" />
                      </span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-purple-300' : 'text-zinc-100'}`}>
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {track.artist} · {formatTime(track.duration)}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveQueueItem(idx, idx - 1)}
                      aria-label={`Move ${track.title} up`}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === queue.length - 1}
                      onClick={() => moveQueueItem(idx, idx + 1)}
                      aria-label={`Move ${track.title} down`}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(idx)}
                      aria-label={`Remove ${track.title} from queue`}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
