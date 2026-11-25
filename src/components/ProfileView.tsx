import React, { useState } from 'react';
import {
  BarChart3,
  Cloud,
  Edit3,
  LogOut,
  Play,
  Sliders,
  UserCheck,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';
import { AUDIO_QUALITY_OPTIONS } from '../utils/eqPresets';
import { CoverImage } from './CoverImage';

export function ProfileView() {
  const {
    profile,
    updateProfile,
    signOut,
    setAuthOpen,
    friends,
    toggleFollowFriend,
    allKnownTracks,
    playTrack,
    audioQuality,
    setAudioQuality,
    dataSaver,
    setDataSaver,
    wrappedStats,
    setEqOpen,
    cloudSyncProvider,
  } = useNocturne();

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile?.displayName || '');
  const [draftBio, setDraftBio] = useState(profile?.bio || '');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      displayName: draftName.trim() || profile?.displayName || 'Listener',
      bio: draftBio.trim(),
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <section aria-label="User Profile" className="rounded-3xl bg-gradient-to-br from-[#161325] via-[#111119] to-[#0C0C12] border border-white/10 p-5 sm:p-6">
        {profile ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <CoverImage src={profile.avatarUrl} alt={profile.displayName} className="w-20 h-20" roundedClass="rounded-full" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white truncate">
                    {profile.displayName}
                  </h1>
                  <span className="text-xs font-mono text-purple-300">
                    {profile.isGuest ? 'Guest Mode' : `@${profile.username}`}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md">{profile.bio}</p>
                <p className="text-xs text-zinc-300 font-mono tabular-nums mt-2">
                  <span>{profile.followersCount} followers</span>
                  <span aria-hidden="true"> · </span>
                  <span>{profile.followingCount} following</span>
                  <span aria-hidden="true"> · </span>
                  <span className="text-purple-300 inline-flex items-center gap-1">
                    <Cloud className="w-3 h-3" aria-hidden="true" />
                    {cloudSyncProvider === 'firebase'
                      ? 'Firebase Cloud Sync'
                      : 'Local Guest Storage'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftName(profile.displayName);
                  setDraftBio(profile.bio);
                  setIsEditing((v) => !v);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                Edit Profile
              </button>
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/25"
              >
                Switch Account
              </button>
              <button
                type="button"
                onClick={signOut}
                aria-label="Sign out"
                className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-rose-300 bg-white/[0.04]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">Not Signed In</h1>
              <p className="text-xs text-zinc-400 mt-1">Sign in, create a profile, or use Guest Mode.</p>
            </div>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold"
            >
              Sign In / Sign Up
            </button>
          </div>
        )}

        {isEditing && profile && (
          <form onSubmit={handleSaveProfile} className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-display-name" className="block text-xs text-zinc-400 mb-1">Display Name</label>
              <input
                id="edit-display-name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label htmlFor="edit-bio" className="block text-xs text-zinc-400 mb-1">Bio</label>
              <input
                id="edit-bio"
                type="text"
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
                className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs text-zinc-400">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-purple-500 text-white text-xs font-semibold">
                Save Profile
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Main Split: Audio Quality & Data Saver + Friends Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Audio Quality & Data Saver */}
        <section aria-label="Streaming Quality and Data Saver" className="lg:col-span-6 rounded-2xl bg-[#111119]/90 border border-white/8 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-purple-400" aria-hidden="true" />
              Streaming Quality & Data Saver
            </h2>
            <button
              type="button"
              onClick={() => setEqOpen(true)}
              className="text-xs font-medium text-purple-300 hover:text-purple-200 flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
              Open EQ
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#0B0B11] border border-white/8">
            <div>
              <p className="text-xs font-semibold text-white">Data Saver Mode</p>
              <p className="text-[11px] text-zinc-400">
                Forces ~48–64kbps stream, disables animated visualizer & loads compressed covers
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dataSaver}
              aria-label="Toggle Data Saver Mode"
              onClick={() => setDataSaver(!dataSaver)}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                dataSaver ? 'bg-purple-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  dataSaver ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {AUDIO_QUALITY_OPTIONS.map((opt) => {
              const active = audioQuality === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAudioQuality(opt.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'bg-purple-500/18 border-purple-400/40'
                      : 'bg-[#0B0B11] border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{opt.label}</span>
                    <span className="text-[11px] font-mono text-purple-300">{opt.bitrateLabel}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">{opt.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Friends Activity Live Feed */}
        <section aria-label="Friends Activity Feed" className="lg:col-span-6 rounded-2xl bg-[#111119]/90 border border-white/8 p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Friends Activity</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Live activity from followed listeners</p>
          </div>

          {friends.length === 0 ? (
            <p className="text-xs text-zinc-400 py-6">
              No friend activity synced yet. Share collaborative playlists in Library to listen together.
            </p>
          ) : (
            <div className="space-y-3">
            {friends.map((friend) => {
              const matchedTrack = allKnownTracks.find((t) => t.id === friend.trackId);
              return (
                <div
                  key={friend.id}
                  className="rounded-xl bg-[#0B0B11] border border-white/8 p-3 flex items-center gap-3"
                >
                  <CoverImage src={friend.avatarUrl} alt={friend.displayName} className="w-11 h-11" roundedClass="rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white truncate">{friend.displayName}</p>
                      <span className="text-[11px] text-zinc-500 font-mono">{friend.minutesAgo}m ago</span>
                    </div>
                    <p className="text-xs text-zinc-300 truncate mt-0.5">
                      {friend.trackTitle} · {friend.artistName}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
                      {friend.followersCount} followers
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {matchedTrack && (
                      <button
                        type="button"
                        onClick={() => void playTrack(matchedTrack)}
                        aria-label={`Play ${friend.trackTitle}`}
                        className="w-9 h-9 rounded-full bg-purple-500/20 hover:bg-purple-500 text-purple-200 hover:text-white flex items-center justify-center transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleFollowFriend(friend.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                        friend.isFollowing
                          ? 'bg-purple-500/18 text-purple-200 border border-purple-400/30'
                          : 'bg-white/[0.06] text-zinc-200 border border-white/10'
                      }`}
                    >
                      {friend.isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          Follow
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </section>
      </div>

      {/* Listening Stats ("Your Wrapped") */}
      <section aria-label="Your Wrapped Listening Stats" className="rounded-2xl bg-[#111119]/90 border border-white/8 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" aria-hidden="true" />
              Your Wrapped
            </h2>
            <p className="text-xs text-zinc-400">Personal listening breakdown</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <span className="text-zinc-300">
              <strong className="text-purple-300 text-sm">{wrappedStats.totalMinutes}</strong> min listened
            </span>
            <span className="text-zinc-300">
              <strong className="text-purple-300 text-sm">{wrappedStats.totalPlays}</strong> streams
            </span>
          </div>
        </div>

        {wrappedStats.totalPlays === 0 ? (
          <p className="text-xs text-zinc-400 py-4">
            Start streaming tracks to build your real-time Top Songs, Top Artists, and Genre breakdown.
          </p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#0B0B11] border border-white/8 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 mb-3">Top Songs</h3>
            <div className="space-y-2.5">
              {wrappedStats.topSongs.map((s, idx) => (
                <div key={s.trackId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-200 truncate">
                    <span className="font-mono text-zinc-500 mr-2">{idx + 1}.</span>
                    {s.title}
                  </span>
                  <span className="font-mono text-purple-300 tabular-nums shrink-0">{s.plays}x</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0B11] border border-white/8 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 mb-3">Top Artists</h3>
            <div className="space-y-2.5">
              {wrappedStats.topArtists.map((a, idx) => (
                <div key={a.artist} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-200 truncate">
                    <span className="font-mono text-zinc-500 mr-2">{idx + 1}.</span>
                    {a.artist}
                  </span>
                  <span className="font-mono text-purple-300 tabular-nums shrink-0">{a.minutes}m</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0B11] border border-white/8 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 mb-3">Favorite Genres</h3>
            <div className="space-y-2.5">
              {wrappedStats.topGenres.map((g) => (
                <div key={g.genre} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-200">{g.genre}</span>
                    <span className="font-mono text-purple-300 tabular-nums">{g.percentage}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${g.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </section>
    </div>
  );
}
