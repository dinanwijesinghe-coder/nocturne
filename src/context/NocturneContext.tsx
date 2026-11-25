import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppTab,
  Artist,
  AudioQuality,
  EqSettings,
  FriendActivity,
  LyricsPayload,
  PlayEvent,
  Playlist,
  PodcastProgress,
  PodcastShow,
  RepeatMode,
  SleepTimerState,
  StreamMetadata,
  ToastMessage,
  Track,
  UserProfile,
  WrappedStats,
} from '../types/audio';
import {
  AVATAR_LISTENER_NEON,
  COVER_ACOUSTIC_NOIR,
  COVER_PODCAST_WAVE,
} from '../data/seedCatalog';
import { fetchLiveHomeFeed } from '../services/musicApi';
import { resolveAudiusPlayableUrl } from '../services/audiusApi';
import { maybeProxyStreamUrl, resolvePipedStream, resolvePipedStreamUrl, searchPipedSongs } from '../services/pipedApi';
import { fetchTrackLyrics } from '../services/lrclibApi';
import {
  deleteLocalFile,
  deleteOfflineTrack,
  getAllLocalFiles,
  getAllOfflineTracks,
  getCustomLyrics,
  getOfflineTrackBlobUrl,
  saveCustomLyrics,
  saveLocalAudioFile,
  saveOfflineTrack,
  type LocalFileRecord,
  type OfflineTrackRecord,
} from '../services/offlineDb';
import {
  cloudSyncAdapter,
  createDefaultProfile,
  INITIAL_PERSISTED_STATE,
  type PersistedAppState,
} from '../services/cloudSync';
import { webAudioEngine, type WebAudioEngine } from '../services/webAudioEngine';
import { EQ_PRESETS } from '../utils/eqPresets';
import { parseLrc } from '../utils/lrcParser';
import {
  calculateCrossfadeGains,
  computeNextIndex,
  computePrevIndex,
  computeWrappedStats,
  findSimilarTracks,
  generateInviteCode,
  reorderQueue,
} from '../utils/queueLogic';
import { configureAudioElementForStreaming, waitForAudioCanPlay } from '../utils/audioBuffering';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signOutFirebase,
  signUpWithEmailPassword,
  testFirestoreConnection,
} from '../services/firebase';
import {
  addTrackToPlaylistInFirestore,
  createPlaylistInFirestore,
  enablePlaylistCollabInFirestore,
  ensureFirebaseUserDoc,
  joinPlaylistByInviteInFirestore,
  removeTrackFromPlaylistInFirestore,
  subscribeToRealtimeUserSync,
  syncFollowedArtistToFirestore,
  syncLikedTrackToFirestore,
  syncUserProfileFields,
} from '../services/firestoreSync';

interface NocturneContextValue {
  // Navigation & Modals
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isNowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  isEqOpen: boolean;
  setEqOpen: (open: boolean) => void;
  isQueueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  isAuthOpen: boolean;
  setAuthOpen: (open: boolean) => void;

  // Catalog & Discovery
  trendingTracks: Track[];
  isLoadingTrending: boolean;
  selectedGenre: string;
  setSelectedGenre: (genre: string) => void;
  isAudiusOnline: boolean;
  artists: Artist[];
  podcastShows: PodcastShow[];
  allKnownTracks: Track[];

  // Playback State
  currentTrack: Track | null;
  activeStreamMeta: StreamMetadata | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  toggleShuffle: () => void;
  repeatMode: RepeatMode;
  cycleRepeatMode: () => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  crossfadeSeconds: number;
  setCrossfadeSeconds: (sec: number) => void;
  autoplaySimilar: boolean;
  setAutoplaySimilar: (enabled: boolean) => void;
  sleepTimer: SleepTimerState;
  setSleepTimerMode: (mode: SleepTimerState['mode']) => void;
  sleepRemainingSeconds: number | null;

