import { Music, Video } from 'lucide-react'
import { MediaFile } from '../types'
import { isVideo } from '../constants'
import { PlayingIndicator } from './PlayingIndicator'

interface TrackProps {
  file: MediaFile
  index: number
  onPlay: (file: MediaFile) => void
  isPlaying?: boolean
  query?: string
  durations: Record<string, number>
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

export function Track({
  file,
  index,
  onPlay,
  isPlaying = false,
  query = '',
  durations,
}: TrackProps) {
  const isVideoFile = isVideo(file.ext)
  const displayName = file.name.replace(/\.[^/.]+$/, '')
  const duration = durations[file.path] ?? 0

  const color = isPlaying ? 'var(--color-app-accent)' : ''

  return (
    <div
      onClick={() => onPlay(file)}
      className={`group flex items-center gap-4 px-6 py-2 cursor-pointer transition-colors ${
        isPlaying ? 'bg-app-selected' : 'hover:bg-app-hover'
      }`}
    >
      {/* index or playing indicator */}
      <div className="w-8 text-right shrink-0">
        {isPlaying ? (
          <PlayingIndicator />
        ) : (
          <span className="text-xs font-mono text-app-muted tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* type icon */}
      <div className="text-app-muted shrink-0">
        {isVideoFile ? <Video color={color} size={14} /> : <Music color={color} size={14} />}
      </div>

      {/* track name */}
      <span
        className={`text-sm font-mono flex-1 truncate min-w-0 ${
          isPlaying ? 'text-app-accent' : 'text-app-text'
        }`}
      >
        {highlight(displayName, query)}
      </span>

      {/* duration */}
      <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
