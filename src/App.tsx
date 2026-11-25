import { useEffect, useState } from 'react';
import type { Track } from './types/audio';
import { NocturneProvider, useNocturne } from './context/NocturneContext';
import { DesktopSidebar, MobileBottomNav } from './components/Navigation';
import { MiniPlayer } from './components/MiniPlayer';
import { HomeView } from './components/HomeView';
import { SearchView } from './components/SearchView';
import { LibraryView } from './components/LibraryView';
import { PodcastsView } from './components/PodcastsView';
import { ProfileView } from './components/ProfileView';
import { NowPlayingModal } from './components/NowPlayingModal';
import { EqualizerModal } from './components/EqualizerModal';
import { QueueModal } from './components/QueueModal';
import { AuthModal } from './components/AuthModal';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { ToastContainer } from './components/ToastContainer';

import { ErrorBoundary } from './components/ErrorBoundary';

function NocturneShell() {
  const { activeTab, joinPlaylistByCode, setActiveTab } = useNocturne();
  const [playlistTargetTrack, setPlaylistTargetTrack] = useState<Track | null>(null);

  // Support collaborative playlist invite links (?join=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      void joinPlaylistByCode(joinCode);
      setActiveTab('library');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [joinPlaylistByCode, setActiveTab]);

  return (
    <div className="h-screen w-full bg-[#09090E] text-zinc-100 flex overflow-hidden">
      <DesktopSidebar />

      <main className="flex-1 min-w-0 h-full overflow-y-auto px-4 sm:px-8 pt-6 pb-40 lg:pb-28">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'home' && <HomeView onAddToPlaylistClick={setPlaylistTargetTrack} />}
          {activeTab === 'search' && <SearchView onAddToPlaylistClick={setPlaylistTargetTrack} />}
          {activeTab === 'library' && <LibraryView onAddToPlaylistClick={setPlaylistTargetTrack} />}
          {activeTab === 'podcasts' && <PodcastsView />}
          {activeTab === 'profile' && <ProfileView />}
        </div>
      </main>

      <MiniPlayer />
      <MobileBottomNav />

      <NowPlayingModal />
      <EqualizerModal />
      <QueueModal />
      <AuthModal />
      <AddToPlaylistModal
        track={playlistTargetTrack}
        onClose={() => setPlaylistTargetTrack(null)}
      />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NocturneProvider>
        <NocturneShell />
      </NocturneProvider>
    </ErrorBoundary>
  );
}
