import type { Artist, AudioQuality, StreamMetadata, Track } from '../types/audio';
import { COVER_MIDNIGHT_SYNTH } from '../data/seedCatalog';
import { detectCodecFromMimeOrUrl } from '../utils/streamQuality';
import {
  cleanTrackSearchQuery,
  isLikelyPreviewStream,
  scoreCandidateTrackMatch,
} from '../utils/streamMatching';
import { searchAudiusTracks } from './audiusApi';

export const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.orangenet.cc',
] as const;

export const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.perennialte.ch',
  'https://invidious.protokolla.fi',
  'https://invidious.private.coffee',
  'https://vid.puffyan.us',
  'https://inv.tux.pizza',
] as const;

const BROWSER_CORSSAFE_PIPED_HOSTS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
] as const;

let preferredPipedHost: string | null = PIPED_INSTANCES[0];
let preferredInvidiousHost: string | null = INVIDIOUS_INSTANCES[0];

interface PipedSearchItem {
  url?: string;
  type?: string;
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  uploaderUrl?: string;
  uploaderAvatar?: string | null;
  uploaderVerified?: boolean;
  duration?: number;
  views?: number;
  isShort?: boolean;
}

export interface PipedAudioStream {
  url?: string;
  format?: string;
  mimeType?: string;
  codec?: string;
  bitrate?: number;
  duration?: number;
  isPreview?: boolean;
  audioTrackLocale?: string | null;
}

export interface PipedVideoStream {
  url?: string;
  mimeType?: string;
  bitrate?: number;
  videoOnly?: boolean;
  quality?: string;
  duration?: number;
  isPreview?: boolean;
}

export interface PipedStreamsResponse {
  title?: string;
  duration?: number;
  audioStreams?: PipedAudioStream[];
  videoStreams?: PipedVideoStream[];
  hls?: string | null;
  sourceInstance?: string;
  isPreview?: boolean;
  error?: string;
  errors?: Array<{ instance: string; error: string }>;
}

export interface ResolvedStreamResult {
  url: string;
  meta: StreamMetadata;
}

interface CachedStreamEntry {
  result: ResolvedStreamResult;
  expiresAt: number;
}

const streamCache = new Map<string, CachedStreamEntry>();
const STREAM_CACHE_TTL_MS = 12 * 60_000;

export function buildProxyAudioUrl(rawUrl: string): string {
  return `/api/proxy-audio?url=${encodeURIComponent(rawUrl)}`;
}

export function maybeProxyStreamUrl(rawUrl: string): string {
  if (!rawUrl || !rawUrl.startsWith('http')) return rawUrl;
  if (typeof window === 'undefined' || !window.location?.origin?.startsWith('http')) {
    return rawUrl;
  }
  try {
    const parsed = new URL(rawUrl);
    // Piped's proxy endpoint already exposes full CORS headers; proxy raw CDN/Invidious/Audius URLs through /api/proxy-audio
    if (parsed.hostname === 'proxy.piped.private.coffee') {
      return rawUrl;
    }
    return buildProxyAudioUrl(rawUrl);
  } catch {
    return rawUrl;
  }
}

export function extractPipedVideoId(urlPath?: string): string | null {
  if (!urlPath) return null;
  const watchMatch = urlPath.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watchMatch?.[1]) return watchMatch[1];
  const bareMatch = urlPath.match(/^([A-Za-z0-9_-]{11})$/);
  if (bareMatch?.[1]) return bareMatch[1];
  return null;
}

function getTargetBitrateForMode(quality: AudioQuality, dataSaver = false): number {
  if (dataSaver) return 56_000; // ~48-64kbps for Data Saver
  switch (quality) {
    case 'low':
      return 64_000;
    case 'normal':
      return 128_000;
    case 'high':
    case 'lossless':
    default:
      return 320_000;
  }
}

function codecRank(codec: string): number {
  const upper = codec.toUpperCase();
  if (upper === 'OPUS') return 3;
  if (upper === 'AAC' || upper === 'M4A') return 2;
  if (upper === 'MP3' || upper === 'OGG') return 1;
  return 0;
}

