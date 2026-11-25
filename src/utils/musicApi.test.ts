import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPipedVideoId,
  mapInvidiousSearchItem,
  mapPipedSearchItem,
  selectBestPipedAudioUrl,
  selectBestPipedStream,
} from '../services/pipedApi';
import { mergeUniqueArtists, mergeUniqueTracks } from '../services/musicApi';
import { formatAudioQualityBadge, parseNativeAudioHeader } from './streamQuality';
import {
  cleanTrackSearchQuery,
  isLikelyPreviewStream,
  scoreCandidateTrackMatch,
} from './streamMatching';
import {
  getTrackSourceBadge,
  isOfficialTrackMatch,
  isVariantOrRemixTrack,
  rankSearchResults,
} from './searchRanking';
import type { Artist, Track } from '../types/audio';

test('extractPipedVideoId parses watch URLs and bare 11-char IDs', () => {
  assert.equal(extractPipedVideoId('/watch?v=aWkPBCF8rFU'), 'aWkPBCF8rFU');
  assert.equal(extractPipedVideoId('https://piped.video/watch?v=Ys7-6_t7OEQ&t=12'), 'Ys7-6_t7OEQ');
  assert.equal(extractPipedVideoId('aWkPBCF8rFU'), 'aWkPBCF8rFU');
  assert.equal(extractPipedVideoId('/channel/UC12345'), null);
  assert.equal(extractPipedVideoId(undefined), null);
});

test('selectBestPipedStream sorts by bitrate descending for High/Lossless, 128kbps for Normal, and ~48-64kbps for Data Saver', () => {
  const payload = {
    audioStreams: [
      { url: 'https://proxy.example/opus-low', mimeType: 'audio/webm; codecs="opus"', bitrate: 52_000 },
      { url: 'https://proxy.example/aac-norm', mimeType: 'audio/mp4; codecs="mp4a.40.2"', format: 'M4A', bitrate: 128_000 },
      { url: 'https://proxy.example/opus-max', mimeType: 'audio/webm; codecs="opus"', bitrate: 164_000 },
      { url: 'https://proxy.example/aac-high', mimeType: 'audio/mp4; codecs="mp4a.40.2"', format: 'M4A', bitrate: 256_000 },
    ],
    videoStreams: [
      { url: 'https://proxy.example/mp4-360p', mimeType: 'video/mp4', videoOnly: false, bitrate: 400_000 },
    ],
  };

  const highPick = selectBestPipedStream(payload, 'high', false);
  assert.equal(highPick?.url, 'https://proxy.example/aac-high');
  assert.equal(highPick?.meta.codec, 'AAC');
  assert.equal(highPick?.meta.bitrateKbps, 256);

  const losslessPick = selectBestPipedStream(payload, 'lossless', false);
  assert.equal(losslessPick?.url, 'https://proxy.example/aac-high');

  const normalPick = selectBestPipedStream(payload, 'normal', false);
  assert.equal(normalPick?.url, 'https://proxy.example/aac-norm');
  assert.equal(normalPick?.meta.bitrateKbps, 128);

  const saverPick = selectBestPipedStream(payload, 'high', true);
  assert.equal(saverPick?.url, 'https://proxy.example/opus-low');
  assert.equal(saverPick?.meta.codec, 'OPUS');
  assert.equal(saverPick?.meta.bitrateKbps, 52);
});

