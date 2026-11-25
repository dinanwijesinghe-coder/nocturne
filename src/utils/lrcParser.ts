import type { LyricLine } from '../types/audio';

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parses standard .lrc text (including multi-timestamp lines) into sorted LyricLine entries.
 */
export function parseLrc(rawLrc: string): LyricLine[] {
  if (!rawLrc || typeof rawLrc !== 'string') return [];

  const parsed: LyricLine[] = [];
  const lines = rawLrc.split(/\r?\n/);

  for (const rawLine of lines) {
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    TIMESTAMP_REGEX.lastIndex = 0;

    while ((match = TIMESTAMP_REGEX.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fracStr = match[3] || '0';
      const frac = fracStr.length === 3
        ? parseInt(fracStr, 10) / 1000
        : fracStr.length === 2
          ? parseInt(fracStr, 10) / 100
          : parseInt(fracStr, 10) / 10;

      const totalSeconds = minutes * 60 + seconds + frac;
      if (Number.isFinite(totalSeconds)) {
        timestamps.push(totalSeconds);
      }
    }

    const text = rawLine.replace(TIMESTAMP_REGEX, '').trim();
    if (timestamps.length > 0 && text.length > 0) {
      for (const time of timestamps) {
        parsed.push({ time, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

/**
 * Finds the active lyric line index for the current playback time using binary search.
 */
export function getActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines.length || currentTime < lines[0].time) return -1;

  let low = 0;
  let high = lines.length - 1;
  let active = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= currentTime + 0.05) {
      active = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return active;
}

/**
 * Formats seconds as M:SS or H:MM:SS for tracks and podcasts.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
