import type { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Artist, Playlist, Track, UserProfile } from '../types/audio';
import { AVATAR_LISTENER_NEON, COVER_MIDNIGHT_SYNTH } from '../data/seedCatalog';
import { db, handleFirestoreError, OperationType, toFirestoreSafeId } from './firebase';
import type { PersistedAppState } from './cloudSync';

export interface RealtimeSyncCallbacks {
  onUserDocUpdate: (patch: Partial<PersistedAppState>) => void;
  onLikedTracksUpdate: (tracks: Track[], likedIds: string[]) => void;
  onFollowedArtistsUpdate: (artists: Artist[], followedIds: string[]) => void;
  onPlaylistsUpdate: (playlists: Playlist[], syncedTracks: Track[]) => void;
}

function clampStr(val: string | undefined, max: number, fallback = ''): string {
  const clean = (val ?? fallback).trim();
  return clean.slice(0, max);
}

function sanitizeStringArray(arr: string[] | undefined, maxItems: number, maxLen = 128): string[] {
  if (!Array.isArray(arr)) return [];
  const deduped = Array.from(new Set(arr.filter((v) => typeof v === 'string' && v.length > 0)));
  return deduped.slice(0, maxItems).map((s) => s.slice(0, maxLen));
}

function deriveUsername(user: User): string {
  const base =
    user.displayName?.toLowerCase().replace(/[^a-z0-9_]/g, '_') ||
    user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '_') ||
    `listener_${user.uid.slice(0, 6)}`;
  return base.slice(0, 40) || 'listener';
}

