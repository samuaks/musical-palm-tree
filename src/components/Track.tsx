import { ReactNode, useRef } from 'react'
import { MediaFile } from '../types'
import { isVideo } from '../constants'
import { selectCurrentTrack, useAppStore } from '../store'
import { useLocalFlatTracks } from '../hooks/useLocalFlatTracks'
import { useRowCover } from '../hooks/useCoverArt'
import { displayName } from '../utils/trackName'
import { formatDuration, formatRelative } from '../utils/format'
import { TrackRow } from './TrackRow'
import { TrackCover } from './TrackCover'

interface TrackProps {
  file: MediaFile
  dirName: string
  albumName: string | null
  /** Plays something other than the whole library from here (e.g. the play log's list). */
  onPlay?: () => void
  /** Replaces "added …" after the subtitle (e.g. "played 2h ago"). */
  note?: string
  /** Buttons on the right, like `TrackRow`'s. */
  actions?: ReactNode
}

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span className="text-app-accent">{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  )
}

/** A library track: cover (or a music/video placeholder), name, `album · folder · added`. */
export function Track({ file, dirName, albumName, onPlay, note, actions }: TrackProps) {
  const currentTrack = useAppStore(selectCurrentTrack)

  const flatTracks = useLocalFlatTracks()
  const playTrackFromlist = useAppStore((s) => s.playTrackFromList)

  const playing = useAppStore((s) => s.playing)
  const query = useAppStore((s) => s.query)
  const duration = useAppStore((s) => s.library.durations[file.path] ?? 0)

  const rowRef = useRef<HTMLDivElement>(null)
  const cover = useRowCover(file.path, rowRef)

  const isActive = currentTrack?.path == file.path
  const video = isVideo(file.ext)
  const subtitle = [albumName, dirName].filter(Boolean).join(' · ')
  // The date always shows; album and folder shorten first
  const added = note ?? (formatRelative(file.created_at) || undefined)

  function handleClick() {
    if (onPlay) return onPlay()
    const idx = flatTracks.findIndex((t) => t.path === file.path)
    if (idx < 0) return
    playTrackFromlist(flatTracks, idx)
  }

  return (
    <TrackRow
      rowRef={rowRef}
      dataPath={file.path}
      active={isActive}
      cover={
        <TrackCover
          src={cover}
          video={video}
          markVideo
          active={isActive}
          playing={isActive && playing}
        />
      }
      title={highlight(displayName(file.name), query)}
      subtitle={subtitle}
      subtitleEnd={added}
      duration={formatDuration(duration)}
      onClick={handleClick}
      actions={actions}
    />
  )
}
