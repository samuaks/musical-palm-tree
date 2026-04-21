import { Music, Video } from 'lucide-react'
import { MediaFile } from '../types'

interface TrackProps {
  file: MediaFile
  onPlay: (file: MediaFile) => void
  isPlaying?: boolean
  query: string
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

export function Track({ file, onPlay, isPlaying = false, query   }: TrackProps) {
  const displayName = file.name.replace(/\.[^/.]+$/, '') 
  const isVideo = videoExts.includes(file.ext.toLowerCase())

return (
  <div
    onClick={() => onPlay(file)}
    className={`flex items-center gap-3 px-6 py-1.5 cursor-pointer hover:bg-white/5 transition-colors ${
      isPlaying ? 'border-l-2 border-teal-400' : 'border-l-2 border-transparent'
    }`}
  >
    <div className="text-slate-600 shrink-0">
      {isVideo ? <Video size={12} /> : <Music size={12} />}
    </div>

    <span className={`text-sm font-mono flex-1 truncate min-w-0 ${isPlaying ? 'text-teal-400' : 'text-slate-300'}`}>
      {highlight(displayName, query)}
    </span>

   <span className="text-xs font-mono text-slate-600 shrink-0 w-10 text-right">
      {formatDuration(file.duration_secs)}
  </span>
  <span className="text-xs font-mono text-slate-600 shrink-0 w-16 text-right">
     {formatSize(file.size_bytes)}
  </span>
  </div>
)
}