  // Playback Actions
  playTrack: (track: Track, newQueue?: Track[], startAtSeconds?: number) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  skipBy: (deltaSeconds: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;

  // Lyrics
  lyrics: LyricsPayload;
  isLoadingLyrics: boolean;
  importCustomLrc: (trackId: string, rawLrc: string) => Promise<void>;

  // EQ & Audio Quality
  eqSettings: EqSettings;
  updateEqSettings: (patch: Partial<EqSettings>) => void;
  applyEqPreset: (presetName: string) => void;
  audioQuality: AudioQuality;
  setAudioQuality: (q: AudioQuality) => void;
  dataSaver: boolean;
  setDataSaver: (enabled: boolean) => void;

  // User, Auth & Social
  profile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, bio?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => void;
  friends: FriendActivity[];
  toggleFollowFriend: (friendId: string) => void;
  followedArtistIds: string[];
  toggleFollowArtist: (artistId: string, artistName?: string) => void;

  // Library, Offline, Local Files & Playlists
  likedTrackIds: string[];
  toggleLikeTrack: (track: Track) => void;
  playlists: Playlist[];
  createPlaylist: (name: string, description: string, isCollaborative: boolean) => Playlist;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  togglePlaylistCollaborative: (playlistId: string) => string;
  joinPlaylistByCode: (code: string) => Promise<boolean>;
  offlineRecords: OfflineTrackRecord[];
  downloadingIds: Set<string>;
  downloadTrackOffline: (track: Track) => Promise<void>;
  removeOfflineTrack: (trackId: string) => Promise<void>;
  localFiles: LocalFileRecord[];
  importLocalAudioFiles: (files: FileList) => Promise<void>;
  removeLocalFile: (trackId: string) => Promise<void>;
  podcastProgress: Record<string, PodcastProgress>;
  recentSearches: string[];
  addRecentSearch: (q: string) => void;

  // Stats & Feedback
  wrappedStats: WrappedStats;
  cloudSyncProvider: string;
  lastSyncedAt: number;
  toasts: ToastMessage[];
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

const NocturneContext = createContext<NocturneContextValue | null>(null);

export function NocturneProvider({ children }: { children: React.ReactNode }) {
  // Navigation & overlays
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [isNowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [isEqOpen, setEqOpen] = useState(false);
  const [isQueueOpen, setQueueOpen] = useState(false);
  const [isAuthOpen, setAuthOpen] = useState(false);

  // Persisted cloud-ready state
  const [persisted, setPersisted] = useState<PersistedAppState>(INITIAL_PERSISTED_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudProvider, setCloudProvider] = useState<string>(cloudSyncAdapter.providerName);
  const persistedRef = useRef<PersistedAppState>(INITIAL_PERSISTED_STATE);
  persistedRef.current = persisted;

  // Live Catalog (no hardcoded fake tracks or artists)
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [isAudiusOnline, setIsAudiusOnline] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [podcastShows, setPodcastShows] = useState<PodcastShow[]>([]);
  const [friends, setFriends] = useState<FriendActivity[]>([]);
  const [trackCache, setTrackCache] = useState<Record<string, Track>>({});

  // Offline & local IndexedDB
  const [offlineRecords, setOfflineRecords] = useState<OfflineTrackRecord[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFileRecord[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  // Playback
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [activeStreamMeta, setActiveStreamMeta] = useState<StreamMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMutedState] = useState(false);
  const volumeRef = useRef(1);
  const isMutedRef = useRef(false);
  const lastNonZeroVolumeRef = useRef(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>({ mode: 'off', endsAt: null });
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);

  // Lyrics
  const [lyrics, setLyrics] = useState<LyricsPayload>({ synced: [], plain: '', source: 'none' });
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Singleton Web Audio engine & dual audio deck refs (never re-created on re-render)
  const audioEngineRef = useRef<WebAudioEngine>(webAudioEngine);
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');
  const crossfadeActiveRef = useRef(false);
  const crossfadeRafRef = useRef<number | null>(null);
  const playRequestSeqRef = useRef(0);
  const playNextRef = useRef<() => void>(() => {});
  const lastLoggedSecondRef = useRef<number>(0);
  const lastSavedPodcastSecRef = useRef<string>('');
  const sleepTimerRef = useRef<SleepTimerState>(sleepTimer);
  sleepTimerRef.current = sleepTimer;

  // Refs synced synchronously so audio listeners never detach/re-attach on re-renders
  const currentTrackRef = useRef<Track | null>(currentTrack);
  currentTrackRef.current = currentTrack;
  const activeStreamMetaRef = useRef<StreamMetadata | null>(activeStreamMeta);
  activeStreamMetaRef.current = activeStreamMeta;
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  repeatModeRef.current = repeatMode;
  const crossfadeSecondsRef = useRef<number>(persisted.crossfadeSeconds);
  crossfadeSecondsRef.current = persisted.crossfadeSeconds;

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Hydrate persisted state & IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [loadedState, offline, locals] = await Promise.all([
        cloudSyncAdapter.loadState(),
        getAllOfflineTracks(),
        getAllLocalFiles(),
      ]);
      if (!mounted) return;
      setPersisted(loadedState);
      setOfflineRecords(offline);
      setLocalFiles(locals);
      setFriends((prev) =>
        prev.map((f) => ({
          ...f,
          isFollowing: loadedState.followedFriendIds.includes(f.id),
        }))
      );
      setTrackCache((prev) => {
        const next = { ...prev };
        offline.forEach((o) => { next[o.track.id] = o.track; });
        locals.forEach((l) => { next[l.track.id] = l.track; });
        return next;
      });
      audioEngineRef.current.applyEqSettings(loadedState.eqSettings);
      setHydrated(true);
    })();

    const unsub = cloudSyncAdapter.subscribe((external) => {
      setPersisted(external);
      audioEngineRef.current.applyEqSettings(external.eqSettings);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Validate Firestore connectivity on boot & attach real-time auth/Firestore listeners
  useEffect(() => {
    void testFirestoreConnection();
    let firestoreUnsub: (() => void) | null = null;
    let active = true;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (firestoreUnsub) {
        firestoreUnsub();
        firestoreUnsub = null;
      }

      if (!active) return;
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setCloudProvider(cloudSyncAdapter.providerName);
        return;
      }

      setCloudProvider('firebase');
      try {
        const remoteProfile = await ensureFirebaseUserDoc(fbUser, persistedRef.current);
        if (!active) return;

        setPersisted((prev) => {
          const next = { ...prev, profile: remoteProfile, lastSyncedAt: Date.now() };
          void cloudSyncAdapter.saveState(next);
          return next;
        });

        firestoreUnsub = subscribeToRealtimeUserSync(fbUser.uid, {
          onUserDocUpdate: (patch) => {
            setPersisted((prev) => {
              const next: PersistedAppState = {
                ...prev,
                profile: patch.profile ?? prev.profile,
                likedTrackIds: patch.likedTrackIds ?? prev.likedTrackIds,
                followedArtistIds: patch.followedArtistIds ?? prev.followedArtistIds,
                followedFriendIds: patch.followedFriendIds ?? prev.followedFriendIds,
                audioQuality: patch.audioQuality ?? prev.audioQuality,
                dataSaver: patch.dataSaver ?? prev.dataSaver,
                crossfadeSeconds: patch.crossfadeSeconds ?? prev.crossfadeSeconds,
                playbackSpeed: patch.playbackSpeed ?? prev.playbackSpeed,
                autoplaySimilar: patch.autoplaySimilar ?? prev.autoplaySimilar,
                recentSearches: patch.recentSearches ?? prev.recentSearches,
                lastSyncedAt: Date.now(),
              };
              void cloudSyncAdapter.saveState(next);
              return next;
            });
          },
          onLikedTracksUpdate: (syncedTracks, syncedIds) => {
            if (syncedTracks.length > 0) {
              setTrackCache((prev) => {
                const next = { ...prev };
                syncedTracks.forEach((t) => { next[t.id] = t; });
                return next;
              });
            }
            if (syncedIds.length > 0) {
              setPersisted((prev) => ({
                ...prev,
                likedTrackIds: Array.from(new Set([...syncedIds, ...prev.likedTrackIds])),
              }));
            }
          },
          onFollowedArtistsUpdate: (syncedArtists, syncedIds) => {
            if (syncedArtists.length > 0) {
              setArtists((prev) => {
                const map = new Map(prev.map((a) => [a.id, a]));
                syncedArtists.forEach((a) => {
                  if (!map.has(a.id)) map.set(a.id, a);
                });
                return Array.from(map.values());
              });
            }
            if (syncedIds.length > 0) {
              setPersisted((prev) => ({
                ...prev,
                followedArtistIds: Array.from(new Set([...syncedIds, ...prev.followedArtistIds])),
              }));
            }
          },
          onPlaylistsUpdate: (remotePlaylists, syncedTracks) => {
            if (syncedTracks.length > 0) {
              setTrackCache((prev) => {
                const next = { ...prev };
                syncedTracks.forEach((t) => { next[t.id] = t; });
                return next;
              });
            }
            setPersisted((prev) => {
              const remoteIds = new Set(remotePlaylists.map((p) => p.id));
              const localOnly = prev.playlists.filter((p) => !remoteIds.has(p.id));
              const merged = [...remotePlaylists, ...localOnly];
              const next = { ...prev, playlists: merged, lastSyncedAt: Date.now() };
              void cloudSyncAdapter.saveState(next);
              return next;
            });
          },
        });
      } catch {
        // Handled cleanly by handleFirestoreError / ErrorBoundary or local fallback
      }
    });

    return () => {
      active = false;
      unsubAuth();
      if (firestoreUnsub) firestoreUnsub();
    };
  }, []);

  // Persist updates cleanly
  const updatePersisted = useCallback((updater: (prev: PersistedAppState) => PersistedAppState) => {
    setPersisted((prev) => {
      const next = updater(prev);
      void cloudSyncAdapter.saveState(next);
      return next;
    });
  }, []);

  // Fetch live Home Trending feed (Primary Piped Music + Secondary Audius)
  useEffect(() => {
    let cancelled = false;
    setIsLoadingTrending(true);
    (async () => {
      const res = await fetchLiveHomeFeed(selectedGenre);
      if (cancelled) return;
      setTrendingTracks(res.tracks);
      setIsAudiusOnline(res.fromNetwork);
      setTrackCache((prev) => {
        const next = { ...prev };
        res.tracks.forEach((t) => { next[t.id] = t; });
        return next;
      });
      if (res.artists.length > 0) {
        setArtists((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]));
          res.artists.forEach((a) => {
            if (!map.has(a.id)) map.set(a.id, a);
          });
          return Array.from(map.values());
        });
      }
      // Populate initial queue & selected track from live API without auto-playing
      if (res.tracks.length > 0 && !currentTrackRef.current) {
        setQueue((prev) => (prev.length === 0 ? res.tracks : prev));
        setCurrentTrack((prev) => prev ?? res.tracks[0]);
        setDuration((prev) => (prev === 0 ? res.tracks[0].duration : prev));
      }
      setIsLoadingTrending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGenre]);

