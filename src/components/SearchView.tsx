import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  History,
  Loader2,
  Play,
  Search,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { Artist, Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';
import {
  fetchLivePredictiveSuggestions,
  searchLiveMusic,
} from '../services/musicApi';
import {
  buildPredictiveSuggestions,
  highlightMatchSegments,
  type SearchSuggestion,
} from '../utils/searchSuggestions';
import { getTrackSourceBadge } from '../utils/searchRanking';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';

const BROWSE_CATEGORIES = [
  { label: 'Pop Hits', subtitle: 'Mainstream charts & global pop' },
  { label: 'Electronic', subtitle: 'Modular house & bass music' },
  { label: 'Hip-Hop', subtitle: 'Rap hits & independent flows' },
  { label: 'R&B', subtitle: 'Soul vocals & late-night grooves' },
  { label: 'Lo-Fi', subtitle: 'Chill beats & study sessions' },
  { label: 'Indie', subtitle: 'Independent releases & remixes' },
];

interface SearchViewProps {
  onAddToPlaylistClick: (track: Track) => void;
}

export function SearchView({ onAddToPlaylistClick }: SearchViewProps) {
  const {
    recentSearches,
    addRecentSearch,
    trendingTracks,
    artists: knownArtists,
    playTrack,
    followedArtistIds,
    toggleFollowArtist,
  } = useNocturne();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Predictive suggestion engine state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictedArtists, setPredictedArtists] = useState<Artist[]>([]);
  const [predictedTracks, setPredictedTracks] = useState<Track[]>([]);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close predictive dropdown when clicking outside
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Fast predictive live API suggestions while typing
  useEffect(() => {
    const clean = query.trim();
    setActiveSuggestionIdx(-1);

    if (!clean) {
      setPredictedArtists([]);
      setPredictedTracks([]);
      setIsPredicting(false);
      return;
    }

    const controller = new AbortController();
    setIsPredicting(true);

    const timer = setTimeout(async () => {
      const data = await fetchLivePredictiveSuggestions(clean, controller.signal);
      if (!controller.signal.aborted) {
        setPredictedArtists(data.artists);
        setPredictedTracks(data.tracks);
        setIsPredicting(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Debounced full search results (Primary Piped Music + Secondary Audius)
  useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    setHasSearched(false);

    const timer = setTimeout(async () => {
      const res = await searchLiveMusic(clean, controller.signal);
      if (!controller.signal.aborted) {
        setResults(res.tracks);
        setHasSearched(true);
        setIsSearching(false);
        setIsDropdownOpen(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const suggestions = useMemo(() => {
    return buildPredictiveSuggestions({
      query,
      artists: predictedArtists,
      tracks: predictedTracks,
      trendingTracks,
      trendingArtists: knownArtists,
      limit: 8,
    });
  }, [query, predictedArtists, predictedTracks, trendingTracks, knownArtists]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setIsDropdownOpen(false);
    addRecentSearch(clean);
    setIsSearching(true);
    const res = await searchLiveMusic(clean);
    setResults(res.tracks);
    setHasSearched(true);
    setIsSearching(false);
  };

  const triggerPresetSearch = (term: string) => {
    setQuery(term);
    addRecentSearch(term);
    setIsDropdownOpen(false);
  };

  const handleSelectSuggestion = (sug: SearchSuggestion) => {
    setQuery(sug.queryText);
    addRecentSearch(sug.queryText);
    setIsDropdownOpen(false);
    if (sug.track) {
      void playTrack(sug.track, predictedTracks.length ? predictedTracks : trendingTracks);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setActiveSuggestionIdx(-1);
    } else if (e.key === 'Enter' && activeSuggestionIdx >= 0 && suggestions[activeSuggestionIdx]) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[activeSuggestionIdx]);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Search</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Live search across Piped, Invidious &amp; Audius — official songs first
        </p>
      </header>

      {/* Search Bar + Predictive Suggestions Popover */}
      <div ref={containerRef} className="relative max-w-2xl z-20">
        <form onSubmit={handleSubmit} className="relative">
          <Search
            className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="search-tracks-input" className="sr-only">
            Search songs, artists, or genres
          </label>
          <input
            ref={inputRef}
            id="search-tracks-input"
            type="text"
            inputMode="search"
            role="combobox"
            aria-expanded={isDropdownOpen && suggestions.length > 0}
            aria-controls="predictive-search-listbox"
            aria-autocomplete="list"
            value={query}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search songs like 'Beauty and a Beat', artists, or remixes..."
            className="w-full rounded-2xl bg-[#13131E] border border-white/12 pl-11 pr-11 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setHasSearched(false);
                setPredictedArtists([]);
                setPredictedTracks([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </form>

        {/* Predictive Suggestions Panel */}
        {isDropdownOpen && (suggestions.length > 0 || isPredicting) && (
          <div
            id="predictive-search-listbox"
            role="listbox"
            aria-label="Predictive search suggestions"
            className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl bg-[#11111B]/95 backdrop-blur-xl border border-purple-400/25 shadow-[0_16px_40px_rgba(0,0,0,0.75)] overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-white/8 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                {query.trim() ? 'Live Suggestions' : 'Trending Now'}
              </span>
              <div className="flex items-center gap-3">
                {isPredicting && (
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-400" aria-hidden="true" />
                    Searching...
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  aria-label="Hide suggestions"
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Hide
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.05]">
              {suggestions.map((sug, idx) => {
                const isActive = idx === activeSuggestionIdx;
                const { before, match, after } = highlightMatchSegments(sug.label, query);
                const isFollowingArtist = sug.artist
                  ? followedArtistIds.includes(sug.artist.id)
                  : false;

                return (
                  <div
                    key={sug.id}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-center gap-3 px-3.5 py-2.5 transition-colors ${
                      isActive ? 'bg-purple-500/18' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <CoverImage
                        src={sug.artworkUrl || ''}
                        alt={sug.label}
                        className="w-10 h-10"
                        roundedClass={sug.kind === 'artist' ? 'rounded-full' : 'rounded-lg'}
                        eager
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            <span>{before}</span>
                            {match && (
                              <span className="text-purple-300 font-bold">{match}</span>
                            )}
                            <span>{after}</span>
                          </p>
                          {sug.track && (() => {
                            const badge = getTrackSourceBadge(sug.track);
                            const badgeClass =
                              badge.variant === 'official'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                                : badge.variant === 'yt'
                                  ? 'bg-purple-500/15 text-purple-200 border-purple-400/25'
                                  : badge.variant === 'audius'
                                    ? 'bg-amber-500/12 text-amber-200 border-amber-400/25'
                                    : 'bg-white/[0.06] text-zinc-300 border-white/12';
                            return (
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${badgeClass}`}>
                                {badge.label}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{sug.subtitle}</p>
                      </div>
                    </button>

                    {sug.artist ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFollowArtist(sug.artist!.id, sug.artist!.name);
                        }}
                        aria-label={
                          isFollowingArtist
                            ? `Unfollow ${sug.artist.name}`
                            : `Follow ${sug.artist.name}`
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 shrink-0 transition-colors ${
                          isFollowingArtist
                            ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                            : 'bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12] border border-white/10'
                        }`}
                      >
                        {isFollowingArtist ? (
                          <>
                            <UserCheck className="w-3 h-3" aria-hidden="true" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" aria-hidden="true" />
                            Follow
                          </>
                        )}
                      </button>
                    ) : sug.track ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsDropdownOpen(false);
                          addRecentSearch(sug.track!.title);
                          void playTrack(
                            sug.track!,
                            predictedTracks.length ? predictedTracks : trendingTracks
                          );
                        }}
                        aria-label={`Play ${sug.track.title}`}
                        className="w-8 h-8 rounded-full bg-purple-500/20 hover:bg-purple-500 text-purple-200 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                      </button>
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Searches */}
      {!query && recentSearches.length > 0 && (
        <section aria-label="Recent searches">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2.5">
            <History className="w-4 h-4 text-purple-400" aria-hidden="true" />
            Recent Searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => triggerPresetSearch(term)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-[#13131E] hover:bg-purple-500/18 border border-white/8 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Search Results */}
      {query ? (
        <section aria-label="Search Results" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">
              Results for &ldquo;{query.trim()}&rdquo;
            </h2>
            <span className="text-xs font-mono text-zinc-400 tabular-nums flex items-center gap-1.5">
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" aria-hidden="true" />
                  Searching...
                </>
              ) : (
                `${results.length} tracks`
              )}
            </span>
          </div>

          {isSearching ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-300">Searching live music streams...</p>
            </div>
          ) : hasSearched && results.length === 0 ? (
            <p className="text-sm text-zinc-400 py-10 text-center">
              No tracks found for &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  queueContext={results}
                  onAddToPlaylistClick={onAddToPlaylistClick}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Browse Genres & Quick Live Trending */
        <div className="space-y-6">
          <section aria-label="Browse by genre">
            <h2 className="text-lg font-bold text-white mb-3">Browse Genres</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BROWSE_CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => triggerPresetSearch(cat.label)}
                  className="rounded-2xl bg-gradient-to-br from-[#171526] to-[#101018] border border-white/8 hover:border-purple-400/35 p-4 text-left transition-colors"
                >
                  <p className="text-sm font-bold text-white">{cat.label}</p>
                  <p className="text-xs text-zinc-400 mt-1">{cat.subtitle}</p>
                </button>
              ))}
            </div>
          </section>

          {trendingTracks.length > 0 && (
            <section aria-label="Recommended tracks" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
              <h2 className="text-base font-bold text-white mb-3">Popular Right Now</h2>
              <div className="space-y-1">
                {trendingTracks.slice(0, 8).map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    queueContext={trendingTracks}
                    onAddToPlaylistClick={onAddToPlaylistClick}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
