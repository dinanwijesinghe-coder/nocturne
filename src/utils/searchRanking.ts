import type { Track } from '../types/audio';

const VARIANT_MODIFIERS = [
  { key: 'remix', pattern: /\b(?:remix|bootleg|mashup|megamix|rework|vip\s*mix)\b/i },
  { key: 'sped up', pattern: /\b(?:sped\s*up|speed\s*up|nightcore)\b/i },
  { key: 'slowed', pattern: /\b(?:slowed|reverb|chopped|screwed|bass\s*boosted)\b/i },
  { key: 'cover', pattern: /\b(?:cover|tribute|parody|karaoke|in\s+the\s+style\s+of)\b/i },
  { key: 'instrumental', pattern: /\b(?:instrumental|acapella|a\s*cappella)\b/i },
  { key: '8d', pattern: /\b(?:8d\s*audio|16d\s*audio|hardtekk|phonk|hoodtrap|mylancore|jersey\s*club)\b/i },
  { key: 'short', pattern: /\b(?:ringtone|teaser|snippet|30\s*sec|preview\s*clip)\b/i },
] as const;

const OFFICIAL_TITLE_PATTERN = /\b(?:official\s*(?:music\s*)?(?:audio|video)|official\s*lyric\s*video|official\s*visualizer)\b/i;

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Strips non-identifying bracketed tags like "(feat. ...)" or "(Official Audio)"
 * so exact original song titles match cleanly against queries.
 */
