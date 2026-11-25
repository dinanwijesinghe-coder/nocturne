import type {
  AudioQuality,
  EqSettings,
  PlayEvent,
  Playlist,
  PodcastProgress,
  UserProfile,
} from '../types/audio';
import { AVATAR_LISTENER_NEON } from '../data/seedCatalog';
import { DEFAULT_EQ_SETTINGS } from '../utils/eqPresets';

export interface PersistedAppState {
  profile: UserProfile | null;
  likedTrackIds: string[];
  followedArtistIds: string[];
  followedFriendIds: string[];
  playlists: Playlist[];
  podcastProgress: Record<string, PodcastProgress>;
  playEvents: PlayEvent[];
  recentSearches: string[];
  eqSettings: EqSettings;
  audioQuality: AudioQuality;
  dataSaver: boolean;
  crossfadeSeconds: number;
  playbackSpeed: number;
  autoplaySimilar: boolean;
  lastSyncedAt: number;
}

export interface CloudSyncAdapter {
  readonly providerName: 'local-cloud-fallback' | 'firebase' | 'supabase';
  loadState(): Promise<PersistedAppState>;
  saveState(state: PersistedAppState): Promise<void>;
  subscribe(onExternalUpdate: (state: PersistedAppState) => void): () => void;
}

const STORAGE_KEY = 'nocturne_cloud_state_v2';
const CHANNEL_NAME = 'nocturne_realtime_sync';

const LEGACY_MOCK_IDS = new Set([
  'studio-midnight-prism',
  'studio-velvet-voltage',
  'studio-slate-reverb',
  'studio-subzero-pulse',
  'studio-amethyst-rain',
  'studio-nocturnal-wax',
  'artist-kairo-vale',
  'artist-lyra-morn',
  'artist-sol-tapes',
]);

export function sanitizePersistedState(state: PersistedAppState): PersistedAppState {
  return {
    ...state,
    likedTrackIds: state.likedTrackIds.filter((id) => !LEGACY_MOCK_IDS.has(id) && !id.startsWith('studio-')),
    followedArtistIds: state.followedArtistIds.filter((id) => !LEGACY_MOCK_IDS.has(id)),
    playlists: state.playlists.map((pl) => ({
      ...pl,
      trackIds: pl.trackIds.filter((id) => !LEGACY_MOCK_IDS.has(id) && !id.startsWith('studio-')),
    })),
    playEvents: state.playEvents.filter((ev) => !LEGACY_MOCK_IDS.has(ev.trackId) && !ev.trackId.startsWith('studio-')),
    eqSettings: { ...DEFAULT_EQ_SETTINGS },
  };
}

export function createDefaultProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    username: 'night_listener',
    displayName: 'Alex Mercer',
    bio: 'Streaming live music & podcasts on Nocturne.',
    avatarUrl: AVATAR_LISTENER_NEON,
    isGuest: true,
    followersCount: 0,
    followingCount: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

export const INITIAL_PERSISTED_STATE: PersistedAppState = {
  profile: createDefaultProfile(),
  likedTrackIds: [],
  followedArtistIds: [],
  followedFriendIds: [],
  playlists: [],
  podcastProgress: {},
  playEvents: [],
  recentSearches: [],
  eqSettings: DEFAULT_EQ_SETTINGS,
  audioQuality: 'high',
  dataSaver: false,
  crossfadeSeconds: 4,
  playbackSpeed: 1,
  autoplaySimilar: true,
  lastSyncedAt: Date.now(),
};

/**
 * Cloud-ready state synchronization adapter.
 * Uses localStorage + BroadcastChannel for instant multi-tab & offline collaboration
 * while providing a clean swap-in interface for Firebase Firestore.
 */
class LocalCloudFallbackAdapter implements CloudSyncAdapter {
  readonly providerName = 'local-cloud-fallback' as const;
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
    }
  }

  async loadState(): Promise<PersistedAppState> {
    if (typeof window === 'undefined') return INITIAL_PERSISTED_STATE;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PERSISTED_STATE));
        return INITIAL_PERSISTED_STATE;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
      return sanitizePersistedState({
        ...INITIAL_PERSISTED_STATE,
        ...parsed,
        eqSettings: { ...DEFAULT_EQ_SETTINGS },
      });
    } catch {
      return INITIAL_PERSISTED_STATE;
    }
  }

  async saveState(state: PersistedAppState): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const next = { ...state, lastSyncedAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.channel?.postMessage({ type: 'SYNC_STATE', payload: next });
    } catch {
      // Storage quota exceeded or restricted
    }
  }

  subscribe(onExternalUpdate: (state: PersistedAppState) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          onExternalUpdate(sanitizePersistedState(JSON.parse(ev.newValue)));
        } catch {
          // ignore malformed event
        }
      }
    };

    const handleBroadcast = (ev: MessageEvent) => {
      if (ev.data?.type === 'SYNC_STATE' && ev.data?.payload) {
        onExternalUpdate(sanitizePersistedState(ev.data.payload));
      }
    };

    window.addEventListener('storage', handleStorage);
    this.channel?.addEventListener('message', handleBroadcast);

    return () => {
      window.removeEventListener('storage', handleStorage);
      this.channel?.removeEventListener('message', handleBroadcast);
    };
  }
}

export const cloudSyncAdapter: CloudSyncAdapter = new LocalCloudFallbackAdapter();
