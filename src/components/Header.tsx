import { ScanMetaData, ScanState } from '../types'

interface HeaderProps {
  query: string
  onSearch: (q: string) => void
  scanMeta: ScanMetaData | null
  scanState: ScanState
  liveCount?: number
}

export function Header({ query, onSearch, scanMeta, scanState, liveCount }: HeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-700">
      <span className="text-teal-400 font-bold tracking-wide text-sm">PlayMusic</span>
      <div className="text-xs font-mono mt-1">
        {scanState === 'scanning' && !scanMeta && (
          <div className="flex items-center gap-2 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-xs text-app-muted font-mono animate-pulse">
              scanning library...{' '}
              {liveCount && <span className="text-app-text">{liveCount} files</span>}
            </span>
          </div>
        )}
        {scanMeta && (
          <span className="text-app-muted">
            {scanMeta.total_files} files · {scanMeta.total_albums} albums ·{' '}
            {scanMeta.total_directories} dirs · {scanMeta.duration_ms}ms
            {scanMeta.total_duplicates > 0 && (
              <span className="text-amber-600 ml-2">· {scanMeta.total_duplicates} duplicates</span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-teal-400 text-sm">{'>'}</span>
        <input
          type="text"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="type to search..."
          className="bg-transparent text-slate-300 text-sm font-mono placeholder-slate-600 outline-none w-full"
        />
      </div>
    </div>
  )
}