function inferSourceLabel(url: string, fallbackSource: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('itunes.apple.com')) return 'Apple Audio';
  if (lower.includes('dzcdn.net')) return 'Deezer';
  if (lower.includes('saavncdn.com')) return 'Saavn';
  if (
    lower.includes('audius') ||
    lower.includes('monophonic.digital') ||
    lower.includes('figment.io') ||
    lower.includes('open-audio-validator')
  ) {
    return 'Audius';
  }
  return fallbackSource;
}

/**
 * Selects the optimal audio stream URL + real codec/bitrate metadata:
 * - Always avoids 30-second preview/sample URLs whenever any full-length stream is available.
 * - High / Lossless: sorts full-length audioStreams by bitrate descending (preferring Opus/AAC at top tier).
 * - Normal: picks closest to ~128kbps.
 * - Low / Data Saver: picks ~48–64kbps to conserve mobile data.
 */
export function selectBestPipedStream(
  payload: PipedStreamsResponse,
  quality: AudioQuality = 'high',
  dataSaver = false,
  expectedDurationSeconds?: number
): ResolvedStreamResult | null {
  const validAudio = (payload.audioStreams || []).filter(
    (s): s is PipedAudioStream & { url: string } =>
      typeof s.url === 'string' && /^https?:\/\//i.test(s.url)
  );

  const defaultSourceLabel = payload.sourceInstance?.includes('inv')
    ? 'Invidious'
    : payload.sourceInstance === 'audius'
      ? 'Audius'
      : payload.sourceInstance === 'saavn-full'
        ? 'Saavn'
        : 'Piped';

  if (validAudio.length > 0) {
    const normalized = validAudio.map((s) => {
      const bitrateBps = Number(s.bitrate) || 0;
      const codec = detectCodecFromMimeOrUrl(s.mimeType, s.codec || s.format, s.url);
      const streamDur =
        typeof s.duration === 'number' && s.duration > 0
          ? s.duration
          : typeof payload.duration === 'number' && payload.duration > 0
            ? payload.duration
            : undefined;
      const isPreview = isLikelyPreviewStream({
        url: s.url,
        streamDuration: streamDur,
        payloadDuration: payload.duration,
        expectedDuration: expectedDurationSeconds,
        isPreview: s.isPreview ?? payload.isPreview,
      });
      return {
        stream: s,
        bitrateBps,
        codec,
        durationSeconds: streamDur,
        isPreview,
      };
    });

    const fullLengthPool = normalized.filter((item) => !item.isPreview);
    const candidatePool = fullLengthPool.length > 0 ? fullLengthPool : normalized;

    if (!dataSaver && (quality === 'high' || quality === 'lossless')) {
      candidatePool.sort((a, b) => {
        const bitDiff = b.bitrateBps - a.bitrateBps;
        if (Math.abs(bitDiff) <= 12_000) {
          const rankDiff = codecRank(b.codec) - codecRank(a.codec);
          if (rankDiff !== 0) return rankDiff;
        }
        return bitDiff;
      });
    } else {
      const targetBps = getTargetBitrateForMode(quality, dataSaver);
      candidatePool.sort((a, b) => {
        const ba = a.bitrateBps || 128_000;
        const bb = b.bitrateBps || 128_000;
        const diffA = Math.abs(ba - targetBps);
        const diffB = Math.abs(bb - targetBps);
        if (Math.abs(diffA - diffB) <= 8_000) {
          return codecRank(b.codec) - codecRank(a.codec);
        }
        return diffA - diffB;
      });
    }

    const best = candidatePool[0];
    if (best) {
      return {
        url: best.stream.url,
        meta: {
          codec: best.codec,
          bitrateKbps: best.bitrateBps > 0 ? Math.round(best.bitrateBps / 1000) : undefined,
          lossless: false,
          sourceLabel: inferSourceLabel(best.stream.url, defaultSourceLabel),
          durationSeconds: best.durationSeconds,
          isPreview: best.isPreview,
        },
      };
    }
  }

  // Fallback 1: Progressive muxed streams (!videoOnly), still preferring full-length over previews
  const progressiveStreams = (payload.videoStreams || []).filter(
    (s): s is PipedVideoStream & { url: string } =>
      !s.videoOnly &&
      typeof s.url === 'string' &&
      /^https?:\/\//i.test(s.url)
  );
  if (progressiveStreams.length > 0) {
    const progAnnotated = progressiveStreams.map((s) => {
      const streamDur = s.duration || payload.duration;
      const isPreview = isLikelyPreviewStream({
        url: s.url,
        streamDuration: streamDur,
        payloadDuration: payload.duration,
        expectedDuration: expectedDurationSeconds,
        isPreview: s.isPreview ?? payload.isPreview,
      });
      return { stream: s, streamDur, isPreview };
    });
    const fullProg = progAnnotated.filter((p) => !p.isPreview);
    const progPool = fullProg.length > 0 ? fullProg : progAnnotated;
    progPool.sort((a, b) => {
      const ba = Number(a.stream.bitrate) || 0;
      const bb = Number(b.stream.bitrate) || 0;
      return dataSaver || quality === 'low' ? ba - bb : bb - ba;
    });
    const bestProg = progPool[0];
    return {
      url: bestProg.stream.url,
      meta: {
        codec: detectCodecFromMimeOrUrl(bestProg.stream.mimeType, bestProg.stream.quality, bestProg.stream.url),
        bitrateKbps: Number(bestProg.stream.bitrate) > 0 ? Math.round(Number(bestProg.stream.bitrate) / 1000) : 128,
        lossless: false,
        sourceLabel: inferSourceLabel(bestProg.stream.url, defaultSourceLabel),
        durationSeconds: bestProg.streamDur,
        isPreview: bestProg.isPreview,
      },
    };
  }

  // Fallback 2: HLS stream URL if returned
  if (typeof payload.hls === 'string' && /^https?:\/\//i.test(payload.hls)) {
    return {
      url: payload.hls,
      meta: {
        codec: 'HLS',
        lossless: false,
        sourceLabel: defaultSourceLabel,
        durationSeconds: payload.duration,
        isPreview: false,
      },
    };
  }

  return null;
}

