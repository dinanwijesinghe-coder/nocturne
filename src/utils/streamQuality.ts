import type { StreamMetadata, Track } from '../types/audio';

export function detectCodecFromMimeOrUrl(mimeType?: string, format?: string, url?: string): string {
  const combined = `${mimeType || ''} ${format || ''} ${url || ''}`.toLowerCase();
  if (combined.includes('flac')) return 'FLAC';
  if (combined.includes('wav') || combined.includes('pcm')) return 'WAV';
  if (combined.includes('opus')) return 'OPUS';
  if (combined.includes('mp4a') || combined.includes('aac') || combined.includes('m4a')) return 'AAC';
  if (combined.includes('mp3') || combined.includes('mpeg')) return 'MP3';
  if (combined.includes('vorbis') || combined.includes('ogg')) return 'OGG';
  if (combined.includes('webm')) return 'OPUS';
  if (combined.includes('m3u8') || combined.includes('hls')) return 'HLS';
  if (combined.includes('mp4')) return 'AAC';
  return 'AUDIO';
}

export function formatAudioQualityBadge(
  meta: StreamMetadata | null | undefined,
  track?: Pick<Track, 'source' | 'streamMeta'> | null
): string {
  const effective = meta || track?.streamMeta;
  if (!effective) {
    if (track?.source === 'audius') return 'MP3 320kbps';
    if (track?.source === 'local') return 'NATIVE AUDIO';
    return 'STREAMING';
  }

  const codec = (effective.codec || 'AUDIO').toUpperCase();
  if (effective.lossless) {
    if (effective.sampleRateHz && effective.bitDepth) {
      const khz = Number((effective.sampleRateHz / 1000).toFixed(1));
      return `${codec} LOSSLESS · ${khz}kHz/${effective.bitDepth}-bit`;
    }
    if (effective.sampleRateHz) {
      const khz = Number((effective.sampleRateHz / 1000).toFixed(1));
      return `${codec} LOSSLESS · ${khz}kHz`;
    }
    return `${codec} LOSSLESS`;
  }

  if (effective.bitrateKbps && effective.bitrateKbps > 0) {
    return `${codec} ${Math.round(effective.bitrateKbps)}kbps`;
  }

  return codec;
}

/**
 * Inspects WAV (RIFF/WAVE) and FLAC (fLaC STREAMINFO) binary headers without
 * modifying or resampling audio data so local lossless files report exact native specs.
 */
export function parseNativeAudioHeader(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  durationSeconds: number
): StreamMetadata {
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const codec = detectCodecFromMimeOrUrl(mimeType, ext, fileName);
  const bitrateKbps =
    durationSeconds > 0 && sizeBytes > 0
      ? Math.max(32, Math.round((sizeBytes * 8) / durationSeconds / 1000))
      : undefined;

  // Check RIFF/WAVE header (PCM WAV)
  if (
    bytes.length >= 36 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleRateHz = view.getUint32(24, true);
    const bitDepth = view.getUint16(34, true);
    return {
      codec: 'WAV',
      lossless: true,
      sampleRateHz: sampleRateHz > 0 ? sampleRateHz : undefined,
      bitDepth: bitDepth > 0 ? bitDepth : undefined,
      bitrateKbps,
      sourceLabel: 'Local',
    };
  }

  // Check fLaC header + STREAMINFO metadata block (bytes 18..21 contain sampleRate (20 bits), channels (3 bits), bps-1 (5 bits))
  if (
    bytes.length >= 26 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    const sampleRateHz = (bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4);
    const bitDepthMinusOne = ((bytes[20] & 0x01) << 4) | (bytes[21] >> 4);
    const bitDepth = bitDepthMinusOne + 1;
    return {
      codec: 'FLAC',
      lossless: true,
      sampleRateHz: sampleRateHz > 0 ? sampleRateHz : undefined,
      bitDepth: bitDepth >= 8 && bitDepth <= 32 ? bitDepth : undefined,
      bitrateKbps,
      sourceLabel: 'Local',
    };
  }

  const isLosslessExt = ext === 'flac' || ext === 'wav' || ext === 'alac' || ext === 'aiff';
  return {
    codec: ext ? ext.toUpperCase() : codec,
    lossless: isLosslessExt,
    bitrateKbps: isLosslessExt ? bitrateKbps : bitrateKbps,
    sourceLabel: 'Local',
  };
}
