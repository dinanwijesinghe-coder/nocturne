import type { PlayEvent, RepeatMode, Track, WrappedStats } from '../types/audio';

/**
 * Computes the next track index in the queue respecting shuffle and repeat modes.
 * Returns -1 if playback should stop (or trigger autoplay).
 */
export function computeNextIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
  shuffle: boolean,
  rng: () => number = Math.random
): number {
  if (queueLength <= 0) return -1;
  if (repeatMode === 'one') return Math.max(0, Math.min(currentIndex, queueLength - 1));

  if (shuffle && queueLength > 1) {
    let next = Math.floor(rng() * queueLength);
    if (next === currentIndex) {
      next = (currentIndex + 1) % queueLength;
    }
    return next;
  }

  if (currentIndex + 1 < queueLength) {
    return currentIndex + 1;
  }

  return repeatMode === 'all' ? 0 : -1;
}

/**
 * Computes previous track index; wraps when repeatMode === 'all'.
 */
export function computePrevIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode
): number {
  if (queueLength <= 0) return -1;
  if (currentIndex > 0) return currentIndex - 1;
  return repeatMode === 'all' ? queueLength - 1 : 0;
}

/**
 * Reorders an item in a list immutably.
 */
export function reorderQueue<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

/**
 * Picks similar tracks for Autoplay when the queue reaches the end.
 */
export function findSimilarTracks(
  currentTrack: Track | null,
  catalog: Track[],
  excludeIds: Set<string>,
  limit = 4
): Track[] {
  if (!catalog.length) return [];
  const candidates = catalog.filter(
    (t) => !excludeIds.has(t.id) && !t.isPodcast && (!currentTrack || t.id !== currentTrack.id)
  );

  if (!currentTrack) return candidates.slice(0, limit);

  const scored = candidates.map((track) => {
    let score = 0;
    if (track.genre.toLowerCase() === currentTrack.genre.toLowerCase()) score += 3;
    if (track.artistId === currentTrack.artistId) score += 2;
    if (track.source === currentTrack.source) score += 1;
    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.track);
}

/**
 * Computes equal-power crossfade gains [outgoingGain, incomingGain] for normalized progress [0..1].
 */
export function calculateCrossfadeGains(progress: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const outgoing = Math.cos(clamped * Math.PI * 0.5);
  const incoming = Math.sin(clamped * Math.PI * 0.5);
  return [Number(outgoing.toFixed(4)), Number(incoming.toFixed(4))];
}

/**
 * Aggregates play events into "Your Wrapped" listening statistics.
 */
export function computeWrappedStats(events: PlayEvent[]): WrappedStats {
  const songMap = new Map<string, { trackId: string; title: string; artist: string; plays: number; seconds: number }>();
  const artistMap = new Map<string, { artist: string; plays: number; seconds: number }>();
  const genreMap = new Map<string, number>();

  let totalSeconds = 0;

  for (const ev of events) {
    totalSeconds += ev.secondsListened;

    const existingSong = songMap.get(ev.trackId);
    if (existingSong) {
      existingSong.plays += 1;
      existingSong.seconds += ev.secondsListened;
    } else {
      songMap.set(ev.trackId, {
        trackId: ev.trackId,
        title: ev.title,
        artist: ev.artist,
        plays: 1,
        seconds: ev.secondsListened,
      });
    }

    const existingArtist = artistMap.get(ev.artist);
    if (existingArtist) {
      existingArtist.plays += 1;
      existingArtist.seconds += ev.secondsListened;
    } else {
      artistMap.set(ev.artist, {
        artist: ev.artist,
        plays: 1,
        seconds: ev.secondsListened,
      });
    }

    const genreKey = ev.genre || 'Electronic';
    genreMap.set(genreKey, (genreMap.get(genreKey) || 0) + ev.secondsListened);
  }

  const topSongs = Array.from(songMap.values())
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 5)
    .map((s) => ({
      trackId: s.trackId,
      title: s.title,
      artist: s.artist,
      plays: s.plays,
      minutes: Math.max(1, Math.round(s.seconds / 60)),
    }));

  const topArtists = Array.from(artistMap.values())
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
    .slice(0, 5)
    .map((a) => ({
      artist: a.artist,
      plays: a.plays,
      minutes: Math.max(1, Math.round(a.seconds / 60)),
    }));

  const genreTotal = Array.from(genreMap.values()).reduce((sum, v) => sum + v, 0) || 1;
  const topGenres = Array.from(genreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, sec]) => ({
      genre,
      minutes: Math.max(1, Math.round(sec / 60)),
      percentage: Math.round((sec / genreTotal) * 100),
    }));

  return {
    totalMinutes: Math.round(totalSeconds / 60),
    totalPlays: events.length,
    topSongs,
    topArtists,
    topGenres,
  };
}

/**
 * Generates a short human-readable collaborative playlist invite code.
 */
export function generateInviteCode(playlistName: string, seed = Date.now()): string {
  const prefix = playlistName
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'NOCT';
  const suffix = (seed % 9000 + 1000).toString(36).toUpperCase().padStart(4, 'X');
  return `${prefix}-${suffix}`;
}
