import type { Artist, Track } from '../types/audio';
import { isOfficialTrackMatch, isVariantOrRemixTrack } from './searchRanking';

export type SuggestionKind = 'artist' | 'track' | 'trend';

export interface SearchSuggestion {
  id: string;
  kind: SuggestionKind;
  label: string;
  subtitle: string;
  queryText: string;
  artworkUrl?: string;
  score: number;
  artist?: Artist;
  track?: Track;
}

export interface BuildSuggestionsInput {
  query: string;
  artists: Artist[];
  tracks: Track[];
  trendingTracks: Track[];
  trendingArtists?: Artist[];
  limit?: number;
}

export function formatCompactCount(count?: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function scoreTextMatch(text: string, cleanQuery: string): number {
  const lowerText = text.toLowerCase();
  if (!cleanQuery) return 10;
  if (lowerText === cleanQuery) return 120;
  if (lowerText.startsWith(cleanQuery)) return 90;
  const wordBoundaryIdx = lowerText.indexOf(` ${cleanQuery}`);
  if (wordBoundaryIdx >= 0) return 75;
  if (lowerText.includes(cleanQuery)) return 55;
  return 0;
}

/**
 * Builds ranked predictive suggestions combining popular artists, official tracks, and trends.
 */
export function buildPredictiveSuggestions({
  query,
  artists,
  tracks,
  trendingTracks,
  trendingArtists = [],
  limit = 8,
}: BuildSuggestionsInput): SearchSuggestion[] {
  const cleanQuery = query.trim().toLowerCase();
  const seenKeys = new Set<string>();
  const suggestions: SearchSuggestion[] = [];

  // When query is empty, surface real-time trending artists & tracks
  if (!cleanQuery) {
    for (const artist of trendingArtists.slice(0, 3)) {
      const key = `artist:${artist.name.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const followers = formatCompactCount(artist.followersCount);
      suggestions.push({
        id: `trend-artist-${artist.id}`,
        kind: 'artist',
        label: artist.name,
        subtitle: followers ? `Trending Artist · ${followers} followers` : 'Trending Artist',
        queryText: artist.name,
        artworkUrl: artist.avatarUrl,
        score: 100 + Math.log10(Math.max(10, artist.followersCount || 10)),
        artist,
      });
    }

    for (const track of trendingTracks.slice(0, 5)) {
      const key = `track:${track.title.toLowerCase()}:${track.artist.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const plays = formatCompactCount(track.playCount);
      suggestions.push({
        id: `trend-track-${track.id}`,
        kind: 'trend',
        label: track.title,
        subtitle: plays ? `${track.artist} · ${plays} plays` : `${track.artist} · Trending`,
        queryText: track.title,
        artworkUrl: track.artworkThumbUrl || track.artworkUrl,
        score: 80 + Math.log10(Math.max(10, track.playCount || 10)),
        track,
      });
    }

    return suggestions.slice(0, limit);
  }

  // Score artist matches
  const allArtists = [...artists, ...trendingArtists];
  for (const artist of allArtists) {
    const nameScore = scoreTextMatch(artist.name, cleanQuery);
    const handleScore = scoreTextMatch(artist.handle.replace(/^@/, ''), cleanQuery) * 0.85;
    const matchScore = Math.max(nameScore, handleScore);
    if (matchScore <= 0) continue;

    const key = `artist:${artist.name.toLowerCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const popularityBoost = Math.log10(Math.max(10, artist.followersCount || 10)) * 4;
    const followers = formatCompactCount(artist.followersCount);

    suggestions.push({
      id: `sug-artist-${artist.id}`,
      kind: 'artist',
      label: artist.name,
      subtitle: followers ? `Artist · ${followers} followers` : `Artist · ${artist.handle}`,
      queryText: artist.name,
      artworkUrl: artist.avatarUrl,
      score: matchScore + popularityBoost + 8, // slight priority to exact/prefix artists
      artist,
    });
  }

  // Score track & trending matches, keeping original/official Piped tracks above remixes
  const combinedTracks = [...tracks, ...trendingTracks];
  for (const track of combinedTracks) {
    const titleScore = scoreTextMatch(track.title, cleanQuery);
    const artistScore = scoreTextMatch(track.artist, cleanQuery) * 0.8;
    const genreScore = scoreTextMatch(track.genre, cleanQuery) * 0.65;
    const matchScore = Math.max(titleScore, artistScore, genreScore);
    if (matchScore <= 0) continue;

    const key = `track:${track.title.toLowerCase()}:${track.artist.toLowerCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const isVariant = isVariantOrRemixTrack(track, cleanQuery);
    const isOfficial = isOfficialTrackMatch(track, cleanQuery);
    const isPrimary = track.source === 'piped';

    const sourceBoost = isPrimary ? 55 : 0;
    const officialBoost = isOfficial ? 45 : 0;
    const variantPenalty = isVariant ? -70 : 0;
    const popularityBoost = Math.log10(Math.max(10, track.playCount || 10)) * 3.5;
    const plays = formatCompactCount(track.playCount);

    suggestions.push({
      id: `sug-track-${track.id}`,
      kind: 'track',
      label: track.title,
      subtitle: plays ? `${track.artist} · ${track.genre} · ${plays} plays` : `${track.artist} · ${track.genre}`,
      queryText: track.title,
      artworkUrl: track.artworkThumbUrl || track.artworkUrl,
      score: matchScore + sourceBoost + officialBoost + variantPenalty + popularityBoost,
      track,
    });
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Splits text into [before, match, after] for safe inline highlight rendering.
 */
export function highlightMatchSegments(
  text: string,
  query: string
): { before: string; match: string; after: string } {
  const clean = query.trim();
  if (!clean) return { before: text, match: '', after: '' };
  const idx = text.toLowerCase().indexOf(clean.toLowerCase());
  if (idx < 0) return { before: text, match: '', after: '' };
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + clean.length),
    after: text.slice(idx + clean.length),
  };
}
