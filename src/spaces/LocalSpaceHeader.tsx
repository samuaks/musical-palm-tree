import { Search } from 'lucide-react'
import { useAppStore } from '../store'

export function LocalSpaceHeader() {
  const query = useAppStore((s) => s.spaces.local.query)
  const setQuery = useAppStore((s) => s.setLocalQuery)
  const scanMeta = useAppStore((s) => s.spaces.local.scanMeta)
  const scanState = useAppStore((s) => s.spaces.local.scanState)
  const liveCount = useAppStore((s) => s.spaces.local.liveCount)

  return (
    <div className="flex flex-col gap-4">
      {/* stats row */}
      <div className="flex items-center gap-4 min-h-5">
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
      </div>

      {/* search row */}
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
