const PREVIEW_URL_PATTERN = /itunes\.apple\.com|audiopreview|cdnt-preview\.dzcdn\.net|p\.scdn\.co\/mp3-preview|[?&](?:preview|sample)=1|\bpreview\b/i;

export function isPreviewAudioUrl(url?: string): boolean {
  if (!url) return false;
  return PREVIEW_URL_PATTERN.test(url);
}

export interface PreviewCheckInput {
  url?: string;
  streamDuration?: number;
  payloadDuration?: number;
  expectedDuration?: number;
  isPreview?: boolean;
}

/**
 * Determines whether a candidate audio stream is a ~30-second preview/sample clip
 * so stream selection can avoid previews whenever a full-length track exists.
 */
export function isLikelyPreviewStream(input: PreviewCheckInput): boolean {
  if (input.isPreview === true) return true;
  if (isPreviewAudioUrl(input.url)) return true;

  const candidateDur =
    typeof input.streamDuration === 'number' && input.streamDuration > 0
      ? input.streamDuration
      : typeof input.payloadDuration === 'number' && input.payloadDuration > 0
        ? input.payloadDuration
        : 0;

  if (candidateDur > 0 && candidateDur <= 35) {
    if (!input.expectedDuration || input.expectedDuration > 45) {
      return true;
    }
  }

  return false;
}

export function cleanTrackSearchQuery(
  rawTitle: string,
  rawArtist = ''
): { query: string; cleanTitle: string; cleanArtist: string } {
  const cleanTitle = rawTitle
    .replace(/\((?:official\s*(?:music\s*)?video|lyric\s*video|lyrics|audio|hd|4k|visualizer|feat\.?[^)]*|ft\.?[^)]*)[^)]*\)/gi, '')
    .replace(/\[(?:official|music\s*video|lyrics|audio|hd|4k)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanArtist = rawArtist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    // Separate camelCase words left after stripping VEVO (e.g. "JustinBieber" -> "Justin Bieber")
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query: [cleanTitle, cleanArtist].filter(Boolean).join(' ').slice(0, 120),
    cleanTitle: cleanTitle.slice(0, 90),
    cleanArtist: cleanArtist.slice(0, 60),
  };
}

function tokenizeNormalized(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Scores how well a candidate track matches the requested title, artist, and full-length duration.
 * Returns -Infinity for <45s previews when targeting full-length tracks or unrelated titles.
 */
export function scoreCandidateTrackMatch(input: {
  targetTitle: string;
  targetArtist?: string;
  targetDuration?: number;
  candidateTitle: string;
  candidateArtist?: string;
  candidateDuration?: number;
}): number {
  const dur = Number(input.candidateDuration) || 0;
  if (dur > 0 && dur < 45) {
    return -Infinity;
  }

  const { cleanTitle: tTitleClean, cleanArtist: tArtistClean } = cleanTrackSearchQuery(
    input.targetTitle,
    input.targetArtist || ''
  );
  const { cleanTitle: cTitleClean, cleanArtist: cArtistClean } = cleanTrackSearchQuery(
    input.candidateTitle,
    input.candidateArtist || ''
  );

  const tLower = tTitleClean.toLowerCase();
  const cLower = cTitleClean.toLowerCase();
  if (!tLower || !cLower) return -Infinity;

  const tTokens = tokenizeNormalized(tLower);
  const cTokens = new Set(tokenizeNormalized(cLower));
  if (tTokens.length === 0) return -Infinity;

  const matchedTitleTokens = tTokens.filter((tok) => cTokens.has(tok)).length;
  const titleCoverage = matchedTitleTokens / tTokens.length;

  // Require at least 60% of meaningful title words to match
  if (titleCoverage < 0.6) {
    return -Infinity;
  }

  let score = titleCoverage * 100;
  if (cLower === tLower) score += 60;
  else if (cLower.includes(tLower) || tLower.includes(cLower)) score += 30;

  if (tArtistClean && cArtistClean) {
    const aTokens = tokenizeNormalized(tArtistClean);
    const caText = `${cArtistClean} ${input.candidateTitle}`.toLowerCase();
    const artistHits = aTokens.filter((tok) => caText.includes(tok)).length;
    if (aTokens.length > 0 && artistHits > 0) {
      score += (artistHits / aTokens.length) * 50;
    }
  }

  // Prefer full-length tracks (2–6 minutes) and close duration match if expected duration is known
  if (dur >= 90 && dur <= 420) {
    score += 20;
  }
  if (input.targetDuration && input.targetDuration > 60 && dur > 0) {
    const diffRatio = Math.abs(dur - input.targetDuration) / input.targetDuration;
    if (diffRatio <= 0.35) score += 25;
  }

  return score;
}
