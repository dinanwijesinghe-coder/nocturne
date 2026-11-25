import type { Artist, Track } from '../types/audio';
import { COVER_MIDNIGHT_SYNTH } from '../data/seedCatalog';
import { maybeProxyStreamUrl } from './pipedApi';

const APP_NAME = 'NocturneAudio';
const AUDIUS_DISCOVERY_REGISTRY = 'https://api.audius.co';
const AUDIUS_BACKUP_HOST = 'https://discoveryprovider.audius.co';

let cachedDiscoveryHost: string | null = null;

/**
 * Resolves an active Audius discovery node from https://api.audius.co,
 * falling back to https://discoveryprovider.audius.co only if unavailable.
 */
export async function getAudiusDiscoveryHost(): Promise<string> {
  if (cachedDiscoveryHost) return cachedDiscoveryHost;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(AUDIUS_DISCOVERY_REGISTRY, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0 && typeof json.data[0] === 'string') {
        cachedDiscoveryHost = json.data[0];
        return cachedDiscoveryHost;
      }
    }
  } catch {
    // Fall back to direct discovery host
  }

  cachedDiscoveryHost = AUDIUS_BACKUP_HOST;
  return AUDIUS_BACKUP_HOST;
}

interface AudiusRawTrack {
  id: string;
  title: string;
  genre?: string;
  duration?: number;
  play_count?: number;
  is_streamable?: boolean;
  access?: {
    stream?: boolean;
    download?: boolean;
  };
  artwork?: {
    '150x150'?: string;
    '480x480'?: string;
    '1000x1000'?: string;
  };
  user?: {
    id: string;
    name: string;
    handle: string;
    follower_count?: number;
    is_verified?: boolean;
    bio?: string;
    profile_picture?: {
      '150x150'?: string;
      '480x480'?: string;
    };
  };
}

function isAudiusTrackStreamable(raw: AudiusRawTrack): boolean {
  if (!raw?.id) return false;
  if (raw.is_streamable === false) return false;
  if (raw.access && raw.access.stream === false) return false;
  return true;
}

export function resolveAudiusPlayableUrl(streamUrl: string): string {
  if (!streamUrl) return '';
  return maybeProxyStreamUrl(streamUrl);
}

function mapAudiusTrack(raw: AudiusRawTrack, host: string): Track {
  const fullArt =
    raw.artwork?.['480x480'] ||
    raw.artwork?.['1000x1000'] ||
    raw.artwork?.['150x150'] ||
    COVER_MIDNIGHT_SYNTH;
  const thumbArt = raw.artwork?.['150x150'] || fullArt;
  const durationSec = Number(raw.duration) > 0 ? Math.round(Number(raw.duration)) : 180;
  return {
    id: `audius-${raw.id}`,
    title: raw.title || 'Untitled Track',
    artist: raw.user?.name || 'Independent Artist',
    artistId: raw.user?.id ? `audius-user-${raw.user.id}` : 'audius-unknown',
    genre: raw.genre || 'Electronic',
    duration: durationSec,
    artworkUrl: fullArt,
    artworkThumbUrl: thumbArt,
    streamUrl: `${host}/v1/tracks/${encodeURIComponent(raw.id)}/stream?app_name=${APP_NAME}`,
    source: 'audius',
    streamMeta: {
      codec: 'MP3',
      bitrateKbps: 320,
      lossless: false,
      sourceLabel: 'Audius',
      durationSeconds: Number(raw.duration) > 0 ? Number(raw.duration) : undefined,
      isPreview: Boolean(raw.duration && raw.duration <= 35),
    },
    playCount: raw.play_count || 0,
  };
}

interface AudiusRawUser {
  id: string;
  name: string;
  handle: string;
  follower_count?: number;
  is_verified?: boolean;
  bio?: string;
  profile_picture?: {
    '150x150'?: string;
    '480x480'?: string;
  };
}

function mapAudiusArtist(raw: AudiusRawUser): Artist {
  return {
    id: `audius-user-${raw.id}`,
    name: raw.name || 'Independent Artist',
    handle: `@${raw.handle || 'audius'}`,
    avatarUrl:
      raw.profile_picture?.['480x480'] ||
      raw.profile_picture?.['150x150'] ||
      COVER_MIDNIGHT_SYNTH,
    bio: raw.bio || 'Streaming live on Audius.',
    followersCount: raw.follower_count || 0,
    verified: Boolean(raw.is_verified),
  };
}

