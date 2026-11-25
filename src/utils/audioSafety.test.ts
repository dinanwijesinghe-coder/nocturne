import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EQ_SETTINGS, EQ_BAND_FREQUENCIES } from './eqPresets';
import {
  ANALYSER_FFT_SIZE,
  LIMITER_CONFIG,
  WebAudioEngine,
  areEqSettingsEqual,
  isEqFlat,
  shouldBypassDspChain,
} from '../services/webAudioEngine';
import { configureAudioElementForStreaming, waitForAudioCanPlay } from './audioBuffering';

test('startup EQ defaults are strictly Flat 0 dB with Bass Boost and 3D Surround OFF', () => {
  assert.equal(DEFAULT_EQ_SETTINGS.enabled, true);
  assert.equal(DEFAULT_EQ_SETTINGS.presetName, 'Flat');
  assert.equal(DEFAULT_EQ_SETTINGS.preampDb, 0);
  assert.equal(DEFAULT_EQ_SETTINGS.bassBoost, false);
  assert.equal(DEFAULT_EQ_SETTINGS.surround3d, false);
  assert.equal(DEFAULT_EQ_SETTINGS.bands.length, EQ_BAND_FREQUENCIES.length);
  assert.ok(DEFAULT_EQ_SETTINGS.bands.every((gain) => gain === 0));
});

test('Flat and Bypassed EQ settings trigger zero-CPU DSP clean bypass', () => {
  assert.equal(isEqFlat(DEFAULT_EQ_SETTINGS), true);
  assert.equal(shouldBypassDspChain(DEFAULT_EQ_SETTINGS), true);
  assert.equal(
    shouldBypassDspChain({ ...DEFAULT_EQ_SETTINGS, enabled: false, bassBoost: true, bands: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    true
  );
  assert.equal(
    shouldBypassDspChain({ ...DEFAULT_EQ_SETTINGS, bassBoost: true }),
    false
  );
  assert.equal(
    shouldBypassDspChain({ ...DEFAULT_EQ_SETTINGS, bands: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    false
  );
  assert.equal(
    areEqSettingsEqual(DEFAULT_EQ_SETTINGS, { ...DEFAULT_EQ_SETTINGS, bands: [...DEFAULT_EQ_SETTINGS.bands] }),
    true
  );
  assert.equal(
    areEqSettingsEqual(DEFAULT_EQ_SETTINGS, { ...DEFAULT_EQ_SETTINGS, preampDb: 1 }),
    false
  );
});

test('WebAudioEngine masterGain defaults to 1.0 (100%) and clamps gain bounds cleanly', () => {
  const engine = new WebAudioEngine();
  assert.equal(engine.getDiagnostics().masterGainValue, 1);
  engine.setMasterGain(0.45);
  assert.equal(engine.getDiagnostics().masterGainValue, 0.45);
  engine.setMasterGain(2.5);
  assert.equal(engine.getDiagnostics().masterGainValue, 1);
  engine.setMasterGain(-0.3);
  assert.equal(engine.getDiagnostics().masterGainValue, 0);
});

test('visualizer FFT size is capped at lightweight 128 bins', () => {
  assert.equal(ANALYSER_FFT_SIZE, 128);
});

test('master limiter config enforces safe non-clipping DynamicsCompressorNode bounds', () => {
  assert.ok(LIMITER_CONFIG.threshold < 0 && LIMITER_CONFIG.threshold >= -6);
  assert.ok(LIMITER_CONFIG.ratio >= 10);
  assert.ok(LIMITER_CONFIG.attack > 0 && LIMITER_CONFIG.attack <= 0.01);
});

test('configureAudioElementForStreaming sets preload="auto" and crossOrigin="anonymous"', () => {
  const mockAudio = { preload: 'metadata', crossOrigin: null } as unknown as HTMLAudioElement;
  configureAudioElementForStreaming(mockAudio);
  assert.equal(mockAudio.preload, 'auto');
  assert.equal(mockAudio.crossOrigin, 'anonymous');
});

test('waitForAudioCanPlay waits for canplay event and supports immediate readyState or cancellation', async () => {
  const target = new EventTarget() as EventTarget & { readyState: number };
  target.readyState = 0;

  let resolved = false;
  const pending = waitForAudioCanPlay(target as unknown as HTMLAudioElement, { timeoutMs: 2000 }).then((r) => {
    resolved = true;
    return r;
  });

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, false);

  target.readyState = 3;
  target.dispatchEvent(new Event('canplay'));
  assert.equal(await pending, 'ready');

  // Immediate readyState >= 3 returns immediately
  const immediate = await waitForAudioCanPlay(target as unknown as HTMLAudioElement);
  assert.equal(immediate, 'ready');

  // Cancelled request aborts cleanly
  target.readyState = 0;
  let cancelled = false;
  const cancelWait = waitForAudioCanPlay(target as unknown as HTMLAudioElement, {
    timeoutMs: 2000,
    isCancelled: () => cancelled,
  });
  cancelled = true;
  assert.equal(await cancelWait, 'cancelled');
});
