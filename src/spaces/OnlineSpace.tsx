import { Globe, Loader2, AlertCircle } from 'lucide-react'
import { selectCurrentTrack, useAppStore } from '../store'
import { resultToTrack } from '../api/online'
import { OnlineSearchResult } from '../types'

export function OnlineSpace() {
  const query = useAppStore((s) => s.spaces.online.query)
  const results = useAppStore((s) => s.spaces.online.results)
  const searchState = useAppStore((s) => s.spaces.online.searchState)
  const searchError = useAppStore((s) => s.spaces.online.searchError)
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)

  function handlePlay(result: OnlineSearchResult) {
    const idx = results.findIndex((r) => r.video_id === result.video_id)
    if (idx < 0) return
    const queue = results.map(resultToTrack)
    playTrackFromList(queue, idx)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-4">
      {searchState === 'idle' && !query.trim() && <EmptyState />}
      {searchState === 'searching' && results.length === 0 && <LoadingState />}
      {searchState === 'error' && <ErrorState message={searchError} />}
      {searchState === 'done' && results.length === 0 && <NoResultsState query={query} />}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <ResultRow key={r.video_id} result={r} onPlay={() => handlePlay(r)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultRow({ result, onPlay }: { result: OnlineSearchResult; onPlay: () => void }) {
  const current = useAppStore(selectCurrentTrack)
  const resolving = useAppStore((s) => s.resolving)
  const isPlaying = current?.source === 'online' && current.videoId === result.video_id
  const isResolving = isPlaying && resolving
  return (
    <li>
      <button
        onClick={onPlay}
        className={`w-full flex items-center gap-3 px-2 py-2 rounded text-left transition-colors ${
          isPlaying ? 'bg-app-selected' : 'hover:bg-app-hover'
        }`}
      >
        <div className="w-12 h-12 rounded relative bg-app-skeleton overflow-hidden shrink-0">
          {result.thumbnail && (
            <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />
          )}
          {isResolving && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={20} className="animate-spin text-app-accent" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-app-text truncate">{result.title}</div>
          <div className="text-xs text-app-secondary truncate">
            {result.uploader ?? 'Unknown'}
            {result.duration_secs > 0 && ` · ${formatDuration(result.duration_secs)}`}
          </div>
        </div>
      </button>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-app-muted">
      <Globe size={48} />
      <span className="text-sm font-mono">type to search youtube</span>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-app-muted">
      <Loader2 size={32} className="animate-spin" />
      <span className="text-sm font-mono">searching...</span>
    </div>
  )
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-app-muted px-4 text-center">
      <AlertCircle size={32} />
      <span className="text-sm font-mono">search failed</span>
      {message && (
        <span className="text-xs text-app-muted/70 max-w-md wrap-break-word">{message}</span>
      )}
    </div>
  )
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-app-muted">
      <span className="text-sm font-mono">no results for "{query}"</span>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