export async function fetchTrendingAudiusTracks(
  genre?: string,
  limit = 10
): Promise<{
  tracks: Track[];
  artists: Artist[];
  fromNetwork: boolean;
}> {
  try {
    const host = await getAudiusDiscoveryHost();
    const params = new URLSearchParams({
      app_name: APP_NAME,
      limit: String(limit),
    });
    if (genre && genre !== 'All') {
      params.set('genre', genre);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${host}/v1/tracks/trending?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Audius HTTP ${res.status}`);
    const payload = await res.json();
    const rawList: AudiusRawTrack[] = Array.isArray(payload?.data)
      ? (payload.data as AudiusRawTrack[]).filter(isAudiusTrackStreamable)
      : [];

    const tracks = rawList.map((item) => mapAudiusTrack(item, host));
    const artistMap = new Map<string, Artist>();

    for (const raw of rawList) {
      if (raw.user?.id && !artistMap.has(raw.user.id)) {
        artistMap.set(raw.user.id, {
          id: `audius-user-${raw.user.id}`,
          name: raw.user.name,
          handle: `@${raw.user.handle}`,
          avatarUrl:
            raw.user.profile_picture?.['480x480'] ||
            raw.user.profile_picture?.['150x150'] ||
            COVER_MIDNIGHT_SYNTH,
          bio: raw.user.bio || 'Streaming live on Audius.',
          followersCount: raw.user.follower_count || 0,
          verified: Boolean(raw.user.is_verified),
        });
      }
    }

    return {
      tracks,
      artists: Array.from(artistMap.values()).slice(0, 8),
      fromNetwork: true,
    };
  } catch (err) {
    console.error('[Audius Trending] Failed to fetch trending tracks:', err);
    return { tracks: [], artists: [], fromNetwork: false };
  }
}

export async function searchAudiusTracks(
  query: string,
  externalSignal?: AbortSignal
): Promise<{
  tracks: Track[];
  fromNetwork: boolean;
}> {
  const clean = query.trim();
  if (!clean) return { tracks: [], fromNetwork: false };

  try {
    const host = await getAudiusDiscoveryHost();
    const params = new URLSearchParams({
      query: clean,
      app_name: APP_NAME,
      limit: '12',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const res = await fetch(`${host}/v1/tracks/search?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    if (!res.ok) throw new Error(`Audius search HTTP ${res.status}`);
    const payload = await res.json();
    const rawList: AudiusRawTrack[] = Array.isArray(payload?.data)
      ? (payload.data as AudiusRawTrack[]).filter(isAudiusTrackStreamable)
      : [];

    return {
      tracks: rawList.map((item) => mapAudiusTrack(item, host)),
      fromNetwork: true,
    };
  } catch (err) {
    if (!externalSignal?.aborted) {
      console.error(`[Audius Search] Query "${clean}" failed:`, err);
    }
    return { tracks: [], fromNetwork: false };
  }
}

export async function fetchPredictiveAudiusSuggestions(
  query: string,
  externalSignal?: AbortSignal
): Promise<{
  artists: Artist[];
  tracks: Track[];
  fromNetwork: boolean;
}> {
  const clean = query.trim();
  if (!clean) {
    return { artists: [], tracks: [], fromNetwork: false };
  }

  try {
    const host = await getAudiusDiscoveryHost();
    const userParams = new URLSearchParams({
      query: clean,
      app_name: APP_NAME,
      limit: '4',
    });
    const trackParams = new URLSearchParams({
      query: clean,
      app_name: APP_NAME,
      limit: '5',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const [usersRes, tracksRes] = await Promise.all([
      fetch(`${host}/v1/users/search?${userParams.toString()}`, { signal: controller.signal }),
      fetch(`${host}/v1/tracks/search?${trackParams.toString()}`, { signal: controller.signal }),
    ]);

    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    const rawUsers: AudiusRawUser[] = usersRes.ok
      ? ((await usersRes.json())?.data as AudiusRawUser[]) || []
      : [];
    const rawTracks: AudiusRawTrack[] = tracksRes.ok
      ? (((await tracksRes.json())?.data as AudiusRawTrack[]) || []).filter(isAudiusTrackStreamable)
      : [];

    return {
      artists: Array.isArray(rawUsers) ? rawUsers.map(mapAudiusArtist) : [],
      tracks: Array.isArray(rawTracks) ? rawTracks.map((t) => mapAudiusTrack(t, host)) : [],
      fromNetwork: usersRes.ok || tracksRes.ok,
    };
  } catch {
    return { artists: [], tracks: [], fromNetwork: false };
  }
}
