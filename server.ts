import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import {
  cleanTrackSearchQuery,
  isLikelyPreviewStream,
  scoreCandidateTrackMatch,
} from './src/utils/streamMatching';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const PIPED_STREAM_HOSTS = [
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
];

const INVIDIOUS_STREAM_HOSTS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.perennialte.ch',
  'https://invidious.protokolla.fi',
  'https://invidious.private.coffee',
  'https://vid.puffyan.us',
  'https://inv.tux.pizza',
];

let preferredPipedSearchHost: string | null = PIPED_STREAM_HOSTS[0];

const ALLOWED_AUDIO_HOST_SUFFIXES = [
  'audius.co',
  'audius.org',
  'audius-nodes.com',
  'audiusindex.org',
  'figment.io',
  'monophonic.digital',
  'open-audio-validator.com',
  'theblueprint.xyz',
  'saavncdn.com',
  'r2.cloudflarestorage.com',
  'googlevideo.com',
  'private.coffee',
  'kavin.rocks',
  'tokhmi.xyz',
  'adminforge.de',
  'moomoo.me',
  'leptons.xyz',
  'ducks.party',
  'reallyaweso.me',
  'orangenet.cc',
  'nadeko.net',
  'nerdvpn.de',
  'yewtu.be',
  'perennialte.ch',
  'protokolla.fi',
  'puffyan.us',
  'tux.pizza',
  'cloudfront.net',
  'itunes.apple.com',
  'dzcdn.net',
];

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

function isAllowedAudioHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    net.isIP(host) !== 0
  ) {
    return false;
  }
  return ALLOWED_AUDIO_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

async function assertSafeAudioUrl(rawUrl: string, requireAllowlistedHost: boolean): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid audio URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    net.isIP(host) !== 0
  ) {
    throw new Error(`Blocked local or IP-literal host: ${parsed.hostname}`);
  }

  if (requireAllowlistedHost && !isAllowedAudioHost(host)) {
    throw new Error(`Host not allowed for audio proxy: ${parsed.hostname}`);
  }

  const resolved = await dns.lookup(parsed.hostname, { all: true });
  if (!resolved.length || resolved.some((entry) => isPrivateOrReservedIp(entry.address))) {
    throw new Error(`Blocked private or unresolvable host: ${parsed.hostname}`);
  }

  return parsed;
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  method: 'GET' | 'HEAD' = 'GET',
  maxRedirects = 5
): Promise<globalThis.Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const safeUrl = await assertSafeAudioUrl(currentUrl, hop === 0);
    const upstream = await fetch(safeUrl.toString(), {
      method,
      headers,
      redirect: 'manual',
      signal,
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get('location');
      if (!loc) return upstream;
      currentUrl = new URL(loc, safeUrl).toString();
      continue;
    }

    return upstream;
  }

  throw new Error('Too many redirects while resolving audio stream');
}

interface NormalizedProxyStream {
  url: string;
  mimeType: string;
  codec: string;
  bitrate: number;
  format?: string;
  duration?: number;
  isPreview?: boolean;
}

interface ProbeHostResult {
  host: string;
  duration?: number;
  audioStreams: NormalizedProxyStream[];
  videoStreams: Array<{
    url: string;
    mimeType: string;
    bitrate: number;
    videoOnly: boolean;
    quality?: string;
    duration?: number;
    isPreview?: boolean;
  }>;
  hls: string | null;
}

