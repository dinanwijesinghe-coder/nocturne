import { Play, Sliders, UserCheck, UserPlus, Users } from 'lucide-react';
import type { Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';

const GENRE_FILTERS = ['All', 'Electronic', 'Hip-Hop/Rap', 'Pop', 'R&B', 'Lo-Fi'];

interface HomeViewProps {
  onAddToPlaylistClick: (track: Track) => void;
}

export function HomeView({ onAddToPlaylistClick }: HomeViewProps) {
  const {
    profile,
    setAuthOpen,
    setEqOpen,
    trendingTracks,
    isLoadingTrending,
    selectedGenre,
    setSelectedGenre,
    isAudiusOnline,
    playTrack,
    playlists,
    artists,
    followedArtistIds,
    toggleFollowArtist,
    friends,
    setActiveTab,
    allKnownTracks,
  } = useNocturne();

  const playPlaylist = (playlistTrackIds: string[]) => {
    const resolved = playlistTrackIds
      .map((id) => allKnownTracks.find((t) => t.id === id))
      .filter((t): t is Track => Boolean(t));
    if (resolved.length > 0) {
      void playTrack(resolved[0], resolved);
    }
  };

  return (
    <div className="space-y-8">
      {/* Scrollable Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Evening Sessions
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {isAudiusOnline ? 'Streaming live via Piped & Audius' : 'Connecting to live music feeds...'} ·{' '}
            {profile ? `Signed in as ${profile.displayName}` : 'Guest listener'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEqOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/25 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
            Studio EQ
          </button>

          <button
            type="button"
            onClick={() => (profile ? setActiveTab('profile') : setAuthOpen(true))}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 whitespace-nowrap"
          >
            {profile ? profile.displayName : 'Sign In'}
          </button>
        </div>
      </header>

      {/* Genre Segmented Filters */}
      <section aria-label="Genre filters">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {GENRE_FILTERS.map((genre) => {
            const active = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-purple-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.35)]'
                    : 'bg-[#12121B] text-zinc-400 hover:text-zinc-100 border border-white/8'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </section>

      {/* User Playlists (only rendered when real playlists exist) */}
      {playlists.length > 0 && (
        <section aria-label="Curated Playlists">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-lg font-bold text-white">Your Playlists &amp; Shared Mixes</h2>
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className="text-xs font-medium text-purple-300 hover:text-purple-200"
            >
              Open Library
            </button>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${
              playlists.length >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'
            }`}
          >
            {playlists.slice(0, 3).map((pl) => (
              <div
                key={pl.id}
                className="group rounded-2xl bg-[#12121B]/85 border border-white/8 p-4 flex items-center gap-4 hover:border-purple-400/30 transition-colors"
              >
                <CoverImage src={pl.coverUrl} alt={pl.name} className="w-16 h-16" roundedClass="rounded-xl" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{pl.name}</h3>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {pl.trackIds.length} tracks
                    {pl.isCollaborative ? ` · Shared (${pl.inviteCode})` : ''}
                  </p>
                </div>
                {pl.trackIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playPlaylist(pl.trackIds)}
                    aria-label={`Play playlist ${pl.name}`}
                    className="w-11 h-11 rounded-full bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(168,85,247,0.4)] transition-transform active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white ml-0.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Split: Live Trending Charts + Live Artists */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section aria-label="Trending Charts" className="xl:col-span-8 rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-white">Trending Charts</h2>
              <p className="text-xs text-zinc-400">
                {selectedGenre === 'All' ? 'Live charts from Piped Music & Audius' : `${selectedGenre} live charts`}
              </p>
            </div>
            {trendingTracks.length > 0 && (
              <button
                type="button"
                onClick={() => void playTrack(trendingTracks[0], trendingTracks)}
                className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold whitespace-nowrap"
              >
                Play All
              </button>
            )}
          </div>

          {isLoadingTrending ? (
            <div className="space-y-3 py-2" aria-label="Loading trending tracks">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-11 h-11 rounded-xl bg-white/8 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-44 rounded bg-white/8 animate-pulse" />
                    <div className="h-3 w-28 rounded bg-white/5 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : trendingTracks.length === 0 ? (
            <p className="text-sm text-zinc-400 py-10 text-center">
              No tracks found. Try another genre or search directly.
            </p>
          ) : (
            <div className="space-y-1">
              {trendingTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  queueContext={trendingTracks}
                  onAddToPlaylistClick={onAddToPlaylistClick}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Live Artists & Friends Listening */}
        <div className="xl:col-span-4 space-y-5">
          <section aria-label="Artists to Follow" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
            <h2 className="text-base font-bold text-white mb-3">Live Artists</h2>
            {artists.length === 0 ? (
              <p className="text-xs text-zinc-400 py-4">
                {isLoadingTrending ? 'Loading live artists...' : 'Search or browse charts to discover artists.'}
              </p>
            ) : (
              <div className="space-y-3">
                {artists.slice(0, 5).map((artist) => {
                  const isFollowing = followedArtistIds.includes(artist.id);
                  return (
                    <div key={artist.id} className="flex items-center gap-3">
                      <CoverImage src={artist.avatarUrl} alt={artist.name} className="w-11 h-11" roundedClass="rounded-full" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-100 truncate">{artist.name}</p>
                        <p className="text-xs text-zinc-400 font-mono tabular-nums truncate">
                          {artist.followersCount > 0
                            ? `${artist.followersCount.toLocaleString()} followers`
                            : artist.handle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFollowArtist(artist.id, artist.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          isFollowing
                            ? 'bg-purple-500/18 text-purple-200 border border-purple-400/30'
                            : 'bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12] border border-white/10'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                            Follow
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {friends.length > 0 && (
            <section aria-label="Friends Activity Preview" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" aria-hidden="true" />
                  Friends Listening
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="text-xs text-purple-300 hover:text-purple-200"
                >
                  See all
                </button>
              </div>
              <div className="space-y-3">
                {friends.filter((f) => f.isFollowing).slice(0, 3).map((friend) => (
                  <div key={friend.id} className="flex items-center gap-3">
                    <CoverImage src={friend.avatarUrl} alt={friend.displayName} className="w-9 h-9" roundedClass="rounded-full" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{friend.displayName}</p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {friend.trackTitle} · {friend.artistName}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">
                      {friend.minutesAgo}m
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
