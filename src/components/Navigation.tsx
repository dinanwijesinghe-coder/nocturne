import { Compass, Headphones, Home, Library, ListMusic, Mic2, Search, Sliders, User } from 'lucide-react';
import type { AppTab } from '../types/audio';
import { useNocturne } from '../context/NocturneContext';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'podcasts', label: 'Podcasts', icon: Mic2 },
  { id: 'profile', label: 'Profile', icon: User },
];

export function DesktopSidebar() {
  const {
    activeTab,
    setActiveTab,
    playlists,
    setEqOpen,
    setQueueOpen,
    profile,
    setAuthOpen,
    eqSettings,
    offlineRecords,
  } = useNocturne();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-white/8 bg-[#0C0C12] h-full pb-20 select-none">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.45)]">
            <Headphones className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Nocturne</span>
        </div>
      </div>

      <nav aria-label="Main navigation" className="px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-400/20'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-purple-400' : ''}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 px-5">
        <div className="h-px bg-white/8 mb-4" />
        <p className="text-xs font-medium text-zinc-500 mb-2.5">Studio Tools</p>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setEqOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-white/[0.03] hover:bg-white/[0.07] border border-white/8 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              10-Band Equalizer
            </span>
            <span className="text-purple-300 font-mono">{eqSettings.presetName}</span>
          </button>

          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-white/[0.03] hover:bg-white/[0.07] border border-white/8 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ListMusic className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              Up Next Queue
            </span>
            <span className="text-zinc-400 font-mono tabular-nums">{offlineRecords.length} offline</span>
          </button>
        </div>
      </div>

      <div className="mt-6 px-5 flex-1 min-h-0 flex flex-col">
        <div className="h-px bg-white/8 mb-4" />
        <p className="text-xs font-medium text-zinc-500 mb-2">Playlists</p>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => setActiveTab('library')}
              className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors truncate"
            >
              <span className="text-zinc-200 font-medium block truncate">{pl.name}</span>
              <span className="text-[11px] text-zinc-500">
                {pl.trackIds.length} tracks{pl.isCollaborative ? ' · Shared' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-white/8">
        <button
          type="button"
          onClick={() => (profile ? setActiveTab('profile') : setAuthOpen(true))}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
        >
          <Compass className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {profile ? profile.displayName : 'Sign In'}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">
              {profile ? (profile.isGuest ? 'Guest Session' : `@${profile.username}`) : 'Sync your library'}
            </p>
          </div>
        </button>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const { activeTab, setActiveTab } = useNocturne();

  return (
    <nav
      aria-label="Bottom tab navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-[#0D0D14]/92 backdrop-blur-xl border-t border-white/10"
    >
      <div className="grid grid-cols-5 h-full max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
                active ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
