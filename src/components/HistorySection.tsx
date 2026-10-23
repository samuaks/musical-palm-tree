import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { selectCurrentTrack, streamKey, useAppStore } from '../store'
import { historyToTrack } from '../api/online'
import { HistoryEntry } from '../types'
import { filterHistory } from '../utils/filterHistory'
import { formatDuration, formatRelative } from '../utils/format'
import { DownloadButton } from './OnlineSection'
import { TrackCover } from './TrackCover'
import { TrackRow } from './TrackRow'

/**
 * Online items that were watched (`online.history`, filled by `useWatchHistory`), most recent
 * first, at the top of the main view. Headed like a library folder and folds like an album. The
 * search box filters it like the library; it's hidden while empty.
 */
export function HistorySection() {
  const history = useAppStore((s) => s.online.history)
  const query = useAppStore((s) => s.query.trim())
  const collapsed = useAppStore((s) => s.online.historyCollapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleHistoryCollapsed)
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)

  const shown = useMemo(() => filterHistory(history, query), [history, query])
  if (shown.length === 0) return null

  // A live channel plays on its own; next/previous from a video walk the other videos, so
  // playback never runs into a channel that's live (endless) or offline (stops) by itself.
  function handlePlay(entry: HistoryEntry) {
    const list = entry.live ? [entry] : shown.filter((e) => !e.live)
    playTrackFromList(list.map(historyToTrack), list.indexOf(entry))
  }

  return (
    <div className="mb-2">
      <div
        onClick={toggleCollapsed}
        className="group/header flex items-center gap-3 px-6 mt-6 mb-2 cursor-pointer"
      >
        <span className="flex items-center gap-2 text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
          {collapsed ? (
            <ChevronRight size={12} className="text-app-muted" />
          ) : (
            <ChevronDown size={12} className="text-app-muted" />
          )}
          history
        </span>
        <div className="flex-1 h-px bg-app-border" />
        <ClearHistory />
        <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">
          {shown.length}
        </span>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {shown.map((entry) => (
            <HistoryRow
              key={streamKey(entry.platform, entry.video_id)}
              entry={entry}
              onPlay={() => handlePlay(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Shown on hovering the header; asks once before wiping the whole history. */
function ClearHistory() {
  const clearHistory = useAppStore((s) => s.clearHistory)
  const [confirming, setConfirming] = useState(false)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (confirming) clearHistory()
        setConfirming(!confirming)
      }}
      onMouseLeave={() => setConfirming(false)}
      className={`text-xs font-mono shrink-0 transition-[color,opacity] ${
        confirming
          ? 'text-app-accent'
          : 'text-app-muted hover:text-app-text opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100'
      }`}
    >
      {confirming ? 'clear all?' : 'clear'}
    </button>
  )
}

/**
 * A watched item, laid out like an online result. A live stream is listed as its channel:
 * playing it watches the channel live now, and it says "offline" once that didn't work.
 */
function HistoryRow({ entry, onPlay }: { entry: HistoryEntry; onPlay: () => void }) {
  const current = useAppStore(selectCurrentTrack)
  const resolving = useAppStore((s) => s.resolving)
  const playing = useAppStore((s) => s.playing)
  const failed = useAppStore((s) =>
    s.online.failedStreams.has(streamKey(entry.platform, entry.video_id))
  )
  const removeFromHistory = useAppStore((s) => s.removeFromHistory)
  const isActive =
    current?.source === 'online' &&
    current.platform === entry.platform &&
    current.videoId === entry.video_id

  const watched = `watched ${formatRelative(entry.watched_at)}`
  const cover = (
    <TrackCover
      src={entry.thumbnail}
      video
      loading={isActive && resolving}
      active={isActive}
      playing={isActive && playing}
    />
  )
  const remove = (
    <button
      onClick={() => removeFromHistory(entry.platform, entry.video_id)}
      title="remove from history"
      className="h-8 min-w-8 px-1.5 flex items-center justify-center rounded text-app-muted hover:text-app-text opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[color,opacity]"
    >
      <X size={14} />
    </button>
  )

  if (entry.live) {
    return (
      <TrackRow
        dataPath={entry.video_id}
        active={isActive}
        cover={cover}
        title={entry.uploader ?? entry.title}
        subtitle={entry.uploader ? entry.title : entry.platform}
        subtitleEnd={watched}
        duration={
          failed && !(isActive && resolving) ? (
            <span className="text-app-muted">offline</span>
          ) : (
            <span className="font-bold tracking-wider">LIVE</span>
          )
        }
        onClick={onPlay}
        actions={remove}
      />
    )
  }

  return (
    <TrackRow
      dataPath={entry.video_id}
      active={isActive}
      cover={cover}
      title={entry.title}
      subtitle={`${entry.uploader ?? 'Unknown'} · ${entry.platform}`}
      subtitleEnd={watched}
      duration={formatDuration(entry.duration_secs)}
      onClick={onPlay}
      actions={
        <>
          <DownloadButton platform={entry.platform} videoId={entry.video_id} kind="audio" />
          <DownloadButton platform={entry.platform} videoId={entry.video_id} kind="video" />
          {remove}
        </>
      }
    />
  )
}
