import { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useAppStore } from '../store'
import { clearYouTubeSearch, searchYouTube } from '../api/online'
import { ThemeToggle } from './ThemeToggle'

/** Library stats and the one search box: filters the library as you type, Enter searches YouTube. */
export function Header() {
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const scanMeta = useAppStore((s) => s.library.scanMeta)
  const scanState = useAppStore((s) => s.library.scanState)
  const liveCount = useAppStore((s) => s.library.liveCount)
  const youtubeSearching = useAppStore((s) => s.youtube.searchState === 'searching')
  const youtubeReady = useAppStore((s) => s.ytDlp?.available !== false)

  function changeQuery(value: string) {
    setQuery(value)
    if (!value.trim()) clearYouTubeSearch()
  }

  return (
    <div className="shrink-0 px-6 pt-5 pb-4 border-b border-app-border">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* stats row */}
          <div className="flex items-center gap-4 min-h-5">
            {scanMeta && (
              <div className="flex items-center gap-3 text-xs font-mono text-app-muted">
                <Stat value={scanMeta.total_files} label="file" />
                <span>·</span>
                <Stat value={scanMeta.total_albums} label="album" />
                <span>·</span>
                <Stat value={scanMeta.total_directories} label="dir" />
                <span>·</span>
                <span className="tabular-nums">{scanMeta.duration_ms}ms</span>
                {scanMeta.total_duplicates > 0 && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {plural(scanMeta.total_duplicates, 'duplicate')} hidden
                    </span>
                  </>
                )}
              </div>
            )}

            {scanState === 'scanning' && (
              <Activity>scanning... {liveCount > 0 && `${liveCount} files`}</Activity>
            )}
            {youtubeSearching && <Activity>searching youtube...</Activity>}
          </div>

          {/* search row */}
          <div className="flex items-center gap-3 px-3 py-2 rounded border border-app-border hover:border-app-accent transition-colors focus-within:border-app-accent">
            <Search size={16} className="text-app-muted shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchYouTube(query)
              }}
              placeholder={
                youtubeReady ? 'search library · enter to search youtube' : 'search library'
              }
              // no autofill, spellcheck or OS text suggestions while typing a search
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="bg-transparent text-app-text text-sm font-mono placeholder-app-muted outline-none flex-1"
            />
            <span className="text-xs font-mono text-app-muted shrink-0 hidden md:inline">
              try <span className="text-app-secondary">shadow</span> or{' '}
              <span className="text-app-secondary">drumcode</span>
            </span>
          </div>
        </div>
        <div className="shrink-0 pt-0.5">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}

function Activity({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
      <span className="text-xs text-app-muted font-mono">{children}</span>
    </div>
  )
}

/** A headline count: the number stands out, the label stays quiet. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-sm font-bold text-app-accent tabular-nums">{value}</span>
      <span className="text-app-secondary">{value === 1 ? label : `${label}s`}</span>
    </span>
  )
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`
}