export function selectBestPipedAudioUrl(
  payload: PipedStreamsResponse,
  quality: AudioQuality = 'high',
  dataSaver = false,
  expectedDurationSeconds?: number
): string | null {
  return selectBestPipedStream(payload, quality, dataSaver, expectedDurationSeconds)?.url ?? null;
}

export function mapPipedSearchItem(
  item: PipedSearchItem,
  options: { genre?: string; isPodcast?: boolean } = {}
): { track: Track; artist: Artist } | null {
  if (item.type && item.type !== 'stream') return null;
  if (item.isShort) return null;

  const videoId = extractPipedVideoId(item.url);
  if (!videoId || !item.title) return null;

  const artistName = item.uploaderName?.trim() || 'YouTube Music';
  const rawArtistSlug = artistName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'artist';
  const channelId = item.uploaderUrl?.replace('/channel/', '').trim() || rawArtistSlug;
  const artistId = `piped-artist-${channelId}`;
  const art = item.thumbnail || COVER_MIDNIGHT_SYNTH;

  const track: Track = {
    id: `piped-${videoId}`,
    videoId,
    title: item.title.trim(),
    artist: artistName,
    artistId,
    genre: options.isPodcast ? 'Podcast' : (options.genre || 'Music'),
    duration: Number(item.duration) > 0 ? Math.round(Number(item.duration)) : 200,
    artworkUrl: art,
    artworkThumbUrl: art,
    streamUrl: '',
    source: options.isPodcast ? 'podcast' : 'piped',
    artistVerified: Boolean(item.uploaderVerified),
    isPodcast: Boolean(options.isPodcast),
    showId: options.isPodcast ? artistId : undefined,
    showTitle: options.isPodcast ? artistName : undefined,
    playCount: typeof item.views === 'number' && item.views > 0 ? item.views : undefined,
  };

  const artist: Artist = {
    id: artistId,
    name: artistName,
    handle: `@${rawArtistSlug}`,
    avatarUrl: item.uploaderAvatar || art,
    bio: 'Streaming via Piped & Invidious Music API.',
    followersCount: 0,
    verified: Boolean(item.uploaderVerified),
  };

  return { track, artist };
}

function getOrderedInstances(list: readonly string[], preferred: string | null): string[] {
  if (!preferred || !list.includes(preferred)) return [...list];
  return [preferred, ...list.filter((host) => host !== preferred)];
}