async function probePipedHost(
  host: string,
  videoId: string,
  hintDuration?: number
): Promise<ProbeHostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${host}/streams/${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`HTTP ${res.status} (non-JSON response)`);
    }
    if (!res.ok || json?.error) {
      const msg = typeof json?.error === 'string' ? json.error.split('\n')[0] : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const payloadDuration = Number(json.duration) > 0 ? Math.round(Number(json.duration)) : undefined;
    const audioStreamsRaw = Array.isArray(json.audioStreams) ? json.audioStreams : [];
    const audioStreams: NormalizedProxyStream[] = audioStreamsRaw
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof (s as Record<string, unknown>).url === 'string'))
      .map((s) => {
        const url = String(s.url);
        const streamDur = Number(s.approxDurationMs) > 0
          ? Math.round(Number(s.approxDurationMs) / 1000)
          : payloadDuration;
        return {
          url,
          mimeType: typeof s.mimeType === 'string' ? s.mimeType : 'audio/mp4',
          codec: typeof s.codec === 'string' ? s.codec : (typeof s.format === 'string' ? s.format : ''),
          bitrate: Number(s.bitrate) || 0,
          format: typeof s.format === 'string' ? s.format : undefined,
          duration: streamDur,
          isPreview: isLikelyPreviewStream({
            url,
            streamDuration: streamDur,
            payloadDuration,
            expectedDuration: hintDuration,
          }),
        };
      });

    const videoStreamsRaw = Array.isArray(json.videoStreams) ? json.videoStreams : [];
    const videoStreams = videoStreamsRaw
      .filter(
        (s): s is Record<string, unknown> =>
          Boolean(s && typeof (s as Record<string, unknown>).url === 'string' && !s.videoOnly)
      )
      .map((s) => {
        const url = String(s.url);
        return {
          url,
          mimeType: typeof s.mimeType === 'string' ? s.mimeType : 'video/mp4',
          bitrate: Number(s.bitrate) || 0,
          videoOnly: false,
          quality: typeof s.quality === 'string' ? s.quality : undefined,
          duration: payloadDuration,
          isPreview: isLikelyPreviewStream({
            url,
            payloadDuration,
            expectedDuration: hintDuration,
          }),
        };
      });

    const hls = typeof json.hls === 'string' && json.hls.startsWith('http') ? json.hls : null;
    if (audioStreams.length === 0 && videoStreams.length === 0 && !hls) {
      throw new Error('Returned 0 playable audio, progressive, or HLS streams');
    }

    const hasFullStream =
      audioStreams.some((s) => !s.isPreview) ||
      videoStreams.some((s) => !s.isPreview) ||
      Boolean(hls);
    if (!hasFullStream && hintDuration && hintDuration > 45) {
      throw new Error('Only returned short preview stream');
    }

    return { host, duration: payloadDuration, audioStreams, videoStreams, hls };
  } finally {
    clearTimeout(timer);
  }
}

