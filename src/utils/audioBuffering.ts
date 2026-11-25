export function configureAudioElementForStreaming(audio: HTMLAudioElement): void {
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
}

export interface WaitCanPlayOptions {
  timeoutMs?: number;
  isCancelled?: () => boolean;
}

/**
 * Waits for an HTMLMediaElement (or compatible EventTarget mock) to reach the
 * `canplay` state (readyState >= 3 / HAVE_FUTURE_DATA) before calling `.play()`,
 * avoiding stream buffer underruns and startup crackling.
 */
export function waitForAudioCanPlay(
  audio: Pick<
    HTMLAudioElement,
    'readyState' | 'addEventListener' | 'removeEventListener'
  >,
  options: WaitCanPlayOptions = {}
): Promise<'ready' | 'error' | 'timeout' | 'cancelled'> {
  const { timeoutMs = 8000, isCancelled } = options;

  if (isCancelled?.()) {
    return Promise.resolve('cancelled');
  }

  // HAVE_FUTURE_DATA (3) or HAVE_ENOUGH_DATA (4): buffered enough to play smoothly
  if (audio.readyState >= 3) {
    return Promise.resolve('ready');
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('canplaythrough', onCanPlay);
      audio.removeEventListener('error', onError);
      if (timerId !== null) clearTimeout(timerId);
      if (pollId !== null) clearInterval(pollId);
    };

    const finish = (outcome: 'ready' | 'error' | 'timeout' | 'cancelled') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };

    const onCanPlay = () => {
      finish(isCancelled?.() ? 'cancelled' : 'ready');
    };

    const onError = () => {
      finish(isCancelled?.() ? 'cancelled' : 'error');
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('canplaythrough', onCanPlay);
    audio.addEventListener('error', onError);

    if (isCancelled) {
      pollId = setInterval(() => {
        if (isCancelled()) {
          finish('cancelled');
        }
      }, 60);
    }

    timerId = setTimeout(() => {
      finish(isCancelled?.() ? 'cancelled' : 'timeout');
    }, timeoutMs);
  });
}
