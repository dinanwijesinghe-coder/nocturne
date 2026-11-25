import type { EqSettings } from '../types/audio';
import { EQ_BAND_FREQUENCIES } from '../utils/eqPresets';

export const ANALYSER_FFT_SIZE = 128;

export const LIMITER_CONFIG = {
  threshold: -1.5,
  knee: 4,
  ratio: 16,
  attack: 0.002,
  release: 0.1,
} as const;

export function isEqFlat(settings: EqSettings): boolean {
  return (
    settings.preampDb === 0 &&
    !settings.bassBoost &&
    !settings.surround3d &&
    settings.bands.every((gain) => gain === 0)
  );
}

/**
 * Returns true when audio should route through the zero-CPU clean bypass path:
 * either the user explicitly enabled Direct Audio Bypass (!settings.enabled),
 * or every EQ band, preamp, bass boost, and reverb setting is at unity 0 dB (Flat).
 */
export function shouldBypassDspChain(settings: EqSettings): boolean {
  return !settings.enabled || isEqFlat(settings);
}

export function areEqSettingsEqual(a: EqSettings | null, b: EqSettings | null): boolean {
  if (!a || !b) return false;
  if (
    a.enabled !== b.enabled ||
    a.preampDb !== b.preampDb ||
    a.bassBoost !== b.bassBoost ||
    a.surround3d !== b.surround3d ||
    a.bands.length !== b.bands.length
  ) {
    return false;
  }
  for (let i = 0; i < a.bands.length; i += 1) {
    if (a.bands[i] !== b.bands[i]) return false;
  }
  return true;
}

const MEDIA_SOURCE_ATTACHED = Symbol('nocturne_media_source_attached');

type TrackedAudioElement = HTMLAudioElement & {
  [MEDIA_SOURCE_ATTACHED]?: MediaElementAudioSourceNode;
};

/**
 * Singleton Web Audio API DSP graph with true zero-CPU bypass:
 *
 *  AudioElement -> MediaElementAudioSourceNode (created strictly ONCE per element)
 *     ├── [Bypass / Flat] -> directBypassGain (1.0) -> ctx.destination (+ passive analyser tap)
 *     └── [Active Non-Flat EQ] -> eqInputGain -> preampNode -> 10x BiquadFilterNode
 *                                 -> bassBoostFilter -> (dryGain + optional convolver -> wetGain)
 *                                 -> limiter (DynamicsCompressorNode) -> ctx.destination (+ analyser)
 *
 * When Bypassed or Flat, the DSP sub-graph (10 BiquadFilters, Convolver, Limiter) is disconnected
 * from ctx.destination so Web Audio skips DSP processing with zero CPU overhead.
 */
