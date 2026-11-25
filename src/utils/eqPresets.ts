import type { AudioQuality, EqSettings } from '../types/audio';

export const EQ_BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_BAND_LABELS = ['31Hz', '62Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'] as const;

export interface EqPresetDefinition {
  name: string;
  preampDb: number;
  bands: number[];
  bassBoost: boolean;
  surround3d: boolean;
}

export const EQ_PRESETS: EqPresetDefinition[] = [
  {
    name: 'Flat',
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bassBoost: false,
    surround3d: false,
  },
  {
    name: 'Heavy Bass',
    preampDb: -1.5,
    bands: [8, 7, 5, 2, 0, -1, 0, 2, 3, 2],
    bassBoost: true,
    surround3d: false,
  },
  {
    name: 'Pop',
    preampDb: 0,
    bands: [-1, 1, 3, 4, 2, 0, -1, 2, 4, 3],
    bassBoost: false,
    surround3d: true,
  },
  {
    name: 'Hip-Hop/Rap',
    preampDb: -1,
    bands: [6, 5, 3, 1, -1, -1, 1, 2, 4, 3],
    bassBoost: true,
    surround3d: false,
  },
  {
    name: 'Rock',
    preampDb: -0.5,
    bands: [4, 3, 1, -1, -2, 0, 2, 4, 5, 4],
    bassBoost: false,
    surround3d: true,
  },
  {
    name: 'R&B',
    preampDb: 0,
    bands: [4, 5, 3, 0, -1, 1, 2, 2, 3, 2],
    bassBoost: true,
    surround3d: true,
  },
  {
    name: 'Vocal',
    preampDb: 0.5,
    bands: [-3, -2, -1, 1, 4, 5, 4, 2, 0, -1],
    bassBoost: false,
    surround3d: false,
  },
  {
    name: 'Acoustic',
    preampDb: 0,
    bands: [2, 2, 1, 0, 2, 2, 3, 3, 4, 3],
    bassBoost: false,
    surround3d: true,
  },
];

export const DEFAULT_EQ_SETTINGS: EqSettings = {
  enabled: true,
  presetName: 'Flat',
  preampDb: 0,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoost: false,
  surround3d: false,
};

export const AUDIO_QUALITY_OPTIONS: Array<{
  id: AudioQuality;
  label: string;
  bitrateLabel: string;
  description: string;
}> = [
  { id: 'low', label: 'Low', bitrateLabel: '~64 kbps', description: 'Minimal mobile data footprint' },
  { id: 'normal', label: 'Normal', bitrateLabel: '128 kbps', description: 'Balanced everyday clarity' },
  { id: 'high', label: 'High', bitrateLabel: 'Max Opus/AAC', description: 'Highest bitrate stream available' },
  { id: 'lossless', label: 'Lossless', bitrateLabel: 'Max / Original', description: 'Max stream & native FLAC/WAV' },
];
