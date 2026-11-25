import type { Artist, Track } from '../types/audio';
import {
  fetchTrendingAudiusTracks,
  fetchPredictiveAudiusSuggestions,
  searchAudiusTracks,
} from './audiusApi';
import {
  fetchPipedHomeSongs,
  searchPipedSongs,
} from './pipedApi';
import { rankSearchResults } from '../utils/searchRanking';

export function mergeUniqueTracks(primary: Track[], secondary: Track[]): Track[] {
  const seenIds = new Set<string>();
  const out: Track[] = [];
  for (const t of [...primary, ...secondary]) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function mergeUniqueArtists(primary: Artist[], secondary: Artist[]): Artist[] {
  const seenIds = new Set<string>();
  const out: Artist[] = [];
  for (const a of [...primary, ...secondary]) {
    if (!seenIds.has(a.id)) {
      seenIds.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/**
 * Fetches live Home Trending tracks prioritizing Primary (Piped/Invidious Music Charts)
 * with Secondary (Audius Trending) appended below.
 */
export async function fetchLiveHomeFeed(
  genre = 'All'
): Promise<{
  tracks: Track[];
  artists: Artist[];
  fromNetwork: boolean;
}> {
  const [pipedRes, audiusRes] = await Promise.all([
    fetchPipedHomeSongs(genre, 12),
    fetchTrendingAudiusTracks(genre, 8),
  ]);

  const merged = mergeUniqueTracks(pipedRes.tracks, audiusRes.tracks);
  const tracks = rankSearchResults(merged, '');
  const artists = mergeUniqueArtists(pipedRes.artists, audiusRes.artists).slice(0, 8);

  return {
    tracks,
    artists,
    fromNetwork: pipedRes.fromNetwork || audiusRes.fromNetwork,
  };
}

/**
 * Searches real songs making Piped/Invidious Music search the primary source and
 * appending Audius results below. Ranks exact/official full-length original tracks first,
 * keeping remixes, sped up, slowed, covers, and short clips lower down in the list.
 */
export async function searchLiveMusic(
  query: string,
  externalSignal?: AbortSignal
): Promise<{
  tracks: Track[];
  fromNetwork: boolean;
}> {
  const clean = query.trim();
  if (!clean) return { tracks: [], fromNetwork: false };

  const [pipedRes, audiusRes] = await Promise.all([
    searchPipedSongs(clean, externalSignal, { filter: 'music_songs', limit: 20 }),
    searchAudiusTracks(clean, externalSignal),
  ]);

  const merged = mergeUniqueTracks(pipedRes.tracks, audiusRes.tracks);

  return {
    tracks: rankSearchResults(merged, clean),
    fromNetwork: pipedRes.fromNetwork || audiusRes.fromNetwork,
  };
}

/**
 * Real-time predictive suggestions prioritizing Piped/Invidious official song matches
 * ahead of Audius remixes and short clips.
 */
export async function fetchLivePredictiveSuggestions(
  query: string,
  externalSignal?: AbortSignal
): Promise<{
  artists: Artist[];
  tracks: Track[];
  fromNetwork: boolean;
}> {
  const clean = query.trim();
  if (!clean) return { artists: [], tracks: [], fromNetwork: false };

  const [pipedRes, audiusRes] = await Promise.all([
    searchPipedSongs(clean, externalSignal, { filter: 'music_songs', limit: 8 }),
    fetchPredictiveAudiusSuggestions(clean, externalSignal),
  ]);

  const mergedTracks = mergeUniqueTracks(pipedRes.tracks, audiusRes.tracks);

  return {
    artists: mergeUniqueArtists(pipedRes.artists, audiusRes.artists),
    tracks: rankSearchResults(mergedTracks, clean),
    fromNetwork: pipedRes.fromNetwork || audiusRes.fromNetwork,
  };
}
