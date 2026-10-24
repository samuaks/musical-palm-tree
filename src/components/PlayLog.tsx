import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Play, X } from 'lucide-react'
import { selectCurrentTrack, streamKey, useAppStore } from '../store'
import { onlinePlayToTrack } from '../api/online'
import { localTrack } from '../api/local'
import { IndexedFile, useLibraryIndex } from '../hooks/useLibraryIndex'
import { useRowCover } from '../hooks/useCoverArt'
import { OnlinePlay, PlayEntry, Track as PlayableTrack } from '../types'
import { isVideo } from '../constants'
import { filterPlays, mostListened, playKey } from '../utils/plays'
import { displayName } from '../utils/trackName'
import { formatDuration, formatRelative } from '../utils/format'
import { DownloadButton } from './OnlineSection'
import { Track } from './Track'
import { TrackCover } from './TrackCover'
import { TrackRow } from './TrackRow'

/** How many Home shows of Most listened, as tiles. */
const MOST_LISTENED_TILES = 6
/** How many the Most listened page lists. */
const MOST_LISTENED_PAGE = 50

/**
 * Plays `entry` with the rest of `list` as the queue. A live channel plays on its own; from
 * anything else, next/previous walk the other non-live entries, so playback never runs into a
 * channel that's live (endless) or offline (stops) by itself. Library files that are gone are
 * skipped.
 */
function usePlayFromLog() {
  const index = useLibraryIndex()
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)

  return (list: PlayEntry[], entry: PlayEntry) => {
    const isLive = (e: PlayEntry) => e.source === 'online' && e.live
    const queue = isLive(entry) ? [entry] : list.filter((e) => !isLive(e))
    const tracks: PlayableTrack[] = []
    let start = -1
    for (const e of queue) {
      const track = toTrack(e, index)
      if (!track) continue
      if (e === entry) start = tracks.length
      tracks.push(track)
    }
    if (start >= 0) playTrackFromList(tracks, start)
  }
}

function toTrack(entry: PlayEntry, index: Map<string, IndexedFile>): PlayableTrack | null {
  if (entry.source === 'online') return onlinePlayToTrack(entry)
  const found = index.get(entry.path)
  return found ? localTrack(found.file) : null
}

/**
 * What was played (`plays`, filled by `usePlayLog`), most recent first, library files and online
 * items mixed: the Recently played page, the top of Home (`limit`, with "see all") and of search
 * results. Headed like a library folder and folds like an album, except on its own page
 * (`unfoldable`). The search box filters it like the library; it's hidden while empty.
 */
export function RecentlyPlayed({
  limit,
  unfoldable = false,
}: {
  limit?: number
  /** Always open, with no fold control: the Recently played page. */
  unfoldable?: boolean
}) {
  const plays = useAppStore((s) => s.plays)
  const query = useAppStore((s) => s.query.trim())
  const folded = useAppStore((s) => s.recentCollapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleRecentCollapsed)
  const navigate = useAppStore((s) => s.navigate)
  const index = useLibraryIndex()
  const collapsed = !unfoldable && folded

  // files that left the library aren't listed (they can't be played)
  const matching = useMemo(
    () => filterPlays(plays, query).filter((e) => e.source === 'online' || index.has(e.path)),
    [plays, query, index]
  )
  const shown = limit === undefined ? matching : matching.slice(0, limit)
  if (shown.length === 0) {
    // on its own page, say so (also when every logged file has left the library)
    return unfoldable && !query ? (
      <div className="px-6 py-3 text-xs text-app-muted font-mono">
        nothing yet: tracks and videos show up here after 30 seconds of playback.
      </div>
    ) : null
  }

  return (
    <div className="mb-2">
      <div
        onClick={unfoldable ? undefined : toggleCollapsed}
        className={`group/header flex items-center gap-3 px-6 mt-6 mb-2 ${
          unfoldable ? '' : 'cursor-pointer'
        }`}
      >
        <span className="flex items-center gap-2 text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
          {unfoldable ? null : collapsed ? (
            <ChevronRight size={12} className="text-app-muted" />
          ) : (
            <ChevronDown size={12} className="text-app-muted" />
          )}
          recently played
        </span>
        <div className="flex-1 h-px bg-app-border" />
        {shown.length < matching.length ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate({ page: 'recent' })
            }}
            className="text-xs font-mono text-app-secondary hover:text-app-accent shrink-0 transition-colors"
          >
            see all
          </button>
        ) : (
          <ClearPlays />
        )}
        <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">
          {matching.length}
        </span>
      </div>

      {!collapsed && <PlayList entries={shown} />}
    </div>
  )
}

