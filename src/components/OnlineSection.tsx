import { ReactNode, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Loader2, AlertCircle, Download, Music, Film, Check, Search } from 'lucide-react'
import { selectCurrentTrack, useAppStore } from '../store'
import {
  downloadKey,
  downloadMedia,
  installYtDlp,
  resultToTrack,
  searchOnlineNow,
  selectPlatform,
  ytDlpStatus,
} from '../api/online'
import { scanLibrary } from '../api/local'
import { DownloadKind, OnlineSearchResult, Platform, YtDlpDownloadProgress } from '../types'
import { SourceHeader } from './SourceHeader'
import { TrackRow } from './TrackRow'
import { TrackCover } from './TrackCover'
import { formatDuration, formatRelative, formatViews } from '../utils/format'

const PLATFORMS: Platform[] = ['youtube', 'twitch']

/** A pasted link is opened directly (see `classify` in online.rs), whichever tab is active. */
function looksLikeLink(query: string): boolean {
  return /^(https?:\/\/|www\.)|youtu\.be\/|youtube\.com\/|twitch\.tv\//i.test(query)
}

/** What the search row and status lines say, per platform. */
function wording(platform: Platform, query: string) {
  if (looksLikeLink(query)) {
    return { action: `open "${query}"`, running: `opening "${query}"...`, empty: 'nothing found' }
  }
  return platform === 'twitch'
    ? {
        action: `list twitch vods from "${query}"`,
        running: `listing twitch vods from "${query}"...`,
        empty: `no vods found for "${query}"`,
      }
    : {
        action: `search youtube for "${query}"`,
        running: `searching youtube for "${query}"...`,
        empty: `no youtube results for "${query}"`,
      }
}

/**
 * The ONLINE part of the main view, shown while the search box isn't empty. Tabs pick YouTube
 * (text search) or Twitch (a channel's recent VODs). Searched only on Enter (or by clicking the
 * search row), so filtering the library never calls yt-dlp.
 */
