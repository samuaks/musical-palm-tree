import { Search } from 'lucide-react'
import { useAppStore } from '../store'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const scanMeta = useAppStore((s) => s.scanMeta)
  const scanState = useAppStore((s) => s.scanState)
  const liveCount = useAppStore((s) => s.liveCount)

  return (
    <div className="shrink-0 px-6 pt-5 pb-4 border-b border-app-border" data-tauri-drag-region>
      {/* top row — logo + stats */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-app-accent flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-app-accent" />
          </div>
          <span className="text-app-accent font-mono font-bold text-sm tracking-wide">
            PlayMusic
          </span>
        </div>

        {scanMeta && (
          <div className="flex items-center gap-3 text-xs font-mono text-app-muted">
            <span className="text-app-text">{scanMeta.total_files}</span>
            <span>files</span>
            <span className="text-app-muted">·</span>
            <span className="text-app-text">{scanMeta.total_albums}</span>
            <span>albums</span>
            <span className="text-app-muted">·</span>
            <span className="text-app-text">{scanMeta.total_directories}</span>
            <span>dirs</span>
            <span className="text-app-muted">·</span>
            <span className="text-app-text">{scanMeta.duration_ms}ms</span>
            {scanMeta.total_duplicates > 0 && (
              <>
                <span className="text-app-muted">·</span>
                <span className="text-app-accent font-bold">
                  {scanMeta.total_duplicates} duplicates
                </span>
              </>
            )}
          </div>
        )}

        {scanState === 'scanning' && (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
            <span className="text-xs text-app-muted font-mono">
              scanning... {liveCount > 0 && `${liveCount} files`}
            </span>
          </div>
        )}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* search bar row */}
      <div className="flex items-center gap-3 px-3 py-2 rounded border border-app-border hover:border-app-accent-dim transition-colors focus-within:border-app-accent">
        <Search size={16} className="text-app-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="type to search..."
          className="bg-transparent text-app-text text-sm font-mono placeholder-app-muted outline-none flex-1"
        />
        <span className="text-xs font-mono text-app-muted shrink-0 hidden md:inline">
          try <span className="text-app-secondary">shadow</span> or{' '}
          <span className="text-app-secondary">drumcode</span>
        </span>
      </div>
    </div>
  )
}
