import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextIndex,
  computePrevIndex,
  reorderQueue,
  findSimilarTracks,
  calculateCrossfadeGains,
  computeWrappedStats,
  generateInviteCode,
} from './queueLogic';
import type { Track } from '../types/audio';

const sampleCatalog: Track[] = [
  { id: '1', title: 'A', artist: 'Nova', artistId: 'art1', genre: 'Synthwave', duration: 180, artworkUrl: '', streamUrl: '', source: 'audius' },
  { id: '2', title: 'B', artist: 'Echo', artistId: 'art2', genre: 'Lo-Fi', duration: 180, artworkUrl: '', streamUrl: '', source: 'audius' },
  { id: '3', title: 'C', artist: 'Nova', artistId: 'art1', genre: 'Synthwave', duration: 180, artworkUrl: '', streamUrl: '', source: 'audius' },
  { id: '4', title: 'Pod', artist: 'Host', artistId: 'pod1', genre: 'Tech', duration: 1200, artworkUrl: '', streamUrl: '', source: 'podcast', isPodcast: true },
];

test('computeNextIndex respects repeat modes and shuffle', () => {
  assert.equal(computeNextIndex(0, 3, 'off', false), 1);
  assert.equal(computeNextIndex(2, 3, 'off', false), -1);
  assert.equal(computeNextIndex(2, 3, 'all', false), 0);
  assert.equal(computeNextIndex(1, 3, 'one', false), 1);
  // Shuffle avoids repeating current index when queueLength > 1
  assert.equal(computeNextIndex(1, 3, 'off', true, () => 0.4), 2);
});

test('computePrevIndex handles boundaries', () => {
  assert.equal(computePrevIndex(0, 3, 'off'), 0);
  assert.equal(computePrevIndex(0, 3, 'all'), 2);
  assert.equal(computePrevIndex(2, 3, 'off'), 1);
});

test('reorderQueue swaps items immutably', () => {
  const original = ['a', 'b', 'c', 'd'];
  const updated = reorderQueue(original, 1, 3);
  assert.deepEqual(updated, ['a', 'c', 'd', 'b']);
  assert.deepEqual(original, ['a', 'b', 'c', 'd']);
});

test('findSimilarTracks prioritizes matching genre and artist and excludes podcasts', () => {
  const similar = findSimilarTracks(sampleCatalog[0], sampleCatalog, new Set(['1']), 3);
  assert.equal(similar[0].id, '3');
  assert.equal(similar.some((t) => t.isPodcast), false);
});

test('calculateCrossfadeGains produces smooth equal-power curves', () => {
  const [outStart, inStart] = calculateCrossfadeGains(0);
  const [outMid, inMid] = calculateCrossfadeGains(0.5);
  const [outEnd, inEnd] = calculateCrossfadeGains(1);
  assert.equal(outStart, 1);
  assert.equal(inStart, 0);
  assert.ok(Math.abs(outMid - inMid) < 0.01);
  assert.equal(outEnd, 0);
  assert.equal(inEnd, 1);
});

test('computeWrappedStats aggregates listening minutes, top songs, artists, and genres', () => {
  const stats = computeWrappedStats([
    { trackId: '1', title: 'A', artist: 'Nova', genre: 'Synthwave', secondsListened: 180, timestamp: 1 },
    { trackId: '1', title: 'A', artist: 'Nova', genre: 'Synthwave', secondsListened: 180, timestamp: 2 },
    { trackId: '2', title: 'B', artist: 'Echo', genre: 'Lo-Fi', secondsListened: 120, timestamp: 3 },
  ]);
  assert.equal(stats.totalMinutes, 8);
  assert.equal(stats.totalPlays, 3);
  assert.equal(stats.topSongs[0].trackId, '1');
  assert.equal(stats.topArtists[0].artist, 'Nova');
  assert.equal(stats.topGenres[0].genre, 'Synthwave');
});

test('generateInviteCode produces clean uppercase invite codes', () => {
  const code = generateInviteCode('Night Drive', 1234);
  assert.match(code, /^NIGH-[A-Z0-9]+$/);
});
