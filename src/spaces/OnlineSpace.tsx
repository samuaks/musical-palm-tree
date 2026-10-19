import { useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Globe, Loader2, AlertCircle, Download } from 'lucide-react'
import { selectCurrentTrack, useAppStore } from '../store'
import { installYtDlp, resultToTrack, ytDlpStatus } from '../api/online'
import { OnlineSearchResult, YtDlpDownloadProgress } from '../types'

export function OnlineSpace() {
  const query = useAppStore((s) => s.spaces.online.query)
  const results = useAppStore((s) => s.spaces.online.results)
  const searchState = useAppStore((s) => s.spaces.online.searchState)
  const searchError = useAppStore((s) => s.spaces.online.searchError)
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)
  const ytDlp = useAppStore((s) => s.ytDlp)

  function handlePlay(result: OnlineSearchResult) {
    const idx = results.findIndex((r) => r.video_id === result.video_id)
    if (idx < 0) return
    const queue = results.map(resultToTrack)
    playTrackFromList(queue, idx)
  }

  if (ytDlp && !ytDlp.available) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-4">
        <EnableOnline canInstall={ytDlp.can_install} />
      </div>
    )
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

/** Shown until yt-dlp is installed; downloads an app-managed copy on request. */
function EnableOnline({ canInstall }: { canInstall: boolean }) {
  const setYtDlp = useAppStore((s) => s.setYtDlp)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<YtDlpDownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function install() {
    setInstalling(true)
    setProgress(null)
    setError(null)
    const unlisten = await listen<YtDlpDownloadProgress>('yt_dlp_download', (e) =>
      setProgress(e.payload)
    )
    try {
      await installYtDlp()
      setYtDlp(await ytDlpStatus())
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e))
    } finally {
      unlisten()
      setInstalling(false)
    }
  }

  const percent = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : null

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-app-muted px-4 text-center">
      <Globe size={48} />
      <span className="text-sm font-mono text-app-text">online search needs yt-dlp</span>

      {canInstall ? (
        <>
          <span className="text-xs font-mono max-w-md">
            playmusic can download it from github.com/yt-dlp/yt-dlp, verify its checksum, and keep
            it up to date for you.
          </span>
          {installing ? (
            <div className="flex flex-col items-center gap-2 w-64">
              <div className="w-full h-1 rounded bg-app-border overflow-hidden">
                <div
                  className="h-full bg-app-accent transition-[width]"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
              <span className="text-xs font-mono">
                downloading... {progress && `${formatMb(progress.downloaded)}`}
                {progress?.total && ` / ${formatMb(progress.total)}`}
              </span>
            </div>
          ) : (
            <button
              onClick={install}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-app-accent text-app-accent-text text-sm font-mono hover:opacity-90 transition-opacity"
            >
              <Download size={14} />
              {error ? 'retry download' : 'download yt-dlp'}
            </button>
          )}
          {error && (
            <span className="text-xs text-app-muted/70 max-w-md wrap-break-word">{error}</span>
          )}
        </>
      ) : (
        <span className="text-xs font-mono max-w-md">
          install yt-dlp so it's on your PATH, then restart playmusic.
        </span>
      )}
    </div>
  )
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