async function probeInvidiousHost(
  host: string,
  videoId: string,
  hintDuration?: number
): Promise<ProbeHostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${host}/api/v1/videos/${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`HTTP ${res.status} (non-JSON response)`);
    }
    if (!res.ok || json?.error) {
      const msg = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const payloadDuration = Number(json.lengthSeconds) > 0 ? Math.round(Number(json.lengthSeconds)) : undefined;
    const adaptive = Array.isArray(json.adaptiveFormats) ? json.adaptiveFormats : [];
    const audioStreams: NormalizedProxyStream[] = adaptive
      .filter((f): f is Record<string, unknown> => {
        if (!f || typeof (f as Record<string, unknown>).url !== 'string') return false;
        const mime = String((f as Record<string, unknown>).type || '').toLowerCase();
        return mime.startsWith('audio/');
      })
      .map((f) => {
        const url = String(f.url);
        const streamDur = Number(f.approxDurationMs) > 0
          ? Math.round(Number(f.approxDurationMs) / 1000)
          : payloadDuration;
        return {
          url,
          mimeType: String(f.type || 'audio/mp4'),
          codec: typeof f.encoding === 'string' ? f.encoding : '',
          bitrate: Number(f.bitrate) || 0,
          duration: streamDur,
          isPreview: isLikelyPreviewStream({
            url,
            streamDuration: streamDur,
            payloadDuration,
            expectedDuration: hintDuration,
          }),
        };
      });

    const formats = Array.isArray(json.formatStreams) ? json.formatStreams : [];
    const videoStreams = formats
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof (f as Record<string, unknown>).url === 'string'))
      .map((f) => {
        const url = String(f.url);
        return {
          url,
          mimeType: String(f.type || 'video/mp4'),
          bitrate: Number(f.bitrate) || 0,
          videoOnly: false,
          quality: typeof f.qualityLabel === 'string' ? f.qualityLabel : undefined,
          duration: payloadDuration,
          isPreview: isLikelyPreviewStream({
            url,
            payloadDuration,
            expectedDuration: hintDuration,
          }),
        };
      });

    const hls = typeof json.hlsUrl === 'string' && json.hlsUrl.startsWith('http') ? json.hlsUrl : null;
    if (audioStreams.length === 0 && videoStreams.length === 0 && !hls) {
      throw new Error('Returned 0 playable adaptive or progressive streams');
    }

    const hasFullStream =
      audioStreams.some((s) => !s.isPreview) ||
      videoStreams.some((s) => !s.isPreview) ||
      Boolean(hls);
    if (!hasFullStream && hintDuration && hintDuration > 45) {
      throw new Error('Only returned short preview stream');
    }

    return { host, duration: payloadDuration, audioStreams, videoStreams, hls };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyAudioStreamReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetchWithSafeRedirects(
      url,
      { Range: 'bytes=0-63', Accept: 'audio/*, */*;q=0.5' },
      controller.signal,
      'GET',
      4
    );
    await res.body?.cancel().catch(() => {});
    if (res.status !== 200 && res.status !== 206) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return ct.startsWith('audio/') || ct.includes('octet-stream') || ct.includes('mp4');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAudiusFullStreams(
  cleanTitle: string,
  cleanArtist: string,
  hintDuration?: number
): Promise<{ audioStreams: NormalizedProxyStream[]; duration: number; score: number } | null> {
  const queries = [
    [cleanTitle, cleanArtist].filter(Boolean).join(' ').trim(),
    cleanTitle,
  ].filter((q, idx, arr) => Boolean(q) && arr.indexOf(q) === idx);

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        query: q,
        app_name: 'NocturneAudio',
        limit: '8',
      });
      const res = await fetch(`https://api.audius.co/v1/tracks/search?${params.toString()}`, {
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: Array<{
          id?: string;
          title?: string;
          duration?: number;
          is_streamable?: boolean;
          access?: { stream?: boolean };
          user?: { name?: string };
        }>;
      };

      const candidates = (json.data || [])
        .filter((t) => Boolean(t.id && t.title && t.is_streamable !== false && t.access?.stream !== false))
        .map((t) => ({
          track: t,
          score: scoreCandidateTrackMatch({
            targetTitle: cleanTitle,
            targetArtist: cleanArtist,
            targetDuration: hintDuration,
            candidateTitle: t.title || '',
            candidateArtist: t.user?.name || '',
            candidateDuration: Number(t.duration) || 0,
          }),
        }))
        .filter((c) => Number.isFinite(c.score) && c.score >= 70)
        .sort((a, b) => b.score - a.score);

      for (const c of candidates.slice(0, 3)) {
        const streamUrl = `https://api.audius.co/v1/tracks/${encodeURIComponent(c.track.id!)}/stream?app_name=NocturneAudio`;
        if (await verifyAudioStreamReachable(streamUrl)) {
          const dur = Math.round(Number(c.track.duration) || 180);
          return {
            duration: dur,
            score: c.score,
            audioStreams: [
              {
                url: streamUrl,
                mimeType: 'audio/mpeg',
                codec: 'MP3',
                bitrate: 320_000,
                format: 'MP3',
                duration: dur,
                isPreview: false,
              },
            ],
          };
        }
      }
    } catch {
      // Try next Audius query variation
    }
  }
  return null;
}