export function stripStandardTitleExtras(title: string): string {
  return title
    .replace(/\((?:feat\.?|ft\.?|with|official\s*(?:music\s*)?(?:audio|video)|lyric\s*video|visualizer|audio|hd|4k)[^)]*\)/gi, '')
    .replace(/\[(?:official|music\s*video|lyrics|audio|hd|4k|explicit)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects remixes, sped up, slowed, cover, karaoke, 8D, or short clips (<90s),
 * unless the user explicitly searched for that specific variant keyword.
 */
export function isVariantOrRemixTrack(
  track: Pick<Track, 'title' | 'artist' | 'duration'>,
  query = ''
): boolean {
  const qLower = query.toLowerCase();
  const titleLower = track.title.toLowerCase();

  for (const mod of VARIANT_MODIFIERS) {
    if (mod.pattern.test(titleLower) && !mod.pattern.test(qLower)) {
      return true;
    }
  }

  // Short clips (< 90s) are ranked below full-length originals unless query looks for short/snippet
  if (track.duration > 0 && track.duration < 90 && !/\b(?:short|snippet|clip|intro|interlude)\b/i.test(qLower)) {
    return true;
  }

  return false;
}

/**
 * Checks strong official-release signals (- Topic channel, VEVO, Official Audio/Video, verified channel)
 * paired with full-length duration (>= 90s).
 */
export function isOfficialTrackMatch(
  track: Pick<Track, 'title' | 'artist' | 'duration' | 'source' | 'artistVerified'>,
  query = ''
): boolean {
  if (isVariantOrRemixTrack(track, query)) return false;

  const isTopicOrVevo = /\s*-\s*topic$/i.test(track.artist) || /vevo$/i.test(track.artist);
  const hasOfficialTitle = OFFICIAL_TITLE_PATTERN.test(track.title);
  const fullLength = track.duration === 0 || track.duration >= 90;

  return fullLength && (isTopicOrVevo || hasOfficialTitle || Boolean(track.artistVerified));
}

export interface TrackSourceBadge {
  label: 'Official' | 'YT' | 'Audius' | 'Podcast' | 'Local';
  variant: 'official' | 'yt' | 'audius' | 'neutral';
}

export function getTrackSourceBadge(
  track: Pick<Track, 'title' | 'artist' | 'duration' | 'source' | 'artistVerified' | 'isPodcast'>
): TrackSourceBadge {
  if (track.source === 'local') {
    return { label: 'Local', variant: 'neutral' };
  }
  if (track.source === 'podcast' || track.isPodcast) {
    return { label: 'Podcast', variant: 'neutral' };
  }
  if (track.source === 'audius') {
    return { label: 'Audius', variant: 'audius' };
  }
  if (isOfficialTrackMatch(track)) {
    return { label: 'Official', variant: 'official' };
  }
  return { label: 'YT', variant: 'yt' };
}

export interface RankedTrackScore {
  tier: number;
  score: number;
  isVariant: boolean;
  isOfficial: boolean;
}

/**
 * Tiered scoring for search results:
 *  - Tier 4: Primary (Piped/Invidious) full-length (>= 90s) non-variant / official original tracks
 *  - Tier 3: Secondary (Audius/other) full-length (>= 90s) non-variant tracks
 *  - Tier 2: Primary (Piped/Invidious) remixes, sped up, slowed, covers, or short clips
 *  - Tier 1: Secondary (Audius/other) remixes, edits, covers, or short clips
 * All tracks are preserved — remixes stay below original matches.
 */
export function scoreSearchTrack(
  track: Track,
  query: string,
  originalIndex = 0
): RankedTrackScore {
  const cleanQuery = query.trim().toLowerCase();
  const isVariant = isVariantOrRemixTrack(track, cleanQuery);
  const isOfficial = isOfficialTrackMatch(track, cleanQuery);
  const isPrimarySource = track.source === 'piped' || track.source === 'podcast';

  let tier = 1;
  if (isPrimarySource && !isVariant) {
    tier = 4;
  } else if (!isPrimarySource && !isVariant) {
    tier = 3;
  } else if (isPrimarySource && isVariant) {
    tier = 2;
  } else {
    tier = 1;
  }

  let score = 0;

  if (isOfficial) {
    score += 120;
    if (/\s*-\s*topic$/i.test(track.artist)) score += 35;
    if (OFFICIAL_TITLE_PATTERN.test(track.title)) score += 30;
    if (/vevo$/i.test(track.artist)) score += 20;
    if (track.artistVerified) score += 20;
  }

  if (cleanQuery) {
    const coreTitle = stripStandardTitleExtras(track.title).toLowerCase();
    const artistLower = track.artist.replace(/\s*-\s*topic$/i, '').toLowerCase();
    const qTokens = tokenize(cleanQuery);
    const titleArtistText = `${coreTitle} ${artistLower}`;
    const taTokens = new Set(tokenize(titleArtistText));

    if (coreTitle === cleanQuery) {
      score += 110;
    } else if (coreTitle.startsWith(cleanQuery)) {
      score += 75;
    } else if (coreTitle.includes(cleanQuery)) {
      score += 50;
    }

    if (qTokens.length > 0) {
      const matchedCount = qTokens.filter((tok) => taTokens.has(tok)).length;
      score += (matchedCount / qTokens.length) * 60;
    }

    if (artistLower === cleanQuery || artistLower.includes(cleanQuery)) {
      score += 45;
    }
  }

  // Reward typical full-length song duration (90s – 8m)
  if (track.duration >= 90 && track.duration <= 480) {
    score += 20;
  }

  // Preserve primary engine relevance order gently within equal tiers
  score += Math.max(0, 24 - originalIndex * 1.5);

  return { tier, score, isVariant, isOfficial };
}

/**
 * Sorts tracks placing official & original full-length songs at the very top while
 * keeping remixes, sped up, slowed, cover, and short clips lower down in results.
 */
export function rankSearchResults(tracks: Track[], query: string): Track[] {
  if (tracks.length <= 1) return tracks;

  return tracks
    .map((track, idx) => ({
      track,
      idx,
      meta: scoreSearchTrack(track, query, idx),
    }))
    .sort((a, b) => {
      if (b.meta.tier !== a.meta.tier) return b.meta.tier - a.meta.tier;
      if (Math.abs(b.meta.score - a.meta.score) > 0.001) return b.meta.score - a.meta.score;
      return a.idx - b.idx;
    })
    .map((entry) => entry.track);
}
