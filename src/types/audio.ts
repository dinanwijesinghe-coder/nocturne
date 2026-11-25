export type AudioQuality = 'low' | 'normal' | 'high' | 'lossless';

export type RepeatMode = 'off' | 'all' | 'one';

export type AppTab = 'home' | 'search' | 'library' | 'podcasts' | 'profile';

export interface Artist {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bio: string;
  followersCount: number;
  verified?: boolean;
}

export interface StreamMetadata {
  codec: string;
  bitrateKbps?: number;
  lossless?: boolean;
  sampleRateHz?: number;
  bitDepth?: number;
  sourceLabel?: string;
  durationSeconds?: number;
  isPreview?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album?: string;
  genre: string;
  duration: number; // seconds
  artworkUrl: string;
  artworkThumbUrl?: string;
  streamUrl: string;
  source: 'piped' | 'audius' | 'local' | 'podcast';
  videoId?: string;
  streamMeta?: StreamMetadata;
  playCount?: number;
  artistVerified?: boolean;
  isPodcast?: boolean;
  showId?: string;
  showTitle?: string;
  description?: string;
  bpm?: number;
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsPayload {
  synced: LyricLine[];
  plain: string;
  source: 'lrclib' | 'custom' | 'embedded' | 'none';
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  ownerId: string;
  ownerName: string;
  trackIds: string[];
  isCollaborative: boolean;
  inviteCode?: string;
  collaborators: string[];
  updatedAt: number;
}

export interface PodcastShow {
  id: string;
  title: string;
  host: string;
  category: string;
  artworkUrl: string;
  description: string;
  followersCount: number;
  episodes: Track[];
}

export interface PodcastProgress {
  episodeId: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  isGuest: boolean;
  followersCount: number;
  followingCount: number;
  createdAt: number;
}

export interface FriendActivity {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  trackId: string;
  trackTitle: string;
  artistName: string;
  artworkUrl: string;
  minutesAgo: number;
  isFollowing: boolean;
  followersCount: number;
}

export interface EqSettings {
  enabled: boolean;
  presetName: string;
  preampDb: number; // -12 to +12
  bands: number[]; // 10 bands in dB (-12 to +12)
  bassBoost: boolean;
  surround3d: boolean;
}

export interface PlayEvent {
  trackId: string;
  title: string;
  artist: string;
  genre: string;
  secondsListened: number;
  timestamp: number;
}

export interface WrappedStats {
  totalMinutes: number;
  totalPlays: number;
  topSongs: Array<{ trackId: string; title: string; artist: string; plays: number; minutes: number }>;
  topArtists: Array<{ artist: string; plays: number; minutes: number }>;
  topGenres: Array<{ genre: string; minutes: number; percentage: number }>;
}

export interface SleepTimerState {
  mode: 'off' | '15m' | '30m' | '45m' | '60m' | 'end_of_track';
  endsAt: number | null;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}