export class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNodes = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private attachedElementCount = 0;

  // Parallel routing gates for clickless Direct <-> EQ switching
  private eqInputGain: GainNode | null = null;
  private directBypassGain: GainNode | null = null;

  // EQ DSP chain (created strictly ONCE when AudioContext initializes)
  private preampNode: GainNode | null = null;
  private bandFilters: BiquadFilterNode[] = [];
  private bassBoostFilter: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;

  // Output protection, smooth master volume gain & lightweight visualization (fftSize = 128)
  private limiter: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private currentMasterGain = 1;

  // Connection state so Flat/Bypass disconnects unused DSP nodes for zero CPU overhead
  private isDspConnected = false;
  private isReverbConnected = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAppliedSettings: EqSettings | null = null;

  private currentSettings: EqSettings = {
    enabled: true,
    presetName: 'Flat',
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bassBoost: false,
    surround3d: false,
  };

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      // Preserve native hardware sample rate with zero downsampling
      this.ctx = new AudioCtx({ latencyHint: 'playback' });
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  private buildImpulseResponse(ctx: AudioContext, duration = 1.2, decay = 2.8): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        const env = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * env * 0.35;
      }
    }
    return impulse;
  }

  private buildGraph(ctx: AudioContext): void {
    this.eqInputGain = ctx.createGain();
    this.eqInputGain.gain.value = 0;

    this.directBypassGain = ctx.createGain();
    this.directBypassGain.gain.value = 1;

    this.preampNode = ctx.createGain();
    this.preampNode.gain.value = 1;

    this.bandFilters = EQ_BAND_FREQUENCIES.map((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      if (idx === 0) filter.type = 'lowshelf';
      else if (idx === EQ_BAND_FREQUENCIES.length - 1) filter.type = 'highshelf';
      else filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    this.bassBoostFilter = ctx.createBiquadFilter();
    this.bassBoostFilter.type = 'lowshelf';
    this.bassBoostFilter.frequency.value = 85;
    this.bassBoostFilter.gain.value = 0;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;

    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.convolver.buffer = this.buildImpulseResponse(ctx);

    // Brickwall-style DynamicsCompressorNode limiter right before destination
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = LIMITER_CONFIG.threshold;
    this.limiter.knee.value = LIMITER_CONFIG.knee;
    this.limiter.ratio.value = LIMITER_CONFIG.ratio;
    this.limiter.attack.value = LIMITER_CONFIG.attack;
    this.limiter.release.value = LIMITER_CONFIG.release;

    // Smooth master volume output stage before destination
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.currentMasterGain;

    // Lightweight passive FFT analyser (fftSize = 128 => 64 bins)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = ANALYSER_FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.8;

    // Wire internal EQ chain once: preamp -> 10 EQ bands -> bassBoost -> dryGain -> limiter
    let head: AudioNode = this.preampNode;
    for (const filter of this.bandFilters) {
      head.connect(filter);
      head = filter;
    }
    head.connect(this.bassBoostFilter);
    this.bassBoostFilter.connect(this.dryGain);
    this.dryGain.connect(this.limiter);

    // Master output bus -> ctx.destination (+ passive analyser)
    this.masterGain.connect(ctx.destination);
    this.masterGain.connect(this.analyser);

    // Default startup path is Direct Clean Bypass -> masterGain -> ctx.destination
    // DSP nodes remain disconnected until non-flat EQ or effects are engaged.
    this.directBypassGain.connect(this.masterGain);

    this.isDspConnected = false;
    this.isReverbConnected = false;

    this.applyEqSettings(this.currentSettings, true);
  }

  private connectDspChain(): void {
    if (!this.ctx || !this.eqInputGain || !this.preampNode || !this.limiter || !this.masterGain) return;
    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    if (this.isDspConnected) return;

    this.eqInputGain.connect(this.preampNode);
    this.limiter.connect(this.masterGain);
    this.isDspConnected = true;
  }

  private disconnectDspChainNow(): void {
    if (!this.eqInputGain || !this.limiter) return;
    try {
      this.eqInputGain.disconnect();
    } catch {
      // already disconnected
    }
    try {
      this.limiter.disconnect();
    } catch {
      // already disconnected
    }
    this.disconnectReverbChain();
    this.isDspConnected = false;
  }

  private connectReverbChain(): void {
    if (!this.bassBoostFilter || !this.convolver || !this.wetGain || !this.limiter) return;
    if (this.isReverbConnected) return;
    this.bassBoostFilter.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.limiter);
    this.isReverbConnected = true;
  }

  private disconnectReverbChain(): void {
    if (!this.bassBoostFilter || !this.convolver || !this.wetGain) return;
    if (!this.isReverbConnected) return;
    try {
      this.bassBoostFilter.disconnect(this.convolver);
    } catch {
      // already disconnected
    }
    try {
      this.convolver.disconnect();
      this.wetGain.disconnect();
    } catch {
      // already disconnected
    }
    this.isReverbConnected = false;
  }

  /**
   * Connects an <audio> element to AudioContext.createMediaElementSource() strictly ONCE.
   * Safe against repeated calls, React re-renders, or crossfade switches.
   */
  public attachElement(audioEl: HTMLAudioElement): boolean {
    const ctx = this.ensureContext();
    if (!ctx || !this.eqInputGain || !this.directBypassGain) return false;

    const tracked = audioEl as TrackedAudioElement;
    if (tracked[MEDIA_SOURCE_ATTACHED] || this.sourceNodes.has(audioEl)) {
      return true;
    }

    try {
      const source = ctx.createMediaElementSource(audioEl);
      source.connect(this.eqInputGain);
      source.connect(this.directBypassGain);
      this.sourceNodes.set(audioEl, source);
      tracked[MEDIA_SOURCE_ATTACHED] = source;
      this.attachedElementCount += 1;
      return true;
    } catch {
      return false;
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMasterGain(gain: number, immediate = false): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 1));
    this.currentMasterGain = clamped;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    if (immediate) {
      this.masterGain.gain.setValueAtTime(clamped, now);
    } else {
      this.masterGain.gain.setTargetAtTime(clamped, now, 0.015);
    }
  }

  public applyEqSettings(settings: EqSettings, force = false): void {
    // Never touch audio node params during React re-renders if settings are unchanged
    if (!force && areEqSettingsEqual(this.lastAppliedSettings, settings)) {
      return;
    }

    this.currentSettings = settings;
    if (
      !this.ctx ||
      !this.eqInputGain ||
      !this.directBypassGain ||
      !this.preampNode ||
      !this.bassBoostFilter ||
      !this.dryGain ||
      !this.wetGain
    ) {
      return;
    }

    this.lastAppliedSettings = {
      ...settings,
      bands: [...settings.bands],
    };

    const now = this.ctx.currentTime;
    const cleanBypass = shouldBypassDspChain(settings);

    if (cleanBypass) {
      // Smoothly ramp to Direct Clean Bypass, then disconnect DSP nodes so CPU = 0
      if (this.isDspConnected) {
        this.eqInputGain.gain.cancelScheduledValues(now);
        this.eqInputGain.gain.setValueAtTime(this.eqInputGain.gain.value, now);
        this.eqInputGain.gain.linearRampToValueAtTime(0, now + 0.02);

        this.directBypassGain.gain.cancelScheduledValues(now);
        this.directBypassGain.gain.setValueAtTime(this.directBypassGain.gain.value, now);
        this.directBypassGain.gain.linearRampToValueAtTime(1, now + 0.02);

        if (this.disconnectTimer !== null) {
          clearTimeout(this.disconnectTimer);
        }
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null;
          if (shouldBypassDspChain(this.currentSettings)) {
            this.disconnectDspChainNow();
          }
        }, 35);
      } else {
        this.eqInputGain.gain.setValueAtTime(0, now);
        this.directBypassGain.gain.setValueAtTime(1, now);
      }
      return;
    }

    // Non-flat EQ or spatial effect active: connect DSP chain + limiter and ramp in
    this.connectDspChain();

    this.eqInputGain.gain.cancelScheduledValues(now);
    this.eqInputGain.gain.setValueAtTime(this.eqInputGain.gain.value, now);
    this.eqInputGain.gain.linearRampToValueAtTime(1, now + 0.02);

    this.directBypassGain.gain.cancelScheduledValues(now);
    this.directBypassGain.gain.setValueAtTime(this.directBypassGain.gain.value, now);
    this.directBypassGain.gain.linearRampToValueAtTime(0, now + 0.02);

    const preampLinear = Math.pow(10, settings.preampDb / 20);
    this.preampNode.gain.setTargetAtTime(preampLinear, now, 0.02);

    this.bandFilters.forEach((filter, idx) => {
      const gainDb = settings.bands[idx] ?? 0;
      filter.gain.setTargetAtTime(gainDb, now, 0.02);
    });

    const bassGain = settings.bassBoost ? 6 : 0;
    this.bassBoostFilter.gain.setTargetAtTime(bassGain, now, 0.03);

    if (settings.surround3d) {
      this.connectReverbChain();
      this.dryGain.gain.setTargetAtTime(0.84, now, 0.04);
      this.wetGain.gain.setTargetAtTime(0.28, now, 0.04);
    } else {
      this.dryGain.gain.setTargetAtTime(1.0, now, 0.04);
      this.wetGain.gain.setTargetAtTime(0, now, 0.04);
      this.disconnectReverbChain();
    }
  }

  public getFrequencyData(target: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(target as Uint8Array<ArrayBuffer>);
    return true;
  }

  public isGraphInitialized(): boolean {
    return Boolean(this.ctx && this.limiter && this.masterGain && this.eqInputGain && this.directBypassGain);
  }

  public getDiagnostics() {
    return {
      hasContext: Boolean(this.ctx),
      attachedElementCount: this.attachedElementCount,
      bandFilterCount: this.bandFilters.length,
      isDspConnected: this.isDspConnected,
      isReverbConnected: this.isReverbConnected,
      masterGainValue: this.masterGain?.gain.value ?? this.currentMasterGain,
      analyserFftSize: this.analyser?.fftSize ?? ANALYSER_FFT_SIZE,
    };
  }
}

export const webAudioEngine = new WebAudioEngine();