  // Fetch real live podcast episodes via Piped on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [musicProdRes, interviewsRes] = await Promise.all([
        searchPipedSongs('music production sound engineering podcast', undefined, {
          filter: 'videos',
          isPodcast: true,
          limit: 6,
        }),
        searchPipedSongs('songwriting producer interview podcast', undefined, {
          filter: 'videos',
          isPodcast: true,
          limit: 6,
        }),
      ]);
      if (cancelled) return;

      const shows: PodcastShow[] = [];
      if (musicProdRes.tracks.length > 0) {
        shows.push({
          id: 'piped-show-production',
          title: 'Music Production & Sound Engineering',
          host: 'Live Piped Podcast Feed',
          category: 'Music & Audio',
          artworkUrl: musicProdRes.tracks[0].artworkUrl || COVER_PODCAST_WAVE,
          description: 'Real long-form production discussions and studio breakdowns.',
          followersCount: 0,
          episodes: musicProdRes.tracks,
        });
      }
      if (interviewsRes.tracks.length > 0) {
        shows.push({
          id: 'piped-show-interviews',
          title: 'Producer & Songwriter Conversations',
          host: 'Live Piped Podcast Feed',
          category: 'Interviews & Culture',
          artworkUrl: interviewsRes.tracks[0].artworkUrl || COVER_ACOUSTIC_NOIR,
          description: 'In-depth interviews with recording artists, producers, and composers.',
          followersCount: 0,
          episodes: interviewsRes.tracks,
        });
      }

      if (shows.length > 0) {
        setPodcastShows(shows);
        setTrackCache((prev) => {
          const next = { ...prev };
          shows.forEach((s) => s.episodes.forEach((ep) => { next[ep.id] = ep; }));
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Create audio decks once on mount with preload="auto" + crossOrigin="anonymous"
  useEffect(() => {
    const deckA = new Audio();
    const deckB = new Audio();
    configureAudioElementForStreaming(deckA);
    configureAudioElementForStreaming(deckB);
    deckA.volume = volumeRef.current;
    deckB.volume = volumeRef.current;
    deckA.muted = isMutedRef.current;
    deckB.muted = isMutedRef.current;
    deckARef.current = deckA;
    deckBRef.current = deckB;

    return () => {
      deckA.pause();
      deckB.pause();
      deckA.src = '';
      deckB.src = '';
    };
  }, []);

  const getActiveAudio = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  const getInactiveAudio = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);

  // Resolve best playable URL + real codec/bitrate metadata:
  // Offline/Local IndexedDB -> Live Piped/Invidious -> Audius via /api/proxy-audio
  const resolvePlayableSource = useCallback(async (
    track: Track,
    quality: PersistedAppState['audioQuality'],
    dataSaver: boolean
  ): Promise<{ url: string; meta: StreamMetadata | null; isCorsSafe: boolean }> => {
    const offlineUrl = await getOfflineTrackBlobUrl(track.id);
    if (offlineUrl) {
      return {
        url: offlineUrl,
        meta: track.streamMeta || {
          codec: track.source === 'local' ? 'LOCAL' : 'OFFLINE',
          lossless: false,
          sourceLabel: track.source === 'local' ? 'Local' : 'Offline',
        },
        isCorsSafe: true,
      };
    }

    if (track.videoId) {
      const resolved = await resolvePipedStream(track.videoId, quality, dataSaver, {
        title: track.title,
        artist: track.artist,
        duration: track.duration,
      });
      if (resolved?.url) {
        return { url: resolved.url, meta: resolved.meta, isCorsSafe: true };
      }
    }

    if (track.streamUrl) {
      const url = track.source === 'audius'
        ? resolveAudiusPlayableUrl(track.streamUrl)
        : maybeProxyStreamUrl(track.streamUrl);
      return {
        url,
        meta: track.streamMeta || {
          codec: track.source === 'audius' ? 'MP3' : 'AUDIO',
          bitrateKbps: track.source === 'audius' ? 320 : undefined,
          sourceLabel: track.source === 'audius' ? 'Audius' : 'Direct',
          durationSeconds: track.duration,
        },
        isCorsSafe: true,
      };
    }

    console.error('[Nocturne Playback] Failed to resolve any playable stream URL for track:', {
      id: track.id,
      title: track.title,
      artist: track.artist,
      source: track.source,
      videoId: track.videoId,
    });
    return { url: '', meta: null, isCorsSafe: true };
  }, []);

  // Fetch lyrics whenever currentTrack changes
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    setIsLoadingLyrics(true);
    (async () => {
      const customRaw = await getCustomLyrics(currentTrack.id);
      if (cancelled) return;
      if (customRaw) {
        setLyrics({
          synced: parseLrc(customRaw),
          plain: customRaw.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim(),
          source: 'custom',
        });
        setIsLoadingLyrics(false);
        return;
      }
      const fetched = await fetchTrackLyrics(currentTrack);
      if (!cancelled) {
        setLyrics(fetched);
        setIsLoadingLyrics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepTimer.mode === 'off' || sleepTimer.mode === 'end_of_track' || !sleepTimer.endsAt) {
      setSleepRemainingSeconds(null);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((sleepTimer.endsAt! - Date.now()) / 1000));
      setSleepRemainingSeconds(diff);
      if (diff <= 0) {
        getActiveAudio()?.pause();
        setIsPlaying(false);
        setSleepTimer({ mode: 'off', endsAt: null });
        showToast('Sleep timer paused playback', 'info');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sleepTimer, getActiveAudio, showToast]);

  const recordListeningSeconds = useCallback((track: Track, seconds: number) => {
    if (seconds < 3) return;
    const ev: PlayEvent = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre || 'Electronic',
      secondsListened: Math.round(seconds),
      timestamp: Date.now(),
    };
    updatePersisted((prev) => ({
      ...prev,
      playEvents: [...prev.playEvents.slice(-199), ev],
    }));
  }, [updatePersisted]);

  const playTrack = useCallback(async (track: Track, newQueue?: Track[], startAtSeconds?: number) => {
    setTrackCache((prev) => ({ ...prev, [track.id]: track }));

    if (newQueue && newQueue.length > 0) {
      setQueue(newQueue);
      const foundIdx = newQueue.findIndex((t) => t.id === track.id);
      setQueueIndex(foundIdx >= 0 ? foundIdx : 0);
    } else {
      const idxInQueue = queue.findIndex((t) => t.id === track.id);
      if (idxInQueue >= 0) {
        setQueueIndex(idxInQueue);
      } else {
        setQueue((prev) => [track, ...prev]);
        setQueueIndex(0);
      }
    }

    // Log previous listening snippet
    if (currentTrack && lastLoggedSecondRef.current >= 4) {
      recordListeningSeconds(currentTrack, lastLoggedSecondRef.current);
    }
    lastLoggedSecondRef.current = 0;

    if (crossfadeRafRef.current !== null) {
      cancelAnimationFrame(crossfadeRafRef.current);
      crossfadeRafRef.current = null;
    }

    const outgoingAudio = getActiveAudio();
    const useCrossfade = persisted.crossfadeSeconds > 0 && isPlaying && outgoingAudio && !outgoingAudio.paused;

    const incomingDeckKey = useCrossfade ? (activeDeckRef.current === 'A' ? 'B' : 'A') : activeDeckRef.current;
    const incomingAudio = incomingDeckKey === 'A' ? deckARef.current : deckBRef.current;
    const otherAudio = incomingDeckKey === 'A' ? deckBRef.current : deckARef.current;
    if (!incomingAudio) return;

    if (!useCrossfade && otherAudio && !otherAudio.paused) {
      otherAudio.pause();
      otherAudio.currentTime = 0;
    }

    activeDeckRef.current = incomingDeckKey;
    setCurrentTrack(track);
    setActiveStreamMeta(track.streamMeta || null);
    setDuration(track.duration);

    const resumePos = startAtSeconds ?? (track.isPodcast ? persisted.podcastProgress[track.id]?.position ?? 0 : 0);
    const reqId = ++playRequestSeqRef.current;
    const isCancelled = () => playRequestSeqRef.current !== reqId;

    const { url, meta } = await resolvePlayableSource(track, persisted.audioQuality, persisted.dataSaver);
    if (isCancelled()) return;

    if (!url) {
      setIsPlaying(false);
      setActiveStreamMeta(null);
      showToast(`No playable audio stream found for "${track.title}"`, 'error');
      return;
    }

    if (meta) {
      setActiveStreamMeta(meta);
      activeStreamMetaRef.current = meta;
    }

    const baseSource = meta?.sourceLabel || (track.source === 'audius' ? 'Audius' : track.source === 'piped' ? 'Piped' : track.source);
    const sourceDisplay = url.startsWith('/api/proxy-audio') ? `${baseSource} / Proxy` : baseSource;
    console.info('[Nocturne Audio] Selected stream:', {
      track: track.title,
      artist: track.artist,
      url,
      source: sourceDisplay,
      expectedDurationSec: track.duration,
      streamDurationSec: meta?.durationSeconds,
      isPreview: Boolean(meta?.isPreview),
    });

    const targetVol = isMutedRef.current ? 0 : volumeRef.current;
    configureAudioElementForStreaming(incomingAudio);
    incomingAudio.src = url;
    incomingAudio.playbackRate = persisted.playbackSpeed;
    incomingAudio.muted = isMutedRef.current;
    incomingAudio.volume = useCrossfade ? 0 : targetVol;
    incomingAudio.load();

    // Ensure singleton AudioContext, MediaElementAudioSourceNode & BiquadFilterNodes exist once
    audioEngineRef.current.attachElement(incomingAudio);
    audioEngineRef.current.setMasterGain(targetVol, true);
    audioEngineRef.current.resume();

    const safeStart = resumePos > 1 && resumePos < Math.max(track.duration - 2, 2) ? resumePos : 0;
    setCurrentTime(safeStart);

    const readiness = await waitForAudioCanPlay(incomingAudio, {
      timeoutMs: 9000,
      isCancelled,
    });
    if (readiness === 'cancelled' || isCancelled()) return;
    if (readiness === 'error') {
      setIsPlaying(false);
      showToast(`Stream error while loading "${track.title}"`, 'error');
      return;
    }

    if (Number.isFinite(incomingAudio.duration) && incomingAudio.duration > 0) {
      setDuration(incomingAudio.duration);
    }

    try {
      if (safeStart > 0) {
        incomingAudio.currentTime = safeStart;
      }
      await incomingAudio.play();
      if (!isCancelled()) {
        setIsPlaying(true);
        console.info('[Nocturne Audio] Playback started:', {
          track: track.title,
          url: incomingAudio.currentSrc || url,
          source: sourceDisplay,
          audioDuration: Number.isFinite(incomingAudio.duration) ? Number(incomingAudio.duration.toFixed(2)) : null,
        });
      }
    } catch {
      if (!isCancelled()) {
        setIsPlaying(false);
        showToast(`Could not start playback for "${track.title}"`, 'error');
      }
    }
    if (isCancelled()) return;

    if (useCrossfade && outgoingAudio && outgoingAudio !== incomingAudio) {
      const fadeMs = Math.min(persisted.crossfadeSeconds, 12) * 1000;
      const startTs = performance.now();
      const step = () => {
        const elapsed = performance.now() - startTs;
        const progress = Math.min(1, elapsed / fadeMs);
        const [outGain, inGain] = calculateCrossfadeGains(progress);
        const liveVol = isMutedRef.current ? 0 : volumeRef.current;
        outgoingAudio.muted = isMutedRef.current;
        incomingAudio.muted = isMutedRef.current;
        outgoingAudio.volume = Math.max(0, outGain * liveVol);
        incomingAudio.volume = Math.min(1, inGain * liveVol);
        if (progress < 1) {
          crossfadeRafRef.current = requestAnimationFrame(step);
        } else {
          crossfadeRafRef.current = null;
          outgoingAudio.pause();
          outgoingAudio.currentTime = 0;
        }
      };
      crossfadeRafRef.current = requestAnimationFrame(step);
    }
  }, [
    currentTrack,
    getActiveAudio,
    isPlaying,
    persisted.audioQuality,
    persisted.crossfadeSeconds,
    persisted.dataSaver,
    persisted.playbackSpeed,
    persisted.podcastProgress,
    queue,
    recordListeningSeconds,
    resolvePlayableSource,
    showToast,
  ]);

  const playNext = useCallback(() => {
    if (!queue.length) return;
    if (sleepTimerRef.current.mode === 'end_of_track') {
      getActiveAudio()?.pause();
      setIsPlaying(false);
      setSleepTimer({ mode: 'off', endsAt: null });
      showToast('Sleep timer stopped after track ended', 'info');
      return;
    }

    const nextIdx = computeNextIndex(queueIndex, queue.length, repeatMode, shuffle);
    if (nextIdx >= 0) {
      setQueueIndex(nextIdx);
      void playTrack(queue[nextIdx]);
      return;
    }

    if (persisted.autoplaySimilar) {
      const exclude = new Set(queue.map((q) => q.id));
      const pool = trendingTracks;
      const similar = findSimilarTracks(currentTrack, pool, exclude, 3);
      if (similar.length > 0) {
        const extended = [...queue, ...similar];
        setQueue(extended);
        const newIdx = queue.length;
        setQueueIndex(newIdx);
        showToast(`Autoplay: Up next "${similar[0].title}"`, 'info');
        void playTrack(similar[0], extended);
        return;
      }
    }

    setIsPlaying(false);
  }, [
    currentTrack,
    getActiveAudio,
    persisted.autoplaySimilar,
    playTrack,
    queue,
    queueIndex,
    repeatMode,
    showToast,
    shuffle,
    trendingTracks,
  ]);

  playNextRef.current = playNext;

  // Bind audio element listeners strictly ONCE on mount using ref-backed state
  useEffect(() => {
    const bindEvents = (audio: HTMLAudioElement | null, deckName: 'A' | 'B') => {
      if (!audio) return () => {};

      const onTimeUpdate = () => {
        if (activeDeckRef.current !== deckName) return;
        const activeTrack = currentTrackRef.current;
        const ct = audio.currentTime || 0;
        const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (activeTrack?.duration || 0);
        setCurrentTime(ct);
        if (dur > 0) setDuration(dur);
        lastLoggedSecondRef.current = Math.max(lastLoggedSecondRef.current, ct);

        // Save podcast timestamp progress periodically (at most once per 3-second tick)
        const sec = Math.floor(ct);
        const podcastKey = `${activeTrack?.id ?? ''}:${sec}`;
        if (activeTrack?.isPodcast && sec % 3 === 0 && lastSavedPodcastSecRef.current !== podcastKey) {
          lastSavedPodcastSecRef.current = podcastKey;
          updatePersisted((prev) => ({
            ...prev,
            podcastProgress: {
              ...prev.podcastProgress,
              [activeTrack.id]: {
                episodeId: activeTrack.id,
                position: sec,
                duration: Math.max(1, Math.floor(dur)),
                completed: dur > 0 && ct >= dur - 2,
                updatedAt: Date.now(),
              },
            },
          }));
        }

        // Trigger early crossfade near track end if enabled
        const xfadeSec = crossfadeSecondsRef.current;
        if (
          xfadeSec > 0 &&
          dur > xfadeSec + 2 &&
          dur - ct <= xfadeSec &&
          !crossfadeActiveRef.current &&
          repeatModeRef.current !== 'one'
        ) {
          crossfadeActiveRef.current = true;
          playNextRef.current();
          setTimeout(() => { crossfadeActiveRef.current = false; }, 1500);
        }
      };

      const onEnded = () => {
        if (activeDeckRef.current !== deckName) return;
        if (repeatModeRef.current === 'one') {
          audio.currentTime = 0;
          void audio.play();
          return;
        }
        playNextRef.current();
      };

      const syncAudioDuration = () => {
        if (activeDeckRef.current !== deckName) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
          const activeTrack = currentTrackRef.current;
          const activeMeta = activeStreamMetaRef.current;
          const baseSrc = activeMeta?.sourceLabel || activeTrack?.source || 'unknown';
          const srcUrl = audio.currentSrc || audio.src;
          const sourceDesc = srcUrl.includes('/api/proxy-audio') ? `${baseSrc} / Proxy` : baseSrc;
          console.info('[Nocturne Audio] Duration verified:', {
            track: activeTrack?.title,
            url: srcUrl,
            source: sourceDesc,
            'audio.duration': Number(audio.duration.toFixed(2)),
          });
        }
      };

      const onError = () => {
        const activeTrack = currentTrackRef.current;
        if (activeDeckRef.current !== deckName || !activeTrack) return;
        setIsPlaying(false);
      };

      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', syncAudioDuration);
      audio.addEventListener('durationchange', syncAudioDuration);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', syncAudioDuration);
        audio.removeEventListener('durationchange', syncAudioDuration);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
      };
    };

    const unbindA = bindEvents(deckARef.current, 'A');
    const unbindB = bindEvents(deckBRef.current, 'B');
    return () => {
      unbindA();
      unbindB();
    };
  }, [updatePersisted]);

  const togglePlayPause = useCallback(async () => {
    const audio = getActiveAudio();
    if (!audio || !currentTrack) return;

    if (!audio.src) {
      await playTrack(currentTrack);
      return;
    }

    audioEngineRef.current.attachElement(audio);
    audioEngineRef.current.resume();

    if (audio.paused) {
      try {
        if (audio.readyState < 3) {
          await waitForAudioCanPlay(audio, { timeoutMs: 8000 });
        }
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        showToast(`Unable to play "${currentTrack.title}"`, 'error');
      }
    } else {
      if (crossfadeRafRef.current !== null) {
        cancelAnimationFrame(crossfadeRafRef.current);
        crossfadeRafRef.current = null;
      }
      audio.pause();
      const inactive = getInactiveAudio();
      if (inactive && !inactive.paused) {
        inactive.pause();
      }
      setIsPlaying(false);
    }
  }, [currentTrack, getActiveAudio, getInactiveAudio, playTrack, showToast]);

  const seekTo = useCallback((seconds: number) => {
    const audio = getActiveAudio();
    const realDur = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    const clamped = realDur > 0 ? Math.max(0, Math.min(realDur, seconds)) : Math.max(0, seconds);
    setCurrentTime(clamped);
    if (audio && audio.src) {
      audio.currentTime = clamped;
    }
  }, [duration, getActiveAudio]);

  const skipBy = useCallback((deltaSeconds: number) => {
    seekTo(currentTime + deltaSeconds);
  }, [currentTime, seekTo]);

  const playPrevious = useCallback(() => {
    if (currentTime > 3) {
      seekTo(0);
      return;
    }
    if (!queue.length) return;
    const prevIdx = computePrevIndex(queueIndex, queue.length, repeatMode);
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      void playTrack(queue[prevIdx]);
    }
  }, [currentTime, playTrack, queue, queueIndex, repeatMode, seekTo]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
    if (clamped > 0) {
      lastNonZeroVolumeRef.current = clamped;
    }
    const nextMuted = clamped === 0;
    volumeRef.current = clamped;
    isMutedRef.current = nextMuted;
    setVolumeState(clamped);
    setIsMutedState(nextMuted);

    const active = getActiveAudio();
    const inactive = getInactiveAudio();
    if (active) {
      active.muted = nextMuted;
      if (crossfadeRafRef.current === null) {
        active.volume = clamped;
      }
    }
    if (inactive && crossfadeRafRef.current === null) {
      inactive.muted = nextMuted;
      inactive.volume = clamped;
    }
    audioEngineRef.current.setMasterGain(nextMuted ? 0 : clamped);
  }, [getActiveAudio, getInactiveAudio]);

  const setMuted = useCallback((muted: boolean) => {
    if (muted) {
      if (volumeRef.current > 0) {
        lastNonZeroVolumeRef.current = volumeRef.current;
      }
      isMutedRef.current = true;
      setIsMutedState(true);
      const active = getActiveAudio();
      const inactive = getInactiveAudio();
      if (active) active.muted = true;
      if (inactive) inactive.muted = true;
      audioEngineRef.current.setMasterGain(0);
      return;
    }

    const restoredVol = volumeRef.current > 0 ? volumeRef.current : (lastNonZeroVolumeRef.current || 1);
    volumeRef.current = restoredVol;
    isMutedRef.current = false;
    setVolumeState(restoredVol);
    setIsMutedState(false);

    const active = getActiveAudio();
    const inactive = getInactiveAudio();
    if (active) {
      active.muted = false;
      if (crossfadeRafRef.current === null) {
        active.volume = restoredVol;
      }
    }
    if (inactive && crossfadeRafRef.current === null) {
      inactive.muted = false;
      inactive.volume = restoredVol;
    }
    audioEngineRef.current.setMasterGain(restoredVol);
  }, [getActiveAudio, getInactiveAudio]);

  const toggleMute = useCallback(() => {
    setMuted(!isMutedRef.current);
  }, [setMuted]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      showToast(!prev ? 'Shuffle enabled' : 'Shuffle off', 'info');
      return !prev;
    });
  }, [showToast]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      const label = next === 'off' ? 'Repeat off' : next === 'all' ? 'Repeat queue' : 'Repeat one track';
      showToast(label, 'info');
      return next;
    });
  }, [showToast]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, speed));
    const active = getActiveAudio();
    if (active) active.playbackRate = clamped;
    updatePersisted((prev) => ({ ...prev, playbackSpeed: clamped }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, { playbackSpeed: clamped }).catch(() => {});
    }
  }, [firebaseUser, getActiveAudio, updatePersisted]);

  const setCrossfadeSeconds = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(sec)));
    updatePersisted((prev) => ({ ...prev, crossfadeSeconds: clamped }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, { crossfadeSeconds: clamped }).catch(() => {});
    }
  }, [firebaseUser, updatePersisted]);

  const setAutoplaySimilar = useCallback((enabled: boolean) => {
    updatePersisted((prev) => ({ ...prev, autoplaySimilar: enabled }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, { autoplaySimilar: enabled }).catch(() => {});
    }
  }, [firebaseUser, updatePersisted]);

  const setSleepTimerMode = useCallback((mode: SleepTimerState['mode']) => {
    if (mode === 'off') {
      setSleepTimer({ mode: 'off', endsAt: null });
      showToast('Sleep timer cancelled', 'info');
      return;
    }
    if (mode === 'end_of_track') {
      setSleepTimer({ mode: 'end_of_track', endsAt: null });
      showToast('Playback will pause at end of track', 'info');
      return;
    }
    const mins = parseInt(mode, 10);
    setSleepTimer({ mode, endsAt: Date.now() + mins * 60_000 });
    showToast(`Sleep timer set for ${mins} minutes`, 'success');
  }, [showToast]);

  const addToQueue = useCallback((track: Track) => {
    setTrackCache((prev) => ({ ...prev, [track.id]: track }));
    setQueue((prev) => [...prev, track]);
    showToast(`Added "${track.title}" to queue`, 'success');
  }, [showToast]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (index < queueIndex) {
        setQueueIndex((qi) => Math.max(0, qi - 1));
      }
      return next;
    });
  }, [queueIndex]);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      const next = reorderQueue(prev, fromIndex, toIndex);
      if (currentTrack) {
        const newCur = next.findIndex((t) => t.id === currentTrack.id);
        if (newCur >= 0) setQueueIndex(newCur);
      }
      return next;
    });
  }, [currentTrack]);

  const clearQueue = useCallback(() => {
    if (currentTrack) {
      setQueue([currentTrack]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
    showToast('Cleared upcoming queue', 'info');
  }, [currentTrack, showToast]);

  const importCustomLrc = useCallback(async (trackId: string, rawLrc: string) => {
    await saveCustomLyrics(trackId, rawLrc);
    if (currentTrack?.id === trackId) {
      setLyrics({
        synced: parseLrc(rawLrc),
        plain: rawLrc.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim(),
        source: 'custom',
      });
    }
    showToast('Custom synced lyrics imported', 'success');
  }, [currentTrack?.id, showToast]);

  const updateEqSettings = useCallback((patch: Partial<EqSettings>) => {
    updatePersisted((prev) => {
      const nextEq = { ...prev.eqSettings, ...patch };
      audioEngineRef.current.applyEqSettings(nextEq);
      return { ...prev, eqSettings: nextEq };
    });
  }, [updatePersisted]);

  const applyEqPreset = useCallback((presetName: string) => {
    const preset = EQ_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    updateEqSettings({
      enabled: true,
      presetName: preset.name,
      preampDb: preset.preampDb,
      bands: [...preset.bands],
      bassBoost: preset.bassBoost,
      surround3d: preset.surround3d,
    });
    showToast(`Equalizer preset: ${preset.name}`, 'info');
  }, [showToast, updateEqSettings]);

  const setAudioQuality = useCallback((q: AudioQuality) => {
    updatePersisted((prev) => ({ ...prev, audioQuality: q }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, { audioQuality: q }).catch(() => {});
    }
    showToast(`Streaming quality: ${q.toUpperCase()}`, 'info');
  }, [firebaseUser, showToast, updatePersisted]);

  const setDataSaver = useCallback((enabled: boolean) => {
    updatePersisted((prev) => ({
      ...prev,
      dataSaver: enabled,
      audioQuality: enabled ? 'low' : prev.audioQuality,
    }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, {
        dataSaver: enabled,
        ...(enabled ? { audioQuality: 'low' as const } : {}),
      }).catch(() => {});
    }
    showToast(enabled ? 'Data Saver enabled (96kbps + reduced graphics)' : 'Data Saver disabled', 'info');
  }, [firebaseUser, showToast, updatePersisted]);

  // Auth & social (Firebase Email/Password + Google Sign-In + Guest fallback)
  const signIn = useCallback(async (email: string, password: string) => {
    const fbUser = await signInWithEmailPassword(email, password);
    const remoteProfile = await ensureFirebaseUserDoc(fbUser, persistedRef.current);
    updatePersisted((prev) => ({ ...prev, profile: remoteProfile }));
    setAuthOpen(false);
    showToast(`Signed in as ${remoteProfile.displayName}`, 'success');
  }, [showToast, updatePersisted]);

  const signUp = useCallback(async (email: string, password: string, displayName: string, bio?: string) => {
    const fbUser = await signUpWithEmailPassword(email, password, displayName);
    const localWithDraft: PersistedAppState = {
      ...persistedRef.current,
      profile: createDefaultProfile({
        id: fbUser.uid,
        displayName: displayName.trim() || 'Nocturne Listener',
        bio: bio?.trim() || 'Music & podcast explorer on Nocturne.',
        isGuest: false,
      }),
    };
    const remoteProfile = await ensureFirebaseUserDoc(fbUser, localWithDraft);
    updatePersisted((prev) => ({ ...prev, profile: remoteProfile }));
    setAuthOpen(false);
    showToast(`Account created for ${remoteProfile.displayName}`, 'success');
  }, [showToast, updatePersisted]);

  const signInWithGoogle = useCallback(async () => {
    const fbUser = await signInWithGooglePopup();
    const remoteProfile = await ensureFirebaseUserDoc(fbUser, persistedRef.current);
    updatePersisted((prev) => ({ ...prev, profile: remoteProfile }));
    setAuthOpen(false);
    showToast(`Signed in with Google as ${remoteProfile.displayName}`, 'success');
  }, [showToast, updatePersisted]);

  const continueAsGuest = useCallback(() => {
    const profile = createDefaultProfile({
      username: 'guest_session',
      displayName: 'Guest Listener',
      isGuest: true,
    });
    updatePersisted((prev) => ({ ...prev, profile }));
    setAuthOpen(false);
    showToast('Listening in Guest Mode (local persistence active)', 'info');
  }, [showToast, updatePersisted]);

  const signOut = useCallback(async () => {
    if (firebaseUser) {
      try {
        await signOutFirebase();
      } catch {
        // proceed cleanly
      }
    }
    updatePersisted((prev) => ({ ...prev, profile: null }));
    setAuthOpen(true);
    showToast('Signed out', 'info');
  }, [firebaseUser, showToast, updatePersisted]);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    updatePersisted((prev) => ({
      ...prev,
      profile: prev.profile ? { ...prev.profile, ...patch } : createDefaultProfile(patch),
    }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, {
        displayName: patch.displayName,
        bio: patch.bio,
        username: patch.username,
        avatarUrl: patch.avatarUrl,
      }).catch(() => {});
    }
    showToast('Profile saved', 'success');
  }, [firebaseUser, showToast, updatePersisted]);

  const toggleFollowFriend = useCallback((friendId: string) => {
    const isCurrentlyFollowing = persisted.followedFriendIds.includes(friendId);
    const nextFollowed = isCurrentlyFollowing
      ? persisted.followedFriendIds.filter((id) => id !== friendId)
      : [...persisted.followedFriendIds, friendId];

    setFriends((prev) =>
      prev.map((f) =>
        f.id === friendId
          ? {
              ...f,
              isFollowing: !isCurrentlyFollowing,
              followersCount: Math.max(0, f.followersCount + (isCurrentlyFollowing ? -1 : 1)),
            }
          : f
      )
    );
    updatePersisted((prev) => ({
      ...prev,
      followedFriendIds: nextFollowed,
      profile: prev.profile
        ? {
            ...prev.profile,
            followingCount: Math.max(0, prev.profile.followingCount + (isCurrentlyFollowing ? -1 : 1)),
          }
        : prev.profile,
    }));
    if (firebaseUser) {
      void syncUserProfileFields(firebaseUser.uid, {
        followedFriendIds: nextFollowed,
        followingCount: Math.max(
          0,
          (persisted.profile?.followingCount ?? 0) + (isCurrentlyFollowing ? -1 : 1)
        ),
      }).catch(() => {});
    }
  }, [firebaseUser, persisted.followedFriendIds, persisted.profile?.followingCount, updatePersisted]);

  const toggleFollowArtist = useCallback((artistId: string, artistName?: string) => {
    const isFollowing = persisted.followedArtistIds.includes(artistId);
    const targetArtist = artists.find((a) => a.id === artistId) || {
      id: artistId,
      name: artistName || 'Artist',
      handle: `@${(artistName || 'artist').toLowerCase().replace(/\s+/g, '')}`,
      avatarUrl: COVER_ACOUSTIC_NOIR,
      bio: 'Artist on Nocturne',
      followersCount: 1,
    };

    setArtists((prev) =>
      prev.map((a) =>
        a.id === artistId
          ? { ...a, followersCount: Math.max(0, a.followersCount + (isFollowing ? -1 : 1)) }
          : a
      )
    );
    updatePersisted((prev) => {
      const next = isFollowing
        ? prev.followedArtistIds.filter((id) => id !== artistId)
        : [...prev.followedArtistIds, artistId];
      return {
        ...prev,
        followedArtistIds: next,
        profile: prev.profile
          ? {
              ...prev.profile,
              followingCount: Math.max(0, prev.profile.followingCount + (isFollowing ? -1 : 1)),
            }
          : prev.profile,
      };
    });
    if (firebaseUser) {
      void syncFollowedArtistToFirestore(firebaseUser.uid, targetArtist, !isFollowing).catch(() => {});
    }
    showToast(
      isFollowing
        ? `Unfollowed ${artistName || 'artist'}`
        : `Following ${artistName || 'artist'}`,
      'info'
    );
  }, [artists, firebaseUser, persisted.followedArtistIds, showToast, updatePersisted]);

  // Library, Likes, Playlists & Offline
  const toggleLikeTrack = useCallback((track: Track) => {
    setTrackCache((prev) => ({ ...prev, [track.id]: track }));
    const isLiked = persisted.likedTrackIds.includes(track.id);
    updatePersisted((prev) => ({
      ...prev,
      likedTrackIds: isLiked
        ? prev.likedTrackIds.filter((id) => id !== track.id)
        : [track.id, ...prev.likedTrackIds],
    }));
    if (firebaseUser) {
      void syncLikedTrackToFirestore(firebaseUser.uid, track, !isLiked).catch(() => {});
    }
    showToast(isLiked ? 'Removed from Liked Songs' : 'Saved to Liked Songs', 'success');
  }, [firebaseUser, persisted.likedTrackIds, showToast, updatePersisted]);

  const createPlaylist = useCallback((name: string, description: string, isCollaborative: boolean): Playlist => {
    const cleanName = name.trim() || 'Untitled Mix';
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: cleanName,
      description: description.trim() || 'Custom Nocturne playlist',
      coverUrl: currentTrack?.artworkUrl || COVER_ACOUSTIC_NOIR,
      ownerId: firebaseUser?.uid || persisted.profile?.id || 'user-local',
      ownerName: persisted.profile?.displayName || 'You',
      trackIds: [],
      isCollaborative,
      inviteCode: isCollaborative ? generateInviteCode(cleanName) : undefined,
      collaborators: isCollaborative ? [persisted.profile?.displayName || 'You'] : [],
      updatedAt: Date.now(),
    };
    updatePersisted((prev) => ({
      ...prev,
      playlists: [newPl, ...prev.playlists],
    }));
    if (firebaseUser) {
      void createPlaylistInFirestore(firebaseUser.uid, newPl, []).catch(() => {});
    }
    showToast(`Created playlist "${cleanName}"`, 'success');
    return newPl;
  }, [currentTrack?.artworkUrl, firebaseUser, persisted.profile, showToast, updatePersisted]);

  const addTrackToPlaylist = useCallback((playlistId: string, track: Track) => {
    setTrackCache((prev) => ({ ...prev, [track.id]: track }));
    updatePersisted((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id === playlistId && !pl.trackIds.includes(track.id)
          ? { ...pl, trackIds: [...pl.trackIds, track.id], updatedAt: Date.now() }
          : pl
      ),
    }));
    if (firebaseUser) {
      void addTrackToPlaylistInFirestore(firebaseUser.uid, playlistId, track).catch(() => {});
    }
    showToast(`Added "${track.title}" to playlist`, 'success');
  }, [firebaseUser, showToast, updatePersisted]);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    updatePersisted((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id === playlistId
          ? { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() }
          : pl
      ),
    }));
    if (firebaseUser) {
      void removeTrackFromPlaylistInFirestore(playlistId, trackId).catch(() => {});
    }
  }, [firebaseUser, updatePersisted]);

  const togglePlaylistCollaborative = useCallback((playlistId: string): string => {
    let generatedCode = '';
    updatePersisted((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const nextCollab = !pl.isCollaborative;
        const code = pl.inviteCode || generateInviteCode(pl.name);
        generatedCode = code;
        return {
          ...pl,
          isCollaborative: nextCollab,
          inviteCode: nextCollab ? code : pl.inviteCode,
          updatedAt: Date.now(),
        };
      }),
    }));
    if (firebaseUser && generatedCode) {
      void enablePlaylistCollabInFirestore(firebaseUser.uid, playlistId, generatedCode).catch(() => {});
    }
    showToast(generatedCode ? `Collaborative invite code: ${generatedCode}` : 'Collaborative mode updated', 'success');
    return generatedCode;
  }, [firebaseUser, showToast, updatePersisted]);

  const joinPlaylistByCode = useCallback(async (rawCode: string): Promise<boolean> => {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      showToast('Enter a valid collaborative invite code', 'error');
      return false;
    }

    const joinerName = persisted.profile?.displayName || 'Listener';

    if (firebaseUser) {
      try {
        const joinedRemote = await joinPlaylistByInviteInFirestore(firebaseUser.uid, joinerName, code);
        if (joinedRemote) {
          updatePersisted((prev) => {
            const exists = prev.playlists.some((p) => p.id === joinedRemote.id);
            return {
              ...prev,
              playlists: exists
                ? prev.playlists.map((p) => (p.id === joinedRemote.id ? joinedRemote : p))
                : [joinedRemote, ...prev.playlists],
            };
          });
          showToast(`Synced & joined collaborative playlist "${joinedRemote.name}"`, 'success');
          return true;
        }
      } catch {
        // Fall through to local/seed code check below
      }
    }

    const existing = persisted.playlists.find((pl) => pl.inviteCode?.toUpperCase() === code);
    if (existing) {
      updatePersisted((prev) => ({
        ...prev,
        playlists: prev.playlists.map((pl) =>
          pl.id === existing.id
            ? {
                ...pl,
                isCollaborative: true,
                collaborators: pl.collaborators.includes(joinerName)
                  ? pl.collaborators
                  : [...pl.collaborators, joinerName],
                updatedAt: Date.now(),
              }
            : pl
        ),
      }));
      showToast(`Joined collaborative playlist "${existing.name}"`, 'success');
      return true;
    }

    const sharedPl: Playlist = {
      id: `pl-collab-${code}`,
      name: `Shared Session (${code})`,
      description: 'Joined via collaborative invite link. Anyone with this code can add or remove tracks.',
      coverUrl: AVATAR_LISTENER_NEON,
      ownerId: firebaseUser?.uid || 'collab-session',
      ownerName: 'Collaborative Host',
      trackIds: [],
      isCollaborative: true,
      inviteCode: code,
      collaborators: ['Host', joinerName],
      updatedAt: Date.now(),
    };
    updatePersisted((prev) => ({
      ...prev,
      playlists: [sharedPl, ...prev.playlists],
    }));
    if (firebaseUser) {
      void createPlaylistInFirestore(firebaseUser.uid, sharedPl, []).catch(() => {});
    }
    showToast(`Joined collaborative session ${code}`, 'success');
    return true;
  }, [firebaseUser, persisted.playlists, persisted.profile?.displayName, showToast, updatePersisted]);

  const downloadTrackOffline = useCallback(async (track: Track) => {
    setTrackCache((prev) => ({ ...prev, [track.id]: track }));
    setDownloadingIds((prev) => new Set(prev).add(track.id));
    try {
      const resolvedUrl = track.videoId
        ? (await resolvePipedStreamUrl(track.videoId, persisted.audioQuality, persisted.dataSaver, {
            title: track.title,
            artist: track.artist,
            duration: track.duration,
          })) || track.streamUrl
        : track.streamUrl;
      const rec = await saveOfflineTrack(track, resolvedUrl);
      setOfflineRecords((prev) => {
        const filtered = prev.filter((item) => item.id !== rec.id);
        return [rec, ...filtered];
      });
      showToast(`Downloaded "${track.title}" for offline playback`, 'success');
    } catch (err) {
      console.error('[Offline Download] Failed for track:', track.id, err);
      showToast('Failed to save offline download', 'error');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  }, [persisted.audioQuality, persisted.dataSaver, showToast]);

  const removeOfflineTrack = useCallback(async (trackId: string) => {
    await deleteOfflineTrack(trackId);
    setOfflineRecords((prev) => prev.filter((r) => r.id !== trackId));
    showToast('Removed offline download', 'info');
  }, [showToast]);

  const importLocalAudioFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    let count = 0;
    for (const file of fileArray) {
      try {
        const rec = await saveLocalAudioFile(file, COVER_ACOUSTIC_NOIR);
        setLocalFiles((prev) => [rec, ...prev]);
        setTrackCache((prev) => ({ ...prev, [rec.track.id]: rec.track }));
        count += 1;
      } catch {
        // skip unsupported file
      }
    }
    if (count > 0) {
      showToast(`Imported ${count} local audio ${count === 1 ? 'file' : 'files'}`, 'success');
    }
  }, [showToast]);

  const removeLocalFile = useCallback(async (trackId: string) => {
    await deleteLocalFile(trackId);
    setLocalFiles((prev) => prev.filter((f) => f.id !== trackId));
    showToast('Removed local audio file', 'info');
  }, [showToast]);

  const addRecentSearch = useCallback((q: string) => {
    const clean = q.trim();
    if (!clean) return;
    updatePersisted((prev) => {
      const nextSearches = [
        clean,
        ...prev.recentSearches.filter((x) => x.toLowerCase() !== clean.toLowerCase()),
      ].slice(0, 6);
      if (firebaseUser) {
        void syncUserProfileFields(firebaseUser.uid, { recentSearches: nextSearches }).catch(() => {});
      }
      return {
        ...prev,
        recentSearches: nextSearches,
      };
    });
  }, [firebaseUser, updatePersisted]);

  const allKnownTracks = useMemo(() => {
    return Object.values(trackCache);
  }, [trackCache]);

  const wrappedStats = useMemo(() => {
    return computeWrappedStats(persisted.playEvents);
  }, [persisted.playEvents]);

  const value: NocturneContextValue = {
    activeTab,
    setActiveTab,
    isNowPlayingOpen,
    setNowPlayingOpen,
    isEqOpen,
    setEqOpen,
    isQueueOpen,
    setQueueOpen,
    isAuthOpen,
    setAuthOpen,
    trendingTracks,
    isLoadingTrending,
    selectedGenre,
    setSelectedGenre,
    isAudiusOnline,
    artists,
    podcastShows,
    allKnownTracks,
    currentTrack,
    activeStreamMeta,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    setMuted,
    queue,
    queueIndex,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeatMode,
    playbackSpeed: persisted.playbackSpeed,
    setPlaybackSpeed,
    crossfadeSeconds: persisted.crossfadeSeconds,
    setCrossfadeSeconds,
    autoplaySimilar: persisted.autoplaySimilar,
    setAutoplaySimilar,
    sleepTimer,
    setSleepTimerMode,
    sleepRemainingSeconds,
    playTrack,
    togglePlayPause,
    seekTo,
    skipBy,
    playNext,
    playPrevious,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    clearQueue,
    lyrics,
    isLoadingLyrics,
    importCustomLrc,
    eqSettings: persisted.eqSettings,
    updateEqSettings,
    applyEqPreset,
    audioQuality: persisted.audioQuality,
    setAudioQuality,
    dataSaver: persisted.dataSaver,
    setDataSaver,
    profile: hydrated ? persisted.profile : INITIAL_PERSISTED_STATE.profile,
    signIn,
    signUp,
    signInWithGoogle,
    continueAsGuest,
    signOut,
    updateProfile,
    friends,
    toggleFollowFriend,
    followedArtistIds: persisted.followedArtistIds,
    toggleFollowArtist,
    likedTrackIds: persisted.likedTrackIds,
    toggleLikeTrack,
    playlists: persisted.playlists,
    createPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    togglePlaylistCollaborative,
    joinPlaylistByCode,
    offlineRecords,
    downloadingIds,
    downloadTrackOffline,
    removeOfflineTrack,
    localFiles,
    importLocalAudioFiles,
    removeLocalFile,
    podcastProgress: persisted.podcastProgress,
    recentSearches: persisted.recentSearches,
    addRecentSearch,
    wrappedStats,
    cloudSyncProvider: cloudProvider,
    lastSyncedAt: persisted.lastSyncedAt,
    toasts,
    showToast,
    dismissToast,
  };

  return <NocturneContext.Provider value={value}>{children}</NocturneContext.Provider>;
}

export function useNocturne(): NocturneContextValue {
  const ctx = useContext(NocturneContext);
  if (!ctx) throw new Error('useNocturne must be used inside NocturneProvider');
  return ctx;
}
