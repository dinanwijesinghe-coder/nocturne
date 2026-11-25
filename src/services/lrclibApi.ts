import type { LyricsPayload, Track } from '../types/audio';
import { parseLrc } from '../utils/lrcParser';

function normalizeTrackTitleForLrc(rawTitle: string, artistName: string): string {
  let clean = rawTitle.trim();
  const artistLower = artistName.trim().toLowerCase();
  const dashIdx = clean.indexOf(' - ');
  if (dashIdx > 0) {
    const prefix = clean.slice(0, dashIdx).trim().toLowerCase();
    if (prefix === artistLower || artistLower.includes(prefix)) {
      clean = clean.slice(dashIdx + 3).trim();
    }
  }
  return clean
    .replace(/\s*[\[(](?:feat\.?|ft\.?|official\s+\w+|prod\.?[^)\]]*|remix|radio\s+edit)[^\])]*[\])]/gi, '')
    .trim();
}

async function queryLrclibGet(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LyricsPayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName) params.set('album_name', albumName);
    if (duration && duration > 0) params.set('duration', String(Math.round(duration)));

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.syncedLyrics || data?.plainLyrics) {
      return {
        synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : [],
        plain: data.plainLyrics || '',
        source: 'lrclib',
      };
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches time-synced (.lrc) and plain lyrics from LRCLIB (https://lrclib.net/api/get),
 * trying normalized track titles and LRCLIB search fallback, plus a clean offline/missing fallback.
 */
export async function fetchTrackLyrics(track: Track): Promise<LyricsPayload> {
  if (track.isPodcast) {
    return {
      synced: [],
      plain: track.description || 'Podcast episode audio stream.',
      source: 'none',
    };
  }

  try {
    // 1. Direct query to https://lrclib.net/api/get
    const exactHit = await queryLrclibGet(track.title, track.artist, track.album, track.duration);
    if (exactHit) return exactHit;

    // 2. Normalized title retry (handles Audius titles like "Artist - Song (feat. X)")
    const normalizedTitle = normalizeTrackTitleForLrc(track.title, track.artist);
    if (normalizedTitle && normalizedTitle !== track.title) {
      const normalizedHit = await queryLrclibGet(
        normalizedTitle,
        track.artist,
        track.album,
        track.duration
      );
      if (normalizedHit) return normalizedHit;
    }

    // 3. Secondary attempt via LRCLIB search endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${track.artist} ${normalizedTitle || track.title}`)}`,
        { signal: controller.signal }
      );
      if (searchRes.ok) {
        const list = await searchRes.json();
        if (Array.isArray(list) && list.length > 0) {
          const hit = list.find((item) => item.syncedLyrics) || list[0];
          if (hit?.syncedLyrics || hit?.plainLyrics) {
            return {
              synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [],
              plain: hit.plainLyrics || '',
              source: 'lrclib',
            };
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Graceful fallback when network is unavailable or LRCLIB has no entry
  }

  return {
    synced: [],
    plain: `No synced or plain lyrics were found on LRCLIB for "${track.title}" by ${track.artist}.`,
    source: 'none',
  };
}
