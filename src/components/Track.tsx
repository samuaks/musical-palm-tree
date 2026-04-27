import { Clock, Music, Video } from 'lucide-react'
import { MediaFile } from '../types'
import { convertFileSrc } from '@tauri-apps/api/core'

interface TrackProps {
  file: MediaFile
  onPlay: (file: MediaFile) => void
  isPlaying?: boolean
  query: string
  durations: Record<string, number>
}

const videoExts = ['mp4', 'mkv', 'webm', 'avi', 'mov']

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>

  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span className="text-teal-400 underline">{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  )
}

function formatDuration(seconds: number) {
  if (seconds === 0) return '--:--'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function formatSize(bytes: number) {
  if (bytes === 0) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatRelative(ms: number): string {
  if (ms === 0) return ''
  const diff = Date.now() - ms
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 30) return new Date(ms).toLocaleDateString()
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export function Track({ file, onPlay, isPlaying = false, query, durations }: TrackProps) {
  const duration = durations[file.path] ?? 0;

  const displayName = file.name.replace(/\.[^/.]+$/, '') 
  const isVideo = videoExts.includes(file.ext.toLowerCase())


return (
  <div
    onClick={() => onPlay(file)}
    className={`flex items-center gap-3 px-6 py-2 cursor-pointer transition-colors ${
      isPlaying
        ? 'border-l-2 border-app-accent bg-app-selected'
        : 'border-l-2 border-transparent hover:bg-app-hover'
    }`}
  >
    <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded overflow-hidden bg-app-border">
      {file.art_path ? (
        <img
          src={convertFileSrc(file.art_path)}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="text-app-muted">
          {isVideo ? <Video size={14} /> : <Music size={14} />}
        </div>
      )}
    </div>

    <div className="flex flex-col flex-1 min-w-0 gap-0.5">
      <span className={`text-sm font-mono truncate ${
        isPlaying ? 'text-app-accent' : 'text-app-text'
      }`}>
        {highlight(displayName, query)}
      </span>
      <div className="flex items-center gap-3 text-xs font-mono text-app-muted">
        <span>{formatDuration(duration)}</span>
        <span>·</span>
        <span>{formatSize(file.size_bytes)}</span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatRelative(file.created_at)}
        </span>
      </div>
    </div>
  </div>
)
}