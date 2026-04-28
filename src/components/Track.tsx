import { Music, Video } from 'lucide-react'
import { MediaFile } from '../types'
import { isVideo } from '../constants'
import { PlayingIndicator } from './PlayingIndicator'
import { useAppStore } from '../store'

interface TrackProps {
  file: MediaFile
  index: number
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

function formatDuration(secs: number): string {
  if (secs === 0) return '--:--'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Track({ file, index }: TrackProps) {
  const currentTrack = useAppStore((s) => s.currentTrack)
  const setCurrentTrack = useAppStore((s) => s.setCurrentTrack)
  const playing = useAppStore((s) => s.playing)
  const query = useAppStore((s) => s.query)
  const duration = useAppStore((s) => s.durations[file.path] ?? 0)

  const isActive = currentTrack?.path == file.path
  const isCurrentlyPlaying = isActive && playing

  const isVideoFile = isVideo(file.ext)
  const displayName = file.name.replace(/\.[^/.]+$/, '')

  return (
    <div
      data-track-path={file.path}
      onClick={() => setCurrentTrack(file)}
      className={`group flex items-center gap-4 px-6 py-2 cursor-pointer transition-colors ${
        isActive ? 'bg-app-selected' : 'hover:bg-app-hover'
      }`}
    >
      {/* index or playing indicator */}
      <div className="w-8 flex items-center justify-end shrink-0">
        {isActive ? (
          <PlayingIndicator playing={isCurrentlyPlaying} />
        ) : (
          <span className="text-xs font-mono text-app-secondary tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* type icon */}
      <div className={isCurrentlyPlaying ? 'text-app-accent' : 'text-app-secondary'}>
        {isVideoFile ? <Video size={16} /> : <Music size={16} />}
      </div>

      {/* track name */}
      <span
        className={`text-sm font-mono flex-1 truncate min-w-0 ${
          isActive ? 'text-app-accent' : 'text-app-text'
        }`}
      >
        {highlight(displayName, query)}
      </span>

      {/* duration */}
      <span className="text-xs font-mono text-app-secondary tabular-nums shrink-0">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