/** Rows for play-log entries; clicking one plays it with the others as the queue. */
export function PlayList({ entries }: { entries: PlayEntry[] }) {
  const index = useLibraryIndex()
  const playFromLog = usePlayFromLog()

  return (
    <div className="flex flex-col">
      {entries.map((entry) => {
        const onPlay = () => playFromLog(entries, entry)
        if (entry.source === 'online') {
          return <OnlinePlayRow key={playKey(entry)} entry={entry} onPlay={onPlay} />
        }
        const found = index.get(entry.path)
        if (!found) return null
        return (
          <Track
            key={playKey(entry)}
            file={found.file}
            dirName={found.dirName}
            albumName={found.albumName}
            onPlay={onPlay}
            note={`played ${formatRelative(entry.last_played)}`}
            actions={<RemoveButton entry={entry} />}
          />
        )
      })}
    </div>
  )
}

/** Shown on hovering the header; asks once before wiping the whole log. */
function ClearPlays() {
  const clearPlays = useAppStore((s) => s.clearPlays)
  const [confirming, setConfirming] = useState(false)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (confirming) clearPlays()
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

function RemoveButton({ entry }: { entry: PlayEntry }) {
  const removePlay = useAppStore((s) => s.removePlay)
  return (
    <button
      onClick={() => removePlay(playKey(entry))}
      title="remove from recently played"
      className="h-8 min-w-8 px-1.5 flex items-center justify-center rounded text-app-muted hover:text-app-text opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[color,opacity]"
    >
      <X size={14} />
    </button>
  )
}

/**
 * A played online item, laid out like an online result. A live stream is listed as its channel:
 * playing it watches the channel live now, and it says "offline" once that didn't work.
 */
function OnlinePlayRow({
  entry,
  onPlay,
}: {
  entry: OnlinePlay & { last_played: number }
  onPlay: () => void
}) {
  const current = useAppStore(selectCurrentTrack)
  const resolving = useAppStore((s) => s.resolving)
  const playing = useAppStore((s) => s.playing)
  const failed = useAppStore((s) =>
    s.online.failedStreams.has(streamKey(entry.platform, entry.video_id))
  )
  const isActive =
    current?.source === 'online' &&
    current.platform === entry.platform &&
    current.videoId === entry.video_id

  const played = `played ${formatRelative(entry.last_played)}`
  const cover = (
    <TrackCover
      src={entry.thumbnail}
      video
      loading={isActive && resolving}
      active={isActive}
      playing={isActive && playing}
    />
  )
  const remove = <RemoveButton entry={entry as PlayEntry} />

  if (entry.live) {
    return (
      <TrackRow
        dataPath={entry.video_id}
        active={isActive}
        cover={cover}
        title={entry.uploader ?? entry.title}
        subtitle={entry.uploader ? entry.title : entry.platform}
        subtitleEnd={played}
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
      subtitleEnd={played}
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

/** The ranked entries that can still be played (gone library files are skipped). */
export function useMostListened(limit: number): PlayEntry[] {
  const plays = useAppStore((s) => s.plays)
  const index = useLibraryIndex()
  return useMemo(
    () =>
      mostListened(
        plays.filter((e) => e.source === 'online' || index.has(e.path)),
        Date.now(),
        limit
      ),
    [plays, index, limit]
  )
}

/** Home's grid: the most played of the last 30 days, two columns, with Play all. */
export function MostListenedTiles() {
  const top = useMostListened(MOST_LISTENED_TILES)
  const navigate = useAppStore((s) => s.navigate)
  const playFromLog = usePlayFromLog()
  if (top.length === 0) return null

  return (
    <div className="mb-2">
      <div className="flex items-center gap-3 px-6 mt-6 mb-3">
        <span className="text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
          most listened
        </span>
        <span className="text-[10px] font-mono text-app-muted tracking-widest uppercase shrink-0">
          last 30 days
        </span>
        <div className="flex-1 h-px bg-app-border" />
        <button
          onClick={() => navigate({ page: 'most' })}
          className="text-xs font-mono text-app-secondary hover:text-app-accent shrink-0 transition-colors"
        >
          see all
        </button>
        <button
          onClick={() => playFromLog(top, top[0])}
          className="flex items-center gap-1.5 text-xs font-mono text-app-accent hover:text-app-text shrink-0 transition-colors"
        >
          <Play size={12} />
          play all
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 px-6">
        {top.map((entry) => (
          <Tile key={playKey(entry)} entry={entry} onPlay={() => playFromLog(top, entry)} />
        ))}
      </div>
    </div>
  )
}

/** The Most listened page: up to 50, as rows. */
export function MostListenedList() {
  const ranked = useMostListened(MOST_LISTENED_PAGE)
  if (ranked.length === 0) {
    return (
      <div className="px-6 py-3 text-xs text-app-muted font-mono">
        nothing yet: tracks and videos count once they've played for 30 seconds.
      </div>
    )
  }
  return (
    <div className="mt-4">
      <PlayList entries={ranked} />
    </div>
  )
}

/** A Most listened tile: cover, title, who/where; the play button shows on hover. */
function Tile({ entry, onPlay }: { entry: PlayEntry; onPlay: () => void }) {
  const index = useLibraryIndex()
  const current = useAppStore(selectCurrentTrack)
  const playing = useAppStore((s) => s.playing)
  const rowRef = useRef<HTMLDivElement>(null)
  const local = entry.source === 'local' ? index.get(entry.path) : undefined
  const localCover = useRowCover(local?.file.path ?? null, rowRef)

  const isActive =
    entry.source === 'local'
      ? current?.source === 'local' && current.path === entry.path
      : current?.source === 'online' &&
        current.platform === entry.platform &&
        current.videoId === entry.video_id
  const title = entry.source === 'online' ? entry.title : displayName(entry.name)
  const subtitle =
    entry.source === 'online'
      ? (entry.uploader ?? entry.platform)
      : [local?.albumName, local?.dirName].filter(Boolean).join(' · ')

  return (
    <div
      ref={rowRef}
      onClick={onPlay}
      data-track-path={entry.source === 'online' ? entry.video_id : entry.path}
      className={`group flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
        isActive
          ? 'bg-app-selected border-app-accent-dim'
          : 'bg-app-surface border-app-border hover:bg-app-hover'
      }`}
    >
      <TrackCover
        src={entry.source === 'online' ? entry.thumbnail : localCover}
        video={entry.source === 'online' || (local ? isVideo(local.file.ext) : false)}
        markVideo={entry.source === 'local'}
        active={isActive}
        playing={isActive && playing}
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-mono truncate ${isActive ? 'text-app-accent' : 'text-app-text'}`}
        >
          {title}
        </div>
        <div className="text-xs font-mono text-app-secondary truncate">{subtitle}</div>
      </div>
      <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-app-secondary group-hover:bg-app-accent group-hover:text-app-accent-text transition-colors">
        <Play size={14} />
      </span>
    </div>
  )
}