export async function ensureFirebaseUserDoc(
  user: User,
  localState: PersistedAppState
): Promise<UserProfile> {
  const uid = toFirestoreSafeId(user.uid);
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    const fallbackDisplay = clampStr(user.displayName || user.email?.split('@')[0], 60, 'Nocturne Listener');
    const fallbackUsername = deriveUsername(user);
    const fallbackAvatar = clampStr(user.photoURL || localState.profile?.avatarUrl, 500, AVATAR_LISTENER_NEON);

    if (!snap.exists()) {
      const payload = {
        uid,
        username: fallbackUsername,
        displayName: fallbackDisplay,
        bio: clampStr(localState.profile?.bio, 240, 'Streaming live with Nocturne Cloud Sync.'),
        avatarUrl: fallbackAvatar,
        followersCount: Math.max(0, localState.profile?.followersCount ?? 0),
        followingCount: Math.max(0, localState.followedArtistIds.length),
        likedTrackIds: sanitizeStringArray(localState.likedTrackIds, 200),
        followedArtistIds: sanitizeStringArray(localState.followedArtistIds, 200),
        followedFriendIds: sanitizeStringArray(localState.followedFriendIds, 100),
        audioQuality: localState.audioQuality,
        dataSaver: Boolean(localState.dataSaver),
        crossfadeSeconds: Math.max(0, Math.min(12, Math.round(localState.crossfadeSeconds))),
        playbackSpeed: Math.max(0.5, Math.min(2.0, localState.playbackSpeed)),
        autoplaySimilar: Boolean(localState.autoplaySimilar),
        recentSearches: sanitizeStringArray(localState.recentSearches, 20, 80),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(userRef, payload);

      return {
        id: uid,
        username: payload.username,
        displayName: payload.displayName,
        bio: payload.bio,
        avatarUrl: payload.avatarUrl,
        isGuest: false,
        followersCount: payload.followersCount,
        followingCount: payload.followingCount,
        createdAt: Date.now(),
      };
    }

    const data = snap.data();
    return {
      id: uid,
      username: typeof data.username === 'string' ? data.username : fallbackUsername,
      displayName: typeof data.displayName === 'string' ? data.displayName : fallbackDisplay,
      bio: typeof data.bio === 'string' ? data.bio : '',
      avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : fallbackAvatar,
      isGuest: false,
      followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
      followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
      createdAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncUserProfileFields(
  uidRaw: string,
  patch: Partial<{
    username: string;
    displayName: string;
    bio: string;
    avatarUrl: string;
    followersCount: number;
    followingCount: number;
    likedTrackIds: string[];
    followedArtistIds: string[];
    followedFriendIds: string[];
    audioQuality: PersistedAppState['audioQuality'];
    dataSaver: boolean;
    crossfadeSeconds: number;
    playbackSpeed: number;
    autoplaySimilar: boolean;
    recentSearches: string[];
  }>
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const path = `users/${uid}`;
  const cleanPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (patch.username !== undefined) cleanPatch.username = clampStr(patch.username, 40, 'listener');
  if (patch.displayName !== undefined) cleanPatch.displayName = clampStr(patch.displayName, 60, 'Listener');
  if (patch.bio !== undefined) cleanPatch.bio = clampStr(patch.bio, 240, '');
  if (patch.avatarUrl !== undefined) cleanPatch.avatarUrl = clampStr(patch.avatarUrl, 500, AVATAR_LISTENER_NEON);
  if (patch.followersCount !== undefined) cleanPatch.followersCount = Math.max(0, patch.followersCount);
  if (patch.followingCount !== undefined) cleanPatch.followingCount = Math.max(0, patch.followingCount);
  if (patch.likedTrackIds !== undefined) cleanPatch.likedTrackIds = sanitizeStringArray(patch.likedTrackIds, 200);
  if (patch.followedArtistIds !== undefined) cleanPatch.followedArtistIds = sanitizeStringArray(patch.followedArtistIds, 200);
  if (patch.followedFriendIds !== undefined) cleanPatch.followedFriendIds = sanitizeStringArray(patch.followedFriendIds, 100);
  if (patch.audioQuality !== undefined) cleanPatch.audioQuality = patch.audioQuality;
  if (patch.dataSaver !== undefined) cleanPatch.dataSaver = Boolean(patch.dataSaver);
  if (patch.crossfadeSeconds !== undefined) {
    cleanPatch.crossfadeSeconds = Math.max(0, Math.min(12, Math.round(patch.crossfadeSeconds)));
  }
  if (patch.playbackSpeed !== undefined) {
    cleanPatch.playbackSpeed = Math.max(0.5, Math.min(2.0, patch.playbackSpeed));
  }
  if (patch.autoplaySimilar !== undefined) cleanPatch.autoplaySimilar = Boolean(patch.autoplaySimilar);
  if (patch.recentSearches !== undefined) {
    cleanPatch.recentSearches = sanitizeStringArray(patch.recentSearches, 20, 80);
  }

  try {
    await updateDoc(doc(db, 'users', uid), cleanPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncLikedTrackToFirestore(
  uidRaw: string,
  track: Track,
  isLiked: boolean
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const trackId = toFirestoreSafeId(track.id);
  const docPath = `users/${uid}/likedTracks/${trackId}`;
  const docRef = doc(db, 'users', uid, 'likedTracks', trackId);
  const userRef = doc(db, 'users', uid);

  try {
    if (isLiked) {
      await setDoc(docRef, {
        trackId,
        ownerUid: uid,
        title: clampStr(track.title, 200, 'Untitled Track'),
        artist: clampStr(track.artist, 160, 'Unknown Artist'),
        artistId: clampStr(track.artistId, 128, 'unknown'),
        genre: clampStr(track.genre, 80, 'Electronic'),
        duration: Math.max(0, Math.min(86400, Number(track.duration) || 0)),
        artworkUrl: clampStr(track.artworkUrl, 600, COVER_MIDNIGHT_SYNTH),
        streamUrl: track.source === 'local' ? '' : clampStr(track.streamUrl, 800, ''),
        source: track.source,
        createdAt: serverTimestamp(),
      });
      await updateDoc(userRef, {
        likedTrackIds: arrayUnion(trackId),
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(docRef);
      await updateDoc(userRef, {
        likedTrackIds: arrayRemove(trackId),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function syncFollowedArtistToFirestore(
  uidRaw: string,
  artist: Artist,
  isFollowing: boolean
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const artistId = toFirestoreSafeId(artist.id);
  const docPath = `users/${uid}/followedArtists/${artistId}`;
  const docRef = doc(db, 'users', uid, 'followedArtists', artistId);
  const userRef = doc(db, 'users', uid);

  try {
    if (isFollowing) {
      await setDoc(docRef, {
        artistId,
        ownerUid: uid,
        name: clampStr(artist.name, 160, 'Independent Artist'),
        handle: clampStr(artist.handle, 80, '@artist'),
        avatarUrl: clampStr(artist.avatarUrl, 600, COVER_MIDNIGHT_SYNTH),
        followersCount: Math.max(0, Number(artist.followersCount) || 0),
        createdAt: serverTimestamp(),
      });
      await updateDoc(userRef, {
        followedArtistIds: arrayUnion(artistId),
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(docRef);
      await updateDoc(userRef, {
        followedArtistIds: arrayRemove(artistId),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function createPlaylistInFirestore(
  uidRaw: string,
  playlist: Playlist,
  seedTracks: Track[] = []
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const playlistId = toFirestoreSafeId(playlist.id);
  const path = `playlists/${playlistId}`;

  try {
    await setDoc(doc(db, 'playlists', playlistId), {
      id: playlistId,
      name: clampStr(playlist.name, 100, 'Untitled Mix'),
      description: clampStr(playlist.description, 300, ''),
      coverUrl: clampStr(playlist.coverUrl, 600, COVER_MIDNIGHT_SYNTH),
      ownerUid: uid,
      ownerName: clampStr(playlist.ownerName, 80, 'Listener'),
      isCollaborative: Boolean(playlist.isCollaborative),
      inviteCode: clampStr(playlist.inviteCode, 24, ''),
      memberUids: [uid],
      collaboratorNames: sanitizeStringArray(playlist.collaborators, 50, 80),
      trackIds: sanitizeStringArray(playlist.trackIds.map(toFirestoreSafeId), 150),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (playlist.isCollaborative && playlist.inviteCode) {
      const code = toFirestoreSafeId(playlist.inviteCode.toUpperCase());
      await setDoc(doc(db, 'playlistInvites', code), {
        inviteCode: code,
        playlistId,
        ownerUid: uid,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    }

    for (const track of seedTracks.slice(0, 25)) {
      const safeTrackId = toFirestoreSafeId(track.id);
      await setDoc(doc(db, 'playlists', playlistId, 'items', safeTrackId), {
        trackId: safeTrackId,
        title: clampStr(track.title, 200, 'Untitled Track'),
        artist: clampStr(track.artist, 160, 'Unknown Artist'),
        artistId: clampStr(track.artistId, 128, 'unknown'),
        genre: clampStr(track.genre, 80, 'Electronic'),
        duration: Math.max(0, Math.min(86400, Number(track.duration) || 0)),
        artworkUrl: clampStr(track.artworkUrl, 600, COVER_MIDNIGHT_SYNTH),
        streamUrl: track.source === 'local' ? '' : clampStr(track.streamUrl, 800, ''),
        source: track.source,
        addedByUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addTrackToPlaylistInFirestore(
  uidRaw: string,
  playlistIdRaw: string,
  track: Track
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const playlistId = toFirestoreSafeId(playlistIdRaw);
  const trackId = toFirestoreSafeId(track.id);
  const itemPath = `playlists/${playlistId}/items/${trackId}`;

  try {
    await setDoc(doc(db, 'playlists', playlistId, 'items', trackId), {
      trackId,
      title: clampStr(track.title, 200, 'Untitled Track'),
      artist: clampStr(track.artist, 160, 'Unknown Artist'),
      artistId: clampStr(track.artistId, 128, 'unknown'),
      genre: clampStr(track.genre, 80, 'Electronic'),
      duration: Math.max(0, Math.min(86400, Number(track.duration) || 0)),
      artworkUrl: clampStr(track.artworkUrl, 600, COVER_MIDNIGHT_SYNTH),
      streamUrl: track.source === 'local' ? '' : clampStr(track.streamUrl, 800, ''),
      source: track.source,
      addedByUid: uid,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'playlists', playlistId), {
      trackIds: arrayUnion(trackId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, itemPath);
  }
}

export async function removeTrackFromPlaylistInFirestore(
  playlistIdRaw: string,
  trackIdRaw: string
): Promise<void> {
  const playlistId = toFirestoreSafeId(playlistIdRaw);
  const trackId = toFirestoreSafeId(trackIdRaw);
  const itemPath = `playlists/${playlistId}/items/${trackId}`;

  try {
    await updateDoc(doc(db, 'playlists', playlistId), {
      trackIds: arrayRemove(trackId),
      updatedAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, 'playlists', playlistId, 'items', trackId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, itemPath);
  }
}

export async function enablePlaylistCollabInFirestore(
  uidRaw: string,
  playlistIdRaw: string,
  inviteCodeRaw: string
): Promise<void> {
  const uid = toFirestoreSafeId(uidRaw);
  const playlistId = toFirestoreSafeId(playlistIdRaw);
  const code = toFirestoreSafeId(inviteCodeRaw.toUpperCase());
  const path = `playlists/${playlistId}`;

  try {
    await updateDoc(doc(db, 'playlists', playlistId), {
      isCollaborative: true,
      inviteCode: code,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'playlistInvites', code), {
      inviteCode: code,
      playlistId,
      ownerUid: uid,
      isActive: true,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function joinPlaylistByInviteInFirestore(
  uidRaw: string,
  displayName: string,
  inviteCodeRaw: string
): Promise<Playlist | null> {
  const uid = toFirestoreSafeId(uidRaw);
  const code = toFirestoreSafeId(inviteCodeRaw.trim().toUpperCase());
  if (!code || code.length < 4) return null;

  const invitePath = `playlistInvites/${code}`;
  try {
    const inviteSnap = await getDoc(doc(db, 'playlistInvites', code));
    if (!inviteSnap.exists()) return null;
    const inviteData = inviteSnap.data();
    if (!inviteData.isActive || typeof inviteData.playlistId !== 'string') return null;

    const playlistId = inviteData.playlistId;
    const playlistRef = doc(db, 'playlists', playlistId);
    const playlistSnap = await getDoc(playlistRef);
    if (!playlistSnap.exists()) return null;

    const pData = playlistSnap.data();
    const existingMembers: string[] = Array.isArray(pData.memberUids) ? pData.memberUids : [];
    const existingNames: string[] = Array.isArray(pData.collaboratorNames) ? pData.collaboratorNames : [];

    if (!existingMembers.includes(uid)) {
      const nextMembers = [...existingMembers, uid].slice(0, 50);
      const nextNames = Array.from(new Set([...existingNames, clampStr(displayName, 80, 'Collaborator')])).slice(0, 50);
      await updateDoc(playlistRef, {
        memberUids: nextMembers,
        collaboratorNames: nextNames,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      id: playlistId,
      name: String(pData.name || 'Shared Mix'),
      description: String(pData.description || ''),
      coverUrl: String(pData.coverUrl || COVER_MIDNIGHT_SYNTH),
      ownerId: String(pData.ownerUid || ''),
      ownerName: String(pData.ownerName || 'Creator'),
      trackIds: Array.isArray(pData.trackIds) ? pData.trackIds : [],
      isCollaborative: Boolean(pData.isCollaborative),
      inviteCode: String(pData.inviteCode || code),
      collaborators: existingNames,
      updatedAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, invitePath);
  }
}

export function subscribeToRealtimeUserSync(
  uidRaw: string,
  callbacks: RealtimeSyncCallbacks
): () => void {
  const uid = toFirestoreSafeId(uidRaw);
  const unsubs: Unsubscribe[] = [];
  const itemUnsubs = new Map<string, Unsubscribe>();
  let latestPlaylists: Playlist[] = [];
  const itemsByPlaylist = new Map<string, Track[]>();

  const emitPlaylists = () => {
    const allSyncedTracks: Track[] = [];
    itemsByPlaylist.forEach((list) => {
      allSyncedTracks.push(...list);
    });
    callbacks.onPlaylistsUpdate(latestPlaylists, allSyncedTracks);
  };

  // 1. User profile + preferences
  const userPath = `users/${uid}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        callbacks.onUserDocUpdate({
          profile: {
            id: uid,
            username: String(d.username || 'listener'),
            displayName: String(d.displayName || 'Nocturne Listener'),
            bio: String(d.bio || ''),
            avatarUrl: String(d.avatarUrl || AVATAR_LISTENER_NEON),
            isGuest: false,
            followersCount: Number(d.followersCount || 0),
            followingCount: Number(d.followingCount || 0),
            createdAt: Date.now(),
          },
          likedTrackIds: Array.isArray(d.likedTrackIds) ? d.likedTrackIds : undefined,
          followedArtistIds: Array.isArray(d.followedArtistIds) ? d.followedArtistIds : undefined,
          followedFriendIds: Array.isArray(d.followedFriendIds) ? d.followedFriendIds : undefined,
          audioQuality: d.audioQuality,
          dataSaver: typeof d.dataSaver === 'boolean' ? d.dataSaver : undefined,
          crossfadeSeconds: typeof d.crossfadeSeconds === 'number' ? d.crossfadeSeconds : undefined,
          playbackSpeed: typeof d.playbackSpeed === 'number' ? d.playbackSpeed : undefined,
          autoplaySimilar: typeof d.autoplaySimilar === 'boolean' ? d.autoplaySimilar : undefined,
          recentSearches: Array.isArray(d.recentSearches) ? d.recentSearches : undefined,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    )
  );

  // 2. Liked tracks subcollection
  const likedPath = `users/${uid}/likedTracks`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'likedTracks'), where('ownerUid', '==', uid)),
      (snap) => {
        const tracks: Track[] = [];
        const ids: string[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const tId = String(d.trackId || docSnap.id);
          ids.push(tId);
          tracks.push({
            id: tId,
            title: String(d.title || 'Untitled Track'),
            artist: String(d.artist || 'Artist'),
            artistId: String(d.artistId || 'unknown'),
            genre: String(d.genre || 'Electronic'),
            duration: Number(d.duration || 180),
            artworkUrl: String(d.artworkUrl || COVER_MIDNIGHT_SYNTH),
            streamUrl: String(d.streamUrl || ''),
            source: (d.source as Track['source']) || 'audius',
          });
        });
        callbacks.onLikedTracksUpdate(tracks, ids);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, likedPath);
      }
    )
  );

  // 3. Followed artists subcollection
  const artistsPath = `users/${uid}/followedArtists`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'followedArtists'), where('ownerUid', '==', uid)),
      (snap) => {
        const artists: Artist[] = [];
        const ids: string[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const aId = String(d.artistId || docSnap.id);
          ids.push(aId);
          artists.push({
            id: aId,
            name: String(d.name || 'Artist'),
            handle: String(d.handle || '@artist'),
            avatarUrl: String(d.avatarUrl || COVER_MIDNIGHT_SYNTH),
            bio: 'Synced artist profile',
            followersCount: Number(d.followersCount || 0),
          });
        });
        callbacks.onFollowedArtistsUpdate(artists, ids);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, artistsPath);
      }
    )
  );

  // 4. Personal & collaborative playlists
  const playlistsQuery = query(collection(db, 'playlists'), where('memberUids', 'array-contains', uid));
  unsubs.push(
    onSnapshot(
      playlistsQuery,
      (snap) => {
        const nextPlaylists: Playlist[] = [];
        const activeIds = new Set<string>();

        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const pid = String(d.id || docSnap.id);
          activeIds.add(pid);
          nextPlaylists.push({
            id: pid,
            name: String(d.name || 'Playlist'),
            description: String(d.description || ''),
            coverUrl: String(d.coverUrl || COVER_MIDNIGHT_SYNTH),
            ownerId: String(d.ownerUid || ''),
            ownerName: String(d.ownerName || 'Listener'),
            trackIds: Array.isArray(d.trackIds) ? d.trackIds : [],
            isCollaborative: Boolean(d.isCollaborative),
            inviteCode: typeof d.inviteCode === 'string' && d.inviteCode ? d.inviteCode : undefined,
            collaborators: Array.isArray(d.collaboratorNames) ? d.collaboratorNames : [],
            updatedAt: Date.now(),
          });

          if (!itemUnsubs.has(pid)) {
            const itemsPath = `playlists/${pid}/items`;
            const unsubItems = onSnapshot(
              collection(db, 'playlists', pid, 'items'),
              (itemsSnap) => {
                const tracks: Track[] = [];
                itemsSnap.forEach((itemDoc) => {
                  const item = itemDoc.data();
                  tracks.push({
                    id: String(item.trackId || itemDoc.id),
                    title: String(item.title || 'Untitled Track'),
                    artist: String(item.artist || 'Artist'),
                    artistId: String(item.artistId || 'unknown'),
                    genre: String(item.genre || 'Electronic'),
                    duration: Number(item.duration || 180),
                    artworkUrl: String(item.artworkUrl || COVER_MIDNIGHT_SYNTH),
                    streamUrl: String(item.streamUrl || ''),
                    source: (item.source as Track['source']) || 'audius',
                  });
                });
                itemsByPlaylist.set(pid, tracks);
                emitPlaylists();
              },
              (err) => {
                handleFirestoreError(err, OperationType.LIST, itemsPath);
              }
            );
            itemUnsubs.set(pid, unsubItems);
          }
        });

        for (const [pid, unsub] of itemUnsubs.entries()) {
          if (!activeIds.has(pid)) {
            unsub();
            itemUnsubs.delete(pid);
            itemsByPlaylist.delete(pid);
          }
        }

        latestPlaylists = nextPlaylists;
        emitPlaylists();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'playlists');
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
    itemUnsubs.forEach((u) => u());
    itemUnsubs.clear();
  };
}
