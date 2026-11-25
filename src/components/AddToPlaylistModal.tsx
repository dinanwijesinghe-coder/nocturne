import React, { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Track } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';

interface AddToPlaylistModalProps {
  track: Track | null;
  onClose: () => void;
}

export function AddToPlaylistModal({ track, onClose }: AddToPlaylistModalProps) {
  const { playlists, addTrackToPlaylist, createPlaylist } = useNocturne();
  const [newName, setNewName] = useState('');

  if (!track) return null;

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const pl = createPlaylist(newName, '', false);
    addTrackToPlaylist(pl.id, track);
    setNewName('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add to Playlist"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#11111A] border border-white/12 p-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="min-w-0 pr-3">
            <h2 className="text-base font-bold text-white truncate">Save to Playlist</h2>
            <p className="text-xs text-zinc-400 truncate">{track.title} · {track.artist}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playlist picker"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5">
          {playlists.map((pl) => {
            const alreadyIn = pl.trackIds.includes(track.id);
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  if (!alreadyIn) {
                    addTrackToPlaylist(pl.id, track);
                  }
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/8 text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-400">{pl.trackIds.length} tracks</p>
                </div>
                {alreadyIn ? (
                  <Check className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
                ) : (
                  <Plus className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleCreateAndAdd} className="mt-4 pt-3 border-t border-white/8 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name..."
            className="flex-1 rounded-xl bg-[#09090E] border border-white/12 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold whitespace-nowrap"
          >
            Create & Add
          </button>
        </form>
      </div>
    </div>
  );
}