interface InvidiousSearchItem {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  authorId?: string;
  authorUrl?: string;
  authorVerified?: boolean;
  lengthSeconds?: number;
  viewCount?: number;
  videoThumbnails?: Array<{ url?: string; width?: number }>;
}

export function mapInvidiousSearchItem(
  item: InvidiousSearchItem,
  options: { genre?: string; isPodcast?: boolean } = {}
): { track: Track; artist: Artist } | null {
  if (!item.videoId || !item.title) return null;
  const thumb =
    item.videoThumbnails?.find((t) => (t.width || 0) >= 320)?.url ||
    item.videoThumbnails?.[0]?.url ||
    `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;

  return mapPipedSearchItem(
    {
      url: `/watch?v=${item.videoId}`,
      type: 'stream',
      title: item.title,
      thumbnail: thumb,
      uploaderName: item.author || 'YouTube Music',
      uploaderUrl: item.authorUrl || (item.authorId ? `/channel/${item.authorId}` : undefined),
      uploaderVerified: Boolean(item.authorVerified),
      duration: Number(item.lengthSeconds) || 0,
      views: typeof item.viewCount === 'number' ? item.viewCount : undefined,
    },
    options
  );
}

interface InvidiousVideoPayload {
  error?: string;
  lengthSeconds?: number;
  adaptiveFormats?: Array<{
    url?: string;
    type?: string;
    encoding?: string;
    bitrate?: number | string;
    approxDurationMs?: number | string;
  }>;
  formatStreams?: Array<{
    url?: string;
    type?: string;
    bitrate?: number | string;
    qualityLabel?: string;
  }>;
  hlsUrl?: string;
}

function normalizeInvidiousStreamsPayload(
  host: string,
  json: InvidiousVideoPayload,
  hintDuration?: number
): PipedStreamsResponse {
  const payloadDuration = Number(json.lengthSeconds) > 0 ? Math.round(Number(json.lengthSeconds)) : undefined;
  const audioStreams: PipedAudioStream[] = (json.adaptiveFormats || [])
    .filter((f) => Boolean(f?.url && String(f.type || '').toLowerCase().startsWith('audio/')))
    .map((f) => {
      const streamDur = Number(f.approxDurationMs) > 0
        ? Math.round(Number(f.approxDurationMs) / 1000)
        : payloadDuration;
      return {
        url: String(f.url),
        mimeType: String(f.type || 'audio/mp4'),
        codec: typeof f.encoding === 'string' ? f.encoding : '',
        bitrate: Number(f.bitrate) || 0,
        duration: streamDur,
        isPreview: isLikelyPreviewStream({
          url: String(f.url),
          streamDuration: streamDur,
          payloadDuration,
          expectedDuration: hintDuration,
        }),
      };
    });

  const videoStreams: PipedVideoStream[] = (json.formatStreams || [])
    .filter((f) => Boolean(f?.url))
    .map((f) => ({
      url: String(f.url),
      mimeType: String(f.type || 'video/mp4'),
      bitrate: Number(f.bitrate) || 0,
      videoOnly: false,
      quality: f.qualityLabel,
      duration: payloadDuration,
      isPreview: isLikelyPreviewStream({
        url: String(f.url),
        payloadDuration,
        expectedDuration: hintDuration,
      }),
    }));

  const hls = typeof json.hlsUrl === 'string' && json.hlsUrl.startsWith('http') ? json.hlsUrl : null;
  return {
    duration: payloadDuration,
    audioStreams,
    videoStreams,
    hls,
    sourceInstance: host,
    isPreview: false,
  };
}

async function fetchPipedJson<T>(
  path: string,
  validate: (json: T) => boolean,
  externalSignal?: AbortSignal,
  timeoutMs = 3500,
  instanceErrors?: Array<{ instance: string; source: 'piped' | 'invidious'; error: string }>
): Promise<{ host: string; data: T }> {
  const hosts = getOrderedInstances(PIPED_INSTANCES, preferredPipedHost);
  let lastError: unknown = new Error('All client-side Piped instances failed');

  for (const host of hosts) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(`${host}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (!validate(json)) throw new Error('Invalid or empty Piped payload');
      preferredPipedHost = host;
      return { host, data: json };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      instanceErrors?.push({ instance: host, source: 'piped', error: message });
      lastError = err;
      if (externalSignal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError;
}

async function fetchClientInvidiousSearch(
  query: string,
  options: { genre?: string; isPodcast?: boolean; limit: number },
  externalSignal?: AbortSignal,
  timeoutMs = 3500,
  instanceErrors?: Array<{ instance: string; source: 'piped' | 'invidious'; error: string }>
): Promise<{ host: string; tracks: Track[]; artists: Artist[] }> {
  const hosts = getOrderedInstances(INVIDIOUS_INSTANCES, preferredInvidiousHost);
  let lastError: unknown = new Error('All client-side Invidious instances failed');
  const params = new URLSearchParams({ q: query, type: 'video' });

  for (const host of hosts) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(`${host}/api/v1/search?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as InvidiousSearchItem[];
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error('Empty Invidious search items');
      }

      const tracks: Track[] = [];
      const artistMap = new Map<string, Artist>();
      for (const item of raw) {
        const mapped = mapInvidiousSearchItem(item, options);
        if (!mapped) continue;
        tracks.push(mapped.track);
        if (!artistMap.has(mapped.artist.id)) {
          artistMap.set(mapped.artist.id, mapped.artist);
        }
        if (tracks.length >= options.limit) break;
      }

      if (tracks.length === 0) throw new Error('No playable video items returned');
      preferredInvidiousHost = host;
      return { host, tracks, artists: Array.from(artistMap.values()) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      instanceErrors?.push({ instance: host, source: 'invidious', error: message });
      lastError = err;
      if (externalSignal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError;
}

function mapItemsToTracksAndArtists(
  items: PipedSearchItem[],
  options: { genre?: string; isPodcast?: boolean; limit: number }
): { tracks: Track[]; artists: Artist[] } {
  const tracks: Track[] = [];
  const artistMap = new Map<string, Artist>();
  for (const item of items) {
    const mapped = mapPipedSearchItem(item, {
      genre: options.genre,
      isPodcast: options.isPodcast,
    });
    if (!mapped) continue;
    tracks.push(mapped.track);
    if (!artistMap.has(mapped.artist.id)) {
      artistMap.set(mapped.artist.id, mapped.artist);
    }
    if (tracks.length >= options.limit) break;
  }
  return { tracks, artists: Array.from(artistMap.values()) };
}

export async function searchPipedSongs(
  query: string,
  externalSignal?: AbortSignal,
  options: { filter?: 'music_songs' | 'videos'; genre?: string; isPodcast?: boolean; limit?: number } = {}
): Promise<{
  tracks: Track[];
  artists: Artist[];
  fromNetwork: boolean;
}> {
  const clean = query.trim();
  if (!clean) return { tracks: [], artists: [], fromNetwork: false };

  const filter = options.filter || 'music_songs';
  const limit = options.limit ?? 18;
  const instanceErrors: Array<{ instance: string; source: string; error: string }> = [];
  let youtubeFallbackResult: { tracks: Track[]; artists: Artist[] } | null = null;

  // 1. Try server-side /api/search (rotates Piped hosts -> Invidious -> YouTube search)
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const onExternalAbort = () => controller.abort();
      externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

      const params = new URLSearchParams({ q: clean, filter, limit: String(limit) });
      const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);

      if (res.ok) {
        const json = (await res.json()) as {
          items?: PipedSearchItem[];
          sourceHost?: string | null;
          sourceType?: string;
          errors?: Array<{ instance: string; source: string; error: string }>;
        };

        if (Array.isArray(json.errors) && json.errors.length > 0) {
          instanceErrors.push(...json.errors);
          console.warn(
            `[Nocturne Search] Server Piped/Invidious errors for "${clean}":`,
            json.errors
          );
        }

        if (Array.isArray(json?.items) && json.items.length > 0) {
          const mapped = mapItemsToTracksAndArtists(json.items, {
            genre: options.genre,
            isPodcast: options.isPodcast,
            limit,
          });
          if (mapped.tracks.length > 0) {
            if (json.sourceType === 'piped' || json.sourceType === 'invidious') {
              console.info(
                `[Nocturne Search] Server ${json.sourceType} instance succeeded (${json.sourceHost}): ${mapped.tracks.length} tracks`
              );
              return { ...mapped, fromNetwork: true };
            }
            // Server Piped & Invidious were blocked and fell back to YouTube; save as safety net and try browser-direct Piped/Invidious
            youtubeFallbackResult = mapped;
          }
        }
      } else {
        instanceErrors.push({
          instance: '/api/search',
          source: 'server',
          error: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      if (externalSignal?.aborted) return { tracks: [], artists: [], fromNetwork: false };
      instanceErrors.push({
        instance: '/api/search',
        source: 'server',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Client-side rotated Piped instances directly from the browser
  const clientErrors: Array<{ instance: string; source: 'piped' | 'invidious'; error: string }> = [];
  try {
    const params = new URLSearchParams({ q: clean, filter });
    const { host, data } = await fetchPipedJson<{ items?: PipedSearchItem[] }>(
      `/search?${params.toString()}`,
      (json) => Array.isArray(json?.items) && json.items.length > 0,
      externalSignal,
      3500,
      clientErrors
    );
    const mapped = mapItemsToTracksAndArtists(data.items || [], {
      genre: options.genre,
      isPodcast: options.isPodcast,
      limit,
    });
    if (mapped.tracks.length > 0) {
      console.info(
        `[Nocturne Search] Client-side Piped instance succeeded (${host}): ${mapped.tracks.length} tracks`
      );
      if (clientErrors.length > 0) {
        console.warn('[Nocturne Search] Failed client Piped attempts before winner:', clientErrors);
      }
      return { ...mapped, fromNetwork: true };
    }
  } catch (err) {
    if (externalSignal?.aborted) return { tracks: [], artists: [], fromNetwork: false };
    if (clientErrors.length === 0) {
      clientErrors.push({
        instance: 'piped-client',
        source: 'piped',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Client-side rotated Invidious instances directly from the browser
  try {
    const invRes = await fetchClientInvidiousSearch(
      clean,
      { genre: options.genre, isPodcast: options.isPodcast, limit },
      externalSignal,
      3500,
      clientErrors
    );
    console.info(
      `[Nocturne Search] Client-side Invidious instance succeeded (${invRes.host}): ${invRes.tracks.length} tracks`
    );
    if (clientErrors.length > 0) {
      console.warn('[Nocturne Search] Failed client instances before Invidious winner:', clientErrors);
    }
    return {
      tracks: invRes.tracks,
      artists: invRes.artists,
      fromNetwork: true,
    };
  } catch {
    if (externalSignal?.aborted) return { tracks: [], artists: [], fromNetwork: false };
  }

  // 4. If server YouTube InnerTube returned official matches while Piped/Invidious failed, keep them rather than dropping to remixes
  if (youtubeFallbackResult) {
    console.warn(
      `[Nocturne Search] Piped/Invidious failed on both server and client for "${clean}"; using server YouTube matches:`,
      { instanceErrors, clientErrors }
    );
    return { ...youtubeFallbackResult, fromNetwork: true };
  }

  console.error(
    `[Nocturne Search] All Piped & Invidious instances failed (server + client) for "${clean}". Falling back to Audius only:`,
    { instanceErrors, clientErrors }
  );
  return { tracks: [], artists: [], fromNetwork: false };
}

const HOME_CHART_QUERY_BY_GENRE: Record<string, string> = {
  All: 'Top Hits Pop Electronic Music Official Audio',
  Electronic: 'Electronic Dance House Music Official Audio',
  'Hip-Hop/Rap': 'Hip Hop Rap Hits Official Audio',
  Pop: 'Pop Hits Chart Music Official Audio',
  'R&B': 'R&B Soul Hits Official Audio',
  'Lo-Fi': 'Lo Fi Hip Hop Beats Chill Music',
};

export async function fetchPipedHomeSongs(
  genre = 'All',
  limit = 10
): Promise<{
  tracks: Track[];
  artists: Artist[];
  fromNetwork: boolean;
}> {
  const q = HOME_CHART_QUERY_BY_GENRE[genre] || `${genre} music hits`;
  return searchPipedSongs(q, undefined, {
    filter: 'music_songs',
    genre: genre === 'All' ? 'Pop / Hits' : genre,
    limit,
  });
}

async function probeClientPipedAndInvidiousStreams(
  videoId: string,
  quality: AudioQuality,
  dataSaver: boolean,
  hintDuration?: number
): Promise<{
  winner: { host: string; picked: ResolvedStreamResult } | null;
  errors: Array<{ instance: string; source: 'piped' | 'invidious'; error: string }>;
}> {
  const errors: Array<{ instance: string; source: 'piped' | 'invidious'; error: string }> = [];
  const pipedHosts = getOrderedInstances(BROWSER_CORSSAFE_PIPED_HOSTS, preferredPipedHost);
  const invHosts = getOrderedInstances(INVIDIOUS_INSTANCES, preferredInvidiousHost).slice(0, 4);

  const tasks: Array<Promise<{ host: string; picked: ResolvedStreamResult }>> = [
    ...pipedHosts.map(async (host) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2400);
      try {
        const res = await fetch(`${host}/streams/${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PipedStreamsResponse;
        if (!data || data.error) throw new Error(data?.error || 'Piped stream error');
        const picked = selectBestPipedStream({ ...data, sourceInstance: host }, quality, dataSaver, hintDuration);
        if (!picked || picked.meta.isPreview) {
          throw new Error('No full-length Piped stream available');
        }
        preferredPipedHost = host;
        return { host, picked };
      } catch (err) {
        errors.push({
          instance: host,
          source: 'piped',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }),
    ...invHosts.map(async (host) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2400);
      try {
        const res = await fetch(`${host}/api/v1/videos/${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as InvidiousVideoPayload;
        if (!raw || raw.error) throw new Error(raw?.error || 'Invidious video error');
        const normalized = normalizeInvidiousStreamsPayload(host, raw, hintDuration);
        const picked = selectBestPipedStream(normalized, quality, dataSaver, hintDuration);
        if (!picked || picked.meta.isPreview) {
          throw new Error('No full-length Invidious stream available');
        }
        preferredInvidiousHost = host;
        return { host, picked };
      } catch (err) {
        errors.push({
          instance: host,
          source: 'invidious',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }),
  ];

  try {
    const winner = await Promise.any(tasks);
    return { winner, errors };
  } catch {
    return { winner: null, errors };
  }
}

/**
 * Resolves the highest-matching full-length stream URL & real codec/bitrate metadata:
 * 1. Backend /api/streams/:videoId (rotated Piped + Invidious mirrors)
 * 2. Client-side browser fetch across rotated Piped + Invidious mirrors if server IP was blocked/rate-limited
 * 3. Full-length Saavn / Audius stream fallback before ever accepting a 30-second preview
 */
export async function resolvePipedStream(
  videoId: string,
  quality: AudioQuality = 'high',
  dataSaver = false,
  hint?: { title?: string; artist?: string; duration?: number }
): Promise<ResolvedStreamResult | null> {
  const modeKey = dataSaver ? 'saver' : quality;
  const cacheKey = `${videoId}:${modeKey}`;
  const cached = streamCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && !cached.result.meta.isPreview) {
    return cached.result;
  }

  const instanceErrors: Array<{ instance: string; source?: string; error: string }> = [];
  let backendResult: ResolvedStreamResult | null = null;
  let serverUsedPipedOrInvidious = false;

  // 1. Try server-side multi-instance Piped + Invidious + fallback stream resolver
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const qs = new URLSearchParams();
      if (hint?.title) qs.set('title', hint.title);
      if (hint?.artist) qs.set('artist', hint.artist);
      if (hint?.duration && hint.duration > 0) qs.set('duration', String(Math.round(hint.duration)));
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';

      const res = await fetch(`/api/streams/${encodeURIComponent(videoId)}${querySuffix}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      const payload = (await res.json().catch(() => null)) as
        | (PipedStreamsResponse & { unresolved?: boolean })
        | null;

      if (payload?.errors?.length) {
        instanceErrors.push(...payload.errors);
        console.warn(
          `[Nocturne Stream] Server Piped/Invidious errors for "${hint?.title || videoId}":`,
          payload.errors
        );
      }

      if (res.ok && payload) {
        const picked = selectBestPipedStream(payload, quality, dataSaver, hint?.duration);
        if (picked) {
          backendResult = {
            url: maybeProxyStreamUrl(picked.url),
            meta: picked.meta,
          };
          const srcInst = payload.sourceInstance || '';
          serverUsedPipedOrInvidious =
            Boolean(srcInst) &&
            srcInst !== 'audius' &&
            srcInst !== 'saavn-full' &&
            srcInst !== 'itunes+deezer-fallback';

          if (serverUsedPipedOrInvidious && !picked.meta.isPreview) {
            console.info(`[Nocturne Stream] Server mirror succeeded (${srcInst}) for "${hint?.title || videoId}"`);
            streamCache.set(cacheKey, {
              result: backendResult,
              expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
            });
            return backendResult;
          }
        }
      } else if (!res.ok) {
        instanceErrors.push({
          instance: '/api/streams',
          error: payload?.error || `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      instanceErrors.push({
        instance: '/api/streams',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. If server Piped/Invidious mirrors failed/blocked, try direct client-side Piped + Invidious from browser IP
  if (!serverUsedPipedOrInvidious) {
    const clientProbe = await probeClientPipedAndInvidiousStreams(
      videoId,
      quality,
      dataSaver,
      hint?.duration
    );

    if (clientProbe.errors.length > 0) {
      instanceErrors.push(...clientProbe.errors);
      console.warn(
        `[Nocturne Stream] Client-side Piped/Invidious mirror failures for "${hint?.title || videoId}":`,
        clientProbe.errors
      );
    }

    if (clientProbe.winner) {
      const result: ResolvedStreamResult = {
        url: maybeProxyStreamUrl(clientProbe.winner.picked.url),
        meta: clientProbe.winner.picked.meta,
      };
      console.info(
        `[Nocturne Stream] Client-side mirror succeeded (${clientProbe.winner.host}) for "${hint?.title || videoId}"`
      );
      streamCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
      });
      return result;
    }
  }

  // 3. Use full-length server fallback (Saavn / Audius) if available
  if (backendResult && !backendResult.meta.isPreview) {
    console.info(
      `[Nocturne Stream] Using full-length ${backendResult.meta.sourceLabel || 'fallback'} stream for "${hint?.title || videoId}"`
    );
    streamCache.set(cacheKey, {
      result: backendResult,
      expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
    });
    return backendResult;
  }

  // 4. Client-side full-length Audius search safety net if we still only have a 30s preview or null
  if (hint?.title) {
    try {
      const { cleanTitle, cleanArtist } = cleanTrackSearchQuery(hint.title, hint.artist || '');
      const audiusRes = await searchAudiusTracks(cleanTitle || hint.title);
      const bestAudius = audiusRes.tracks
        .map((t) => ({
          track: t,
          score: scoreCandidateTrackMatch({
            targetTitle: cleanTitle || hint.title || '',
            targetArtist: cleanArtist,
            targetDuration: hint.duration,
            candidateTitle: t.title,
            candidateArtist: t.artist,
            candidateDuration: t.duration,
          }),
        }))
        .filter((c) => Number.isFinite(c.score) && c.score >= 70 && c.track.duration >= 45)
        .sort((a, b) => b.score - a.score)[0];

      if (bestAudius?.track.streamUrl) {
        const result: ResolvedStreamResult = {
          url: maybeProxyStreamUrl(bestAudius.track.streamUrl),
          meta: {
            codec: 'MP3',
            bitrateKbps: 320,
            lossless: false,
            sourceLabel: 'Audius',
            durationSeconds: bestAudius.track.duration,
            isPreview: false,
          },
        };
        streamCache.set(cacheKey, {
          result,
          expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
        });
        return result;
      }
    } catch {
      // Fall through to last-resort backend preview or null
    }
  }

  if (backendResult) {
    console.warn(
      `[Nocturne Stream Resolver] Falling back to short preview for "${hint?.title || videoId}" because no full-length stream was available.`
    );
    return backendResult;
  }

  console.error(
    `[Nocturne Stream Resolver] Unable to resolve playable audio stream for videoId="${videoId}". Detailed API/instance errors:`,
    {
      videoId,
      title: hint?.title,
      artist: hint?.artist,
      quality,
      dataSaver,
      instanceErrors,
    }
  );

  return null;
}

export async function resolvePipedStreamUrl(
  videoId: string,
  quality: AudioQuality = 'high',
  dataSaver = false,
  hint?: { title?: string; artist?: string; duration?: number }
): Promise<string | null> {
  const res = await resolvePipedStream(videoId, quality, dataSaver, hint);
  return res?.url ?? null;
}
