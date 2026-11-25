import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPredictiveSuggestions,
  formatCompactCount,
  highlightMatchSegments,
} from './searchSuggestions';
import type { Artist, Track } from '../types/audio';

const mockArtists: Artist[] = [
  {
    id: 'a1',
    name: 'Synth Master',
    handle: '@synthmaster',
    avatarUrl: '',
    bio: '',
    followersCount: 150000,
  },
  {
    id: 'a2',
    name: 'Nova Quinn',
    handle: '@novaquinn',
    avatarUrl: '',
    bio: '',
    followersCount: 80000,
  },
];

const mockTracks: Track[] = [
  {
    id: 't1',
    title: 'Synthwave Horizon',
    artist: 'Nova Quinn',
    artistId: 'a2',
    genre: 'Synthwave',
    duration: 210,
    artworkUrl: '',
    streamUrl: '',
    source: 'audius',
    playCount: 52000,
  },
  {
    id: 't2',
    title: 'Midnight Synth',
    artist: 'Nova',
    artistId: 'a3',
    genre: 'Electronic',
    duration: 185,
    artworkUrl: '',
    streamUrl: '',
    source: 'audius',
    playCount: 9000,
  },
];

test('buildPredictiveSuggestions prioritizes prefix artist and track matches and deduplicates', () => {
  const list = buildPredictiveSuggestions({
    query: 'synth',
    artists: mockArtists,
    tracks: mockTracks,
    trendingTracks: [mockTracks[0]],
    limit: 6,
  });

  assert.equal(list.length, 3);
  assert.equal(list[0].kind, 'artist');
  assert.equal(list[0].label, 'Synth Master');
  // Prefix match "Synthwave Horizon" outranks substring match "Midnight Synth"
  const trackLabels = list.filter((s) => s.kind === 'track').map((s) => s.label);
  assert.deepEqual(trackLabels, ['Synthwave Horizon', 'Midnight Synth']);
});

test('buildPredictiveSuggestions returns trending items when query is empty', () => {
  const list = buildPredictiveSuggestions({
    query: '',
    artists: [],
    tracks: [],
    trendingTracks: mockTracks,
    trendingArtists: mockArtists,
    limit: 5,
  });

  assert.ok(list.length >= 3);
  assert.equal(list[0].kind, 'artist');
  assert.ok(list.some((s) => s.kind === 'trend'));
});

test('highlightMatchSegments splits case-insensitively without mutating casing', () => {
  assert.deepEqual(highlightMatchSegments('Obsidian Synthwave', 'synth'), {
    before: 'Obsidian ',
    match: 'Synth',
    after: 'wave',
  });
  assert.deepEqual(highlightMatchSegments('No Match', 'xyz'), {
    before: 'No Match',
    match: '',
    after: '',
  });
});

test('formatCompactCount formats thousands and millions cleanly', () => {
  assert.equal(formatCompactCount(1500), '1.5K');
  assert.equal(formatCompactCount(2_400_000), '2.4M');
  assert.equal(formatCompactCount(420), '420');
});

test('buildPredictiveSuggestions ranks official Piped track ahead of higher-playCount Audius remix', () => {
  const audiusRemix: Track = {
    id: 'audius-remix-1',
    title: 'Beauty And A Beat (Sped Up Remix)',
    artist: 'FanUploader',
    artistId: 'fan-1',
    genre: 'Electronic',
    duration: 165,
    artworkUrl: '',
    streamUrl: '',
    source: 'audius',
    playCount: 25_000_000,
  };
  const pipedOfficial: Track = {
    id: 'piped-official-1',
    videoId: 'Ys7-6_t7OEQ',
    title: 'Beauty And A Beat (Official Music Video)',
    artist: 'Justin Bieber - Topic',
    artistId: 'jb-topic',
    genre: 'Pop',
    duration: 228,
    artworkUrl: '',
    streamUrl: '',
    source: 'piped',
    artistVerified: true,
    playCount: 1000,
  };

  const list = buildPredictiveSuggestions({
    query: 'Beauty and a Beat',
    artists: [],
    tracks: [audiusRemix, pipedOfficial],
    trendingTracks: [],
    limit: 6,
  });

  const trackLabels = list.filter((s) => s.kind === 'track').map((s) => s.label);
  assert.equal(trackLabels[0], pipedOfficial.title);
  assert.ok(trackLabels.includes(audiusRemix.title));
});