export function OnlineSection() {
  const query = useAppStore((s) => s.query.trim())
  const platform = useAppStore((s) => s.online.platform)
  const results = useAppStore((s) => s.online.results)
  const searchedQuery = useAppStore((s) => s.online.searchedQuery)
  const searchState = useAppStore((s) => s.online.searchState)
  const searchError = useAppStore((s) => s.online.searchError)
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)
  const ytDlp = useAppStore((s) => s.ytDlp)

  // Hidden only where yt-dlp is missing and the app can't install it.
  if (!query || (ytDlp && !ytDlp.available && !ytDlp.can_install)) return null

  function handlePlay(result: OnlineSearchResult) {
    const idx = results.findIndex((r) => r.video_id === result.video_id)
    if (idx < 0) return
    playTrackFromList(results.map(resultToTrack), idx)
  }

  const searching = searchState === 'searching'
  const stale = searchedQuery !== query
  const words = wording(platform, query)

  return (
    <div className="pb-4">
      <SourceHeader name="online" count={searchedQuery ? results.length : undefined}>
        <div className="flex items-baseline gap-3 ml-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => p !== platform && selectPlatform(p)}
              className={`text-xs font-mono transition-colors ${
                p === platform
                  ? 'text-app-accent underline underline-offset-4'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </SourceHeader>

      {ytDlp && !ytDlp.available ? (
        <EnableOnline />
      ) : (
        <>
          {searching ? (
            <StatusRow>
              <Loader2 size={14} className="animate-spin text-app-accent" />
              {words.running}
            </StatusRow>
          ) : (
            stale && (
              <button
                onClick={() => searchOnlineNow(query)}
                className="w-full flex items-center gap-3 px-6 py-2 text-left text-xs font-mono text-app-secondary hover:bg-app-hover hover:text-app-text transition-colors"
              >
                <Search size={14} className="shrink-0" />
                <span className="truncate">{words.action}</span>
                <span className="ml-auto text-app-muted">⏎</span>
              </button>
            )
          )}

          {searchState === 'error' && (
            <StatusRow>
              <AlertCircle size={14} className="shrink-0" />
              <span className="wrap-break-word">{searchError}</span>
            </StatusRow>
          )}

          {searchState === 'done' && !stale && results.length === 0 && (
            <StatusRow>{words.empty}</StatusRow>
          )}

          {results.length > 0 && (
            <>
              {stale && <StatusRow>results for "{searchedQuery}"</StatusRow>}
              <div className="flex flex-col">
                {results.map((r) => (
                  <ResultRow key={r.video_id} result={r} onPlay={() => handlePlay(r)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function StatusRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 py-2 text-xs font-mono text-app-muted">
      {children}
    </div>
  )
}

/** An online result, laid out like a library track; downloads sit before the duration. */
function ResultRow({ result, onPlay }: { result: OnlineSearchResult; onPlay: () => void }) {
  const current = useAppStore(selectCurrentTrack)
  const resolving = useAppStore((s) => s.resolving)
  const playing = useAppStore((s) => s.playing)
  const isActive =
    current?.source === 'online' &&
    current.platform === result.platform &&
    current.videoId === result.video_id
  const subtitle = [
    result.uploader ?? 'Unknown',
    result.view_count !== null && formatViews(result.view_count),
  ]
    .filter(Boolean)
    .join(' · ')
  // The date always shows; the channel and views shorten first
  const age = result.timestamp !== null ? formatRelative(result.timestamp * 1000) : undefined
  return result.live ? (
    // A live stream: no duration, no downloads (recording isn't supported)
    <TrackRow
      dataPath={result.video_id}
      active={isActive}
      cover={
        <TrackCover
          src={result.thumbnail}
          video
          loading={isActive && resolving}
          active={isActive}
          playing={isActive && playing}
        />
      }
      title={result.title}
      subtitle={subtitle}
      subtitleEnd={age && `started ${age}`}
      duration={<span className="text-app-accent font-bold tracking-wider">LIVE</span>}
      onClick={onPlay}
    />
  ) : (
    <TrackRow
      dataPath={result.video_id}
      active={isActive}
      cover={
        <TrackCover
          src={result.thumbnail}
          video
          loading={isActive && resolving}
          active={isActive}
          playing={isActive && playing}
        />
      }
      title={result.title}
      subtitle={subtitle}
      subtitleEnd={age}
      duration={formatDuration(result.duration_secs)}
      onClick={onPlay}
      actions={
        <>
          <DownloadButton platform={result.platform} videoId={result.video_id} kind="audio" />
          <DownloadButton platform={result.platform} videoId={result.video_id} kind="video" />
        </>
      }
    />
  )
}

/**
 * Saves a result into the library (audio → ~/Music/<YouTube|Twitch>, video →
 * ~/Videos/<YouTube|Twitch>) and rescans so it shows up under LIBRARY. Hidden until the row is
 * hovered, unless it's downloading, done or failed. Progress comes from `download_progress`
 * (listened to in MainView).
 */
function DownloadButton({
  platform,
  videoId,
  kind,
}: {
  platform: Platform
  videoId: string
  kind: DownloadKind
}) {
  const key = downloadKey(platform, videoId, kind)
  const status = useAppStore((s) => s.online.downloads[key])
  const ffmpeg = useAppStore((s) => s.ytDlp?.ffmpeg ?? false)
  const setDownload = useAppStore((s) => s.setDownload)

  async function download() {
    if (status?.state === 'downloading') return
    setDownload(key, { state: 'downloading', percent: null })
    try {
      const { path } = await downloadMedia(platform, videoId, kind)
      setDownload(key, { state: 'done', percent: 100, path })
      scanLibrary()
    } catch (e) {
      setDownload(key, { state: 'error', percent: null, error: String(e) })
    }
  }

  // Twitch VODs run for hours, so say roughly how big they get.
  const label =
    platform === 'twitch'
      ? kind === 'audio'
        ? 'audio (~90 MB per hour)'
        : 'video up to 720p (~1.3 GB per hour)'
      : kind === 'audio'
        ? 'audio'
        : ffmpeg
          ? 'video'
          : 'video (360p, install ffmpeg for HD)'
  const title =
    status?.state === 'downloading'
      ? `downloading ${kind}...`
      : status?.state === 'done'
        ? `saved to ${status.path}`
        : status?.state === 'error'
          ? `download failed, click to retry: ${status.error}`
          : `download ${label}`
  const Icon = kind === 'audio' ? Music : Film

  return (
    <button
      onClick={download}
      title={title}
      className={`h-8 min-w-8 px-1.5 flex items-center justify-center gap-1 rounded text-xs font-mono transition-colors ${
        status
          ? status.state === 'error'
            ? 'text-app-muted hover:text-app-text'
            : 'text-app-accent'
          : 'text-app-muted hover:text-app-text opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      {status?.state === 'downloading' ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          {status.percent !== null && <span className="tabular-nums">{status.percent}%</span>}
        </>
      ) : status?.state === 'done' ? (
        <Check size={14} />
      ) : status?.state === 'error' ? (
        <AlertCircle size={14} />
      ) : (
        <Icon size={14} />
      )}
    </button>
  )
}

/** Shown in place of results until yt-dlp is installed; downloads an app-managed copy. */
function EnableOnline() {
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
    <div className="flex flex-col items-start gap-3 px-6 py-3 text-app-muted">
      <span className="text-xs font-mono max-w-md">
        online search needs yt-dlp. playmusic can download it from github.com/yt-dlp/yt-dlp, verify
        its checksum, and keep it up to date for you.
      </span>
      {installing ? (
        <div className="flex flex-col gap-2 w-64">
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
      {error && <span className="text-xs text-app-muted/70 max-w-md wrap-break-word">{error}</span>}
    </div>
  )
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
