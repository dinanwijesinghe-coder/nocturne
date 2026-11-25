import React, { useRef, useState } from 'react';
import {
  Copy,
  Download,
  FolderUp,
  Heart,
  Link2,
  Play,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Playlist, Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';

type LibrarySection = 'playlists' | 'liked' | 'offline' | 'local' | 'artists';

interface LibraryViewProps {
  onAddToPlaylistClick: (track: Track) => void;
}

export function LibraryView({ onAddToPlaylistClick }: LibraryViewProps) {
  const {
    playlists,
    createPlaylist,
    togglePlaylistCollaborative,
    joinPlaylistByCode,
    removeTrackFromPlaylist,
    likedTrackIds,
    allKnownTracks,
    offlineRecords,
    removeOfflineTrack,
    localFiles,
    importLocalAudioFiles,
    removeLocalFile,
    artists,
    followedArtistIds,
    toggleFollowArtist,
    playTrack,
    showToast,
  } = useNocturne();

  const [section, setSection] = useState<LibrarySection>('playlists');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [newPlDesc, setNewPlDesc] = useState('');
  const [newPlCollab, setNewPlCollab] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const likedTracks = likedTrackIds
    .map((id) => allKnownTracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));

  const offlineTracks = offlineRecords.map((r) => r.track);
  const localTracks = localFiles.map((f) => f.track);
  const followedArtists = artists.filter((a) => followedArtistIds.includes(a.id));

  const activePlaylist: Playlist | undefined = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    const created = createPlaylist(newPlName, newPlDesc, newPlCollab);
    setSelectedPlaylistId(created.id);
    setNewPlName('');
    setNewPlDesc('');
    setNewPlCollab(false);
    setShowCreateForm(false);
  };

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await joinPlaylistByCode(joinCodeInput)) {
      setJoinCodeInput('');
    }
  };

  const copyInviteLink = async (pl: Playlist) => {
    const code = pl.inviteCode || togglePlaylistCollaborative(pl.id);
    const link = `${window.location.origin}/?join=${encodeURIComponent(code)}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
      showToast(`Invite code ${code} copied to clipboard`, 'success');
    } catch {
      showToast(`Invite code: ${code}`, 'info');
    }
  };

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      await importLocalAudioFiles(e.target.files);
      setSection('local');
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Your Library</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {likedTracks.length} liked · {offlineRecords.length} offline · {playlists.length} playlists
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.flac,.wav,.m4a,.mp3,.aac,.ogg"
            multiple
            onChange={handleLocalUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderUp className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
            Import Audio
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-purple-500 hover:bg-purple-400 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Playlist
          </button>
        </div>
      </header>

      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'playlists' as const, label: `Playlists (${playlists.length})` },
          { id: 'liked' as const, label: `Liked Songs (${likedTracks.length})` },
          { id: 'offline' as const, label: `Offline (${offlineTracks.length})` },
          { id: 'local' as const, label: `Local Files (${localTracks.length})` },
          { id: 'artists' as const, label: `Artists (${followedArtists.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              section === tab.id
                ? 'bg-purple-500 text-white'
                : 'bg-[#12121B] text-zinc-400 hover:text-zinc-100 border border-white/8'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Create Playlist Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreatePlaylist}
          className="rounded-2xl bg-[#13131E] border border-purple-400/25 p-4 space-y-3"
        >
          <h2 className="text-sm font-bold text-white">Create New Playlist</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-playlist-name" className="block text-xs text-zinc-400 mb-1">
                Playlist Name
              </label>
              <input
                id="new-playlist-name"
                type="text"
                required
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                placeholder="Midnight Frequency"
                className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label htmlFor="new-playlist-desc" className="block text-xs text-zinc-400 mb-1">
                Description
              </label>
              <input
                id="new-playlist-desc"
                type="text"
                value={newPlDesc}
                onChange={(e) => setNewPlDesc(e.target.value)}
                placeholder="Late-night synth & bass selection"
                className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newPlCollab}
                onChange={(e) => setNewPlCollab(e.target.checked)}
                className="accent-purple-500 w-4 h-4"
              />
              Enable Collaborative Invite Link
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold"
              >
                Create Playlist
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Section: Playlists & Collaborative Mode */}
      {section === 'playlists' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-4">
            {/* Join Collaborative Playlist by Code */}
            <form
              onSubmit={handleJoinCode}
              className="rounded-2xl bg-[#111119] border border-white/8 p-4 space-y-2.5"
            >
              <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
                Join Collaborative Playlist
              </p>
              <div className="flex gap-2">
                <label htmlFor="join-collab-code" className="sr-only">Invite code</label>
                <input
                  id="join-collab-code"
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="Enter code (e.g. OBSI-4821)"
                  className="flex-1 rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-400"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold"
                >
                  Join
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {playlists.map((pl) => {
                const isSelected = activePlaylist?.id === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${
                      isSelected
                        ? 'bg-purple-500/14 border-purple-400/35'
                        : 'bg-[#111119] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <CoverImage src={pl.coverUrl} alt={pl.name} className="w-12 h-12" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{pl.name}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        {pl.trackIds.length} tracks
                        {pl.isCollaborative ? ` · Collab (${pl.inviteCode})` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Playlist Detail */}
          {activePlaylist && (
            <div className="lg:col-span-7 rounded-2xl bg-[#111119]/90 border border-white/8 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/8">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <CoverImage src={activePlaylist.coverUrl} alt={activePlaylist.name} className="w-16 h-16" />
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-white truncate">{activePlaylist.name}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{activePlaylist.description}</p>
                    {activePlaylist.isCollaborative && (
                      <p className="text-xs text-purple-300 mt-1 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" aria-hidden="true" />
                        Invite Code: <span className="font-mono font-semibold">{activePlaylist.inviteCode}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyInviteLink(activePlaylist)}
                    className="px-3 py-2 rounded-xl text-xs font-medium text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/25 flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    {activePlaylist.isCollaborative ? 'Copy Invite Link' : 'Enable Collab'}
                  </button>

                  {activePlaylist.trackIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const resolved = activePlaylist.trackIds
                          .map((id) => allKnownTracks.find((t) => t.id === id))
                          .filter((t): t is Track => Boolean(t));
                        if (resolved.length) void playTrack(resolved[0], resolved);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-purple-500 hover:bg-purple-400 flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
                      Play
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                {activePlaylist.trackIds.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-8 text-center">
                    No tracks in this playlist yet. Use the + button on any track to add it here.
                  </p>
                ) : (
                  activePlaylist.trackIds.map((id, idx) => {
                    const track = allKnownTracks.find((t) => t.id === id);
                    if (!track) return null;
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <TrackRow track={track} index={idx} />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTrackFromPlaylist(activePlaylist.id, id)}
                          aria-label={`Remove ${track.title} from ${activePlaylist.name}`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section: Liked Songs */}
      {section === 'liked' && (
        <section className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-purple-400 fill-purple-400" aria-hidden="true" />
              Liked Songs
            </h2>
            {likedTracks.length > 0 && (
              <button
                type="button"
                onClick={() => void playTrack(likedTracks[0], likedTracks)}
                className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold"
              >
                Play All
              </button>
            )}
          </div>
          {likedTracks.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">Tap the heart icon on any track to save it here.</p>
          ) : (
            <div className="space-y-1">
              {likedTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  queueContext={likedTracks}
                  onAddToPlaylistClick={onAddToPlaylistClick}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section: Offline Downloads */}
      {section === 'offline' && (
        <section className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-purple-400" aria-hidden="true" />
                Offline Downloads (IndexedDB)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Stored locally on your device for 100% free offline playback
              </p>
            </div>
            {offlineTracks.length > 0 && (
              <button
                type="button"
                onClick={() => void playTrack(offlineTracks[0], offlineTracks)}
                className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold"
              >
                Play Offline
              </button>
            )}
          </div>

          {offlineRecords.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">
              No tracks downloaded yet. Click the download icon on any track or podcast episode.
            </p>
          ) : (
            <div className="space-y-1">
              {offlineRecords.map((rec, idx) => (
                <div key={rec.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TrackRow
                      track={rec.track}
                      index={idx}
                      queueContext={offlineTracks}
                      onAddToPlaylistClick={onAddToPlaylistClick}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
                    {Math.max(1, Math.round(rec.sizeBytes / 1024))} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeOfflineTrack(rec.id)}
                    aria-label={`Delete offline file ${rec.track.title}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section: Local Files */}
      {section === 'local' && (
        <section className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-bold text-white">Local Audio Files</h2>
              <p className="text-xs text-zinc-400">Import MP3, M4A, or WAV files from your device with full 10-band EQ support</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <FolderUp className="w-3.5 h-3.5" aria-hidden="true" />
              Choose Audio Files
            </button>
          </div>

          {localFiles.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">
              No local files imported yet.
            </p>
          ) : (
            <div className="space-y-1">
              {localFiles.map((rec, idx) => (
                <div key={rec.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TrackRow
                      track={rec.track}
                      index={idx}
                      queueContext={localTracks}
                      onAddToPlaylistClick={onAddToPlaylistClick}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeLocalFile(rec.id)}
                    aria-label={`Remove local file ${rec.track.title}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section: Followed Artists */}
      {section === 'artists' && (
        <section className="rounded-2xl bg-[#111119]/90 border border-white/8 p-4 sm:p-5">
          <h2 className="text-base font-bold text-white mb-4">Followed Artists</h2>
          {followedArtists.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">
              You are not following any artists yet. Follow artists from Home to see them here.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {followedArtists.map((artist) => (
                <div
                  key={artist.id}
                  className="rounded-2xl bg-[#0C0C12] border border-white/8 p-4 flex items-center gap-3"
                >
                  <CoverImage src={artist.avatarUrl} alt={artist.name} className="w-12 h-12" roundedClass="rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{artist.name}</p>
                    <p className="text-xs text-zinc-400 font-mono tabular-nums">
                      {artist.followersCount.toLocaleString()} followers
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFollowArtist(artist.id, artist.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/18 text-purple-200 border border-purple-400/30 flex items-center gap-1"
                  >
                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Following
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