async function resolveSaavnFullStreams(
  cleanTitle: string,
  cleanArtist: string,
  hintDuration?: number
): Promise<{ audioStreams: NormalizedProxyStream[]; duration: number; score: number } | null> {
  const queries = [
    [cleanTitle, cleanArtist].filter(Boolean).join(' ').trim(),
    cleanTitle,
  ].filter((q, idx, arr) => Boolean(q) && arr.indexOf(q) === idx);

  for (const q of queries) {
    try {
      const params = new URLSearchParams({ query: q, limit: '8' });
      const res = await fetch(`https://saavn.sumit.co/api/search/songs?${params.toString()}`, {
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: {
          results?: Array<{
            name?: string;
            duration?: number;
            artists?: { primary?: Array<{ name?: string }> };
            downloadUrl?: Array<{ quality?: string; url?: string }>;
          }>;
        };
      };

      const candidates = (json.data?.results || [])
        .filter((s) => Boolean(s.name && Array.isArray(s.downloadUrl) && s.downloadUrl.length > 0))
        .map((s) => {
          const artistNames = (s.artists?.primary || []).map((a) => a.name).filter(Boolean).join(', ');
          return {
            song: s,
            score: scoreCandidateTrackMatch({
              targetTitle: cleanTitle,
              targetArtist: cleanArtist,
              targetDuration: hintDuration,
              candidateTitle: s.name || '',
              candidateArtist: artistNames,
              candidateDuration: Number(s.duration) || 0,
            }),
          };
        })
        .filter((c) => Number.isFinite(c.score) && c.score >= 70)
        .sort((a, b) => b.score - a.score);

      const best = candidates[0];
      if (!best) continue;

      const dur = Math.round(Number(best.song.duration) || 180);
      const mappedStreams: NormalizedProxyStream[] = (best.song.downloadUrl || [])
        .filter((d): d is { quality?: string; url: string } => Boolean(d.url && d.url.startsWith('http')))
        .map((d) => {
          const kbps = parseInt(String(d.quality || ''), 10) || 160;
          return {
            url: d.url,
            mimeType: 'audio/mp4',
            codec: 'AAC',
            bitrate: kbps * 1000,
            format: 'M4A',
            duration: dur,
            isPreview: false,
          };
        });

      if (mappedStreams.length > 0) {
        return {
          duration: dur,
          score: best.score,
          audioStreams: mappedStreams,
        };
      }
    } catch {
      // Try next query variation
    }
  }
  return null;
}

async function resolveFallbackMusicStreams(
  videoId: string,
  hintTitle?: string,
  hintArtist?: string,
  hintDuration?: number
): Promise<{
  audioStreams: NormalizedProxyStream[];
  duration?: number;
  sourceInstance: string;
  isPreview: boolean;
} | null> {
  let title = (hintTitle || '').trim().slice(0, 120);
  let artist = (hintArtist || '').trim().slice(0, 80);

  if (!title) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const oeRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(3500) });
      if (oeRes.ok) {
        const oe = (await oeRes.json()) as { title?: string; author_name?: string };
        title = (oe.title || '').trim().slice(0, 120);
        artist = (oe.author_name || '').trim().slice(0, 80);
      }
    } catch {
      // Continue with empty oEmbed
    }
  }

  const { query, cleanTitle, cleanArtist } = cleanTrackSearchQuery(title, artist);
  if (!cleanTitle && !query) return null;

  // 1. Prioritize FULL-LENGTH (>= 45s) streams from Audius & Saavn before touching 30s previews
  const [audiusFull, saavnFull] = await Promise.allSettled([
    resolveAudiusFullStreams(cleanTitle || query, cleanArtist, hintDuration),
    resolveSaavnFullStreams(cleanTitle || query, cleanArtist, hintDuration),
  ]);

  const audiusWinner = audiusFull.status === 'fulfilled' ? audiusFull.value : null;
  const saavnWinner = saavnFull.status === 'fulfilled' ? saavnFull.value : null;

  if (audiusWinner || saavnWinner) {
    if (audiusWinner && (!saavnWinner || audiusWinner.score >= saavnWinner.score)) {
      return {
        audioStreams: audiusWinner.audioStreams,
        duration: audiusWinner.duration,
        sourceInstance: 'audius',
        isPreview: false,
      };
    }
    if (saavnWinner) {
      return {
        audioStreams: saavnWinner.audioStreams,
        duration: saavnWinner.duration,
        sourceInstance: 'saavn-full',
        isPreview: false,
      };
    }
  }

  // 2. Absolute last resort: 30s preview clips (explicitly flagged isPreview: true, duration: 30)
  const audioStreams: NormalizedProxyStream[] = [];
  const [itunesRes, deezerRes] = await Promise.allSettled([
    (async () => {
      const params = new URLSearchParams({ term: query, media: 'music', limit: '3' });
      const r = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return [];
      const j = (await r.json()) as {
        results?: Array<{ previewUrl?: string; trackName?: string; artistName?: string }>;
      };
      const match = j.results?.find((item) => typeof item.previewUrl === 'string' && item.previewUrl.startsWith('http'));
      if (!match?.previewUrl) return [];
      return [
        {
          url: match.previewUrl,
          mimeType: 'audio/mp4',
          codec: 'AAC',
          bitrate: 256_000,
          format: 'M4A',
          duration: 30,
          isPreview: true,
        } satisfies NormalizedProxyStream,
      ];
    })(),
    (async () => {
      const params = new URLSearchParams({ q: query, limit: '3' });
      const r = await fetch(`https://api.deezer.com/search?${params.toString()}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return [];
      const j = (await r.json()) as {
        data?: Array<{ preview?: string }>;
      };
      const match = j.data?.find((item) => typeof item.preview === 'string' && item.preview.startsWith('http'));
      if (!match?.preview) return [];
      return [
        {
          url: match.preview,
          mimeType: 'audio/mpeg',
          codec: 'MP3',
          bitrate: 128_000,
          format: 'MP3',
          duration: 30,
          isPreview: true,
        } satisfies NormalizedProxyStream,
      ];
    })(),
  ]);

  if (itunesRes.status === 'fulfilled') audioStreams.push(...itunesRes.value);
  if (deezerRes.status === 'fulfilled') audioStreams.push(...deezerRes.value);

  if (audioStreams.length === 0) return null;
  return {
    audioStreams,
    duration: 30,
    sourceInstance: 'itunes+deezer-fallback',
    isPreview: true,
  };
}

function inferAudioContentType(upstreamType: string | null, rawUrl: string): string {
  const ct = (upstreamType || '').trim();
  const lower = ct.toLowerCase();

  if (lower.startsWith('audio/x-m4p') || lower.startsWith('audio/x-m4a')) {
    return 'audio/mp4';
  }
  if (lower && !lower.startsWith('application/octet-stream') && !lower.startsWith('binary/octet-stream')) {
    return ct;
  }

  const cleanPath = rawUrl.split('?')[0].toLowerCase();
  if (cleanPath.endsWith('.m4a') || cleanPath.endsWith('.mp4')) return 'audio/mp4';
  if (cleanPath.endsWith('.webm')) return 'audio/webm';
  if (cleanPath.endsWith('.ogg') || cleanPath.endsWith('.opus')) return 'audio/ogg';
  if (cleanPath.endsWith('.flac')) return 'audio/flac';
  if (cleanPath.endsWith('.wav')) return 'audio/wav';
  return 'audio/mpeg';
}

interface NormalizedSearchItem {
  url: string;
  type: 'stream';
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl?: string;
  uploaderAvatar?: string | null;
  uploaderVerified?: boolean;
  duration: number;
  views?: number;
  isShort?: boolean;
}

function parseLengthTextToSeconds(text?: string): number {
  if (!text) return 0;
  const parts = text
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

async function searchPipedHost(
  host: string,
  query: string,
  filter: string
): Promise<{ host: string; items: NormalizedSearchItem[] }> {
  const params = new URLSearchParams({ q: query, filter });
  const res = await fetch(`${host}/search?${params.toString()}`, {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { items?: NormalizedSearchItem[] };
  if (!Array.isArray(json?.items) || json.items.length === 0) {
    throw new Error('Empty Piped search items');
  }
  return { host, items: json.items };
}

async function searchInvidiousHost(
  host: string,
  query: string
): Promise<{ host: string; items: NormalizedSearchItem[] }> {
  const params = new URLSearchParams({ q: query, type: 'video' });
  const res = await fetch(`${host}/api/v1/search?${params.toString()}`, {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as Array<{
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
  }>;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Empty Invidious search items');
  }
  const items: NormalizedSearchItem[] = raw
    .filter((v) => Boolean(v.videoId && v.title))
    .map((v) => {
      const thumb =
        v.videoThumbnails?.find((t) => (t.width || 0) >= 320)?.url ||
        v.videoThumbnails?.[0]?.url ||
        `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      return {
        url: `/watch?v=${v.videoId}`,
        type: 'stream',
        title: String(v.title),
        thumbnail: thumb,
        uploaderName: v.author || 'YouTube Music',
        uploaderUrl: v.authorUrl || (v.authorId ? `/channel/${v.authorId}` : undefined),
        uploaderVerified: Boolean(v.authorVerified),
        duration: Number(v.lengthSeconds) > 0 ? Math.round(Number(v.lengthSeconds)) : 0,
        views: typeof v.viewCount === 'number' ? v.viewCount : undefined,
      };
    });
  if (items.length === 0) throw new Error('No normalized Invidious video items');
  return { host, items };
}

async function searchYouTubeInnerTube(
  query: string
): Promise<{ host: string; items: NormalizedSearchItem[] } | null> {
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20241118.01.00', hl: 'en', gl: 'US' },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      contents?: {
        twoColumnSearchResultsRenderer?: {
          primaryContents?: {
            sectionListRenderer?: {
              contents?: Array<{
                itemSectionRenderer?: {
                  contents?: Array<{
                    videoRenderer?: {
                      videoId?: string;
                      title?: { runs?: Array<{ text?: string }> };
                      ownerText?: {
                        runs?: Array<{
                          text?: string;
                          navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
                        }>;
                      };
                      ownerBadges?: Array<{ metadataBadgeRenderer?: { style?: string } }>;
                      lengthText?: { simpleText?: string };
                      thumbnail?: { thumbnails?: Array<{ url?: string }> };
                    };
                  }>;
                };
              }>;
            };
          };
        };
      };
    };
    const sections = j.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const items: NormalizedSearchItem[] = [];
    for (const sec of sections) {
      for (const content of sec.itemSectionRenderer?.contents || []) {
        const v = content.videoRenderer;
        if (!v?.videoId) continue;
        const title = v.title?.runs?.[0]?.text?.trim();
        if (!title) continue;
        const author = v.ownerText?.runs?.[0]?.text?.trim() || 'YouTube Music';
        const browseId = v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
        const verified = Boolean(
          v.ownerBadges?.some((b) =>
            String(b.metadataBadgeRenderer?.style || '').includes('VERIFIED') ||
            String(b.metadataBadgeRenderer?.style || '').includes('OFFICIAL_ARTIST')
          )
        );
        const duration = parseLengthTextToSeconds(v.lengthText?.simpleText);
        const thumb =
          v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
          `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        items.push({
          url: `/watch?v=${v.videoId}`,
          type: 'stream',
          title,
          thumbnail: thumb,
          uploaderName: author,
          uploaderUrl: browseId ? `/channel/${browseId}` : undefined,
          uploaderVerified: verified,
          duration,
        });
      }
    }
    return items.length > 0 ? { host: 'youtube-innertube', items } : null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // SSRF-safe audio stream proxy with full HTTP Range, Content-Range, Accept-Ranges, and HEAD support
  app.all('/api/proxy-audio', async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing required query parameter: url' });
      return;
    }

    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 20000);
    let activeNodeStream: Readable | null = null;

    res.on('close', () => {
      if (!res.writableFinished) {
        controller.abort();
        activeNodeStream?.destroy();
      }
    });

    try {
      const upstreamHeaders: Record<string, string> = {
        Accept: 'audio/*, video/mp4, application/octet-stream;q=0.9, */*;q=0.5',
      };
      if (typeof req.headers.range === 'string') {
        upstreamHeaders.Range = req.headers.range;
      }
      if (typeof req.headers['if-range'] === 'string') {
        upstreamHeaders['If-Range'] = req.headers['if-range'];
      }

      const upstream = await fetchWithSafeRedirects(
        rawUrl,
        upstreamHeaders,
        controller.signal,
        req.method === 'HEAD' ? 'HEAD' : 'GET'
      );
      clearTimeout(connectTimeout);

      if (upstream.status === 416) {
        res.status(416);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);
        res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
        res.end();
        return;
      }

      if (!upstream.ok && upstream.status !== 206) {
        console.error(`[proxy-audio] Upstream returned HTTP ${upstream.status} for ${rawUrl}`);
        res.status(upstream.status).json({ error: `Upstream audio returned HTTP ${upstream.status}` });
        return;
      }

      const contentType = inferAudioContentType(upstream.headers.get('content-type'), rawUrl);
      const upstreamAcceptRanges = upstream.headers.get('accept-ranges');
      const acceptRanges =
        upstreamAcceptRanges ||
        (upstream.status === 206 || upstream.headers.has('content-length') ? 'bytes' : 'none');

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Vary', 'Range');
      res.setHeader('Cache-Control', 'public, max-age=300, no-transform');

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const etag = upstream.headers.get('etag');
      if (etag) res.setHeader('ETag', etag);
      const lastModified = upstream.headers.get('last-modified');
      if (lastModified) res.setHeader('Last-Modified', lastModified);

      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      activeNodeStream = nodeStream;
      nodeStream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy(err);
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      clearTimeout(connectTimeout);
      const message = err instanceof Error ? err.message : 'Audio proxy failure';
      console.error(`[proxy-audio] Failed for ${rawUrl}: ${message}`);
      if (!res.headersSent) {
        const status = message.includes('not allowed') || message.includes('Invalid') || message.includes('Blocked')
          ? 400
          : 502;
        res.status(status).json({ error: message });
      }
    }
  });

  // Multi-instance Piped + Invidious server-side stream resolver with full-length Audius/Saavn fallback
  app.get('/api/streams/:videoId', async (req: Request, res: Response) => {
    const videoId = String(req.params.videoId || '').trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      res.status(400).json({ error: 'Invalid videoId parameter' });
      return;
    }

    const hintTitle = typeof req.query.title === 'string' ? req.query.title : undefined;
    const hintArtist = typeof req.query.artist === 'string' ? req.query.artist : undefined;
    const rawDur = typeof req.query.duration === 'string' ? Number(req.query.duration) : NaN;
    const hintDuration = Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur) : undefined;
    const errors: Array<{ instance: string; error: string }> = [];

    const tasks = [
      ...PIPED_STREAM_HOSTS.map((host) => ({ kind: 'piped' as const, host })),
      ...INVIDIOUS_STREAM_HOSTS.map((host) => ({ kind: 'invidious' as const, host })),
    ];

    try {
      const winner = await Promise.any(
        tasks.map(async (entry) => {
          try {
            return entry.kind === 'piped'
              ? await probePipedHost(entry.host, videoId, hintDuration)
              : await probeInvidiousHost(entry.host, videoId, hintDuration);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ instance: entry.host, error: msg });
            throw err;
          }
        })
      );

      console.info(`[api/streams] Success for videoId=${videoId} via ${winner.host}`);
      res.json({
        duration: winner.duration,
        audioStreams: winner.audioStreams,
        videoStreams: winner.videoStreams,
        hls: winner.hls,
        sourceInstance: winner.host,
        isPreview: false,
        errors,
      });
    } catch {
      console.warn(
        `[api/streams] All ${tasks.length} Piped/Invidious mirrors failed for videoId=${videoId}:`,
        errors
      );
      const fallback = await resolveFallbackMusicStreams(videoId, hintTitle, hintArtist, hintDuration);
      if (fallback) {
        console.info(
          `[api/streams] Resolved fallback "${fallback.sourceInstance}" for videoId=${videoId} (isPreview=${fallback.isPreview})`
        );
        res.json({
          duration: fallback.duration,
          audioStreams: fallback.audioStreams,
          videoStreams: [],
          hls: null,
          sourceInstance: fallback.sourceInstance,
          isPreview: fallback.isPreview,
          errors,
        });
        return;
      }

      console.error(
        `[api/streams] Unresolved streams for videoId=${videoId} across ${tasks.length} mirrors and fallbacks.`,
        errors
      );
      res.status(200).json({
        audioStreams: [],
        videoStreams: [],
        hls: null,
        unresolved: true,
        error: `No playable streams returned for ${videoId}`,
        errors,
      });
    }
  });

  // Rotating Piped -> Invidious -> YouTube InnerTube music search endpoint (avoids browser CORS issues)
  app.get('/api/search', async (req: Request, res: Response) => {
    const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQ) {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }
    const query = rawQ.slice(0, 120);
    const rawFilter = typeof req.query.filter === 'string' ? req.query.filter : 'music_songs';
    const filter = rawFilter === 'videos' || rawFilter === 'all' ? rawFilter : 'music_songs';
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(30, Math.round(rawLimit))) : 20;

    const errors: Array<{ instance: string; source: 'piped' | 'invidious' | 'youtube'; error: string }> = [];
    const orderedPiped = preferredPipedSearchHost
      ? [preferredPipedSearchHost, ...PIPED_STREAM_HOSTS.filter((h) => h !== preferredPipedSearchHost)]
      : [...PIPED_STREAM_HOSTS];

    // 1. Try preferred Piped host first for low latency, then race remaining Piped hosts
    try {
      const firstResult = await searchPipedHost(orderedPiped[0], query, filter);
      preferredPipedSearchHost = firstResult.host;
      console.info(`[api/search] Success for "${query}" via piped (${firstResult.host}), ${firstResult.items.length} items`);
      res.json({
        items: firstResult.items.slice(0, limit),
        sourceHost: firstResult.host,
        sourceType: 'piped',
        errors,
      });
      return;
    } catch (firstErr) {
      errors.push({
        instance: orderedPiped[0],
        source: 'piped',
        error: firstErr instanceof Error ? firstErr.message : String(firstErr),
      });
      try {
        const remainingResult = await Promise.any(
          orderedPiped.slice(1).map(async (host) => {
            try {
              return await searchPipedHost(host, query, filter);
            } catch (err) {
              errors.push({
                instance: host,
                source: 'piped',
                error: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          })
        );
        preferredPipedSearchHost = remainingResult.host;
        console.info(`[api/search] Success for "${query}" via piped (${remainingResult.host}), ${remainingResult.items.length} items`);
        res.json({
          items: remainingResult.items.slice(0, limit),
          sourceHost: remainingResult.host,
          sourceType: 'piped',
          errors,
        });
        return;
      } catch {
        // Fall through to Invidious search
      }
    }

    // 2. Fallback: Race public Invidious search instances
    try {
      const invResult = await Promise.any(
        INVIDIOUS_STREAM_HOSTS.map(async (host) => {
          try {
            return await searchInvidiousHost(host, query);
          } catch (err) {
            errors.push({
              instance: host,
              source: 'invidious',
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        })
      );
      console.info(`[api/search] Success for "${query}" via invidious (${invResult.host}), ${invResult.items.length} items`);
      res.json({
        items: invResult.items.slice(0, limit),
        sourceHost: invResult.host,
        sourceType: 'invidious',
        errors,
      });
      return;
    } catch {
      // Fall through to YouTube InnerTube search
    }

    // 3. Fallback: YouTube InnerTube search (preserves - Topic, Official Audio/Video & verified channels)
    const ytResult = await searchYouTubeInnerTube(filter === 'music_songs' ? `${query} official audio` : query);
    if (ytResult) {
      console.warn(
        `[api/search] Piped/Invidious hosts failed for "${query}"; using YouTube fallback (${ytResult.items.length} items). Failures:`,
        errors
      );
      res.json({
        items: ytResult.items.slice(0, limit),
        sourceHost: ytResult.host,
        sourceType: 'youtube',
        errors,
      });
      return;
    }

    errors.push({
      instance: 'youtube-innertube',
      source: 'youtube',
      error: 'Returned no results or failed',
    });
    console.error(`[api/search] All Piped, Invidious, and YouTube search hosts failed for "${query}":`, errors);
    res.status(200).json({
      items: [],
      sourceHost: null,
      sourceType: 'none',
      errors,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nocturne server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