test('selectBestPipedStream prefers OPUS/M4A at top bitrate ties and falls back to progressive/HLS', () => {
  const opusWin = selectBestPipedStream(
    {
      audioStreams: [
        { url: 'https://proxy.example/vorbis-160', mimeType: 'audio/ogg; codecs="vorbis"', bitrate: 160_000 },
        { url: 'https://proxy.example/opus-160', mimeType: 'audio/webm; codecs="opus"', bitrate: 160_000 },
      ],
    },
    'high',
    false
  );
  assert.equal(opusWin?.url, 'https://proxy.example/opus-160');
  assert.equal(opusWin?.meta.codec, 'OPUS');

  const progressivePayload = {
    audioStreams: [],
    videoStreams: [
      { url: 'https://proxy.example/video-only-1080', mimeType: 'video/mp4', videoOnly: true, bitrate: 2_000_000 },
      { url: 'https://proxy.example/progressive-360', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', videoOnly: false, bitrate: 350_000 },
    ],
  };
  assert.equal(selectBestPipedAudioUrl(progressivePayload, 'high'), 'https://proxy.example/progressive-360');

  const hlsPayload = {
    audioStreams: [],
    videoStreams: [],
    hls: 'https://proxy.example/master.m3u8',
  };
  assert.equal(selectBestPipedAudioUrl(hlsPayload, 'high'), 'https://proxy.example/master.m3u8');
  assert.equal(selectBestPipedAudioUrl({ audioStreams: [], videoStreams: [] }, 'high'), null);
});

test('formatAudioQualityBadge formats live codec/bitrate and lossless local badges cleanly', () => {
  assert.equal(
    formatAudioQualityBadge({ codec: 'OPUS', bitrateKbps: 160 }),
    'OPUS 160kbps'
  );
  assert.equal(
    formatAudioQualityBadge({ codec: 'AAC', bitrateKbps: 256 }),
    'AAC 256kbps'
  );
  assert.equal(
    formatAudioQualityBadge({ codec: 'MP3', bitrateKbps: 320 }),
    'MP3 320kbps'
  );
  assert.equal(
    formatAudioQualityBadge({ codec: 'FLAC', lossless: true }),
    'FLAC LOSSLESS'
  );
  assert.equal(
    formatAudioQualityBadge({ codec: 'WAV', lossless: true, sampleRateHz: 48000, bitDepth: 24 }),
    'WAV LOSSLESS · 48kHz/24-bit'
  );
});

test('parseNativeAudioHeader extracts exact native sample rate and bit depth from uncompressed WAV and FLAC headers', () => {
  // Minimal 44-byte WAV header at 48000 Hz, 24-bit
  const wav = new Uint8Array(44);
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  const wavView = new DataView(wav.buffer);
  wavView.setUint32(24, 48000, true);
  wavView.setUint16(34, 24, true);

  const wavMeta = parseNativeAudioHeader(wav, 'master.wav', 'audio/wav', 28_800_000, 100);
  assert.equal(wavMeta.codec, 'WAV');
  assert.equal(wavMeta.lossless, true);
  assert.equal(wavMeta.sampleRateHz, 48000);
  assert.equal(wavMeta.bitDepth, 24);

  // Minimal FLAC STREAMINFO header: 96000 Hz (0x17700), 24-bit (bps-1 = 23 = 0b10111)
  const flac = new Uint8Array(26);
  flac.set([0x66, 0x4c, 0x61, 0x43], 0); // fLaC
  // sampleRate = 96000 (0x17700): bytes[18]=0x17, bytes[19]=0x70, top nibble bytes[20]=0x0
  // channels = 2 -> ch-1 = 1 -> bits[1..3] of byte 20 = 0b001 -> (1<<1) = 0x02
  // bps-1 = 23 (0b10111) -> top 1 bit in bit0 of byte 20 (0x01), low 4 bits in top nibble of byte 21 (0x70)
  flac[18] = 0x17;
  flac[19] = 0x70;
  flac[20] = 0x03;
  flac[21] = 0x70;

  const flacMeta = parseNativeAudioHeader(flac, 'studio-track.flac', 'audio/flac', 40_000_000, 120);
  assert.equal(flacMeta.codec, 'FLAC');
  assert.equal(flacMeta.lossless, true);
  assert.equal(flacMeta.sampleRateHz, 96000);
  assert.equal(flacMeta.bitDepth, 24);
});

test('mapPipedSearchItem converts Piped stream items to Track and Artist and skips shorts/channels', () => {
  const shortSkipped = mapPipedSearchItem({
    url: '/watch?v=aWkPBCF8rFU',
    type: 'stream',
    title: 'Short clip',
    isShort: true,
  });
  assert.equal(shortSkipped, null);

  const channelSkipped = mapPipedSearchItem({
    url: '/channel/UCabc',
    type: 'channel',
    title: 'Channel',
  });
  assert.equal(channelSkipped, null);

  const mapped = mapPipedSearchItem({
    url: '/watch?v=Ys7-6_t7OEQ',
    type: 'stream',
    title: 'Beauty And A Beat',
    uploaderName: 'Justin Bieber',
    uploaderUrl: '/channel/UC123',
    thumbnail: 'https://img.example/thumb.jpg',
    duration: 228,
    views: 980_000_000,
  });

  assert.ok(mapped);
  assert.equal(mapped.track.id, 'piped-Ys7-6_t7OEQ');
  assert.equal(mapped.track.videoId, 'Ys7-6_t7OEQ');
  assert.equal(mapped.track.source, 'piped');
  assert.equal(mapped.track.title, 'Beauty And A Beat');
  assert.equal(mapped.track.artist, 'Justin Bieber');
  assert.equal(mapped.track.duration, 228);
  assert.equal(mapped.artist.id, 'piped-artist-UC123');
});

test('mergeUniqueTracks and mergeUniqueArtists deduplicate by ID preserving primary order', () => {
  const t1: Track = {
    id: 'piped-abc',
    videoId: 'abc',
    title: 'Song A',
    artist: 'Artist 1',
    artistId: 'a1',
    genre: 'Pop',
    duration: 200,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
  };
  const t2: Track = { ...t1, id: 'audius-999', source: 'audius', title: 'Song A Remix' };
  const merged = mergeUniqueTracks([t1], [t1, t2]);
  assert.deepEqual(merged.map((t) => t.id), ['piped-abc', 'audius-999']);

  const a1: Artist = { id: 'a1', name: 'Artist 1', handle: '@a1', avatarUrl: '', bio: '', followersCount: 10 };
  const a2: Artist = { id: 'a2', name: 'Artist 2', handle: '@a2', avatarUrl: '', bio: '', followersCount: 20 };
  assert.deepEqual(mergeUniqueArtists([a1], [a1, a2]).map((a) => a.id), ['a1', 'a2']);
});

test('selectBestPipedStream labels Apple Audio AAC 256kbps and Deezer MP3 128kbps fallback streams accurately', () => {
  const fallbackPayload = {
    sourceInstance: 'itunes+deezer-fallback',
    audioStreams: [
      {
        url: 'https://audio-ssl.itunes.apple.com/itunes-assets/test.plus.aac.p.m4a',
        mimeType: 'audio/mp4',
        codec: 'AAC',
        bitrate: 256_000,
      },
      {
        url: 'https://cdnt-preview.dzcdn.net/api/1/test.mp3',
        mimeType: 'audio/mpeg',
        codec: 'MP3',
        bitrate: 128_000,
      },
    ],
  };

  const highPick = selectBestPipedStream(fallbackPayload, 'high', false);
  assert.equal(highPick?.meta.codec, 'AAC');
  assert.equal(highPick?.meta.bitrateKbps, 256);
  assert.equal(highPick?.meta.sourceLabel, 'Apple Audio');

  const normalPick = selectBestPipedStream(fallbackPayload, 'normal', false);
  assert.equal(normalPick?.meta.codec, 'MP3');
  assert.equal(normalPick?.meta.bitrateKbps, 128);
  assert.equal(normalPick?.meta.sourceLabel, 'Deezer');
});

test('selectBestPipedStream avoids 30-second preview URLs whenever a full-length audio stream exists', () => {
  const mixedPayload = {
    sourceInstance: 'mixed',
    audioStreams: [
      {
        url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/test.m4a',
        mimeType: 'audio/mp4',
        codec: 'AAC',
        bitrate: 256_000,
        duration: 30,
        isPreview: true,
      },
      {
        url: 'https://aac.saavncdn.com/874/full_song_160.mp4',
        mimeType: 'audio/mp4',
        codec: 'AAC',
        bitrate: 160_000,
        duration: 170,
        isPreview: false,
      },
    ],
  };

  const picked = selectBestPipedStream(mixedPayload, 'high', false, 228);
  assert.equal(picked?.url, 'https://aac.saavncdn.com/874/full_song_160.mp4');
  assert.equal(picked?.meta.isPreview, false);
  assert.equal(picked?.meta.durationSeconds, 170);
  assert.equal(picked?.meta.sourceLabel, 'Saavn');

  // Duration <= 35 when track expects >45s is also detected as preview
  assert.equal(
    isLikelyPreviewStream({
      url: 'https://rr1.googlevideo.com/videoplayback?id=abc',
      streamDuration: 30,
      expectedDuration: 228,
    }),
    true
  );
  assert.equal(
    isLikelyPreviewStream({
      url: 'https://rr1.googlevideo.com/videoplayback?id=abc',
      streamDuration: 228,
      expectedDuration: 228,
    }),
    false
  );
});

test('cleanTrackSearchQuery and scoreCandidateTrackMatch favor full-length matching songs over previews and unrelated titles', () => {
  const cleaned = cleanTrackSearchQuery('Beauty And A Beat (feat. Nicki Minaj)', 'JustinBieberVEVO');
  assert.equal(cleaned.cleanTitle, 'Beauty And A Beat');
  assert.equal(cleaned.cleanArtist, 'Justin Bieber');

  const fullScore = scoreCandidateTrackMatch({
    targetTitle: cleaned.cleanTitle,
    targetArtist: cleaned.cleanArtist,
    targetDuration: 228,
    candidateTitle: 'MOONLGHT - Beauty And A Beat',
    candidateArtist: 'AIRPLANE MODE',
    candidateDuration: 143,
  });
  assert.ok(Number.isFinite(fullScore) && fullScore >= 70);

  const previewScore = scoreCandidateTrackMatch({
    targetTitle: cleaned.cleanTitle,
    targetArtist: cleaned.cleanArtist,
    targetDuration: 228,
    candidateTitle: 'Beauty And A Beat',
    candidateArtist: 'Justin Bieber',
    candidateDuration: 30,
  });
  assert.equal(previewScore, -Infinity);

  const unrelatedScore = scoreCandidateTrackMatch({
    targetTitle: cleaned.cleanTitle,
    targetArtist: cleaned.cleanArtist,
    targetDuration: 228,
    candidateTitle: 'Estaba Pensando feat. Beauty Spot & Dj Parrucho',
    candidateArtist: 'BRAD BEAT',
    candidateDuration: 215,
  });
  assert.equal(unrelatedScore, -Infinity);
});

test('rankSearchResults puts Piped official full-length originals first while keeping remixes lower down', () => {
  const audiusRemix: Track = {
    id: 'audius-remix',
    title: 'Beauty And A Beat (Nightcore Remix)',
    artist: 'DJ Fan',
    artistId: 'fan',
    genre: 'Electronic',
    duration: 180,
    artworkUrl: '',
    streamUrl: 'https://audius/remix.mp3',
    source: 'audius',
  };
  const pipedSpedUp: Track = {
    id: 'piped-spedup',
    videoId: 'sped1234567',
    title: 'Beauty And A Beat (Sped Up)',
    artist: 'SpedUp Channel',
    artistId: 'sped',
    genre: 'Pop',
    duration: 195,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
  };
  const pipedShortClip: Track = {
    id: 'piped-short',
    videoId: 'shrt1234567',
    title: 'Beauty And A Beat',
    artist: 'ClipChannel',
    artistId: 'clip',
    genre: 'Pop',
    duration: 28,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
  };
  const pipedCover: Track = {
    id: 'piped-cover',
    videoId: 'covr1234567',
    title: 'Beauty And A Beat (Acoustic Cover)',
    artist: 'Cover Singer',
    artistId: 'cov',
    genre: 'Pop',
    duration: 210,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
  };
  const audiusOriginal: Track = {
    id: 'audius-orig',
    title: 'Beauty And A Beat',
    artist: 'Justin Bieber',
    artistId: 'jb-audius',
    genre: 'Pop',
    duration: 228,
    artworkUrl: '',
    streamUrl: 'https://audius/orig.mp3',
    source: 'audius',
  };
  const pipedOfficial: Track = {
    id: 'piped-official',
    videoId: 'Ys7-6_t7OEQ',
    title: 'Beauty And A Beat (Official Audio)',
    artist: 'Justin Bieber - Topic',
    artistId: 'jb-topic',
    genre: 'Pop',
    duration: 228,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
    artistVerified: true,
  };

  assert.equal(isOfficialTrackMatch(pipedOfficial, 'Beauty And A Beat'), true);
  assert.equal(isVariantOrRemixTrack(pipedSpedUp, 'Beauty And A Beat'), true);
  assert.equal(isVariantOrRemixTrack(pipedShortClip, 'Beauty And A Beat'), true);
  assert.equal(isVariantOrRemixTrack(pipedCover, 'Beauty And A Beat'), true);
  // Explicit variant query should NOT suppress matching requested variants
  const clubRemix: Track = { ...audiusRemix, id: 'audius-club-remix', title: 'Beauty And A Beat (Club Remix)' };
  assert.equal(isVariantOrRemixTrack(clubRemix, 'Beauty And A Beat remix'), false);
  assert.equal(isVariantOrRemixTrack(audiusRemix, 'Beauty And A Beat nightcore remix'), false);

  const ranked = rankSearchResults(
    [audiusRemix, pipedSpedUp, pipedShortClip, audiusOriginal, pipedCover, pipedOfficial],
    'Beauty And A Beat'
  );

  // All tracks preserved (none deleted)
  assert.equal(ranked.length, 6);
  // Piped official full-length song ranks #1
  assert.equal(ranked[0].id, 'piped-official');
  // Audius full-length non-remix outranks Piped/Audius remixes, covers & short clips
  assert.equal(ranked[1].id, 'audius-orig');
  // Audius remix sits at the bottom tier while remaining in results
  assert.equal(ranked[ranked.length - 1].id, 'audius-remix');
});

test('getTrackSourceBadge and mapInvidiousSearchItem return clean Official / YT / Audius badges and metadata', () => {
  const invMapped = mapInvidiousSearchItem({
    videoId: 'Ys7-6_t7OEQ',
    title: 'Beauty And A Beat (Official Video)',
    author: 'Justin Bieber',
    authorId: 'UCjb123',
    authorVerified: true,
    lengthSeconds: 293,
    viewCount: 1_200_000_000,
    videoThumbnails: [{ url: 'https://img.example/hq.jpg', width: 480 }],
  });

  assert.ok(invMapped);
  assert.equal(invMapped.track.source, 'piped');
  assert.equal(invMapped.track.artistVerified, true);
  assert.equal(invMapped.track.duration, 293);
  assert.deepEqual(getTrackSourceBadge(invMapped.track), { label: 'Official', variant: 'official' });

  const genericYt: Track = {
    ...invMapped.track,
    title: 'Beauty And A Beat (feat. Nicki Minaj)',
    artistVerified: false,
  };
  assert.deepEqual(getTrackSourceBadge(genericYt), { label: 'YT', variant: 'yt' });

  const audiusTrack: Track = {
    ...genericYt,
    id: 'audius-1',
    source: 'audius',
  };
  assert.deepEqual(getTrackSourceBadge(audiusTrack), { label: 'Audius', variant: 'audius' });

  assert.equal(
    isVariantOrRemixTrack(
      { title: 'BEAUTY AND A BEAT (Hoodtrap / Mylancore)', artist: 'HSTekk', duration: 179 },
      'Beauty And A Beat'
    ),
    true
  );
  assert.equal(
    isVariantOrRemixTrack(
      { title: 'Beauty And A Beat (Bass Boosted)', artist: 'Mix', duration: 200 },
      'Beauty And A Beat'
    ),
    true
  );
});

