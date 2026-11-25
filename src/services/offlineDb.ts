import type { Track } from '../types/audio';
import { maybeProxyStreamUrl, resolvePipedStreamUrl } from './pipedApi';
import { parseNativeAudioHeader } from '../utils/streamQuality';

const DB_NAME = 'nocturne_offline_db';
const DB_VERSION = 1;
const STORE_OFFLINE_TRACKS = 'offline_tracks';
const STORE_LOCAL_FILES = 'local_files';
const STORE_CUSTOM_LYRICS = 'custom_lyrics';

export interface OfflineTrackRecord {
  id: string;
  track: Track;
  blob: Blob;
  sizeBytes: number;
  downloadedAt: number;
}

export interface LocalFileRecord {
  id: string;
  track: Track;
  blob: Blob;
  sizeBytes: number;
  importedAt: number;
}

export interface CustomLyricsRecord {
  trackId: string;
  rawLrc: string;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OFFLINE_TRACKS)) {
        db.createObjectStore(STORE_OFFLINE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_FILES)) {
        db.createObjectStore(STORE_LOCAL_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_LYRICS)) {
        db.createObjectStore(STORE_CUSTOM_LYRICS, { keyPath: 'trackId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineTrack(track: Track, resolvedStreamUrl?: string): Promise<OfflineTrackRecord> {
  let sourceUrl = resolvedStreamUrl || track.streamUrl;
  if (!sourceUrl && track.videoId) {
    sourceUrl = (await resolvePipedStreamUrl(track.videoId, 'high', false, {
      title: track.title,
      artist: track.artist,
      duration: track.duration,
    })) || '';
  }

  if (!sourceUrl) {
    throw new Error(`No downloadable stream URL available for "${track.title}"`);
  }

  const fetchUrl = maybeProxyStreamUrl(sourceUrl);
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Stream fetch failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  const record: OfflineTrackRecord = {
    id: track.id,
    track,
    blob,
    sizeBytes: blob.size,
    downloadedAt: Date.now(),
  };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readwrite');
    tx.objectStore(STORE_OFFLINE_TRACKS).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllOfflineTracks(): Promise<OfflineTrackRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readonly');
      const req = tx.objectStore(STORE_OFFLINE_TRACKS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getOfflineTrackBlobUrl(trackId: string): Promise<string | null> {
  try {
    const db = await openDb();
    const rec: OfflineTrackRecord | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readonly');
      const req = tx.objectStore(STORE_OFFLINE_TRACKS).get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (rec?.blob) {
      return URL.createObjectURL(rec.blob);
    }
    // Also check local imported files
    const localRec: LocalFileRecord | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_FILES, 'readonly');
      const req = tx.objectStore(STORE_LOCAL_FILES).get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (localRec?.blob) {
      return URL.createObjectURL(localRec.blob);
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteOfflineTrack(trackId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readwrite');
    tx.objectStore(STORE_OFFLINE_TRACKS).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveLocalAudioFile(file: File, fallbackCover: string): Promise<LocalFileRecord> {
  const cleanTitle = file.name.replace(/\.(mp3|m4a|wav|ogg|flac|aac)$/i, '');
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Probe duration via temporary audio element
  const tempUrl = URL.createObjectURL(file);
  const duration = await new Promise<number>((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : 180;
      URL.revokeObjectURL(tempUrl);
      resolve(d);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      resolve(180);
    };
    audio.src = tempUrl;
  });

  const headerBytes = new Uint8Array(await file.slice(0, 128).arrayBuffer());
  const streamMeta = parseNativeAudioHeader(headerBytes, file.name, file.type, file.size, duration);

  const track: Track = {
    id,
    title: cleanTitle || 'Local Audio Track',
    artist: 'Local Device File',
    artistId: 'local-device',
    album: 'Imported Library',
    genre: 'Local',
    duration,
    artworkUrl: fallbackCover,
    artworkThumbUrl: fallbackCover,
    streamUrl: '',
    source: 'local',
    streamMeta,
  };

  const record: LocalFileRecord = {
    id,
    track,
    blob: file,
    sizeBytes: file.size,
    importedAt: Date.now(),
  };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_FILES, 'readwrite');
    tx.objectStore(STORE_LOCAL_FILES).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllLocalFiles(): Promise<LocalFileRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_FILES, 'readonly');
      const req = tx.objectStore(STORE_LOCAL_FILES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteLocalFile(trackId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_FILES, 'readwrite');
    tx.objectStore(STORE_LOCAL_FILES).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCustomLyrics(trackId: string, rawLrc: string): Promise<void> {
  const db = await openDb();
  const record: CustomLyricsRecord = {
    trackId,
    rawLrc,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LYRICS, 'readwrite');
    tx.objectStore(STORE_CUSTOM_LYRICS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCustomLyrics(trackId: string): Promise<string | null> {
  try {
    const db = await openDb();
    const rec: CustomLyricsRecord | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOM_LYRICS, 'readonly');
      const req = tx.objectStore(STORE_CUSTOM_LYRICS).get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return rec?.rawLrc ?? null;
  } catch {
    return null;
  }
}
