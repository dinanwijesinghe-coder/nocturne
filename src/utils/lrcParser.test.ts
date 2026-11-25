import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, getActiveLyricIndex, formatTime } from './lrcParser';

test('parseLrc parses timestamps, milliseconds, and multi-timestamp lines in sorted order', () => {
  const sample = `
[ti:Midnight Echoes]
[00:12.50]Neon shadows on the glass
[00:04.00]City lights begin to fade
[00:20.10][01:05.250]Hold the frequency tonight
[00:30.00]
`;
  const lines = parseLrc(sample);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0], { time: 4, text: 'City lights begin to fade' });
  assert.deepEqual(lines[1], { time: 12.5, text: 'Neon shadows on the glass' });
  assert.deepEqual(lines[2], { time: 20.1, text: 'Hold the frequency tonight' });
  assert.deepEqual(lines[3], { time: 65.25, text: 'Hold the frequency tonight' });
});

test('getActiveLyricIndex tracks active line accurately across playback time', () => {
  const lines = [
    { time: 5, text: 'Line 1' },
    { time: 12, text: 'Line 2' },
    { time: 24, text: 'Line 3' },
  ];
  assert.equal(getActiveLyricIndex(lines, 1.5), -1);
  assert.equal(getActiveLyricIndex(lines, 5), 0);
  assert.equal(getActiveLyricIndex(lines, 11.8), 0);
  assert.equal(getActiveLyricIndex(lines, 12.0), 1);
  assert.equal(getActiveLyricIndex(lines, 40), 2);
});

test('formatTime handles seconds, minutes, and hours cleanly', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3661), '1:01:01');
  assert.equal(formatTime(-5), '0:00');
});
