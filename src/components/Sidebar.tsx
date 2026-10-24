import { ReactNode, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Flame,
  Folder,
  FolderOpen,
  History,
  House,
  Library,
  Tv,
} from 'lucide-react'
import { useAppStore, View } from '../store'
import { Directory } from '../types'
import { useTwitchChannels } from '../hooks/useTwitchChannels'
import { TwitchChannel } from '../utils/plays'

/**
 * Pages, then the collection (local folders) and the Twitch channels you watch, like YouTube
 * Music's left column.
 */
export function Sidebar() {
  const dirs = useAppStore((s) => s.library.dirs)
  const channels = useTwitchChannels()
  const [foldersOpen, setFoldersOpen] = useState(true)

  return (
    <nav className="w-60 shrink-0 flex flex-col bg-app-bar border-r border-app-border select-none">
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 px-5 h-14 shrink-0 font-mono font-bold text-app-accent"
      >
        <div className="w-4 h-4 rounded-full border-2 border-app-accent flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-app-accent" />
        </div>
        playmusic
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-0.5">
          <NavItem view={{ page: 'home' }} icon={<House size={16} />} label="Home" />
          <NavItem view={{ page: 'explore' }} icon={<Compass size={16} />} label="Explore" />
          <NavItem view={{ page: 'library' }} icon={<Library size={16} />} label="Your library" />
          <NavItem view={{ page: 'recent' }} icon={<History size={16} />} label="Recently played" />
        </div>

        <div className="h-px bg-app-border mx-2 my-4" />

        <SectionTitle>your collection</SectionTitle>
        <NavItem view={{ page: 'most' }} icon={<Flame size={16} />} label="Most listened" />
        <button
          onClick={() => setFoldersOpen(!foldersOpen)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-mono text-app-secondary hover:bg-app-hover hover:text-app-text transition-colors"
        >
          {foldersOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
          <span className="flex-1 text-left truncate">Local folders</span>
          <span className="text-xs text-app-muted tabular-nums">{dirs.length}</span>
          {foldersOpen ? (
            <ChevronDown size={12} className="text-app-muted" />
          ) : (
            <ChevronRight size={12} className="text-app-muted" />
          )}
        </button>
        {foldersOpen && (
          <div className="flex flex-col gap-0.5 ml-4 pl-2 border-l border-app-border">
            {dirs.map((dir) => (
              <FolderItem key={dir.path} dir={dir} />
            ))}
          </div>
        )}

        {channels.length > 0 && (
          <>
            <div className="h-px bg-app-border mx-2 my-4" />
            <SectionTitle>channels</SectionTitle>
            <div className="flex flex-col gap-0.5">
              {channels.map((channel) => (
                <ChannelItem key={channel.name} channel={channel} />
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-2 text-[10px] font-mono text-app-muted tracking-[0.2em] uppercase">
      {children}
    </div>
  )
}

/** Highlighted while its page is shown (and not covered by search results). */
function useIsCurrent(view: View): boolean {
  return useAppStore((s) => !s.query.trim() && JSON.stringify(s.nav.view) === JSON.stringify(view))
}

function NavItem({ view, icon, label }: { view: View; icon: ReactNode; label: string }) {
  const navigate = useAppStore((s) => s.navigate)
  const current = useIsCurrent(view)

  return (
    <button
      onClick={() => navigate(view)}
      aria-current={current ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-mono transition-colors ${
        current
          ? 'bg-app-selected text-app-accent'
          : 'text-app-secondary hover:bg-app-hover hover:text-app-text'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** A Twitch channel you watched, with a dot while it's live (`useTwitchLiveStatus`). */
function ChannelItem({ channel }: { channel: TwitchChannel }) {
  const navigate = useAppStore((s) => s.navigate)
  const view: View = { page: 'channel', name: channel.name }
  const current = useIsCurrent(view)
  const live = useAppStore((s) => s.online.liveChannels.has(channel.name))

  return (
    <button
      onClick={() => navigate(view)}
      aria-current={current ? 'page' : undefined}
      title={live ? `${channel.display} is live` : channel.display}
      className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
        current
          ? 'bg-app-selected text-app-accent'
          : 'text-app-secondary hover:bg-app-hover hover:text-app-text'
      }`}
    >
      <Tv size={16} className="shrink-0" />
      <span className="flex-1 text-left truncate">{channel.display}</span>
      {live && (
        <span className="flex items-center gap-1.5 text-[10px] text-app-accent tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          live
        </span>
      )}
    </button>
  )
}

function FolderItem({ dir }: { dir: Directory }) {
  const navigate = useAppStore((s) => s.navigate)
  const view: View = { page: 'folder', path: dir.path }
  const current = useIsCurrent(view)
  const count = dir.files.length + dir.albums.reduce((n, a) => n + a.files.length, 0)

  return (
    <button
      onClick={() => navigate(view)}
      aria-current={current ? 'page' : undefined}
      title={dir.path}
      className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
        current
          ? 'bg-app-selected text-app-accent'
          : 'text-app-secondary hover:bg-app-hover hover:text-app-text'
      }`}
    >
      <span className="flex-1 text-left truncate">{dir.name}</span>
      <span className="text-app-muted tabular-nums">{count}</span>
    </button>
  )
}
