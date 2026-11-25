import React, { useState } from 'react';
import { Check, Download, Loader2, Mic2, Pause, Play, RotateCcw, RotateCw, Search } from 'lucide-react';
import type { Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';
import { searchPipedSongs } from '../services/pipedApi';
import { formatTime } from '../utils/lrcParser';
import { CoverImage } from './CoverImage';

export function PodcastsView() {
  const {
    podcastShows,
    podcastProgress,
    currentTrack,
    isPlaying,
    playTrack,
    togglePlayPause,
    skipBy,
    playbackSpeed,
    setPlaybackSpeed,
    offlineRecords,
    downloadTrackOffline,
    removeOfflineTrack,
  } = useNocturne();

  const [selectedShowId, setSelectedShowId] = useState(podcastShows[0]?.id || '');
  const [podcastQuery, setPodcastQuery] = useState('');
  const [searchedEpisodes, setSearchedEpisodes] = useState<Track[]>([]);
  const [isSearchingPods, setIsSearchingPods] = useState(false);
  const [hasSearchedPods, setHasSearchedPods] = useState(false);

  const activeShow = podcastShows.find((s) => s.id === selectedShowId) || podcastShows[0];
  const episodesToShow = hasSearchedPods ? searchedEpisodes : (activeShow?.episodes || []);

  const handlePodcastSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = podcastQuery.trim();
    if (!clean) {
      setHasSearchedPods(false);
      setSearchedEpisodes([]);
      return;
    }
    setIsSearchingPods(true);
    const res = await searchPipedSongs(`${clean} podcast`, undefined, {
      filter: 'videos',
      isPodcast: true,
      limit: 10,
    });
    setSearchedEpisodes(res.tracks);
    setHasSearchedPods(true);
    setIsSearchingPods(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Podcasts &amp; Discussions
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Live episodes via Piped · Resume from timestamp · 15s skip &amp; variable speed
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-[#12121B] border border-white/8 p-1 rounded-xl">
          {[1, 1.25, 1.5, 2].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setPlaybackSpeed(sp)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                playbackSpeed === sp ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {sp}x
            </button>
          ))}
        </div>
      </header>

      {/* Search Real Podcasts */}
      <form onSubmit={handlePodcastSearch} className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={podcastQuery}
            onChange={(e) => setPodcastQuery(e.target.value)}
            placeholder="Search real podcasts & interviews..."
            className="w-full rounded-xl bg-[#13131E] border border-white/12 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-400"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold whitespace-nowrap"
        >
          Find Episodes
        </button>
      </form>

      {/* Live Shows Selector Grid */}
      {!hasSearchedPods && podcastShows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {podcastShows.map((show) => {
            const active = show.id === activeShow?.id;
            return (
              <button
                key={show.id}
                type="button"
                onClick={() => setSelectedShowId(show.id)}
                className={`rounded-2xl border p-4 text-left flex items-start gap-4 transition-colors ${
                  active
                    ? 'bg-purple-500/12 border-purple-400/35'
                    : 'bg-[#111119] border-white/8 hover:border-white/20'
                }`}
              >
                <CoverImage src={show.artworkUrl} alt={show.title} className="w-20 h-20" roundedClass="rounded-2xl" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-purple-300">{show.category}</p>
                  <h2 className="text-base font-bold text-white truncate mt-0.5">{show.title}</h2>
                  <p className="text-xs text-zinc-400 truncate">{show.host}</p>
                  <p className="text-xs text-zinc-500 line-clamp-2 mt-1.5">{show.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Episode List */}
      <section aria-label="Podcast episodes" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Mic2 className="w-4 h-4 text-purple-400" aria-hidden="true" />
            {hasSearchedPods
              ? `Results for "${podcastQuery.trim()}"`
              : (activeShow?.title || 'Live Podcast Episodes')}
          </h3>
          <span className="text-xs text-zinc-400 font-mono tabular-nums">
            {isSearchingPods ? 'Searching...' : `${episodesToShow.length} episodes`}
          </span>
        </div>

        {isSearchingPods ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" aria-hidden="true" />
            Searching...
          </div>
        ) : episodesToShow.length === 0 ? (
          <p className="text-sm text-zinc-400 py-8 text-center">
            {hasSearchedPods ? 'No episodes found.' : 'Loading live podcast episodes...'}
          </p>
        ) : (
          <div className="space-y-3">
            {episodesToShow.map((ep) => {
              const prog = podcastProgress[ep.id];
              const isCurrent = currentTrack?.id === ep.id;
              const isOffline = offlineRecords.some((r) => r.id === ep.id);
              const pct = prog && prog.duration > 0 ? Math.min(100, (prog.position / prog.duration) * 100) : 0;

              return (
                <div
                  key={ep.id}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isCurrent
                      ? 'bg-purple-500/12 border-purple-400/30'
                      : 'bg-[#0C0C12] border-white/8'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <CoverImage src={ep.artworkUrl} alt={ep.title} className="w-14 h-14" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white">{ep.title}</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{ep.artist}</p>
                      <p className="text-xs text-zinc-500 font-mono tabular-nums mt-1.5">
                        {prog && prog.position > 0
                          ? `Resume from ${formatTime(prog.position)} / ${formatTime(ep.duration)}`
                          : `Duration ${formatTime(ep.duration)}`}
                      </p>
                    </div>
                  </div>

                  {prog && prog.position > 0 && (
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-purple-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) togglePlayPause();
                          else void playTrack(ep, episodesToShow, prog?.position || 0);
                        }}
                        className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        {isCurrent && isPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
                            {prog && prog.position > 0 ? 'Resume' : 'Play Episode'}
                          </>
                        )}
                      </button>

                      {isCurrent && (
                        <>
                          <button
                            type="button"
                            onClick={() => skipBy(-15)}
                            aria-label="Skip back 15 seconds"
                            className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-mono flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            15s
                          </button>
                          <button
                            type="button"
                            onClick={() => skipBy(15)}
                            aria-label="Skip forward 15 seconds"
                            className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-mono flex items-center gap-1"
                          >
                            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                            15s
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => (isOffline ? void removeOfflineTrack(ep.id) : void downloadTrackOffline(ep))}
                      aria-label={isOffline ? `Remove offline ${ep.title}` : `Download ${ep.title}`}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 ${
                        isOffline
                          ? 'border-purple-400/35 bg-purple-500/15 text-purple-200'
                          : 'border-white/10 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {isOffline ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
                      {isOffline ? 'Saved Offline' : 'Download'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
